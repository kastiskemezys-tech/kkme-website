/**
 * Phase 38.3 — the wear model's characterised range, and the cycling comparison
 * that is and isn't valid against it. DISCLOSURE ONLY: nothing here moves a
 * published number.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * 38.3 set out to cut the public engine over to 36.B's hourly dispatch, which
 * measures physical cycling at 219-222 EFC/yr against the shipped engine's 498.
 * Measured across all 54 public configurations from a clean worktree baseline
 * against one frozen KV snapshot, the cutover moved project IRR by **+0.07 to
 * +0.15 percentage points** — median +0.14 pp — and moved nothing at all in a
 * third of the matrix. The arc's premise was that it would move the headline
 * materially. It does not, and the reason is the thing worth publishing:
 *
 *   `sohYr(t, cd)` in the worker does `cd = Math.max(cd_total, 1.0)`, and
 *   `getDegradation` floors its 2 c/d weight at zero. The SOH curves are
 *   calibrated at 1.0 / 1.5 / 2.0 c/d test rates and the model does not
 *   extrapolate below the slowest one.
 *
 * So the engine cannot represent a battery cycling at 0.6 c/d ageing any more
 * slowly than one cycling at 1.0 c/d. Everything below the floor is clamped
 * away by construction. That is a defensible modelling choice — manufacturers
 * do not characterise below 1 c/d either — but it is a LIMIT, and a limit that
 * is silent looks like a result.
 *
 * A reader who knows batteries will respect a stated validity floor far more
 * than silence. It is also the honest frame for every cycling number the site
 * publishes: below 1.0 c/d, the cycle count is an accounting output, not a
 * wear input.
 *
 * ── The cycling comparison ───────────────────────────────────────────────
 *
 * `reconcile.mjs` benchmarks cycling against 550-720 EFC/yr, sourced to "Modo
 * Energy / GEM Baltic **merchant-battery** cycling research 2025". The modelled
 * asset is not merchant-led: the majority of its gross revenue is reserve
 * capacity and activation, and a reserve-led asset holds SoC headroom to
 * deliver committed MW rather than spending it on wholesale cycles. B1's hourly
 * simulation puts the physical mechanism at ~27.5 % of nameplate MW left free
 * to trade, cross-checked against DA throughput achieving 28.9 % of its anchor
 * — two independently derived ratios agreeing.
 *
 * So the comparison is a category error, and we can say so from our own
 * numbers rather than hedging. The share below is computed from the payload the
 * reader is looking at, never asserted (rule #2).
 */

/**
 * Slowest cycling rate the SOH curves are calibrated at, in cycles/day.
 * Mirrors the clamp in `sohYr` (`workers/fetch-s1.js`). Asserted against the
 * worker's actual behaviour — not against its source — in
 * `app/lib/__tests__/wearModelRange.test.ts`.
 */
export const WEAR_MODEL_FLOOR_CD = 1.0;

/** The externally sourced band `reconcile.mjs` benchmarks cycling against. */
export const MERCHANT_CYCLING_BAND_EFC_YR = Object.freeze({
  lo: 550,
  hi: 720,
  basis: 'merchant-battery',
  source: 'Modo Energy / GEM Baltic merchant-battery cycling research 2025',
});

export interface WearRangeVerdict {
  cd: number;
  /** True when the asset cycles below the slowest calibrated rate. */
  belowFloor: boolean;
  floor: number;
  /** The rate the wear model actually applies — clamped. */
  appliedCd: number;
}

/** Where an asset's cycling rate sits against the model's characterised range. */
export function wearRangeVerdict(cd: number | null | undefined): WearRangeVerdict | null {
  if (cd == null || !Number.isFinite(cd) || cd <= 0) return null;
  return {
    cd,
    belowFloor: cd < WEAR_MODEL_FLOOR_CD,
    floor: WEAR_MODEL_FLOOR_CD,
    appliedCd: Math.max(cd, WEAR_MODEL_FLOOR_CD),
  };
}

export interface RevenueLed {
  /** Reserve capacity + activation, as a share of gross. */
  reserveShare: number;
  merchantShare: number;
  /** Which side the majority of gross revenue comes from. */
  led: 'reserve' | 'merchant';
}

/**
 * Reserve-led or merchant-led, computed from the year-1 lines of the payload
 * being displayed. Returns null rather than guessing when the split is absent.
 */
export function revenueLed(y1: {
  rev_bal?: number | null; rev_trd?: number | null; rev_gross?: number | null;
} | null | undefined): RevenueLed | null {
  const bal = y1?.rev_bal, gross = y1?.rev_gross;
  if (bal == null || gross == null || !(gross > 0)) return null;
  const reserveShare = bal / gross;
  return {
    reserveShare,
    merchantShare: 1 - reserveShare,
    led: reserveShare >= 0.5 ? 'reserve' : 'merchant',
  };
}

/** `73 %` — one decimal only when it would otherwise read as a round number it isn't. */
export function pct(x: number): string {
  const r = Math.round(x * 1000) / 10;
  return Number.isInteger(r) ? `${r} %` : `${r.toFixed(1)} %`;
}
