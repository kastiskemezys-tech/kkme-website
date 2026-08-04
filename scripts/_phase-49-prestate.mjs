/**
 * Phase 49 — the pre-state capture, taken BEFORE anything is reproduced (C3).
 *
 * Five defects are about to be fixed and three of them can move a published
 * number. C3 exists because 36.C moved IRR with two same-day causes and neither
 * could be attributed afterwards. So this runs first, from a CLEAN WORKTREE of
 * the reference commit (C6 — never `git stash`), against ONE frozen KV snapshot,
 * and writes a committed artifact that later measurements subtract from.
 *
 * It records four things:
 *
 *   1. `revenue`   — the 54 public configurations: full-payload hash plus every
 *                    field the five items can reach.
 *   2. `fallback`  — the same 54 configurations with `s1_capture` deleted from
 *                    the KV, which is the only way item 3's residue is reached.
 *                    Recorded as pre-state rather than as a finding.
 *   3. `a44`       — the committed 2026-08-03 ENTSO-E fixture parsed both ways
 *                    (flat scrape vs forward-filled), plus the Elering control.
 *                    Deterministic: a fixture, not a live fetch.
 *   4. `live`      — the live worker payloads as-of run time, stamped. These are
 *                    NOT reproducible and are recorded for direction only.
 *
 * Usage:
 *   node scripts/_phase-49-prestate.mjs <ref-worktree> [--out <path>] [--no-live]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const REF = argv[0] && !argv[0].startsWith('--') ? resolve(argv[0]) : null;
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? resolve(argv[outIdx + 1]) : join(WT, 'docs/investigations/2026-08-04-phase-49-prestate.json');
const NO_LIVE = argv.includes('--no-live');

if (!REF || !existsSync(join(REF, 'workers/fetch-s1.js'))) {
  console.error('usage: node scripts/_phase-49-prestate.mjs <path-to-reference-worktree> [--out <path>] [--no-live]');
  process.exit(2);
}

const { publicParamMatrix, loadFixtureKV } = await import(`${WT}/tools/consultancy/regression-reference.mjs`);
const eng = await import(`${REF}/workers/fetch-s1.js`);

const VOLATILE = new Set(['timestamp', 'updated_at', 'generated_at', 'computed_at', 'as_of']);
const hash = (o) => createHash('sha256')
  .update(JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v))).digest('hex');

/** Every field the five items can reach, flattened so a delta table is a subtraction. */
function fields(r) {
  return {
    gross_revenue_y1: r.gross_revenue_y1 ?? null,
    net_revenue_y1: r.net_revenue_y1 ?? null,
    ebitda_y1: r.ebitda_y1 ?? null,
    project_irr: r.project_irr ?? null,
    equity_irr: r.equity_irr ?? null,
    irr_status: r.irr_status ?? null,
    min_dscr: r.min_dscr ?? null,
    npv_at_wacc: r.npv_at_wacc ?? null,
    lcos_eur_mwh: r.lcos_eur_mwh ?? null,
    moic: r.moic ?? null,
    payback_years: r.payback_years ?? null,
    model_version: r.model_version ?? null,
    irr_2h: r.irr_2h ?? null,
    irr_4h: r.irr_4h ?? null,
    bankability: r.bankability ?? null,
    net_mw_yr: r.net_mw_yr ?? null,
    signal_inputs_s1_capture: r.signal_inputs?.s1_capture ?? null,
    by_trading: r.base_year?.annual_totals?.trading ?? null,
    by_balancing: r.base_year?.annual_totals?.balancing ?? null,
    by_gross: r.base_year?.annual_totals?.gross ?? null,
    by_net: r.base_year?.annual_totals?.net ?? null,
    by_s1_months: r.base_year?.data_coverage?.s1_months ?? null,
    tm_trading_fraction: r.base_year?.time_model?.trading_fraction ?? null,
    tm_effective_arb_pct: r.base_year?.time_model?.effective_arb_pct ?? null,
    engine_version: r.model_version ?? r.engine_version ?? null,
    // Shape, not value: item 3's class guard is about the fallback emitting a
    // DIFFERENT SET OF KEYS, which no value-level delta would ever show.
    _top_level_keys: Object.keys(r).sort().join(','),
  };
}

const kvPrimary = loadFixtureKV();
const kvFallback = JSON.parse(JSON.stringify(kvPrimary));
delete kvFallback.s1_capture;

const matrix = publicParamMatrix();
const revenue = {};
const fallback = {};
for (const { id, params } of matrix) {
  const a = eng.computeRevenueV7(params, kvPrimary);
  revenue[id] = { hash: hash(a), ...fields(a) };
  const b = eng.computeRevenueV7(params, kvFallback);
  fallback[id] = { hash: hash(b), ...fields(b) };
}

