/**
 * Phase 38.3 — the wear model's validity floor, asserted against the ENGINE'S
 * BEHAVIOUR rather than against the constant that describes it.
 *
 * `WEAR_MODEL_FLOOR_CD` is a frontend restatement of a clamp that lives in
 * `sohYr` (`workers/fetch-s1.js`). A second copy of a number is a second writer
 * of it — the failure 38.2 paid for twice — so the constant is not trusted
 * because it is written down. Every spec below drives the real `sohYr` and
 * measures where it actually stops responding.
 *
 * The disclosure this backs exists because 38.3's measured cutover moved
 * project IRR by +0.07 to +0.15 pp, not "materially upward" as the arc assumed,
 * and the reason is the clamp: below 1.0 c/d the model cannot represent slower
 * ageing at all. A limit that is silent looks like a result.
 */

import { describe, it, expect } from 'vitest';
import { sohYr } from '../../../workers/fetch-s1.js';
import {
  WEAR_MODEL_FLOOR_CD, MERCHANT_CYCLING_BAND_EFC_YR,
  wearRangeVerdict, revenueLed, pct,
} from '@/app/lib/wearModelRange';

/* eslint-disable @typescript-eslint/no-explicit-any */
const soh = sohYr as unknown as (t: number, cd: number) => number;

describe('the declared floor is the floor the engine actually applies', () => {
  it('cycling rates below the floor are indistinguishable from the floor itself', () => {
    // The clamp, measured. If the engine ever gains sub-1.0 characterisation
    // these go red, which is precisely when the published disclosure must change.
    for (const cd of [0.10, 0.35, 0.60, 0.92, 0.999]) {
      for (const year of [1, 5, 10, 17]) {
        expect(soh(year, cd), `cd=${cd} year=${year}`).toBe(soh(year, WEAR_MODEL_FLOOR_CD));
      }
    }
  });

  it('and above the floor the engine does respond — so the clamp is a floor, not a constant', () => {
    expect(soh(10, 1.5)).toBeLessThan(soh(10, WEAR_MODEL_FLOOR_CD));
    expect(soh(10, 2.0)).toBeLessThan(soh(10, 1.5));
  });

  it('the floor is exactly 1.0 — located by bisection, not by reading the source', () => {
    let lo = 0.1, hi = 3.0;
    const base = soh(10, 0.1);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (soh(10, mid) === base) lo = mid; else hi = mid;
    }
    expect(lo).toBeCloseTo(WEAR_MODEL_FLOOR_CD, 6);
  });

  it('this asset sits below it — which is why the disclosure is not hypothetical', () => {
    // 219 EFC/yr, B1's hourly measurement, is 0.60 c/d.
    const v = wearRangeVerdict(219.12 / 365)!;
    expect(v.belowFloor).toBe(true);
    expect(v.appliedCd).toBe(WEAR_MODEL_FLOOR_CD);
    // …and the shipped engine's own 498 EFC/yr is above it.
    expect(wearRangeVerdict(498 / 365)!.belowFloor).toBe(false);
  });

  it('declines to judge a rate it was not given', () => {
    expect(wearRangeVerdict(null)).toBeNull();
    expect(wearRangeVerdict(0)).toBeNull();
    expect(wearRangeVerdict(Number.NaN)).toBeNull();
  });
});

describe('the reserve/merchant split is computed from the payload shown', () => {
  it('reads the year-1 lines, not a remembered percentage', () => {
    // Frozen-fixture Y1 for 2h/mid/2028/base, captured 2026-08-03.
    const led = revenueLed({ rev_bal: 5805417, rev_trd: 2188823, rev_gross: 7994239 })!;
    expect(led.led).toBe('reserve');
    expect(led.reserveShare).toBeCloseTo(0.7262, 4);
    expect(pct(led.reserveShare)).toBe('72.6 %');
    expect(led.reserveShare + led.merchantShare).toBeCloseTo(1, 12);
  });

  it('would say merchant-led if the asset were — the label is not a constant', () => {
    const led = revenueLed({ rev_bal: 1_000_000, rev_trd: 4_000_000, rev_gross: 5_000_000 })!;
    expect(led.led).toBe('merchant');
    expect(pct(led.merchantShare)).toBe('80 %');
  });

  it('returns null rather than dividing by a gross it does not have', () => {
    expect(revenueLed({ rev_bal: 100, rev_gross: 0 })).toBeNull();
    expect(revenueLed({ rev_gross: 100 })).toBeNull();
    expect(revenueLed(null)).toBeNull();
  });

  it('the benchmark band is carried with its basis, so the copy cannot drop it', () => {
    expect(MERCHANT_CYCLING_BAND_EFC_YR.lo).toBe(550);
    expect(MERCHANT_CYCLING_BAND_EFC_YR.hi).toBe(720);
    expect(MERCHANT_CYCLING_BAND_EFC_YR.basis).toBe('merchant-battery');
  });
});
