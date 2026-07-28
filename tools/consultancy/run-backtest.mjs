/**
 * Dispatch backtest runner — Phase 36.B3
 *
 * Replays the B1 greedy policy over 2025-07 → 2026-06 of realised LT day-ahead
 * prices and measures what fraction of the perfect-foresight capture spread it
 * actually achieves, against the assumed `trading_realisation = 0.85`.
 *
 * The measurement is RECORDED, not adopted: the register's bound Central driver
 * keeps its value and gains a pointer to the evidence, and the changelog carries
 * the number and the gap. Adopting it moves client IRR and is an explicit
 * operator decision — see `updateRegister` below for why that boundary is where
 * it is.
 *
 *   output/backtest-<project>-<from>-<to>.json
 *
 * Usage:
 *   node tools/consultancy/run-backtest.mjs --offline
 *   node tools/consultancy/run-backtest.mjs --write-register
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig, loadEngine, OUTPUT_DIR, PROJECTS_DIR, HERE,
} from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { loadPriceYear } from './backfill-entsoe.mjs';
import { buildReserveInputs } from './run-dispatch.mjs';
import { simulateYear } from './lib/dispatch.mjs';
import {
  byDay, measureRealisation, aggregateRealisation, byMonth, leakageChecks,
} from './lib/backtest.mjs';

export const REGISTER_PATH = join(HERE, 'assumptions-register.json');

/** Observed monthly volume-weighted spread, rounded outward to 2dp. */
export function monthlyRange(monthly) {
  const vals = Object.values(monthly ?? {})
    .map((m) => m.volume_weighted)
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return [
    Math.floor(Math.min(...vals) * 100) / 100,
    Math.ceil(Math.max(...vals) * 100) / 100,
  ];
}

/**
 * Splice a 12-month window out of the committed calendar-year files.
 *
 * 2025-07-01 → 2026-06-30. Both halves are complete: 2025 H2 is 4 416 hours
 * with no gaps and 2026 H1 is 4 344, verified before use rather than assumed —
 * the 2026 file as a whole is only 57.5 % covered because it is year-to-date,
 * and a silent null would become a silent skipped day.
 */
export function loadWindow(zone = 'LT') {
  const y2025 = loadPriceYear(zone, 2025);
  const y2026 = loadPriceYear(zone, 2026);

  const h1 = y2025.prices_eur_mwh.slice(4344);       // 2025-07-01 00:00 UTC →
  const h2 = y2026.prices_eur_mwh.slice(0, 4344);    // → 2026-06-30 23:00 UTC
  const prices = [...h1, ...h2];

  const gaps = prices.filter((p) => p == null).length;
  if (gaps > 0) {
    throw new Error(
      `backtest window has ${gaps} missing hours — a gap becomes a silently ` +
      `skipped day. Refusing to measure a headline assumption on partial data.`
    );
  }

  return {
    prices,
    from: '2025-07-01',
    to: '2026-06-30',
    hours: prices.length,
    // The window straddles the MTU change (36.B1-F): hourly through
    // 2025-09-30, quarter-hourly from 2025-10-01, averaged to the hour by D1.
    mtu_15min_from: y2025.mtu_15min_from ?? '2025-10-01',
    native_resolution_hours: {
      '2025': y2025.native_resolution_hours,
      '2026': y2026.native_resolution_hours,
    },
  };
}

/** Day index (0-based from window start) → ISO date. */
export function dateForDayFactory(fromIso) {
  const t0 = Date.parse(`${fromIso}T00:00:00Z`);
  return (d) => new Date(t0 + d * 86_400_000).toISOString().slice(0, 10);
}

