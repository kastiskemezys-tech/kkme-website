// Phase 7.7a (7.7.13) — cannibalization curve from /revenue.fleet_trajectory.
//
// The worker exposes a 6-year forward projection: per-year capacity-payment
// compression index (cpi). Today's market sits at cpi = 1.0; as cumulative
// storage saturates the supply stack, cpi falls to 0.30–0.40 (mature
// phase). The line shape itself is publishable; the formula coefficients
// (S/D thresholds at 0.6 / 1.0, slopes 2.5 / 1.5 / 0.08 in the worker) stay
// drawer-only per the P3 proprietary-model carve-out.

export interface FleetYearRow {
  year?: number;
  sd_ratio?: number;
  phase?: string;
  cpi?: number;
}

export interface CannibalizationPoint {
  year: number;
  cpi: number;
}

export const TODAYS_MARKET_REFERENCE = 1.0;

/**
 * Project the per-year cpi curve. Drops rows missing year or cpi; preserves
 * insertion order (worker emits chronologically: oldest first).
 */
export function projectCannibalizationCurve(
  rows: ReadonlyArray<FleetYearRow>,
): CannibalizationPoint[] {
  const out: CannibalizationPoint[] = [];
  for (const r of rows) {
    if (typeof r.year !== 'number' || typeof r.cpi !== 'number') continue;
    if (!Number.isFinite(r.cpi)) continue;
    out.push({ year: r.year, cpi: r.cpi });
  }
  return out;
}

/**
 * Y-axis bounds for the chart. Always includes the cpi=1.0 reference line so
 * the gap between today's market and the projection reads visually.
 */
export function cannibalizationAxisRange(
  points: ReadonlyArray<CannibalizationPoint>,
  pad = 0.05,
): { min: number; max: number } {
  if (!points.length) return { min: 0, max: 1.5 };
  const ys = points.map(p => p.cpi);
  const lo = Math.min(...ys, TODAYS_MARKET_REFERENCE);
  const hi = Math.max(...ys, TODAYS_MARKET_REFERENCE);
  return {
    min: Math.max(0, lo - pad),
    max: hi + pad,
  };
}

/**
 * True iff every point's cpi ≤ the prior point's cpi (a strictly
 * non-increasing curve). The worker's mature-phase output zigzags at the
 * 4-decimal-place precision boundary, so this is informational only.
 */
export function isMonotonicallyCompressing(
  points: ReadonlyArray<CannibalizationPoint>,
): boolean {
  for (let i = 1; i < points.length; i++) {
    if (points[i].cpi > points[i - 1].cpi) return false;
  }
  return true;
}
