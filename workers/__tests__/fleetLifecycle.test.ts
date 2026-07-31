/**
 * Phase 37.B — lifecycle endpoints + /health detector surface, at ROUTE level (B2).
 * All fixtures synthetic.
 */
import { describe, it, expect } from 'vitest';
import worker from '../fetch-s1.js';
import { findPrivateLeaks, findContactShapedContent } from '../../tools/fleet-intel/lib/tiers.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SECRET = 'test-update-secret';
const ctx = { waitUntil: () => {} } as Any;

function env(store = new Map<string, string>()) {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [] }),
    },
    UPDATE_SECRET: SECRET,
  } as Any;
}
const call = (e: Any, path: string, init: Any = {}) =>
  (worker as Any).fetch(new Request(`https://x.kkme.eu${path}`, init), e, ctx);

const CITED = [{ url: 'https://example.org/register/1', source_type: 'registry', what_it_confirms: 'terminated' }];
const RETIRE = { id: 'fi-lv-x-1', at: '2026-07-31T12:00:00Z', type: 'retired', reason: 'registry_terminated', evidence: CITED, removed_from_db: false, excluded_from_supply: true, reversible: true };

describe('POST /admin/fleet-lifecycle', () => {
  it('requires the secret', async () => {
    const res = await call(env(), '/admin/fleet-lifecycle', { method: 'POST', body: JSON.stringify({ transitions: [RETIRE] }) });
    expect(res.status).toBe(401);
  });

  it('appends a cited retirement', async () => {
    const e = env();
    const res = await call(e, '/admin/fleet-lifecycle', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: JSON.stringify({ transitions: [RETIRE] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).appended).toBe(1);
  });

  it('REJECTS a retirement with no cited evidence (rule #3)', async () => {
    const e = env();
    const res = await call(e, '/admin/fleet-lifecycle', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ transitions: [{ ...RETIRE, evidence: [] }] }),
    });
    const j = await res.json();
    expect(j.appended).toBe(0);
    expect(j.rejected[0].why).toMatch(/without cited evidence/);
  });

  it('rejects evidence whose URL is not resolvable', async () => {
    const e = env();
    const res = await call(e, '/admin/fleet-lifecycle', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ transitions: [{ ...RETIRE, evidence: [{ url: 'see the register' }] }] }),
    });
    expect((await res.json()).appended).toBe(0);
  });

  it('is APPEND-ONLY — a second post does not truncate the first', async () => {
    const e = env();
    await call(e, '/admin/fleet-lifecycle', { method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: JSON.stringify({ transitions: [RETIRE] }) });
    const res = await call(e, '/admin/fleet-lifecycle', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET },
      body: JSON.stringify({ transitions: [{ ...RETIRE, id: 'fi-lv-x-2' }] }),
    });
    expect((await res.json()).log_size).toBe(2);
  });
});

describe('GET /admin/fleet-lifecycle', () => {
  it('is operator-only', async () => {
    expect((await call(env(), '/admin/fleet-lifecycle')).status).toBe(401);
  });
});

describe('/health — detector liveness is visible (B8)', () => {
  it('reports never_run before anything has run', async () => {
    const res = await call(env(), '/health');
    const j = await res.json();
    expect(j.fleet_lifecycle).toBeDefined();
    expect(j.fleet_lifecycle.status).toBe('never_run');
  });

  it('reports degraded when a detector is unhealthy — a broken week is not a quiet week', async () => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({
      detectors: {
        registry_terminated: { status: 'unhealthy', last_run_at: new Date().toISOString(), reasons: ['terminated share 100%'] },
        press_negative: { status: 'healthy', last_run_at: new Date().toISOString(), reasons: [] },
      },
      transition_log_size: 3,
    }));
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.status).toBe('degraded');
    expect(j.fleet_lifecycle.all_healthy).toBe(false);
    expect(j.fleet_lifecycle.unhealthy_count).toBe(1);
    expect(j.fleet_lifecycle.detectors.registry_terminated.reasons.join(' ')).toMatch(/terminated share/);
  });

  it('reports ok only when every detector is healthy', async () => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({
      detectors: { a: { status: 'healthy', last_run_at: new Date().toISOString(), reasons: [] } },
    }));
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.status).toBe('ok');
    expect(j.fleet_lifecycle.all_healthy).toBe(true);
  });

  it('/health carries no private data even with a lifecycle log present', async () => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({ detectors: { a: { status: 'healthy', last_run_at: new Date().toISOString(), reasons: [] } } }));
    store.set('fleet_private:index', JSON.stringify({ rows: [{ contact: 'nobody@example.invalid', comment: 'x', apva_flag: 'Gavo' }] }));
    const res = await call(env(store), '/health');
    const text = await res.text();
    expect(text).not.toMatch(/example\.invalid/);
    expect(text).not.toMatch(/apva_flag/);
    const j = JSON.parse(text);
    expect(findPrivateLeaks(j)).toEqual([]);
    expect(findContactShapedContent(j)).toEqual([]);
  });
});

describe('weekly digest — manual trigger, not yet cron-armed (B10 corollary)', () => {
  it('requires the secret', async () => {
    expect((await call(env(), '/admin/fleet-lifecycle-digest', { method: 'POST', body: '{}' })).status).toBe(401);
  });

  it('defaults to dry_run — no send without an explicit opt-in', async () => {
    const j = await (await call(env(), '/admin/fleet-lifecycle-digest', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: JSON.stringify({}),
    })).json();
    expect(j.dry_run).toBe(true);
  });

  it('says so loudly when NO detector has ever reported', async () => {
    const j = await (await call(env(), '/admin/fleet-lifecycle-digest', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: '{}',
    })).json();
    expect(j.message).toMatch(/cannot distinguish a quiet week from a dead pipeline/);
  });

  it('distinguishes a genuine quiet week from a broken one', async () => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({ detectors: { a: { status: 'healthy', reasons: [] } } }));
    const j = await (await call(env(store), '/admin/fleet-lifecycle-digest', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: '{}',
    })).json();
    expect(j.message).toMatch(/genuine quiet week/);
  });

  it('surfaces unhealthy detectors in the digest body itself', async () => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({ detectors: { registry_terminated: { status: 'unhealthy', reasons: ['terminated share 100%'] } } }));
    const j = await (await call(env(store), '/admin/fleet-lifecycle-digest', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: '{}',
    })).json();
    expect(j.unhealthy_detectors).toBe(1);
    expect(j.message).toMatch(/Detectors not healthy/);
    expect(j.message).not.toMatch(/genuine quiet week/);
  });

  it('the digest carries no private data', async () => {
    const store = new Map<string, string>();
    store.set('fleet_private:index', JSON.stringify({ rows: [{ contact: 'nobody@example.invalid', comment: 'x', apva_flag: 'Gavo' }] }));
    const j = await (await call(env(store), '/admin/fleet-lifecycle-digest', {
      method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: '{}',
    })).json();
    expect(j.message).not.toMatch(/example\.invalid|Gavo/);
  });
});
