/**
 * Per-project engine runner — Phase 34.1
 *
 * Drives the KKME revenue engine for one project config against a verified
 * live-production KV snapshot and writes the full engine JSON to
 * `tools/consultancy/output/<project_id>.json` (gitignored).
 *
 * Usage:
 *   node tools/consultancy/run-project.mjs tools/consultancy/projects/prosperus/01-bitenai.json
 *   node tools/consultancy/run-project.mjs --all          # every Prosperus config + reference
 *   node tools/consultancy/run-project.mjs --all --offline  # reuse cached KV snapshot
 */

import { join } from 'node:path';
import { loadConfig, loadConfigDir, runProject, PROJECTS_DIR, eur } from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { buildBridge } from './bridge.mjs';
import { writeRunOutput, kvVintage } from './lib/runs.mjs';

/** Attach the consultancy-side derivations (34.2) to a raw engine result. */
export function decorate(result, config, meta) {
  const bridge = buildBridge(result, config);
  return {
    generated_at: new Date().toISOString(),
    engine_version: result.model_version,
    kv_source: meta?.kv_source ?? 'unknown',
    kv_captured_at: meta?.captured_at ?? null,
    kv_verified: meta?.verified ?? false,
    config,
    ...bridge,
    engine: result,
  };
}

export async function runOne(config, kv, meta) {
  const result = await runProject(config, kv);
  return decorate(result, config, meta);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const offline = argv.includes('--offline');
  const all = argv.includes('--all');
  const paths = argv.filter((a) => !a.startsWith('--'));

  const configs = all
    ? [loadConfig(join(PROJECTS_DIR, 'kkme-reference.json')), ...loadConfigDir(join(PROJECTS_DIR, 'prosperus'))]
    : paths.map(loadConfig);

  if (!configs.length) {
    console.error('usage: run-project.mjs <config.json> [...] | --all [--offline]');
    process.exit(2);
  }

  const { kv, meta } = await getKV({ offline });
  if (!meta.verified) {
    console.warn('[warn] KV snapshot is UNVERIFIED — outputs are provisional, do not deliver');
  }

  const rows = [];
  for (const cfg of configs) {
    const out = await runOne(cfg, kv, meta);
    const { path } = writeRunOutput(`${cfg.project_id}.json`, out, {
      runner: 'project', subject: cfg.project_id,
      inputs: { config: cfg, scenario: cfg.scenario ?? 'base' },
      data_vintage: kvVintage(meta),
    });
    rows.push({ cfg, out });
    console.log(`  ${cfg.project_id.padEnd(16)} → ${path}`);
  }

  const pad = (s, n) => String(s).padStart(n);
  console.log('\n  project           MW    MWh   Y1 mo   Gross Y1   Net Y1     EBITDA Y1  Pre-fin CF  IRR');
  console.log('  ' + '─'.repeat(92));
  for (const { cfg, out } of rows) {
    const b = out.bridge_y1;
    console.log(
      `  ${cfg.name.padEnd(17)}${pad(cfg.mw, 4)}${pad(cfg.mwh, 7)}${pad(cfg.operational_months_y1, 8)}` +
      `${pad(eur(b.gross_market_revenues), 11)}${pad(eur(b.net_market_revenue), 11)}` +
      `${pad(eur(b.project_ebitda), 11)}${pad(eur(b.pre_financing_cf), 12)}` +
      `${pad(out.engine.project_irr != null ? (out.engine.project_irr * 100).toFixed(1) + '%' : '—', 7)}`
    );
  }
  console.log('');
}
