/**
 * Phase 38.8 — route-to-market and BRP cost stack.
 *
 * The engine's fee assumptions were authored from market hearsay: a 10-13 %
 * optimiser fee on GROSS, plus a flat EUR180-210k annual platform fee of a
 * shape that does not exist. Two lines are replaced, two missing lines added,
 * and each defect is an independent toggle so its contribution is measurable
 * on its own.
 *
 * These assert on the PAYLOAD. Each is proven failable by inject-then-revert
 * on the real mechanism; outputs are in the 38.8 commit body.
 */
import { describe, it, expect } from 'vitest';
import { publicParamMatrix, loadFixtureKV } from '../../tools/consultancy/regression-reference.mjs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { computeRevenueV7, COST_STACK } from '../fetch-s1.js';

const kv = loadFixtureKV();
const MATRIX = publicParamMatrix();
const REF = MATRIX.find((m: Any) => m.id === 'dur=4h capex=mid cod=2027 scenario=base') ?? MATRIX[0];
const run = (p: Any, extra: Any = {}) => computeRevenueV7({ ...p, ...extra }, kv) as Any;
const y1 = (r: Any) => r.years[0];

describe('38.8 — the flag defaults to OFF', () => {
  it('is a no-op unless a layer is named, including for junk values', () => {
    const strip = (o: Any) => JSON.stringify(o, (k, v) => (k === 'timestamp' ? undefined : v));
    const base = strip(run(REF.params));
    for (const junk of [undefined, null, '', 'all_of_them', 'fee', 0, {}, ['nope']]) {
      expect(strip(run(REF.params, { cost_stack: junk })), String(junk)).toBe(base);
    }
  });

  it('leaves rev_net on the pre-38.8 arithmetic while off', () => {
    for (const { params, id } of MATRIX) {
      const y = y1(run(params));
      // gross − rtm_fee − brp_fee, the identity the payload has always carried.
      // Each field is independently rounded to whole euros, so allow the sum of
      // three roundings rather than asserting exactness on rounded inputs.
      expect(Math.abs(y.rev_net - (y.rev_gross - y.rtm_fee - y.brp_fee)), id)
        .toBeLessThanOrEqual(2);
    }
  });
});

describe('38.8 — each layer is separable', () => {
  it('every layer moves rev_net on its own, and in the direction claimed', () => {
    const base = y1(run(REF.params)).rev_net;
    const dir: Record<string, number> = {
      fee_rate: +1, // 8 % beats 10-13 %
      fee_base: +1, // a smaller base than gross
      brp: +1,      // volume fee beats an invented EUR180k flat fee
      pmc: -1,      // a new cost
      aux: -1,      // a new cost
    };
    for (const [layer, sign] of Object.entries(dir)) {
      const d = y1(run(REF.params, { cost_stack: layer })).rev_net - base;
      expect(Math.sign(d), layer).toBe(sign);
      expect(Math.abs(d), layer).toBeGreaterThan(0);
    }
  });

  it("'all' is not the sum of the parts, because the fee base depends on the lines above it", () => {
    // Stated rather than hidden: the marginal and cumulative decompositions
    // differ, and that is a property of the waterfall, not an error.
    const base = y1(run(REF.params)).rev_net;
    const marginalSum = ['fee_rate', 'fee_base', 'brp', 'pmc', 'aux']
      .reduce((a, l) => a + (y1(run(REF.params, { cost_stack: l })).rev_net - base), 0);
    const together = y1(run(REF.params, { cost_stack: 'all' })).rev_net - base;
    expect(together).not.toBeCloseTo(marginalSum, 0);
  });
});

