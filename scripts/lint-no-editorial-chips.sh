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
PATTERN="phase: '(TIGHTENING|WIDENING|STABLE|RISING|FALLING|STEADY|ELEVATED|HIGH|LOW|COMPRESSED|OPEN)'"

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
