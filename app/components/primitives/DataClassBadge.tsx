'use client';

import type { DataClass } from '@/app/lib/types';

interface DataClassBadgeProps {
  dataClass: DataClass
}

const STYLES: Record<string, { color: string; border: string; label: string; bg?: string; borderStyle?: string }> = {
  observed:           { color: '#fff',               border: 'var(--teal)',          label: 'observed',     bg: 'var(--teal)' },
  derived:            { color: 'var(--teal)',         border: 'var(--teal)',          label: 'derived' },
  proxy:              { color: 'var(--amber)',        border: 'var(--amber)',         label: 'proxy \u26A0', bg: 'var(--amber-bg)' },
  modeled:            { color: 'var(--text-muted)',   border: 'var(--border-highlight)', label: 'modeled',  borderStyle: 'dashed' },
  reference:          { color: 'var(--text-muted)',   border: 'var(--border-card)',   label: 'reference' },
  reference_estimate: { color: 'var(--text-muted)',   border: 'var(--border-card)',   label: 'ref estimate', bg: 'var(--bg-elevated)' },
  editorial:          { color: 'var(--text-muted)',   border: 'var(--border-card)',   label: 'editorial' },
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
      opacity: s.bg === 'var(--teal)' ? 1 : 0.8,
      marginLeft: 6,
    }}>
      {s.label}
    </span>
  );
}
