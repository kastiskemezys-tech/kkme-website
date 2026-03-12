import type { CSSProperties } from 'react';
import { FreshnessDot } from './FreshnessDot';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

interface CardFooterProps {
  period:     string;
  compare:    string;
  updated:    string;
  timestamp?: string | null;
  isStale?:   boolean;
  ageHours?:  number | null;
}

export function CardFooter({ period, compare, updated, timestamp, isStale, ageHours }: CardFooterProps) {
  return (
    <div style={{
      ...MONO,
      fontSize: '0.65rem',
      color: 'var(--text-tertiary)',
      marginTop: '14px',
      paddingTop: '8px',
      borderTop: '1px solid var(--border-subtle)',
      lineHeight: 1.6,
    }}>
      <span>{period}</span>
      <span style={{ margin: '0 5px', opacity: 0.35 }}>·</span>
      <span>{compare}</span>
      <span style={{ margin: '0 5px', opacity: 0.35 }}>·</span>
      <span style={{ color: isStale ? 'var(--amber)' : 'var(--text-muted)' }}>
        <FreshnessDot timestamp={timestamp} />
        {updated}
        {isStale && ageHours != null ? ` · ${Math.round(ageHours)}h old` : ''}
      </span>
    </div>
  );
}
