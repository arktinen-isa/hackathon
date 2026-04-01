
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Optional, Tuple

import database



def ping_host(host: str) -> Tuple[bool, Optional[float]]:

    if platform.system().lower() == "windows":
        cmd = ["ping", "-n", "1", "-w", "1000", host]
    else:
        cmd = ["ping", "-c", "1", "-W", "1", host]

    try:
        t0 = time.monotonic()
        result = subprocess.run(cmd, capture_output=True, timeout=3)
        rtt = round((time.monotonic() - t0) * 1000, 1)
        if result.returncode == 0:
            return True, rtt
        return False, None
    except Exception:
        return False, None



class AdaptivePoller:
    INTERVAL_DEFAULT  = 60
    INTERVAL_UNSTABLE = 15
    INTERVAL_DOWN     = 30
    INTERVAL_STABLE   = 120    
    STABLE_THRESHOLD  = 5


    def __init__(self, on_change: Callable[[dict], None]) -> None:
        self._on_change = on_change
        self._timers: dict[int, threading.Timer] = {}
        self._running = False


    def start(self) -> None:
        self._running = True
        for device in database.get_all_devices():
            self._schedule(device["id"], delay=1)

    def stop(self) -> None:
        self._running = False
        for t in self._timers.values():
            t.cancel()
        self._timers.clear()

    def add_device(self, device: dict) -> None:
        if self._running:
            self._schedule(device["id"], delay=2)

    def remove_device(self, device_id: int) -> None:
        if device_id in self._timers:
            self._timers[device_id].cancel()
            del self._timers[device_id]


    def _schedule(self, device_id: int, delay: Optional[int] = None) -> None:
        if device_id in self._timers:
            self._timers[device_id].cancel()

        if delay is None:
            device = database.get_device(device_id)
            delay = device["poll_interval"] if device else self.INTERVAL_DEFAULT

        t = threading.Timer(delay, self._poll, args=[device_id])
        t.daemon = True
        t.start()
        self._timers[device_id] = t

    def _poll(self, device_id: int) -> None:
        if not self._running:
            return

        device = database.get_device(device_id)
        if not device:
            return

        prev_status = device["status"]

        is_up, rtt = ping_host(device["host"])

        if is_up:
            new_up   = device["consecutive_up"] + 1
            new_down = 0
            new_status = "up"
            last_seen = datetime.now(timezone.utc).isoformat()
        else:
            new_up   = 0
            new_down = device["consecutive_down"] + 1
            new_status = "down" if device["consecutive_down"] >= 1 else "unstable"
            last_seen = device["last_seen"]

        new_interval = self._next_interval(new_up, new_down)

        database.update_device(
            device_id,
            status=new_status,
            last_seen=last_seen,
            response_time=rtt,
            consecutive_up=new_up,
            consecutive_down=new_down,
            poll_interval=new_interval,
        )
        database.add_history(device_id, new_status, rtt)

        if prev_status != new_status:
            updated = database.get_device(device_id)
            self._on_change(updated)

        if self._running:
            self._schedule(device_id)

    @classmethod
    def _next_interval(cls, up: int, down: int) -> int:
        if down == 1:
            return cls.INTERVAL_UNSTABLE
        if down >= 2:
            return cls.INTERVAL_DOWN
        if up >= cls.STABLE_THRESHOLD:
            return cls.INTERVAL_STABLE
        return cls.INTERVAL_DEFAULT
