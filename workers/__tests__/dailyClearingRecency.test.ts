// Phase 50 — recency of the irreplaceable clearing archive.
//
// `s2_daily_clearing` is the only KV class that cannot be re-fetched once lost:
// it begins on 2025-10-01, the oldest delivery day BTD still serves in full, so
// a day the importer misses eventually falls out of BTD's window forever. The
// importer (`backfill_btd_daily.py`) was written as a one-off in 36.C and never
// scheduled, so the series froze at delivery day 2026-07-26 and was NINE days
// behind before anyone looked. Nothing watched it, because:
//
//   · it is a bare ARRAY, so /health's generic loop found no `.timestamp`, and
//     reported `age_hours: null, stale: null` — unmeasured, but present-looking;
//   · and the obvious fix, monitoring the KV write age, is GAMEABLE: the daily
//     cron writes on every run, so a run that imports nothing new still stamps a
//     fresh write and the clock resets forever (B12 — the damage disabling its
//     own detector, the same shape as S3's failure payload passing its own
//     freshness check).
//
// So the measure is the newest DELIVERY DAY in the series. These tests pin that
// distinction: a series that stops advancing must go stale no matter how
// recently it was written.
import { describe, it, expect } from 'vitest';
import {
  s2DailyClearingRecency,
  S2_DAILY_CLEARING_MAX_LAG_DAYS,
  BTD_PUBLICATION_LAG_DAYS,
} from '../fetch-s1.js';

const NOW = '2026-08-04T09:30:00Z';
const series = (...dates: string[]) => dates.map((date) => ({ date, fcr: 1, isp_count: 96 }));

describe('threshold is derived from the cadence, not picked', () => {
  it('is publication lag plus one missed run plus a buffer', () => {
    expect(BTD_PUBLICATION_LAG_DAYS).toBe(2);
    expect(S2_DAILY_CLEARING_MAX_LAG_DAYS).toBe(BTD_PUBLICATION_LAG_DAYS + 2);
  });
});

describe('recency is measured on the newest delivery day', () => {
  it('a current series is fresh', () => {
    // BTD serves through today-2; the importer ran, so that is the newest day.
    const r = s2DailyClearingRecency(series('2026-07-31', '2026-08-01', '2026-08-02'), NOW);
    expect(r.status).toBe('present');
    expect(r.last_date).toBe('2026-08-02');
    expect(r.days_behind).toBe(2);
    expect(r.stale).toBe(false);
    expect(r.total_days).toBe(3);
  });

  it('the state this phase found — 9 days behind — is stale', () => {
    const r = s2DailyClearingRecency(series('2026-07-25', '2026-07-26'), NOW);
    expect(r.last_date).toBe('2026-07-26');
    expect(r.days_behind).toBe(9);
    expect(r.stale).toBe(true);
  });

  it('is exact at the boundary', () => {
    // 4 days behind is the threshold itself and must NOT alarm; 5 must.
    expect(s2DailyClearingRecency(series('2026-07-31'), NOW).days_behind).toBe(4);
    expect(s2DailyClearingRecency(series('2026-07-31'), NOW).stale).toBe(false);
    expect(s2DailyClearingRecency(series('2026-07-30'), NOW).days_behind).toBe(5);
    expect(s2DailyClearingRecency(series('2026-07-30'), NOW).stale).toBe(true);
  });

  it('takes the MAXIMUM date, not the last array element', () => {
    // The importer sorts, but a monitor that trusts array order would be
    // measuring the writer's tidiness rather than the data.
    const r = s2DailyClearingRecency(series('2026-08-02', '2026-07-01', '2026-07-15'), NOW);
    expect(r.last_date).toBe('2026-08-02');
    expect(r.stale).toBe(false);
  });
});

describe('the write-age trap — a fresh write must not buy freshness', () => {
  it('a series written this second is STILL stale if it stopped advancing', () => {
    // This is the whole point. Nothing in the input says when it was written,
    // and there is deliberately no way to pass that in: recency cannot be
    // satisfied by writing, only by importing a newer delivery day.
    const frozen = series('2026-06-01', '2026-06-02');
    expect(s2DailyClearingRecency(frozen, NOW).stale).toBe(true);
    expect(s2DailyClearingRecency(frozen, NOW).days_behind).toBe(63);
  });

  it('advancing the newest day is the ONLY thing that clears the alarm', () => {
    const stale = s2DailyClearingRecency(series('2026-07-20'), NOW);
    expect(stale.stale).toBe(true);
    const fixed = s2DailyClearingRecency(series('2026-07-20', '2026-08-02'), NOW);
    expect(fixed.stale).toBe(false);
  });
});

describe('absence is an error state, never an innocent one (B12)', () => {
  it('an empty archive is STALE, not null', () => {
    // The worst case this exists to catch must not read as "no opinion".
    const r = s2DailyClearingRecency([], NOW);
    expect(r.status).toBe('missing');
    expect(r.stale).toBe(true);
    expect(r.total_days).toBe(0);
  });

  it('a missing key is stale', () => {
    expect(s2DailyClearingRecency(null, NOW).stale).toBe(true);
  });

  it('a malformed payload is stale, not silently fresh', () => {
    expect(s2DailyClearingRecency([{ nope: 1 }] as never, NOW).status).toBe('error');
    expect(s2DailyClearingRecency([{ nope: 1 }] as never, NOW).stale).toBe(true);
    expect(s2DailyClearingRecency([{ date: 'not-a-date' }] as never, NOW).stale).toBe(true);
  });
});
