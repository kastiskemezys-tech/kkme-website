/**
 * Phase 49 item 4 — the CLASS guard: every scheduled KV writer is monitored.
 *
 * S8 stopped writing and nobody noticed for hours; S3's scrape failed and its
 * own failure payload reset the freshness clock. Both were fixed one at a time.
 * The general case had never been audited: **which keys does a scheduled job
 * write, and does each have (a) a staleness threshold derived from its own
 * cadence and (b) an alert wired to it?**
 *
 * A key with neither is invisible. It can stop for a week and the only surface
 * that would notice is the operator's eye on a card — which is exactly how the
 * `s1_capture` outage was found (38.1) and how `s2_daily_clearing` sat nine days
 * behind (Phase 50).
 *
 * WHAT THIS CAN AND CANNOT SEE. It is a static audit: it reads which keys the
 * scheduled handler writes and cross-references two declarations. It proves that
 * a threshold is DECLARED and that an alert call EXISTS — it does not prove the
 * alert fires or reaches anyone. That property is asserted behaviourally in
 * `scheduledWriterCoverage.test.ts` against the real /health computation. Stated
 * because a gate that overstates its reach is worse than none (B13).
 *
 * Usage:
 *   node scripts/gates/scheduled-writer-coverage.mjs            # table + exit 1 on uncovered
 *   node scripts/gates/scheduled-writer-coverage.mjs --json     # machine-readable
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(`${ROOT}/workers/fetch-s1.js`, 'utf8');
const { STALE_THRESHOLDS_HOURS } = await import(`${ROOT}/workers/lib/defaults.js`);

/**
 * Keys deliberately outside the staleness contract, each with the reason.
 * An exemption is a decision that has to be written down; an undeclared key is
 * a gap. The difference is the whole point of the list.
 */
const EXEMPT = {
  cron_heartbeat: 'the liveness surface itself — monitoring it with itself is circular',
  revenue_snapshot_prev: 'a deliberate previous-value mirror; staleness is its purpose',
  's1_capture_history': 'append-only history behind s1_capture, which IS monitored',
  s1_history: 'append-only history behind s1, which IS monitored',
  s2_btd_history: 'append-only history behind s2, which IS monitored',
  baltic_storage_index_history: 'append-only history behind baltic_storage_index_latest, which IS monitored',
  s3_freshness: 'the freshness surface for s3; monitoring it with itself is circular',
  s3_baseline: 'editorial reference, updated by hand, no cadence to derive a threshold from',
  s3_editorial: 'editorial reference, operator-pushed',
  s3_enrichment: 'weekly LLM enrichment; its own staleness is surfaced inside s3.data_freshness',
  s4_manual_additions: 'operator-curated, no cadence',
  s5_manual: 'operator-curated, no cadence',
  contact_submissions: 'inbound, event-driven, not scheduled',
  feed_index: 'event-driven on /curate and /feed writes',
  cert_watch: 'a tripwire whose whole job is to notice; alerted directly',
  's2_fleet': 'pushed by the VPS sync, not written by a worker cron',
};

/** The scheduled handler's body — everything a cron can write. */
function scheduledBody(src) {
  const i = src.indexOf('async scheduled(');
  if (i < 0) throw new Error('no scheduled() handler found — the audit cannot run');
  let depth = 0;
  let started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('scheduled() handler is not brace-balanced — the audit cannot run');
}

const body = scheduledBody(SRC);

// Literal keys only. A templated key (`raw:s3:${date}`, `dispatch:${d}:2h`) is a
// per-day archive rather than a monitored current-value key, and reporting it as
// unmonitored would be noise that trains the reader to ignore the table.
const written = new Set();
for (const m of body.matchAll(/KKME_SIGNALS\.put\(\s*'([^']+)'/g)) written.add(m[1]);
for (const m of body.matchAll(/KKME_SIGNALS\.put\(\s*"([^"]+)"/g)) written.add(m[1]);
// Helpers the cron calls that write a fixed key of their own.
for (const [helper, key] of [['updateHistory', 's1_history'], ['persistCapacityWatch', 's2_capacity_watch']]) {
  if (new RegExp(`\\b${helper}\\(`).test(body) && new RegExp(`KKME_SIGNALS\\.put\\('${key}'`).test(SRC)) written.add(key);
}

const rows = [...written].sort().map((key) => {
  const threshold = STALE_THRESHOLDS_HOURS[key];
  // An alert is wired if the key's name appears in an alertTransition or a
  // Telegram notification anywhere in the worker. Deliberately generous: the
  // aim is to find keys with NOTHING, and a false "covered" is caught by the
  // behavioural test rather than hidden by this one.
  const alerted = new RegExp(`alertTransition\\([^)]*['"\`][^'"\`]*${key.replace(/[:$]/g, '.')}`).test(SRC)
    || new RegExp(`notifyTelegram\\([^;]{0,400}${key.replace(/[:$]/g, '.')}`).test(SRC)
    || new RegExp(`['"\`]${key.replace(/[:$]/g, '.')}_[a-z_]+['"\`]\\s*,`).test(SRC);
  return {
    key,
    threshold_hours: threshold ?? null,
    alerted,
    exempt: EXEMPT[key] ?? null,
    covered: Boolean(threshold) || Boolean(EXEMPT[key]),
  };
});

const uncovered = rows.filter((r) => !r.covered);
const noAlert = rows.filter((r) => r.covered && !r.exempt && !r.alerted);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, uncovered, no_alert: noAlert }, null, 2));
} else {
  const w = (s, n) => String(s ?? '—').padEnd(n);
  console.log(`\n${w('key', 32)}${w('threshold', 12)}${w('alert', 8)}status`);
  console.log('-'.repeat(78));
  for (const r of rows) {
    const status = r.exempt ? `exempt — ${r.exempt}` : r.threshold_hours ? 'monitored' : 'NO THRESHOLD';
    console.log(`${w(r.key, 32)}${w(r.threshold_hours ? `${r.threshold_hours}h` : null, 12)}${w(r.alerted ? 'yes' : 'no', 8)}${status}`);
  }
  console.log(`\n${rows.length} scheduled writers · ${rows.filter((r) => r.threshold_hours).length} with a staleness threshold · ` +
    `${rows.filter((r) => r.exempt).length} exempt with a written reason · ${uncovered.length} with NEITHER`);
  if (noAlert.length) {
    console.log(`\n${noAlert.length} monitored by a threshold but with no alert wired to the key by name:`);
    for (const r of noAlert) console.log(`  · ${r.key} (${r.threshold_hours}h)`);
    console.log('  These surface in /health but nothing pages on them. Reported, not failed —');
    console.log('  /health IS a surface, and whether each needs a push alert is an operator call.');
  }
}

if (uncovered.length) {
  console.error(`\nFAIL — ${uncovered.length} scheduled writer(s) with neither a staleness threshold nor a written exemption:`);
  for (const r of uncovered) console.error(`  · ${r.key}`);
  console.error('Add a threshold to STALE_THRESHOLDS_HOURS, or an exemption with its reason to EXEMPT.');
  process.exit(1);
}
