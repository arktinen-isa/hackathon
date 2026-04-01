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

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    device_type: Optional[DeviceType] = None
    check_method: Optional[CheckMethod] = None

class ScanRequest(BaseModel):
    subnet: Optional[str] = None
