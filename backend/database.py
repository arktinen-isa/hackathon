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
                rtt_threshold        INTEGER NOT NULL DEFAULT 100,
                maintenance          INTEGER NOT NULL DEFAULT 0,
                snmp_community       TEXT    NOT NULL DEFAULT 'public',
                snmp_port            INTEGER NOT NULL DEFAULT 161,
                cpu_usage            REAL,
                ram_usage            REAL,
                bandwidth_in         REAL,
                bandwidth_out        REAL,
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

            CREATE TABLE IF NOT EXISTS events (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id    INTEGER NOT NULL,
                device_name  TEXT    NOT NULL,
                prev_status  TEXT,
                new_status   TEXT    NOT NULL,
                occurred_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_events_time
                ON events(occurred_at DESC);
        """)

    # Migrations for existing databases
    _run_migrations()


def _run_migrations() -> None:
    migrations = [
        "ALTER TABLE devices ADD COLUMN rtt_threshold INTEGER NOT NULL DEFAULT 100",
        "ALTER TABLE devices ADD COLUMN maintenance INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE devices ADD COLUMN snmp_community TEXT NOT NULL DEFAULT 'public'",
        "ALTER TABLE devices ADD COLUMN snmp_port INTEGER NOT NULL DEFAULT 161",
        "ALTER TABLE devices ADD COLUMN cpu_usage REAL",
        "ALTER TABLE devices ADD COLUMN ram_usage REAL",
        "ALTER TABLE devices ADD COLUMN bandwidth_in REAL",
        "ALTER TABLE devices ADD COLUMN bandwidth_out REAL",
    ]
    with _connect() as conn:
        for sql in migrations:
            try:
                conn.execute(sql)
                conn.commit()
            except Exception:
                pass


# ──────────────────────────────────────────────────────────── devices ──


def get_all_devices() -> list[dict]:
    with _connect() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM devices ORDER BY id")]


def get_device(device_id: int) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
        return dict(row) if row else None


def create_device(
    name: str,
    host: str,
    device_type: str,
    check_method: str = "ping",
    rtt_threshold: int = 100,
    snmp_community: str = "public",
    snmp_port: int = 161,
) -> dict:
    with _lock, _connect() as conn:
        cur = conn.execute(
            """INSERT INTO devices
               (name, host, device_type, check_method, rtt_threshold, snmp_community, snmp_port)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, host, device_type, check_method, rtt_threshold, snmp_community, snmp_port),
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


def toggle_maintenance(device_id: int) -> Optional[dict]:
    with _lock, _connect() as conn:
        conn.execute(
            "UPDATE devices SET maintenance = CASE WHEN maintenance = 0 THEN 1 ELSE 0 END WHERE id = ?",
            (device_id,),
        )
        conn.commit()
    return get_device(device_id)


# ──────────────────────────────────────────────────────────── history ──


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
                   SUM(CASE WHEN status IN ('up', 'slow') THEN 1 ELSE 0 END) AS up_count
            FROM   history
            WHERE  device_id = ?
              AND  checked_at >= datetime('now', ? || ' hours')
            """,
            (device_id, f"-{hours}"),
        ).fetchone()
        if row and row["total"]:
            return round(row["up_count"] / row["total"] * 100, 1)
        return None


# ──────────────────────────────────────────────────────────── events ──


def add_event(device_id: int, device_name: str, prev_status: Optional[str], new_status: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO events (device_id, device_name, prev_status, new_status) VALUES (?, ?, ?, ?)",
            (device_id, device_name, prev_status, new_status),
        )
        conn.execute(
            "DELETE FROM events WHERE occurred_at < datetime('now', '-48 hours')",
        )
        conn.commit()


def get_recent_events(limit: int = 40) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, device_id, device_name, prev_status, new_status, occurred_at
            FROM   events
            ORDER  BY occurred_at DESC
            LIMIT  ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


# ──────────────────────────────────────────────────────── dashboard ──


def get_dashboard_stats() -> dict:
    with _connect() as conn:
        rows = conn.execute("SELECT status, response_time, maintenance FROM devices").fetchall()
        total = len(rows)
        counts: dict[str, int] = {}
        rtts = []
        maintenance_count = 0
        for row in rows:
            s = row["status"]
            counts[s] = counts.get(s, 0) + 1
            if row["maintenance"]:
                maintenance_count += 1
            if row["response_time"] is not None and row["status"] in ("up", "slow"):
                rtts.append(row["response_time"])

        avg_rtt = round(sum(rtts) / len(rtts), 1) if rtts else None
        max_rtt = round(max(rtts), 1) if rtts else None

        return {
            "total": total,
            "up": counts.get("up", 0),
            "down": counts.get("down", 0),
            "slow": counts.get("slow", 0),
            "unstable": counts.get("unstable", 0),
            "unknown": counts.get("unknown", 0),
            "maintenance": maintenance_count,
            "avg_rtt": avg_rtt,
            "max_rtt": max_rtt,
        }
