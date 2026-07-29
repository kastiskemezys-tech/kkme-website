/**
 * Live-KV snapshot builder — Phase 34.1
 *
 * The consultancy runners must compute client numbers from REAL production
 * data, not fixtures. `wrangler kv key get` needs an interactive login, so the
 * KV object the `/revenue` route assembles is instead reconstructed from the
 * worker's public GET routes and then VERIFIED against the live `/revenue`
 * response. Verification is the point: a reconstruction that silently drifts
 * would produce quietly-wrong client numbers.
 *
 * Usage:
 *   node tools/consultancy/kv-snapshot.mjs            # fetch + verify + cache
 *   node tools/consultancy/kv-snapshot.mjs --verify   # same, verbose diff table
 *   node tools/consultancy/kv-snapshot.mjs --freeze   # also write the committed
 *                                                     # regression fixture
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEngine, HERE, OUTPUT_DIR } from './engine.mjs';

export const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
export const SNAPSHOT_PATH = join(OUTPUT_DIR, 'kv-snapshot.json');
export const FIXTURE_PATH = join(HERE, 'fixtures', 'regression-kv.json');

const HEADROOM_DRAG = 0.70; // mirrors workers/fetch-s1.js computeBaseYear

async function getJSON(path) {
  const res = await fetch(`${WORKER}${path}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

/**
 * Mirror of the `/revenue` route's s2_activation parsing
 * (workers/fetch-s1.js, GET /revenue). Kept structurally identical so the
 * reconstruction cannot drift from what the route feeds the engine.
 */
function parseActivation(actRaw) {
  if (!actRaw) return null;
  const lt = actRaw.countries?.Lithuania;
  const lv = actRaw.countries?.Latvia;
  const ee = actRaw.countries?.Estonia;
  const p50 = (c) => ({
    afrr_p50: c?.afrr_recent_3m?.avg_p50 ?? null,
    mfrr_p50: c?.mfrr_recent_3m?.avg_p50 ?? null,
  });
  return {
    lt: p50(lt), lv: p50(lv), ee: p50(ee),
    lt_monthly_afrr: lt?.afrr_up ?? {}, lt_monthly_mfrr: lt?.mfrr_up ?? {},
    lv_monthly_afrr: lv?.afrr_up ?? {}, lv_monthly_mfrr: lv?.mfrr_up ?? {},
    ee_monthly_afrr: ee?.afrr_up ?? {}, ee_monthly_mfrr: ee?.mfrr_up ?? {},
    compression: actRaw.compression_trajectory ?? null,
  };
}

/**
 * `trading:metrics` has no public GET route, but the live /revenue response
 * publishes the two values the engine derives from it:
 *   reserve_hours_x = act_x + 0.70 × (1 − act_x)
 * The stored activation rates are rounded to 2 dp, so invert and then search
 * the 2-dp grid for the pair that reproduces the published values exactly.
 * Returns null (→ engine's assumed_default path) if no pair matches.
 */
function reconstructDispatchMetrics(liveTimeModel) {
  const target_a = liveTimeModel?.reserve_hours_afrr;
  const target_m = liveTimeModel?.reserve_hours_mfrr;
  if (target_a == null || target_m == null) return null;

  const solve = (target) => {
    for (let i = 0; i <= 100; i++) {
      const act = Math.round(i) / 100;
      const rh = act + HEADROOM_DRAG * (1 - act);
      if (Math.round(rh * 100) / 100 === target) return act;
    }
    return null;
  };
  const a = solve(target_a);
  const m = solve(target_m);
  if (a == null || m == null) return null;
  return {
    rolling_30d: {
      avg_afrr_activation_pct: a,
      avg_mfrr_activation_pct: m,
      _derived: 'inverted from live /revenue base_year.time_model.reserve_hours_*',
    },
  };
}

/** Trim s4_fleet to the fields the engine actually reads (drops ~110 KB of raw_entries). */
export function trimFleet(fleet) {
  if (!fleet) return null;
  // Phase 36.D — `countries` is now read by projectFleet under the named
  // "Litgrid L TrSc basis" scenario, which replaces the LT share of projected
  // supply. Only the three aggregate MW fields are kept; per-country `entries`
  // are dropped with the rest of the raw fleet.
  const {
    trajectory, sd_ratio, phase, cpi, product_sd,
    baltic_operational_mw, baltic_weighted_mw, baltic_pipeline_mw,
    baltic_operational_mw_strict, baltic_weighted_net_mw, absorption_mw,
    non_commercial_mw, eff_demand_mw, demand_basis, demand, updated_at, countries,
  } = fleet;
  const trimCountries = countries
    ? Object.fromEntries(Object.entries(countries).map(([c, v]) => [c, {
        weighted_mw: v?.weighted_mw, pipeline_mw: v?.pipeline_mw, operational_mw: v?.operational_mw,
      }]))
    : undefined;
  return {
    trajectory, sd_ratio, phase, cpi, product_sd,
    baltic_operational_mw, baltic_weighted_mw, baltic_pipeline_mw,
    baltic_operational_mw_strict, baltic_weighted_net_mw, absorption_mw,
    non_commercial_mw, eff_demand_mw, demand_basis, demand, updated_at,
    countries: trimCountries,
  };
}

