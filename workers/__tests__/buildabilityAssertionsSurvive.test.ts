/**
 * Phase 38.2 (B-059) — `POST /s4/buildability` may not delete what it was not
 * told about.
 *
 * The endpoint used to `put` the request body wholesale, so every poster owned
 * the whole key. `scripts/vps/fetch_entsoe_installed_capacity.py` builds its
 * body from scratch carrying only `installed_storage_<c>_mw_live` keys — so its
 * FIRST SUCCESS would have deleted all sixteen assertions in production. Both
 * halves were live; only the script's continued failure was preventing it.
 *
 * The fixture below is the real production key, read 2026-08-03. The A68 body
 * below is the real shape that script posts (`:207-228`). The test drives the
 * REAL router, not a reimplementation of the merge, and asserts on what the
 * store holds afterwards — the artifact, not the response envelope.
 *
 * Proven failable by inject-then-revert on the real mechanism: restoring
 * `await env.KKME_SIGNALS.put('s4_buildability', JSON.stringify(body))` takes
 * the preservation specs red. See the phase handover for the counts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../fetch-s1.js';
import LIVE_KEY from './fixtures/s4-buildability-live-2026-08-03.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const SECRET = 'test-secret';
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;

let store: Map<string, string>;

function makeEnv() {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
    UPDATE_SECRET: SECRET,
  } as Any;
}

const post = (payload: unknown, secret: string | null = SECRET) =>
  (worker as Any).fetch(
    new Request('https://x.kkme.eu/s4/buildability', {
      method: 'POST',
      headers: secret ? { 'X-Update-Secret': secret, 'Content-Type': 'application/json' } : {},
      body: JSON.stringify(payload),
    }),
    makeEnv(),
    ctx,
  );

const stored = () => JSON.parse(store.get('s4_buildability') as string);

/** Exactly what fetch_entsoe_installed_capacity.py:207-228 posts. */
const A68_BODY = {
  assertions: {
    installed_storage_lt_mw_live: {
      value: 500.0, as_of_date: '2026-08-03',
      source: 'ENTSO-E A68 (production type B25)', source_url: 'https://web-api.tp.entsoe.eu/api',
    },
    installed_storage_lv_mw_live: {
      value: 80.0, as_of_date: '2026-08-03',
      source: 'ENTSO-E A68 (production type B25)', source_url: 'https://web-api.tp.entsoe.eu/api',
    },
  },
  _phase: '12.10',
  _origin: 'vps_a68_live_fetch',
};

beforeEach(() => {
  store = new Map();
  store.set('s4_buildability', JSON.stringify(LIVE_KEY));
});

describe('POST /s4/buildability preserves assertions it was not told about', () => {
  it('the A68 body no longer deletes the sixteen assertions it never carried', async () => {
    const before = Object.keys((LIVE_KEY as Any).assertions);
    expect(before).toHaveLength(16);

    const res = await post(A68_BODY);
    expect(res.status).toBe(200);

    const after = stored().assertions;
    // Every prior key survives, with its value intact — not merely its name.
    for (const k of before) {
      expect(after, `assertion ${k} was deleted`).toHaveProperty(k);
      expect(after[k].value).toEqual((LIVE_KEY as Any).assertions[k].value);
    }
    // …and the two the poster does carry are now present.
    expect(after.installed_storage_lt_mw_live.value).toBe(500);
    expect(after.installed_storage_lv_mw_live.value).toBe(80);
    expect(Object.keys(after)).toHaveLength(18);
  });

  it('incoming keys win per-key, so a poster can still correct a value it owns', async () => {
    await post({
      assertions: {
        installed_storage_lv_mw: { value: 80, as_of_date: '2025-10-30', confidence: 'official' },
      },
    });
    const after = stored().assertions;
    expect(after.installed_storage_lv_mw.value).toBe(80);
    expect(after.installed_storage_lv_mw.as_of_date).toBe('2025-10-30');
    expect(Object.keys(after)).toHaveLength(16);   // corrected, not added
    expect(after.installed_storage_lt_mw.value).toBe(484);  // neighbours untouched
  });

  it('sibling top-level blocks the poster omits are carried forward too', async () => {
    // `connected_assets` lives beside `assertions` and no poster sends both.
    expect((LIVE_KEY as Any).connected_assets).toBeTruthy();
    await post(A68_BODY);
    expect(stored().connected_assets).toEqual((LIVE_KEY as Any).connected_assets);
  });

  it('mode:"replace" is the only way to destroy, and it says what it destroyed', async () => {
    const res = await post({ ...A68_BODY, mode: 'replace' });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.mode).toBe('replace');
    expect(json.dropped).toHaveLength(16);
    expect(Object.keys(stored().assertions)).toHaveLength(2);
    // The flag is consumed, never persisted — otherwise the next merge inherits it.
    expect(stored()).not.toHaveProperty('mode');
  });

  it('an empty assertion set is a no-op, not a wipe', async () => {
    await post({ assertions: {} });
    expect(Object.keys(stored().assertions)).toHaveLength(16);
  });

  it('still refuses an unauthenticated push', async () => {
    const res = await post(A68_BODY, null);
    expect(res.status).toBe(401);
    expect(Object.keys(stored().assertions)).toHaveLength(16);
  });
});
