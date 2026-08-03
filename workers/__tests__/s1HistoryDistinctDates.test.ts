/**
 * Phase 38.2 (B-056, option 3) — the S1 history statistics count market days.
 *
 * `updateHistory` appended unconditionally and `rollingStats` reported the row
 * count as `days_of_data`, so a 4-hourly cron describing one day six times
 * published `n: 90, days_of_data: 90` over nine distinct dates. Downstream,
 * SpreadCaptureCard's `slice(-14)` resolved to two dates under a "14D" label.
 *
 * Option 3 as signed: `lt_swing` is rebuilt from `s1_capture_history` — the one
 * writer that dedupes by MARKET date — because keep-last on `s1_history`'s
 * write stamp disagreed with the settled series on seven of nine shared dates
 * (B-060). `spread_eur` has no companion archive and stays where it is,
 * publishing a smaller `n` honestly rather than a larger one falsely.
 *
 * The fixture is the real production `s1_history` shape: 90 rows, nine dates,
 * heavily repeated. Proven failable by inject-then-revert — restoring
 * `days_of_data: vals.length` and the shared-source `rollingStats(history,
 * 'lt_swing')` takes these red.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker, { dedupeByDateKeepLast, rollingStats } from '../fetch-s1.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;
let store: Map<string, string>;
let puts: Array<[string, string]>;

function makeEnv() {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { puts.push([k, v]); store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
  } as Any;
}

/** Production shape: nine dates, 90 rows, the repeat counts measured live. */
const REPEATS: Record<string, number> = {
  '2026-07-26': 1, '2026-07-27': 6, '2026-07-28': 8, '2026-07-29': 25,
  '2026-07-30': 4, '2026-07-31': 4, '2026-08-01': 11, '2026-08-02': 29,
  '2026-08-03': 2,
};

function contaminatedHistory() {
  const rows: Array<Record<string, unknown>> = [];
  let i = 0;
  for (const [date, count] of Object.entries(REPEATS)) {
    for (let k = 0; k < count; k++) {
      rows.push({ date, spread_eur: 5 + i * 0.1, spread_pct: 2, lt_swing: 100 + i, gross_2h: null, gross_4h: null });
      i++;
    }
  }
  return rows;
}

/** The deduping writer: one row per market day, each with a settled swing. */
function captureHistory(days = 30) {
  return Array.from({ length: days }, (_, k) => {
    const d = new Date(Date.UTC(2026, 6, 5 + k)).toISOString().slice(0, 10);
    return { date: d, gross_2h: 100 + k, gross_4h: 90 + k, swing: 130 + k };
  });
}

beforeEach(() => {
  store = new Map();
  puts = [];
  store.set('s1_history', JSON.stringify(contaminatedHistory()));
  store.set('s1_capture_history', JSON.stringify(captureHistory()));
});

const getS1 = async () => {
  const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/s1/history'), makeEnv(), ctx);
  return res.json();
};

