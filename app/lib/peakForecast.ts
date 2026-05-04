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

// ─── Peak / trough computation (Phase 12.10) ────────────────────────────────
//
// Audit #5 finding (2026-05-03): PeakForecastCard displayed "Peak h10 EET /
// Trough h3 EET" while the actual day's max was at h22 EEST per Energy-Charts.
// Root cause: the prior helper returned the SLICE INDEX (0..23) and the
// formatHourEET helper interpreted that as a UTC clock-hour. When the
// hourly_lt array's slice did not start at UTC 00, those two were not the
// same number — the displayed hour was wrong by the slice's offset.
//
// The fix: anchor the slice's last entry to `updated_at`'s UTC hour, then
// derive each idx's UTC clock-hour. Resolution-aware: the worker now
// returns 96-entry arrays for 15-min ISP markets; treat as quarter-hour
// granularity when length is a multiple of 96 (and not a clean multiple of 24).

export interface PeakTroughResult {
  peakHour: number;       // UTC clock-hour 0..23 (formatHourEET converts to local)
  peakPrice: number;
  troughHour: number;     // UTC clock-hour 0..23
  troughPrice: number;
}

export function computePeakTrough(
  hourly: number[] | null | undefined,
  updated_at: string | null | undefined,
): PeakTroughResult | null {
  if (!Array.isArray(hourly) || hourly.length < 24) return null;

  // Resolution detection: 96-multiple length WITH no other 24-divisible
  // interpretation = 15-min PT15M bars (4/hour). 24-multiple = hourly bars.
  // Default conservative path: hourly.
  const perHour = hourly.length % 96 === 0 && hourly.length % 24 === 0
    // disambiguate 96 (= 1 day @ 15min OR 4 days @ 1h) by data shape:
    // adjacent 15-min bars carry near-identical prices; adjacent hourly bars do not.
    // Use a simple variance heuristic on the last 8 entries.
    ? (() => {
        const tail = hourly.slice(-8);
        let adjDiffSum = 0;
        for (let i = 1; i < tail.length; i++) adjDiffSum += Math.abs(tail[i] - tail[i - 1]);
        const meanAdjDiff = adjDiffSum / (tail.length - 1);
        // Hourly DA bars typically have €5-50 between adjacent hours; 15-min
        // bars carry €0-3 unless settlement clearing produces a step.
        return meanAdjDiff < 2 ? 4 : 1;
      })()
    : 1;

  const windowEntries = 24 * perHour;
  const slice = hourly.slice(-Math.min(windowEntries, hourly.length));

  let peakIdx = 0, peakPrice = -Infinity, troughIdx = 0, troughPrice = Infinity;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] > peakPrice) { peakPrice = slice[i]; peakIdx = i; }
    if (slice[i] < troughPrice) { troughPrice = slice[i]; troughIdx = i; }
  }

  // Anchor: last slice entry corresponds to the hour ending at updated_at's
  // UTC clock-hour (or, when updated_at is unavailable, fall back to UTC 00
  // assumption — same semantic as treating slice idx as UTC hour-of-day).
  const ms = updated_at ? Date.parse(updated_at) : NaN;
  const lastUtcHour = Number.isFinite(ms) ? new Date(ms).getUTCHours() : 23;
  const lastIdxHour = Math.floor((slice.length - 1) / perHour); // slice's last hour offset

  const utcHourAt = (idx: number): number => {
    const idxHour = Math.floor(idx / perHour);
    return ((lastUtcHour - (lastIdxHour - idxHour)) % 24 + 24) % 24;
  };

  return {
    peakHour: utcHourAt(peakIdx),
    peakPrice,
    troughHour: utcHourAt(troughIdx),
    troughPrice,
  };
}
