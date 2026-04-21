'use client';

import {
  useState, useEffect, useRef, forwardRef, useImperativeHandle,
  type ReactNode, type ForwardedRef,
} from 'react';
import { createPortal } from 'react-dom';

export interface DrawerHandle {
  open: (anchor?: string) => void;
  close: () => void;
  toggle: () => void;
}

interface DetailsDrawerProps {
  label?: string
  defaultOpen?: boolean
  children: ReactNode
  /** When set, drawer content renders into a portal target element with this ID */
  portalId?: string
}

export const DetailsDrawer = forwardRef(function DetailsDrawer(
  { label = 'Details', defaultOpen = false, children, portalId }: DetailsDrawerProps,
  ref: ForwardedRef<DrawerHandle>,
) {
  const [open, setOpen] = useState(defaultOpen);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const prevOpen = useRef(defaultOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    open: (anchor) => {
      if (anchor) setPendingAnchor(anchor);
      setOpen(true);
    },
    close: () => setOpen(false),
    toggle: () => setOpen((o) => !o),
  }), []);

  // Find portal target — re-check periodically since SignalDrawerPanel renders lazily
  useEffect(() => {
    if (!portalId) return;
    const find = () => {
      const el = document.getElementById(portalId);
      if (el) setPortalTarget(el);
      return !!el;
    };
    if (find()) return;
    const iv = setInterval(() => { if (find()) clearInterval(iv); }, 100);
    return () => clearInterval(iv);
  }, [portalId, open]);

  // Listen for tab-click requests to auto-open this drawer (kept for SignalDrawerPanel)
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
    if (open === prevOpen.current) return;
    prevOpen.current = open;

    const signal = portalId.includes('s1') ? 's1' : 's2';
    window.dispatchEvent(new CustomEvent('signal-drawer', {
      detail: { signal, action: open ? 'open' : 'close' },
    }));
  }, [open, portalId]);

  // Scroll pending anchor into view after transition settles
  useEffect(() => {
    if (!open || !pendingAnchor) return;
    const timeout = window.setTimeout(() => {
      const host = containerRef.current;
      if (!host) { setPendingAnchor(null); return; }
      const el = host.querySelector<HTMLElement>(`[data-anchor="${pendingAnchor}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingAnchor(null);
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [open, pendingAnchor]);

  const drawerContent = (
    <div style={{
      overflow: 'hidden',
      maxHeight: open ? '5000px' : '0',
      transition: 'max-height 300ms ease',
    }}>
      <div
        ref={containerRef}
        style={{
          paddingTop: '16px',
          borderTop: portalId ? 'none' : '1px solid var(--border-card)',
          marginTop: portalId ? '0' : '8px',
        }}
      >
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
});

interface DrawerSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function DrawerSection({ id, title, children }: DrawerSectionProps) {
  return (
    <section
      data-anchor={id}
      style={{
        marginBottom: '20px',
        scrollMarginTop: '8px',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {title}
      </div>
      {children}
    </section>
  );
}
