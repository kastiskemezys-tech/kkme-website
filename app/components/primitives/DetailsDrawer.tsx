'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
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
  const prevOpen = useRef(defaultOpen);

  // Find portal target — re-check periodically since SignalDrawerPanel renders lazily
  useEffect(() => {
    if (!portalId) return;
    const find = () => {
      const el = document.getElementById(portalId);
      if (el) setPortalTarget(el);
      return !!el;
    };
    if (find()) return;
    // Poll briefly for lazy-rendered portal targets
    const iv = setInterval(() => { if (find()) clearInterval(iv); }, 100);
    return () => clearInterval(iv);
  }, [portalId, open]);

  // Listen for tab-click requests to auto-open this drawer
  useEffect(() => {
    if (!portalId) return;
    const signal = portalId.includes('s1') ? 's1' : 's2';
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.signal === signal) {
        if (detail.action === 'close') {
          setOpen(false);
        } else if (!open) {
          setOpen(true);
        }
      }
    };
    window.addEventListener('signal-drawer-request', handler);
    return () => window.removeEventListener('signal-drawer-request', handler);
  }, [portalId, open]);

  // Dispatch signal-drawer events for the tabbed panel
  useEffect(() => {
    if (!portalId) return;
    // Only dispatch on actual state changes, not initial mount
    if (open === prevOpen.current) return;
    prevOpen.current = open;

    const signal = portalId.includes('s1') ? 's1' : 's2';
    window.dispatchEvent(new CustomEvent('signal-drawer', {
      detail: { signal, action: open ? 'open' : 'close' },
    }));
  }, [open, portalId]);

  const drawerContent = (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? '5000px' : '0',
      transition: 'max-height 300ms ease',
    }}>
      <div style={{
        paddingTop: '16px',
        borderTop: portalId ? 'none' : '1px solid var(--border-card)',
        marginTop: portalId ? '0' : '8px',
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
