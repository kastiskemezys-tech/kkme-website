#!/bin/bash
# Discipline rule #6 — cards must not surface engine-emitted state strings as chips.
#
# Extracted from a package.json one-liner in Phase 51, because that one-liner had
# TWO instances of B15 in a single expression:
#
#     ! grep -rEn "phase: '(TIGHTENING|…)'" app/components --include='*.tsx' | grep -v __tests__
#
#   1. `!` inverts the exit status of the LAST command in the pipeline, which is
#      `grep -v`. If the first grep errored (exit 2 — an unreadable file, a bad
#      locale, invalid UTF-8), `grep -v` received empty input, exited 1, and `!`
#      turned that into SUCCESS. The gate passed because it broke.
#   2. Even without the pipeline, `! grep` cannot tell exit 1 from exit 2.
#
# And it had no positive control, so nothing on any run demonstrated the search
# could find a chip that was actually there.
set -uo pipefail
cd "$(dirname "$0")/.."
. "$(dirname "$0")/lib/scan.sh"

SCOPE="app/components"
STATES="TIGHTENING|WIDENING|STABLE|RISING|FALLING|STEADY|ELEVATED|HIGH|LOW|COMPRESSED|OPEN|CONSTRAINED"

# ── Phase 52: the pattern enforced the LETTER of rule #6, not its intent ──────
#
# It matched only a property literally named `phase`, because that was the shape
# of the chips Phase 12.9.1 removed. Rule #6 is about engine-emitted state
# strings reaching the surface AT ALL, and the tree contains a case the old
# pattern cannot see:
#
#     app/components/S5Card.tsx:153   {data.signal ?? 'OPEN'}
#
# rendered as the card's HERO at --type-display-lg with a glow — not a chip, a
# headline. `data.signal` is worker-emitted (OPEN / TIGHTENING / CONSTRAINED),
# which is exactly what the rule forbids. That file is orphaned dead code today
# (imported nowhere, absent from the build), so nothing is live — but a gate that
# would pass it if it were re-mounted is not enforcing the rule.
#
# Two patterns now: the original property form, and a rendered JSX form
# `{… 'STATE'}` which is how a state string reaches a user without ever being
# assigned to a property called `phase`.
PATTERN="(phase|signal|state|status|regime)[[:space:]]*:[[:space:]]*'($STATES)'|\{[^}]*\?\?[[:space:]]*'($STATES)'[[:space:]]*\}"

[ -d "$SCOPE" ] || { echo "GATE UNRUNNABLE — $SCOPE does not exist."; exit 2; }

# The control runs FIRST and must match, or the clean result below means nothing.
scan_control_tree "$SCOPE"

# Collected rather than piped, so the first grep's exit status is the one read.
HITS=$(scan_grep -rEn --include='*.tsx' -- "$PATTERN" "$SCOPE" || true)
HITS=$(printf '%s\n' "$HITS" | grep -v '__tests__' | grep -v '^$' || true)

if [ -n "$HITS" ]; then
  echo "EDITORIAL CHIP GATE FAIL — engine state strings surfaced as chips (rule #6):"
  printf '%s\n' "$HITS" | sed 's/^/    /'
  exit 1
fi

echo "editorial-chip gate: clean — positive control fired, ${SCOPE} scanned."
