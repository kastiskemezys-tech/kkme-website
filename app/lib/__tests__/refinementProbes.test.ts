import { describe, it, expect } from 'vitest';

// Phase 7.7b Session 2 — operational refinement probes.
//
// Each describe block asserts the CURRENT v7 engine behavior for one of the
// six refinements catalogued in docs/audits/phase-7-7b/stack-audit-addendum-2026-04-26.md.
// When Session 3 ships v7.1 (refinements 1.3 + 1.6 + aFRR rate tune), the
// probes for those refinements need to flip from "asserts v7 current" to
// "asserts v7.1 new." The diff in this file is the visible audit trail of
// which refinement actually landed.
//
// Probes that do NOT need updating after Session 3:
//   1.1 (deferred), 1.2 (deferred), 1.4 (no-action — static hierarchy fine).
// Probes that DO need updating after Session 3:
//   1.3 (bid-acceptance becomes PRESENT), 1.5 (act_rate_afrr 0.18 → 0.25),
//   1.6 (per-product cpi exposed in payload), and the model_version stamp.

import base2h          from '../../../docs/audits/phase-7-7b/baseline-base-2h.json';
import base4h          from '../../../docs/audits/phase-7-7b/baseline-base-4h.json';
import conservative2h  from '../../../docs/audits/phase-7-7b/baseline-conservative-2h.json';
import conservative4h  from '../../../docs/audits/phase-7-7b/baseline-conservative-4h.json';
import stress2h        from '../../../docs/audits/phase-7-7b/baseline-stress-2h.json';
import stress4h        from '../../../docs/audits/phase-7-7b/baseline-stress-4h.json';

type Y1Year = {
  yr: number;
  cal_year: number;
  R: number;
  T: number;
  trading_fraction: number;
  market_depth: number;
  rev_bal: number;
  rev_trd: number;
  rev_gross: number;
  // Probe-target fields — currently undefined in v7; expected after v7.1:
  bid_acceptance_factor?: number;
  cpi_fcr?: number;
  cpi_afrr?: number;
  cpi_mfrr?: number;
  soc_banding_factor?: number;
  activation_interruption_factor?: number;
};

type SignalInputs = {
  s1_capture: number;
  afrr_clearing: number;
  mfrr_clearing: number;
  afrr_cap: number;
  mfrr_cap: number;
  // Probe-target — currently undefined in v7; expected after Session 3 if 1.3 ships:
  bid_acceptance_afrr?: number;
  bid_acceptance_mfrr?: number;
  bid_acceptance_fcr?: number;
};

type TimeModel = {
  effective_arb_pct: number;
  trading_fraction: number;
  R_base: number;
  T_base: number;
  // Probe-target — currently undefined in v7; expected if 1.1 / 1.2 ship later:
  soc_banding_factor?: number;
  activation_interruption_factor?: number;
};

type Fixture = {
  scenario: string;
  duration: number;
  model_version: string;
  cpi_at_cod: number;
  signal_inputs: SignalInputs;
  base_year: { time_model: TimeModel };
  years: Y1Year[];
  // Probe-target — currently undefined in v7; expected after 1.6 ships:
  cpi_fcr_at_cod?: number;
  cpi_afrr_at_cod?: number;
  cpi_mfrr_at_cod?: number;
};

const ALL: Array<[string, Fixture]> = [
  ['base 2h',          base2h          as unknown as Fixture],
  ['base 4h',          base4h          as unknown as Fixture],
  ['conservative 2h',  conservative2h  as unknown as Fixture],
  ['conservative 4h',  conservative4h  as unknown as Fixture],
  ['stress 2h',        stress2h        as unknown as Fixture],
  ['stress 4h',        stress4h        as unknown as Fixture],
];

