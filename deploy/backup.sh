#!/usr/bin/env bash
# Nightly SQLite backup (runs on the Pi from cron). Uses sqlite3's online .backup,
# which is safe while the app is running, and keeps dated, gzipped copies.
set -euo pipefail

DB="${PLANNER_DB:-$HOME/planner-data/planner.db}"
DIR="${BACKUP_DIR:-$HOME/planner-data/backups}"
KEEP_DAYS="${KEEP_DAYS:-60}"

mkdir -p "$DIR"
OUT="$DIR/planner-$(date +%F).db"

sqlite3 "$DB" ".backup '$OUT'"
if [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "$(date -Is) integrity check FAILED for $OUT" >&2
  exit 1
fi
gzip -f "$OUT"

find "$DIR" -name 'planner-*.db.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backed up to $OUT.gz"
