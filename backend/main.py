import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database
from models import DeviceCreate, DeviceUpdate
from poller import AdaptivePoller

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ── WebSocket broadcast ────────────────────────────────────────────────────────

class _WsManager:
    def __init__(self) -> None:
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws) if hasattr(self._clients, "discard") else None
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


# ── lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_running_loop()
    database.init_db()
    poller.start()
    yield
    poller.stop()


app = FastAPI(title="Моніторинг мережевих пристроїв", lifespan=lifespan)

# Static files (CSS / JS)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ── pages ──────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


# ── REST: devices ──────────────────────────────────────────────────────────────

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
    fields = data.model_dump(exclude_none=True)
    # Pydantic enums → plain strings
    fields = {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}
    return database.update_device(device_id, **fields)


@app.delete("/api/devices/{device_id}", status_code=204)
async def delete_device(device_id: int):
    if not database.get_device(device_id):
        raise HTTPException(404, "Пристрій не знайдено")
    poller.remove_device(device_id)
    database.delete_device(device_id)


# ── REST: history & stats ──────────────────────────────────────────────────────

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


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    await ws.send_json({"type": "init", "devices": database.get_all_devices()})
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
