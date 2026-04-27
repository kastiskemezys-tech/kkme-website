// Phase 7.7d — Throughput-derived cycle accounting.
//
// Mirrors the worker constants and logic at workers/fetch-s1.js
// (REVENUE_SCENARIOS, computeThroughputBreakdown, warrantyStatusFor) so the
// Vitest suite can exercise the same math without standing up the worker
// runtime. Keep these in sync if the worker constants move.
//
// Public-research provenance for the per-product throughput numbers lives in
// the worker's REVENUE_SCENARIOS comment block.

export type Scenario = 'base' | 'conservative' | 'stress';

export type ScenarioParams = {
  mwh_per_mw_yr_fcr:  number;
  mwh_per_mw_yr_afrr: number;
  mwh_per_mw_yr_mfrr: number;
  mwh_per_mw_yr_da_2h: number;
  mwh_per_mw_yr_da_4h: number;
};

export const REVENUE_SCENARIOS: Record<Scenario, ScenarioParams> = {
  base: {
    mwh_per_mw_yr_fcr:  200,
    mwh_per_mw_yr_afrr: 475,
    mwh_per_mw_yr_mfrr: 125,
    mwh_per_mw_yr_da_2h: 1100,
    mwh_per_mw_yr_da_4h: 1500,
  },
  conservative: {
    mwh_per_mw_yr_fcr:  170,
    mwh_per_mw_yr_afrr: 380,
    mwh_per_mw_yr_mfrr: 100,
    mwh_per_mw_yr_da_2h: 1000,
    mwh_per_mw_yr_da_4h: 1400,
  },
  stress: {
    mwh_per_mw_yr_fcr:  140,
    mwh_per_mw_yr_afrr: 285,
    mwh_per_mw_yr_mfrr:  75,
    mwh_per_mw_yr_da_2h:  800,
    mwh_per_mw_yr_da_4h: 1240,
  },
};

export const ALLOC = {
  fcr:  0.16,  // RESERVE_PRODUCTS.fcr.share
  afrr: 0.34,  // RESERVE_PRODUCTS.afrr.share
  mfrr: 0.50,  // RESERVE_PRODUCTS.mfrr.share
  da:   1.00,  // full nameplate
} as const;

export type ThroughputBreakdown = {
  fcr:  number;
  afrr: number;
  mfrr: number;
  da:   number;
  total_mwh_yr:  number;
  total_efcs_yr: number;
  total_cd:      number;
  warranty_status: 'within' | 'premium-tier-required' | 'unwarranted';
};

export function computeCycles(args: { MW: number; dur_h: number; scenario: Scenario }): ThroughputBreakdown {
  const { MW, dur_h, scenario } = args;
  const sc = REVENUE_SCENARIOS[scenario];

  const fcr_alloc_MW   = MW * ALLOC.fcr;
  const afrr_alloc_MW  = MW * ALLOC.afrr;
  const mfrr_alloc_MW  = MW * ALLOC.mfrr;

  const fcr_mwh   = fcr_alloc_MW  * sc.mwh_per_mw_yr_fcr;
  const afrr_mwh  = afrr_alloc_MW * sc.mwh_per_mw_yr_afrr;
  const mfrr_mwh  = mfrr_alloc_MW * sc.mwh_per_mw_yr_mfrr;
  const da_mwh    = MW            * (dur_h <= 2 ? sc.mwh_per_mw_yr_da_2h : sc.mwh_per_mw_yr_da_4h);

  const total_mwh_yr = fcr_mwh + afrr_mwh + mfrr_mwh + da_mwh;
  const capacity_mwh = MW * dur_h;
  const total_efcs_yr = capacity_mwh > 0 ? total_mwh_yr / capacity_mwh : 0;
  const total_cd      = total_efcs_yr / 365;

  const fcr_efcs  = capacity_mwh > 0 ? fcr_mwh  / capacity_mwh : 0;
  const afrr_efcs = capacity_mwh > 0 ? afrr_mwh / capacity_mwh : 0;
  const mfrr_efcs = capacity_mwh > 0 ? mfrr_mwh / capacity_mwh : 0;
  const da_efcs   = capacity_mwh > 0 ? da_mwh   / capacity_mwh : 0;

  return {
    fcr:  fcr_efcs,
    afrr: afrr_efcs,
    mfrr: mfrr_efcs,
    da:   da_efcs,
    total_mwh_yr,
    total_efcs_yr,
    total_cd,
    warranty_status: warrantyStatus(total_efcs_yr),
  };
}

export function warrantyStatus(total_efcs_yr: number): 'within' | 'premium-tier-required' | 'unwarranted' {
  if (total_efcs_yr <= 730)  return 'within';
  if (total_efcs_yr <= 1460) return 'premium-tier-required';
  return 'unwarranted';
}
