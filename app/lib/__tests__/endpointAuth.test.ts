// Phase 48 — endpoint auth on the feed writers.
//
// `POST /feed/clean` was unauthenticated, remote and destructive: it took a
// caller-supplied `before`, kept only items at or after it, and wrote the result
// straight to `feed_index`. `{"before":"2099-01-01"}` emptied the published feed.
// Its second defect was `catch { /* empty body ok */ }` — malformed JSON fell
// through to a 60-day default and the route wrote KV anyway.
//
// These tests drive the REAL route handler (the worker's default export) against
// an in-memory KV, so each case asserts the status code AND whether `feed_index`
// actually moved. A status-code-only assertion would not distinguish "refused"
// from "refused after writing" (B2: verify at the layer that matters).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, {
  parseJsonBody,
  validateFeedCleanParams,
  feedCleanBlastRadius,
  validateContactBody,
  CONTACT_MAX_BODY_BYTES,
} from '../../../workers/fetch-s1.js';

const SECRET = 'test-update-secret';

/** Minimal KV stub that records writes, so "state unchanged" is checkable. */
function makeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; value: string }> = [];
  return {
    store,
    puts,
    get: async (k: string) => (store.has(k) ? store.get(k)! : null),
    put: async (k: string, v: string) => { puts.push({ key: k, value: v }); store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true }),
  };
}

/** Feed items old enough that a 2026-01-01 cutoff removes them. */
const feedItem = (id: string, published_at: string) => ({
  id,
  title: `Baltic storage item ${id} with a sufficiently long title`,
  consequence: 'Consequence text long enough to pass the validity gate.',
  category: 'policy',
  published_at,
  source: 'litgrid.lt',
  source_url: `https://www.litgrid.eu/index.php/news/${id}`,
  source_quality: 'tso_regulator',
  status: 'published',
  feed_score: 0.8,
});

const FEED = [
  feedItem('a', '2026-07-01T00:00:00Z'),
  feedItem('b', '2026-07-15T00:00:00Z'),
  feedItem('c', '2026-07-20T00:00:00Z'),
  feedItem('d', '2026-07-25T00:00:00Z'),
];

function makeEnv(kv: ReturnType<typeof makeKV>) {
  return { KKME_SIGNALS: kv, UPDATE_SECRET: SECRET };
}

function post(path: string, opts: { secret?: string; body?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.secret !== undefined) headers['X-Update-Secret'] = opts.secret;
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers,
    body: opts.body,
  });
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

async function call(req: Request, kv: ReturnType<typeof makeKV>) {
  const res = await worker.fetch(req, makeEnv(kv), ctx);
  let json: Record<string, unknown> = {};
  try { json = await res.clone().json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

// ─────────────────────────────────────────────────────────────────────────────
// The four proofs the phase requires, at the route layer.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /feed/clean — proof 1: unauthed is 401 and KV is untouched', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  it('rejects a request with no secret', async () => {
    const before = kv.store.get('feed_index');
    const { status, json } = await call(
      post('/feed/clean', { body: JSON.stringify({ before: '2099-01-01' }) }), kv);
    expect(status).toBe(401);
    expect(json.error).toBe('unauthorized');
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  it('rejects a wrong secret, and the doomsday body still writes nothing', async () => {
    const before = kv.store.get('feed_index');
    const { status } = await call(
      post('/feed/clean', { secret: 'wrong', body: JSON.stringify({ before: '2099-01-01' }) }), kv);
    expect(status).toBe(401);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
    // The feed is still all four items — this is the attack that motivated the phase.
    expect(JSON.parse(kv.store.get('feed_index')!)).toHaveLength(4);
  });
});

