/**
 * Phase 37.A — API-level leak tests for the private fleet-intel overlay.
 *
 * These run against the WORKER'S OWN ROUTES, not against the serializer in
 * isolation (B2: verify at the outermost layer a caller touches). The unit-level
 * projection tests live in tools/fleet-intel/__tests__.
 *
 * Every row here is SYNTHETIC. No real contact, comment or project appears.
 */

import { describe, it, expect } from 'vitest';
import worker from '../fetch-s1.js';
import { findPrivateLeaks, findContactShapedContent } from '../../tools/fleet-intel/lib/tiers.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SECRET = 'test-update-secret';

function makeEnv(store = new Map<string, string>()) {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
    UPDATE_SECRET: SECRET,
  } as Any;
}
const ctx = { waitUntil: () => {} } as Any;

const req = (path: string, init: Any = {}) =>
  (worker as Any).fetch(new Request(`https://x.kkme.eu${path}`, init), makeEnvShared, ctx);

let makeEnvShared = makeEnv();

const SYNTH_PRIVATE_ROWS = [
  {
    id: 'fi-lt-testonys-0000000000',
    country: 'LT',
    spv: 'UAB "Testonys BESS"',
    org: 'Fictional Energy GmbH',
    bess_mw: 50,
    location: 'Testonys',
    verification_status: 'private-only',
    contact: 'nobody@example.invalid',
    comment: 'sintetinis komentaras',
    apva_flag: 'Gavo',
  },
];

describe('POST /admin/fleet-private — auth', () => {
  it('rejects an unauthenticated write', async () => {
    makeEnvShared = makeEnv();
    const res = await req('/admin/fleet-private', {
      method: 'POST', body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': 'wrong' },
      body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts an authenticated write', async () => {
    const res = await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });
});

describe('GET /admin/fleet-private — no public tier at all', () => {
  it('returns 401 without the secret — not a redacted payload, nothing', async () => {
    const res = await req('/admin/fleet-private');
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/example\.invalid/);
    expect(text).not.toMatch(/komentaras/i);
    expect(text).not.toMatch(/Gavo/);
  });

  it('returns the overlay WITH the secret', async () => {
    const res = await req('/admin/fleet-private', { headers: { 'X-Update-Secret': SECRET } });
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toHaveLength(1);
  });

  it('does not send CORS headers — must not be readable from a browser origin', async () => {
    const res = await req('/admin/fleet-private', { headers: { 'X-Update-Secret': SECRET } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('B10 — a refresh cannot silently shrink the overlay', () => {
  it('rejects a smaller batch without an explicit acknowledgement', async () => {
    // store two rows first
    await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ rows: [...SYNTH_PRIVATE_ROWS, { ...SYNTH_PRIVATE_ROWS[0], id: 'fi-lt-second-111' }] }),
    });
    const res = await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/shrink/i);
  });

  it('allows the shrink when it is explicitly intended', async () => {
    const res = await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS, allow_shrink: true }),
    });
    expect(res.status).toBe(200);
  });
});

describe('LEAK — private data is absent from every PUBLIC route', () => {
  const PUBLIC_ROUTES = ['/s2/fleet', '/s4/fleet', '/s2', '/health'];

  /**
   * A synthetic PUBLIC fleet, so the fleet routes return a real payload.
   * Without this the routes answer `{"fleet":null}` and the sweep below passes
   * vacuously — it would assert that an empty response contains no secrets.
   * The two entries deliberately share names with the private rows, so a naive
   * merge of the overlay into the public fleet would be caught.
   */
  const SYNTH_PUBLIC_FLEET = {
    raw_entries: [
      { id: 'testonys-bess-lt', name: 'UAB "Testonys BESS"', mw: 50, mwh: 100, status: 'announced', country: 'LT' },
      { id: 'kitas-lt', name: 'Visai Kitas', mw: 120, mwh: 240, status: 'announced', country: 'LT' },
    ],
    baltic_operational_mw: 0,
    sd_ratio: 1,
    demand: null,
  };

  it('no public fleet-adjacent route exposes a private field or contact-shaped string', async () => {
    const store = new Map<string, string>();
    store.set('s4_fleet', JSON.stringify(SYNTH_PUBLIC_FLEET));
    store.set('s2_fleet', JSON.stringify(SYNTH_PUBLIC_FLEET));
    makeEnvShared = makeEnv(store);

    await req('/admin/fleet-private', {
      method: 'POST',
      headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
    });

    // vacuity guard: the fleet routes must actually be serving fleet data,
    // otherwise this whole sweep proves nothing.
    const fleetProbe = await req('/s4/fleet');
    const fleetBody = await fleetProbe.json();
    expect(fleetBody.raw_entries, 'fleet route returned no entries — sweep would be vacuous').toBeDefined();
    expect(fleetBody.raw_entries.length).toBeGreaterThan(0);

    for (const route of PUBLIC_ROUTES) {
      const res = await req(route);
      const text = await res.text();
      expect(text.length, `${route} returned an empty body — sweep would be vacuous`).toBeGreaterThan(2);

      // the raw markers, by content
      expect(text, `${route} leaked an email`).not.toMatch(/example\.invalid/);
      expect(text, `${route} leaked a comment`).not.toMatch(/sintetinis komentaras/);
      expect(text, `${route} leaked the APVA flag`).not.toMatch(/"apva_flag"/);

      // and structurally, if the route returned JSON
      let parsed: Any = null;
      try { parsed = JSON.parse(text); } catch { /* non-JSON route */ }
      if (parsed) {
        expect(findPrivateLeaks(parsed), `${route} private-field leak`).toEqual([]);
        expect(findContactShapedContent(parsed), `${route} contact-shaped leak`).toEqual([]);
      }
    }
  });

  it('the private KV key is never read by a public route (guards a future refactor)', async () => {
    const reads: string[] = [];
    const spyEnv = {
      KKME_SIGNALS: {
        get: async (k: string) => { reads.push(k); return null; },
        put: async () => {},
        list: async () => ({ keys: [] }),
      },
      UPDATE_SECRET: SECRET,
    } as Any;

    for (const route of ['/s2/fleet', '/s4/fleet']) {
      await (worker as Any).fetch(new Request(`https://x.kkme.eu${route}`), spyEnv, ctx);
    }
    expect(reads.filter((k) => k.startsWith('fleet_private'))).toEqual([]);
  });
});