// ── 3. the A44 fixture, parsed both ways ──────────────────────────────────────
// Deliberately the COMMITTED fixture, not a live fetch: item 1's delta has to be
// reproducible by anyone reading this file next month, and a live A44 document
// changes every day. The live reading lives in block 4, stamped and labelled.
const fixDir = join(REF, 'workers/__tests__/fixtures');
let a44Block;
try {
  const xml = readFileSync(join(fixDir, 'entsoe-a44-lt-2026-08-03.xml'), 'utf8');
  const elering = JSON.parse(readFileSync(join(fixDir, 'elering-lt-2026-08-03-cest-day.json'), 'utf8'))
    .data.lt.map((e) => e.price);
  const flat = eng.extractPrices(xml);
  const periods = eng.parseA44Periods(xml);
  const mean = (a) => (a && a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10000) / 10000 : null);
  const cest = periods[0]?.prices ?? [];
  const matches = cest.length === elering.length
    ? cest.filter((v, i) => Math.abs(v - elering[i]) < 1e-9).length : null;
  const flatMatches = flat.length >= elering.length
    ? elering.filter((v, i) => Math.abs(flat[i] - v) < 1e-9).length : null;
  a44Block = {
    fixture: 'workers/__tests__/fixtures/entsoe-a44-lt-2026-08-03.xml',
    control: 'workers/__tests__/fixtures/elering-lt-2026-08-03-cest-day.json',
    periods: periods.map((p) => ({
      start: new Date(p.startMs).toISOString(),
      end: new Date(p.endMs).toISOString(),
      resolution_min: p.resolutionMin,
      declared: p.declared,
      forward_filled: p.filled,
    })),
    flat_scrape: { n: flat.length, mean: mean(flat), min: Math.min(...flat), max: Math.max(...flat) },
    forward_filled_day1: { n: cest.length, mean: mean(cest), min: Math.min(...cest), max: Math.max(...cest) },
    elering_control: { n: elering.length, mean: mean(elering) },
    slot_agreement_vs_elering: {
      forward_filled: matches === null ? 'n/a' : `${matches}/${elering.length}`,
      flat_scrape: flatMatches === null ? 'n/a' : `${flatMatches}/${elering.length}`,
    },
  };
} catch (e) {
  a44Block = { error: String(e) };
}

// ── 4. live, stamped, direction-only ──────────────────────────────────────────
const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
let live = { skipped: true };
if (!NO_LIVE) {
  const get = async (p) => {
    try {
      const r = await fetch(`${WORKER}${p}`, { signal: AbortSignal.timeout(25000) });
      return r.ok ? await r.json() : { _http: r.status };
    } catch (e) { return { _error: String(e) }; }
  };
  const [s1, health, rev] = await Promise.all([
    get('/s1'), get('/health'), get('/revenue?dur=2h&capex=mid&cod=2028&scenario=base'),
  ]);
  live = {
    read_at: new Date().toISOString(),
    s1: {
      lt_avg_eur_mwh: s1.lt_avg_eur_mwh, se4_avg_eur_mwh: s1.se4_avg_eur_mwh,
      lt_hours: s1.lt_hours, se4_hours: s1.se4_hours,
      lt_daily_swing_eur_mwh: s1.lt_daily_swing_eur_mwh,
      lt_peak_hour_utc: s1.lt_peak_hour_utc, lt_trough_hour_utc: s1.lt_trough_hour_utc,
      lt_evening_premium: s1.lt_evening_premium,
      p_high_avg: s1.p_high_avg, p_low_avg: s1.p_low_avg,
      intraday_capture: s1.intraday_capture, bess_net_capture: s1.bess_net_capture,
      lt_hourly_24: s1.lt_hourly_24,
    },
    revenue_reference_config: {
      gross_revenue_y1: rev.gross_revenue_y1, net_revenue_y1: rev.net_revenue_y1,
      project_irr: rev.project_irr, equity_irr: rev.equity_irr, irr_status: rev.irr_status,
      min_dscr: rev.min_dscr, lcos: rev.lcos, moic: rev.moic,
      signal_inputs_s1_capture: rev.signal_inputs?.s1_capture ?? null,
    },
    health: health.signals ? Object.fromEntries(Object.entries(health.signals).map(
      ([k, v]) => [k, { status: v.status, age_hours: v.age_hours, stale: v.stale, threshold_hours: v.threshold_hours, ...(v.degraded ? { degraded: true, degraded_reason: v.degraded_reason } : {}) }],
    )) : health,
  };
}

const artifact = {
  _note: 'Phase 49 pre-state (C3). Captured from a clean worktree of the reference commit against one frozen KV snapshot, BEFORE any defect was reproduced. Later deltas subtract from this file, not from conversational memory (C4).',
  captured_at: new Date().toISOString(),
  reference_worktree: REF,
  reference_sha: process.env.PHASE49_REF_SHA ?? null,
  kv_fixture: 'tools/consultancy/fixtures/regression-kv.json',
  configs: matrix.length,
  revenue,
  fallback_s1_capture_absent: fallback,
  a44: a44Block,
  live,
};

writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.error(`pre-state written: ${OUT}`);
console.error(`  ${matrix.length} configs · primary + s1_capture-absent variant`);
console.error(`  reference worktree: ${REF}`);
