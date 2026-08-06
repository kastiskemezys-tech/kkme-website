/**
 * ─── B17 — a deadline armed at construction measures queue time ──────────────
 *
 * `cron_failures` took its first entry on 2026-08-05T12:01:29Z:
 *
 *   s4 · Error · "Timed out after 25000ms" · first_frame "at fetch-s1.js:5954:39"
 *
 * That frame is `withTimeout`'s own `new Error`, and `computeS4` is one fetch
 * measuring 225-370 ms from inside the worker. The 25 s was spent queued behind
 * computeS1's nine-request burst, because `withTimeout(computeS4(), 25000)`
 * evaluates its argument — issuing the fetch — before the timer is armed, and
 * inside `Promise.allSettled([...])` all five legs armed at one instant.
 *
 * The defect lived in WHEN AN ARGUMENT WAS EVALUATED. No assertion about the
 * text of a call site can see that, which is why these tests drive the real
 * `withTimeout` / `runWave` / `computeHistorical` rather than restating them
 * (playbook B13: a test whose subject is a string in a file has verified the
 * file, not the behaviour).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  withTimeout,
  runWave,
  TimeoutError,
  recordCronFailure,
  CRON_FAILURE_KEY,
  computeHistorical,
  HISTORICAL_CACHE_PREFIX,
} from '../fetch-s1.js';

/** Minimal KV double — get/put/delete over a Map, enough for the two paths tested. */
function kvDouble(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const puts: Array<{ key: string; value: string }> = [];
  return {
    store,
    puts,
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string) { store.set(key, value); puts.push({ key, value }); },
    async delete(key: string) { store.delete(key); },
  };
}

const never = () => new Promise<never>(() => {});

afterEach(() => { vi.restoreAllMocks(); });

