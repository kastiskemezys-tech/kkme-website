/**
 * Phase 37.C — the fleet console's auth boundary and its leak tests.
 *
 * These run against the WORKER'S OWN ROUTES (B2: verify at the outermost layer a
 * caller touches), and they are written against the failure mode batch-1 caught in
 * its own sweep: an emptiness assertion that ran against `{"fleet":null}` and so
 * proved nothing. Every leak test here therefore
 *
 *   1. SEEDS the private overlay with values that would be unmistakable if leaked,
 *   2. proves the seed loaded (the vacuity guard) before asserting any absence,
 *   3. and is proven failable by the inject-then-remove protocol recorded in the
 *      handover — an injected leak turns these red, removing it turns them green,
 *      and the worker is byte-identical either side.
 *
 * Every value below is SYNTHETIC. No real contact, comment, project or flag appears.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../fetch-s1.js';
import { signFleetToken, buildCrmView, bessFigureForRow, publishability, isHybridRow } from '../lib/fleetCrm.js';
import { signCalcToken } from '../lib/calculator.js';
import { findPrivateLeaks, findContactShapedContent } from '../../tools/fleet-intel/lib/tiers.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const FLEET_SECRET = 'test-fleet-secret';
const UPDATE_SECRET = 'test-update-secret';
const CALC_SECRET = 'test-calc-secret';

/**
 * The canary values. Each is distinctive enough that a substring match anywhere in
 * any response body is conclusive — no false negatives from formatting, no false
 * positives from ordinary market data.
 */
const CANARY = {
  email: 'nobody@example.invalid',
  comment: 'ZZKANARY deal comment — synthetic',
  apva: 'ZZKANARY-APVA-TESTIMONY',
  raw_power: 'ZZKANARY 77MWh BESS / 7.7 MWp PV',
};

const SYNTH_PRIVATE_ROWS = [
  {
    id: 'fi-lt-canary-0000000001',
    country: 'LT',
    spv: 'UAB "Kanarėlė BESS"',
    org: 'Fictional Energy GmbH',
    plant_type: 'BESS',
    site_total_mw: 50,
    bess_mw: 50,
    location: 'Testonys',
    verification_status: 'private-only',
    citations: [],
    contact: CANARY.email,
    comment: CANARY.comment,
    apva_flag: CANARY.apva,
    raw_power_text: CANARY.raw_power,
  },
  {
    // A hybrid with a registry-only citation — the exact shape Pause A found across
    // all 36 public-confirmed rows: the company is confirmed, the capacity is not.
    id: 'fi-lv-canary-0000000002',
    country: 'LV',
    spv: 'SIA "Kanarina Energija"',
    org: 'Fictional Baltics SIA',
    plant_type: 'SUN E with BESS',
    site_total_mw: 120,
    location: 'Nekurnebutne',
    verification_status: 'public-confirmed',
    citations: [{
      source_type: 'registry',
      url: 'https://data.gov.lv/dati/lv/dataset/synthetic',
      what_it_confirms: 'entity resolves in the Latvian Uzņēmumu reģistrs, reg. 40200000000, status active',
    }],
    contact: CANARY.email,
    comment: CANARY.comment,
  },
];

/** A public fleet with entries, so the public routes serve real payloads to sweep. */
const SYNTH_PUBLIC_FLEET = {
  raw_entries: [
    { id: 'canary-bess-lt', name: 'UAB "Kanarėlė BESS"', mw: 50, mwh: 100, status: 'announced', country: 'LT' },
    { id: 'kitas-lt', name: 'Visai Kitas', mw: 120, mwh: 240, status: 'announced', country: 'LT' },
  ],
  baltic_operational_mw: 0,
  sd_ratio: 1,
  demand: null,
};

let store: Map<string, string>;
let env: Any;
const ctx = { waitUntil: () => {} } as Any;

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
    UPDATE_SECRET, CALC_SECRET, FLEET_SECRET,
    ...overrides,
  } as Any;
}

