/**
 * Phase 43 §1 — the units registry.
 *
 * A €/€ ratio spent as an MWh/MWh ratio sat in the revenue path for months
 * (B-065, P1, still open). Nothing caught it because nothing in this codebase
 * knows what any number MEANS. It was found by accident, during an unrelated
 * comparison. This registry exists so its siblings are found deliberately.
 *
 * The distinction the registry is built around, and the only one that matters
 * for the B-065 class:
 *
 *   A dimensionless quantity is NOT a dimensionless quantity.
 *   `T/(T+R)` where both are €/MW/h is dimensionless — a share of VALUE.
 *   `effective_arb_pct` is dimensionless — a share of POWER·TIME.
 *   Multiplying MWh by the second is physics. Multiplying MWh by the first is
 *   a category error that happens to compile, run, and publish a number.
 *
 * So `€/€` and `MWh/MWh` are recorded as DIFFERENT dimensions here, even though
 * both reduce to 1. A units system that cancels them is blind to the exact bug
 * this file exists to catch.
 *
 * COVERAGE IS PARTIAL AND THE GATE SAYS SO. This registers the identifiers on
 * the revenue, dispatch, cost and debt paths — not every name in a 9,400-line
 * worker. The gate reports its own coverage on every run, because a dimensional
 * check that silently examines 4 % of the multiplications would be the most
 * reassuring possible way to have no dimensional check at all.
 */

/** Dimension vocabulary. Strings, compared literally — no algebra, on purpose. */
export const DIM = {
  ENERGY_PER_POWER_YEAR: 'MWh/MW/yr',
  ENERGY_PER_POWER_DAY: 'MWh/MW/d',
  ENERGY: 'MWh',
  POWER: 'MW',
  PRICE: 'EUR/MWh',
  VALUE_DENSITY: 'EUR/MW/h',
  VALUE: 'EUR',
  HOURS: 'h',
  DAYS: 'd',
  CYCLES_PER_DAY: 'cycles/d',
  /** Dimensionless — but a share of VALUE. Never a legal multiplier of energy. */
  SHARE_OF_VALUE: 'EUR/EUR',
  /** Dimensionless — a share of ENERGY or POWER·TIME. Legal against energy. */
  SHARE_OF_ENERGY: 'MWh/MWh',
  SHARE_OF_POWER: 'MW/MW',
  /** Dimensionless and physically neutral: efficiencies, availability, indices. */
  RATIO: 'ratio',
  RATE_PER_YEAR: '1/yr',
};

/**
 * identifier → dimension.
 *
 * Keyed by the local variable / property name as it appears in the engine. The
 * gate matches on the bare identifier, so a name means the same thing
 * everywhere — which is itself a property worth having, and one violation of it
 * (the same word carrying two dimensions in two functions) would show up here
 * as a conflict rather than as a silent reinterpretation.
 */
