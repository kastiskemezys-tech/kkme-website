#!/bin/bash
# KKME Diagnostic — run at session start to check system health.
# Usage: bash scripts/diagnose.sh

WORKER="https://kkme-fetch-s1.kastis-kemezys.workers.dev"
FRONTEND="https://kkme.eu"

echo "=== KKME Diagnostic ==="
echo "Time: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

# ── Git state ──
echo "--- Git state ---"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "Branch: $BRANCH"
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "Uncommitted changes: $DIRTY files"
LAST=$(git log --oneline -1 2>/dev/null)
echo "Last commit: $LAST"
echo ""

# ── Worker health ──
echo "--- Worker /health ---"
HEALTH=$(curl -s --max-time 10 "$WORKER/health" 2>/dev/null)
if [ -z "$HEALTH" ]; then
  echo "FAIL: Worker unreachable"
else
  echo "$HEALTH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"All fresh: {d.get('all_fresh', '?')}\")
for sig, info in d.get('signals', {}).items():
    age = info.get('age_hours', '?')
    stale = info.get('stale', '?')
    mark = 'STALE' if stale else 'ok'
    print(f'  {sig}: {age:.1f}h ({mark})')
mac = d.get('mac_cron', {})
print(f\"Mac cron: {mac.get('status', '?')} (last: {mac.get('last_ping', '?')})\")
" 2>/dev/null || echo "  (parse error — raw: ${HEALTH:0:200})"
fi
echo ""

# ── Key endpoints ──
echo "--- Key endpoints ---"
for EP in /s1 /s2 /s8 /genload; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WORKER$EP" 2>/dev/null)
  echo "  $EP: HTTP $STATUS"
done
echo ""

# ── Frontend ──
echo "--- Frontend ---"
FSTATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND" 2>/dev/null)
echo "  $FRONTEND: HTTP $FSTATUS"
echo ""

echo "=== Done ==="
