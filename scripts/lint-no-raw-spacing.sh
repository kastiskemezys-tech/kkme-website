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

if [ -z "$TARGETS" ]; then
  exit 0
fi

HITS=$(echo "$TARGETS" | xargs grep -EnH "$PATTERN" 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "lint:no-raw-spacing — raw on-scale px in padding/margin/gap (incl. per-side variants); use var(--space-*)"
  echo "$HITS"
  exit 1
fi

exit 0
