'use client';

import type { DataClass } from '@/app/lib/types';
import { freshnessLabel } from '@/app/lib/freshness';

interface FreshnessBadgeProps {
  /** Source identifier rendered after the freshness label. */
  source?: string
  /** ISO timestamp / Date / ms — single source of truth, derived through freshness.ts. */
  updatedAt?: string | number | Date | null
  /** Optional data-class chip rendered alongside the freshness label. */
  dataClass?: DataClass
}

export function FreshnessBadge({ source, updatedAt, dataClass }: FreshnessBadgeProps) {
  // Single source of truth — N-7 in upgrade-plan.md. No threshold logic in this
  // component; everything routes through freshnessLabel(). The five labels are
  // LIVE / RECENT / TODAY / STALE / OUTDATED.
  const fresh = freshnessLabel(updatedAt ?? null);
  const labelColor = `var(${fresh.colorToken})`;
  const showLivePulse = fresh.label === 'LIVE';

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
      }}
    >
      <span
        title={fresh.absolute}
        style={{
          color: labelColor,
          letterSpacing: '0.06em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {showLivePulse && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--mint)',
              animation: 'pulse 2s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
        )}
        {fresh.label}
      </span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span title={fresh.absolute}>{fresh.age}</span>
      {source && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{source}</span>
        </>
      )}
      {dataClass && dataClass !== 'observed' && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{dataClass}{dataClass === 'proxy' ? ' ⚠' : ''}</span>
        </>
      )}
    </span>
  );
}
