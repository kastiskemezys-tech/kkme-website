'use client';

import { useState, type ReactNode } from 'react';

interface DetailsDrawerProps {
  label?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function DetailsDrawer({ label = 'Details', defaultOpen = false, children }: DetailsDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 200ms ease',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '0.625rem',
        }}>
          ▸
        </span>
        {label}
      </button>

      <div style={{
        overflow: 'hidden',
        maxHeight: open ? '2000px' : '0',
        transition: 'max-height 200ms ease',
      }}>
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid var(--border-card)',
          marginTop: '8px',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
