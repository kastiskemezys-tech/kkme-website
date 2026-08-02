/**
 * Phase 38.1 — the two monitoring defects behind the 33h S1 outage.
 *
 * The outage itself (computeS1 rejecting on 8 consecutive 4-hourly ticks,
 * 2026-08-01T00:01Z → 2026-08-02T08:00Z) was invisible for two independent
 * reasons, and each gets a behavioural test here:
 *
 *   1. `s1_capture` — the key behind the S1 card's hero €/MWh — had no entry in
 *      STALE_THRESHOLDS_HOURS, so /health never looked at it.
 *   2. `s1` DID have an entry, but every unmatched GET ran computeS1() and WROTE
 *      that key. A monitored key any stranger's 404 can refresh is not a monitor;
 *      /health read green throughout (B-047).
 *
 * These are asserted through the real /health handler and the real router, not
 * by grepping the constants table — a test whose subject is a string in a file
 * has verified the file, not the behaviour (playbook B13). Each assertion was
 * proven to fail by inject-then-revert against the real mechanism before being
 * trusted; see the phase handover for the red/green counts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker, { fetchBznGuarded } from '../fetch-s1.js';
import { STALE_THRESHOLDS_HOURS } from '../lib/defaults.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * A44 day-ahead document with 24 hourly points — enough for computeS1 to clear
 * its `ltPrices.length >= 24` guards and resolve, so tests that need the write
 * path exercised actually reach it.
 */
const A44_DOC =
  '<Publication_MarketDocument>' +
  Array.from({ length: 24 }, (_, h) =>
    `<Point><position>${h + 1}</position><price.amount>${(10 + h * 3).toFixed(2)}</price.amount></Point>`,
  ).join('') +
  '</Publication_MarketDocument>';

let store: Map<string, string>;
let puts: string[];
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;

function makeEnv() {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { puts.push(k); store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
    ENTSOE_API_KEY: 'test-key',
  } as Any;
}

const req = (path: string, env: Any) =>
  (worker as Any).fetch(new Request(`https://x.kkme.eu${path}`), env, ctx);

beforeEach(() => {
  store = new Map();
  puts = [];
});
afterEach(() => { vi.restoreAllMocks(); });

describe('B-047 — the `s1` key is no longer refreshable by arbitrary traffic', () => {
  it('an unknown GET 404s and never touches KV or the network', async () => {
    // The pre-38.1 behaviour: this path fell through to a catch-all that ran
    // computeS1() and put('s1'). Both consequences are asserted absent.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const env = makeEnv();

    const res = await req('/totally-bogus-route', env);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'unknown route', path: '/totally-bogus-route' });
    expect(puts, 'an unmatched GET wrote to KV').toEqual([]);
    expect(fetchSpy, 'an unmatched GET made an upstream request').not.toHaveBeenCalled();
  });

  it('a stray 404 cannot make a stale `s1` look fresh to /health', async () => {
    // The exact shape that hid the outage: `s1` is 40h old and /health must keep
    // saying so no matter how much unmatched traffic arrives.
    //
    // computeS1 is made to SUCCEED here on purpose. Under inject-then-revert the
    // first draft of this test passed with the catch-all restored, because the
    // unmocked fetch made computeS1 reject and the write path was never reached
    // — it verified the mock, not the router (B13). With a valid A44 document
    // the restored catch-all reaches `put('s1')` and this goes red.
    // A fresh Response per call, not one shared instance: a body can only be
    // read once, so `mockResolvedValue(new Response(...))` made every fetch
    // after the first reject — and the test passed for that reason instead of
    // the intended one. Second time this test verified the mock rather than the
    // router; the injection is what exposed it, both times.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(A44_DOC, { status: 200 }) as Any,
    );
    const stale = new Date(Date.now() - 40 * 3_600_000).toISOString();
    const env = makeEnv();
    store.set('s1', JSON.stringify({ updated_at: stale }));

    await req('/nonsense-a', env);
    await req('/nonsense-b', env);
    await req('/favicon.ico', env);

    const health = await (await req('/health', env)).json() as Any;
    expect(health.signals.s1.stale, '/health reported a 40h-old s1 as fresh').toBe(true);
    expect(store.get('s1'), 'unmatched traffic overwrote the monitored key')
      .toBe(JSON.stringify({ updated_at: stale }));
  });

  it('GET /s1 still serves, and still does not write the monitored key', async () => {
    // /s1 remains a real endpoint (scripts/diagnose.sh probes it). What changed
    // is that reading no longer mutates: computeS1 is allowed to fail here
    // without that being the test's subject — the assertion is on the write.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream down'));
    const env = makeEnv();

    const res = await req('/s1', env);

    expect([200, 500]).toContain(res.status);
    expect(puts, 'GET /s1 wrote to KV').toEqual([]);
  });
});

describe('fetchBznGuarded — one bad response costs a retry, not a tick', () => {
  it('returns the document when the first attempt succeeds, without retrying', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(A44_DOC, { status: 200 }) as Any);
    const out = await fetchBznGuarded('10YLT-1001A0008Q', 'k', 'LT', 0);
    expect(out).toContain('price.amount');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once and succeeds — the transient case the outage was full of', async () => {
    let n = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n += 1;
      return (n === 1
        ? new Response('rate limited', { status: 429 })
        : new Response(A44_DOC, { status: 200 })) as Any;
    });
    const out = await fetchBznGuarded('10YLT-1001A0008Q', 'k', 'LT', 0);
    expect(out).toContain('price.amount');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns null rather than throwing when both attempts fail', async () => {
    // The whole point: the rejection must not propagate out of Promise.all and
    // take computeS1 — and, before decoupling, the capture and the da_tomorrow
    // mirror — down with it.
    vi.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('nope', { status: 503 }) as Any);
    await expect(fetchBznGuarded('10YLT-1001A0008Q', 'k', 'LT', 0)).resolves.toBeNull();
  });
});

describe('s1_capture is monitored, and the monitor can fail', () => {
  it('is declared in the threshold table /health iterates', () => {
    // Necessary but not sufficient — the behavioural assertions follow.
    expect(STALE_THRESHOLDS_HOURS.s1_capture).toBeTypeOf('number');
    expect(STALE_THRESHOLDS_HOURS.s1_capture).toBeLessThanOrEqual(12);
  });

  it('flags the real outage shape: a 33h-old capture reads stale', async () => {
    const env = makeEnv();
    // The value the S1 card actually served on 2026-08-02, to the minute.
    store.set('s1_capture', JSON.stringify({
      date: '2026-08-01',
      updated_at: new Date(Date.now() - 33.3 * 3_600_000).toISOString(),
    }));

    const health = await (await req('/health', env)).json() as Any;

    expect(health.signals.s1_capture, 's1_capture absent from /health').toBeDefined();
    expect(health.signals.s1_capture.stale).toBe(true);
    expect(health.all_fresh).toBe(false);
  });

  it('does not cry wolf: a capture from the last tick reads fresh', async () => {
    const env = makeEnv();
    store.set('s1_capture', JSON.stringify({
      date: '2026-08-02',
      updated_at: new Date(Date.now() - 1 * 3_600_000).toISOString(),
    }));

    const health = await (await req('/health', env)).json() as Any;
    expect(health.signals.s1_capture.stale).toBe(false);
  });

  it('reports a never-written capture as missing rather than omitting it', async () => {
    // Absence of provenance is an error state, never an innocent one (B12).
    const env = makeEnv();
    const health = await (await req('/health', env)).json() as Any;
    expect(health.signals.s1_capture.status).toBe('missing');
  });
});
