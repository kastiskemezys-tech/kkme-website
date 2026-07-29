/**
 * Dispatch backtest runner — Phase 36.B3
 *
 * Replays the B1 greedy policy over 2025-07 → 2026-06 of realised LT day-ahead
 * prices and measures what fraction of the perfect-foresight capture spread it
 * actually achieves, against whatever `trading_realisation` the engine currently
 * holds — read from the engine, never restated as a literal here.
 *
 * Batch-2 measured 0.7234 against an assumed 0.85 and RECORDED it. Batch-3 Part 0
 * adopted it on an operator decision, so the engine now holds the measurement and
 * this runner is a remeasurement harness: it reports drift, and it still refuses
 * to write a divergent value into the bound row. See `updateRegister`.
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
import { writeRunOutput, priceVintage } from './lib/runs.mjs';
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

  // What the engine currently holds, read from the engine — not a literal
  // restating it. Before batch-3 Part 0 this was the assumed 0.85 and the
  // interesting number was the gap; after the cutover it IS the measurement, and
  // the interesting number is the remeasurement drift. Both readings fall out of
  // the same subtraction, so the runner needs no mode switch.
  const engine_value = sc.trd_real;
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
      engine_value,
      measured,
      delta: measured == null ? null : measured - engine_value,
      adopted: measured != null && Math.abs(measured - engine_value) < 5e-5,
      aggregate,
      monthly,
    },
    leakage_checks: leakage,
    daily,
  };
}

// ── Register ───────────────────────────────────────────────────────────────

/**
 * Refresh the register's trading-realisation provenance from a backtest run.
 *
 * This function does NOT decide anything. The canonical value lives in
 * `TRADING_REALISATION.base` and `scenarios.json`; the register row is bound to
 * it and asserted equal to it. So the only honest thing a measurement runner can
 * do to the register is describe the relationship between what it measured and
 * what the code holds — and refuse to write a value that would put the row out
 * of step with its own binding.
 *
 * Two states, one subtraction:
 *
 *   ADOPTED    — the engine already holds the measured value (batch-3 Part 0).
 *                The row's source and note are refreshed with this run's window,
 *                day count and monthly band; the changelog records a
 *                remeasurement. Nothing moves.
 *
 *   DIVERGED   — the engine holds something else. The row keeps its value (it is
 *                bound; writing the measurement into it would break the binding
 *                or silently force a cutover), gains a pointer to the evidence,
 *                and the changelog records the gap as pending an operator
 *                decision. This is the batch-2 behaviour, kept intact — a
 *                remeasurement that disagrees must not quietly re-cut the model.
 *
 * The superseded prior assumption, if present, is left exactly as it is:
 * provenance is history and history does not get rewritten by a later run.
 */
