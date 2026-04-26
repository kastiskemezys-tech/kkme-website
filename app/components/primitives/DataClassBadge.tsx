'use client';

import type { DataClass } from '@/app/lib/types';

interface DataClassBadgeProps {
  dataClass: DataClass
}

// Colors map to P1 semantic palette — data state, not opinion:
//   observed   = mint (filled)        — confirmed reading from a primary feed
//   derived    = mint (outline)       — computed from observed inputs
//   modeled    = lavender (dashed)    — model output (M in the O/D/F/M alphabet)
//   proxy      = amber (filled bg)    — substitute series; ⚠ surfaced
//   reference  = ink-subtle           — bibliographic / editorial reference
//   reference_estimate = ink-subtle (bg) — soft ref estimate, not a measurement
//   editorial  = ink-subtle           — opinion / commentary
//
// Note: the DataClass type does not include `forecast` today — the 'F' position
// of the O/D/F/M alphabet is covered by the dedicated `<VintageGlyphRow>` atom
// (8.3b.3) which uses its own narrower Vintage union.
const STYLES: Record<string, { color: string; border: string; label: string; bg?: string; borderStyle?: string }> = {
  observed:           { color: 'var(--white)',        border: 'var(--mint)',             label: 'observed',     bg: 'var(--mint)' },
  derived:            { color: 'var(--mint)',         border: 'var(--mint)',             label: 'derived' },
  proxy:              { color: 'var(--amber)',        border: 'var(--amber)',            label: 'proxy ⚠',      bg: 'var(--amber-bg)' },
  modeled:            { color: 'var(--lavender)',     border: 'var(--lavender)',         label: 'modeled',      borderStyle: 'dashed' },
  reference:          { color: 'var(--ink-subtle)',   border: 'var(--border-card)',      label: 'reference' },
  reference_estimate: { color: 'var(--ink-subtle)',   border: 'var(--border-card)',      label: 'ref estimate', bg: 'var(--bg-elevated)' },
  editorial:          { color: 'var(--ink-subtle)',   border: 'var(--border-card)',      label: 'editorial' },
};

export function DataClassBadge({ dataClass }: DataClassBadgeProps) {
  const s = STYLES[dataClass] || STYLES.derived;
  return (
    <span style={{
      fontSize: '0.6rem',
      fontFamily: 'var(--font-mono)',
      color: s.color,
      border: `1px ${s.borderStyle ?? 'solid'} ${s.border}`,
      backgroundColor: s.bg ?? 'transparent',
      padding: '1px 6px',
      borderRadius: 2,
      whiteSpace: 'nowrap',
      opacity: s.bg === 'var(--mint)' ? 1 : 0.85,
      marginLeft: 6,
    }}>
      {s.label}
    </span>
  );
}
