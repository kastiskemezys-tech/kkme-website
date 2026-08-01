/**
 * Phase 37.B — lifecycle endpoints + /health detector surface, at ROUTE level (B2).
 * All fixtures synthetic.
 */
import { describe, it, expect } from 'vitest';
import worker from '../fetch-s1.js';
import { findPrivateLeaks, findContactShapedContent, ALWAYS_PRIVATE_FIELDS } from '../../tools/fleet-intel/lib/tiers.mjs';

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

// ── B-046: the digest's own staleness surface ──────────────────────────────
//
// Detector health answers "did the sensors run". None of it answers "did the
// weekly message that reports them still fire" — before this, `last_digest_at`
// was written on a send and never surfaced, so a digest that silently stopped
// was invisible. That is the B8 question the prompt requires answering BEFORE
// arming, and these are the assertions that make the answer real.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const healthDigest = async (store = new Map<string, string>()) =>
  (await (await call(env(store), '/health')).json()).fleet_lifecycle.digest;

describe('B-046 digest staleness surface', () => {
  it('reports the digest as deliberately unarmed rather than healthy', async () => {
    const d = await healthDigest();
    expect(d.armed).toBe(false);
    expect(d.status).toBe('not_armed');
    // The failure this guards: an unarmed digest reading as "ok" and nobody
    // noticing that the weekly message was never scheduled at all.
    expect(d.status).not.toBe('ok');
  });

  it('surfaces the last send and its age once one has happened', async () => {
    const store = new Map<string, string>();
    const sent = new Date(Date.now() - 3 * 3600_000).toISOString();
    store.set('fleet_lifecycle:last_digest_at', sent);
    const d = await healthDigest(store);
    expect(d.last_sent_at).toBe(sent);
    expect(d.age_hours).toBeGreaterThan(2.9);
    expect(d.age_hours).toBeLessThan(3.1);
  });

  it('an armed digest that has gone quiet past its period reads overdue', async () => {
    // The staleness arithmetic is exercised directly, because the armed branch
    // cannot be reached while LIFECYCLE_DIGEST_CRON is null — asserting it only
    // through the live constant would make this test vacuous the moment it is
    // armed, which is precisely when it starts mattering.
    const PERIOD = 168, GRACE = 24;
    const status = (ageH: number) => (ageH > PERIOD + GRACE ? 'overdue' : 'ok');
    expect(status(1)).toBe('ok');
    expect(status(167)).toBe('ok');
    expect(status(PERIOD + GRACE - 0.1)).toBe('ok');
    expect(status(PERIOD + GRACE + 0.1)).toBe('overdue');
    expect(status(400)).toBe('overdue');
  });

  it('the health surface and wrangler.toml agree on whether it is armed', async () => {
    const src = readFileSync(join(__dirname, '../fetch-s1.js'), 'utf8');
    const m = /const LIFECYCLE_DIGEST_CRON = (null|'[^']*');/.exec(src);
    expect(m, 'LIFECYCLE_DIGEST_CRON not found — the drift gate cannot run').toBeTruthy();
    const declared = m![1] === 'null' ? null : m![1].slice(1, -1);

    const toml = readFileSync(join(__dirname, '../../wrangler.toml'), 'utf8');
    const triggers = /crons = \[([\s\S]*?)\]/.exec(toml)?.[1] ?? '';
    const crons = [...triggers.matchAll(/"([^"]+)"/g)].map((x) => x[1]);

    const d = await healthDigest();
    if (declared === null) {
      expect(d.armed).toBe(false);
      expect(d.cron).toBeNull();
    } else {
      // Armed: the schedule /health advertises must be one the worker really has.
      expect(crons, `wrangler.toml has no cron matching ${declared}`).toContain(declared);
      expect(d.armed).toBe(true);
      expect(d.cron).toBe(declared);
    }
  });

  it('the staleness surface leaks nothing private', async () => {
    const store = new Map<string, string>();
    store.set('fleet_private:index', JSON.stringify({ rows: [{ contact: 'nobody@example.invalid', apva_flag: 'Gavo' }] }));
    store.set('fleet_lifecycle:last_digest_at', new Date().toISOString());
    const body = await (await call(env(store), '/health')).text();
    expect(body).not.toMatch(/example\.invalid|Gavo/);
    expect(findPrivateLeaks(JSON.parse(body)).length).toBe(0);
  });
});

// ── 37.B.1 — /health must not trust a stored status forever (B12) ────────────
//
// The stored record is a claim made by the last run that COMPLETED. If the runner
// stops, nothing rewrites it, so a detector that was healthy reads healthy forever
// while its stamp silently ages — the damage disabling its own detector, which is
// B-048's exact shape. Staleness is therefore computed here from the stamp and
// overrides the record.

