"""
SNMP metrics polling — CPU, RAM, network traffic.
Uses pysnmp if available; returns None values if library not installed
or if the target host does not respond to SNMP.
"""

from typing import Optional
import logging

log = logging.getLogger(__name__)

try:
    from pysnmp.hlapi import (
        SnmpEngine, CommunityData, UdpTransportTarget,
        ContextData, ObjectType, ObjectIdentity,
        getCmd, nextCmd,
    )
    _SNMP_AVAILABLE = True
except ImportError:
    _SNMP_AVAILABLE = False
    log.warning("pysnmp not installed — SNMP polling disabled. Run: pip install pysnmp")


# ─────────────────────────── OID constants ──────────────────────────

OID_SYS_DESCR      = "1.3.6.1.2.1.1.1.0"
OID_SYS_NAME       = "1.3.6.1.2.1.1.5.0"
OID_SYS_UPTIME     = "1.3.6.1.2.1.1.3.0"

# HOST-RESOURCES-MIB (Linux/Windows)
OID_HR_CPU_LOAD    = "1.3.6.1.2.1.25.3.3.1.2.1"   # hrProcessorLoad.1
OID_HR_MEM_SIZE    = "1.3.6.1.2.1.25.2.3.1.5.1"   # hrStorageSize.1  (Physical RAM)
OID_HR_MEM_USED    = "1.3.6.1.2.1.25.2.3.1.6.1"   # hrStorageUsed.1
OID_HR_ALLOC_UNITS = "1.3.6.1.2.1.25.2.3.1.4.1"   # hrStorageAllocationUnits.1

# IF-MIB — first interface (index 1)
OID_IF_IN_OCTETS   = "1.3.6.1.2.1.2.2.1.10.1"
OID_IF_OUT_OCTETS  = "1.3.6.1.2.1.2.2.1.16.1"


def _get(host: str, community: str, port: int, oid: str) -> Optional[int]:
    """Single SNMP GET, returns integer value or None."""
    if not _SNMP_AVAILABLE:
        return None
    try:
        iterator = getCmd(
            SnmpEngine(),
            CommunityData(community, mpModel=1),
            UdpTransportTarget((host, port), timeout=2, retries=1),
            ContextData(),
            ObjectType(ObjectIdentity(oid)),
        )
        error_indication, error_status, _, var_binds = next(iterator)
        if error_indication or error_status:
            return None
        for _, val in var_binds:
            return int(val)
    except Exception:
        return None


def get_metrics(host: str, community: str = "public", port: int = 161) -> dict:
    """
    Returns dict with keys:
      cpu_usage    — percent 0-100 or None
      ram_usage    — percent 0-100 or None
      bandwidth_in — raw counter (octets) or None
      bandwidth_out— raw counter (octets) or None
    """
    if not _SNMP_AVAILABLE:
        return {"cpu_usage": None, "ram_usage": None,
                "bandwidth_in": None, "bandwidth_out": None}

    cpu = _get(host, community, port, OID_HR_CPU_LOAD)

    mem_size  = _get(host, community, port, OID_HR_MEM_SIZE)
    mem_used  = _get(host, community, port, OID_HR_MEM_USED)
    alloc     = _get(host, community, port, OID_HR_ALLOC_UNITS) or 1

    ram: Optional[float] = None
    if mem_size and mem_used and mem_size > 0:
        ram = round(mem_used / mem_size * 100, 1)

    bw_in  = _get(host, community, port, OID_IF_IN_OCTETS)
    bw_out = _get(host, community, port, OID_IF_OUT_OCTETS)

    return {
        "cpu_usage":     float(cpu) if cpu is not None else None,
        "ram_usage":     ram,
        "bandwidth_in":  float(bw_in)  if bw_in  is not None else None,
        "bandwidth_out": float(bw_out) if bw_out is not None else None,
    }


def is_available() -> bool:
    return _SNMP_AVAILABLE