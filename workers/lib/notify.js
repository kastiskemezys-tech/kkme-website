// KKME — Telegram alerting helper.
// Never throws — alert failure must never break the signal pipeline.

const ALERT_STATE_KEY = 'alert_state';
const ALERTER_HEALTH_KEY = 'alerter_health';

/**
 * @param {object} env - Cloudflare Worker env bindings
 * @param {string} message
 * @returns {Promise<{ok: boolean, status: number|null, error: string|null, configured: boolean}>}
 */
export async function notifyTelegram(env, message) {
  const result = { ok: false, status: null, error: null, configured: false };
  try {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chat  = env.TELEGRAM_CHAT_ID;
    if (!token || !chat) {
      result.error = 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured';
      await recordAlerterHealth(env, result).catch(() => {});
      return result;
    }
    result.configured = true;

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id:    chat,
          text:       `KKME Alert\n${message}`,
          parse_mode: 'HTML',
        }),
      },
    );
    result.status = res.status;
    result.ok = res.ok;
    if (!res.ok) {
      // Phase 39.2 — the send result used to be discarded entirely. A bot token
      // revoked by Telegram returns 401, and the old code neither logged nor
      // recorded it: the alerting layer would go silent and the silence was
      // indistinguishable from "nothing is wrong" — which is exactly how the
      // operator was already reading it (playbook B8).
      result.error = `Telegram HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`;
      console.error('[Telegram]', result.error);
    }
  } catch (e) {
    result.error = String(e).slice(0, 200);
    console.error('[Telegram] notify failed:', e);
  }
  await recordAlerterHealth(env, result).catch(() => {});
  return result;
}

/**
 * The alerter's own liveness record — B8 applied to the alerting layer itself.
 *
 * Every send attempt stamps this key whether it succeeded or not, so the gap
 * between `last_attempt_at` and `last_success_at` is readable. Consumed by
 * /health and reported in the daily digest, because a monitoring channel whose
 * failure mode is silence needs a surface that speaks on the healthy path.
 */
async function recordAlerterHealth(env, result) {
  if (!env?.KKME_SIGNALS) return;
  const now = new Date().toISOString();
  let prev = {};
  try {
    const raw = await env.KKME_SIGNALS.get(ALERTER_HEALTH_KEY);
    if (raw) prev = JSON.parse(raw);
  } catch { /* start fresh */ }
  const next = {
    last_attempt_at: now,
    last_success_at: result.ok ? now : (prev.last_success_at ?? null),
    last_error: result.ok ? null : (result.error ?? 'unknown'),
    consecutive_send_failures: result.ok ? 0 : ((prev.consecutive_send_failures ?? 0) + 1),
    sends_total: (prev.sends_total ?? 0) + 1,
    configured: result.configured,
  };
  await env.KKME_SIGNALS.put(ALERTER_HEALTH_KEY, JSON.stringify(next));
}

/** FNV-1a. Deterministic, synchronous, and only ever compared to itself. */
function detailHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * Strip anything that could carry a secret out of a body excerpt before it goes
 * on a wire the operator reads from a phone.
 *
 * Applied to every upstream body fragment quoted into an alert. The point of
 * quoting the bytes is to name the failure class — HTML error page, auth
 * rejection, truncated JSON — and none of that needs a live key to be legible.
 */
