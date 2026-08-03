// Phase 39 — what a contracted floor is worth in DEBT, for the Returns drawer.
//
// Same reasoning as `mwPartitionCopy.ts`: the words are load-bearing, they get
// asserted by test as rendered strings rather than as component internals (B13),
// and a change to them is a reviewable diff rather than a JSX edit buried in a
// 2,000-line card.
//
// ── What ships and what deliberately does not ──────────────────────────────
//
// Phase 39 measured the floor's effect through TWO channels:
//
//   (A) the CASH-FLOW effect — the floor lifts CFADS in the years it binds,
//       measured with the cover ratio held at the merchant 2.00x; and
//   (B) a LENDER-TREATMENT effect — contracted revenue underwritten at a lower
//       cover ratio, via a DSCR blend that no source publishes.
//
// **Only channel (A) is published.** Channel (B) rests on the unsourced blend
// that inflated the phase's first table by an order of magnitude (it accounted
// for 98 % of a headline "+25.5 % debt at 50 % contracted"). Publishing it with
// a caveat attached would put the retracted claim back in front of a reader.
// It stays in the CP and the methodology as the record of the correction.
//
// Operator decision at the Phase 39 sign-off, 2026-08-03.
//
// The measured channel is the stronger claim anyway: it needs no assumption
// about how a lender would treat contracted revenue, only the arithmetic of
// sculpting against the asset's own cash flows.

/** The structure the measurement was cut against. */
export const FLOOR_REFERENCE = Object.freeze({
  label: '50 MW · 4h · mid capex · COD 2027',
  floor_eur_mw_yr: 116_000,
  floor_basis: 'median of merchant net market revenue per MW, operating years 1–10',
  term_years: 10,
  contracted_share_pct: 50,
  target_dscr: 2.00,
});

/**
 * Measured lever by scenario: how much faster sustainable debt rises than
 * revenue, at 50 % contracted, with the cover ratio held at the merchant level.
 *
 * These are MEASURED ratios from the Phase 39 run, not assumptions. The whole
 * point is that they differ by scenario — sculpting is set by the low years, so
 * the worse the case, the more a floor is worth as debt rather than as revenue.
 */
// Carried UNROUNDED from `docs/audits/phase-39/debt-sizing-run.json`. An earlier
// draft of this file rounded first and divided second — it took the printed
// "+0.37 % / +0.29 %" and computed 1.28 rather than the underlying 1.3030, which
// then propagated into a headline ratio of 2.04 instead of 2.00. Numbers cross
// from a run into copy via the committed artifact, never via a figure read off a
// formatted table (failure-modes C4).
export const FLOOR_LEVER = Object.freeze({
  base: 1.3030,
  conservative: 2.2538,
  stress: 2.6108,
});

/** Downside-to-central ratio — the headline asymmetry. Derived, never hardcoded. */
export const FLOOR_LEVER_RATIO = Number(
  (FLOOR_LEVER.stress / FLOOR_LEVER.base).toFixed(2)
);   // 2.00

const one = (v: number) => v.toFixed(2);

/**
 * The drawer paragraph.
 *
 * Rule #2 applies: every number below is either read from the frozen reference
 * object above or COMPUTED from it. Nothing asserts where or when a value came
 * from without deriving it.
 */
export function contractedFloorExplainer(): { heading: string; paragraphs: string[] } {
  const R = FLOOR_REFERENCE;
  return {
    heading: 'What a contracted floor is worth in debt',
    paragraphs: [
    // 1. What was done.
    `A contracted floor at €${(R.floor_eur_mw_yr / 1000).toFixed(0)}k/MW/yr on `
      + `${R.contracted_share_pct}% of nameplate, for ${R.term_years} years, measured `
      + `against the ${R.label} asset. The floor level is the ${R.floor_basis} — a `
      + `structure test, not a term sheet and not an offer received.`,

    // 2. The mechanism, before the number.
    `Debt is sized by sculpting against the LOW years, not the average one. A floor `
      + `raises the low years by more than it raises the mean, so it converts into `
      + `borrowing capacity faster than it converts into revenue.`,

    // 3. The measurement, with the cover ratio held fixed so the floor is the
    //    only thing moving.
    `Holding the target cover at ${one(R.target_dscr)}× so the floor is the only thing `
      + `moving, sustainable debt rises ${one(FLOOR_LEVER.base)}× as fast as revenue in `
      + `the central case, ${one(FLOOR_LEVER.conservative)}× in the conservative case and `
      + `${one(FLOOR_LEVER.stress)}× in the downside.`,

    // 4. The point.
    `A floor is worth about ${one(FLOOR_LEVER_RATIO)}× more as debt in the downside than `
      + `in the central case. That asymmetry is the reason to give up upside: the `
      + `downside is what a lender sizes against.`,
    ],
  };
}

/** One-line form for a compact surface. */
export function contractedFloorOneLiner(): string {
  return `A contracted floor converts into debt ${one(FLOOR_LEVER_RATIO)}× more efficiently `
    + `in the downside than in the central case — ${one(FLOOR_LEVER.base)}× versus `
    + `${one(FLOOR_LEVER.stress)}× — because sculpting is set by the low years.`;
}
