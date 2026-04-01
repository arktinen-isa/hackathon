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
        # For simplicity, we assume /24 prefix. 
        # In a more advanced version, we could use psutil or ifconfig output.
        octets = ip.split('.')
        if len(octets) == 4:
            return f"{octets[0]}.{octets[1]}.{octets[2]}.0/24"
        return "127.0.0.0/24"

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
                # Try to get hostname
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except Exception:
                    hostname = f"Device {ip}"
                return {"ip": ip, "name": hostname, "active": True}
        except Exception:
            pass
        return None

    async def scan_network(self):
        if self.is_scanning:
            return
        
        self.is_scanning = True
        self.progress = 0
        self.found_devices = []
        
        subnet_str = self.get_subnet()
        network = ipaddress.ip_network(subnet_str)
        hosts = [str(ip) for ip in network.hosts()]
        total = len(hosts)
        
        # Scan in chunks to avoid overwhelming the system
        chunk_size = 20
        for i in range(0, total, chunk_size):
            chunk = hosts[i:i + chunk_size]
            tasks = [self.ping_host(ip) for ip in chunk]
            results = await asyncio.gather(*tasks)
            
            for res in results:
                if res:
                    self.found_devices.append(res)
            
            self.progress = int(((i + len(chunk)) / total) * 100)
            # Short sleep to allow other tasks to run
            await asyncio.sleep(0.01)
            
        self.progress = 100
        self.is_scanning = False

scanner = NetworkScanner()
