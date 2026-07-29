/**
 * Phase 36.C — the forecast synth must read the whole day, at any cadence.
 *
 * `synthesizeBTDFromRolling` builds a 96-ISP synthetic BTD day and shapes
 * activation and direction from the day-ahead price curve. It indexed that
 * curve as `daP[Math.floor(i / 4)]`, which is correct only if the curve is a
 * 24-slot hourly array. Day-ahead now publishes at PT15M (~96 slots), so that
 * expression tops out at index 23 — the first SIX HOURS of the day, stretched
 * across all 96 ISPs. The evening peak that drives BESS arbitrage and
 * activation revenue is never seen.
 *
 * The bug was unreachable until 36.C: `prices_24h` was never populated, so
 * forecast mode always returned early and this function never ran on real
 * prices. Fixing the plumbing made it reachable, which is why it is fixed in
 * the same phase — shipping a forecast that serves confidently from the wrong
 * six hours would be worse than one that returns null.
 *
 * The guard is a proportional map, so it holds for PT60M, PT15M, DST-short and
 * DST-long days, and partially-published windows (93 slots is real — observed
 * on ENTSO-E for LT on 2026-07-29).
 */

import { describe, it, expect } from 'vitest';
import { synthesizeBTDFromRolling } from '../fetch-s1.js';

const ROLLING = {
  products: {
    aFRR: { cap_avg: 30, act_avg: 170 },
    mFRR: { cap_avg: 25, act_avg: 140 },
    FCR: { cap_avg: 40, act_avg: 90 },
  },
};

/** A day that is cheap overnight and peaks hard in the evening. */
function shapedDay(slots: number): number[] {
  return Array.from({ length: slots }, (_, i) => {
    const hour = (i / slots) * 24;
    return hour >= 18 && hour < 22 ? 200 : 10;
  });
}

describe('synthesizeBTDFromRolling — day-ahead indexing is cadence-independent', () => {
  it('sees the evening peak in a 96-slot PT15M day', () => {
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: shapedDay(96) });
    // ISPs 72..87 are 18:00–22:00. Direction must be short (+1) there.
    expect(synth.direction.slice(72, 88).every((d: number) => d === 1)).toBe(true);
    // ...and long (-1) overnight.
    expect(synth.direction.slice(0, 40).every((d: number) => d === -1)).toBe(true);
  });

  it('sees the evening peak in a 24-slot PT60M day', () => {
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: shapedDay(24) });
    expect(synth.direction.slice(72, 88).every((d: number) => d === 1)).toBe(true);
    expect(synth.direction.slice(0, 40).every((d: number) => d === -1)).toBe(true);
  });

  it('handles a 93-slot partially-published day without throwing or wrapping', () => {
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: shapedDay(93) });
    expect(synth.direction).toHaveLength(96);
    expect(synth.direction.some((d: number) => d === 1)).toBe(true);
    expect(synth.activation_prices.every((a: { up: number }) => Number.isFinite(a.up))).toBe(true);
  });

  it('handles DST-length days at both cadences', () => {
    for (const n of [23, 25, 92, 100]) {
      const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: shapedDay(n) });
      expect(synth.direction).toHaveLength(96);
      expect(synth.direction.some((d: number) => d === 1)).toBe(true);
    }
  });

  it('regression: a PT15M day must not be read as its first six hours', () => {
    // The precise old failure. Price is flat-cheap for the first quarter of the
    // day and expensive after; the old `floor(i/4)` mapping only ever reached
    // index 23 of 96 — entirely inside the cheap region — so it would report no
    // expensive ISP anywhere in the day.
    const prices = Array.from({ length: 96 }, (_, i) => (i < 24 ? 10 : 200));
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: prices });
    const shortIsps = synth.direction.filter((d: number) => d === 1).length;
    expect(shortIsps).toBeGreaterThan(60);   // old behaviour would give 0

    const activated = synth.activation_prices.filter((a: { up: number }) => a.up > 0).length;
    expect(activated).toBeGreaterThan(60);   // old behaviour would give 0
  });

  it('never indexes past the end of a short price array', () => {
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: [50, 60, 70] });
    expect(synth.direction).toHaveLength(96);
    expect(synth.activation_prices.every((a: { up: number }) => Number.isFinite(a.up))).toBe(true);
  });

  it('falls back safely when there are no prices at all', () => {
    const synth = synthesizeBTDFromRolling(ROLLING, { prices_24h: [] });
    expect(synth.direction).toHaveLength(96);
    expect(synth.activation_prices).toHaveLength(96);
  });

  it('returns null without rolling products rather than a hollow day', () => {
    expect(synthesizeBTDFromRolling(null, { prices_24h: shapedDay(96) })).toBeNull();
    expect(synthesizeBTDFromRolling({}, { prices_24h: shapedDay(96) })).toBeNull();
  });
});
