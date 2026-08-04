/**
 * Phase 51 / B-072 — the VPS relay for the lithium scrape.
 *
 * `tradingeconomics.com` answers a Cloudflare Worker with a 20-second hang and
 * nothing else. Measured 2026-08-04 with a controlled three-network probe, same
 * URL and the same three headers the worker sends: laptop HTTP 200 in 0.14 s,
 * Hetzner VPS HTTP 200 in 0.10 s, Worker times out with no status and no
 * headers. The mechanism is not established; the route around it does not
 * require it to be (36.C precedent).
 *
 * The properties that matter here are not "does it work" but **what it refuses
 * to do**: a relay that can be made to overwrite good data with a failure, or to
 * accept a price it was handed rather than one it parsed, would be worse than
 * the outage it fixes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const here = dirname(fileURLToPath(import.meta.url));
const WORKER_SRC = readFileSync(join(here, '../fetch-s1.js'), 'utf8');

/** A page that parses: the meta-description shape `parseLithiumPrice` prefers. */
const goodPage = (cny = '161,750') =>
  `<html><head><meta name="description" content="Lithium rose to ${cny} CNY/T on August 4, 2026">` +
  `</head><body>${'x'.repeat(20000)}</body></html>`;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('B-072 · the relay refuses what it must refuse', () => {
  it('the parse stays in the worker — the relay sends BYTES, never a price', () => {
    // Discipline rule #4. If the endpoint accepted a `price` field, the same
    // quantity would have two implementations in two languages, one of them
    // outside this repo's tests. The contract is html-only, asserted on the
    // route's own body destructuring.
    const route = WORKER_SRC.slice(WORKER_SRC.indexOf("url.pathname === '/s3/scrape'"));
    const head = route.slice(0, 2000);
    expect(head).toMatch(/const \{ html, fetched_at \} = parsedBody\.body/);
    expect(head).not.toMatch(/body\.price|body\.lithium|parsedBody\.body\.cny/);
  });

  it('a truncated relay is refused rather than written', () => {
    // The failure that would hurt most: a relay that delivers 200 bytes of an
    // error page parses to nothing, and writing that over a good payload is
    // worse than not writing at all (playbook §5 — a failure payload must never
    // satisfy a freshness check, and here it would also destroy the last good
    // value). The floor is asserted, not assumed.
    const route = WORKER_SRC.slice(WORKER_SRC.indexOf("url.pathname === '/s3/scrape'"), WORKER_SRC.indexOf("url.pathname === '/extreme/seed'"));
    expect(route).toMatch(/html\.length < S3_RELAY_MIN_HTML_BYTES/);
    expect(WORKER_SRC).toMatch(/const S3_RELAY_MIN_HTML_BYTES = 10 \* 1024;/);
  });

  it('a page that arrives but does not parse leaves KV UNTOUCHED', () => {
    // The discriminating property. `computeS3` returns a payload marked
    // `unavailable` rather than throwing, so a naive relay would happily write
    // it — replacing a real lithium price with an error envelope, and resetting
    // the freshness clock while doing so (B12). The route must bail BEFORE the
    // put, and return 422 rather than 200.
    const route = WORKER_SRC.slice(WORKER_SRC.indexOf("url.pathname === '/s3/scrape'"), WORKER_SRC.indexOf("url.pathname === '/extreme/seed'"));
    const bailIdx = route.indexOf('if (d.unavailable)');
    const putIdx = route.indexOf("KKME_SIGNALS.put('s3'");
    expect(bailIdx).toBeGreaterThan(0);
    expect(putIdx).toBeGreaterThan(0);
    expect(bailIdx, 'the unavailable bail must precede the KV write').toBeLessThan(putIdx);
    expect(route).toMatch(/wrote: false[\s\S]{0,80}422|422\)/);
  });

  it('is authenticated, and through the dual-accept helper so rotation covers it', () => {
    const route = WORKER_SRC.slice(WORKER_SRC.indexOf("url.pathname === '/s3/scrape'"), WORKER_SRC.indexOf("url.pathname === '/extreme/seed'"));
    expect(route).toMatch(/acceptsUpdateSecret\(request, env, \{ route: '\/s3\/scrape' \}\)/);
    expect(route).toMatch(/401/);
  });

  it('records which transport delivered the bytes', () => {
    // resolveCaptureDay's precedent: a fallback path must be legible in the
    // data, not a silent substitution.
    expect(WORKER_SRC).toMatch(/scrape_transport: injected !== null \? 'vps_relay' : 'worker_direct'/);
  });
});

