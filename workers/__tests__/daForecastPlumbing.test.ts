/**
 * Phase 36.C (B0-G) — the day-ahead forecast plumbing.
 *
 * `GET /api/dispatch?mode=forecast` reads `daTomorrow.prices_24h`. Both writers
 * that populate the `da_tomorrow` KV — `computeS1` and `POST
 * /da_tomorrow/update` — stored only summary statistics (lt_peak, lt_trough,
 * lt_avg, se4_avg, spread_pct). So that read resolved to `[]` on every request
 * and forecast mode had never served once since it was written. It failed the
 * quiet way: a 200 with `{ forecast: null, reason: 'DA tomorrow prices empty' }`,
 * which reads like "not published yet" rather than "structurally impossible".
 *
 * `daResolutionFields` is the shared shape both writers now emit. The
 * resolution is RECORDED rather than left to be re-inferred downstream: the
 * market is mid-transition from PT60M to PT15M, and the 36.B0-D class of defect
 * was exactly a consumer assuming 24 slots and mis-indexing a 96-slot day.
 */

import { describe, it, expect } from 'vitest';
import { daResolutionFields } from '../fetch-s1.js';

const hours = (n: number) => Array.from({ length: n }, (_, i) => i * 1.5);

describe('daResolutionFields — the array survives, and says what it is', () => {
  it('carries the prices through under the key the consumer reads', () => {
    // The regression in one line: whatever else changes, `prices_24h` must be
    // the actual array, because that is the key /api/dispatch dereferences.
    const f = daResolutionFields(hours(24));
    expect(f.prices_24h).toHaveLength(24);
    expect(f.prices_24h[3]).toBe(4.5);
  });

  it('labels a 24-slot day PT60M', () => {
    const f = daResolutionFields(hours(24));
    expect(f.resolution).toBe('PT60M');
    expect(f.slots).toBe(24);
    expect(f.slots_per_hour).toBe(1);
  });

  it('labels a 96-slot day PT15M', () => {
    const f = daResolutionFields(hours(96));
    expect(f.resolution).toBe('PT15M');
    expect(f.slots).toBe(96);
    expect(f.slots_per_hour).toBe(4);
  });

  it('accepts DST-length days at both resolutions', () => {
    // Spring forward / fall back: 23 and 25 hours, 92 and 100 quarter-hours.
    expect(daResolutionFields(hours(23)).resolution).toBe('PT60M');
    expect(daResolutionFields(hours(25)).resolution).toBe('PT60M');
    expect(daResolutionFields(hours(92)).resolution).toBe('PT15M');
    expect(daResolutionFields(hours(100)).resolution).toBe('PT15M');
  });

  it('reports null resolution rather than guessing on an odd length', () => {
    // A truncated fetch must not be silently relabelled as a valid day. Null
    // means "I do not know", which a consumer can assert against; a wrong
    // guess is the mis-indexing bug all over again.
    const f = daResolutionFields(hours(40));
    expect(f.resolution).toBeNull();
    expect(f.slots_per_hour).toBeNull();
    expect(f.slots).toBe(40);
  });

  it('handles empty and non-array input without throwing', () => {
    expect(daResolutionFields([]).slots).toBe(0);
    expect(daResolutionFields([]).resolution).toBeNull();
    // @ts-expect-error — exercising the defensive path
    expect(daResolutionFields(null).slots).toBe(0);
  });

  it('never reports a resolution without the slot count that justifies it', () => {
    // Discipline rule #2, applied to a data field: a label asserting cadence
    // must be derivable from the payload it describes.
    for (const n of [0, 1, 23, 24, 25, 40, 92, 96, 100, 200]) {
      const f = daResolutionFields(hours(n));
      expect(f.slots).toBe(n);
      if (f.resolution === 'PT60M') expect(n).toBeGreaterThanOrEqual(23);
      if (f.resolution === 'PT15M') expect(n).toBeGreaterThanOrEqual(92);
    }
  });
});

describe('the consumer read that was starving', () => {
  // Mirrors fetch-s1.js: `daTomorrow.prices_24h || daTomorrow.lt_prices || []`
  const consumerRead = (da: Record<string, unknown>) =>
    (da.prices_24h as number[]) || (da.lt_prices as number[]) || [];

  it('resolved to empty under the pre-36.C payload shape', () => {
    const legacy = { lt_peak: 120.5, lt_trough: 11.2, lt_avg: 62.0, se4_avg: 48.1, spread_pct: 28.9 };
    expect(consumerRead(legacy)).toHaveLength(0);
  });

  it('resolves to a usable day under the new shape', () => {
    const fixed = { lt_avg: 62.0, ...daResolutionFields(hours(96)) };
    expect(consumerRead(fixed)).toHaveLength(96);
  });
});
