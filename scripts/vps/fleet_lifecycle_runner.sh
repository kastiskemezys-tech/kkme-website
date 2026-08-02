#!/bin/bash
# Phase 37.B.1a — the weekly detector runner, as cron runs it.
#
# Deployed to the VPS at /opt/kkme/bin/fleet_lifecycle_runner.sh. Kept in the repo so the thing
# that runs in production is reviewable, like daily_intel_wrapper.sh.
#
# WHY A WRAPPER AND NOT AN INLINE CRON. The 36.C lesson: cron opens its redirect BEFORE running the
# command, so if the log directory is missing the job dies silently having produced nothing to say
# so. A wrapper can assert the directory first. The dash lesson (Session 78) is the other half —
# `source` is a bashism and the inline crons that used it never loaded .env under /bin/sh. This file
# declares #!/bin/bash and uses `.` anyway.
#
# WHY --write-health AND NOT --write. `--write` posts proposals into fleet_lifecycle:transitions,
# the log the weekly digest renders and sends to Telegram. run-lifecycle.mjs's own header explains
# why that must never run unattended: one untrimmed space in the LV register marked 486,509 entities
# terminated, Latvenergo included. This cron proves the runner ran and reports what each detector
# could see. Acting on a proposal stays a reviewed, manual `--write`.

set -uo pipefail

ROOT=/opt/kkme/fleet-intel
LOG_DIR=/opt/kkme/logs
LOG="$LOG_DIR/fleet_lifecycle.log"
NODE=/usr/bin/node
ENV_FILE=/opt/kkme/config/.env

# The 36.C assertion. If this directory is gone the redirect below would have already swallowed
# everything, so it is checked before anything is redirected anywhere.
if [ ! -d "$LOG_DIR" ]; then
  echo "FATAL: $LOG_DIR missing — cron's redirect would have discarded this run silently" >&2
  exit 1
fi

exec >> "$LOG" 2>&1
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) fleet-lifecycle runner starting ==="

[ -x "$NODE" ] || { echo "FATAL: $NODE not executable"; exit 1; }
[ -f "$ROOT/tools/fleet-intel/run-lifecycle.mjs" ] || { echo "FATAL: runner not deployed at $ROOT"; exit 1; }

# `.` not `source`: under /bin/sh=dash `source` does not exist and .env would never load, which is
# the failure that left four crons broken for weeks (Session 78).
[ -f "$ENV_FILE" ] || { echo "FATAL: $ENV_FILE missing — UPDATE_SECRET unavailable"; exit 1; }
. "$ENV_FILE"
export UPDATE_SECRET

if [ -z "${UPDATE_SECRET:-}" ]; then
  echo "FATAL: UPDATE_SECRET empty after sourcing $ENV_FILE"
  exit 1
fi

cd "$ROOT" || exit 1
START=$(date -u +%s)
"$NODE" tools/fleet-intel/run-lifecycle.mjs --refresh-register --write-health
STATUS=$?
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) exit=$STATUS elapsed=$(( $(date -u +%s) - START ))s ==="
exit "$STATUS"