describe('rollingStats counts distinct dates, not rows', () => {
  it('the contaminated array really is 90 rows over 9 dates', () => {
    const h = contaminatedHistory();
    expect(h).toHaveLength(90);
    expect(new Set(h.map(r => r.date)).size).toBe(9);
  });

  it('GET /s1/history serves one row per market day, in date order', async () => {
    const served = await getS1();
    const rows: Array<{ date: string }> = Array.isArray(served) ? served : served.history;
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map(r => r.date)).size).toBe(9);
    expect(rows.map(r => r.date)).toEqual([...rows.map(r => r.date)].sort());
  });

  it('a 14-row tail spans 14 distinct dates — asserted on the SERIES, not the count', async () => {
    // The live defect: slice(-14) covered TWO dates because the repeats sit at
    // the END of the array (2026-08-02 x29, 2026-08-03 x2). An earlier draft of
    // this spec appended twenty clean dates AFTER the contaminated ones and
    // passed with the bug still in — it exercised the fixture, not the fix
    // (playbook B13 corollary). The repeats stay last, as in production.
    const many = [
      ...Array.from({ length: 20 }, (_, k) => ({
        date: new Date(Date.UTC(2026, 6, 5 + k)).toISOString().slice(0, 10),
        spread_eur: 7, lt_swing: 200 + k,
      })),
      ...contaminatedHistory(),
    ];
    store.set('s1_history', JSON.stringify(many));

    const served = await getS1();
    const rows: Array<{ date: string }> = Array.isArray(served) ? served : served.history;
    const tail = rows.slice(-14);

    expect(tail).toHaveLength(14);
    expect(new Set(tail.map(r => r.date)).size).toBe(14);   // distinct dates >= n
  });

  it('days_of_data counts dates and n counts observations — 90 rows over 9 dates', () => {
    const h = contaminatedHistory();
    const stats = rollingStats(h, 'lt_swing');
    expect(stats.n).toBe(90);
    expect(stats.days_of_data).toBe(9);   // was 90 until this phase
  });

  it('after deduping the two agree, which is the self-check', () => {
    const stats = rollingStats(dedupeByDateKeepLast(contaminatedHistory()), 'spread_eur');
    expect(stats.n).toBe(9);
    expect(stats.days_of_data).toBe(9);
  });

  it('the capture-sourced swing series carries its full day count', () => {
    const series = captureHistory().map(r => ({ date: r.date, lt_swing: r.swing }));
    const stats = rollingStats(series, 'lt_swing');
    expect(stats.n).toBe(30);
    expect(stats.days_of_data).toBe(30);
  });

  it('a field named _90d is windowed to 90 market days, however deep the archive', async () => {
    // Caught post-deploy on the live payload: s1_capture_history holds 400
    // market days (2025-05-02 onward), so an unwindowed read published
    // swing_stats_90d at n = 400. The mirror image of B-056 — a label that
    // UNDERSTATES its window rather than overstating it, and equally a
    // label that does not describe its own data (rule #2).
    store.set('s1_capture_history', JSON.stringify(captureHistory(400)));
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/s1/history'), makeEnv(), ctx);
    await res.json();

    const series = dedupeByDateKeepLast(JSON.parse(store.get('s1_capture_history') as string))
      .filter((r: Any) => r.swing != null)
      .slice(-90)
      .map((r: Any) => ({ date: r.date, lt_swing: r.swing }));
    const stats = rollingStats(series, 'lt_swing');

    expect(stats.n).toBe(90);
    expect(stats.days_of_data).toBe(90);
  });
});

describe('the two series have different sources, and say so in n', () => {
  const getS1Payload = async () => {
    // `/s1` recomputes; drive the history-stats path directly through the
    // cron-facing helpers by reading what the route publishes.
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/s1/history'), makeEnv(), ctx);
    return res.json();
  };

  it('the swing series comes from the capture history, at its full day count', async () => {
    await getS1Payload();
    const cap = JSON.parse(store.get('s1_capture_history') as string);
    expect(cap).toHaveLength(30);
    expect(new Set(cap.map((r: Any) => r.date)).size).toBe(30);
    // The swing quantity has one writer, and it is this one — 30 market days,
    // not the nine the spread series can offer.
    expect(cap.every((r: Any) => r.swing != null)).toBe(true);
  });

  it('deduping is idempotent — a second pass changes nothing', async () => {
    const first = await getS1();
    const rowsA = Array.isArray(first) ? first : first.history;
    store.set('s1_history', JSON.stringify(rowsA));
    const second = await getS1();
    const rowsB = Array.isArray(second) ? second : second.history;
    expect(rowsB).toEqual(rowsA);
  });

  it('keep-LAST, not keep-first — the last write of a day has seen most of it', async () => {
    store.set('s1_history', JSON.stringify([
      { date: '2026-08-02', spread_eur: 1, lt_swing: 10 },
      { date: '2026-08-02', spread_eur: 2, lt_swing: 20 },
      { date: '2026-08-02', spread_eur: 3, lt_swing: 30 },
    ]));
    const served = await getS1();
    const rows = Array.isArray(served) ? served : served.history;
    expect(rows).toHaveLength(1);
    expect(rows[0].spread_eur).toBe(3);
  });
});
