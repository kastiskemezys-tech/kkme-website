'use client';

import type { ImpactState } from '@/app/lib/types';
import { impactToSentiment, sentimentColor } from '@/app/lib/types';

const IMPACT_LABELS: Record<ImpactState, string> = {
  strong_positive: 'Strong positive',
  slight_positive: 'Slight positive',
  mixed: 'Mixed',
  slight_negative: 'Slight negative',
  strong_negative: 'Strong negative',
  low_confidence: 'Low confidence',
};

interface ImpactLineProps {
  impact: ImpactState
  description?: string
  twoH?: string
  fourH?: string
}

export function ImpactLine({ impact, description, twoH, fourH }: ImpactLineProps) {
  const sentiment = impactToSentiment(impact);
  const color = sentimentColor(sentiment);
  const label = IMPACT_LABELS[impact];

  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-sm)',
      color: 'var(--text-tertiary)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      alignItems: 'baseline',
    }}>
      <span>Reference asset impact:</span>
      <span style={{ color }}>{description || label}</span>
      {twoH && fourH && (
        <span style={{ color: 'var(--text-muted)' }}>
          · 2H: {twoH} · 4H: {fourH}
        </span>
      )}
    </div>
  );
}