export function updateRegister(register, { measured, window, n_days, engine_value, uplift, monthly }) {
  const out = structuredClone(register);
  const rows = out.rows;
  const i = rows.findIndex((r) => r.id === 'driver_trading_realisation');
  if (i < 0) throw new Error('driver_trading_realisation not found in register');

  const prev = rows[i];
  const value = Math.round(measured * 10000) / 10000;
  const band = monthlyRange(monthly);
  const adopted = Math.abs(value - prev.value) < 5e-5;
  const source =
    `KKME dispatch backtest ${window.from} → ${window.to} (${n_days} trading days, ` +
    `LT day-ahead): B1 greedy policy capture ÷ perfect-foresight sort-and-dispatch capture`;

  if (adopted) {
    // The row IS the measurement. Refresh its provenance to this run and leave
    // the value alone — it is the binding's job to carry it.
    rows[i] = {
      ...prev,
      basis: 'measured',
      source:
        `${source}. Volume-weighted ${value}` +
        (band ? `; monthly volume-weighted ${band[0]} to ${band[1]}` : '') +
        `; single-year window.`,
      note: prev.note,
    };
  } else {
    // Diverged. The bound row keeps its value and gains a pointer to the
    // evidence, so the number in force cannot be read without meeting the
    // measurement that disagrees with it.
    rows[i] = {
      ...prev,
      note:
        `${prev.note} REMEASURED at ${value} over ${window.from} → ${window.to} ` +
        `(${n_days} trading days, day-ahead component only) — see the changelog and ` +
        `output/backtest-*.json. This row remains the ENGINE-BOUND Central driver and is ` +
        `UNCHANGED; moving it is a cutover that moves client IRR and is an operator ` +
        `decision.`,
    };
  }

  out.changelog = out.changelog ?? [];
  out.changelog.push({
    date: window.to,
    id: 'driver_trading_realisation',
    old: adopted ? value : prev.value,
    new: value,
    observed_monthly_range: band,
    reason: adopted
      ? `Remeasurement over ${window.from} → ${window.to}. The engine already holds this ` +
        `value (${prev.value}); the measurement reproduces it, so nothing moved. The window ` +
        `is a single market year, so the monthly band is an observed range and not a ` +
        `distribution — remeasure annually.`
      : `Remeasured at ${value} against an engine holding ${prev.value} ` +
        `(gap ${(value - prev.value).toFixed(4)}). The bound driver is UNCHANGED; adopting ` +
        `the new measurement is a cutover that moves client IRR and is an operator decision.`,
    source,
    phase: '36.B3',
  });

  if (uplift != null) {
    const upliftRow = rows.find((r) => r.id === 'dispatch_15min_uplift');
    const held = upliftRow?.value ?? null;
    const u = Math.round(uplift * 10000) / 10000;
    out.changelog.push({
      date: window.to,
      id: 'dispatch_15min_uplift',
      old: held,
      new: u,
      reason: held != null && Math.abs(u - held) < 5e-5
        ? `Remeasured over 273 complete PT15M days (2025-10-01 → 2026-06-30); the engine ` +
          `already holds this value, so nothing moved.`
        : `Measured at ${u.toFixed(4)} over 273 complete PT15M days (2025-10-01 → ` +
          `2026-06-30) against an engine holding ${held ?? 'an unregistered constant'}. ` +
          `Reported, not adopted — it is a worker constant on the public dispatch path.`,
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
  console.log(`ENGINE HOLDS        ${m.engine_value.toFixed(4)}   TRADING_REALISATION.base`);
  console.log(`MEASURED            ${m.measured == null ? 'n/a' : m.measured.toFixed(4)}   (volume-weighted)`);
  console.log(`delta               ${m.delta == null ? 'n/a' : (m.delta >= 0 ? '+' : '') + m.delta.toFixed(4)}   ${m.adopted ? '— adopted; this run reproduces it' : '— DIVERGED, operator decision'}`);
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

  const { path: out } = writeRunOutput(
    `backtest-${config.project_id}-${payload.meta.window.from}-${payload.meta.window.to}.json`,
    payload,
    {
      runner: 'backtest', subject: `${config.project_id}/${payload.meta.window.from}→${payload.meta.window.to}`,
      inputs: { config, zone, window: payload.meta.window, scenario: scenarioName },
      data_vintage: priceVintage([loadPriceYear(zone, 2025), loadPriceYear(zone, 2026)], { zone }),
    }
  );
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
      engine_value: m.engine_value,
      uplift,
      monthly: m.monthly,
    });
    writeFileSync(REGISTER_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log(
      m.adopted
        ? `updated ${REGISTER_PATH}: driver_trading_realisation is the measurement ` +
          `(${m.measured.toFixed(4)}); provenance refreshed to this run and the changelog ` +
          `records the remeasurement. No value moved.`
        : `updated ${REGISTER_PATH}: changelog records measured ${m.measured.toFixed(4)} ` +
          `against an engine holding ${m.engine_value}.\n` +
          `  driver_trading_realisation stays engine-bound and UNCHANGED — moving it is a ` +
          `cutover that moves client IRR and is an operator decision.`
    );
  } else {
    console.log('\n(register not written — pass --write-register)');
  }

  process.exit(failed > 0 ? 1 : 0);
}
