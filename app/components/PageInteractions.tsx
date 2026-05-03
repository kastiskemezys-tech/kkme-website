'use client';

import { useEffect, useState } from 'react';
import { KEYBOARD_SHORTCUTS, shortcutByKey } from '@/app/lib/keyboard-shortcuts';

export function PageInteractions() {
  const [scrollPct, setScrollPct] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  // Scroll progress bar
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      setScrollPct(Math.min(pct, 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keyboard navigation — single source of truth in keyboard-shortcuts.ts.
  // Each shortcut scrolls to its section AND triggers a 200ms teal outline
  // flash on the destination header so the reader sees it worked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in form fields, contenteditables, or browser
      // shortcuts (Cmd-S etc.).
      const target = e.target as HTMLElement | null;
      if (target?.matches?.('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (helpOpen && e.key === 'Escape') {
        setHelpOpen(false);
        return;
      }

      const match = shortcutByKey(e.key);
      if (!match) return;
      e.preventDefault();

      if (match.key === '?') {
        setHelpOpen(open => !open);
        return;
      }

      const el = document.getElementById(match.sectionId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flashOutline(el);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  return (
    <>
      <div
        className="scroll-progress"
        style={{ width: `${scrollPct}%` }}
        aria-hidden="true"
      />
      {helpOpen && <ShortcutHelpOverlay onClose={() => setHelpOpen(false)} />}
    </>
  );
}

// 200ms teal outline flash on the destination element. Stacks correctly with
// any existing outline (we save + restore). CSS `outline` doesn't reflow
// layout, so this is safe across any block-level header.
function flashOutline(el: HTMLElement): void {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  el.style.outline = '2px solid var(--teal)';
  el.style.outlineOffset = '4px';
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
  }, 200);
}

// Plain modal-ish overlay listing every shortcut. Esc dismisses; clicking
// the backdrop dismisses. No focus trap — Phase A will replace letter-keyed
// nav with chapter numbers 1-5, so over-investing here would be wasted.
function ShortcutHelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-heavy)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-highlight)',
          borderRadius: '4px',
          padding: '24px 28px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: 'var(--tooltip-shadow)',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '16px',
        }}>
          <h2 id="shortcut-help-title" style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            color: 'var(--text-primary)',
            letterSpacing: '0.04em',
            margin: 0,
            textTransform: 'uppercase',
          }}>Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              padding: '4px 8px',
            }}
          >Esc</button>
        </div>
        <ul style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          {KEYBOARD_SHORTCUTS.map(s => (
            <li key={s.key} style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr',
              gap: '12px',
              alignItems: 'baseline',
            }}>
              <kbd style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-primary)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-card)',
                padding: '2px 8px',
                borderRadius: '2px',
                textAlign: 'center',
              }}>{s.key.toUpperCase()}</kbd>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-secondary)',
              }}>
                <span style={{ color: 'var(--text-primary)' }}>{s.navLabel}</span>
                {' — '}
                {s.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