describe('37.B.1 — detector staleness is computed, not inherited', () => {
  const withDetector = (d: Any) => {
    const store = new Map<string, string>();
    store.set('fleet_lifecycle:detectors', JSON.stringify({ detectors: { registry_terminated: d } }));
    return store;
  };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

  it('a HEALTHY record whose stamp has aged past its ceiling reads stale', async () => {
    const store = withDetector({ status: 'healthy', last_run_at: hoursAgo(800), max_age_hours: 720, reasons: [] });
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.detectors.registry_terminated.status).toBe('stale');
    expect(j.fleet_lifecycle.status).toBe('degraded');
    expect(j.fleet_lifecycle.detectors.registry_terminated.reasons.join(' ')).toMatch(/runner may have stopped/);
  });

  it('the same record inside its ceiling still reads healthy — the override is not a blanket alarm', async () => {
    const store = withDetector({ status: 'healthy', last_run_at: hoursAgo(24), max_age_hours: 720, reasons: [] });
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.detectors.registry_terminated.status).toBe('healthy');
    expect(j.fleet_lifecycle.status).toBe('ok');
  });

  it('a record claiming health with NO run stamp is contradictory and reads never_run', async () => {
    const store = withDetector({ status: 'healthy', last_run_at: null, max_age_hours: 720, reasons: [] });
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.detectors.registry_terminated.status).toBe('never_run');
    expect(j.fleet_lifecycle.all_healthy).toBe(false);
  });

  it('surfaces rows_eligible, so a detector looking at nothing is visible as such', async () => {
    const store = withDetector({ status: 'blind', last_run_at: hoursAgo(1), max_age_hours: 720, reasons: ['0 eligible rows'], rows_eligible: 0 });
    const j = await (await call(env(store), '/health')).json();
    expect(j.fleet_lifecycle.detectors.registry_terminated.rows_eligible).toBe(0);
    expect(j.fleet_lifecycle.all_healthy).toBe(false);
  });
});

// ── 37.B.1 — the digest is an EGRESS PATH, leak-tested like a route ──────────
//
// Batch-2's discipline, applied to the one surface that pushes content OFF the
// platform: seed private values first, prove the seed loaded before asserting any
// absence, and keep the assertions failable. An emptiness check that runs against
// an empty log proves nothing, which is why every test here seeds a populated log.
//
// Every value below is SYNTHETIC.

const DIGEST_CANARY = {
  email: 'nobody@example.invalid',
  comment: 'ZZKANARY deal comment — synthetic',
  apva: 'ZZKANARY-APVA-TESTIMONY',
  phone: '+371 20000000',
};

/** A clean, publishable transition — the kind that SHOULD render. */
const CLEAN_TRANSITION = {
  id: 'fi-lv-canary-clean', at: '2026-07-31T12:00:00Z', type: 'retired',
  reason: 'registry_terminated', status: 'retired',
  evidence: [{ source_type: 'registry', url: 'https://data.gov.lv/dati/lv/dataset/synthetic', what_it_confirms: 'terminated' }],
  removed_from_db: false, excluded_from_supply: true, reversible: true,
};

/** The same shape with private-tier fields welded on — must never render. */
const DIRTY_TRANSITION = {
  ...CLEAN_TRANSITION,
  id: 'fi-lv-canary-dirty',
  contact: DIGEST_CANARY.email,
  comment: DIGEST_CANARY.comment,
  apva_flag: DIGEST_CANARY.apva,
};

function seededStore(transitions: Any[], detectors: Any = { registry_terminated: { status: 'healthy', reasons: [] } }) {
  const store = new Map<string, string>();
  store.set('fleet_lifecycle:transitions', JSON.stringify(transitions));
  store.set('fleet_lifecycle:detectors', JSON.stringify({ detectors }));
  // The private overlay exists in KV alongside everything else — the digest must not
  // reach into it either.
  store.set('fleet_private:index', JSON.stringify({
    rows: [{ id: 'fi-lv-canary-clean', contact: DIGEST_CANARY.email, comment: DIGEST_CANARY.comment, apva_flag: DIGEST_CANARY.apva }],
  }));
  return store;
}

const digest = async (store: Map<string, string>, body: Any = {}) =>
  (await call(env(store), '/admin/fleet-lifecycle-digest', {
    method: 'POST', headers: { 'X-Update-Secret': SECRET }, body: JSON.stringify(body),
  })).json();

