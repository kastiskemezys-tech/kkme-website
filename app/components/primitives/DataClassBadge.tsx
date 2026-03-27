'use client';

import type { DataClass } from '@/app/lib/types';

interface DataClassBadgeProps {
  dataClass: DataClass
}

const STYLES: Record<string, { color: string; border: string; label: string }> = {
  observed:  { color: 'var(--teal)',          border: 'var(--teal)',         label: 'observed' },
  derived:   { color: 'var(--text-tertiary)', border: 'var(--border-card)',  label: 'derived' },
  proxy:     { color: 'var(--amber)',         border: 'var(--amber)',        label: 'proxy \u26A0' },
  modeled:   { color: 'var(--text-tertiary)', border: 'var(--border-card)',  label: 'modeled' },
  reference: { color: 'var(--text-muted)',    border: 'var(--border-card)',  label: 'reference' },
  editorial: { color: 'var(--text-muted)',    border: 'var(--border-card)',  label: 'editorial' },
};

export function DataClassBadge({ dataClass }: DataClassBadgeProps) {
  const s = STYLES[dataClass] || STYLES.derived;
  return (
    <span style={{
      fontSize: '0.6rem',
      fontFamily: 'var(--font-mono)',
      color: s.color,
      border: `1px solid ${s.border}`,
      padding: '1px 6px',
      borderRadius: 2,
      whiteSpace: 'nowrap',
      opacity: 0.8,
      marginLeft: 6,
    }}>
      {s.label}
    </span>
  );
}
