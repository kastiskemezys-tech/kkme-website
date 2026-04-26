/**
 * Supply/Demand ratio display utilities.
 * Replaces categorical SCARCITY/COMPRESS/MATURE labels with
 * continuous descriptions that honestly reflect the data.
 *
 * S/D formula (mirrors workers/fetch-s1.js processFleet):
 *   S/D = baltic_weighted_mw / eff_demand_mw
 *   baltic_weighted_mw = Σ_country Σ_BESS-entries (mw × STATUS_WEIGHT[status])
 *
 * Pumped hydro and tso_bess are EXCLUDED from the weighted sum because
 * Kruonis-class assets are DRR-suppressed for FCR/aFRR until 2028-02 and
 * would inflate the merchant supply curve.
 *
 * The user-visible "operational 822 + pipeline 1083" counts are NOT the
 * numerator — they're raw flex fleet sums. The numerator is the
 * credibility-weighted figure (operational at 1.0, under_construction at
 * 0.9, connection_agreement at 0.6, application at 0.3, announced at 0.1).
 */

import type { Sentiment } from '@/app/lib/types';

export const SD_STATUS_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  operational: 1.0,
  commissioned: 1.0,
  under_construction: 0.9,
  connection_agreement: 0.6,
  application: 0.3,
  announced: 0.1,
});
export const SD_DEFAULT_WEIGHT = 0.1;

export interface SdEntry {
  mw: number;
  status: string;
  type?: string;
}

const NON_COMMERCIAL_TYPES = new Set(['pumped_hydro', 'tso_bess']);

/** Sum credibility-weighted commercial-BESS MW per worker convention. */
export function weightedSupplyMw(entries: ReadonlyArray<SdEntry>): number {
  let sum = 0;
  for (const e of entries) {
    if (e.type && NON_COMMERCIAL_TYPES.has(e.type)) continue;
    const w = SD_STATUS_WEIGHT[e.status] ?? SD_DEFAULT_WEIGHT;
    sum += e.mw * w;
  }
  return sum;
}

/** S/D = weighted supply / effective demand. Returns null if demand <= 0. */
export function sdRatio(weightedMw: number, effDemandMw: number): number | null {
  if (!Number.isFinite(weightedMw) || !Number.isFinite(effDemandMw) || effDemandMw <= 0) return null;
  return Math.round((weightedMw / effDemandMw) * 100) / 100;
}

/** Compose a one-line caption that surfaces the formula AND its inputs. */
export function sdFormulaCaption(weightedMw: number, effDemandMw: number): string {
  const r = sdRatio(weightedMw, effDemandMw);
  const w = Math.round(weightedMw);
  const d = Math.round(effDemandMw);
  return `S/D = weighted supply / effective demand · ${w} MW / ${d} MW = ${r != null ? r.toFixed(2) : '—'}×`;
}

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
