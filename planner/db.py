"""SQLite storage. One file, path from PLANNER_DB."""

import os
import sqlite3
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "planner.db"

DEFAULT_SETTINGS = {
    "day_start": "07:00",
    "day_end": "02:00",  # end <= start means "next day"
}

TASK_LISTS = ("tests", "hw", "extracurriculars", "misc")

# Each entry upgrades the schema by one version (PRAGMA user_version).
MIGRATIONS = [
    """
    CREATE TABLE blocks (
        id          INTEGER PRIMARY KEY,
        day         INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),  -- 0 = Monday
        start       TEXT    NOT NULL,                              -- "HH:MM"
        end         TEXT    NOT NULL,                              -- "HH:MM", <= start wraps past midnight
        description TEXT    NOT NULL DEFAULT '',
        color       TEXT    NOT NULL DEFAULT '#6366f1'
    );

    CREATE TABLE tasks (
        id         INTEGER PRIMARY KEY,
        list       TEXT    NOT NULL,
        text       TEXT    NOT NULL,
        done       INTEGER NOT NULL DEFAULT 0,
        position   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        done_at    TEXT
    );
    CREATE INDEX tasks_list_pos ON tasks (list, done, position);

    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
]


def db_path() -> Path:
    return Path(os.environ.get("PLANNER_DB", DEFAULT_DB)).expanduser()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db() -> None:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for i, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            with conn:
                conn.executescript(sql)
                conn.execute(f"PRAGMA user_version = {i}")
        with conn:
            conn.executemany(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                DEFAULT_SETTINGS.items(),
            )
    finally:
        conn.close()


def get_conn():
    """FastAPI dependency: one connection per request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