export const UNITS = {
  // ── The B-065 pair. These two lines are the whole reason for the file. ──
  trading_fraction: DIM.SHARE_OF_VALUE,      // min(0.70, T/(T+R) × 0.75); T,R are EUR/MW/h
  da_mwh_per_mw_yr: DIM.ENERGY_PER_POWER_YEAR,
  da_mwh_per_mw_day: DIM.ENERGY_PER_POWER_DAY,
  physical_arb_share: DIM.SHARE_OF_POWER,    // the quantity the seam SHOULD use
  effective_arb_pct: DIM.SHARE_OF_POWER,     // Σ MW-share-freed × slice-probability
  // Flag-dependent, and recorded as the DEFAULT path's dimension because that
  // is what /revenue serves. `MW_PARTITION_DEFAULT = 'partition'` (38.6a,
  // operator-signed), so `arb_share_yr = physical_arb_share` — a share of
  // POWER — on every published request. It carries the EUR/EUR dimension only
  // under the legacy `mw_partition: 'current'` mode, which the public route
  // never selects. Verified by running the engine in all four modes.
  arb_share_yr: DIM.SHARE_OF_POWER,

  // ── Energy and power ──
  mwh: DIM.ENERGY,
  mwh_charged: DIM.ENERGY,
  mwh_per_cycle: DIM.ENERGY,
  total_efcs_yr: DIM.RATE_PER_YEAR,
  mw: DIM.POWER,
  arb_mw_both: DIM.POWER,
  arbAvailMW: DIM.POWER,
  reservedMW: DIM.POWER,
  fcr_cap: DIM.POWER,
  afrr_cap: DIM.POWER,
  mfrr_cap: DIM.POWER,

  // ── Prices and value ──
  yr_capture: DIM.PRICE,
  capture: DIM.PRICE,
  gross_eur_mwh: DIM.PRICE,
  net_eur_mwh: DIM.PRICE,
  avg_charge: DIM.PRICE,
  avg_discharge: DIM.PRICE,
  aux_price: DIM.PRICE,
  afrr_clearing: DIM.VALUE_DENSITY,
  mfrr_clearing: DIM.VALUE_DENSITY,
  T_base: DIM.VALUE_DENSITY,
  T_yr: DIM.VALUE_DENSITY,
  rev_trd: DIM.VALUE,
  rev_bal: DIM.VALUE,
  rev_cap_fcr: DIM.VALUE,
  rev_cap_afrr: DIM.VALUE,
  rev_cap_mfrr: DIM.VALUE,
  gross_capex: DIM.VALUE,

  // ── Time ──
  dur_h: DIM.HOURS,
  idle_hours: DIM.HOURS,
  active_hours: DIM.HOURS,
  op_days: DIM.DAYS,
  total_days: DIM.DAYS,
  cycles_day: DIM.CYCLES_PER_DAY,
  total_cd: DIM.CYCLES_PER_DAY,

  // ── Genuinely neutral dimensionless factors ──
  rte: DIM.RATIO,
  rte_yr: DIM.RATIO,
  deg_ratio_vs_y1: DIM.RATIO,
  yr_op_frac: DIM.RATIO,
  spread_mult: DIM.RATIO,
  trading_real: DIM.RATIO,
  spread_comp: DIM.RATIO,
  bal_comp: DIM.RATIO,
  depth: DIM.RATIO,
  cpi: DIM.RATIO,
};

/**
 * The forbidden products.
 *
 * Deliberately narrow. The point is not a general dimensional-analysis engine —
 * that would need a real parser and would drown in false positives on its first
 * run, which is how a gate gets switched off. The point is ONE rule, the one
 * that was paid for: a share of VALUE may not scale a quantity of ENERGY or
 * POWER.
 */
export const FORBIDDEN_PRODUCTS = [
  {
    id: 'value-share-scales-energy',
    left: [DIM.SHARE_OF_VALUE],
    right: [DIM.ENERGY_PER_POWER_YEAR, DIM.ENERGY_PER_POWER_DAY, DIM.ENERGY, DIM.POWER],
    why: 'a share of VALUE (EUR/EUR) cannot scale a quantity of ENERGY or POWER — this is the B-065 shape',
  },
];

/**
 * Known violations, each with its register ID and an owner.
 *
 * An allowlist is a liability, so it is built to be uncomfortable: every entry
 * names the register row that owns it, and the gate PRINTS the list on every
 * green run. A suppressed defect that nobody is reminded of has been forgotten,
 * not managed.
 *
 * Removing the B-065 entry is the partition phase's exit criterion.
 */
export const KNOWN_VIOLATIONS = [
  {
    file: 'workers/fetch-s1.js',
    identifiers: ['trading_fraction', 'da_mwh_per_mw_day'],
    register: 'B-065 (residue)',
    status: 'OPEN — NOT the site the register describes; see the Phase 43 wrap, decision 4',
    note: 'The projection seam the register names (fetch-s1.js ~:2500) was FIXED by 38.6a, which '
        + 'made `mw_partition: partition` the engine default — verified by running all four modes: '
        + 'the default and `partition` agree exactly and only the legacy `current` mode reproduces '
        + 'the pre-fix numbers. The register row still reads "open — nothing changed", which is '
        + 'stale (A9). What IS still live is this DIFFERENT site: `computeBaseYear` at ~:4201 '
        + 'commits `da_mwh_per_mw_day [MWh/MW/d] x y1_mix.trading_fraction [EUR/EUR]`, and '
        + 'computeRevenueV7 calls computeBaseYear on every request. Its output reaches the payload '
        + 'through one narrow path — the capture fallback at ~:3120 — which fires only when the '
        + '`s1_capture` KV key is absent. Phase 39.2 established that key does go absent in '
        + 'production. Quantified in the wrap; not fixed here, because it moves a published number.',
  },
];