describe('POST /feed/clean — proof 2: authed + malformed body is 400, state unchanged', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  // This is the exact probe that returned 200 {"cleaned":0,"remaining":4} before
  // the fix: invalid JSON fell into `catch { /* empty body ok */ }` and executed.
  it('rejects invalid JSON instead of falling through to a default', async () => {
    const before = kv.store.get('feed_index');
    const { status, json } = await call(
      post('/feed/clean', { secret: SECRET, body: '{not json' }), kv);
    expect(status).toBe(400);
    expect(json.error).toBe('Malformed JSON body');
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  // An absent body is refused by the body check, before the `before` check is
  // reached; an empty object gets past that and is refused by `before` itself.
  // Both are 400 and neither writes — the old code took the absent-body path
  // straight to the 60-day default and a KV write.
  it('rejects an absent body — there is no longer a default that deletes', async () => {
    const { status, json } = await call(post('/feed/clean', { secret: SECRET }), kv);
    expect(status).toBe(400);
    expect(json.error).toBe('Request body required: expected a JSON object');
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects an empty JSON object because `before` has no default', async () => {
    const { status, json } = await call(
      post('/feed/clean', { secret: SECRET, body: '{}' }), kv);
    expect(status).toBe(400);
    expect(json.error).toMatch(/`before` is required/);
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects a non-object body', async () => {
    for (const body of ['null', '"a string"', '42', '[1,2]']) {
      const { status } = await call(post('/feed/clean', { secret: SECRET, body }), kv);
      expect(status, `body ${body}`).toBe(400);
    }
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects an unparseable `before`', async () => {
    const { status, json } = await call(
      post('/feed/clean', { secret: SECRET, body: JSON.stringify({ before: 'yesterday' }) }), kv);
    expect(status).toBe(400);
    expect(json.error).toMatch(/not a valid ISO 8601 date/);
    expect(kv.puts).toHaveLength(0);
  });
});

describe('POST /feed/clean — proof 3: authed + future `before` is refused', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  it('refuses the doomsday cutoff even with a valid secret', async () => {
    const before = kv.store.get('feed_index');
    const { status, json } = await call(
      post('/feed/clean', { secret: SECRET, body: JSON.stringify({ before: '2099-01-01' }) }), kv);
    expect(status).toBe(400);
    expect(json.error).toMatch(/must not be in the future/);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  it('refuses a future cutoff even when the caller sets confirm:true', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const { status } = await call(post('/feed/clean', {
      secret: SECRET, body: JSON.stringify({ before: future, confirm: true }),
    }), kv);
    expect(status).toBe(400);
    expect(kv.puts).toHaveLength(0);
  });
});

describe('POST /feed/clean — proof 4: authed legitimate request works and logs', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  it('removes only the items older than the cutoff, and logs the invocation', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Removes item 'a' only — 1 of 4 = 25%, under the 50% limit, so no confirm.
    const { status, json } = await call(post('/feed/clean', {
      secret: SECRET, body: JSON.stringify({ before: '2026-07-10T00:00:00Z' }),
    }), kv);

    expect(status).toBe(200);
    expect(json).toMatchObject({ cleaned: 1, remaining: 3 });
    expect(kv.puts).toHaveLength(1);
    const written = JSON.parse(kv.store.get('feed_index')!);
    expect(written.map((i: { id: string }) => i.id)).toEqual(['b', 'c', 'd']);

    const line = log.mock.calls.map(c => c.join(' ')).find(l => l.includes('[feed/clean]'));
    expect(line).toBeDefined();
    expect(line).toContain('before=2026-07-10T00:00:00Z');
    expect(line).toContain('cleaned=1');
    expect(line).toContain('remaining=3');
    // The log line must never carry the secret.
    expect(line).not.toContain(SECRET);
    log.mockRestore();
  });

  it('refuses an over-broad clean without confirm, and writes nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stateBefore = kv.store.get('feed_index');
    // Cutoff 2026-07-22 removes a, b, c = 3 of 4 = 75% > 50%.
    const { status, json } = await call(post('/feed/clean', {
      secret: SECRET, body: JSON.stringify({ before: '2026-07-22T00:00:00Z' }),
    }), kv);

    expect(status).toBe(409);
    expect(json).toMatchObject({ would_clean: 3, total: 4 });
    expect(json.error).toMatch(/without "confirm": true/);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(stateBefore);
    expect(log.mock.calls.map(c => c.join(' ')).some(l => l.includes('REFUSED'))).toBe(true);
    log.mockRestore();
  });

  it('performs the same over-broad clean when confirm:true is explicit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { status, json } = await call(post('/feed/clean', {
      secret: SECRET, body: JSON.stringify({ before: '2026-07-22T00:00:00Z', confirm: true }),
    }), kv);
    expect(status).toBe(200);
    expect(json).toMatchObject({ cleaned: 3, remaining: 1 });
    expect(kv.puts).toHaveLength(1);
    log.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The additive siblings.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /feed/events — auth and body validation', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  it('rejects an unauthenticated write and leaves feed_index alone', async () => {
    const before = kv.store.get('feed_index');
    const { status } = await call(post('/feed/events', {
      body: JSON.stringify({ items: [feedItem('x', '2026-08-01T00:00:00Z')] }),
    }), kv);
    expect(status).toBe(401);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  it('rejects a malformed body when authed', async () => {
    const { status, json } = await call(
      post('/feed/events', { secret: SECRET, body: '{broken' }), kv);
    expect(status).toBe(400);
    expect(json.error).toBe('Malformed JSON body');
    expect(kv.puts).toHaveLength(0);
  });

  // The live caller (daily_intel.py) posts {"items": [...]} with X-Update-Secret.
  // This is the regression test for "the auth fix broke the ingestion path".
  it('accepts the live caller shape: {items:[...]} with the secret header', async () => {
    const { status, json } = await call(post('/feed/events', {
      secret: SECRET,
      body: JSON.stringify({ items: [feedItem('x', '2026-08-01T00:00:00Z')] }),
    }), kv);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(kv.puts).toHaveLength(1);
  });

  it('still accepts a bare array body', async () => {
    const { status } = await call(post('/feed/events', {
      secret: SECRET,
      body: JSON.stringify([feedItem('y', '2026-08-01T00:00:00Z')]),
    }), kv);
    expect(status).toBe(200);
  });
});

