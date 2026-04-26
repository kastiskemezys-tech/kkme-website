// Phase 7.7a (7.7.6) — degradation chart helpers.
//
// Pulls retention values from /revenue's `years` array (already exposed by
// the worker — no engine change needed) and prepares them for charting.
// Reference thresholds come from the LFP industry convention:
//   0.80 — typical augmentation trigger (cells refreshed/replaced)
//   0.70 — typical end-of-life threshold (asset retired or repurposed)

export const AUGMENTATION_THRESHOLD = 0.8;
export const END_OF_LIFE_THRESHOLD = 0.7;

export interface DegradationPoint {
  year: number;
  retention: number;
}

/**
 * Project the per-year retention curve from the worker's `years` array.
 * Each row carries `yr` (1-indexed) and `retention` (0–1 decimal). Rows
 * missing either field are dropped silently — the chart degrades to the
 * subset it has data for.
 */
export function projectDegradationCurve(
  years: ReadonlyArray<{ yr?: number; retention?: number | null }>,
): DegradationPoint[] {
  const out: DegradationPoint[] = [];
  for (const row of years) {
    if (typeof row.yr !== 'number' || typeof row.retention !== 'number') continue;
    if (!Number.isFinite(row.retention)) continue;
    out.push({ year: row.yr, retention: row.retention });
  }
  return out;
}

/**
 * Compute the y-axis range for the chart. Pads on both sides so the curve
 * doesn't touch the frame; clamps to the [0, 1] retention domain.
 */
export function degradationAxisRange(
  points: ReadonlyArray<DegradationPoint>,
  pad = 0.05,
): { min: number; max: number } {
  if (!points.length) return { min: 0.6, max: 1 };
  const ys = points.map(p => p.retention);
  const lo = Math.min(...ys, END_OF_LIFE_THRESHOLD);
  const hi = Math.max(...ys, 1);
  return {
    min: Math.max(0, lo - pad),
    max: Math.min(1, hi + pad),
  };
}

/**
 * Year-1 retention should be approximately 1.0 (degradation starts at full
 * health). Sanity check used by callers to detect engine drift.
 */
export function isYearOneFresh(points: ReadonlyArray<DegradationPoint>, tolerance = 0.1): boolean {
  const y1 = points.find(p => p.year === 1);
  if (!y1) return false;
  return Math.abs(1 - y1.retention) <= tolerance;
}
