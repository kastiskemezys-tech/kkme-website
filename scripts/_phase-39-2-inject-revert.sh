#!/bin/bash
# Phase 39.2 — inject-then-revert proof for every gate this phase adds.
#
# Playbook B13: "Every new gate is proven by inject-then-revert on the real
# mechanism, not by reading its own source: delete or break the thing, watch the
# test go red, restore." Four separate phases this week shipped gates that could
# not fail. A gate that has not been made red is not a gate.
#
# Each injection below breaks the REAL mechanism in the REAL source file (never
# the test), runs the suite, and asserts the named test goes RED. Then reverts
# and asserts GREEN again. A PASS line means the gate demonstrably fails when
# the thing it guards is broken.
#
# Usage: bash scripts/_phase-39-2-inject-revert.sh
set -u

WORKER=workers/fetch-s1.js
NOTIFY=workers/lib/notify.js
FAILURES=0

run_test() {  # $1 = test file, $2 = -t filter
  npx vitest run "$1" -t "$2" 2>&1 | tail -25
}

# $1 label · $2 file · $3 python patch expr · $4 test file · $5 test name filter
inject() {
  local label="$1" file="$2" patch="$3" testfile="$4" filter="$5"
  echo ""
  echo "═══ INJECTION: $label"
  cp "$file" "$file.bak"
  python3 - "$file" <<EOF
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
before = s
$patch
if s == before:
    sys.stderr.write('PATCH DID NOT APPLY — injection is vacuous\n')
    sys.exit(3)
io.open(p, 'w', encoding='utf-8').write(s)
EOF
  if [ $? -ne 0 ]; then
    echo "  RESULT: ✗ FAIL — patch did not apply; this injection proves nothing"
    mv "$file.bak" "$file"
    FAILURES=$((FAILURES+1))
    return
  fi

  local out
  out=$(npx vitest run "$testfile" -t "$filter" 2>&1)
  local failed_count
  failed_count=$(echo "$out" | grep -cE "^\s+(×|FAIL)" )
  if echo "$out" | grep -qE "Tests +[0-9]+ failed|Tests .*[0-9]+ failed"; then
    echo "  RESULT: ✓ went RED with the mechanism broken"
    echo "$out" | grep -E "Tests +" | head -2 | sed 's/^/    /'
  else
    echo "  RESULT: ✗ STAYED GREEN — this gate cannot fail; it is not a gate"
    echo "$out" | grep -E "Tests +" | head -2 | sed 's/^/    /'
    FAILURES=$((FAILURES+1))
  fi

  mv "$file.bak" "$file"
  out=$(npx vitest run "$testfile" -t "$filter" 2>&1)
  if echo "$out" | grep -qE "Tests +[0-9]+ passed" && ! echo "$out" | grep -qE "[0-9]+ failed"; then
    echo "  REVERT: ✓ green again"
  else
    echo "  REVERT: ✗ STILL RED AFTER REVERT — working tree is dirty, stop"
    FAILURES=$((FAILURES+1))
  fi
}

echo "Phase 39.2 — inject-then-revert on the real mechanisms"
echo "======================================================"

# ── 1. A03 forward-fill ──────────────────────────────────────────────────────
# Break the fill and the reconstruction stops matching Elering. This is the
# assertion the whole fallback rests on.
inject "A44 forward-fill removed (positions no longer carried forward)" \
  "$WORKER" \
  "s = s.replace('      if (byPos.has(p)) last = byPos.get(p);\n      prices.push(last);', '      prices.push(byPos.has(p) ? byPos.get(p) : 0);')" \
  workers/__tests__/captureFallback.test.ts \
  "agrees with Elering slot-for-slot"

# ── 2. UTC-day slicing ───────────────────────────────────────────────────────
# Break the clock addressing (take the first N by index instead) and the day
# assembled from two market days stops being the day asked for.
inject "UTC-day slicing replaced by index-from-zero" \
  "$WORKER" \
  "s = s.replace('        if (slotMs < dayStart || slotMs >= dayEnd) continue;\n        grid[(slotMs - dayStart) / (gridMin * 60000)] = p.prices[i];', '        const gi = (i * per) + k; if (gi >= slots) continue; grid[gi] = p.prices[i];')" \
  workers/__tests__/captureFallback.test.ts \
  "assembles the UTC calendar day"

# ── 3. Refusal on an incomplete day ──────────────────────────────────────────
# Let a part-day through and the fallback will happily compute capture off a
# 22-hour curve before the next auction publishes.
inject "incomplete-day guard removed (part-day allowed through)" \
  "$WORKER" \
  "s = s.replace('  if (grid.some(v => v == null)) return null;', '  if (grid.some(v => v == null)) { for (let i=0;i<grid.length;i++) if (grid[i]==null) grid[i]=0; }')" \
  workers/__tests__/captureFallback.test.ts \
  "returns null — never a short day"

# ── 4. The fallback itself ───────────────────────────────────────────────────
inject "fallback branch removed (primary failure rethrown as before)" \
  "$WORKER" \
  "s = s.replace('    const reason = String(primaryErr);', '    throw primaryErr; // eslint-disable-line\n    const reason = String(primaryErr);')" \
  workers/__tests__/captureFallback.test.ts \
  "falls back to ENTSO-E on the live 503"

# ── 5. Transition alerting: suppression ──────────────────────────────────────
inject "suppression removed (every occurrence alerts again)" \
  "$NOTIFY" \
  "s = s.replace('    if (isNewRun || detailChanged) {', '    if (true) {')" \
  workers/__tests__/transitionAlerting.test.ts \
  "suppresses an identical repeat"

# ── 6. Transition alerting: the recovery message ─────────────────────────────
inject "recovery message removed (degraded → ok goes quiet)" \
  "$NOTIFY" \
  "s = s.replace(\"    if (prev.state === 'degraded') {\n      action = 'recovery';\", \"    if (false) {\n      action = 'recovery';\")" \
  workers/__tests__/transitionAlerting.test.ts \
  "sends a RECOVERY message"

# ── 7. Transition alerting: changed-error escape hatch ───────────────────────
inject "changed-error detection removed (a new error reads as a repeat)" \
  "$NOTIFY" \
  "s = s.replace('    const detailChanged = !isNewRun && prev.detail_hash !== hash;', '    const detailChanged = false;')" \
  workers/__tests__/transitionAlerting.test.ts \
  "alerts again when the error CHANGES"

# ── 8. Alerter self-health ───────────────────────────────────────────────────
inject "alerter health recording removed (sends leave no trace)" \
  "$NOTIFY" \
  "s = s.replace('  await recordAlerterHealth(env, result).catch(() => {});\n  return result;\n}', '  return result;\n}')" \
  workers/__tests__/transitionAlerting.test.ts \
  "records its own send failures"

# ── 9. Failure-payload freshness (B12) ───────────────────────────────────────
inject "degraded-payload detection removed (a failure counts as fresh again)" \
  "$WORKER" \
  "s = s.replace('          const degraded = data.unavailable === true || Boolean(data._scrape_error);', '          const degraded = false;')" \
  workers/__tests__/transitionAlerting.test.ts \
  "does not count a self-reported failure as fresh"

echo ""
echo "======================================================"
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL INJECTIONS WENT RED AND REVERTED GREEN — gates are real."
else
  echo "$FAILURES injection(s) did not behave. Read the log above."
fi
exit "$FAILURES"