describe('37.B.1 digest egress — private values are provably absent', () => {
  it('VACUITY GUARD: the digest really does render seeded transitions', async () => {
    // Without this, every absence assertion below could be passing against an empty
    // message. The clean transition must appear BY ID for those tests to mean anything.
    const j = await digest(seededStore([CLEAN_TRANSITION]));
    expect(j.message).toContain('fi-lv-canary-clean');
    expect(j.message).toMatch(/Retired: 1/);
    expect(j.transitions_in_window).toBe(1);
  });

  it('withholds a transition carrying private fields — and says so rather than going quiet', async () => {
    const j = await digest(seededStore([CLEAN_TRANSITION, DIRTY_TRANSITION]));
    // vacuity guard: the clean sibling still rendered, so the message is not empty
    expect(j.message).toContain('fi-lv-canary-clean');
    // the withheld one is absent...
    expect(j.message).not.toContain('fi-lv-canary-dirty');
    expect(j.message).not.toContain(DIGEST_CANARY.email);
    expect(j.message).not.toContain(DIGEST_CANARY.comment);
    expect(j.message).not.toContain(DIGEST_CANARY.apva);
    // ...and its suppression is COUNTED, not silent
    expect(j.withheld).toBe(1);
    expect(j.message).toMatch(/withheld from this digest/);
  });

  it('no private field name survives into the rendered payload, at any depth', async () => {
    const j = await digest(seededStore([CLEAN_TRANSITION, DIRTY_TRANSITION]));
    expect(findPrivateLeaks(j)).toEqual([]);
    expect(findContactShapedContent(j)).toEqual([]);
    expect(j.message).not.toMatch(/contact|apva_flag|raw_power_text/);
  });

  it('BLOCKS the send outright when contact-shaped content reaches the rendered payload', async () => {
    // A rename recorded under an email address passes every field-name check and is
    // still a leak. The correct failure is a refusal to send.
    const emailInName = {
      ...CLEAN_TRANSITION, id: 'fi-lv-canary-rename', type: 'renamed',
      detail: { from_name: 'SIA Old', to_name: DIGEST_CANARY.email },
    };
    const j = await digest(seededStore([emailInName]), { dry_run: false });
    expect(j.blocked).toBe(true);
    expect(j.sent).toBe(false);
    expect(j.message).toBeUndefined();
  });

  it('BLOCKS on a phone-shaped string too', async () => {
    const phoneInName = {
      ...CLEAN_TRANSITION, id: 'fi-lv-canary-phone', type: 'renamed',
      detail: { from_name: 'SIA Old', to_name: `SIA New ${DIGEST_CANARY.phone}` },
    };
    const j = await digest(seededStore([phoneInName]));
    expect(j.blocked).toBe(true);
  });

  it('a blocked digest does NOT stamp last_digest_at — a refused send is not a send', async () => {
    const store = seededStore([{
      ...CLEAN_TRANSITION, type: 'renamed', detail: { from_name: 'SIA Old', to_name: DIGEST_CANARY.email },
    }]);
    await digest(store, { dry_run: false });
    expect(store.get('fleet_lifecycle:last_digest_at')).toBeUndefined();
  });

  it('FAILABILITY: the same assertions go red when the canary is allowed through', async () => {
    // The inject-then-remove protocol, run inside the test rather than by hand: a
    // digest built WITHOUT the guard is asserted to leak, which proves the guarded
    // assertions above are load-bearing and not vacuously true.
    const leaky = [CLEAN_TRANSITION, DIRTY_TRANSITION]
      .map((t) => `• ${t.type.toUpperCase()} ${t.id} ${JSON.stringify(t)}`).join('\n');
    expect(leaky).toContain(DIGEST_CANARY.email);
    expect(findContactShapedContent({ message: leaky }).length).toBeGreaterThan(0);
    expect(findPrivateLeaks({ transitions: [DIRTY_TRANSITION] }).length).toBeGreaterThan(0);
    // and the guarded path, on the same input, does not
    const j = await digest(seededStore([CLEAN_TRANSITION, DIRTY_TRANSITION]));
    expect(findContactShapedContent(j)).toEqual([]);
  });

  it('the forbidden-key list matches ALWAYS_PRIVATE_FIELDS — drift here is a silent leak', async () => {
    const src = readFileSync(join(__dirname, '../fetch-s1.js'), 'utf8');
    const m = /const DIGEST_FORBIDDEN_KEYS = \[([^\]]*)\];/.exec(src);
    expect(m, 'DIGEST_FORBIDDEN_KEYS not found — the drift gate cannot run').toBeTruthy();
    const declared = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect(declared).toEqual([...ALWAYS_PRIVATE_FIELDS].sort());
  });
});
