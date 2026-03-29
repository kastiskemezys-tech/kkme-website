'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DetailsDrawerProps {
  label?: string
  defaultOpen?: boolean
  children: ReactNode
  /** When set, drawer content renders into a portal target element with this ID */
  portalId?: string
}

export function DetailsDrawer({ label = 'Details', defaultOpen = false, children, portalId }: DetailsDrawerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (portalId) {
      setPortalTarget(document.getElementById(portalId));
    }
  }, [portalId]);

  const drawerContent = (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? '5000px' : '0',
      transition: 'max-height 300ms ease',
    }}>
      <div style={{
        paddingTop: '16px',
        borderTop: '1px solid var(--border-card)',
        marginTop: '8px',
      }}>
        {children}
      </div>
    </div>
  );

  return (
    <>
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

        {/* Render inline when no portal target */}
        {!portalId && drawerContent}
      </div>

      {/* Render into portal when portalId is set and target exists */}
      {portalId && portalTarget && createPortal(drawerContent, portalTarget)}
    </>
  );
}