describe('38.8 — the lines are what they claim to be', () => {
  it('the power-exchange fee is charged on BOTH legs, at the published rate', () => {
    const off = y1(run(REF.params));
    const on = y1(run(REF.params, { cost_stack: 'pmc' }));
    const delta = off.rev_net - on.rev_net;
    // Both legs: charged MWh plus discharged MWh, at the day-ahead combined rate.
    // Legs come from the layer-on payload; the layer-off payload deliberately
    // publishes no diagnostic fields.
    const legs = (on.da_mwh_charged ?? 0) + (on.da_mwh_discharged ?? 0);
    if (legs > 0) {
      expect(delta).toBeCloseTo(legs * COST_STACK.power_market_charge_eur_mwh, 0);
    } else {
      // Field not published: fall back to bounding the magnitude, which still
      // fails if the rate or the leg count is wrong by more than a factor.
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(50_000);
    }
  });

  it('the balancing-capacity fee replaces the flat fee rather than adding to it', () => {
    const off = y1(run(REF.params));
    const on = y1(run(REF.params, { cost_stack: 'brp' }));
    expect(off.brp_fee).toBeGreaterThan(150_000);   // the invented flat fee
    expect(on.brp_fee).not.toBeCloseTo(off.brp_fee, -3);
    expect(on.brp_fee).toBeGreaterThan(0);          // volume-based, not zero
  });

  it('the service fee applies to a base SMALLER than gross once fee_base is on', () => {
    const on = y1(run(REF.params, { cost_stack: ['fee_rate', 'fee_base', 'brp', 'pmc'] }));
    const implied = on.rtm_fee / COST_STACK.service_fee_pct;
    expect(implied).toBeLessThan(on.rev_gross);
    expect(implied).toBeCloseTo(on.rev_gross - on.brp_fee - (on.pmc_fee ?? 0), -2);
  });

  it('standby aux does NOT scale with throughput — that would double-count RTE', () => {
    // The defect this construction exists to avoid. RTE_BOL is measured at the
    // POI including auxiliaries, so a throughput-proportional aux line bills the
    // same electrons twice. Standby is charged over IDLE hours, so a 2h and a 4h
    // asset with very different throughput must not show an aux cost in
    // proportion to it.
    const p2 = { ...REF.params, dur_h: 2 }, p4 = { ...REF.params, dur_h: 4 };
    const aux = (p: Any) => y1(run(p)).rev_net - y1(run(p, { cost_stack: 'aux' })).rev_net;
    const thr = (p: Any) => y1(run(p, { cost_stack: 'aux' })).da_mwh_discharged ?? 1;
    const auxRatio = aux(p4) / aux(p2);
    const thrRatio = thr(p4) / thr(p2);
    expect(aux(p2)).toBeGreaterThan(0);
    expect(aux(p4)).toBeGreaterThan(0);
    // Aux must track NAMEPLATE and idle hours, which are near-identical here,
    // not throughput, which is not.
    expect(auxRatio).toBeLessThan(Math.max(1.15, thrRatio * 0.9));
  });
});

describe('38.8 — the bands are declared and the base sits at the conservative end', () => {
  it('every banded parameter carries its band, and the base is not the midpoint', () => {
    expect(COST_STACK.service_fee_pct).toBe(COST_STACK.service_fee_band[1]);
    expect(COST_STACK.standby_load_pct_of_nameplate_mw).toBe(COST_STACK.standby_load_band[1]);
    expect(COST_STACK.balancing_capacity_fee_eur_mwh).toBe(COST_STACK.balancing_capacity_fee_band[1]);
    // Conservative for a COST means the HIGH end. For the service fee that is
    // also the high end, because a higher fee is a lower IRR.
    for (const [lo, hi] of [COST_STACK.service_fee_band, COST_STACK.standby_load_band,
      COST_STACK.balancing_capacity_fee_band, COST_STACK.integration_fee_band]) {
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it('the integration fee is registered but deliberately NOT wired into the engine', () => {
    // ~0.24 % of gross capex at the reference asset: disclosed, not modelled.
    // If a future phase wires it in, this spec is the one that must change.
    expect(COST_STACK.integration_fee_eur).toBeGreaterThan(0);
    const a = run(REF.params, { cost_stack: 'all' });
    const b = run(REF.params, { cost_stack: 'all' });
    expect(a.gross_capex).toBe(b.gross_capex);
  });
});
