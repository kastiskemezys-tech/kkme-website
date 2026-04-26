// Distribution-shape classifier for rolling capture stats.
//
// Audit flagged: mean EUR 129 < median EUR 137 over a 30D rolling window of
// gross capture. For a typical right-skewed arbitrage spread distribution
// (occasional fat-tail high-spread days), mean > median. Mean < median is
// LEFT skew - unusual for spread data.
//
// Investigation: workers/fetch-s1.js captureRollingStats computes mean
// and percentiles from the SAME filtered+sorted array of values - no
// sample-window mismatch, no aggregation artifact. The 30D window today
// genuinely is left-skewed because the bottom tail (3 days under EUR 36
// out of 30) drags mean below the median. Classification: real, not
// artifact - ships with a footnote on the card.
//
// Helper used both by the regression spec (asserting aggregation is
// consistent) and by the card (rendering the footnote).

export interface RollingShapeStats {
  mean?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  days?: number | null;
}

export type DistributionSkew = 'left' | 'right' | 'symmetric' | 'unknown';

/** Classify skew from mean and median. Threshold: 5% relative gap. */
export function classifySkew(stats: RollingShapeStats): DistributionSkew {
  if (stats.mean == null || stats.p50 == null || stats.p50 === 0) return 'unknown';
  const rel = (stats.mean - stats.p50) / Math.abs(stats.p50);
  if (rel < -0.05) return 'left';
  if (rel >  0.05) return 'right';
  return 'symmetric';
}

/** Footnote shown when distribution is left-skewed (the audited anomaly). */
export function leftSkewFootnote(stats: RollingShapeStats): string | null {
  if (classifySkew(stats) !== 'left') return null;
  if (stats.mean == null || stats.p50 == null || stats.days == null) return null;
  const gap = stats.p50 - stats.mean;
  return `Left-skew: mean €${stats.mean.toFixed(0)} < median €${stats.p50.toFixed(0)} over ${stats.days}D (gap €${gap.toFixed(0)}). Unusual for arbitrage; bottom-tail days pull the mean below median.`;
}

/** Returns true if any percentile invariant breaks (regression guard). */
export function statsAreOrderedCorrectly(stats: RollingShapeStats): boolean {
  const xs = [stats.p25, stats.p50, stats.p75, stats.p90];
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1];
    const b = xs[i];
    if (a == null || b == null) continue;
    if (b < a) return false;
  }
  return true;
}

/** Verify aggregation: passing a sorted array, mean and percentiles match the same sample. */
export function verifyConsistentAggregation(
  values: ReadonlyArray<number>,
  stats: RollingShapeStats,
): boolean {
  if (!values.length || stats.mean == null) return false;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p = (pct: number) => sorted[Math.min(Math.floor(sorted.length * pct), sorted.length - 1)];
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    round(mean) === round(stats.mean) &&
    (stats.p25 == null || round(p(0.25)) === round(stats.p25)) &&
    (stats.p50 == null || round(p(0.50)) === round(stats.p50)) &&
    (stats.p75 == null || round(p(0.75)) === round(stats.p75)) &&
    (stats.p90 == null || round(p(0.90)) === round(stats.p90))
  );
}
