#!/bin/bash
# Phase 49 — inject-then-revert proof for every class guard this phase ships.
#
# Overnight rule 6, and playbook B13: a gate that has not been made red is not a
# gate. Each injection BREAKS THE REAL MECHANISM (not a string in a comment),
# runs the guard, and requires it to go red; then reverts and requires green.
#
# An injection that fails to go red is reported as UNPROVEN — never as a pass.
# B13's corollary is the reason: 38.1's injection passed twice WITH the bug
# reinjected because the harness, not the code, was answering.
#
# Usage: bash scripts/_phase-49-inject-revert.sh
set -uo pipefail
cd "$(dirname "$0")/.."

W=workers/fetch-s1.js
BK=$(mktemp "${TMPDIR:-/tmp}/phase49-injrev.XXXXXXXX")
trap 'cp "$BK" "$W" 2>/dev/null; rm -f "$BK"' EXIT

pass=0; fail=0

# run <test-file> -> 0 green / 1 red
run() { npx vitest run "$1" >/dev/null 2>&1; }

# prove <name> <test-file> <sed-program...>
prove() {
  local name="$1" spec="$2"; shift 2
  cp "$W" "$BK"

  if ! run "$spec"; then
    echo "  UNRUNNABLE  $name — the guard is RED before injection; nothing was proven"
    fail=$((fail+1)); cp "$BK" "$W"; return
  fi

  "$@" || { echo "  UNRUNNABLE  $name — injection command failed"; fail=$((fail+1)); cp "$BK" "$W"; return; }

  if cmp -s "$BK" "$W"; then
    echo "  UNPROVEN    $name — the injection changed NOTHING; the pattern did not match"
    fail=$((fail+1)); cp "$BK" "$W"; return
  fi

  if run "$spec"; then
    echo "  UNPROVEN    $name — guard stayed GREEN with the defect reinjected"
    fail=$((fail+1)); cp "$BK" "$W"; return
  fi

  cp "$BK" "$W"
  if ! run "$spec"; then
    echo "  UNPROVEN    $name — guard did not return to green after revert"
    fail=$((fail+1)); return
  fi
  echo "  PROVEN      $name — red on injection, green on revert"
  pass=$((pass+1))
}

echo "Phase 49 · class guards, proven failable by injection"
echo

# ── Item 2 · the solver may not return its own bound ─────────────────────────
prove "item 2 · bracket escape returns null" \
  workers/__tests__/numericsAudit.test.ts \
  perl -0pi -e 's/if \(brackets\.length === 0\) \{/if (false) {/' "$W"

prove "item 2 · multi-root streams are refused" \
  workers/__tests__/numericsAudit.test.ts \
  perl -0pi -e 's/if \(brackets\.length > 1\) \{/if (brackets.length > 99) {/' "$W"

prove "item 2 · irr_status never calls a failed solve uneconomic" \
  workers/__tests__/numericsAudit.test.ts \
  perl -0pi -e "s/  if \(solve\.value === null\) return solve\.reason;/  if (solve.value === null) return 'uneconomic';/" "$W"

prove "item 2 · no bare bisection may exist outside solveIRR" \
  workers/__tests__/solverBounds.test.ts \
  perl -0pi -e 's/function cashTaxFor\(/function _injectedSolver(f) { let lo = 0, hi = 1; for (let i = 0; i < 9; i++) { const mid = (lo + hi) \/ 2; if (f(mid) > 0) lo = mid; else hi = mid; } return lo; }\nfunction cashTaxFor(/' "$W"

echo
echo "$pass proven · $fail unproven"
[ "$fail" -eq 0 ]
