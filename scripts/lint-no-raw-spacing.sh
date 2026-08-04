#!/usr/bin/env bash
# Phase 7.7g-a-2 — value-aware spacing gate (shorthand single-prop).
# Phase 7.7g-a-3 — extended to per-side variants (paddingLeft/marginInline/etc.).
#
# Forbids raw px in padding/margin/gap (and their per-side variants) when the
# value matches the canonical 8-value scale (4/8/16/24/32/48/64/96). Off-scale
# values + shorthand 2+-value strings are not gated; tracked as a Phase
# 7.7g-a-3 sub-item for explicit per-side migration.
#
# Covered properties:
#   padding, paddingLeft, paddingRight, paddingTop, paddingBottom,
#   paddingInline, paddingBlock, paddingInlineStart/End, paddingBlockStart/End,
#   margin (all the same suffixes),
#   gap, rowGap, columnGap.
#
# Exits 0 if no matches; non-zero (with output) if regressions found.

set -e

# Match e.g. `padding: '8px'`, `paddingLeft: 16`, `marginInline: '4px'`.
# Value must be on-scale; terminator must be quote / comma / brace / EOL.
PATTERN='(^|[^a-zA-Z])(padding[A-Z]?[a-zA-Z]*|margin[A-Z]?[a-zA-Z]*|gap|rowGap|columnGap)[[:space:]]*:[[:space:]]*(['"'"'"])?(4|8|16|24|32|48|64|96)(px)?\3?([[:space:]]*[,;}])'

# Discover candidate files; exclude __tests__ and app/dev/.
TARGETS=$(
  {
    if [ -d app/components ]; then
      find app/components -type f \( -name '*.tsx' -o -name '*.ts' \) \
        -not -path '*/__tests__/*' \
        -not -path '*/dev/*'
    fi
    if [ -d app/lib ]; then
      find app/lib -type f \( -name '*.tsx' -o -name '*.ts' \) \
        -not -path '*/__tests__/*' \
        -not -path '*/dev/*'
    fi
    [ -f app/page.tsx ] && echo app/page.tsx
    [ -f app/methodology/page.tsx ] && echo app/methodology/page.tsx
    [ -f app/layout.tsx ] && echo app/layout.tsx
    if [ -d app/intel ]; then
      find app/intel -type f \( -name '*.tsx' -o -name '*.ts' \) -not -path '*/__tests__/*'
    fi
    if [ -d app/regulatory ]; then
      find app/regulatory -type f \( -name '*.tsx' -o -name '*.ts' \) -not -path '*/__tests__/*'
    fi
  }
)

# ── Phase 51 / B15 ───────────────────────────────────────────────────────────
#
# Two ways this gate used to report clean without having looked:
#
#   1. `[ -z "$TARGETS" ] && exit 0` — an empty file list is "no violations
#      found", which is true and useless. If the tree this gate exists to guard
#      has vanished, that is UNRUNNABLE, not clean.
#   2. `xargs grep … 2>/dev/null || true` — every error, including grep's exit 2
#      and xargs' own failures, became an empty HITS and therefore a pass.
#
# Plus no positive control: nothing on any run showed the pattern could match a
# violation that was really there.
. "$(dirname "$0")/lib/scan.sh"

if [ -z "$TARGETS" ]; then
  echo "GATE UNRUNNABLE — no files matched this gate's scope. It guarded nothing."
  echo "Refusing to report a pass from a check that did not execute (B14/B15)."
  exit 2
fi

# The control: a file carrying a violation the PATTERN must match, proven on
# this run against this pattern, before any clean result is believed.
CTL=$(mktemp "${TMPDIR:-/tmp}/spacingctl.XXXXXXXX.tsx")
printf 'const x = <div style={{ padding: 16 }} />;\n' > "$CTL"
if ! grep -a -EnH "$PATTERN" "$CTL" >/dev/null 2>&1; then
  rm -f "$CTL"
  echo "GATE INVALID — the positive control did not match the gate's own pattern."
  echo "The pattern has drifted and this gate is no longer looking for anything."
  exit 2
fi
rm -f "$CTL"

# `xargs` reports 123 for "a command exited non-zero", which for grep is the
# ordinary no-match case — so its exit status cannot separate error from clean.
# grep's ERRORS go to stderr, and that can. Captured rather than discarded,
# which is what `2>/dev/null` was doing.
SPACING_ERR=$(mktemp "${TMPDIR:-/tmp}/spacingerr.XXXXXXXX")
set +e
HITS=$(echo "$TARGETS" | xargs grep -a -EnH "$PATTERN" 2>"$SPACING_ERR")
set -e
if [ -s "$SPACING_ERR" ]; then
  echo "GATE UNRUNNABLE — the scan wrote to stderr, so it did not complete cleanly:"
  head -5 "$SPACING_ERR" | sed 's/^/    /'
  rm -f "$SPACING_ERR"
  exit 2
fi
rm -f "$SPACING_ERR"

if [ -n "$HITS" ]; then
  echo "lint:no-raw-spacing — raw on-scale px in padding/margin/gap (incl. per-side variants); use var(--space-*)"
  echo "$HITS"
  exit 1
fi

exit 0
