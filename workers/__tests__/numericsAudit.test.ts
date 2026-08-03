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
import { parseA44Periods, pricesForUtcDay, calcIRRForAudit } from '../fetch-s1.js';

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
  // The 54 public configurations are profitable everywhere (measured: min IRR
  // -6.07 %, max 22.9 %, no nulls, no `uneconomic` status), so running the
  // public matrix cannot reach any of these branches at all.
  it('solves a conventional stream exactly', () => {
    expect(calcIRRForAudit([-1000, 1100])).toBeCloseTo(0.10, 4);
  });

  it('returns the LOWER bracket endpoint, not a root, when no root exists above -99%', () => {
    // Documented, not endorsed. -0.99 is the bisection floor. The published path
    // clamps anything below -0.50 to null, so this does not escape /revenue —
    // but the solver's own contract is "a number that may be a bracket edge".
    expect(calcIRRForAudit([-1000, -100, -100])).toBeCloseTo(-0.99, 6);
  });

  it('returns the UPPER bracket endpoint as an apparent 200% IRR, and this DOES escape', () => {
    // The asymmetry that matters. The low end is caught by the < -0.50 → null
    // clamp; the high end has no such guard, so a stream whose IRR exceeds the
    // scan ceiling is published as exactly 2.0. "IRR = 200%" and "IRR > 200%,
    // unknown" are then indistinguishable downstream — a sentinel that reads as
    // a value, which is the defect class the phase was sent to find.
    expect(calcIRRForAudit([-100, 10000, 10000])).toBe(2);
  });

  it('returns a number for an all-zero cash flow, where IRR is undefined', () => {
    // No investment, no return, no IRR. The solver reports -0.99.
    expect(calcIRRForAudit([0, 0, 0])).toBeCloseTo(-0.99, 6);
    expect(Number.isFinite(calcIRRForAudit([0, 0, 0]))).toBe(true); // …and it looks like data
  });

  it('picks one root of a two-sign-change stream with no indication there were two', () => {
    const irr = calcIRRForAudit([-1000, 3000, -2200]);
    expect(Number.isFinite(irr)).toBe(true);
    expect(irr).toBeGreaterThan(0);
  });
});
