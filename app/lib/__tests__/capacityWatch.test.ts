// Phase 33.B.3 — KV-persisted capacity-watch accumulator.
//
// flagOutOfBandS2Capacity (fetch-s1.js:8647, every /revenue compute) was
// console.log-only — ephemeral. The 33.B.2 capacity-basis review (2026-06-29)
// needs ≥2 weeks of trend data to tell whether fcr_avg=€63.73/MW/h is a
// transient post-CE-sync spike or a sustained level. accumulateCapacityWatch is
// the pure read-modify-write helper that builds the daily summary, deduped per
// distinct s2 snapshot (s2 KV refreshes ~6×/day) so `samples` counts real data
// points and KV writes stay ~6/day, not per /revenue call.
import { describe, it, expect } from 'vitest';
import {
  accumulateCapacityWatch,
  CAPACITY_WATCH_FIELDS,
} from '../../../workers/fetch-s1.js';

const s2 = (ts: string, o: Record<string, number | null> = {}) => ({
  timestamp: ts,
  fcr_avg: 63.73, afrr_up_avg: 72.71, mfrr_up_avg: 38.93,
  afrr_down_avg: 10.11, mfrr_down_avg: 17.85,
  ...o,
});

describe('CAPACITY_WATCH_FIELDS', () => {
  it('tracks up + down for all three products', () => {
    expect(CAPACITY_WATCH_FIELDS).toEqual([
      'fcr_avg', 'afrr_up_avg', 'mfrr_up_avg', 'afrr_down_avg', 'mfrr_down_avg',
    ]);
  });
});

describe('accumulateCapacityWatch — fresh day', () => {
  const next = accumulateCapacityWatch(null, s2('2026-06-15T06:00:00Z'), '2026-06-15T06:30:00Z');

  it('initializes the day summary', () => {
    expect(next.date).toBe('2026-06-15');
    expect(next.first_seen_at).toBe('2026-06-15T06:30:00Z');
    expect(next.last_s2_timestamp).toBe('2026-06-15T06:00:00Z');
    expect(next.samples).toBe(1);
    expect(next.prices_source).toBe('BTD parsed; calibrated capacity (review pending)');
  });

  it('seeds per-field min/max/last and above_50_pct', () => {
    expect(next.fcr_avg).toEqual({ min: 63.73, max: 63.73, last: 63.73, n: 1, above_50_count: 1, above_50_pct: 100 });
    expect(next.mfrr_up_avg.above_50_pct).toBe(0); // 38.93 ≤ 50
    expect(next.afrr_down_avg.last).toBe(10.11);   // down-direction tracked
  });

  it('counts a clip event when any field > 50', () => {
    expect(next.clip_events_count).toBe(1); // fcr + afrr_up both > 50
  });
});

describe('accumulateCapacityWatch — dedup by s2 snapshot', () => {
  it('returns the SAME reference when the snapshot is already recorded (caller skips write)', () => {
    const first = accumulateCapacityWatch(null, s2('2026-06-15T06:00:00Z'), '2026-06-15T06:30:00Z');
    const again = accumulateCapacityWatch(first, s2('2026-06-15T06:00:00Z'), '2026-06-15T07:00:00Z');
    expect(again).toBe(first);   // reference-equal → no-op
    expect(again.samples).toBe(1);
  });
});

describe('accumulateCapacityWatch — accumulation across snapshots', () => {
  it('updates min/max/last across distinct snapshots and recomputes above_50_pct', () => {
    let acc = accumulateCapacityWatch(null, s2('2026-06-15T06:00:00Z', { afrr_up_avg: 80 }), '2026-06-15T06:30:00Z');
    acc = accumulateCapacityWatch(acc, s2('2026-06-15T10:00:00Z', { afrr_up_avg: 40 }), '2026-06-15T10:30:00Z');
    acc = accumulateCapacityWatch(acc, s2('2026-06-15T14:00:00Z', { afrr_up_avg: 60 }), '2026-06-15T14:30:00Z');
    expect(acc.samples).toBe(3);
    expect(acc.afrr_up_avg.min).toBe(40);
    expect(acc.afrr_up_avg.max).toBe(80);
    expect(acc.afrr_up_avg.last).toBe(60);
    expect(acc.afrr_up_avg.above_50_pct).toBe(66.7); // 2 of 3 > 50
    expect(acc.last_seen_at).toBe('2026-06-15T14:30:00Z');
    expect(acc.first_seen_at).toBe('2026-06-15T06:30:00Z'); // preserved
  });
});

describe('accumulateCapacityWatch — edge cases', () => {
  it('day rollover starts a fresh summary', () => {
    const day1 = accumulateCapacityWatch(null, s2('2026-06-15T22:00:00Z'), '2026-06-15T22:30:00Z');
    const day2 = accumulateCapacityWatch(day1, s2('2026-06-16T02:00:00Z'), '2026-06-16T02:30:00Z');
    expect(day2.date).toBe('2026-06-16');
    expect(day2.samples).toBe(1); // reset
  });

  it('null/non-finite field values are skipped (left null), not counted', () => {
    const acc = accumulateCapacityWatch(null, s2('2026-06-15T06:00:00Z', { mfrr_down_avg: null, fcr_avg: NaN }), '2026-06-15T06:30:00Z');
    expect(acc.mfrr_down_avg).toBeNull();
    expect(acc.fcr_avg).toBeNull();
    expect(acc.afrr_up_avg.last).toBe(72.71); // unaffected
    expect(acc.samples).toBe(1);
  });

  it('does not mutate the prev summary', () => {
    const first = accumulateCapacityWatch(null, s2('2026-06-15T06:00:00Z'), '2026-06-15T06:30:00Z');
    const snapshot = JSON.stringify(first);
    accumulateCapacityWatch(first, s2('2026-06-15T10:00:00Z'), '2026-06-15T10:30:00Z');
    expect(JSON.stringify(first)).toBe(snapshot); // prev untouched
  });
});
