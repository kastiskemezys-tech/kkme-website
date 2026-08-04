/**
 * Phase 49 item 1 — what turning `S1_DAY_PARSE=market_day` actually moves.
 *
 * Runs the REAL `computeS1` twice over the SAME recorded documents, once per
 * flag value, so the delta is the flag's and nothing else's. Documents are
 * fetched once and replayed to both runs — a second live fetch between the two
 * runs would let ENTSO-E's own publication schedule into the measurement.
 *
 * Re-measured at execution time, never inherited: an A44 document is different
 * every day, and the overnight figures (75.43 -> 65.32, 190 -> 96) describe
 * 2026-08-03's document, not today's.
 *
 * Usage: node scripts/_phase-49-s1-delta.mjs [--save <dir>]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const eng = await import(`${process.cwd()}/workers/fetch-s1.js`);

function token() {
  if (process.env.ENTSOE_API_KEY?.trim()) return process.env.ENTSOE_API_KEY.trim();
  for (const p of ['.env.local', '.env']) {
    try {
      const m = /^\s*ENTSOE_API_KEY\s*=\s*(.+?)\s*$/m.exec(readFileSync(p, 'utf8'));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  throw new Error('ENTSOE_API_KEY not found in env or .env.local');
}

const KEY = token();
const realFetch = globalThis.fetch;

// ── Record every A44 response computeS1 asks for, keyed by its query ──────────
const recorded = new Map();
const keyOf = (u) => {
  const url = new URL(u);
  return `${url.searchParams.get('in_Domain')}|${url.searchParams.get('periodStart')}|${url.searchParams.get('periodEnd')}`;
};

globalThis.fetch = async (u, init) => {
  const k = keyOf(String(u));
  if (!recorded.has(k)) {
    const r = await realFetch(String(u), init);
    recorded.set(k, { ok: r.ok, status: r.status, body: await r.text() });
  }
  const rec = recorded.get(k);
  return { ok: rec.ok, status: rec.status, text: async () => rec.body };
};

const env = (mode) => ({ ENTSOE_API_KEY: KEY, ...(mode ? { S1_DAY_PARSE: mode } : {}) });

const readAt = new Date().toISOString();
console.error(`# S1 flag delta — measured ${readAt}`);

const flat = await eng.computeS1(env('flat'));
const market = await eng.computeS1(env('market_day'));

const FIELDS = [
  'lt_avg_eur_mwh', 'se4_avg_eur_mwh', 'spread_eur_mwh', 'separation_pct', 'pl_avg_eur_mwh',
  'lt_pl_spread_eur_mwh', 'lt_pl_spread_pct', 'lt_daily_swing_eur_mwh',
  'lt_peak_hour_utc', 'lt_peak_price', 'lt_trough_hour_utc', 'lt_trough_price',
  'lt_evening_premium', 'p_high_avg', 'p_low_avg', 'intraday_capture', 'bess_net_capture',
  'state', 'lt_hours', 'se4_hours',
];

const rows = [];
for (const f of FIELDS) {
  const a = flat[f];
  const b = market[f];
  const moved = JSON.stringify(a) !== JSON.stringify(b);
  const pct = (typeof a === 'number' && typeof b === 'number' && a !== 0)
    ? ((b - a) / Math.abs(a)) * 100 : null;
  rows.push({ field: f, flat: a, market_day: b, moved, pct: pct === null ? null : Math.round(pct * 100) / 100 });
}

const w = (s, n) => String(s).padEnd(n);
console.log(`\n${w('field', 26)}${w('flat (shipped)', 22)}${w('market_day', 22)}delta`);
console.log('-'.repeat(84));
for (const r of rows) {
  console.log(`${w(r.field, 26)}${w(JSON.stringify(r.flat), 22)}${w(JSON.stringify(r.market_day), 22)}` +
    (r.moved ? (r.pct === null ? 'MOVED' : `${r.pct > 0 ? '+' : ''}${r.pct} %`) : '—'));
}

const hourlyMoved = JSON.stringify(flat.lt_hourly_24) !== JSON.stringify(market.lt_hourly_24);
console.log(`\nlt_hourly_24: ${hourlyMoved ? 'MOVED' : 'identical'} · flat n=${flat.lt_hourly_24?.length} · market_day n=${market.lt_hourly_24?.length} starting UTC hour ${market.lt_hourly_start_utc}`);
console.log(`market-day provenance: ${market.lt_day_basis ?? '(refused)'} ${market.lt_day_start_utc ?? ''} → ${market.lt_day_end_utc ?? ''} ${market.lt_day_hours ?? ''}h PT${market.lt_day_resolution_min ?? '?'}M forward_filled=${market.lt_day_forward_filled ?? '?'}`);
if (market.lt_day_refusal) console.log(`REFUSAL: ${market.lt_day_refusal}`);

// ── Elering, the independent control, for the same market day ────────────────
let control = null;
if (market.lt_day_start_utc) {
  const url = `https://dashboard.elering.ee/api/nps/price?start=${encodeURIComponent(market.lt_day_start_utc)}&end=${encodeURIComponent(new Date(Date.parse(market.lt_day_end_utc) - 1000).toISOString())}`;
  try {
    const r = await realFetch(url, { signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    const lt = (j?.data?.lt ?? []).map((e) => e.price);
    const mkt = market.hourly_lt;
    const agreeMarket = lt.length === mkt.length ? mkt.filter((v, i) => Math.abs(v - lt[i]) < 0.005).length : null;
    const agreeFlat = flat.hourly_lt.length >= lt.length ? lt.filter((v, i) => Math.abs(flat.hourly_lt[i] - v) < 0.005).length : null;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    control = {
      source: 'elering dashboard NPS', n: lt.length,
      elering_mean: Math.round(mean(lt) * 10000) / 10000,
      market_day_agreement: agreeMarket === null ? `n/a (${mkt.length} vs ${lt.length})` : `${agreeMarket}/${lt.length}`,
      flat_agreement: agreeFlat === null ? 'n/a' : `${agreeFlat}/${lt.length}`,
    };
    console.log(`\nElering control: n=${control.n} mean=${control.elering_mean} · market_day agrees ${control.market_day_agreement} · flat agrees ${control.flat_agreement}`);
  } catch (e) {
    console.log(`\nElering control: UNAVAILABLE (${e}) — no coverage claim is made from this run`);
  }
}

const saveIdx = process.argv.indexOf('--save');
if (saveIdx >= 0) {
  const out = process.argv[saveIdx + 1];
  writeFileSync(out, `${JSON.stringify({
    _note: 'Phase 49 item 1 — S1_DAY_PARSE flag delta. Both runs replay ONE set of recorded ENTSO-E documents.',
    measured_at: readAt,
    documents: [...recorded.keys()],
    rows,
    lt_hourly_24_moved: hourlyMoved,
    market_day_provenance: {
      basis: market.lt_day_basis ?? null, start_utc: market.lt_day_start_utc ?? null,
      end_utc: market.lt_day_end_utc ?? null, hours: market.lt_day_hours ?? null,
      resolution_min: market.lt_day_resolution_min ?? null,
      forward_filled: market.lt_day_forward_filled ?? null,
      hourly_start_utc: market.lt_hourly_start_utc ?? null,
      refusal: market.lt_day_refusal ?? null,
    },
    elering_control: control,
  }, null, 2)}\n`);
  console.error(`\nsaved: ${out}`);
}
