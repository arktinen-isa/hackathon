import sqlite3
import threading
from typing import Optional

DB_PATH = "monitor.db"
_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS devices (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                name                 TEXT    NOT NULL,
                host                 TEXT    NOT NULL,
                device_type          TEXT    NOT NULL,
                check_method         TEXT    NOT NULL DEFAULT 'ping',
                status               TEXT    NOT NULL DEFAULT 'unknown',
                last_seen            TEXT,
                response_time        REAL,
                consecutive_up       INTEGER NOT NULL DEFAULT 0,
                consecutive_down     INTEGER NOT NULL DEFAULT 0,
                poll_interval        INTEGER NOT NULL DEFAULT 60,
                created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS history (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id     INTEGER NOT NULL,
                status        TEXT    NOT NULL,
                response_time REAL,
                checked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_history_device_time
                ON history(device_id, checked_at);
        """)


# ── devices ──────────────────────────────────────────────────────────────────

def get_all_devices() -> list[dict]:
    with _connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM devices ORDER BY id")]


def get_device(device_id: int) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
        return dict(row) if row else None


def create_device(name: str, host: str, device_type: str, check_method: str = "ping") -> dict:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO devices (name, host, device_type, check_method) VALUES (?, ?, ?, ?)",
            (name, host, device_type, check_method),
        )
        conn.commit()
        return get_device(cur.lastrowid)


def update_device(device_id: int, **fields) -> Optional[dict]:
    if not fields:
        return get_device(device_id)
    with _lock, _connect() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE devices SET {set_clause} WHERE id = ?",
            [*fields.values(), device_id],
        )
        conn.commit()
    return get_device(device_id)


def delete_device(device_id: int) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))
        conn.commit()


# ── history ───────────────────────────────────────────────────────────────────

def add_history(device_id: int, status: str, response_time: Optional[float]) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO history (device_id, status, response_time) VALUES (?, ?, ?)",
            (device_id, status, response_time),
        )
        conn.execute(
            "DELETE FROM history WHERE device_id = ? AND checked_at < datetime('now', '-24 hours')",
            (device_id,),
        )
        conn.commit()


def get_device_history(device_id: int, hours: int = 24) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT status, response_time, checked_at
            FROM   history
            WHERE  device_id = ?
              AND  checked_at >= datetime('now', ? || ' hours')
            ORDER  BY checked_at
            """,
            (device_id, f"-{hours}"),
        ).fetchall()
        return [dict(r) for r in rows]


def get_uptime_percent(device_id: int, hours: int = 24) -> Optional[float]:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up_count
            FROM   history
            WHERE  device_id = ?
              AND  checked_at >= datetime('now', ? || ' hours')
            """,
            (device_id, f"-{hours}"),
        ).fetchone()
        if row and row["total"]:
            return round(row["up_count"] / row["total"] * 100, 1)
        return None