describe('Phase 7.7b refinement probes — current v7 baseline', () => {
  describe('model_version stamp', () => {
    // Session 3 flips this to 'v7.1'. Updating these strings is the most
    // visible signal that v7.1 has landed.
    it.each(ALL)('%s reports model_version "v7"', (_label, fixture) => {
      expect(fixture.model_version).toBe('v7');
    });
  });

  describe('Refinement 1.1 — SoC-banding penalty (DEFERRED, probe stays after Session 3)', () => {
    it.each(ALL)('%s: no explicit soc_banding_factor in time_model', (_label, fixture) => {
      expect(fixture.base_year.time_model.soc_banding_factor).toBeUndefined();
    });
    it.each(ALL)('%s: no soc_banding_factor in any projection year', (_label, fixture) => {
      const anyHasIt = fixture.years.some(y => y.soc_banding_factor !== undefined);
      expect(anyHasIt).toBe(false);
    });
  });

  describe('Refinement 1.2 — Activation interruption on arbitrage (DEFERRED, probe stays after Session 3)', () => {
    it.each(ALL)('%s: no explicit activation_interruption_factor in time_model', (_label, fixture) => {
      expect(fixture.base_year.time_model.activation_interruption_factor).toBeUndefined();
    });
    it.each(ALL)('%s: no activation_interruption_factor in any projection year', (_label, fixture) => {
      const anyHasIt = fixture.years.some(y => y.activation_interruption_factor !== undefined);
      expect(anyHasIt).toBe(false);
    });
  });

  describe('Refinement 1.3 — Bid-acceptance saturation (SHIPS in Session 3 — flip these probes)', () => {
    // CURRENT v7: no bid_acceptance_factor anywhere in payload.
    // AFTER v7.1: expect signal_inputs.bid_acceptance_{afrr,mfrr,fcr} present and < 1.0,
    //             and years[*].bid_acceptance_factor present.
    it.each(ALL)('%s: no bid_acceptance_factor in projection years (v7 baseline)', (_label, fixture) => {
      const anyHasIt = fixture.years.some(y => y.bid_acceptance_factor !== undefined);
      expect(anyHasIt).toBe(false);
    });
    it.each(ALL)('%s: no bid_acceptance_* fields in signal_inputs (v7 baseline)', (_label, fixture) => {
      expect(fixture.signal_inputs.bid_acceptance_afrr).toBeUndefined();
      expect(fixture.signal_inputs.bid_acceptance_mfrr).toBeUndefined();
      expect(fixture.signal_inputs.bid_acceptance_fcr).toBeUndefined();
    });
  });

  describe('Refinement 1.4 — Hierarchy preference (NO-ACTION — probe stays after Session 3)', () => {
    // Static hierarchy is encoded in fixed RESERVE_PRODUCTS shares (FCR 0.16,
    // aFRR 0.34, mFRR 0.50). Externally observable signal: rev_bal (capacity +
    // activation) is identical between 2h and 4h within scenario, AND scales
    // monotonically across scenarios — confirming static, scenario-driven
    // shares (not duration-driven, not dynamically rebalanced by clearing
    // prices). Session 1's revenueStackFixture spec already asserts the 2h/4h
    // identity; here we additionally guard the cross-scenario monotonicity.
    it('rev_bal scales monotonically: stress < conservative < base (within duration)', () => {
      const balOf = (f: Fixture) => f.years[0].rev_bal;
      expect(balOf(stress2h as unknown as Fixture))
        .toBeLessThan(balOf(conservative2h as unknown as Fixture));
      expect(balOf(conservative2h as unknown as Fixture))
        .toBeLessThan(balOf(base2h as unknown as Fixture));
      expect(balOf(stress4h as unknown as Fixture))
        .toBeLessThan(balOf(conservative4h as unknown as Fixture));
      expect(balOf(conservative4h as unknown as Fixture))
        .toBeLessThan(balOf(base4h as unknown as Fixture));
    });
  });

  describe('Refinement 1.5 — Per-product activation rates (PRESENT — Session 3 tunes aFRR 0.18 → 0.25)', () => {
    // Engine exposes per-product clearing prices for aFRR and mFRR.
    // FCR has none (FCR pays only capacity in Baltic markets — operationally correct).
    it.each(ALL)('%s: signal_inputs exposes distinct afrr_clearing and mfrr_clearing', (_label, fixture) => {
      expect(typeof fixture.signal_inputs.afrr_clearing).toBe('number');
      expect(typeof fixture.signal_inputs.mfrr_clearing).toBe('number');
      expect(fixture.signal_inputs.afrr_clearing)
        .not.toBe(fixture.signal_inputs.mfrr_clearing);
    });
    it.each(ALL)('%s: no fcr_clearing in signal_inputs (FCR is capacity-only in Baltic)', (_label, fixture) => {
      expect((fixture.signal_inputs as unknown as Record<string, unknown>).fcr_clearing)
        .toBeUndefined();
    });
    // After v7.1: activation_y1 will rise (aFRR rate 0.18 → 0.25, ~38% bump on
    // aFRR activation revenue). Probe captures the v7-anchor magnitude per MW.
    it('base 4h activation_y1 reflects v7 act_rate_afrr=0.18 / act_rate_mfrr=0.10 baseline', () => {
      const activation_per_mw = base4h.activation_y1 / 50;
      // v7 base 4h: 1,265,284 / 50 = 25,306 €/MW/yr.
      // Sanity bounds — if v7.1 lands and the spec wasn't updated, this fails loudly.
      expect(activation_per_mw).toBeGreaterThan(20_000);
      expect(activation_per_mw).toBeLessThan(30_000);
    });
  });

  describe('Refinement 1.6 — Cannibalization mechanics (PARTIAL — Session 3 ships per-product cpi)', () => {
    // CURRENT v7: single aggregate cpi_at_cod. AFTER v7.1: per-product
    // cpi_fcr_at_cod / cpi_afrr_at_cod / cpi_mfrr_at_cod present.
    it.each(ALL)('%s: exposes single aggregate cpi_at_cod (v7 baseline)', (_label, fixture) => {
      expect(typeof fixture.cpi_at_cod).toBe('number');
      expect(fixture.cpi_at_cod).toBeGreaterThan(0);
      expect(fixture.cpi_at_cod).toBeLessThan(2.1); // CPI capped at 2.0 in scarcity
    });
    it.each(ALL)('%s: NO per-product cpi fields exposed (v7 baseline)', (_label, fixture) => {
      expect(fixture.cpi_fcr_at_cod).toBeUndefined();
      expect(fixture.cpi_afrr_at_cod).toBeUndefined();
      expect(fixture.cpi_mfrr_at_cod).toBeUndefined();
    });
    it('all 6 fixtures share the same cpi_at_cod (single aggregate, scenario-invariant for COD 2028)', () => {
      // Confirms cpi is driven purely by aggregate sd_ratio at cod_year, not
      // adjusted per scenario. Session 3 may break this if per-scenario
      // bid-acceptance compounds with cpi differently per product.
      const cpis = ALL.map(([, f]) => f.cpi_at_cod);
      const allSame = cpis.every(c => c === cpis[0]);
      expect(allSame).toBe(true);
    });
  });

  describe('Operational reframe artefacts (Session 1 surfaced these — keep visible after v7.1)', () => {
    // The engine still computes effective_arb_pct as a diagnostic. Session 1
    // misread this as evidence of double-counting; Session 2 confirmed the
    // additive structure is operationally valid. The diagnostic stays.
    it.each(ALL)('%s: time_model.effective_arb_pct present as diagnostic', (_label, fixture) => {
      expect(typeof fixture.base_year.time_model.effective_arb_pct).toBe('number');
      expect(fixture.base_year.time_model.effective_arb_pct).toBeGreaterThan(0);
      expect(fixture.base_year.time_model.effective_arb_pct).toBeLessThan(1);
    });
    it.each(ALL)('%s: time_model.trading_fraction differs from effective_arb_pct (price-ratio vs time-slice — both are valid views)', (_label, fixture) => {
      const tm = fixture.base_year.time_model;
      expect(tm.trading_fraction).not.toBeCloseTo(tm.effective_arb_pct, 1);
    });
  });
});
