import type { CSSProperties } from 'react';
import { FreshnessDot } from './FreshnessDot';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };
const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;

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
      fontSize: '0.5rem',
      color: text(0.35),
      marginTop: '14px',
      paddingTop: '8px',
      borderTop: `1px solid rgba(232,226,217,0.07)`,
      lineHeight: 1.6,
    }}>
      <span>{period}</span>
      <span style={{ margin: '0 5px', opacity: 0.35 }}>·</span>
      <span>{compare}</span>
      <span style={{ margin: '0 5px', opacity: 0.35 }}>·</span>
      <span style={{ color: isStale ? 'rgba(255,180,0,0.55)' : text(0.35) }}>
        <FreshnessDot timestamp={timestamp} />
        {updated}
        {isStale && ageHours != null ? ` · ${Math.round(ageHours)}h old` : ''}
      </span>
    </div>
  );
}
