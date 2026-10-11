#!/usr/bin/env bash
# One-command local run: creates the venv and builds the frontend if needed, then starts the app.
set -euo pipefail
cd "$(dirname "$0")"

[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm ci && npm run build)
fi

export PLANNER_DB="${PLANNER_DB:-$PWD/data/dev.db}"
echo "Database: $PLANNER_DB"
exec .venv/bin/python -m planner
