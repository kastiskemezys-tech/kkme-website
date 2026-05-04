// Phase 7.7a (7.7.12) — backtest analytics from /revenue.backtest.
//
// The worker exposes a 13-month trailing window: trading + balancing
// realised €/MW/day per calendar month. We don't currently get a
// per-month "predicted" series back from the engine — only the modeled
// Y1 daily average. So the chart shows actuals vs that horizontal line
// and reports the mean error vs Y1.

export interface BacktestRow {
  month: string;            // ISO YYYY-MM
  trading_daily: number;    // €/MW/day
  balancing_daily: number;  // €/MW/day
  total_daily: number;      // €/MW/day
  s1_capture: number;       // €/MWh
  days: number;             // sample size for the month
}

export interface BacktestStats {
  /** Number of valid months in the window (caps observation N for N-4). */
  count: number;
  /** Mean of total_daily across valid months, weighted by days. */
  meanTotalDaily: number;
  /** Min / max total_daily for chart axis bounds. */
  minTotalDaily: number;
  maxTotalDaily: number;
  /** Mean error vs the modeled reference, in % (signed). null if no reference. */
  meanErrorPct: number | null;
  /** Mean absolute error in €/MW/day. Sign-stripped magnitude that
   * meanErrorPct hides; high MAE with low |meanErrorPct| means over- and
   * under-shoots cancelled. null if no reference. */
  mae: number | null;
  /** Total observation days across the window. */
  totalDays: number;
}

const isValid = (r: BacktestRow): boolean =>
  Number.isFinite(r.total_daily) && Number.isFinite(r.days) && r.days > 0;

/**
 * Compute summary stats for the backtest chart's caption + axis bounds.
 * Mean is days-weighted (an April month with 16 days carries less weight
 * than a full 30-day month) — matches how a real return calc would treat
 * a partial trailing month.
 */
export function backtestStats(
  rows: ReadonlyArray<BacktestRow>,
  modeledY1Daily?: number | null,
): BacktestStats {
  const valid = rows.filter(isValid);
  if (!valid.length) {
    return {
      count: 0, meanTotalDaily: 0,
      minTotalDaily: 0, maxTotalDaily: 0,
      meanErrorPct: null, mae: null, totalDays: 0,
    };
  }
  const totalDays = valid.reduce((s, r) => s + r.days, 0);
  const weightedSum = valid.reduce((s, r) => s + r.total_daily * r.days, 0);
  const meanTotalDaily = weightedSum / totalDays;
  const min = Math.min(...valid.map(r => r.total_daily));
  const max = Math.max(...valid.map(r => r.total_daily));
  let meanErrorPct: number | null = null;
  let mae: number | null = null;
  if (modeledY1Daily != null && Number.isFinite(modeledY1Daily) && modeledY1Daily !== 0) {
    meanErrorPct = ((meanTotalDaily - modeledY1Daily) / modeledY1Daily) * 100;
    mae = valid.reduce((s, r) => s + Math.abs(r.total_daily - modeledY1Daily), 0) / valid.length;
  }
  return {
    count: valid.length,
    meanTotalDaily,
    minTotalDaily: min,
    maxTotalDaily: max,
    meanErrorPct,
    mae,
    totalDays,
  };
}

/**
 * Y-axis bounds for the chart, padded ~10% so the curve doesn't touch
 * the frame.
 */
export function backtestAxisRange(
  rows: ReadonlyArray<BacktestRow>,
  modeledY1Daily?: number | null,
  pad = 0.1,
): { min: number; max: number } {
  const stats = backtestStats(rows);
  if (!stats.count) return { min: 0, max: 1000 };
  const refMin = modeledY1Daily != null ? Math.min(stats.minTotalDaily, modeledY1Daily) : stats.minTotalDaily;
  const refMax = modeledY1Daily != null ? Math.max(stats.maxTotalDaily, modeledY1Daily) : stats.maxTotalDaily;
  const range = Math.max(1, refMax - refMin);
  return {
    min: Math.max(0, refMin - range * pad),
    max: refMax + range * pad,
  };
}

/**
 * Format the "YYYY-MM" month string into the short calendar label used on
 * the x-axis. "2025-04" → "Apr '25".
 */
export function formatBacktestMonth(month: string): string {
  const [yearS, monthS] = month.split('-');
  const monthIdx = parseInt(monthS, 10) - 1;
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const name = names[monthIdx] ?? '???';
  const yy = yearS.slice(-2);
  return `${name} '${yy}`;
}