const req = (path: string, init: Any = {}, e: Any = env) =>
  (worker as Any).fetch(new Request(`https://x.kkme.eu${path}`, init), e, ctx);

async function seedPrivateOverlay() {
  const res = await req('/admin/fleet-private', {
    method: 'POST',
    headers: { 'X-Update-Secret': UPDATE_SECRET },
    body: JSON.stringify({ rows: SYNTH_PRIVATE_ROWS }),
  });
  expect(res.status, 'seeding the private overlay failed — every leak test below would be vacuous').toBe(200);
}

const authed = async () => ({
  Authorization: `Bearer ${await signFleetToken(FLEET_SECRET, Date.now() + 60_000)}`,
});

beforeEach(() => {
  store = new Map<string, string>();
  store.set('s4_fleet', JSON.stringify(SYNTH_PUBLIC_FLEET));
  store.set('s2_fleet', JSON.stringify(SYNTH_PUBLIC_FLEET));
  env = makeEnv();
});

// ───────────────────────────────────────────────────────────────────────────
describe('37.C auth — there is no public tier, and an unset secret fails closed', () => {
  const ROUTES: Array<[string, Any]> = [
    ['/fleet/data', { method: 'GET' }],
    ['/fleet/comment', { method: 'POST', body: JSON.stringify({ id: 'x', text: 'y' }) }],
  ];

  it('503s with zero data when FLEET_SECRET is unset — not "auth disabled"', async () => {
    await seedPrivateOverlay();
    const noSecret = makeEnv({ FLEET_SECRET: undefined });
    for (const [path, init] of ROUTES) {
      const res = await req(path, init, noSecret);
      expect(res.status, path).toBe(503);
      const text = await res.text();
      for (const [name, value] of Object.entries(CANARY)) {
        expect(text, `${path} leaked ${name} on the unconfigured path`).not.toContain(value);
      }
    }
    const login = await req('/fleet/login', { method: 'POST', body: JSON.stringify({ password: 'anything' }) }, noSecret);
    expect(login.status).toBe(503);
  });

  it('401s without a token, and the body carries no data of any kind', async () => {
    await seedPrivateOverlay();
    for (const [path, init] of ROUTES) {
      const res = await req(path, init);
      expect(res.status, path).toBe(401);
      const body = await res.json();
      // an error string and nothing else — no counts, no keys, no shape
      expect(Object.keys(body), `${path} returned more than an error`).toEqual(['error']);
    }
  });

  it('rejects a malformed, a forged and an expired token', async () => {
    await seedPrivateOverlay();
    const forged = `${Date.now() + 60_000}.${'0'.repeat(64)}`;
    const expired = await signFleetToken(FLEET_SECRET, Date.now() - 1);
    for (const token of ['not-a-token', forged, expired]) {
      const res = await req('/fleet/data', { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status, token.slice(0, 12)).toBe(401);
    }
  });

  it('a calculator token does not open the fleet console', async () => {
    await seedPrivateOverlay();
    // Worst case: both secrets accidentally set to the same string. The domain
    // prefix in the signed message is what still separates them.
    const sameSecretEnv = makeEnv({ CALC_SECRET: FLEET_SECRET });
    const calcToken = await signCalcToken(FLEET_SECRET, Date.now() + 60_000);
    const res = await req('/fleet/data', { headers: { Authorization: `Bearer ${calcToken}` } }, sameSecretEnv);
    expect(res.status).toBe(401);
  });

  it('issues a working token for the right password only', async () => {
    const bad = await req('/fleet/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
    expect(bad.status).toBe(401);

    const ok = await req('/fleet/login', { method: 'POST', body: JSON.stringify({ password: FLEET_SECRET }) });
    expect(ok.status).toBe(200);
    const { token } = await ok.json();
    const used = await req('/fleet/data', { headers: { Authorization: `Bearer ${token}` } });
    expect(used.status).toBe(200);
  });

  it('never lets a console response be cached', async () => {
    await seedPrivateOverlay();
    const res = await req('/fleet/data', { headers: await authed() });
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
    expect(res.headers.get('Cache-Control')).toMatch(/private/);
  });

  it('does not send a wildcard CORS origin on the console routes', async () => {
    await seedPrivateOverlay();
    const res = await req('/fleet/data', { headers: await authed() });
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('37.C LEAK — canaries are present behind auth and absent everywhere else', () => {
  /**
   * The positive control. If this fails, every absence assertion below is
   * meaningless, because the values were never in the system to leak.
   */
  it('VACUITY GUARD: the authed console really does serve every canary', async () => {
    await seedPrivateOverlay();
    const res = await req('/fleet/data', { headers: await authed() });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const [name, value] of Object.entries(CANARY)) {
      expect(text, `canary ${name} absent from the AUTHED payload — the leak sweep would be vacuous`)
        .toContain(value);
    }
    const body = JSON.parse(text);
    expect(body.count).toBe(SYNTH_PRIVATE_ROWS.length);
    expect(body.projects.length).toBe(SYNTH_PRIVATE_ROWS.length);
  });

  const PUBLIC_ROUTES = ['/s2/fleet', '/s4/fleet', '/s2', '/s1', '/health', '/revenue', '/'];

  it('no public route carries a canary, a private field or a contact-shaped string', async () => {
    await seedPrivateOverlay();

    // vacuity guard #1 — the fleet routes must actually be serving fleet data
    const probe = await req('/s4/fleet');
    const probeBody = await probe.json();
    expect(probeBody.raw_entries, 'fleet route served nothing — sweep would be vacuous').toBeDefined();
    expect(probeBody.raw_entries.length).toBeGreaterThan(0);

    for (const route of PUBLIC_ROUTES) {
      const res = await req(route);
      const text = await res.text();
      // vacuity guard #2 — an empty body cannot pass for a clean one
      expect(text.length, `${route} returned an empty body — sweep would be vacuous`).toBeGreaterThan(2);

      for (const [name, value] of Object.entries(CANARY)) {
        expect(text, `${route} leaked ${name}`).not.toContain(value);
      }
      let parsed: Any = null;
      try { parsed = JSON.parse(text); } catch { /* non-JSON route */ }
      if (parsed) {
        expect(findPrivateLeaks(parsed), `${route} private-field leak`).toEqual([]);
        expect(findContactShapedContent(parsed), `${route} contact-shaped leak`).toEqual([]);
      }
    }
  });

  it('no UNAUTHENTICATED /fleet/* response carries a canary', async () => {
    await seedPrivateOverlay();
    const probes: Array<[string, Any]> = [
      ['/fleet/data', {}],
      ['/fleet/data', { headers: { Authorization: 'Bearer garbage' } }],
      ['/fleet/comment', { method: 'POST', body: JSON.stringify({ id: 'fi-lt-canary-0000000001', text: 'x' }) }],
      ['/fleet/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) }],
    ];
    for (const [path, init] of probes) {
      const res = await req(path, init);
      expect(res.status, `${path} must not succeed`).toBeGreaterThanOrEqual(400);
      const text = await res.text();
      for (const [name, value] of Object.entries(CANARY)) {
        expect(text, `${path} leaked ${name}`).not.toContain(value);
      }
    }
  });

  it('public fleet routes never read a private key (guards a future refactor)', async () => {
    const reads: string[] = [];
    const spyEnv = {
      KKME_SIGNALS: {
        get: async (k: string) => { reads.push(k); return store.get(k) ?? null; },
        put: async () => {},
        list: async () => ({ keys: [] }),
      },
      UPDATE_SECRET, FLEET_SECRET,
    } as Any;
    await seedPrivateOverlay();
    for (const route of ['/s2/fleet', '/s4/fleet', '/s2', '/health']) {
      await req(route, {}, spyEnv);
    }
    expect(reads.filter((k) => k.startsWith('fleet_private'))).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('37.C comment editing', () => {
  it('stores an edit in its own key and leaves the intake copy intact', async () => {
    await seedPrivateOverlay();
    const before = store.get('fleet_private:index');

    const res = await req('/fleet/comment', {
      method: 'POST',
      headers: await authed(),
      body: JSON.stringify({ id: 'fi-lt-canary-0000000001', text: 'ZZKANARY edited note' }),
    });
    expect(res.status).toBe(200);

    // B10: the intake payload is untouched, so the next run cannot silently
    // discard the edit and the original remains visible as the original.
    expect(store.get('fleet_private:index')).toBe(before);
    expect(store.get('fleet_private:comments')).toContain('ZZKANARY edited note');

    const view = await (await req('/fleet/data', { headers: await authed() })).json();
    const row = view.projects.find((p: Any) => p.id === 'fi-lt-canary-0000000001');
    expect(row.comment).toBe('ZZKANARY edited note');
    expect(row.comment_edited).toBe(true);
    expect(row.comment_original).toBe(CANARY.comment);
  });

  it('rejects an edit without an id', async () => {
    const res = await req('/fleet/comment', {
      method: 'POST', headers: await authed(), body: JSON.stringify({ text: 'orphan' }),
    });
    expect(res.status).toBe(400);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('37.C data discipline — apva, hybrids, publishability', () => {
  it('apva_flag never influences publishability', async () => {
    const withFlag = { ...SYNTH_PRIVATE_ROWS[1], apva_flag: CANARY.apva };
    const without = { ...SYNTH_PRIVATE_ROWS[1] };
    delete (without as Any).apva_flag;
    expect(publishability(withFlag)).toEqual(publishability(without));
  });

  it('apva_flag always travels with its not-citable note', async () => {
    await seedPrivateOverlay();
    const view = await (await req('/fleet/data', { headers: await authed() })).json();
    const row = view.projects.find((p: Any) => p.id === 'fi-lt-canary-0000000001');
    expect(row.apva.value).toBe(CANARY.apva);
    expect(row.apva.citable).toBe(false);
    expect(row.apva.note).toMatch(/not citable/i);
  });

  it('a hybrid row yields a band, never a point', () => {
    const hybrid = SYNTH_PRIVATE_ROWS[1];
    expect(isHybridRow(hybrid)).toBe(true);
    const fig = bessFigureForRow(hybrid);
    expect(fig.kind).toBe('band');
    expect(fig.lower_mw).toBe(0);
    expect(fig.upper_mw).toBe(120);
    // no midpoint anywhere — "a point estimate wearing a range costume"
    expect(JSON.stringify(fig)).not.toContain('60');
  });

  it('a registry citation confirming only the entity does not make capacity citable', () => {
    const pub = publishability(SYNTH_PRIVATE_ROWS[1]);
    expect(pub.publishable).toBe(true);
    expect(pub.capacity_citable).toBe(false);
    expect(pub.reason).toMatch(/legal entity only/i);
  });

  it('a citation that speaks to capacity does make it citable', () => {
    const row = {
      ...SYNTH_PRIVATE_ROWS[1],
      citations: [{
        source_type: 'permit', url: 'https://example.org/permit',
        what_it_confirms: 'permit states 40 MW / 80 MWh of storage capacity',
      }],
    };
    expect(publishability(row).capacity_citable).toBe(true);
  });

  it('private-only rows are never publishable, whatever else they carry', () => {
    expect(publishability(SYNTH_PRIVATE_ROWS[0]).publishable).toBe(false);
  });

  it('the summary states the citable BESS total rather than implying it by omission', () => {
    const view = buildCrmView({ privateIndex: { rows: SYNTH_PRIVATE_ROWS } });
    expect(view.summary.citable_bess_mw).toBe(0);
    expect(view.summary.capacity_citable_rows).toBe(0);
    expect(view.summary.publishable_rows).toBe(1);
  });
});
