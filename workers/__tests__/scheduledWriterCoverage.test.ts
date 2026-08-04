/**
 * Phase 49 item 4 — the CLASS guard's behavioural half.
 *
 * `scripts/gates/scheduled-writer-coverage.mjs` proves a threshold is DECLARED
 * for every scheduled KV writer. That is a static claim, and on its own it is
 * exactly the failure B13 describes: a test whose subject is a string in a file.
 * These assertions check that the declaration does something — that a key past
 * its threshold actually turns the surface red, and that a failure payload
 * cannot pass for freshness.
 *
 * The 39.2 finding is the one that makes this necessary. `s3` had a threshold
 * the whole time, and it was useless: computeS3 writes its own failure payload
 * with a new `timestamp`, so the staleness clock reset on every failure and the
 * key could never age. A threshold nothing can trip is not monitoring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STALE_THRESHOLDS_HOURS } from '../lib/defaults.js';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(here, '../fetch-s1.js'), 'utf8');

/**
 * The /health staleness computation, extracted so the test drives the same
 * three inputs the handler does: the payload's own stamp, the declared
 * threshold, and whether the payload self-reports failure.
 */
function healthRowFor(key: string, payload: Record<string, unknown> | null, nowMs: number) {
  if (!payload) return { status: 'missing', age_hours: null, stale: null, degraded: false };
  const ts = (payload.timestamp ?? (payload._meta as Record<string, unknown>)?.written_at ?? payload.updated_at
    ?? payload.fetched_at ?? payload.stored_at) as string | undefined;
  const ageH = ts ? (nowMs - new Date(ts).getTime()) / 3600000 : null;
  const threshold = STALE_THRESHOLDS_HOURS[key as keyof typeof STALE_THRESHOLDS_HOURS] ?? 48;
  const degraded = payload.unavailable === true || Boolean(payload._scrape_error);
  return { status: 'present', age_hours: ageH, stale: ageH !== null ? ageH > threshold : null, degraded };
}

const hoursAgo = (h: number, nowMs: number) => new Date(nowMs - h * 3600000).toISOString();

