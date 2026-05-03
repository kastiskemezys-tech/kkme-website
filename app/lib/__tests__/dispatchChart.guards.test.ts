// Phase 12.8 — fail-then-pass guards for `normaliseHourlyDispatch` against the
// degraded `/api/dispatch` payload class that triggered the audit's bare
// "SIGNAL ERROR" boundary fallback.
//
// Pre-fix, `null`/`undefined` `hourly` reaches the inner `hourly.map(...)` and
// throws TypeError before any guard runs. Post-fix, the helper short-circuits
// to `[]` so a downstream consumer can render an empty-state placeholder
// instead of crashing the boundary. (See dispatchChart.ts.)

import { describe, it, expect } from 'vitest';
import { normaliseHourlyDispatch, dailyAvgPerHour } from '../dispatchChart';

describe('Phase 12.8 — normaliseHourlyDispatch null/undefined hourly guard (candidates 1 + 6)', () => {
  it('returns [] when hourly is null (pre-fix throws on null.map)', () => {
    expect(normaliseHourlyDispatch(null as unknown as never[], 50)).toEqual([]);
  });

  it('returns [] when hourly is undefined (pre-fix throws on undefined.map)', () => {
    expect(normaliseHourlyDispatch(undefined as unknown as never[], 50)).toEqual([]);
  });

  it('returns [] on empty array (pre-existing behavior — sanity)', () => {
    expect(normaliseHourlyDispatch([], 50)).toEqual([]);
  });

  it('returns [] on non-array input (string)', () => {
    expect(normaliseHourlyDispatch('not-an-array' as unknown as never[], 50)).toEqual([]);
  });
});

describe('Phase 12.8 — dailyAvgPerHour does not throw on edge input (candidate 6, no production guard)', () => {
  // Confirmed pre-fix: dailyAvgPerHour does not throw on undefined/null/0;
  // it returns NaN/0 which downstream JSX renders as 'NaN' or '0'. Documenting
  // this so the test suite encodes "no guard needed" for this candidate.
  it('returns 0 for headline=0', () => {
    expect(dailyAvgPerHour(0)).toBe(0);
  });
  it('returns NaN (not throw) for undefined headline', () => {
    expect(Number.isNaN(dailyAvgPerHour(undefined as unknown as number))).toBe(true);
  });
});
