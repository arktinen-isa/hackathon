from pydantic import BaseModel
from typing import Optional
from enum import Enum


class DeviceType(str, Enum):
    SERVER = "server"
    ROUTER = "router"
    SWITCH = "switch"
    PRINTER = "printer"
    COMPUTER = "computer"
    CAMERA = "camera"
    OTHER = "other"


class CheckMethod(str, Enum):
    PING = "ping"
    SNMP = "snmp"


class DeviceCreate(BaseModel):
    name: str
    host: str
    device_type: DeviceType
    check_method: CheckMethod = CheckMethod.PING
    rtt_threshold: int = 100
    snmp_community: str = "public"
    snmp_port: int = 161


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    device_type: Optional[DeviceType] = None
    check_method: Optional[CheckMethod] = None
    rtt_threshold: Optional[int] = None
    maintenance: Optional[bool] = None
    snmp_community: Optional[str] = None
    snmp_port: Optional[int] = None


class ScanRequest(BaseModel):
    subnet: Optional[str] = None