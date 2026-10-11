import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from .db import DEFAULT_SETTINGS, get_conn, init_db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"
TaskList = Literal["tests", "hw", "extracurriculars", "misc"]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- models ----------

class BlockIn(BaseModel):
    day: int = Field(ge=0, le=6)
    start: str = Field(pattern=TIME_PATTERN)
    end: str = Field(pattern=TIME_PATTERN)
    description: str = ""
    color: str = Field(default="#6366f1", pattern=COLOR_PATTERN)

    @field_validator("end")
    @classmethod
    def end_differs(cls, v, info):
        if v == info.data.get("start"):
            raise ValueError("end must differ from start")
        return v


class Block(BlockIn):
    id: int


class TaskIn(BaseModel):
    list: TaskList
    text: str = Field(min_length=1)


class TaskPatch(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    done: bool | None = None


class Task(BaseModel):
    id: int
    list: TaskList
    text: str
    done: bool
    position: int
    created_at: str
    done_at: str | None = None


class Reorder(BaseModel):
    list: TaskList
    ids: list[int]


class Settings(BaseModel):
    day_start: str = Field(pattern=TIME_PATTERN)
    day_end: str = Field(pattern=TIME_PATTERN)


class Backup(BaseModel):
    version: int = 1
    exported_at: str | None = None
    blocks: list[Block] = []
    tasks: list[Task] = []
    settings: Settings = Settings(**DEFAULT_SETTINGS)


# ---------- app ----------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Planner", lifespan=lifespan)
Conn = Depends(get_conn)


def row_to_task(r: sqlite3.Row) -> Task:
    return Task(**{**dict(r), "done": bool(r["done"])})


def read_settings(conn) -> Settings:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return Settings(**{**DEFAULT_SETTINGS, **{r["key"]: r["value"] for r in rows}})


# blocks

@app.get("/api/blocks", response_model=list[Block])
def list_blocks(conn=Conn):
    rows = conn.execute("SELECT * FROM blocks ORDER BY day, start").fetchall()
    return [Block(**dict(r)) for r in rows]


@app.post("/api/blocks", response_model=Block, status_code=201)
def create_block(b: BlockIn, conn=Conn):
    with conn:
        cur = conn.execute(
            "INSERT INTO blocks (day, start, end, description, color) VALUES (?, ?, ?, ?, ?)",
            (b.day, b.start, b.end, b.description, b.color),
        )
    return Block(id=cur.lastrowid, **b.model_dump())


@app.put("/api/blocks/{block_id}", response_model=Block)
def update_block(block_id: int, b: BlockIn, conn=Conn):
    with conn:
        cur = conn.execute(
            "UPDATE blocks SET day=?, start=?, end=?, description=?, color=? WHERE id=?",
            (b.day, b.start, b.end, b.description, b.color, block_id),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "block not found")
    return Block(id=block_id, **b.model_dump())


@app.delete("/api/blocks/{block_id}", status_code=204)
def delete_block(block_id: int, conn=Conn):
    with conn:
        cur = conn.execute("DELETE FROM blocks WHERE id=?", (block_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "block not found")


# tasks

@app.get("/api/tasks", response_model=list[Task])
def list_tasks(list: TaskList | None = None, conn=Conn):
    sql = "SELECT * FROM tasks"
    args: tuple = ()
    if list:
        sql += " WHERE list=?"
        args = (list,)
    sql += " ORDER BY list, done, position, id"
    return [row_to_task(r) for r in conn.execute(sql, args).fetchall()]


def next_position(conn, task_list: str) -> int:
    return conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE list=? AND done=0",
        (task_list,),
    ).fetchone()[0]


def get_task(conn, task_id: int) -> Task:
    r = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if r is None:
        raise HTTPException(404, "task not found")
    return row_to_task(r)


@app.post("/api/tasks", response_model=Task, status_code=201)
def create_task(t: TaskIn, conn=Conn):
    with conn:
        cur = conn.execute(
            "INSERT INTO tasks (list, text, position) VALUES (?, ?, ?)",
            (t.list, t.text.strip(), next_position(conn, t.list)),
        )
    return get_task(conn, cur.lastrowid)


@app.patch("/api/tasks/{task_id}", response_model=Task)
def update_task(task_id: int, p: TaskPatch, conn=Conn):
    task = get_task(conn, task_id)
    with conn:
        if p.text is not None:
            conn.execute("UPDATE tasks SET text=? WHERE id=?", (p.text.strip(), task_id))
        if p.done is not None and p.done != task.done:
            if p.done:
                conn.execute("UPDATE tasks SET done=1, done_at=? WHERE id=?", (now_iso(), task_id))
            else:
                # Un-checking puts the item back at the bottom of its list.
                conn.execute(
                    "UPDATE tasks SET done=0, done_at=NULL, position=? WHERE id=?",
                    (next_position(conn, task.list), task_id),
                )
    return get_task(conn, task_id)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, conn=Conn):
    with conn:
        cur = conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "task not found")


@app.put("/api/tasks/reorder", status_code=204)
def reorder_tasks(r: Reorder, conn=Conn):
    with conn:
        conn.executemany(
            "UPDATE tasks SET position=? WHERE id=? AND list=?",
            [(i, task_id, r.list) for i, task_id in enumerate(r.ids)],
        )


# settings

@app.get("/api/settings", response_model=Settings)
def get_settings(conn=Conn):
    return read_settings(conn)


@app.put("/api/settings", response_model=Settings)
def put_settings(s: Settings, conn=Conn):
    with conn:
        conn.executemany(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            s.model_dump().items(),
        )
    return s


# backup

@app.get("/api/export")
def export_data(conn=Conn):
    data = Backup(
        exported_at=now_iso(),
        blocks=list_blocks(conn),
        tasks=list_tasks(None, conn),
        settings=read_settings(conn),
    )
    filename = f"planner-{datetime.now().strftime('%Y-%m-%d')}.json"
    return JSONResponse(
        data.model_dump(),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/import")
def import_data(data: Backup, conn=Conn):
    """Replace everything with the contents of a previous export."""
    with conn:
        conn.execute("DELETE FROM blocks")
        conn.execute("DELETE FROM tasks")
        conn.executemany(
            "INSERT INTO blocks (id, day, start, end, description, color) VALUES (?, ?, ?, ?, ?, ?)",
            [(b.id, b.day, b.start, b.end, b.description, b.color) for b in data.blocks],
        )
        conn.executemany(
            "INSERT INTO tasks (id, list, text, done, position, created_at, done_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(t.id, t.list, t.text, int(t.done), t.position, t.created_at, t.done_at)
             for t in data.tasks],
        )
        conn.executemany(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            data.settings.model_dump().items(),
        )
    return {"blocks": len(data.blocks), "tasks": len(data.tasks)}


# ---------- frontend ----------

@app.get("/api/{rest:path}", include_in_schema=False)
def api_not_found(rest: str):
    raise HTTPException(404, "not found")


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    file = (DIST / path).resolve()
    if path and file.is_file() and file.is_relative_to(DIST):
        return FileResponse(file)
    index = DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse(
        {"detail": "Frontend not built. Run: cd frontend && npm install && npm run build"},
        status_code=503,
    )
