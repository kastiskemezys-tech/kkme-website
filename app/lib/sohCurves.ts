// Phase 7.7d — Empirical SOH curves at three test rates with interpolation.
//
// Mirrors workers/fetch-s1.js (SOH_CURVE_1CD / 15CD / 2CD + sohYr) so the
// Vitest suite can exercise the curve math without standing up the worker
// runtime. Keep these in sync if the worker constants move.
//
// Cross-supplier consensus median across binding Tier 1 LFP integrator RFP
// responses (2026-Q1 reference, 25°C, 0.5P). Source documents held privately.

export const SOH_CURVE_1CD = [
  1.000, 0.967, 0.935, 0.908, 0.882,  // Y0–Y4
  0.855, 0.830, 0.806, 0.785, 0.764,  // Y5–Y9
  0.745, 0.728, 0.713, 0.700, 0.689,  // Y10–Y14
  0.679, 0.671, 0.665,                 // Y15–Y17
] as const;

export const SOH_CURVE_15CD = [
  1.000, 0.955, 0.915, 0.880, 0.852,
  0.830, 0.805, 0.780, 0.758, 0.738,
  0.720, 0.703, 0.687, 0.671, 0.658,
  0.645, 0.632, 0.620,
] as const;

export const SOH_CURVE_2CD = [
  1.000, 0.945, 0.900, 0.864, 0.830,
  0.810, 0.785, 0.760, 0.738, 0.717,
  0.700, 0.682, 0.665, 0.648, 0.632,
  0.617, 0.602, 0.588,
] as const;

export function sohYr(t: number, cd_total: number): number {
  const tIdx = Math.max(0, Math.min(t, SOH_CURVE_1CD.length - 1));
  const cd = Math.max(cd_total ?? 1.0, 1.0);
  if (cd <= 1.5) {
    const f = (cd - 1.0) / 0.5;
    return SOH_CURVE_1CD[tIdx] * (1 - f) + SOH_CURVE_15CD[tIdx] * f;
  }
  if (cd <= 2.0) {
    const f = (cd - 1.5) / 0.5;
    return SOH_CURVE_15CD[tIdx] * (1 - f) + SOH_CURVE_2CD[tIdx] * f;
  }
  const slope = SOH_CURVE_2CD[tIdx] - SOH_CURVE_15CD[tIdx];
  return Math.max(0.40, SOH_CURVE_2CD[tIdx] + slope * ((cd - 2.0) / 0.5));
}

export const RTE_BOL = { h2: 0.85, h4: 0.86 } as const;
export const RTE_DECAY_PP_PER_YEAR = 0.0020;
export const RTE_FLOOR_DROP = 0.04;

export function rteCurveFor(dur_h: number, lifetime_yrs: number = 18): number[] {
  const bol = dur_h >= 3 ? RTE_BOL.h4 : RTE_BOL.h2;
  return Array.from({ length: lifetime_yrs }, (_, t) =>
    Math.round(Math.max(bol - RTE_DECAY_PP_PER_YEAR * t, bol - RTE_FLOOR_DROP) * 10000) / 10000
  );
}
