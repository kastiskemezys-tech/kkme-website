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
    fontSize: '0.5rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    background: 'transparent',
    border: `1px solid ${active ? 'rgba(123,94,167,0.55)' : 'rgba(232,226,217,0.13)'}`,
    color: active ? 'rgba(232,226,217,0.85)' : 'rgba(232,226,217,0.55)',
    padding: '2px 8px',
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
          marginTop: '8px',
          paddingLeft: '10px',
          borderLeft: '1px solid rgba(123,94,167,0.22)',
        }}>
          {lines.map((line, i) => (
            <div key={i} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.52rem',
              color: 'rgba(232,226,217,0.50)',
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
