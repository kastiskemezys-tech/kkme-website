// Phase 7.6.15 — explicit methodology for the dispatch "activation rate".
//
// The Trading card surfaces `reserves_detail.activation_rate_pct` from the
// dispatch worker. The worker formula is:
//
//     activatedISPs / TOTAL_ISPS_PER_DAY × 100
//
// where activatedISPs = count of 15-min ISPs in which estimated upward aFRR
// or mFRR dispatch was non-zero, and TOTAL_ISPS_PER_DAY = 96 (15-min ISPs in
// a 24h day). That is **ISP coverage**, not the textbook "activation rate"
// (= activated MWh ÷ reserved MW × hours). Audit flagged the 49% reading as
// 'high for European aFRR (typical 20–40%)' — but that comparison applies to
// the textbook definition, which is unrelated. Renaming the displayed metric
// + showing the formula closes the gap without rewriting the engine.

export const TOTAL_ISPS_PER_DAY = 96;

export const ACTIVATION_COVERAGE_LABEL = 'Activation coverage';

export const ACTIVATION_COVERAGE_FORMULA =
  '15-min ISPs with aFRR/mFRR up dispatch ÷ 96';

/**
 * Fraction of 15-min ISPs (out of 96 daily) with any estimated upward
 * activation, expressed as a percentage. Rounded to one decimal to match
 * the worker contract (`t_r1`).
 */
export function activationCoveragePct(
  activatedIspCount: number,
  totalIsps: number = TOTAL_ISPS_PER_DAY,
): number {
  if (!Number.isFinite(activatedIspCount) || !Number.isFinite(totalIsps) || totalIsps <= 0) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(activatedIspCount, totalIsps));
  return Math.round((clamped / totalIsps) * 1000) / 10;
}
