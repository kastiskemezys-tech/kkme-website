/**
 * Phase 43 — the numerics, units and time audit, as assertions.
 *
 * Everything here runs against REAL recorded documents or the REAL engine.
 * The prompt is explicit that DST and MTU must not be tested with synthetic
 * 24-hour days, and it is right: a synthetic day is a restatement of the
 * assumption under test. All four A44 fixtures below were fetched live on
 * 2026-08-03 from ENTSO-E and are committed verbatim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseA44Periods, pricesForUtcDay, calcIRRForAudit, solveIRR, irrStatusFor } from '../fetch-s1.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(here, 'fixtures', n), 'utf8');

describe('§2 · time — DST, on the real documents for the real transition days', () => {
  it('reads a 25-hour market day (autumn transition 2025-10-26) as 100 quarter-hours', () => {
    // An aggregation that assumes 24 slots is wrong twice a year and nobody
    // notices. The autumn day genuinely has 100.
    const p = parseA44Periods(fx('entsoe-a44-lt-2025-10-26-dst-autumn.xml'));
    const day = p.find((x) => new Date(x.startMs).toISOString() === '2025-10-25T22:00:00.000Z')!;
    expect((day.endMs - day.startMs) / 3600000).toBe(25);
    expect(day.prices).toHaveLength(100);
  });

  it('reads a 23-hour market day (spring transition 2026-03-29) as 92 quarter-hours', () => {
    const p = parseA44Periods(fx('entsoe-a44-lt-2026-03-29-dst-spring.xml'));
    const day = p.find((x) => new Date(x.startMs).toISOString() === '2026-03-28T23:00:00.000Z')!;
    expect((day.endMs - day.startMs) / 3600000).toBe(23);
    expect(day.prices).toHaveLength(92);
  });

  it('still yields exactly 96 UTC slots on both transition days', () => {
    // A UTC calendar day is 24 hours on every day of the year, including the two
    // on which the local day is not. Addressing the day by wall-clock UTC rather
    // than by array index is what makes this true by construction rather than by
    // luck — and it is why the DST case needs no special path.
    for (const [file, day] of [
      ['entsoe-a44-lt-2025-10-26-dst-autumn.xml', '2025-10-26'],
      ['entsoe-a44-lt-2026-03-29-dst-spring.xml', '2026-03-29'],
    ] as const) {
      const d = pricesForUtcDay(parseA44Periods(fx(file)), day)!;
      expect(d.prices, `${day}`).toHaveLength(96);
      expect(d.resolution).toBe(15);
    }
  });
});

describe('§2 · market time unit — the Baltic PT60M → PT15M cutover, from the primary source', () => {
  // Probed, not assumed: the prompt says explicitly not to take the Baltic MTU
  // date on trust. These two documents are the evidence.
  it('2025-09-29 is still hourly — 24 points per market day', () => {
    const p = parseA44Periods(fx('entsoe-a44-lt-2025-09-29-pt60m.xml'));
    expect(p.every((x) => x.resolutionMin === 60)).toBe(true);
    expect(p[0].prices).toHaveLength(24);
    expect(pricesForUtcDay(p, '2025-09-29')!.resolution).toBe(60);
  });

  it('2025-10-01 is quarter-hourly — 96 points per market day', () => {
    const p = parseA44Periods(fx('entsoe-a44-lt-2025-10-01-pt15m.xml'));
    expect(p.every((x) => x.resolutionMin === 15)).toBe(true);
    expect(p[0].prices).toHaveLength(96);
    expect(pricesForUtcDay(p, '2025-10-01')!.resolution).toBe(15);
  });

  it('the resolution comes from the document, never from the array length', () => {
    // The failure this forbids: inferring resolution from `prices.length === 24
    // ? 60 : 15`. That inference is what a two-TimeSeries response (190 values)
    // and a DST day (184, 188) both break, and it breaks silently.
    const autumn = parseA44Periods(fx('entsoe-a44-lt-2025-10-26-dst-autumn.xml'));
    const oddLength = autumn.find((x) => x.prices.length === 100)!;
    expect(oddLength.resolutionMin).toBe(15);   // 100 points, still quarter-hourly
    const hourly = parseA44Periods(fx('entsoe-a44-lt-2025-09-29-pt60m.xml'))[0];
    expect(hourly.prices.length).toBe(24);
    expect(hourly.resolutionMin).toBe(60);
  });
});

describe('§3 · the IRR solver, driven past the happy path', () => {
  // ── Phase 49 item 2 — FIVE ASSERTIONS INVERTED ─────────────────────────────
  //
  // The five tests in this block used to assert the defect. That was correct at
  // the time: Phase 43 was an audit, and characterising a bug you are not yet
  // authorised to fix is what an audit produces. Phase 49 fixed it, so each of
  // those assertions is now inverted to assert the defect's ABSENCE rather than
  // deleted — the B-036 precedent, and the reason a reader of this file can still
  // see what used to be true. The old expectations are quoted in each case.
  //
  // The 54 public configurations are profitable everywhere (measured: min IRR
  // -6.07 %, max 22.9 %, no nulls, no `uneconomic` status), so running the
  // public matrix cannot reach any of these branches at all.
  it('solves a conventional stream exactly', () => {
    expect(calcIRRForAudit([-1000, 1100])).toBeCloseTo(0.10, 4);
  });

  it('INVERTED: refuses to return the LOWER bracket endpoint when no root exists', () => {
    // Was: `expect(calcIRRForAudit([-1000, -100, -100])).toBeCloseTo(-0.99, 6)`.
    // An all-negative stream has no sign change, so no IRR exists at all — and
    // that is now what it says, rather than reporting the bisection floor.
    const s = solveIRR([-1000, -100, -100]);
    expect(s.value).toBeNull();
    expect(s.reason).toBe('no_sign_change');
    expect(calcIRRForAudit([-1000, -100, -100])).toBeNull();
  });

  it('INVERTED: refuses to return the UPPER bracket endpoint as an apparent 200% IRR', () => {
    // Was: `expect(calcIRRForAudit([-100, 10000, 10000])).toBe(2)` — published
    // as a 200 % return. The true IRR of that stream is ~10 000 %, which is not
    // a return either; outside the domain is null with a reason, and the edge it
    // ran off is recorded as a diagnostic rather than as a value.
    const s = solveIRR([-100, 10000, 10000]);
    expect(s.value).toBeNull();
    expect(s.reason).toBe('not_converged');
    expect(s.bound).toBe('above_domain');
  });

  it('INVERTED: returns null for an all-zero cash flow, where IRR is undefined', () => {
    // Was: `toBeCloseTo(-0.99, 6)` plus an explicit `Number.isFinite(...) === true`
    // — "…and it looks like data" was the old comment, and that was the whole
    // complaint. No investment, no return, no IRR.
    const s = solveIRR([0, 0, 0]);
    expect(s.value).toBeNull();
    expect(s.reason).toBe('no_sign_change');
  });

  it('INVERTED: returns null for a two-root stream instead of silently picking one', () => {
    // Was: "picks one root … with no indication there were two". [-1000, 3000,
    // -2200] genuinely has two roots (≈27.6 % and ≈72.4 %). There is no such
    // thing as "the" IRR of that stream, and returning either one of them with
    // no indication of the other is the same class of claim as returning a bound.
    const s = solveIRR([-1000, 3000, -2200]);
    expect(s.value).toBeNull();
    expect(s.reason).toBe('undefined_non_conventional');
  });

  // ── New coverage: both edges, non-convergence, and the honest cases ─────────

  it('returns null at BOTH edges, never a bracket value', () => {
    for (const cf of [[-1, 1e6], [-100, 10000, 10000]]) {
      const s = solveIRR(cf);
      expect(s.value, `high edge ${JSON.stringify(cf)}`).toBeNull();
      expect(s.bound).toBe('above_domain');
    }
    // The low edge: a stream with no real root whose NPV is negative throughout.
    const low = solveIRR([-100, 300, -250]);
    expect(low.value).toBeNull();
    expect(low.bound).toBe('below_domain');
  });

  it('still publishes a genuinely negative IRR as a number, not as null', () => {
    // The contract's other half. Null means "undefined" and nothing else, so a
    // real -13.7 % has to survive as -13.7 % — otherwise dropping the < -0.50
    // sentinel would just have moved the conflation somewhere else.
    const s = solveIRR([-1000, 400, 400]);
    expect(s.reason).toBe('converged');
    expect(s.value).toBeCloseTo(-0.1367, 3);
  });

  it('every value it does return is an actual root', () => {
    // The property that distinguishes converged from bounded, asserted directly
    // rather than inferred from the reason string. NPV at a root is zero.
    for (const cf of [[-1000, 1100], [-100, 30, 30, 30, 30, 30], [-1000, 400, 400]]) {
      const s = solveIRR(cf);
      expect(s.value).not.toBeNull();
      const npv = cf.reduce((a, c, t) => a + c / Math.pow(1 + (s.value as number), t), 0);
      const scale = cf.reduce((a, c) => a + Math.abs(c), 0);
      expect(Math.abs(npv) / scale, `${JSON.stringify(cf)}`).toBeLessThan(1e-3);
    }
  });

  it('refuses a stream carrying a non-finite value rather than propagating NaN', () => {
    const s = solveIRR([-100, NaN, 30]);
    expect(s.value).toBeNull();
    expect(s.reason).toBe('not_converged');
  });

  it('irr_status reports non-convergence as itself, never as "uneconomic"', () => {
    // The defect this phase actually cost: 47 of 54 configurations on the v6
    // fallback path were labelled `uneconomic` when the solver had simply run to
    // its lower bound. `uneconomic` is a claim about a project and may only be
    // made about a converged solve.
    expect(irrStatusFor(solveIRR([-100, 10000, 10000]))).toBe('not_converged');
    expect(irrStatusFor(solveIRR([-1000, 3000, -2200]))).toBe('undefined_non_conventional');
    expect(irrStatusFor(solveIRR([0, 0, 0]))).toBe('no_sign_change');
    // …and a converged, genuinely terrible project still reads uneconomic.
    expect(irrStatusFor({ value: -0.8, reason: 'converged', npv_at_root: 0, bound: null }))
      .toBe('uneconomic');
    expect(irrStatusFor(solveIRR([-1000, 1100]))).toBe('marginal');
  });
});
