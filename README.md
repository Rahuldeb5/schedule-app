### super duper cool schedule app by Rahuldeb5

A small self-hosted planner: a repeating Mon–Sun **week view** of time blocks, and **to-do lists**
(School → Tests / HW, Extracurriculars, Misc) with drag-to-reorder. FastAPI + SQLite on the back,
React + Vite on the front, served together as one process on one port.

```
planner/            FastAPI app + SQLite schema (python -m planner)
frontend/           React + Vite source; frontend/dist is the committed build
tests/              API tests (pytest)
deploy/             systemd unit, deploy.sh, backup.sh
run.sh              one-command local run
```

## Run locally (WSL)

Needs Python 3.10+ and Node 18+ (Node only to build the frontend).

```bash
./run.sh
```

That creates `.venv`, installs the Python deps, builds the frontend if `frontend/dist` is missing, and
starts the app at http://127.0.0.1:8000 using `data/dev.db`.

Configuration is all environment variables:

| Variable     | Default            | Meaning                                    |
|--------------|--------------------|--------------------------------------------|
| `PLANNER_DB` | `data/planner.db`  | SQLite file (`run.sh` uses `data/dev.db`)  |
| `HOST`       | `127.0.0.1`        | Bind address (`0.0.0.0` to expose on LAN)  |
| `PORT`       | `8000`             |                                            |
| `RELOAD`     | unset              | `1` = auto-reload Python on changes        |

### Working on the code

```bash
# terminal 1: API with auto-reload
PLANNER_DB=data/dev.db RELOAD=1 .venv/bin/python -m planner
# terminal 2: UI with hot reload at http://localhost:5173 (proxies /api to :8000)
cd frontend && npm run dev
```

Tests: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest -q`.
API docs are at http://127.0.0.1:8000/docs.

After UI changes, `cd frontend && npm run build` so FastAPI serves the new version.
`deploy.sh` does this for you.

## Using it

- **Week**: click an empty spot in a column, or use the side panel (the **+** button on a phone), to
  add a block. Click a block to edit or delete it. Times before the start of the visible range (e.g.
  12:30 AM when the day starts at 7 AM) count as late night and appear at the bottom of that day's
  column; an end time earlier than the start means it runs past midnight. The visible hours are
  under "Visible hours" in the side panel.
- **To-do**: click a list header, type, press Enter; keep typing to add more, Esc (or clicking
  away with an empty box) closes it. Drag the ⠿ handle to reorder. Click text to edit (Enter saves,
  Esc cancels). Checked items move to the collapsible "Done" section; unchecking puts them back at
  the bottom.
- **Export / Import** (top right): Export downloads everything as JSON. Import **replaces all data**
  with the contents of an export, after a confirmation.

## Raspberry Pi (production)

The Pi runs the app as a `systemd --user` service named `planner`, bound to `127.0.0.1:8000`, and
`tailscale serve` exposes it over HTTPS to your tailnet only. The frontend is built on WSL and
committed, so the Pi only needs Python.

Paths on the Pi:
- code: `~/schedule-app`
- database: `~/planner-data/planner.db` (kept outside the repo; dev and prod never share a DB)
- backups: `~/planner-data/backups/`

### One-time setup on the Pi

```bash
sudo apt update && sudo apt install -y git python3-venv sqlite3 curl

git clone https://github.com/Rahuldeb5/schedule-app.git ~/schedule-app
cd ~/schedule-app
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
mkdir -p ~/planner-data

# service
mkdir -p ~/.config/systemd/user
cp deploy/planner.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now planner
sudo loginctl enable-linger rahuldeb5     # start at boot, even when you're not logged in

curl http://127.0.0.1:8000/api/settings  # should print JSON
```

If the GitHub repo is private, the Pi needs read access to it to `git pull`, either a
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
(then clone with the `git@github.com:` URL) or a fine-grained token.

Useful commands:

```bash
systemctl --user status planner
journalctl --user -u planner -f          # logs
systemctl --user restart planner
```

### Expose it over Tailscale

The Pi already needs to be on your tailnet (`sudo tailscale up`). In the
[admin console](https://login.tailscale.com/admin/dns), enable **MagicDNS** and **HTTPS
certificates**. Then on the Pi:

```bash
sudo tailscale serve --bg 8000
tailscale serve status                   # shows the https://<pi>.<tailnet>.ts.net URL
```

`--bg` makes it persistent across reboots. Nothing is opened to the public internet: only devices
logged in to your tailnet can reach it. (`tailscale serve reset` undoes it.)

### Open it from your phone or PC

Any device on your tailnet works the same way. On the Windows PC, the Tailscale app running on
Windows covers every browser on the PC.

1. Install the Tailscale app and sign in with the same account, then make sure it's connected.
2. Open `https://<pi-hostname>.<tailnet>.ts.net` (the URL from `tailscale serve status`).
3. Optional: Share → **Add to Home Screen** (iOS) or ⋮ → **Add to home screen** (Android) to get
   an app-like icon.

### Deploying updates (from WSL)

Commit your changes, then:

```bash
deploy/deploy.sh                     # targets rahuldeb5@100.95.31.92 by default; PI_HOST=... to override
```

It refuses to run with uncommitted changes, then:
1. builds the frontend
2. commits `frontend/dist` if it changed
3. pushes `main`
4. SSHes to the Pi: `git pull`, `pip install -r requirements.txt`, `systemctl --user restart planner`
5. waits until the app answers, or prints the service logs if it doesn't

SSH goes over Tailscale and should not ask for a password. Copy your WSL key to the Pi once with
`ssh-copy-id rahuldeb5@100.95.31.92` (enter the password one last time), or use Tailscale SSH
(`sudo tailscale up --ssh` on the Pi).

### Nightly backups

`deploy/backup.sh` uses `sqlite3 .backup`, which is safe while the app is running. It:
- writes `~/planner-data/backups/planner-YYYY-MM-DD.db`
- runs an integrity check
- gzips it
- deletes backups older than 60 days (`KEEP_DAYS` to change)

On the Pi, `crontab -e` and add:

```cron
15 3 * * * /home/rahuldeb5/schedule-app/deploy/backup.sh >> /home/rahuldeb5/planner-data/backup.log 2>&1
```

That runs at 3:15 AM every night. Run the script once by hand to check it works.

To restore a backup:

```bash
systemctl --user stop planner
gunzip -c ~/planner-data/backups/planner-2026-10-11.db.gz > ~/planner-data/planner.db
rm -f ~/planner-data/planner.db-wal ~/planner-data/planner.db-shm
systemctl --user start planner
```

(Or use Export / Import in the UI to move data around as JSON.)
