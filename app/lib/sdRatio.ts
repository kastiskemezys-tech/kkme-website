/**
 * Supply/Demand ratio display utilities.
 * Replaces categorical SCARCITY/COMPRESS/MATURE labels with
 * continuous descriptions that honestly reflect the data.
 */

import type { Sentiment } from '@/app/lib/types';

/** Continuous color mapping for S/D ratio */
export function sdColor(sd: number): string {
  if (sd < 0.5) return 'var(--teal)';
  if (sd < 0.8) return 'var(--teal)';
  if (sd < 1.0) return 'var(--amber)';
  if (sd < 1.2) return 'var(--amber)';
  return 'var(--rose)';
}

/** Plain-language label — factual, not categorical */
export function sdLabel(sd: number): string {
  if (sd < 0.5) return 'Significant undersupply';
  if (sd < 0.7) return 'Undersupplied';
  if (sd < 0.9) return 'Tightening';
  if (sd < 1.1) return 'Approaching equilibrium';
  if (sd < 1.3) return 'Supply exceeds demand';
  return 'Oversupplied';
}

/** Map S/D to sentiment for StatusChip / color coding */
export function sdSentiment(sd: number): Sentiment {
  if (sd < 0.7) return 'positive';
  if (sd < 1.0) return 'caution';
  if (sd < 1.2) return 'caution';
  return 'negative';
}

/** One-line description of current S/D state */
export function sdDescription(sd: number): string {
  const pct = Math.round(sd * 100);
  if (sd < 0.5) return `Supply covers ${pct}% of effective demand. Strong scarcity — reserve prices elevated.`;
  if (sd < 0.7) return `Supply covers ${pct}% of demand. Revenue conditions supportive for early entrants.`;
  if (sd < 0.9) return `Supply covers ${pct}% of demand. Revenue tightening as pipeline converts.`;
  if (sd < 1.1) return `Supply covers ${pct}% of demand. Approaching equilibrium — price compression accelerating.`;
  if (sd < 1.3) return `Supply exceeds demand at ${pct}%. Reserve prices under pressure.`;
  return `Supply at ${pct}% of demand. Oversupplied — merchant revenue significantly compressed.`;
}

/** Convert old phase labels to continuous labels (backward compat) */
export function phaseToSdLabel(phase: string | null | undefined, sd?: number | null): string {
  if (sd != null) return sdLabel(sd);
  if (phase === 'SCARCITY') return 'Undersupplied';
  if (phase === 'COMPRESS') return 'Tightening';
  if (phase === 'MATURE') return 'Supply exceeds demand';
  return phase || '—';
}

export function phaseToSdSentiment(phase: string | null | undefined, sd?: number | null): Sentiment {
  if (sd != null) return sdSentiment(sd);
  if (phase === 'SCARCITY') return 'positive';
  if (phase === 'COMPRESS') return 'caution';
  if (phase === 'MATURE') return 'negative';
  return 'neutral';
}
