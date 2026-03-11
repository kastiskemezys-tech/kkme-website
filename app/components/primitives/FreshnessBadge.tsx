'use client';

import type { DataClass, FreshnessClass } from '@/app/lib/types';

interface FreshnessBadgeProps {
  source: string
  updatedAt?: string
  dataClass?: DataClass
  freshnessClass?: FreshnessClass
}

export function FreshnessBadge({ source, updatedAt, dataClass, freshnessClass }: FreshnessBadgeProps) {
  const isStale = freshnessClass === 'stale';
  const isLive = freshnessClass === 'live';

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-xs)',
      color: isStale ? 'var(--amber)' : 'var(--text-muted)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      flexWrap: 'wrap',
    }}>
      {isLive && (
        <span style={{
          display: 'inline-block',
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: 'var(--teal)',
          animation: 'pulse 2s ease-in-out infinite',
          flexShrink: 0,
        }} />
      )}
      <span>Source: {source}</span>
      {updatedAt && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Updated {updatedAt}</span>
        </>
      )}
      {dataClass && dataClass !== 'observed' && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{dataClass}{dataClass === 'proxy' ? ' \u26A0' : ''}</span>
        </>
      )}
      {isStale && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Stale</span>
        </>
      )}
    </span>
  );
}
