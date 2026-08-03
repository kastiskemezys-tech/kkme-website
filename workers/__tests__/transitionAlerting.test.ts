/**
 * Phase 39.2 — alerting that fires on state CHANGE, and the alerter's own health.
 *
 * The paid-for failure: on 2026-08-03 the operator received "S1 4-hourly cron
 * degraded" twice and nothing after. Two identical messages and then silence is
 * indistinguishable, from a phone, from an ongoing outage AND from a resolved
 * one — the absence of a third message was carrying the entire signal, and
 * absence is not a signal.
 *
 * These are behavioural tests against the real `alertTransition` and the real
 * `notifyTelegram`, driven through a fake KV and a stubbed `fetch`. What is
 * asserted is what the operator's phone would receive, not what the source
 * says about itself (playbook B13).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { alertTransition, notifyTelegram, redactForAlert } from '../lib/notify.js';
import worker from '../fetch-s1.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

let store: Map<string, string>;
let sent: string[];

function makeEnv(overrides: Any = {}) {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: '123',
    ...overrides,
  } as Any;
}

beforeEach(() => {
  store = new Map();
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (input: Any, init: Any) => {
    if (String(input).includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body).text);
      return new Response('{"ok":true}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('alertTransition — the four transitions', () => {
  it('alerts on ok → degraded', async () => {
    const env = makeEnv();
    const r = await alertTransition(env, 's1_cron', 'degraded', '• computeCapture rejected: HTTP 503');
    expect(r.action).toBe('alert');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('s1_cron — degraded');
    expect(sent[0]).toContain('HTTP 503');
  });

  it('suppresses an identical repeat, and counts it', async () => {
    const env = makeEnv();
    await alertTransition(env, 's1_cron', 'degraded', 'same error');
    const r2 = await alertTransition(env, 's1_cron', 'degraded', 'same error');
    const r3 = await alertTransition(env, 's1_cron', 'degraded', 'same error');
    expect(r2.action).toBe('suppress');
    expect(r3.action).toBe('suppress');
    expect(r3.consecutive).toBe(3);
    // The operator's phone buzzed ONCE for three occurrences — this is the
    // behaviour the two identical 2026-08-03 messages lacked.
    expect(sent).toHaveLength(1);
  });

  it('alerts again when the error CHANGES on the same surface', async () => {
    // Suppression that hides a changed failure is worse than no suppression:
    // it teaches the reader that one message means one problem.
    const env = makeEnv();
    await alertTransition(env, 's1_cron', 'degraded', 'energy-charts HTTP 503');
    await alertTransition(env, 's1_cron', 'degraded', 'energy-charts HTTP 503');
    const r = await alertTransition(env, 's1_cron', 'degraded', 'ENTSOE_API_KEY secret not set');
    expect(r.action).toBe('alert');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('NEW error');
    expect(sent[1]).toContain('secret not set');
    // …and the suppressed occurrence between them is accounted for, not lost.
    expect(sent[1]).toMatch(/1 identical occurrence\(s\) suppressed/);
  });

  it('sends a RECOVERY message on degraded → ok', async () => {
    // The message that did not exist before. Its absence was the only signal
    // that anything was still broken.
    const env = makeEnv();
    await alertTransition(env, 's1_cron', 'degraded', 'boom');
    await alertTransition(env, 's1_cron', 'degraded', 'boom');
    const r = await alertTransition(env, 's1_cron', 'ok', 'computeCapture: ok (source: entsoe-a44)');
    expect(r.action).toBe('recovery');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('RECOVERED');
    expect(sent[1]).toContain('2 consecutive');
    expect(sent[1]).toContain('entsoe-a44');
  });

  it('stays silent on ok → ok', async () => {
    const env = makeEnv();
    await alertTransition(env, 's1_cron', 'ok', 'fine');
    await alertTransition(env, 's1_cron', 'ok', 'fine');
    expect(sent).toHaveLength(0);
  });

  it('carries the consecutive count and the first-failure time on every alert', async () => {
    const env = makeEnv();
    await alertTransition(env, 's4_cron', 'degraded', 'first');
    await alertTransition(env, 's4_cron', 'degraded', 'second');
    expect(sent[1]).toMatch(/failure 2 in this run/);
    expect(sent[1]).toMatch(/first at \d{4}-\d{2}-\d{2}T/);
  });

  it('keeps surfaces independent — one degraded surface does not mute another', async () => {
    const env = makeEnv();
    await alertTransition(env, 's1_cron', 'degraded', 'a');
    await alertTransition(env, 's4_cron', 'degraded', 'a');
    expect(sent).toHaveLength(2);
  });

  it('re-alerts rather than staying quiet when the state map is corrupt', async () => {
    // A corrupt state map must never SUPPRESS. Failing open here costs a
    // duplicate message; failing closed costs an outage nobody hears about.
    const env = makeEnv();
    store.set('alert_state', '{not json');
    const r = await alertTransition(env, 's1_cron', 'degraded', 'boom');
    expect(r.action).toBe('alert');
    expect(sent).toHaveLength(1);
  });

  it('persists observed state even when the send fails', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await alertTransition(env, 's1_cron', 'degraded', 'boom');
    expect(JSON.parse(store.get('alert_state')!).s1_cron.state).toBe('degraded');
  });
});

describe('notifyTelegram — the alerter reports on itself (B8)', () => {
  it('records a successful send', async () => {
    const env = makeEnv();
    const r = await notifyTelegram(env, 'hello');
    expect(r.ok).toBe(true);
    const h = JSON.parse(store.get('alerter_health')!);
    expect(h.consecutive_send_failures).toBe(0);
    expect(h.last_success_at).toBe(h.last_attempt_at);
  });

  it('records its own send failures instead of swallowing them', async () => {
    // A revoked bot token returns 401. The old code neither logged nor recorded
    // it: the channel would go silent, and silence is exactly how a healthy
    // system looks from a phone.
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const r = await notifyTelegram(env, 'hello');
    expect(r.ok).toBe(false);
    const h = JSON.parse(store.get('alerter_health')!);
    expect(h.consecutive_send_failures).toBe(1);
    expect(h.last_error).toContain('401');
    expect(h.last_success_at).toBeNull();
  });

  it('records the unconfigured case as a failure, not as a quiet success', async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: undefined });
    const r = await notifyTelegram(env, 'hello');
    expect(r.configured).toBe(false);
    expect(JSON.parse(store.get('alerter_health')!).consecutive_send_failures).toBe(1);
  });
});

describe('redactForAlert', () => {
  it('strips key-shaped material out of quoted upstream bodies', () => {
    expect(redactForAlert('{"error":"bad key","api_key":"abcd1234efgh"}')).not.toContain('abcd1234efgh');
    expect(redactForAlert('Authorization: Bearer sk-abcdef123456789')).not.toContain('abcdef123456789');
    expect(redactForAlert('token=d8aecf60-47a5-435f-b1a5-89e1816cdd3f')).not.toContain('d8aecf60-47a5');
  });
  it('leaves the diagnostic content legible', () => {
    const out = redactForAlert('<html><body><h1>503 Service Unavailable</h1></body></html>');
    expect(out).toContain('503 Service Unavailable');
  });
});

describe('/health — a failure written on time is not freshness (B12)', () => {
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;

  it('does not count a self-reported failure as fresh', async () => {
    // Measured live 2026-08-03T16:00:28Z: s3 carried `unavailable: true` and
    // `_scrape_error: "AbortError"`, and /health reported `present · 0.6h ·
    // stale: false`. computeS3 writes the key on failure, so the write RESETS
    // the staleness clock and s3 could never age past its threshold no matter
    // how long the scrape stayed broken — the damage disabling its own detector.
    const env = makeEnv();
    store.set('s3', JSON.stringify({
      timestamp: new Date().toISOString(),
      unavailable: true,
      _scrape_error: 'AbortError: The operation was aborted',
    }));
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/health'), env, ctx);
    const body = await res.json();
    expect(body.signals.s3.degraded).toBe(true);
    expect(body.signals.s3.degraded_reason).toContain('AbortError');
    expect(body.all_fresh).toBe(false);
  });

  it('leaves a genuinely healthy payload alone', async () => {
    const env = makeEnv();
    store.set('s3', JSON.stringify({ timestamp: new Date().toISOString(), lithium_eur_t: 20000 }));
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/health'), env, ctx);
    const body = await res.json();
    expect(body.signals.s3.degraded).toBeUndefined();
    expect(body.signals.s3.stale).toBe(false);
  });

  it('surfaces the alerting layer, computed from the two stamps', async () => {
    const env = makeEnv();
    await notifyTelegram(env, 'x');
    await alertTransition(env, 's1_cron', 'degraded', 'boom');
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/health'), env, ctx);
    const body = await res.json();
    expect(body.alerting.alerter.status).toBe('ok');
    expect(body.alerting.alerter.send_ok).toBe(true);
    expect(body.alerting.degraded_surfaces).toContain('s1_cron');
  });

  it('says so when the alerter has never proven it can send', async () => {
    const env = makeEnv();
    const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/health'), env, ctx);
    const body = await res.json();
    expect(body.alerting.alerter.status).toBe('never_sent');
  });
});
