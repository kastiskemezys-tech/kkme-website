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
        background:   'rgba(255,180,0,0.06)',
        borderLeft:   '2px solid rgba(255,180,0,0.3)',
        padding:      '0.4rem 0.6rem',
        marginBottom: '1.25rem',
        fontSize:     '0.5rem',
        color:        'rgba(255,180,0,0.7)',
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
        fontSize:    '0.5rem',
        color:       'rgba(255,180,0,0.6)',
        marginLeft:  '0.4rem',
      }}>
        · ⟳ {Math.round(ageHours)}h old
      </span>
    );
  }

  return null;
}