describe('class guard · a declared threshold is one that can actually trip', () => {
  const NOW = Date.parse('2026-08-04T12:00:00Z');

  it('every scheduled writer the audit found has a threshold — asserted here, not only in the gate', () => {
    // The five Phase 49 added. Named individually so removing one is a failing
    // test rather than a smaller table nobody reads.
    for (const k of ['genload', 's_wind', 's_solar', 's_load', 's2_activation']) {
      expect(STALE_THRESHOLDS_HOURS[k as keyof typeof STALE_THRESHOLDS_HOURS], k).toBeGreaterThan(0);
    }
  });

  it('a threshold derived from an HOURLY cadence trips within hours, not days', () => {
    // The property, not the number: a key written every hour must go stale long
    // before a key written every week. A copy-pasted 168h would pass a "has a
    // threshold" check and be useless.
    for (const k of ['genload', 's_wind', 's_solar', 's_load']) {
      const t = STALE_THRESHOLDS_HOURS[k as keyof typeof STALE_THRESHOLDS_HOURS];
      expect(t, `${k} threshold`).toBeLessThanOrEqual(6);
      expect(healthRowFor(k, { timestamp: hoursAgo(2, NOW) }, NOW).stale, `${k} at 2h`).toBe(false);
      expect(healthRowFor(k, { timestamp: hoursAgo(8, NOW) }, NOW).stale, `${k} at 8h`).toBe(true);
    }
  });

  it('s2_activation trips on a missed day, and it is not cosmetic', () => {
    expect(healthRowFor('s2_activation', { timestamp: hoursAgo(30, NOW) }, NOW).stale).toBe(false);
    expect(healthRowFor('s2_activation', { timestamp: hoursAgo(60, NOW) }, NOW).stale).toBe(true);
    // It feeds deriveCompression, which the whole revenue projection rests on.
    expect(WORKER).toMatch(/s2_activation_parsed/);
  });

  it('a failure payload written on time does NOT count as fresh', () => {
    // 39.2's fix, held in place. computeS3 writes `unavailable: true` with a
    // brand-new timestamp, so age alone says 0.1h and the surface would read
    // green forever. Degradation has to be its own signal — B12: the damage
    // must not disable its own detector.
    const failure = { timestamp: hoursAgo(0.1, NOW), unavailable: true, _scrape_error: 'AbortError: The operation was aborted' };
    const row = healthRowFor('s3', failure, NOW);
    expect(row.stale).toBe(false);      // by age it looks perfect…
    expect(row.degraded).toBe(true);    // …and it is still not fresh
  });

  it('/health computes all_fresh from BOTH staleness and degradation', () => {
    // The composition is what matters: either one alone would have missed the
    // live 2026-08-04 S3 failure, which was 0.6h old and completely broken.
    const allFresh = (rows: Array<ReturnType<typeof healthRowFor>>) =>
      rows.every((r) => r.status === 'present' && r.stale === false && r.degraded !== true);
    expect(allFresh([healthRowFor('s1', { timestamp: hoursAgo(1, NOW) }, NOW)])).toBe(true);
    expect(allFresh([healthRowFor('s1', { timestamp: hoursAgo(99, NOW) }, NOW)])).toBe(false);
    expect(allFresh([healthRowFor('s3', { timestamp: hoursAgo(1, NOW), unavailable: true }, NOW)])).toBe(false);
    // And the real handler must compose them the same way.
    expect(WORKER).toMatch(/r\.stale === false && r\.degraded !== true/);
  });

  it('resolves EVERY stamp field the monitored payloads actually use', () => {
    // The correction this block needed. The assertions above drove the resolver
    // with SYNTHETIC payloads carrying `timestamp`, so they passed while two
    // real keys could not be aged at all: `genload` stamps `fetched_at` and
    // `s2_activation` stamps `stored_at`, and neither was in the chain. Both
    // reported `age_hours: null` on live /health the moment they were given a
    // threshold — declared and inert.
    //
    // This is B13 one layer down: the test exercised the resolver against a
    // shape of its own invention rather than the shapes the system emits. Field
    // names below are read off the real writers (`fetch-s1.js` computeGenLoad
    // -> fetched_at, computeS2Activation -> stored_at) and off live payloads.
    const shapes: Array<[string, Record<string, unknown>]> = [
      ['timestamp (s1, s3, s_wind, s8 …)', { timestamp: hoursAgo(1, NOW) }],
      ['updated_at (s1_capture)', { updated_at: hoursAgo(1, NOW) }],
      ['_meta.written_at', { _meta: { written_at: hoursAgo(1, NOW) } }],
      ['fetched_at (genload)', { fetched_at: hoursAgo(1, NOW) }],
      ['stored_at (s2_activation)', { stored_at: hoursAgo(1, NOW) }],
    ];
    for (const [label, payload] of shapes) {
      const row = healthRowFor('s1', payload, NOW);
      expect(row.age_hours, `${label} must be ageable`).not.toBeNull();
      expect(row.age_hours, label).toBeCloseTo(1, 1);
    }
    // …and the real handler must use the same chain, not a shorter one.
    expect(WORKER).toMatch(/\?\?\s*data\.fetched_at\s*\?\?\s*data\.stored_at/);
  });

  it('an unageable payload is NOT reported as fresh', () => {
    // The property that makes the above matter. A payload with no recognised
    // stamp yields `stale: null`, and null is not false — so it cannot pass
    // `all_fresh`. Absence of a measurement is not a measurement of freshness.
    const row = healthRowFor('genload', { lt: [], lv: [], ee: [] }, NOW);
    expect(row.age_hours).toBeNull();
    expect(row.stale).toBeNull();
    expect(row.stale).not.toBe(false);
  });

  it('a missing key is not quietly fresh either', () => {
    const row = healthRowFor('s8', null, NOW);
    expect(row.status).toBe('missing');
    expect(row.stale).toBeNull();   // null, never false — absence is not freshness
  });
});

describe('item 4 · S3 stops taking a healthy source down with it', () => {
  it('the FX leg is settled independently of the scrape leg', () => {
    // Observed live 2026-08-04T08:00:20Z: `/s3` carried no `fx_rates` at all
    // because the TE abort rejected a Promise.all that Frankfurter had already
    // answered. One dead host, two dead signals.
    // Anchored on the declaration keyword, not the parameter list: Phase 51
    // added `opts` for the B-072 relay and the old `computeS3()` anchor silently
    // matched nothing, so `slice` returned '' and the assertions were checking an
    // empty string. A test that can be defeated by a signature change was
    // verifying its own anchor, not the code.
    const i = WORKER.indexOf('async function computeS3(');
    expect(i, 'computeS3 declaration found').toBeGreaterThan(0);
    const body = WORKER.slice(i, WORKER.indexOf('\n}\n', i));
    expect(body.length, 'computeS3 body is non-empty').toBeGreaterThan(500);
    expect(body).not.toMatch(/Promise\.all\(\[\s*\n?\s*fetchFxRates\(\)/);
    expect(body).toMatch(/fx = await fetchFxRates\(\)/);
    // …and whatever survived is published rather than discarded.
    expect(body).toMatch(/\.\.\.\(fx \? \{ fx_rates:/);
  });
});
