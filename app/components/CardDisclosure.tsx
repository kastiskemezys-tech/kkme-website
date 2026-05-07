'use client';

import { useState } from 'react';

interface CardDisclosureProps {
  explain:   string[];
  dataLines: string[];
}

export function CardDisclosure({ explain, dataLines }: CardDisclosureProps) {
  const [open, setOpen] = useState<'explain' | 'data' | null>(null);

  const toggle = (p: 'explain' | 'data') =>
    setOpen(o => (o === p ? null : p));

  const btnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-mono-xs)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    background: 'transparent',
    border: `1px solid ${active ? 'var(--violet)' : 'var(--border-card)'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    paddingTop: '2px', paddingRight: 'var(--space-xs)', paddingBottom: '2px', paddingLeft: 'var(--space-xs)',
    cursor: 'pointer',
    borderRadius: '2px',
  });

  const lines = open === 'explain' ? explain : dataLines;

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button className="card-action-btn" style={btnStyle(open === 'explain')} onClick={() => toggle('explain')}>
          Explain
        </button>
        <button className="card-action-btn" style={btnStyle(open === 'data')} onClick={() => toggle('data')}>
          Data
        </button>
      </div>

      {open && (
        <div style={{
          marginTop: 'var(--space-xs)',
          paddingLeft: '10px',
          borderLeft: '1px solid var(--border-subtle)',
        }}>
          {lines.map((line, i) => (
            <div key={i} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--type-mono-xs)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.6,
              marginBottom: '2px',
            }}>
              · {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