describe('withTimeout takes a thunk', () => {
  it('rejects a promise argument outright, so the old semantics cannot return silently', () => {
    // The regression this guards is not hypothetical: it is the exact line that
    // shipped, and it cost a rejection nobody could read for 28 hours. A promise
    // argument must fail at the call, not degrade into a queue-timer.
    const p = Promise.resolve(1);
    expect(() => withTimeout(p as never, 1000, 's4')).toThrow(TypeError);
    expect(() => withTimeout(p as never, 1000, 's4')).toThrow(/expects a thunk/);
    p.catch(() => {});
  });

  it('invokes the work exactly once, when the wrapper runs and not before', () => {
    // withTimeout itself does invoke immediately — the deferral belongs to the
    // CALLER, and is tested against runWave below. What is pinned here is that
    // the thunk is entered once and only from inside the wrapper, so the timer
    // and the work start in the same turn rather than a queue apart.
    const spy = vi.fn(async () => 'ok');
    const pending = withTimeout(spy, 1000, 'probe');
    expect(spy).toHaveBeenCalledTimes(1);
    return pending.then((v) => {
      expect(v).toBe('ok');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  it('passes work through and clears the timer on success', async () => {
    await expect(withTimeout(async () => 42, 1000, 'x')).resolves.toBe(42);
  });

  it('propagates an upstream rejection unchanged rather than as a timeout', async () => {
    // "S4 FeatureServer: HTTP 403" and "Timed out" need different fixes. The
    // wrapper must not blur one into the other.
    const boom = new Error('S4 FeatureServer: HTTP 403');
    await expect(withTimeout(async () => { throw boom; }, 1000, 's4')).rejects.toBe(boom);
  });

  it('rejects a thunk that throws synchronously, without waiting out the budget', async () => {
    const t0 = Date.now();
    await expect(withTimeout(() => { throw new Error('sync boom'); }, 5000, 's4'))
      .rejects.toThrow('sync boom');
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('TimeoutError carries what first_frame never could', () => {
  it('reports elapsed against the budget, and the stage the leg reached', async () => {
    const err = await withTimeout(async (mark) => {
      mark?.('issued');
      await never();
    }, 60, 's4').catch((e) => e);

    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.name).toBe('TimeoutError');
    expect(err.timeout_ms).toBe(60);
    expect(err.stage).toBe('issued');
    expect(err.leg).toBe('s4');
    // The number that separates "blew its own budget" from "never ran": elapsed
    // is measured from thunk invocation, so it tracks the budget rather than the
    // age of the invocation.
    expect(err.elapsed_ms).toBeGreaterThanOrEqual(50);
    expect(err.elapsed_ms).toBeLessThan(5000);
  });

  it('reports stage null when the leg never got far enough to mark', async () => {
    // This is the signature of a leg starved of a socket, and the case the old
    // record could not distinguish from an upstream that accepted and hung.
    const err = await withTimeout(() => never(), 40, 's3').catch((e) => e);
    expect(err.stage).toBeNull();
    expect(err.message).toBe('Timed out after 40ms');
  });

  it('names the stage in the message when there is one, so a log line alone is diagnostic', async () => {
    const err = await withTimeout(async (mark) => { mark?.('response'); await never(); }, 40, 's4')
      .catch((e) => e);
    expect(err.message).toBe('Timed out after 40ms (last stage reached: response)');
  });
});

describe('runWave bounds the fan-out', () => {
  it('arms nothing while the leg list is being built', async () => {
    // The heart of B17. Under the old code this array literal issued five
    // fetches and started five clocks. Here it issues nothing.
    const calls: string[] = [];
    const legs = [
      { key: 's4', ms: 1000, run: async () => { calls.push('s4'); return 4; } },
      { key: 's3', ms: 1000, run: async () => { calls.push('s3'); return 3; } },
    ];
    expect(calls).toEqual([]);

    const res = await runWave(legs);
    expect(calls.sort()).toEqual(['s3', 's4']);
    expect(res.map((r) => (r as PromiseFulfilledResult<number>).value)).toEqual([4, 3]);
  });

  it('holds a later wave back until the earlier one settles', async () => {
    // Cheap-legs-first only means anything if wave 2 has genuinely not started.
    const order: string[] = [];
    const slow = async () => { await new Promise((r) => setTimeout(r, 40)); order.push('wave1'); return 1; };
    const heavy = async () => { order.push('wave2'); return 2; };

    await runWave([{ key: 'cheap', ms: 1000, run: slow }]);
    await runWave([{ key: 'heavy', ms: 1000, run: heavy }]);

    expect(order).toEqual(['wave1', 'wave2']);
  });

  it('settles rather than rejects, so one failed leg does not take the wave down', async () => {
    const res = await runWave([
      { key: 'ok',   ms: 1000, run: async () => 'fine' },
      { key: 'bad',  ms: 1000, run: async () => { throw new Error('upstream'); } },
      { key: 'slow', ms: 30,   run: () => never() },
    ]);
    expect(res.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect((res[2] as PromiseRejectedResult).reason).toBeInstanceOf(TimeoutError);
  });

  it('gives each leg its own budget, measured from when the wave started it', async () => {
    // Under the old code a 30 ms leg sharing an array with a 400 ms leg could
    // blow its budget on the other leg's time. Here it cannot.
    const res = await runWave([
      { key: 'short', ms: 40,  run: () => never() },
      { key: 'long',  ms: 400, run: async () => { await new Promise((r) => setTimeout(r, 120)); return 'done'; } },
    ]);
    expect(res[0].status).toBe('rejected');
    expect(res[1].status).toBe('fulfilled');
    expect((res[1] as PromiseFulfilledResult<string>).value).toBe('done');
  });
});

describe('cron_failures records the discriminator', () => {
  it('stores elapsed, budget and stage alongside the frame', async () => {
    const kv = kvDouble();
    const err = await withTimeout(async (mark) => { mark?.('issued'); await never(); }, 50, 's4')
      .catch((e) => e);

    await recordCronFailure({ KKME_SIGNALS: kv } as never, 's4', err);

    const map = JSON.parse(kv.store.get(CRON_FAILURE_KEY)!);
    expect(map.s4).toHaveLength(1);
    expect(map.s4[0].name).toBe('TimeoutError');
    expect(map.s4[0].timeout_ms).toBe(50);
    expect(map.s4[0].stage).toBe('issued');
    expect(map.s4[0].elapsed_ms).toBeGreaterThanOrEqual(40);
    // The field that could not name a cause is still there, still useless for a
    // timeout, and now no longer the only thing on the record.
    expect(map.s4[0].first_frame).toBeTruthy();
  });

  it('leaves the timeout fields null for an upstream rejection, rather than inventing zeros', async () => {
    const kv = kvDouble();
    await recordCronFailure(
      { KKME_SIGNALS: kv } as never, 's4', new Error('S4 FeatureServer: HTTP 403'),
    );
    const map = JSON.parse(kv.store.get(CRON_FAILURE_KEY)!);
    expect(map.s4[0].message).toBe('S4 FeatureServer: HTTP 403');
    expect(map.s4[0].elapsed_ms).toBeNull();
    expect(map.s4[0].timeout_ms).toBeNull();
    expect(map.s4[0].stage).toBeNull();
  });

  it('records s1, the leg the key shipped without covering', async () => {
    // Phase 52 wired s2/s4/s3/euribor and not s1 — the leg with the biggest
    // fan-out, and the most likely cause of the s4 rejection the key did catch.
    const kv = kvDouble();
    await recordCronFailure({ KKME_SIGNALS: kv } as never, 's1', new Error('ENTSOE_API_KEY secret not set'));
    const map = JSON.parse(kv.store.get(CRON_FAILURE_KEY)!);
    expect(map.s1[0].message).toBe('ENTSOE_API_KEY secret not set');
  });
});

describe('computeHistorical is fetched once a UTC day', () => {
  const dayKey = () => new Date().toISOString().slice(0, 10);

  it('serves a cache hit without opening a single connection', async () => {
    // The whole point: four ~425 KB windows are the long poles that starved
    // computeS4. On five of six ticks a day they must not be opened at all.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const cached = {
      rsi_30d: 1.23,
      trend_vs_90d: 2.05,
      pct_hours_above_20: 6.9,
      spread_pairing: { basis: 'timestamp', slots_30d: 2976, slots_ref: 720 },
    };
    const kv = kvDouble({ [`${HISTORICAL_CACHE_PREFIX}${dayKey()}`]: JSON.stringify(cached) });

    const out = await computeHistorical('key', { KKME_SIGNALS: kv } as never);

    expect(out).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not cache a degraded compute, so one bad tick cannot poison the day', async () => {
    // B12's shape — the damage disabling its own detector. An `empty` in KV at
    // 00:00Z would serve nulls until tomorrow and re-fetch nothing to fix it.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const kv = kvDouble();

    const out = await computeHistorical('key', { KKME_SIGNALS: kv } as never);

    expect(out.rsi_30d).toBeNull();
    expect(out.spread_pairing).toBeNull();
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.has(`${HISTORICAL_CACHE_PREFIX}${dayKey()}`)).toBe(false);
  });

  it('recomputes rather than throwing when the cached entry is unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const kv = kvDouble({ [`${HISTORICAL_CACHE_PREFIX}${dayKey()}`]: '{not json' });

    const out = await computeHistorical('key', { KKME_SIGNALS: kv } as never);
    expect(out).toHaveProperty('rsi_30d', null);
  });

  it('still works with no env, so the function is not coupled to KV being present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const out = await computeHistorical('key', undefined as never);
    expect(out.rsi_30d).toBeNull();
  });
});