export function redactForAlert(s) {
  if (!s) return '';
  return String(s)
    .replace(/\s+/g, ' ')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)"?\s*[:=]\s*"?)([^",\s]{4,})/gi, '$1<redacted>')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})/g, '<redacted>')
    .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<redacted-uuid>')
    .trim();
}

/**
 * ─── Transition-based alerting (Phase 39.2) ─────────────────────────────────
 *
 * The operator received "S1 4-hourly cron degraded" twice on 2026-08-03 and no
 * third message. From a phone that is indistinguishable from an ongoing outage
 * AND from a resolved one — the absence of a further message was carrying the
 * whole signal, and absence is not a signal.
 *
 * The rules, and what each exists to stop:
 *
 *   ok → degraded        ALERT.      The failure starts.
 *   degraded → degraded  SUPPRESS,   Same failure, same shape. The counter
 *     (same detail)      count++     increments and rides the recovery message.
 *   degraded → degraded  ALERT.      A DIFFERENT error on the same surface is a
 *     (new detail)                   new fact, not a repeat. Suppression that
 *                                    hides a changed failure is worse than no
 *                                    suppression: it teaches the reader that
 *                                    one message means one problem.
 *   degraded → ok        RECOVERY.   The message that did not exist before.
 *
 * Every alert carries the consecutive-failure count and the time of first
 * failure in the run, so a message read at 07:00 answers "how long has this
 * been going on" without a second query.
 *
 * @param {object} env
 * @param {string} surface stable id — 's1_cron', 's3_enrichment', …
 * @param {'ok'|'degraded'} state
 * @param {string} message
 * @returns {Promise<{action:'alert'|'suppress'|'recovery'|'noop', consecutive:number}>}
 */
export async function alertTransition(env, surface, state, message) {
  const now = new Date();
  const nowIso = now.toISOString();
  const hash = detailHash(message);

  let map = {};
  try {
    const raw = await env?.KKME_SIGNALS?.get(ALERT_STATE_KEY);
    if (raw) map = JSON.parse(raw);
  } catch { /* a corrupt state map must never suppress an alert — start fresh */ }

  const prev = map[surface] ?? { state: 'ok', consecutive: 0, detail_hash: null, first_failure_at: null };
  let action = 'noop';
  let outMessage = null;
  let next;

  if (state === 'degraded') {
    const isNewRun = prev.state !== 'degraded';
    const consecutive = isNewRun ? 1 : (prev.consecutive ?? 0) + 1;
    const firstFailureAt = isNewRun ? nowIso : (prev.first_failure_at ?? nowIso);
    const detailChanged = !isNewRun && prev.detail_hash !== hash;

    next = {
      state: 'degraded',
      consecutive,
      detail_hash: hash,
      first_failure_at: firstFailureAt,
      last_seen_at: nowIso,
      last_change_at: isNewRun ? nowIso : (prev.last_change_at ?? nowIso),
      last_alert_at: prev.last_alert_at ?? null,
      suppressed_since_alert: (prev.suppressed_since_alert ?? 0),
    };

    if (isNewRun || detailChanged) {
      action = 'alert';
      const header = isNewRun
        ? `⚠️ ${surface} — degraded`
        : `⚠️ ${surface} — degraded, NEW error (previous error superseded)`;
      outMessage = [
        header,
        message,
        `• failure ${consecutive} in this run · first at ${firstFailureAt}${runFor(firstFailureAt, now)}`,
        next.suppressed_since_alert
          ? `• ${next.suppressed_since_alert} identical occurrence(s) suppressed since the last alert`
          : '',
      ].filter(Boolean).join('\n');
      next.last_alert_at = nowIso;
      next.suppressed_since_alert = 0;
    } else {
      action = 'suppress';
      next.suppressed_since_alert = (prev.suppressed_since_alert ?? 0) + 1;
    }
  } else {
    if (prev.state === 'degraded') {
      action = 'recovery';
      outMessage = [
        `✅ ${surface} — RECOVERED`,
        message,
        `• ran degraded for ${prev.consecutive ?? 0} consecutive occurrence(s)`,
        `• first failure ${prev.first_failure_at ?? '—'}${runFor(prev.first_failure_at, now)}`,
      ].join('\n');
    }
    next = {
      state: 'ok',
      consecutive: 0,
      detail_hash: null,
      first_failure_at: null,
      last_seen_at: nowIso,
      last_change_at: prev.state === 'degraded' ? nowIso : (prev.last_change_at ?? nowIso),
      last_alert_at: prev.last_alert_at ?? null,
      last_ok_at: nowIso,
      suppressed_since_alert: 0,
    };
  }

  map[surface] = next;
  // Persist BEFORE sending. If the send hangs or the invocation is cut short,
  // the state must still reflect what was observed — a lost write here would
  // re-alert the same failure on the next tick, which is the behaviour this
  // function exists to remove.
  try {
    await env?.KKME_SIGNALS?.put(ALERT_STATE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('[alert] state persist failed:', String(e));
  }

  if (outMessage) await notifyTelegram(env, outMessage);
  return { action, consecutive: next.consecutive ?? 0 };
}

function runFor(startIso, now) {
  if (!startIso) return '';
  const ms = now.getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return ` (${h}h ${m}m ago)`;
}

export const _alertInternals = { ALERT_STATE_KEY, ALERTER_HEALTH_KEY, detailHash };