/** Fetch every public route and assemble the kv object the /revenue route builds. */
export async function fetchKV() {
  const [s1, s1_capture, s2, s3, euribor, fleetFull, activation, live] = await Promise.all([
    getJSON('/read'),
    getJSON('/s1/capture'),
    getJSON('/s2'),
    getJSON('/s3'),
    getJSON('/euribor'),
    getJSON('/s4/fleet'),
    getJSON('/s2/activation'),
    getJSON('/revenue'),
  ]);

  const kv = {
    fleet: trimFleet(fleetFull),
    s2, s1, s3,
    euribor,
    s1_capture,
    s2_activation_parsed: parseActivation(activation),
    capacity_monthly: s2?.capacity_monthly ?? [],
    dispatch_metrics: reconstructDispatchMetrics(live?.base_year?.time_model),
  };

  return { kv, live };
}

// ── Verification ───────────────────────────────────────────────────────────

/** Fields compared between a local reference run and the live /revenue payload. */
export const VERIFY_FIELDS = [
  'system', 'model_version', 'gross_revenue_y1', 'net_revenue_y1', 'ebitda_y1',
  'opex_y1', 'rtm_fees_y1', 'capacity_y1', 'activation_y1', 'arbitrage_y1',
  'project_irr', 'equity_irr', 'min_dscr', 'npv_at_wacc', 'lcos_eur_mwh', 'moic',
  'capex_total', 'total_debt', 'total_equity', 'cycles_per_year',
  'simple_payback_years', 'bankability',
];

/**
 * Run the engine against the reconstructed kv with the reference-asset params
 * the public route uses by default, and diff against the live payload.
 */
export async function verifyKV(kv, live) {
  const engine = await loadEngine();
  const local = engine.computeRevenueV7(
    { mw: 50, dur_h: 2, capex_kwh: 164, cod_year: 2028, scenario: 'base', grant_pct: 0 },
    kv
  );
  const rows = VERIFY_FIELDS.map((f) => {
    const a = local[f];
    const b = live[f];
    let match;
    if (typeof a === 'number' && typeof b === 'number') {
      match = b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) < 1e-6;
    } else {
      match = a === b;
    }
    return { field: f, local: a, live: b, match };
  });
  const mismatches = rows.filter((r) => !r.match);
  return { rows, mismatches, ok: mismatches.length === 0, local };
}

// ── Snapshot cache ─────────────────────────────────────────────────────────

/**
 * Return a usable kv. Uses the cached snapshot when fresh enough, otherwise
 * refetches. `offline: true` refuses to hit the network (uses cache or throws).
 */
export async function getKV({ maxAgeMinutes = 60, offline = false, quiet = false } = {}) {
  if (existsSync(SNAPSHOT_PATH)) {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const ageMin = (Date.now() - new Date(snap.captured_at).getTime()) / 60000;
    if (offline || ageMin <= maxAgeMinutes) {
      if (!quiet) console.log(`[kv] using cached snapshot (${ageMin.toFixed(0)} min old, verified=${snap.verified})`);
      return { kv: snap.kv, meta: snap };
    }
  }
  if (offline) throw new Error('no cached KV snapshot and --offline was requested');
  return captureKV({ quiet });
}

export async function captureKV({ quiet = false } = {}) {
  if (!quiet) console.log(`[kv] fetching live snapshot from ${WORKER} …`);
  const { kv, live } = await fetchKV();
  const v = await verifyKV(kv, live);
  const snap = {
    captured_at: new Date().toISOString(),
    worker: WORKER,
    kv_source: 'live-public-routes',
    verified: v.ok,
    verification: v.rows,
    live_reference: Object.fromEntries(VERIFY_FIELDS.map((f) => [f, live[f]])),
    kv,
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2) + '\n');
  if (!quiet) {
    console.log(`[kv] ${v.ok ? 'VERIFIED — reconstruction reproduces live /revenue exactly' : `UNVERIFIED — ${v.mismatches.length} field(s) differ`}`);
  }
  return { kv, meta: snap, verification: v };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const { meta, verification } = await captureKV();

  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n  field                     local                 live                  ok');
  console.log('  ' + '─'.repeat(78));
  for (const r of verification.rows) {
    console.log(`  ${pad(r.field, 24)}  ${pad(r.local, 20)}  ${pad(r.live, 20)}  ${r.match ? '✓' : '✗'}`);
  }
  console.log('');

  if (argv.includes('--freeze')) {
    if (!verification.ok) {
      console.error('refusing to freeze an unverified snapshot as the regression fixture');
      process.exit(1);
    }
    mkdirSync(join(HERE, 'fixtures'), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          _note:
            'Frozen production KV snapshot. Used ONLY by regression-reference.mjs so the ' +
            'byte-identity gate measures code changes, not live data drift. Verified at ' +
            'capture time to reproduce the live /revenue payload exactly.',
          captured_at: meta.captured_at,
          live_reference: meta.live_reference,
          kv: meta.kv,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`[kv] froze regression fixture → ${FIXTURE_PATH}`);
  }

  process.exit(verification.ok ? 0 : 1);
}