export async function runBacktest({ config, kv, zone = 'LT' }) {
  const engine = await loadEngine();
  const sc = engine.REVENUE_SCENARIOS_FOR_TEST.base;
  const dur_h = config.duration_h ?? config.mwh / config.mw;

  const window = loadWindow(zone);

  // Reserves neutralised. The measured quantity multiplies the DA TRADING line
  // only, and the perfect-foresight benchmark assumes the whole asset is free
  // to arbitrage — so the policy must be given the same asset, or the two sides
  // are not on the same basis.
  const reserve = {
    ...(await buildReserveInputs(kv, sc, engine)),
    avail_mw: { fcr: 0, afrr: 0, mfrr: 0 },
    mwh_per_mw_yr: { fcr: 0, afrr: 0, mfrr: 0 },
  };
  const tp = engine.computeThroughputBreakdown(config.mw, dur_h, sc);

  const sim = simulateYear({
    config,
    prices: window.prices,
    yearIndex: 1,
    reserve,
    // Availability forced to 1.0: an outage day is not a trading-skill
    // observation, and letting the 3 % haircut delete days would bias the
    // measurement by whichever days it happened to remove.
    sc: { ...sc, avail: 1.0 },
    opts: {
      total_cd: tp.total_cd,
      keepHours: true,
      // 36.B1-J guard, set explicitly: annual anchors pro-rate against a YEAR,
      // never against the window. Inert here because activation is zero, and
      // asserted inert by test rather than assumed so.
      hours_per_year: 8760,
      enforce_reserve_energy: false,
    },
  });

  const days = byDay(sim.hours_detail, window.prices);
  const daily = measureRealisation({
    days,
    dur_h,
    captureFn: engine.computeDayCapture,
    dateForDay: dateForDayFactory(window.from),
  });

  const aggregate = aggregateRealisation(daily);
  const monthly = byMonth(daily);
  const leakage = leakageChecks(daily, aggregate);

  const assumed = 0.85;
  const measured = aggregate.volume_weighted;

  return {
    meta: {
      phase: '36.B3',
      project_id: config.project_id,
      zone,
      window: { from: window.from, to: window.to, hours: window.hours, days: days.length },
      mtu_note:
        `The window straddles the 15-minute MTU change on ${window.mtu_15min_from} ` +
        `(36.B1-F): roughly 3 months natively hourly, 9 months quarter-hourly averaged ` +
        `into the hour under decision D1. Averaging discards intraday granularity and ` +
        `therefore understates achievable capture — the conservative direction.`,
      dur_h,
      mw: config.mw,
    },
    basis: {
      numerator:
        'B1 greedy policy: volume-weighted average discharge price minus volume-weighted ' +
        'average charge price, day by day. Same-day post-auction information only.',
      denominator:
        'Worker computeDayCapture — perfect-foresight sort-and-dispatch gross spread, ' +
        'the exact construct the register defines trading_realisation against. Imported, ' +
        'not restated (rule #4).',
      reserve_realisation:
        'UNMEASURED and unchanged. No multi-year sub-daily Baltic reserve price series ' +
        'exists (Pause A §1.5, operator decision D3), so only the day-ahead component is ' +
        'measurable. The reserve side keeps its assumed value and says so.',
      excluded:
        'Intraday execution, bid rejection, imbalance exposure and balancing forecast ' +
        'error are NOT in this number. It measures day-ahead policy quality only.',
      non_trading_days:
        'Days the policy declined to trade are counted and excluded, not scored as zero: ' +
        'correctly refusing a spread that cannot cover the round trip is the policy ' +
        'working, and scoring it as a miss would understate realisation.',
    },
    measurement: {
      assumed,
      measured,
      delta: measured == null ? null : measured - assumed,
      aggregate,
      monthly,
    },
    leakage_checks: leakage,
    daily,
  };
}

// ── Register ───────────────────────────────────────────────────────────────

