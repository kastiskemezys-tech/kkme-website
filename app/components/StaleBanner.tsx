import type { CSSProperties } from 'react';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

interface StaleBannerProps {
  isDefault:     boolean;
  isStale:       boolean;
  ageHours:      number | null;
  defaultReason: string | null;
}

/**
 * Shown in a card when live data is unavailable (default values) or stale.
 * Default: amber block banner above content.
 * Stale-only: inline amber suffix next to the timestamp.
 */
export function StaleBanner({ isDefault, isStale, ageHours, defaultReason }: StaleBannerProps) {
  if (isDefault) {
    return (
      <div style={{
        ...MONO,
        background:   'var(--stale-bg)',
        borderLeft:   '2px solid var(--stale-border)',
        paddingTop: '0.4rem', paddingRight: '0.6rem', paddingBottom: '0.4rem', paddingLeft: '0.6rem',
        marginBottom: '1.25rem',
        fontSize: 'var(--type-mono-xs)',
        color:        'var(--stale-text)',
        lineHeight:    1.5,
      }}>
        ⟳ Live data unavailable · showing last known values
        {defaultReason ? ` · ${defaultReason}` : ''}
      </div>
    );
  }

  if (isStale && ageHours !== null) {
    return (
      <span style={{
        ...MONO,
        fontSize: 'var(--type-mono-xs)',
        color:       'var(--stale-text-soft)',
        marginLeft:  '0.4rem',
      }}>
        · ⟳ {Math.round(ageHours)}h old
      </span>
    );
  }

  return null;
}