describe('B-072 · computeS3 with injected html produces the same payload shape', () => {
  it('parses a relayed page and reaches the normal success payload', async () => {
    // The injected path must run the SAME code as the fetched path — one
    // payload builder, so the relay cannot drift into producing a different
    // shape than the cron does (item 3's class guard, applied before it bites).
    vi.stubGlobal('fetch', vi.fn(async (u: Any) => {
      const url = String(u);
      if (url.includes('frankfurter')) {
        return { ok: true, json: async () => ({ date: '2026-08-04', rates: { USD: 1.09, CNY: 7.9 } }) } as Any;
      }
      // InfoLink — best-effort layer 2; let it fail so the test exercises the
      // layer-1-only path deliberately rather than by accident.
      throw new Error('infolink unavailable in test');
    }));
    const { computeS3 } = await import('../fetch-s1.js') as Any;
    const d = await computeS3({ html: goodPage(), fetchedAt: '2026-08-04T10:00:00Z' });

    expect(d.unavailable).toBeUndefined();
    expect(d.lithium_eur_t).toBeGreaterThan(0);
    expect(d.scrape_transport).toBe('vps_relay');
    expect(d.scrape_fetched_at).toBe('2026-08-04T10:00:00Z');
    expect(d._scrape_error).toBeUndefined();
    // 161,750 CNY/T at CNY 7.9/EUR ≈ €20,475/t. Asserted as a band, because the
    // point is that the arithmetic ran on the relayed bytes, not that a constant
    // was echoed back.
    expect(d.lithium_eur_t).toBeGreaterThan(15000);
    expect(d.lithium_eur_t).toBeLessThan(30000);
  });

  it('marks a relayed page it cannot parse as unavailable, so the route can refuse it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: Any) => {
      if (String(u).includes('frankfurter')) {
        return { ok: true, json: async () => ({ date: '2026-08-04', rates: { USD: 1.09, CNY: 7.9 } }) } as Any;
      }
      throw new Error('infolink unavailable in test');
    }));
    const { computeS3 } = await import('../fetch-s1.js') as Any;
    const d = await computeS3({ html: `<html><body>${'no price here '.repeat(2000)}</body></html>` });
    expect(d.unavailable).toBe(true);
    expect(d._scrape_error).toMatch(/not found/i);
  });

  it('the worker-direct path is unchanged — injection is opt-in', async () => {
    // The flag-shaped property. Calling computeS3() with no argument must still
    // take the network path, or the relay would have silently become the only
    // path and the direct one would rot untested.
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: Any) => {
      calls.push(String(u));
      if (String(u).includes('frankfurter')) {
        return { ok: true, json: async () => ({ date: '2026-08-04', rates: { USD: 1.09, CNY: 7.9 } }) } as Any;
      }
      return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => goodPage('150,000') } as Any;
    }));
    const { computeS3 } = await import('../fetch-s1.js') as Any;
    const d = await computeS3();
    expect(calls.some((c) => c.includes('tradingeconomics'))).toBe(true);
    expect(d.scrape_transport).toBe('worker_direct');
  });
});

describe('B-072 follow-up · a failing direct scrape must not destroy a good relay value', () => {
  // Found by verifying the deploy rather than assuming it. The relay wrote
  // lithium €17,974/t at 10:51:19Z; the 4-hourly cron overwrote it with an
  // `unavailable` payload at 12:00:20Z, because the worker's own scrape still
  // hangs — which is the entire reason the relay exists.
  //
  // REWRITTEN in the same phase. These assertions originally pinned an ad-hoc
  // `skipS3Write` local that guarded this ONE call site. That guard was
  // generalised into `admitSignalWrite`, applied at every cron signal write, so
  // asserting the local would now be asserting a worse design that no longer
  // exists. The property is the same and the assertions are stronger: S3 goes
  // through the shared rule, and the rule's behaviour is proven directly in
  // `admissionRule.test.ts` against a KV double.
  const CRON = WORKER_SRC.slice(
    WORKER_SRC.indexOf("if (s3Result.status === 'fulfilled')"),
    WORKER_SRC.indexOf("if (eurResult.status === 'fulfilled')"),
  );

  it('routes the S3 cron write through the shared admission rule', () => {
    expect(CRON).toMatch(/admitSignalWrite\(env, 's3', d(, '[^']*')?\)/);
  });

  it('does not keep a private copy of the rule at this call site', () => {
    // One path, or it is not a rule. A local re-implementation here is how the
    // generalisation would rot back into a special case.
    expect(CRON).not.toMatch(/skipS3Write|prev\.unavailable/);
  });

  it('still writes the raw:s3 archive regardless, so the failure is recorded', () => {
    // The published value may be preserved; the diagnosis must not be lost.
    expect(CRON).toMatch(/raw:s3:/);
  });
});
