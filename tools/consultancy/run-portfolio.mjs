/**
 * Portfolio runner — Phase 34.3
 *
 * Loads every project config in a directory, runs each through the engine, and
 * writes the consolidated portfolio to `tools/consultancy/output/portfolio.json`.
 *
 * Usage:
 *   node tools/consultancy/run-portfolio.mjs tools/consultancy/projects/prosperus
 *   node tools/consultancy/run-portfolio.mjs <dir> --offline
 */

import { join } from 'node:path';
import { loadConfigDir, runProject, PROJECTS_DIR, eur } from './engine.mjs';
import { writeRunOutput, kvVintage } from './lib/runs.mjs';
import { getKV } from './kv-snapshot.mjs';
import { buildBridge } from './bridge.mjs';
import { buildPortfolio, DEFAULT_WACC } from './portfolio.mjs';

/** Run one config and shape it the way buildPortfolio expects. */
export async function projectEntry(config, kv) {
  const engine = await runProject(config, kv);
  const bridge = buildBridge(engine, config);
  return {
    project_id: config.project_id,
    config,
    gross_capex: engine.gross_capex,
    engine_npv_post_tax: engine.npv_at_wacc,
    engine_project_irr: engine.project_irr,
    ...bridge,
    engine,
  };
}

export async function runPortfolio(configs, kv, opts = {}) {
  const projects = [];
  for (const cfg of configs) projects.push(await projectEntry(cfg, kv));
  return buildPortfolio(projects, opts);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const offline = argv.includes('--offline');
  const dir = argv.find((a) => !a.startsWith('--')) ?? join(PROJECTS_DIR, 'prosperus');
  const waccArg = argv.find((a) => a.startsWith('--wacc='));
  const wacc = waccArg ? Number(waccArg.split('=')[1]) : DEFAULT_WACC;

  const configs = loadConfigDir(dir);
  if (!configs.length) {
    console.error(`no project configs found in ${dir}`);
    process.exit(2);
  }

  const { kv, meta } = await getKV({ offline });
  if (!meta.verified) {
    console.warn('[warn] KV snapshot is UNVERIFIED — outputs are provisional, do not deliver');
  }

  const out = await runPortfolio(configs, kv, { wacc });
  const payload = {
    generated_at: new Date().toISOString(),
    engine_version: 'v7.3',
    kv_source: meta.kv_source,
    kv_captured_at: meta.captured_at,
    kv_verified: meta.verified,
    source_dir: dir,
    ...out,
  };
  const { path } = writeRunOutput('portfolio.json', payload, {
    runner: 'portfolio', subject: 'prosperus-portfolio',
    inputs: { configs, wacc, source_dir: dir },
    data_vintage: kvVintage(meta),
  });

  const pad = (s, n) => String(s).padStart(n);
  const p = out.portfolio;
  console.log(`\n  Portfolio — ${p.projects} projects · ${p.mw} MW / ${p.mwh} MWh · ${p.calendar_span} (${p.calendar_years} calendar years)`);
  console.log('  ' + '─'.repeat(94));
  console.log('  project            MW   first yr   Gross Y1    EBITDA Y1   20-yr EBITDA   NPV @ ' + `${(p.wacc * 100).toFixed(0)}%`.padEnd(5) + '  MOIC');
  for (const x of out.per_project) {
    console.log(
      `  ${x.name.padEnd(17)}${pad(x.mw, 4)}${pad(x.first_operating_year, 11)}` +
      `${pad(eur(x.bridge_y1.gross_market_revenues), 11)}${pad(eur(x.bridge_y1.project_ebitda), 12)}` +
      `${pad(eur(x.bridge_totals.project_ebitda), 15)}${pad(eur(x.npv_pre_financing_pre_tax), 11)}${pad(x.moic, 6)}`
    );
  }
  console.log('  ' + '─'.repeat(94));
  console.log(
    `  ${'CONSOLIDATED'.padEnd(17)}${pad(p.mw, 4)}${pad(out.bridge_y1.cal_year, 11)}` +
    `${pad(eur(out.bridge_y1.gross_market_revenues), 11)}${pad(eur(out.bridge_y1.project_ebitda), 12)}` +
    `${pad(eur(out.bridge_totals.project_ebitda), 15)}${pad(eur(p.npv_pre_financing_pre_tax), 11)}${pad(p.moic, 6)}`
  );
  console.log(`\n  Portfolio Y1 (${out.bridge_y1.cal_year}) contributors: ` +
    out.bridge_y1.contributors.map((c) => `${c.project_id} ${c.operational_months}mo`).join(' · '));
  console.log(`  CAPEX EUR ${(p.gross_capex / 1e6).toFixed(2)}M · payback ${p.payback_years} yr from first draw`);
  console.log(`  Correlation: LT zone ${out.correlation_note.lt_zone_price_correlation} — no portfolio-effect uplift modelled\n`);
  console.log(`  → ${path}\n`);
}
