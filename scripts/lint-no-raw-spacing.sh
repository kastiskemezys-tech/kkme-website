#!/usr/bin/env bash
# Phase 7.7g-a-2 — value-aware spacing gate.
#
# Forbids raw px in single-prop padding/margin/gap when the value matches
# the canonical 8-value scale (4/8/16/24/32/48/64/96). Off-scale values +
# shorthand strings are not gated; they're tracked as a backlog item for
# Phase 7.7g-a-3.
#
# Per-side variants (paddingTop / marginBottom / etc.) are migrated but not
# gated by this script — a lighter-touch follow-up could extend the regex.
#
# Exits 0 if no matches; non-zero (with output) if regressions found.

set -e

# Match e.g. `padding: '8px'`, `margin: 16`, `gap: '4px'` — single-prop only,
# value must be on-scale, terminator must be quote / comma / brace / EOL.
PATTERN='(^|[^a-zA-Z])(padding|margin|gap)[[:space:]]*:[[:space:]]*([\x27"])?(4|8|16|24|32|48|64|96)(px)?\3?([[:space:]]*[,;}])'

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
  }
)

if [ -z "$TARGETS" ]; then
  exit 0
fi

HITS=$(echo "$TARGETS" | xargs grep -EnH "$PATTERN" 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "lint:no-raw-spacing — raw on-scale px in component padding/margin/gap (use var(--space-*))"
  echo "$HITS"
  exit 1
fi

exit 0
