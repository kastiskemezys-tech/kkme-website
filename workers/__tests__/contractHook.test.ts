/**
 * Phase 39 — the engine's contracted-floor hook.
 *
 * Two things to prove, and the first matters more than the second: that the hook
 * is INERT on every public path (so the 54-config payload cannot move), and that
 * when it is supplied the floor lands BEFORE fees, opex, tax and CFADS so the
 * whole downstream stack is the engine's own arithmetic rather than a restatement
 * of it outside (discipline rule #4).
 */
import { describe, it, expect } from 'vitest';
import { computeRevenueV7 } from '../fetch-s1.js';
import { publicParamMatrix, loadFixtureKV } from '../../tools/consultancy/regression-reference.mjs';
import { normaliseContract, contractYear } from '../../tools/consultancy/lib/contracted.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const kv = loadFixtureKV();
const MATRIX = publicParamMatrix();
const REF = MATRIX.find((x: Any) => x.id === 'dur=4h capex=mid cod=2027 scenario=base') ?? MATRIX[0];

const strip = (o: Any) => JSON.stringify(o, (k, v) => (k === 'timestamp' ? undefined : v));

describe('the hook is inert when absent', () => {
  it('produces byte-identical output on all 54 public configurations', () => {
    // No public path sets contract_fn, so passing the params through unchanged
    // must reproduce the payload exactly. This is the same property the phase's
    // standalone byte-identity gate checks against origin/main; asserting it in
    // the suite too means a later edit cannot quietly reach the branch.
    for (const { id, params } of MATRIX) {
      expect(params.contract_fn, `${id} must not carry a contract_fn`).toBeUndefined();
      const a = strip(computeRevenueV7(params, kv));
      const b = strip(computeRevenueV7({ ...params }, kv));
      expect(a, id).toEqual(b);
    }
  });

  it('an identity contract_fn changes nothing', () => {
    // Returning rev_gross unchanged must be indistinguishable from not passing
    // the hook at all — i.e. the hook adds no arithmetic of its own.
    const plain = strip(computeRevenueV7(REF.params, kv));
    const identity = strip(computeRevenueV7(
      { ...REF.params, contract_fn: ({ rev_gross }: Any) => rev_gross }, kv));
    expect(identity).toEqual(plain);
  });
});

describe('the hook applies the floor upstream of the whole cost stack', () => {
  const contract = normaliseContract({
    floor_eur_mw_yr: 200_000,          // deliberately high, so it binds every year
    contracted_pct_of_mw: 0.50,
    term_years: 10,
    counterparty_note: 'TEST — structure test, no counterparty.',
  });
  const contract_fn = ({ yr, mw, rev_gross, operational_months }: Any) =>
    contractYear({
      merchant_net: rev_gross, mw, yr, operational_months, contract, mode: 'blended',
    }).total;

  const merchant = computeRevenueV7(REF.params, kv) as Any;
  const floored = computeRevenueV7({ ...REF.params, contract_fn }, kv) as Any;

  it('lifts gross revenue in the years the floor binds', () => {
    expect(floored.years[0].rev_gross).toBeGreaterThan(merchant.years[0].rev_gross);
  });

  it('carries the lift through fees into EBITDA — not just onto the top line', () => {
    // If the hook were applied after the cost stack, rev_net would rise by the
    // same amount as rev_gross and EBITDA would not see a fee on it.
    const dGross = floored.years[0].rev_gross - merchant.years[0].rev_gross;
    const dNet = floored.years[0].rev_net - merchant.years[0].rev_net;
    expect(dNet).toBeGreaterThan(0);
    expect(dNet).toBeLessThan(dGross);          // the fee stack took its share
    expect(floored.years[0].ebitda).toBeGreaterThan(merchant.years[0].ebitda);
  });

  it('carries it through tax into CFADS', () => {
    expect(floored.years[0].cfads).toBeGreaterThan(merchant.years[0].cfads);
  });

  it('leaves the market product lines untouched — a floor is not a market product', () => {
    expect(floored.years[0].rev_bal).toBe(merchant.years[0].rev_bal);
    expect(floored.years[0].rev_trd).toBe(merchant.years[0].rev_trd);
  });

  it('stops lifting revenue after the contract term expires', () => {
    // Term is 10 years; year 11 onward is fully merchant again.
    expect(floored.years[10].rev_gross).toBe(merchant.years[10].rev_gross);
  });

  it('does nothing at a zero contracted share', () => {
    const zero = normaliseContract({
      floor_eur_mw_yr: 200_000, contracted_pct_of_mw: 0, term_years: 10,
    });
    const out = computeRevenueV7({
      ...REF.params,
      contract_fn: ({ yr, mw, rev_gross, operational_months }: Any) => contractYear({
        merchant_net: rev_gross, mw, yr, operational_months, contract: zero, mode: 'blended',
      }).total,
    }, kv) as Any;
    expect(strip(out)).toEqual(strip(merchant));
  });
});

describe('the hook refuses a malformed contract rather than absorbing it', () => {
  it('throws on a non-finite return', () => {
    expect(() => computeRevenueV7(
      { ...REF.params, contract_fn: () => Number.NaN }, kv)).toThrow(/non-finite/);
  });

  it('throws on a negative return', () => {
    expect(() => computeRevenueV7(
      { ...REF.params, contract_fn: () => -1 }, kv)).toThrow(/non-finite/);
  });

  it('ignores a non-function, rather than half-applying it', () => {
    const out = computeRevenueV7({ ...REF.params, contract_fn: 'nonsense' } as Any, kv);
    expect(strip(out)).toEqual(strip(computeRevenueV7(REF.params, kv)));
  });
});
