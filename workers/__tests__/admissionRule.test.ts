/**
 * Phase 52 — the admission rule, generalised from a defect this session shipped.
 *
 * The VPS relay wrote `lithium €17,974/t` at 10:51:19Z; the 4-hourly cron
 * overwrote it with `unavailable: true, AbortError` at 12:00:20Z, because the
 * worker's own scrape still hangs — the entire reason the relay exists. Every
 * tick undid the fix AND reset the freshness clock doing it.
 *
 *   **A writer that produces a failure payload loses to an existing good value,
 *   and never resets a freshness clock.**
 *
 * The second half is the one that is easy to lose: keeping the old value means
 * its timestamp keeps ageing, so /health flags it stale on schedule. We preserve
 * the DATA without pretending it is FRESH. Writing the failure did the opposite —
 * destroyed the data and reported it as current (B12, playbook §5).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isDegradedPayload, admitSignalWrite } from '../fetch-s1.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(here, '../fetch-s1.js'), 'utf8');

/** A KV double that records what was actually written. */
function fakeKv(initial: Record<string, unknown> | null) {
  const store = new Map<string, string>();
  if (initial) store.set('s3', JSON.stringify(initial));
  const writes: string[] = [];
  return {
    env: {
      KKME_SIGNALS: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => { store.set(k, v); writes.push(k); },
      },
    } as Any,
    writes,
    read: (k = 's3') => (store.has(k) ? JSON.parse(store.get(k)!) : null),
  };
}

const GOOD = { timestamp: '2026-08-04T10:51:19Z', lithium_eur_t: 17974, scrape_transport: 'vps_relay' };
const FAIL = { timestamp: '2026-08-04T12:00:20Z', unavailable: true, _scrape_error: 'AbortError: The operation was aborted' };

describe('isDegradedPayload — one definition, shared with /health (rule #4)', () => {
  it('recognises both failure markers', () => {
    expect(isDegradedPayload({ unavailable: true })).toBe(true);
    expect(isDegradedPayload({ _scrape_error: 'AbortError' })).toBe(true);
    expect(isDegradedPayload(FAIL)).toBe(true);
  });
  it('does not flag a healthy payload, or a non-object', () => {
    expect(isDegradedPayload(GOOD)).toBe(false);
    expect(isDegradedPayload(null)).toBe(false);
    expect(isDegradedPayload(undefined)).toBe(false);
  });
  it('/health uses THIS function rather than its own copy of the rule', () => {
    // The defect it prevents: two definitions of "degraded" drifting apart, so
    // the monitor and the admission rule disagree about what a failure is.
    expect(WORKER).toMatch(/const degraded = isDegradedPayload\(data\);/);
    expect(WORKER).not.toMatch(/const degraded = data\.unavailable === true \|\| Boolean/);
  });
});

describe('admitSignalWrite — the rule', () => {
  it('REFUSES a failure over an existing good value', async () => {
    const kv = fakeKv(GOOD);
    const r = await admitSignalWrite(kv.env, 's3', FAIL, 'S3');
    expect(r.written).toBe(false);
    expect(r.kept).toBe(true);
    expect(r.reason).toBe('good_value_protected');
    expect(kv.writes).toEqual([]);                 // nothing was written at all
    expect(kv.read().lithium_eur_t).toBe(17974);   // the good value survived
  });

  it('does NOT reset the freshness clock when it keeps a value', async () => {
    // The half that is easy to lose. Keeping must not restamp: the preserved
    // value has to keep ageing so /health can still flag it stale on schedule.
    // Writing the failure would have destroyed the data AND called it current.
    const kv = fakeKv(GOOD);
    await admitSignalWrite(kv.env, 's3', FAIL, 'S3');
    expect(kv.read().timestamp).toBe(GOOD.timestamp);
    expect(kv.read().timestamp).not.toBe(FAIL.timestamp);
  });

  it('WRITES a failure when there is nothing better to protect', async () => {
    // A cold start must surface the outage, not look empty.
    const kv = fakeKv(null);
    const r = await admitSignalWrite(kv.env, 's3', FAIL, 'S3');
    expect(r.written).toBe(true);
    expect(r.reason).toBe('no_previous_value');
    expect(kv.read().unavailable).toBe(true);
  });

  it('WRITES a failure over an existing failure — no value is being protected', async () => {
    const kv = fakeKv(FAIL);
    const r = await admitSignalWrite(kv.env, 's3', { ...FAIL, timestamp: '2026-08-04T16:00:00Z' }, 'S3');
    expect(r.written).toBe(true);
    expect(r.reason).toBe('previous_also_degraded');
    expect(kv.read().timestamp).toBe('2026-08-04T16:00:00Z');
  });

  it('always writes a healthy payload, including over a good one', async () => {
    const kv = fakeKv(GOOD);
    const fresher = { ...GOOD, timestamp: '2026-08-04T14:51:00Z', lithium_eur_t: 18100 };
    const r = await admitSignalWrite(kv.env, 's3', fresher, 'S3');
    expect(r.written).toBe(true);
    expect(kv.read().lithium_eur_t).toBe(18100);
  });

  it('writes rather than protects when the stored value is unreadable', async () => {
    // Corrupt JSON protects nothing, and refusing to write would strand the key
    // on garbage forever.
    const store = new Map([['s3', '{not json']]);
    const env = { KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
    } } as Any;
    const r = await admitSignalWrite(env, 's3', FAIL, 'S3');
    expect(r.written).toBe(true);
  });
});

describe('the rule is ONE path — no cron write may bypass it', () => {
  it('no signal key is written directly inside scheduled()', () => {
    // The generalisation, asserted structurally. A new cron writer that reaches
    // for KKME_SIGNALS.put directly re-creates exactly the S3 defect, silently,
    // for a different key.
    const i = WORKER.indexOf('async scheduled(');
    expect(i).toBeGreaterThan(0);
    let d = 0, started = false, end = i;
    for (let j = i; j < WORKER.length; j++) {
      const c = WORKER[j];
      if (c === '{') { d++; started = true; }
      else if (c === '}') { d--; if (started && d === 0) { end = j; break; } }
    }
    const body = WORKER.slice(i, end);
    const direct = [...body.matchAll(/KKME_SIGNALS\.put\(\s*'([^']+)'/g)]
      .map((m) => m[1])
      .filter((k) => !k.startsWith('raw:'));
    expect(direct, 'signal keys bypassing admitSignalWrite').toEqual([]);
    // …and the rule is actually in use, so an empty list cannot mean "no writes".
    expect((body.match(/admitSignalWrite\(env,/g) ?? []).length).toBeGreaterThanOrEqual(15);
  });
});
