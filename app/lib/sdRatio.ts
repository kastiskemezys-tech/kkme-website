/**
 * Supply/Demand ratio display utilities.
 * Replaces categorical SCARCITY/COMPRESS/MATURE labels with
 * continuous descriptions that honestly reflect the data.
 *
 * S/D formula (mirrors workers/fetch-s1.js processFleet):
 *   S/D = (baltic_weighted_mw − absorption_mw) / eff_demand_mw
 *   baltic_weighted_mw = Σ_country Σ_BESS-entries (mw × STATUS_WEIGHT[status])
 *   absorption_mw      = MW contracted away to LT services outside the modelled
 *                        products (Phase 36.D; workers/lib/demand-forecast.js)
 *   eff_demand_mw      = the canonical demand module's addressable series for
 *                        the year — NOT a constant, and no longer the 935
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

/**
 * The one S/D disclosure used by every surface (discipline rule #4).
 *
 * Phase 36.D — before this there were THREE renderings of the formula and all
 * three were wrong. SignalBar and the hero map both told the reader
 * `(operational + 0.5 × pipeline) / demand`, which on the live payload works out
 * to 8.99× while the headline beside it displayed 2.55×: a reader who did the
 * arithmetic the tooltip prescribed got a number three and a half times the one
 * shown. S4Card had the right shape but no absorption term, which 36.D
 * introduced.
 *
 * The caption is now derived from the same fields the worker computes the ratio
 * from, so it cannot drift from the number it explains — and if a surface passes
 * an inconsistent set, the check below says so rather than rendering a
 * plausible-looking line.
 */
export interface SdCaptionInputs {
  /** Credibility-weighted commercial-BESS supply, gross. */
  weightedMw: number;
  /** Effective Baltic reserve demand for the year (canonical demand module). */
  effDemandMw: number;
  /** MW contracted away to services outside the modelled products. Optional. */
  absorptionMw?: number | null;
  /** Net numerator as the worker computed it; used to verify, not to display. */
  weightedNetMw?: number | null;
  /** The ratio the worker published, for the consistency check. */
  publishedSdRatio?: number | null;
}

export function sdFormulaCaption(input: SdCaptionInputs | number, legacyDemand?: number): string {
  // Tolerates the pre-36.D two-argument call so a stale caller degrades to the
  // gross-supply form rather than throwing on a public page.
  const i: SdCaptionInputs = typeof input === 'number'
    ? { weightedMw: input, effDemandMw: legacyDemand as number }
    : input;

  const absorbed = Number.isFinite(i.absorptionMw as number) ? Math.round(i.absorptionMw as number) : 0;
  const gross = Math.round(i.weightedMw);
  const net = Math.max(0, gross - absorbed);
  const d = Math.round(i.effDemandMw);
  const r = sdRatio(net, d);
  const ratio = r != null ? `${r.toFixed(2)}×` : '—';

  if (absorbed <= 0) {
    return `S/D = weighted supply / effective demand · ${net} MW / ${d} MW = ${ratio}`;
  }
  // If absorption exceeds the weighted pool the numerator clamps at zero, and
  // the caption has to SHOW the clamp: rendering "(100 − 500) MW … = 0.00×"
  // would be exactly the incoherent arithmetic this function exists to stop.
  // It also means the module claims more contracted MW than the fleet holds,
  // which is a data problem a reader should see rather than a rounding note.
  const clamp = absorbed > gross ? ` → 0, capped` : '';
  return `S/D = (weighted supply − contracted-away) / effective demand · `
    + `(${gross} − ${absorbed}${clamp}) MW / ${d} MW = ${ratio}`;
}

/** The subset of the `/s4` (or `/s4/fleet`) fleet object the caption needs. */
export interface SdCaptionFleet {
  baltic_weighted_mw?: number | null;
  eff_demand_mw?: number | null;
  absorption_mw?: number | null;
  sd_ratio?: number | null;
}

/**
 * Phase 38.2 — the one place the caption's PRECONDITION lives.
 *
 * Before this, three surfaces each carried their own `if (weighted != null &&
 * demand != null)` guard around an identical `sdFormulaCaption(...)` call. When
 * the `/s4` assembler dropped `baltic_weighted_mw`, all three guards went false
 * at once and every surface silently fell back to the generic sentence — which
 * is a plausible-looking string, so nothing looked broken. Two of the three
 * stayed dark from 36.D until this phase.
 *
 * Returning `null` (rather than a fallback string) keeps the caller's choice of
 * degradation explicit, and gives a test something to assert that is the actual
 * rendered line rather than the presence of a field.
 */
export function fleetSdCaption(fleet: SdCaptionFleet | null | undefined): string | null {
  const w = fleet?.baltic_weighted_mw;
  const d = fleet?.eff_demand_mw;
  if (w == null || d == null) return null;
  return sdFormulaCaption({
    weightedMw: w,
    effDemandMw: d,
    absorptionMw: fleet?.absorption_mw,
    publishedSdRatio: fleet?.sd_ratio,
  });
}

/**
 * True when a caption's inputs reproduce the ratio the worker published.
 *
 * The point of the phase that added this was that a disclosure which cannot be
 * checked will eventually stop being true and nobody will notice. This makes it
 * checkable in a test rather than by a reader with a calculator.
 */
export function sdCaptionIsConsistent(i: SdCaptionInputs, tolerance = 0.01): boolean {
  if (i.publishedSdRatio == null) return true;
  const absorbed = Number.isFinite(i.absorptionMw as number) ? (i.absorptionMw as number) : 0;
  const r = sdRatio(Math.max(0, i.weightedMw - absorbed), i.effDemandMw);
  return r != null && Math.abs(r - i.publishedSdRatio) <= tolerance;
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
