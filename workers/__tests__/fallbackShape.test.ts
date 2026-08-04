/**
 * Phase 49 item 3 — the CLASS guard: a fallback must produce the primary's shape.
 *
 * Fallback paths are where defects live, because they are exercised rarely and
 * reviewed never. `/revenue` has three of them and none was keeping the
 * contract; the one that mattered most had been shipping a payload missing 19
 * top-level keys, including `moic`, `lcos_eur_mwh` and `debt_sizing`, with a
 * 200 status and nothing to distinguish it from a healthy response.
 *
 * The guard forces the fallback by REMOVING the input it depends on, rather than
 * waiting for the condition to occur in production (method §3). Two removals,
 * two different fallbacks, both measured on the frozen KV fixture:
 *
 *   delete kv.s1_capture                 -> v6 fallback, 78 keys -> 59
 *   delete kv.s1_capture.capture_2h/4h   -> v7 with substituted inputs, where
 *                                           signal_inputs.s1_capture was
 *                                           back-derived as €818.59 against an
 *                                           observed €101.91 (8.03x)
 */
import { describe, it, expect } from 'vitest';
import { computeRevenueV7, REVENUE_PAYLOAD_KEYS } from '../fetch-s1.js';
import { loadFixtureKV, publicParamMatrix } from '../../tools/consultancy/regression-reference.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const PARAMS = publicParamMatrix().find(
  (m: Any) => m.id === 'dur=2h capex=mid cod=2028 scenario=base',
)!.params;

const kvPrimary = () => loadFixtureKV();
const kvNoCapture = () => { const k = loadFixtureKV(); delete k.s1_capture; return k; };
const kvNoDayCapture = () => {
  const k = loadFixtureKV();
  delete k.s1_capture.capture_2h;
  delete k.s1_capture.capture_4h;
  return k;
};

const keys = (o: Any) => Object.keys(o).filter((k) => k !== 'degraded').sort();

describe('class guard · every /revenue fallback keeps the primary payload shape', () => {
  it('the declared key list matches what the primary path actually emits', () => {
    // Without this, REVENUE_PAYLOAD_KEYS is a hardcoded list that rots the
    // moment someone adds a v7 field (A9). Checked against ALL 54 so a shape
    // that varies by configuration is caught too.
    for (const { id, params } of publicParamMatrix() as Any[]) {
      expect(keys(computeRevenueV7(params, kvPrimary())), id).toEqual([...REVENUE_PAYLOAD_KEYS].sort());
    }
  });

  it('the v6 fallback (no s1_capture at all) emits the same keys, not 19 fewer', () => {
    const primary = computeRevenueV7(PARAMS, kvPrimary());
    const fallback = computeRevenueV7(PARAMS, kvNoCapture()) as Any;
    expect(fallback.model_version).toBe('v6_fallback');
    expect(keys(fallback)).toEqual(keys(primary));
  });

  it('the v6 fallback declares itself degraded and names what it could not compute', () => {
    // B12: the absence of provenance is an error state, never an innocent one.
    // A degraded payload that looks exactly like a healthy one is the failure.
    const fallback = computeRevenueV7(PARAMS, kvNoCapture()) as Any;
    expect(fallback.degraded).toBeTruthy();
    expect(fallback.degraded.engine).toBe('v6_fallback');
    expect(fallback.degraded.reason).toMatch(/s1_capture history/);
    expect(fallback.degraded.fields_unavailable).toContain('moic');
    expect(fallback.degraded.fields_unavailable).toContain('lcos_eur_mwh');
    expect(fallback.degraded.fields_unavailable).toContain('debt_sizing');
    // And the named fields are present-and-null, not absent — a consumer can
    // tell "not available" from "not in the schema".
    for (const f of fallback.degraded.fields_unavailable) {
      expect(f in fallback, `${f} declared`).toBe(true);
      expect(fallback[f], `${f} value`).toBeNull();
    }
  });

  it('a healthy payload carries NO degraded key — the flag means something', () => {
    const primary = computeRevenueV7(PARAMS, kvPrimary()) as Any;
    expect('degraded' in primary).toBe(false);
  });

  it('stops publishing a back-derived capture as an observed signal input', () => {
    // Was €818.59 against an observed €101.91. The forward pass multiplies by
    // trading_fraction (0.70); the inverse divided by effective_arb_pct (0.139).
    // It was never the inverse of anything.
    const primary = computeRevenueV7(PARAMS, kvPrimary()) as Any;
    const degraded = computeRevenueV7(PARAMS, kvNoDayCapture()) as Any;

    expect(primary.signal_inputs.s1_capture).toBeCloseTo(101.91, 2);
    expect(degraded.signal_inputs.s1_capture).toBeNull();
    // The specific number that used to come out, asserted so a re-introduction
    // is recognisable rather than merely non-null.
    expect(degraded.signal_inputs.s1_capture).not.toBeCloseTo(818.59, 1);
  });

  it('records the LCOS charge-price substitution instead of making it silently', () => {
    // The quietest of the three: lcos_eur_mwh moves 197.3 -> 225.3 (+14.2 %)
    // because an observed €12.04 charge price is replaced by a €35 constant,
    // with nothing in the payload saying so.
    const degraded = computeRevenueV7(PARAMS, kvNoDayCapture()) as Any;
    const fields = degraded.degraded.substitutions.map((s: Any) => s.field);
    expect(fields).toContain('lcos_eur_mwh');
    expect(fields).toContain('signal_inputs.s1_capture');
  });

  it('the degraded v7 path still keeps the primary shape', () => {
    const primary = computeRevenueV7(PARAMS, kvPrimary());
    const degraded = computeRevenueV7(PARAMS, kvNoDayCapture());
    expect(keys(degraded)).toEqual(keys(primary));
  });
});