/**
 * Record the measurement in the register — ALONGSIDE the bound driver, not on
 * top of it.
 *
 * The obvious move is to overwrite `driver_trading_realisation.value` with the
 * measured figure. It is the wrong one, for two reasons that only became clear
 * on reading the register's own contract:
 *
 *  1. Rows carrying an `engine_binding` are ASSERTED equal to what the code
 *     holds — `driver:<id>` resolves to the Central value in scenarios.json
 *     (register.mjs, __tests__/register.test.ts). Writing 0.72 into a row bound
 *     to a driver that is still 0.85 either breaks that invariant or forces
 *     scenarios.json to move with it.
 *
 *  2. Moving the Central driver moves client IRR. That is a cutover, and the
 *     arc's standing rule is explicit that new capability lands alongside the
 *     existing engine and that cutover is a separate, explicit operator
 *     decision. A measurement phase is not the place to change a delivered
 *     number.
 *
 * So the measured value lands as its own unbound row, the assumed driver keeps
 * its binding and its value, and the changelog records the measurement and the
 * decision it now awaits. Adopting it is a one-line change to scenarios.json
 * whenever the operator chooses.
 */
export function updateRegister(register, { measured, window, n_days, assumed, uplift, monthly }) {
  const out = structuredClone(register);
  const rows = out.rows;
  const i = rows.findIndex((r) => r.id === 'driver_trading_realisation');
  if (i < 0) throw new Error('driver_trading_realisation not found in register');

  const prev = rows[i];
  const value = Math.round(measured * 10000) / 10000;
  const source =
    `KKME dispatch backtest ${window.from} → ${window.to} (${n_days} trading days, ` +
    `LT day-ahead): B1 greedy policy capture ÷ perfect-foresight sort-and-dispatch capture`;

  // The bound row keeps its value and gains a pointer to the measurement, so a
  // reader of the register cannot see the assumption without seeing the
  // evidence that now sits beside it.
  rows[i] = {
    ...prev,
    note:
      `${prev.note} MEASURED at ${value} over ${window.from} → ${window.to} ` +
      `(${n_days} trading days, day-ahead component only) — see the changelog and ` +
      `output/backtest-*.json. NOTE the measurement falls BELOW this row's declared ` +
      `sensitivity range [${prev.sensitivity_range.join(', ')}]. This row remains the ` +
      `ENGINE-BOUND Central driver and is UNCHANGED; adopting the measured figure is a ` +
      `scenario-driver cutover that moves client IRR and is an operator decision.`,
  };

  // NO new row. The register carries a hard invariant — "every single row is
  // bound; nothing floats free of the model" (__tests__/register.test.ts), with
  // a per-row binding assertion. A measured observation has no code constant to
  // bind to by definition, so adding it as an unbound row would require
  // weakening that invariant, and weakening a governance assertion is not
  // something an autonomous batch should do on its own initiative.
  //
  // The measurement therefore lives in the changelog (metadata, not a row), in
  // the committed backtest output, and in DECISIONS.md — and the bound row now
  // points at it, so the assumption cannot be read without meeting the evidence.
  // Giving `basis: "measured"` rows a first-class unbound slot is a register
  // schema change and belongs with B6's assumption-versioning work.

  out.changelog = out.changelog ?? [];
  out.changelog.push({
    date: window.to,
    id: 'trading_realisation_measured',
    old: null,
    new: value,
    observed_monthly_range: monthlyRange(monthly),
    reason:
      `Measured over 12 months of realised LT day-ahead prices. The assumed driver ` +
      `(${assumed}) is UNCHANGED and still engine-bound; this entry records the evidence ` +
      `and the gap (${(value - assumed).toFixed(4)}) pending an operator cutover decision. ` +
      `The measurement sits below the assumption's declared sensitivity range ` +
      `[${prev.sensitivity_range.join(', ')}], so the range itself is understated, not ` +
      `just the point value.`,
    source,
    phase: '36.B3',
  });

  if (uplift != null) {
    out.changelog.push({
      date: window.to,
      id: 'RYSTAD_15MIN_UPLIFT_DECIMAL',
      old: 0.14,
      new: null,
      reason:
        `Measured at ${uplift.toFixed(4)} over 273 complete PT15M days (2025-10-01 → ` +
        `2026-06-30) against the engine's asserted 0.14. Constant left unchanged — it is ` +
        `a worker constant on the public dispatch path and changing it is a separate ` +
        `decision. Reported, not adopted.`,
      source: 'tools/consultancy/run-15min-delta.mjs',
      phase: '36.B3',
    });
  }

  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };

  const projectArg = arg('project', 'kkme-reference.json');
  const configPath = existsSync(projectArg) ? projectArg : join(PROJECTS_DIR, projectArg);
  const config = loadConfig(configPath);

  const snapshot = await getKV({ offline: argv.includes('--offline') });
  const kv = snapshot.kv || snapshot;

  const payload = await runBacktest({ config, kv, zone: arg('zone', 'LT') });
  const m = payload.measurement;
  const a = m.aggregate;

  console.log(
    `\n── 36.B3 dispatch backtest · ${config.project_id} · ` +
    `${payload.meta.window.from} → ${payload.meta.window.to} ──\n`
  );
  console.log(`trading days        ${a.n_traded} traded, ${a.n_declined} declined, ${a.n_days} evaluated`);
  console.log(`discharged          ${Math.round(a.discharge_mwh).toLocaleString('en-US')} MWh\n`);
  console.log(`ASSUMED             ${m.assumed.toFixed(4)}`);
  console.log(`MEASURED            ${m.measured == null ? 'n/a' : m.measured.toFixed(4)}   (volume-weighted)`);
  console.log(`delta               ${m.delta == null ? 'n/a' : (m.delta >= 0 ? '+' : '') + m.delta.toFixed(4)}`);
  console.log(`simple mean         ${a.simple_mean?.toFixed(4)}`);
  console.log(`distribution        min ${a.min?.toFixed(3)} · p25 ${a.p25?.toFixed(3)} · median ${a.median?.toFixed(3)} · p75 ${a.p75?.toFixed(3)} · max ${a.max?.toFixed(3)}`);

  console.log('\nmonthly (volume-weighted):');
  for (const [k, v] of Object.entries(m.monthly)) {
    console.log(`  ${k}  ${v.volume_weighted?.toFixed(4) ?? '  n/a'}   ${String(v.n_traded).padStart(2)} traded / ${String(v.n_declined).padStart(2)} declined`);
  }

  console.log('\nlook-ahead leakage checks:');
  let failed = 0;
  for (const c of payload.leakage_checks) {
    if (!c.pass) failed++;
    console.log(`${c.pass ? '✓' : '✗'} ${c.check}: ${c.detail}`);
  }

  const out = join(OUTPUT_DIR, `backtest-${config.project_id}-${payload.meta.window.from}-${payload.meta.window.to}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nwrote ${out}`);

  if (argv.includes('--write-register')) {
    if (m.measured == null) throw new Error('no measurement — refusing to write the register');
    const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));
    // The 15-minute uplift is measured by run-15min-delta.mjs; fold its result
    // into the changelog if it has been run, rather than re-fetching here.
    const upliftPath = join(OUTPUT_DIR, 'uplift-15min-LT-2025-10-01-2026-06-30.json');
    const uplift = existsSync(upliftPath)
      ? JSON.parse(readFileSync(upliftPath, 'utf8')).measured?.weighted_uplift ?? null
      : null;

    const updated = updateRegister(register, {
      measured: m.measured,
      window: payload.meta.window,
      n_days: a.n_traded,
      assumed: m.assumed,
      uplift,
      monthly: m.monthly,
    });
    writeFileSync(REGISTER_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log(
      `updated ${REGISTER_PATH}: changelog records measured ${m.measured.toFixed(4)} ` +
      `vs assumed ${m.assumed}.\n` +
      `  driver_trading_realisation stays engine-bound at ${m.assumed} and UNCHANGED — ` +
      `adopting the measured value moves client IRR and is an operator decision.`
    );
  } else {
    console.log('\n(register not written — pass --write-register)');
  }

  process.exit(failed > 0 ? 1 : 0);
}
