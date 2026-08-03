/**
 * Phase 36.F0 — the chart kit's public surface.
 *
 * BUILT (4 of the 8 in the arc's priority order):
 *   1. cashflowWaterfall   — the single most-read chart in a bankable report
 *   2. revenueStack        — composition over time
 *   3. dscrProfile         — magnitude against a covenant threshold
 *   4. debtLadder          — sustainable vs target, binding constraint named
 *
 * NOT BUILT, and named so the gap is legible rather than discovered later:
 *   5. distribution / percentile band (P10-P50-P90)
 *   6. sensitivity tornado
 *   7. monthly heatmap
 *   8. duration/degradation curve with the extrapolation-forbidden zone
 *
 * 8 is the one worth doing next: it is the only chart in the list whose job is
 * to show where the model STOPS being characterised, and 38.3's validity floor
 * currently exists only as a number in a comment.
 */
export { cashflowWaterfall } from './waterfall.mjs';
export { revenueStack } from './revenueStack.mjs';
export { dscrProfile } from './dscrProfile.mjs';
export { debtLadder } from './debtLadder.mjs';

export const BUILT = ['cashflowWaterfall', 'revenueStack', 'dscrProfile', 'debtLadder'];
export const NOT_BUILT = ['percentileBand', 'sensitivityTornado', 'monthlyHeatmap', 'degradationCurve'];
