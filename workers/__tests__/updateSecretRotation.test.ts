// Phase 51 — dual-accept for the UPDATE_SECRET rotation.
//
// `UPDATE_SECRET` gates all 38 admin-write sites. It needs rotating: it sat as an
// inline default in a VPS script and is in four commits of the control-center
// repo's history. A big-bang rotation breaks whichever caller nobody remembered,
// and the caller enumeration is exactly the thing that is never complete — which
// is the entire reason for dual-accept rather than a swap.
//
// The property that makes the rotation SAFE is that both slots work at once. The
// property that makes it FINISHABLE is that the verdict names which slot matched,
// so "every caller is on the new value" becomes an observation instead of a hope.
import { describe, it, expect } from 'vitest';
import worker, { updateSecretVerdict } from '../fetch-s1.js';

const OLD = 'old-secret-value';
const NEW = 'new-secret-value';

describe('updateSecretVerdict', () => {
  it('accepts the current value and names the slot', () => {
    expect(updateSecretVerdict(OLD, OLD, NEW)).toEqual({ ok: true, slot: 'current' });
  });

  it('accepts the next value and names the slot', () => {
    // This is the line the rotation is steered by: a caller reporting
    // `slot=next` has moved, and one still reporting `slot=current` has not.
    expect(updateSecretVerdict(NEW, OLD, NEW)).toEqual({ ok: true, slot: 'next' });
  });

  it('rejects anything else', () => {
    expect(updateSecretVerdict('wrong', OLD, NEW)).toEqual({ ok: false, slot: null });
  });

  it('rejects an absent or empty presentation', () => {
    for (const v of [null, undefined, '', 0, {}]) {
      expect(updateSecretVerdict(v as never, OLD, NEW).ok, String(v)).toBe(false);
    }
  });

  // Injection-verified property, and the finding is worth stating: a blank
  // presentation is blocked by TWO independent guards — the `presented` type/empty
  // check, and the `next` non-empty check. Removing either ALONE leaves the
  // property intact (the injections stayed green, correctly — neither is a defect
  // on its own); removing BOTH goes red. So this asserts the PROPERTY rather than
  // one mechanism, which is what stops it becoming a test of a particular line.
  it('an UNSET next slot must not make everything valid', () => {
    // The dangerous shape: if an empty/undefined `next` compared equal to an
    // empty presentation, an unconfigured worker would accept a blank header.
    for (const next of [undefined, null, '']) {
      expect(updateSecretVerdict(OLD, OLD, next as never)).toEqual({ ok: true, slot: 'current' });
      expect(updateSecretVerdict('', OLD, next as never).ok).toBe(false);
      expect(updateSecretVerdict(next as never, OLD, next as never).ok).toBe(false);
    }
  });

  it('an UNSET current slot must not accept a blank either', () => {
    // Belt and braces for a misconfigured deploy: no secret set anywhere must
    // mean nothing authenticates, not that everything does.
    expect(updateSecretVerdict('', undefined as never, undefined as never).ok).toBe(false);
    expect(updateSecretVerdict('anything', undefined as never, undefined as never).ok).toBe(false);
  });

  it('after the drop, the old value stops working', () => {
    // The end state of step 4: NEXT promoted to current, next cleared.
    expect(updateSecretVerdict(NEW, NEW, undefined as never)).toEqual({ ok: true, slot: 'current' });
    expect(updateSecretVerdict(OLD, NEW, undefined as never).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// At the route layer, because a helper that is right and unwired is worth nothing.
// ─────────────────────────────────────────────────────────────────────────────

function makeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; value: string }> = [];
  return {
    store, puts,
    get: async (k: string) => (store.has(k) ? store.get(k)! : null),
    put: async (k: string, v: string) => { puts.push({ key: k, value: v }); store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true }),
  };
}
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

async function post(path: string, secret: string | undefined, env: Record<string, unknown>, kv: ReturnType<typeof makeKV>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== undefined) headers['X-Update-Secret'] = secret;
  const req = new Request(`https://worker.test${path}`, { method: 'POST', headers, body: '{}' });
  const res = await worker.fetch(req, { KKME_SIGNALS: kv, ...env }, ctx);
  return res.status;
}

describe('the route layer honours both slots while a rotation is in flight', () => {
  const env = { UPDATE_SECRET: OLD, UPDATE_SECRET_NEXT: NEW };

  it('an admin route accepts the OLD value', async () => {
    const kv = makeKV();
    // 401 is the only status that means "auth rejected"; anything else means it
    // got past the gate (400 for the empty body here, which is the point).
    expect(await post('/feed/clean', OLD, env, kv)).not.toBe(401);
  });

  it('the same route accepts the NEW value', async () => {
    const kv = makeKV();
    expect(await post('/feed/clean', NEW, env, kv)).not.toBe(401);
  });

  it('and still rejects a wrong value, and no value', async () => {
    const kv = makeKV();
    expect(await post('/feed/clean', 'nope', env, kv)).toBe(401);
    expect(await post('/feed/clean', undefined, env, kv)).toBe(401);
    expect(kv.puts).toHaveLength(0);
  });

  it('with only the OLD slot configured, the new value is rejected', async () => {
    // Before the worker is deployed with dual-accept, rotating the caller first
    // would break it. This pins the ordering the runbook depends on.
    const kv = makeKV();
    expect(await post('/feed/clean', NEW, { UPDATE_SECRET: OLD }, kv)).toBe(401);
  });

  it('after the drop, the OLD value is rejected everywhere', async () => {
    const kv = makeKV();
    const dropped = { UPDATE_SECRET: NEW };
    expect(await post('/feed/clean', OLD, dropped, kv)).toBe(401);
    expect(await post('/curate', OLD, dropped, kv)).toBe(401);
    expect(await post('/feed/events', OLD, dropped, kv)).toBe(401);
    expect(kv.puts).toHaveLength(0);
  });
});

describe('/curate is now gated — Phase 51 §2', () => {
  const env = { UPDATE_SECRET: OLD };

  it('rejects an unauthenticated write and touches no KV', async () => {
    const kv = makeKV({ feed_index: '[]' });
    const before = kv.store.get('feed_index');
    expect(await post('/curate', undefined, env, kv)).toBe(401);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  it('gets past auth with the secret, then fails on the body as before', async () => {
    const kv = makeKV({ feed_index: '[]' });
    // The live caller sends a full payload; an empty object must fail
    // validation, NOT auth — that distinction is what proves the gate is in the
    // right place.
    expect(await post('/curate', OLD, env, kv)).toBe(400);
  });
});