describe('POST /feed/backfill-curations — auth and body validation', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV({ feed_index: JSON.stringify(FEED) }); });

  it('rejects an unauthenticated call and leaves feed_index alone', async () => {
    const before = kv.store.get('feed_index');
    const { status } = await call(post('/feed/backfill-curations'), kv);
    expect(status).toBe(401);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get('feed_index')).toBe(before);
  });

  it('rejects a malformed body when authed', async () => {
    const { status } = await call(
      post('/feed/backfill-curations', { secret: SECRET, body: '{broken' }), kv);
    expect(status).toBe(400);
    expect(kv.puts).toHaveLength(0);
  });

  it('accepts an absent body when authed — the route takes no parameters', async () => {
    const { status } = await call(
      post('/feed/backfill-curations', { secret: SECRET }), kv);
    expect(status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /contact stays public, but bounded.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /contact — public, bounded', () => {
  let kv: ReturnType<typeof makeKV>;
  beforeEach(() => { kv = makeKV(); });

  const valid = {
    type: 'project', name: 'A Person', email: 'a@example.com',
    message: 'We are developing a 50 MW BESS in Lithuania.',
  };

  it('still accepts a legitimate submission with no secret', async () => {
    const { status, json } = await call(
      post('/contact', { body: JSON.stringify(valid) }), kv);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('rejects an oversized body without writing KV', async () => {
    const body = JSON.stringify({ ...valid, message: 'x'.repeat(CONTACT_MAX_BODY_BYTES) });
    const { status } = await call(post('/contact', { body }), kv);
    expect(status).toBe(413);
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects an over-long field under the body cap', async () => {
    const { status, json } = await call(post('/contact', {
      body: JSON.stringify({ ...valid, message: 'x'.repeat(5001) }),
    }), kv);
    expect(status).toBe(400);
    expect(json.error).toMatch(/`message` exceeds 5000 characters/);
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects an unknown type', async () => {
    const { status } = await call(post('/contact', {
      body: JSON.stringify({ ...valid, type: 'spam' }),
    }), kv);
    expect(status).toBe(400);
    expect(kv.puts).toHaveLength(0);
  });

  it('rejects a malformed email', async () => {
    const { status } = await call(post('/contact', {
      body: JSON.stringify({ ...valid, email: 'not-an-email' }),
    }), kv);
    expect(status).toBe(400);
    expect(kv.puts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit coverage of the pure validators.
// ─────────────────────────────────────────────────────────────────────────────

describe('parseJsonBody', () => {
  it('rejects an absent body unless allowEmpty', () => {
    expect(parseJsonBody(null).ok).toBe(false);
    expect(parseJsonBody('').ok).toBe(false);
    expect(parseJsonBody(null, { allowEmpty: true })).toEqual({ ok: true, body: {} });
  });
  it('rejects malformed JSON', () => {
    expect(parseJsonBody('{oops')).toEqual({ ok: false, error: 'Malformed JSON body' });
  });
  it('rejects non-objects', () => {
    expect(parseJsonBody('null').ok).toBe(false);
    expect(parseJsonBody('7').ok).toBe(false);
    expect(parseJsonBody('"s"').ok).toBe(false);
  });
  it('gates arrays behind allowArray', () => {
    expect(parseJsonBody('[]').ok).toBe(false);
    expect(parseJsonBody('[]', { allowArray: true }).ok).toBe(true);
  });
  it('accepts an object', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, body: { a: 1 } });
  });
});

describe('validateFeedCleanParams', () => {
  const now = '2026-08-03T12:00:00Z';
  it('requires `before`', () => {
    expect(validateFeedCleanParams({}, now).ok).toBe(false);
    expect(validateFeedCleanParams({ before: '' }, now).ok).toBe(false);
    expect(validateFeedCleanParams({ before: 123 }, now).ok).toBe(false);
  });
  it('rejects unparseable and future dates', () => {
    expect(validateFeedCleanParams({ before: 'soon' }, now).ok).toBe(false);
    expect(validateFeedCleanParams({ before: '2099-01-01' }, now).ok).toBe(false);
  });
  it('accepts a past date and defaults confirm to false', () => {
    expect(validateFeedCleanParams({ before: '2026-06-01' }, now))
      .toEqual({ ok: true, before: '2026-06-01', confirm: false });
  });
  it('rejects a non-boolean confirm', () => {
    expect(validateFeedCleanParams({ before: '2026-06-01', confirm: 'yes' }, now).ok).toBe(false);
  });
});

describe('feedCleanBlastRadius', () => {
  it('allows a small removal', () => {
    expect(feedCleanBlastRadius(100, 10, false).ok).toBe(true);
  });
  it('refuses a majority removal without confirm', () => {
    const r = feedCleanBlastRadius(100, 51, false);
    expect(r.ok).toBe(false);
    expect(r.fraction).toBeCloseTo(0.51);
  });
  it('allows a majority removal with confirm', () => {
    expect(feedCleanBlastRadius(100, 100, true).ok).toBe(true);
  });
  it('is safe on an empty feed', () => {
    expect(feedCleanBlastRadius(0, 0, false)).toEqual({ ok: true, fraction: 0 });
  });
});

describe('validateContactBody', () => {
  const valid = {
    type: 'market', name: 'N', email: 'n@example.com', message: 'Hello there.',
  };
  it('accepts a valid submission', () => {
    expect(validateContactBody(valid).ok).toBe(true);
  });
  it('requires the four required fields', () => {
    expect(validateContactBody({ ...valid, name: undefined }).ok).toBe(false);
  });
  it('rejects a non-string field', () => {
    expect(validateContactBody({ ...valid, company: 42 }).ok).toBe(false);
  });
});
