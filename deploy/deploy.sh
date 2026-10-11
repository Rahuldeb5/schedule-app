#!/usr/bin/env bash
# Run on the WSL machine: build the frontend, commit dist/ if it changed, push,
# then update and restart the planner on the Pi over Tailscale SSH.
set -euo pipefail

PI_HOST="${PI_HOST:-100.95.31.92}"     # the Pi's Tailscale IP (or MagicDNS name)
PI_USER="${PI_USER:-rahuldeb5}"
BRANCH="${BRANCH:-main}"

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain -- . ':!frontend/dist')" ]; then
  echo "Uncommitted changes. Commit or stash them first:" >&2
  git status --short -- . ':!frontend/dist' >&2
  exit 1
fi

echo "==> Building frontend"
(cd frontend && npm ci --silent && npm run build)

git add -A frontend/dist
if ! git diff --cached --quiet; then
  git commit -q -m "Build frontend"
  echo "==> Committed new frontend build"
fi

echo "==> Pushing $BRANCH"
git push -q origin "$BRANCH"

echo "==> Updating $PI_USER@$PI_HOST"
ssh "$PI_USER@$PI_HOST" BRANCH="$BRANCH" bash -s <<'REMOTE'
set -euo pipefail
cd ~/schedule-app
git pull -q --ff-only origin "$BRANCH"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
mkdir -p ~/planner-data
systemctl --user restart planner
for i in $(seq 1 10); do
  if curl -fsS -o /dev/null http://127.0.0.1:8000/api/settings; then
    echo "==> planner is up ($(git log -1 --format='%h %s'))"
    exit 0
  fi
  sleep 1
done
echo "planner did not come up; recent logs:" >&2
journalctl --user -u planner -n 30 --no-pager >&2
exit 1
REMOTE
