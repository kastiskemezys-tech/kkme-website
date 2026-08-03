#!/bin/bash
# NDA disclosure gate — Phase 38.8.
#
# Scans everything this branch would publish — the diff against the base, any
# uncommitted change, and every untracked file that is not gitignored — for
# counterparty names, client names, and the exact contracted figures held in the
# private reference. A parameter that reproduces a contracted figure to the
# decimal is a disclosure even with no name attached, so exact figures are
# needles too.
#
# The needle list lives under docs/_private/ (gitignored) and is NEVER
# committed: publishing the list of forbidden strings would publish them.
#
# Design note. The first version of this script concatenated every scanned file
# into one shell variable and grepped that. It passed on an injected
# counterparty name in an untracked file — the variable reached ~12 MB and the
# match was lost. The check was unfailable on exactly the path it existed to
# guard. It now writes the corpus to a file and greps the file, and BOTH
# injection paths are proven to go red (B13: prove a gate by breaking the real
# mechanism, not by reading its source).
#
# Usage:  bash scripts/nda-gate.sh [<base-ref>]
set -uo pipefail
BASE="${1:-main}"
NEEDLES="docs/_private/commercial/_nda-gate-needles.txt"

if [ ! -f "$NEEDLES" ]; then
  echo "NDA GATE CANNOT RUN — needle list not found at $NEEDLES"
  echo "Refusing to report a pass from a check that did not execute."
  exit 2
fi

CORPUS=$(mktemp -t ndagate)
trap 'rm -f "$CORPUS"' EXIT

{
  git diff "$BASE"...HEAD 2>/dev/null | grep '^+'
  git diff HEAD 2>/dev/null | grep '^+'
  git diff --cached 2>/dev/null | grep '^+'
} >> "$CORPUS"

UNTRACKED=0
while IFS= read -r f; do
  case "$f" in docs/_private/*) continue;; esac
  [ -f "$f" ] || continue
  { echo "### FILE: $f"; cat "$f"; } >> "$CORPUS" 2>/dev/null
  UNTRACKED=$((UNTRACKED+1))
done < <(git ls-files --others --exclude-standard)

BYTES=$(wc -c < "$CORPUS" | tr -d ' ')

# Positive control FIRST, against the real corpus mechanism: append a sentinel,
# confirm the scan finds it, remove it. A gate that cannot be shown to fire on
# this run is not evidence about this run (B11).
CONTROL="__NDA_GATE_SELFTEST_SENTINEL__"
echo "$CONTROL" >> "$CORPUS"
if ! grep -qiF -- "$CONTROL" "$CORPUS"; then
  echo "NDA GATE INVALID — the positive control did not match its own corpus."
  exit 2
fi
grep -vF -- "$CONTROL" "$CORPUS" > "$CORPUS.clean" && mv "$CORPUS.clean" "$CORPUS"

# Numeric needles are matched at NUMBER boundaries, not as substrings.
#
# One of the numeric needles is a decimal fraction, and one of our own measured
# outputs happens to extend it by a digit. A plain substring match flags that
# output as a disclosure, which it is not. Name needles stay substring-matched,
# because a name appearing inside longer text IS the disclosure.
#
# The needle is NOT weakened to achieve this: an exact occurrence still matches.
# The boundary only stops a LONGER number from matching a SHORTER needle.
#
# (This comment deliberately describes the collision without reproducing either
# figure. The gate caught an earlier draft of it that did — which is the rule
# working: a contracted figure quoted in a comment is still a disclosure.)
matches() {
  local needle="$1"
  case "$needle" in
    *[0-9]*)
      case "$needle" in
        # Mixed alphanumeric needles (a figure carrying a unit or a percent
        # sign) stay substring-matched: they cannot collide with a longer number.
        *[A-Za-z%]*) grep -qiF -- "$needle" "$CORPUS"; return $?;;
      esac
      local esc
      esc=$(printf '%s' "$needle" | sed 's/[.[\*^$()+?{|]/\\&/g')
      grep -qiE -- "(^|[^0-9.])${esc}([^0-9]|$)" "$CORPUS"; return $?;;
    *) grep -qiF -- "$needle" "$CORPUS"; return $?;;
  esac
}

FOUND=0
N=0
while IFS= read -r needle; do
  case "$needle" in ''|'#'*) continue;; esac
  N=$((N+1))
  if matches "$needle"; then
    echo "NDA GATE FAIL — forbidden string present (needle #$N, redacted). Context:"
    grep -inE -- "$(printf '%s' "$needle" | sed 's/[.[\*^$()+?{|]/\\&/g')" "$CORPUS" \
      | head -3 | cut -c1-160 | sed 's/^/    /'
    FOUND=$((FOUND+1))
  fi
done < "$NEEDLES"

if [ "$FOUND" -gt 0 ]; then
  echo "NDA GATE: $FOUND forbidden string(s) found across ${BYTES} bytes. Nothing may be committed."
  exit 1
fi
echo "NDA GATE PASS — $N needles, ${BYTES} bytes scanned (${UNTRACKED} untracked files + diff vs ${BASE}), positive control fired."
