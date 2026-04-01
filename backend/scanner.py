import asyncio
import ipaddress
import socket
import subprocess
import platform
from typing import List, Dict

class NetworkScanner:
    def __init__(self):
        self.is_scanning = False
        self.progress = 0
        self.found_devices = []

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def get_subnet(self):
        ip = self.get_local_ip()
        octets = ip.split('.')
        if len(octets) == 4:
            return f"{octets[0]}.{octets[1]}.{octets[2]}.0/24"
        return "127.0.0.0/24"

    async def guess_device_type(self, ip: str, hostname: str) -> str:
        name_lower = hostname.lower()
        if any(x in name_lower for x in ["printer", "hp", "epson", "canon", "brother", "lexmark"]):
            return "printer"
        if any(x in name_lower for x in ["router", "gateway", "mikrotik", "cisco", "ubiquiti", "keenetic", "tp-link"]):
            return "router"
        if any(x in name_lower for x in ["switch", "hub"]):
            return "switch"
        if any(x in name_lower for x in ["cam", "axis", "hikvision", "dahua", "ipc"]):
            return "camera"
        if any(x in name_lower for x in ["pc", "desktop", "laptop", "macbook", "linux", "win", "android", "iphone", "ipad"]):
            return "computer"
        if any(x in name_lower for x in ["server", "srv", "nas", "synology"]):
            return "server"

        ports = {
            9100: "printer",
            515: "printer",
            554: "camera",
            3389: "computer",
            22: "server",
        }
        for port, dev_type in ports.items():
            try:
                fut = asyncio.open_connection(ip, port)
                _, writer = await asyncio.wait_for(fut, timeout=0.2)
                writer.close()
                await writer.wait_closed()
                return dev_type
            except Exception:
                pass
        return "other"

    async def ping_host(self, ip: str) -> Dict:
        param = "-n" if platform.system().lower() == "windows" else "-c"
        command = ["ping", param, "1", "-W", "1000", ip]
        try:
            proc = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except Exception:
                    hostname = str(ip)
                dev_type = await self.guess_device_type(ip, hostname)
                return {"ip": ip, "name": hostname, "active": True, "device_type": dev_type}
        except Exception:
            pass
        return None

    async def scan_network(self, subnet: str = None):
        if self.is_scanning:
            return
        self.is_scanning = True
        self.progress = 0
        self.found_devices = []
        subnet_str = subnet if subnet else self.get_subnet()
        try:
            network = ipaddress.ip_network(subnet_str, strict=False)
        except ValueError:
            network = ipaddress.ip_network(self.get_subnet(), strict=False)
        hosts = [str(ip) for ip in network.hosts()]
        total = len(hosts)
        chunk_size = 20
        for i in range(0, total, chunk_size):
            chunk = hosts[i:i + chunk_size]
            tasks = [self.ping_host(ip) for ip in chunk]
            results = await asyncio.gather(*tasks)
            for res in results:
                if res:
                    self.found_devices.append(res)
            self.progress = int(((i + len(chunk)) / total) * 100)
            await asyncio.sleep(0.01)
        self.progress = 100
        self.is_scanning = False

scanner = NetworkScanner()
