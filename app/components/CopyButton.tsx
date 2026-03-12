'use client';

import { useState, useCallback } from 'react';
import { copyToClipboard } from '@/app/lib/copyUtils';

type CopyState = 'idle' | 'copied' | 'failed';

interface CopyButtonProps {
  /** The exact visible value string to copy */
  value: string;
  /** Optional label for aria — defaults to "Copy value" */
  label?: string;
  /** Variant: 'icon' shows clipboard icon only, 'text' shows "Copy table" */
  variant?: 'icon' | 'text';
}

const ICON_CLIPBOARD = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="6" height="3" rx="0.5" />
    <path d="M5 3H3.5A1.5 1.5 0 002 4.5v9A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0012.5 3H11" />
  </svg>
);

const ICON_CHECK = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 8 7 12 13 4" />
  </svg>
);

const ICON_X = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </svg>
);

export function CopyButton({ value, label, variant = 'icon' }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 1500);
  }, [value]);

  const color = state === 'copied'
    ? 'var(--teal)'
    : state === 'failed'
    ? 'var(--rose)'
    : undefined; // inherit from hover styles

  const feedbackText = state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : null;

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label ?? 'Copy table'}
        style={{
          all: 'unset',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: color ?? 'var(--text-muted)',
          cursor: 'pointer',
          padding: '4px 8px',
          transition: 'color 150ms ease',
          minWidth: '44px',
          minHeight: '28px',
        }}
        onMouseEnter={e => { if (state === 'idle') e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        onMouseLeave={e => { if (state === 'idle') e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        {state === 'idle' ? ICON_CLIPBOARD : state === 'copied' ? ICON_CHECK : ICON_X}
        <span>{feedbackText ?? 'Copy table'}</span>
      </button>
    );
  }

  // icon variant — minimal, appears next to KPI values
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label ?? 'Copy value'}
      style={{
        all: 'unset',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color ?? 'var(--text-muted)',
        cursor: 'pointer',
        padding: '6px',
        transition: 'color 150ms ease',
        minWidth: '32px',
        minHeight: '32px',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (state === 'idle') e.currentTarget.style.color = 'var(--text-tertiary)'; }}
      onMouseLeave={e => { if (state === 'idle') e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {state === 'idle' ? ICON_CLIPBOARD : state === 'copied' ? ICON_CHECK : ICON_X}
    </button>
  );
}
