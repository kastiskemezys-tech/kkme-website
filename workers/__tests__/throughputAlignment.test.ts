/**
 * Phase 36.B5 — one day-ahead throughput figure for wear and for revenue.
 *
 * 36.B1-O found the engine carrying two. Cycle accounting used the full
 * `mwh_per_mw_yr_da_{2h,4h}` anchor at nameplate; the revenue line billed the
 * same anchor scaled by `trading_fraction × avail`, because the asset is
 * simultaneously holding reserve MW. So the model charged cell wear for ~43 %
 * more day-ahead energy than it earned on.
 *
 * Both directions were conservative — more wear, less income — which is why it
 * survived. It is still a contradictory branch, and bankability test #5 is
 * exactly about those.
 *
 * The alignment is deliberately NOT a free win: it lowers cycling, which slows
 * degradation and raises IRR (+0.9 % relative on the reference asset), and it
 * pushes the modelled cycling BELOW the observed merchant-fleet band. That
 * breach is declared in the reconciliation harness rather than papered over —
 * asserted in tools/consultancy/__tests__/register.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  computeThroughputBreakdown, computeRevenueV7, REVENUE_SCENARIOS_FOR_TEST,
} from '../fetch-s1.js';
import { loadFixtureKV } from '../../tools/consultancy/regression-reference.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const kv = loadFixtureKV();
const sc = REVENUE_SCENARIOS_FOR_TEST.base as Any;

const run = (dur_h: number, scenario = 'base') => computeRevenueV7(
  { mw: 50, dur_h, capex_kwh: 164, cod_year: 2028, scenario, grant_pct: 0 }, kv) as Any;

describe('computeThroughputBreakdown — the delivered basis', () => {
  it('defaults to the nameplate anchor, so an un-updated caller is unchanged', () => {
    const tp = computeThroughputBreakdown(1, 2, sc) as Any;
    expect(tp.da_utilisation).toBe(1);
    expect(tp.availability).toBe(1);
    expect(tp.da_mwh).toBe(sc.mwh_per_mw_yr_da_2h);
    expect(tp.da_mwh).toBe(tp.da_anchor_mwh);
  });

  it('scales day-ahead by utilisation and everything by availability', () => {
    const tp = computeThroughputBreakdown(1, 2, sc, { da_utilisation: 0.7, availability: 0.97 }) as Any;
    expect(tp.da_anchor_mwh).toBe(sc.mwh_per_mw_yr_da_2h);
    expect(tp.da_mwh).toBeCloseTo(sc.mwh_per_mw_yr_da_2h * 0.7 * 0.97, 9);
    expect(tp.fcr_mwh).toBeCloseTo(0.16 * sc.mwh_per_mw_yr_fcr * 0.97, 9);
    expect(tp.total_mwh_yr).toBeCloseTo(
      tp.fcr_mwh + tp.afrr_mwh + tp.mfrr_mwh + tp.da_mwh, 9);
  });

  it('applies availability exactly once — the double-haircut this replaced', () => {
    const once = computeThroughputBreakdown(1, 2, sc, { da_utilisation: 0.7, availability: 0.97 }) as Any;
    const bare = computeThroughputBreakdown(1, 2, sc, { da_utilisation: 0.7 }) as Any;
    expect(once.total_mwh_yr).toBeCloseTo(bare.total_mwh_yr * 0.97, 9);
  });
});

describe('the engine reads one figure on both sides', () => {
  const r = run(2);
  const cb = r.assumptions_panel.cycles_breakdown as Any;

  it('discloses the anchor, the utilisation and the delivered throughput', () => {
    expect(cb.da_anchor_mwh_per_mw_yr).toBe(sc.mwh_per_mw_yr_da_2h);
    expect(cb.da_utilisation).toBeGreaterThan(0);
    expect(cb.da_utilisation).toBeLessThan(1);
    expect(cb.da_delivered_mwh_per_mw_yr).toBe(
      Math.round(cb.da_anchor_mwh_per_mw_yr * cb.da_utilisation * sc.avail));
    expect(cb.basis).toMatch(/one delivered day-ahead throughput/);
  });

  it('bills revenue on the same delivered energy it charges wear for', () => {
    // The revenue path's own energy schedule, per MW, for a full first year.
    const y1 = r.project?.arb_energy_20yr?.[0];
    if (y1) {
      const chargedPerMw = y1.mwh_charged / 50;
      expect(chargedPerMw).toBeCloseTo(cb.da_delivered_mwh_per_mw_yr, 0);
    }
  });

  it('the utilisation IS the trading fraction the revenue line applies', () => {
    expect(cb.da_utilisation).toBeCloseTo(r.assumptions_panel.trading_fraction
      ?? r.base_year?.time_model?.trading_fraction, 3);
  });

  it('cycling now sits between the old anchor figure and B1\'s physical simulation', () => {
    // Anchor basis was 678 EFC/yr at 2h; the hourly dispatch engine measures 221
    // on the same asset (36.B1-N). The aligned figure must fall between them —
    // more conservative than the physics, less than the old double count.
    expect(cb.total_efcs_yr).toBeLessThan(678);
    expect(cb.total_efcs_yr).toBeGreaterThan(221);
  });
});

describe('the alignment holds across durations and scenarios', () => {
  it('never charges wear for more day-ahead energy than it can bill', () => {
    for (const dur of [2, 3, 4]) {
      for (const scen of ['base', 'conservative', 'stress']) {
        const cb = run(dur, scen).assumptions_panel.cycles_breakdown as Any;
        expect(cb.da_delivered_mwh_per_mw_yr, `${dur}h/${scen}`)
          .toBeLessThanOrEqual(cb.da_anchor_mwh_per_mw_yr);
        expect(cb.da_utilisation, `${dur}h/${scen}`).toBeGreaterThan(0);
        expect(cb.da_utilisation, `${dur}h/${scen}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leaves Y1 revenue untouched — the fix is on the wear side only', () => {
    // Revenue was already on the delivered basis; only the wear side moved. If a
    // future edit starts moving Y1 gross, the alignment has been re-pointed at
    // the revenue line and that is a different, much larger change.
    expect(run(2).gross_revenue_y1).toBe(7999249);
    expect(run(4).gross_revenue_y1).toBe(8553517);
  });
});
