// Phase 33 — bounded capacity-price regression guard.
//
// Root cause (Phase 33): the S2 "ordered capacity" source emptied (Litgrid
// moved capacity into BTD; afrr_cap_avg / mfrr_cap_avg went absent). Every
// revenue site fell back `*_cap_avg ?? *_up_avg ?? const` — substituting an
// aFRR/mFRR *activation* price (€/MWh, ~37) for a *capacity* price (€/MW/h,
// ~7), which 3×'d gross balancing revenue and pushed project_irr to 49.6%
// (1.6× the Clean Horizon ch_benchmark ceiling of 31%).
//
// The fix is the single-source `capPrice(product, observed)` helper: it takes
// ONLY a genuine capacity field, never an activation price; falls back to
// calibrated Baltic constants when the capacity field is absent; and clamps to
// a structural ceiling [0, 50] €/MW/h with a logged clip event.
//
// These tests pin the helper's behaviour and assert the engine IRR stays inside
// the ch_benchmark band under the exact stale-S2 input that caused the incident.
import { describe, it, expect } from 'vitest';
import {
  capPrice,
  computeRevenueV7,
} from '../../../workers/fetch-s1.js';

const CH_CEILING = 0.31; // ch_benchmark range upper bound (6–31%)

describe('capPrice — bounded capacity-price helper', () => {
  it('falls back to the calibrated constant when the capacity field is absent', () => {
    expect(capPrice('afrr', null)).toBe(7.06);
    expect(capPrice('afrr', undefined)).toBe(7.06);
    expect(capPrice('mfrr', null)).toBe(19.74);
    expect(capPrice('fcr', null)).toBe(0.36);
  });

  it('passes a sane observed capacity price through unchanged', () => {
    expect(capPrice('afrr', 6.5)).toBe(6.5);
    expect(capPrice('mfrr', 22)).toBe(22);
  });

  it('clamps a structurally impossible price to the 50 €/MW/h ceiling', () => {
    // The live FCR average (63.08) and any future runaway source land here.
    expect(capPrice('fcr', 63.08)).toBe(50);
    expect(capPrice('afrr', 80)).toBe(50);
  });

  it('rejects NaN / non-finite (falls to constant) and floors negatives', () => {
    expect(capPrice('afrr', NaN)).toBe(7.06);
    expect(capPrice('mfrr', Infinity)).toBe(19.74); // non-finite → calibrated constant
    expect(capPrice('afrr', -5)).toBe(0);
  });
});

// Build the exact KV shape that triggered the incident: S2 carries activation
// (*_up_avg) + fcr_avg but NO *_cap_avg, capacity_monthly empty → every site
// hits the fallback path.
function makeStaleKV(overrides: Record<string, unknown> = {}) {
  const months = [];
  for (let m = 6; m <= 12; m++) months.push({ month: `2025-${String(m).padStart(2, '0')}`, avg_gross_2h: 150, avg_net_2h: 133, days: 30 });
  for (let m = 1; m <= 5; m++) months.push({ month: `2026-${String(m).padStart(2, '0')}`, avg_gross_2h: 150, avg_net_2h: 133, days: 30 });
  return {
    s1: { spread_eur_mwh: 60, updated_at: '2026-05-31' },
    s1_capture: {
      monthly: months,
      rolling_30d: { stats_2h: { mean: 137 }, stats_4h: { mean: 150 } },
      capture_2h: { gross_eur_mwh: 137 },
      capture_4h: { gross_eur_mwh: 150 },
    },
    // BROKEN state: capacity fields absent, only activation/up prices present.
    s2: { afrr_up_avg: 37, afrr_down_avg: 9.92, mfrr_up_avg: 28.68, mfrr_down_avg: 18.77, fcr_avg: 63.08 },
    s2_activation_parsed: { lt: { afrr_p50: 13.5, mfrr_p50: 14.5 } },
    capacity_monthly: [],
    dispatch_metrics: { rolling_30d: { avg_afrr_activation_pct: 0.5, avg_mfrr_activation_pct: 0.47 } },
    euribor: { euribor_nominal_3m: 2.01 },
    fleet: { sd_ratio: 2.69, weighted_supply: 2234, demand_mw: 935, pipeline_mw: 19034, pipeline_realisation: 0.5, current_sd: 2.39 },
    ...overrides,
  };
}

describe('computeRevenueV7 — IRR stays bounded under stale S2', () => {
  const params = { mw: 50, dur_h: 2, capex_kwh: 164, cod_year: 2028, scenario: 'base' };

  it('runs the v7.3 path (not the v6 fallback) for this fixture', () => {
    const r = computeRevenueV7(params, makeStaleKV());
    expect(r.model_version).toBe('v7.3');
  });

  it('uses the calibrated capacity constants, never the activation price', () => {
    const r = computeRevenueV7(params, makeStaleKV());
    // The bug substituted s2.afrr_up_avg (37) here; the fix pins it to 7.06.
    expect(r.signal_inputs.afrr_cap).toBe(7.06);
    expect(r.signal_inputs.mfrr_cap).toBe(19.74);
  });

  it('keeps project_irr inside the ch_benchmark band with absent capacity prices', () => {
    const r = computeRevenueV7(params, makeStaleKV());
    expect(r.project_irr).toBeGreaterThan(0);
    expect(r.project_irr).toBeLessThanOrEqual(CH_CEILING);
  });

  it('clamps an injected runaway capacity price to the 50 ceiling', () => {
    // A future source pushing a structurally impossible 90 €/MW/h is capped at
    // 50 and logged — a structural backstop. The benchmark-band guarantee comes
    // from the calibrated constants, not the clamp.
    const r = computeRevenueV7(params, makeStaleKV({ s2: { afrr_cap_avg: 90, mfrr_cap_avg: 90, afrr_up_avg: 37, mfrr_up_avg: 28.68 } }));
    expect(r.signal_inputs.afrr_cap).toBe(50);
    expect(r.signal_inputs.mfrr_cap).toBe(50);
    expect(Number.isFinite(r.project_irr)).toBe(true);
  });
});
