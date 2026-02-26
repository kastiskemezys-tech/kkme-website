import type { CSSProperties } from 'react';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };
const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;

interface CardFooterProps {
  period:  string;  // e.g. "Daily average · 7-day window"
  compare: string;  // e.g. "Baseline: CH S1 2025 central"
  updated: string;  // e.g. "ENTSO-E · 06:00 UTC"
}

export function CardFooter({ period, compare, updated }: CardFooterProps) {
  return (
    <p style={{
      ...MONO,
      fontSize: '0.52rem',
      color: text(0.38),
      letterSpacing: '0.06em',
      lineHeight: 1.5,
      marginTop: '0.75rem',
    }}>
      {period} · {compare} · {updated}
    </p>
  );
}
