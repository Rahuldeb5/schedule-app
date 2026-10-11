import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PLANNER_DB", str(tmp_path / "test.db"))
    from planner.main import app

    with TestClient(app) as c:
        yield c


def test_blocks_crud(client):
    r = client.post("/api/blocks", json={
        "day": 0, "start": "09:00", "end": "10:30", "description": "Calc", "color": "#ff0000",
    })
    assert r.status_code == 201
    block = r.json()

    # wraps past midnight
    assert client.post("/api/blocks", json={"day": 4, "start": "23:00", "end": "01:00"}).status_code == 201
    assert len(client.get("/api/blocks").json()) == 2

    block["description"] = "Calc II"
    r = client.put(f"/api/blocks/{block['id']}", json=block)
    assert r.json()["description"] == "Calc II"

    assert client.delete(f"/api/blocks/{block['id']}").status_code == 204
    assert client.delete(f"/api/blocks/{block['id']}").status_code == 404
    assert len(client.get("/api/blocks").json()) == 1


@pytest.mark.parametrize("bad", [
    {"day": 7, "start": "09:00", "end": "10:00"},
    {"day": 0, "start": "9:00", "end": "10:00"},
    {"day": 0, "start": "09:00", "end": "09:00"},
    {"day": 0, "start": "09:00", "end": "10:00", "color": "red"},
])
def test_block_validation(client, bad):
    assert client.post("/api/blocks", json=bad).status_code == 422


def test_tasks_order_and_done(client):
    ids = [client.post("/api/tasks", json={"list": "hw", "text": t}).json()["id"] for t in "abc"]
    client.post("/api/tasks", json={"list": "misc", "text": "other"})
    assert [t["text"] for t in client.get("/api/tasks?list=hw").json()] == ["a", "b", "c"]

    assert client.put("/api/tasks/reorder", json={"list": "hw", "ids": ids[::-1]}).status_code == 204
    assert [t["text"] for t in client.get("/api/tasks?list=hw").json()] == ["c", "b", "a"]

    r = client.patch(f"/api/tasks/{ids[2]}", json={"done": True})
    assert r.json()["done"] and r.json()["done_at"]
    # un-checking moves it to the bottom of the active list
    client.patch(f"/api/tasks/{ids[2]}", json={"done": False})
    active = [t["text"] for t in client.get("/api/tasks?list=hw").json() if not t["done"]]
    assert active == ["b", "a", "c"]

    assert client.patch(f"/api/tasks/{ids[0]}", json={"text": "  edited "}).json()["text"] == "edited"
    assert client.post("/api/tasks", json={"list": "nope", "text": "x"}).status_code == 422
    assert client.delete(f"/api/tasks/{ids[0]}").status_code == 204


def test_settings(client):
    assert client.get("/api/settings").json() == {"day_start": "07:00", "day_end": "02:00"}
    client.put("/api/settings", json={"day_start": "06:00", "day_end": "23:00"})
    assert client.get("/api/settings").json()["day_start"] == "06:00"


def test_export_import_roundtrip(client):
    client.post("/api/blocks", json={"day": 2, "start": "08:00", "end": "09:00", "description": "Gym"})
    t = client.post("/api/tasks", json={"list": "tests", "text": "Physics midterm"}).json()
    client.patch(f"/api/tasks/{t['id']}", json={"done": True})
    client.put("/api/settings", json={"day_start": "08:00", "day_end": "00:00"})

    r = client.get("/api/export")
    assert "attachment" in r.headers["content-disposition"]
    dump = r.json()

    client.post("/api/blocks", json={"day": 1, "start": "08:00", "end": "09:00"})
    client.post("/api/tasks", json={"list": "misc", "text": "junk"})

    assert client.post("/api/import", json=dump).json() == {"blocks": 1, "tasks": 1}
    again = client.get("/api/export").json()
    assert again["blocks"] == dump["blocks"]
    assert again["tasks"] == dump["tasks"]
    assert again["settings"] == dump["settings"]


def test_unknown_api_route_is_404(client):
    assert client.get("/api/nope").status_code == 404
