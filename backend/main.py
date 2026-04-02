import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database
import snmp as snmp_module
from models import DeviceCreate, DeviceUpdate, ScanRequest
from poller import AdaptivePoller
from scanner import scanner

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


class _WsManager:
    def __init__(self) -> None:
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._clients:
            self._clients.remove(ws)

    async def broadcast(self, payload: dict) -> None:
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._clients:
                self._clients.remove(ws)


ws_manager = _WsManager()
_loop: Optional[asyncio.AbstractEventLoop] = None


def _on_status_change(device: dict) -> None:
    if _loop and not _loop.is_closed():
        asyncio.run_coroutine_threadsafe(
            ws_manager.broadcast({"type": "status_change", "device": device}),
            _loop,
        )


poller = AdaptivePoller(on_change=_on_status_change)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_running_loop()
    database.init_db()
    poller.start()
    yield
    poller.stop()


app = FastAPI(title="Моніторинг мережевих пристроїв", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


# ─────────────────────────────────────────────── devices ──

@app.get("/api/devices")
async def list_devices():
    return database.get_all_devices()


@app.post("/api/devices", status_code=201)
async def create_device(data: DeviceCreate):
    device = database.create_device(
        name=data.name,
        host=data.host,
        device_type=data.device_type.value,
        check_method=data.check_method.value,
        rtt_threshold=data.rtt_threshold,
        snmp_community=data.snmp_community,
        snmp_port=data.snmp_port,
    )
    poller.add_device(device)
    return device


@app.get("/api/devices/{device_id}")
async def get_device(device_id: int):
    device = database.get_device(device_id)
    if not device:
        raise HTTPException(404, "Пристрій не знайдено")
    return device


@app.patch("/api/devices/{device_id}")
async def update_device(device_id: int, data: DeviceUpdate):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    fields = data.dict(exclude_none=True)
    fields = {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}
    # Convert bool maintenance to int for SQLite
    if "maintenance" in fields:
        fields["maintenance"] = int(fields["maintenance"])
    return database.update_device(device_id, **fields)


@app.delete("/api/devices/{device_id}", status_code=204)
async def delete_device(device_id: int):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    poller.remove_device(device_id)
    database.delete_device(device_id)


@app.post("/api/devices/{device_id}/maintenance")
async def toggle_maintenance(device_id: int):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    device = database.toggle_maintenance(device_id)
    await ws_manager.broadcast({"type": "status_change", "device": device})
    return device


# ─────────────────────────────────────────────── history ──

@app.get("/api/devices/{device_id}/history")
async def get_history(device_id: int, hours: int = 24):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    return database.get_device_history(device_id, hours)


@app.get("/api/devices/{device_id}/uptime")
async def get_uptime(device_id: int, hours: int = 24):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    return {"uptime": database.get_uptime_percent(device_id, hours), "hours": hours}


# ─────────────────────────────────────────────── dashboard ──

@app.get("/api/dashboard")
async def get_dashboard():
    return database.get_dashboard_stats()


@app.get("/api/events")
async def get_events(limit: int = 40):
    return database.get_recent_events(limit)


# ─────────────────────────────────────────────── SNMP ──

@app.get("/api/snmp/available")
async def snmp_available():
    return {"available": snmp_module.is_available()}


@app.get("/api/devices/{device_id}/snmp")
async def get_snmp_metrics(device_id: int):
    device = database.get_device(device_id)
    if not device:
        raise HTTPException(404, "Пристрій не знайдено")
    community = device.get("snmp_community") or "public"
    port      = device.get("snmp_port") or 161
    metrics   = snmp_module.get_metrics(device["host"], community, port)
    return metrics


# ─────────────────────────────────────────────── scan ──

@app.post("/api/scan/start")
async def start_scan(request: ScanRequest = None):
    if scanner.is_scanning:
        return {"status": "already_scanning"}
    subnet = request.subnet if request else None
    asyncio.create_task(scanner.scan_network(subnet))
    return {"status": "started"}


@app.get("/api/scan/status")
async def get_scan_status():
    return {
        "is_scanning": scanner.is_scanning,
        "progress": scanner.progress,
        "found": scanner.found_devices,
    }


@app.get("/api/scan/default_subnet")
async def get_default_subnet():
    return {"subnet": scanner.get_subnet()}


# ─────────────────────────────────────────────── websocket ──

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    await ws.send_json({"type": "init", "devices": database.get_all_devices()})
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)