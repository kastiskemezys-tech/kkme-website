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

# ── Phase 51: the gate scans BYTES, so it must not be read as characters ──────
#
# Found 2026-08-04 when the gate reported INVALID: its own positive control
# stopped matching a 12.4 MB corpus that demonstrably contained the sentinel
# (`LC_ALL=C grep -c` found it; plain `grep -qiF` did not). The corpus
# concatenates every untracked file, and one of them carries a byte sequence that
# is not valid UTF-8. BSD grep under a UTF-8 locale aborts on such input with
# "Illegal byte sequence" and returns non-zero — indistinguishable, to an `if !
# grep`, from "no match".
#
# So a single stray byte anywhere in the tree could have made every needle scan
# return "clean". The 38.8 note above describes the previous version losing a
# match in a 12 MB shell variable; this is the same class one layer down, and it
# was caught only because the positive control is checked FIRST and refuses to
# report a pass it cannot earn.
#
# C forces byte semantics: no multibyte decoding, so no input can abort the scan.
# Documented consequence: `-i` then case-folds ASCII only. Every needle is a name
# or a figure, and a non-ASCII needle would need exact-case matching anyway.
export LC_ALL=C
export LANG=C

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
# NON-OPTIONAL. This gate's negative result is only believable if a string known
# to be present can be found. Run BEFORE the needles, and distinguish "did not
# match" from "could not run" — B15 is exactly the case where those differ.
grep -a -qiF -- "$CONTROL" "$CORPUS"
CONTROL_RC=$?
case "$CONTROL_RC" in
  0) ;;  # the scan can find what is there — proceed
  1) echo "NDA GATE INVALID — the positive control did not match its own corpus."; exit 2;;
  *) echo "NDA GATE UNRUNNABLE — the positive control's grep exited $CONTROL_RC (an error, not a result)."; exit 2;;
esac
grep -a -vF -- "$CONTROL" "$CORPUS" > "$CORPUS.clean" && mv "$CORPUS.clean" "$CORPUS"

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
# ── B15: grep's ERROR is not grep's ANSWER ───────────────────────────────────
#
# `grep` has three exit codes and this gate only ever read two of them:
#
#   0  found          1  not found          2  ERROR
#
# `if ! grep …` collapses 1 and 2 into "no match", so a scan that could not run
# reported the same thing as a scan that ran and found nothing clean. That is how
# a single invalid-UTF-8 byte turned the whole disclosure gate into a no-op.
#
# Every scan now goes through this wrapper, which returns those three states
# distinctly. `-a` forces text handling so binary content is scanned rather than
# skipped with "Binary file matches" — a needle inside a binary blob is still a
# disclosure. Exit 2 propagates to UNRUNNABLE at the call site, never to a pass.
scan() {
  grep -a "$@" "$CORPUS"
  local rc=$?
  case "$rc" in
    0|1) return "$rc";;
    *)
      echo "NDA GATE UNRUNNABLE — grep exited $rc (an ERROR, not a result) while scanning the corpus." >&2
      echo "Refusing to report a pass from a check that did not execute (B14/B15)." >&2
      exit 2;;
  esac
}

matches() {
  local needle="$1"
  case "$needle" in
    *[0-9]*)
      case "$needle" in
        # Mixed alphanumeric needles (a figure carrying a unit or a percent
        # sign) stay substring-matched: they cannot collide with a longer number.
        *[A-Za-z%]*) scan -qiF -- "$needle"; return $?;;
      esac
      local esc
      esc=$(printf '%s' "$needle" | sed 's/[.[\*^$()+?{|]/\\&/g')
      scan -qiE -- "(^|[^0-9.])${esc}([^0-9]|$)"; return $?;;
    *) scan -qiF -- "$needle"; return $?;;
  esac
}

FOUND=0
N=0
while IFS= read -r needle; do
  case "$needle" in ''|'#'*) continue;; esac
  N=$((N+1))
  if matches "$needle"; then
    echo "NDA GATE FAIL — forbidden string present (needle #$N, redacted). Context:"
    # Context only — `matches` has already decided. `-a` for the same reason,
    # and a failure here must not mask a FAIL that was already established.
    grep -a -inE -- "$(printf '%s' "$needle" | sed 's/[.[\*^$()+?{|]/\\&/g')" "$CORPUS" \
      | head -3 | cut -c1-160 | sed 's/^/    /' || true
    FOUND=$((FOUND+1))
  fi
done < "$NEEDLES"

if [ "$FOUND" -gt 0 ]; then
  echo "NDA GATE: $FOUND forbidden string(s) found across ${BYTES} bytes. Nothing may be committed."
  exit 1
fi
echo "NDA GATE PASS — $N needles, ${BYTES} bytes scanned (${UNTRACKED} untracked files + diff vs ${BASE}), positive control fired."
