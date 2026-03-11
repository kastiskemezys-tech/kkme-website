'use client';

import type { Sentiment } from '@/app/lib/types';
import { sentimentColor } from '@/app/lib/types';

interface StatusChipProps {
  status: string
  sentiment?: Sentiment
}

export function StatusChip({ status, sentiment = 'neutral' }: StatusChipProps) {
  const color = sentimentColor(sentiment);

  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-xs)',
      color,
      border: `1px solid color-mix(in srgb, ${color} 15%, transparent)`,
      background: `color-mix(in srgb, ${color} 5%, transparent)`,
      padding: '2px 8px',
      letterSpacing: '0.04em',
      lineHeight: 1.4,
    }}>
      {status}
    </span>
  );
}
