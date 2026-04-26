// Peak Forecast tomorrow-line helpers.
// The worker's `da_tomorrow.spread_pct` is the LT vs SE4 cross-zone
// separation — NOT the intraday peak-trough spread that readers expect
// after seeing peak/trough labels. Calling it "spread" inline produced
// the audited "spread -33%" mislabel: -33% relative to what?
//
// Two distinct quantities:
//   - intraday range  = peak − trough, in €/MWh (absolute, asymmetric)
//   - vs SE4 separation = (lt_avg − se4_avg) / |se4_avg|, in %
//
// Show both with correct labels.

export function intradayRange(peak: number, trough: number): number {
  return peak - trough;
}

// Mirrors workers/fetch-s1.js computeS1() denominator semantics so the
// frontend never re-derives it differently. SE4-floor of 10 prevents
// divide-by-near-zero when SE4 settles around the spot during low load.
export function crossZoneSeparationPct(ltAvg: number, se4Avg: number): number {
  const denom = Math.max(Math.abs(se4Avg), 10);
  return ((ltAvg - se4Avg) / denom) * 100;
}

export interface TomorrowFields {
  lt_peak?: number | null;
  lt_trough?: number | null;
  lt_avg?: number | null;
  se4_avg?: number | null;
  // worker-provided cross-zone separation; used as fallback if avgs missing
  spread_pct?: number | null;
}

export function formatTomorrowLine(t: TomorrowFields): string | null {
  if (t.lt_peak == null || t.lt_trough == null) return null;
  const range = intradayRange(t.lt_peak, t.lt_trough);
  const sep =
    t.lt_avg != null && t.se4_avg != null
      ? crossZoneSeparationPct(t.lt_avg, t.se4_avg)
      : t.spread_pct ?? null;
  const sepStr = sep != null ? ` · vs SE4 ${sep > 0 ? '+' : ''}${sep.toFixed(0)}%` : '';
  return `Tomorrow: peak €${t.lt_peak.toFixed(0)} · trough €${t.lt_trough.toFixed(0)} · range €${range.toFixed(0)}/MWh${sepStr}`;
}
