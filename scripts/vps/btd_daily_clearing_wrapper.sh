#!/bin/bash
# Phase 50 — daily incremental for `s2_daily_clearing`.
#
# Why this exists. `backfill_btd_daily.py` was written in 36.C as a ONE-OFF and
# was never scheduled — not in a crontab, not in a wrapper, nowhere. The series
# it populates therefore froze at delivery day 2026-07-26 and drifted 9 days
# behind before anyone looked. That matters more than an ordinary stale feed:
# `s2_daily_clearing` begins on 2025-10-01, which is the oldest day BTD still
# serves, so every day the importer does not run is a day that eventually falls
# out of BTD's window and becomes unrecoverable. A stopped importer is the
# mechanism by which the archive is lost.
#
# `#!/bin/bash` and `set -a` are deliberate: inline crons run under dash, where
# `source` is a bashism that fails silently and the .env never loads.
#
# Window: the last 8 delivery days, ending at yesterday. Deliberately overlapping
# rather than incremental-by-one — the import is idempotent (re-importing a date
# replaces it), so an overlapping window self-heals a short outage without anyone
# noticing it happened. BTD publishes with a ~1–2 day lag, so `end` is yesterday.
set -uo pipefail

LOG_DIR="/opt/kkme/logs"
LOG_FILE="$LOG_DIR/btd_daily_clearing.log"
mkdir -p "$LOG_DIR"

{
  echo "=== $(date -Iseconds) btd_daily_clearing start ==="
  set -a
  # shellcheck disable=SC1091
  source /opt/kkme/config/.env 2>&1 || true
  set +a

  if [ -z "${UPDATE_SECRET:-}" ]; then
    echo "UPDATE_SECRET missing — refusing to run (a silent no-auth run would look like success)"
    exit 1
  fi

  START=$(date -u -d '8 days ago' +%F)
  END=$(date -u -d '1 day ago' +%F)
  echo "window $START → $END"

  cd /opt/kkme/app || exit 1
  /opt/kkme/venv/bin/python3 sync/backfill_btd_daily.py "$START" "$END"
  rc=$?
  echo "=== $(date -Iseconds) exit=$rc ==="
  exit $rc
} >> "$LOG_FILE" 2>&1
