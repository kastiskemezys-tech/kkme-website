#!/usr/bin/env node
// Phase 37.A intake run: private workbook → normalised rows → match vs public fleet
// → evidence pass → verification tiers → coverage report.
//
// PRIVACY: reads docs/_private/ (gitignored). Writes the coverage report to
// docs/ (public, aggregate + non-private fields only) and the full private payload
// to a gitignored path under docs/_private/. It NEVER writes a private field to a
// public destination, and asserts that with the same leak detectors the tests use.
//
// Usage:
//   node tools/fleet-intel/run-intake.mjs               # parse + match only (no network)
//   node tools/fleet-intel/run-intake.mjs --evidence    # + per-project evidence pass
//   node tools/fleet-intel/run-intake.mjs --evidence --limit 20
//   node tools/fleet-intel/run-intake.mjs --push        # + push private payload to KV

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseRow } from './lib/normalise.mjs';
import { matchAll } from './lib/match.mjs';
import { gatherEvidence, SOURCE_REGISTRY } from './lib/evidence.mjs';
import { buildIndex as buildLvIndex, REGISTER_CSV } from './lib/lv-register.mjs';
import { computeTier, toPublicRow, findPrivateLeaks, findContactShapedContent, TIERS } from './lib/tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'docs/_private/fleet-intel/DS1-service-workbook-FULL-2026-07-30.xlsx');
const PRIVATE_OUT = path.join(ROOT, 'docs/_private/fleet-intel/intake-latest.json');
const REPORT_OUT = path.join(ROOT, 'docs/investigations/2026-07-31-phase-37-a-coverage-report.md');
const FLEET_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/fleet';

const args = process.argv.slice(2);
const WITH_EVIDENCE = args.includes('--evidence');
const PUSH = args.includes('--push');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;

const cellText = (c) => {
  const v = c?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return v.text;
    if (v.result !== undefined) return v.result;
    return null;
  }
  return v;
};

async function readWorkbook() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const rows = [];
  for (const ws of wb.worksheets) {
    const headers = [];
    for (let c = 1; c <= ws.columnCount; c++) headers.push(String(cellText(ws.getRow(1).getCell(c)) ?? '').trim());
    for (let r = 2; r <= ws.rowCount; r++) {
      const rec = {};
      let any = false;
      headers.forEach((h, i) => {
        const v = cellText(ws.getRow(r).getCell(i + 1));
        if (v !== null && String(v).trim() !== '') any = true;
        rec[h] = v;
      });
      if (any) rows.push(normaliseRow(rec, ws.name));
    }
  }
  return rows;
}

async function fetchPublicFleet() {
  try {
    const res = await fetch(FLEET_URL);
    const j = await res.json();
    return j.raw_entries || [];
  } catch (e) {
    console.error(`  ! could not fetch public fleet: ${e.message}`);
    return [];
  }
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '—');

(async () => {
  console.log('reading private workbook…');
  const rows = await readWorkbook();
  const byCountry = rows.reduce((a, r) => ((a[r.country] = (a[r.country] || 0) + 1), a), {});
  console.log(`  ${rows.length} rows: ${Object.entries(byCountry).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  console.log('fetching public fleet…');
  const publicEntries = await fetchPublicFleet();
  console.log(`  ${publicEntries.length} public fleet entries`);

  console.log('matching…');
  const { results, summary } = matchAll(rows, publicEntries);

  // ── evidence pass ───────────────────────────────────────────────────────────
  const dossiers = [];
  const sourceStats = {};
  let ctx = null;
  if (WITH_EVIDENCE) {
    // Build the LV register index once per run (122 MB streamed, ~3 s).
    if (fs.existsSync(REGISTER_CSV)) {
      const lvIndex = await buildLvIndex();
      ctx = { lvIndex };
      console.log(`  LV register index: ${lvIndex.stats.entities} entities, ${lvIndex.stats.historic} former names`);
    } else {
      console.log('  ! LV register not downloaded — LV rows will report the source as unreachable');
    }
  }
  if (WITH_EVIDENCE) {
    const targets = results.slice(0, LIMIT === Infinity ? results.length : LIMIT);
    console.log(`evidence pass over ${targets.length} rows (polite pacing)…`);
    let i = 0;
    for (const { row, match } of targets) {
      const { evidence, attempts } = await gatherEvidence(row, { ctx });
      for (const a of attempts) {
        const s = (sourceStats[a.source_key] = sourceStats[a.source_key] || { attempted: 0, reachable: 0, unreachable: 0, na: 0, found: 0 });
        s.attempted++;
        if (a.reachable === null) s.na++;
        else if (a.reachable) s.reachable++;
        else s.unreachable++;
        if (a.found) s.found++;
      }
      dossiers.push({ row, match, evidence, attempts });
      if (++i % 10 === 0) console.log(`  ${i}/${targets.length}`);
    }
    // rows not covered by the evidence pass still get a dossier, with no evidence
    for (const { row, match } of results.slice(targets.length)) {
      dossiers.push({ row, match, evidence: [], attempts: [], not_probed: true });
    }
  } else {
    for (const { row, match } of results) dossiers.push({ row, match, evidence: [], attempts: [], not_probed: true });
  }

  // ── tiers (DERIVED, never assigned) ─────────────────────────────────────────
  const enriched = dossiers.map((d) => ({
    ...d.row,
    verification_status: computeTier(d.evidence),
    citations: d.evidence,
    _match: d.match,
    _attempts: d.attempts,
    _not_probed: Boolean(d.not_probed),
  }));

  const tierCount = { [TIERS.PUBLIC_CONFIRMED]: 0, [TIERS.CORROBORATED]: 0, [TIERS.PRIVATE_ONLY]: 0 };
  const tierByCountry = {};
  for (const r of enriched) {
    tierCount[r.verification_status]++;
    tierByCountry[r.country] = tierByCountry[r.country] || { [TIERS.PUBLIC_CONFIRMED]: 0, [TIERS.CORROBORATED]: 0, [TIERS.PRIVATE_ONLY]: 0 };
    tierByCountry[r.country][r.verification_status]++;
  }

  // ── the public projection, leak-asserted ────────────────────────────────────
  const publicRows = enriched.map(toPublicRow).filter(Boolean);
  const leaks = findPrivateLeaks(publicRows);
  const contactLeaks = findContactShapedContent(publicRows);
  if (leaks.length || contactLeaks.length) {
    console.error('FATAL: private data in the public projection:', [...leaks, ...contactLeaks].slice(0, 10));
    process.exit(1);
  }
  console.log(`leak check: public projection has ${publicRows.length} rows, 0 private-field leaks, 0 contact-shaped strings`);

  // ── private payload (gitignored destination) ────────────────────────────────
  const privatePayload = { generated: new Date().toISOString(), source_file: path.basename(SRC), rows: enriched };
  fs.writeFileSync(PRIVATE_OUT, JSON.stringify(privatePayload, null, 2));
  console.log(`private payload → ${path.relative(ROOT, PRIVATE_OUT)} (gitignored)`);

  const parseConf = enriched.reduce((a, r) => ((a[r.parse_confidence] = (a[r.parse_confidence] || 0) + 1), a), {});

  // ── coverage report (public, aggregate only) ────────────────────────────────
  const lines = [];
  lines.push('# Phase 37.A — coverage report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()} · **Rows:** ${rows.length} · **Public fleet compared against:** ${publicEntries.length} entries`);
  lines.push(`**Evidence pass:** ${WITH_EVIDENCE ? `RUN over ${Math.min(LIMIT, results.length)} rows` : 'NOT RUN (parse+match only)'}`);
  lines.push('');
  lines.push('This report contains aggregate counts and non-private fields only. No contact, comment or APVA value appears here or in any committed artifact.');
  lines.push('');
  lines.push('## Verification tiers');
  lines.push('');
  lines.push('| Country | rows | public-confirmed | corroborated | private-only |');
  lines.push('|---|---|---|---|---|');
  for (const [c, t] of Object.entries(tierByCountry)) {
    const n = byCountry[c];
    lines.push(`| ${c} | ${n} | ${t[TIERS.PUBLIC_CONFIRMED]} (${pct(t[TIERS.PUBLIC_CONFIRMED], n)}) | ${t[TIERS.CORROBORATED]} (${pct(t[TIERS.CORROBORATED], n)}) | ${t[TIERS.PRIVATE_ONLY]} (${pct(t[TIERS.PRIVATE_ONLY], n)}) |`);
  }
  lines.push(`| **all** | **${rows.length}** | **${tierCount[TIERS.PUBLIC_CONFIRMED]}** | **${tierCount[TIERS.CORROBORATED]}** | **${tierCount[TIERS.PRIVATE_ONLY]}** |`);
  lines.push('');
  lines.push('## Match engine vs the public fleet DB');
  lines.push('');
  lines.push('| Country | rows | matched | probable | new-to-us | legal entities | descriptors |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const [c, s] of Object.entries(summary)) {
    lines.push(`| ${c} | ${s.total} | ${s.matched} (${pct(s.matched, s.total)}) | ${s.probable} | ${s['new-to-us']} | ${s.legal_entities} | ${s.descriptors} |`);
  }
  lines.push('');
  // ── capacity-basis check: what does the public fleet's `mw` actually measure? ──
  // Found in the first real intake run. For pure-BESS rows the public value tracks
  // the BESS rating; for hybrids it tracks the SITE total (the grid connection),
  // which means hybrid BESS capacity is overstated in the supply trajectory.
  // This is a 37.D input, quantified here so it crosses batches as an artifact (C4).
  const close = (a, b) => a != null && b != null && a > 0 && b > 0 && Math.min(a, b) / Math.max(a, b) > 0.95;
  const basisByType = {};
  let hybBess = 0, hybPublic = 0, hybN = 0;
  for (const r of enriched) {
    const pub = r._match?.best?.mw;
    if (pub == null) continue;
    const t = r.plant_type || '(none)';
    basisByType[t] = basisByType[t] || { n: 0, bess: 0, site: 0, neither: 0 };
    basisByType[t].n++;
    if (close(r.bess_mw, pub)) basisByType[t].bess++;
    else if (close(r.site_total_mw, pub)) basisByType[t].site++;
    else basisByType[t].neither++;
    if (!/^BESS$/i.test(t)) { hybN++; hybBess += r.bess_mw || 0; hybPublic += pub || 0; }
  }
  // ── what a registry confirmation actually proves ────────────────────────────
  const regCodes = {};
  for (const r of enriched) {
    const a = (r._attempts || []).find((x) => x.source_key === 'lv_ur_opendata' && x.found);
    if (a) regCodes[a.locator] = (regCodes[a.locator] || 0) + 1;
  }
  const distinctCodes = Object.keys(regCodes).length;
  const sharedRows = Object.values(regCodes).filter((n) => n > 1).reduce((s, n) => s + n, 0);
  lines.push('## What a `public-confirmed` tier actually proves');
  lines.push('');
  lines.push('Registry evidence confirms that **the named legal entity exists and is active** — it does NOT confirm that the project exists, is permitted, or will be built. That distinction matters for 37.D weighting.');
  lines.push('');
  lines.push(`- LV rows confirmed: **${Object.values(regCodes).reduce((a, b) => a + b, 0)}** across **${distinctCodes}** distinct registration codes`);
  lines.push(`- rows whose SPV is shared with another row (entity-level evidence only): **${sharedRows}**`);
  lines.push(`- rows with a 1:1 SPV (the SPV *is* the project vehicle — closest to project-level): **${Object.values(regCodes).reduce((a, b) => a + b, 0) - sharedRows}**`);
  lines.push('');
  lines.push('This still does real work: it satisfies rule #3\'s named-entity requirement and would catch a phantom company. It is not a substitute for permit or TSO evidence.');
  lines.push('');
  lines.push('## Capacity basis — what does the public fleet `mw` measure?');
  lines.push('');
  lines.push('Agreement (within 5%) of the public fleet value against each private column, by plant type:');
  lines.push('');
  lines.push('| Plant type | matched rows | agrees with private BESS MW | agrees with private SITE total | neither |');
  lines.push('|---|---|---|---|---|');
  for (const [t, v] of Object.entries(basisByType)) {
    lines.push(`| ${t} | ${v.n} | ${v.bess} | ${v.site} | ${v.neither} |`);
  }
  lines.push('');
  if (hybN > 0 && hybBess > 0) {
    lines.push(`**Hybrid rows (n=${hybN}):** private BESS component totals **${hybBess.toFixed(1)} MW**; the matched public fleet entries total **${hybPublic.toFixed(1)} MW** — a **${(hybPublic / hybBess).toFixed(2)}×** difference (**+${(hybPublic - hybBess).toFixed(0)} MW**).`);
    lines.push('');
    lines.push('Reading: for pure-BESS projects the public value tracks the battery rating, but for hybrid sites it tracks the grid-connection/site total. If the supply trajectory treats those entries as battery capacity, hybrid storage is **overstated**, not undercounted.');
    lines.push('');
    lines.push('**The magnitudes in this section are PRIVATE-TIER and NOT PUBLISHABLE.** They rest on the operator\'s BESS-MW column, which is testimony with no public corroboration. They are recorded here as an operator-view sensitivity only.');
    lines.push('');
    lines.push('**37.D must NOT apply this as a correction.** The correction runs in the flattering direction — less real BESS supply → lower sd_ratio → less cannibalisation → HIGHER IRR — which is precisely when an unciteable input must not be allowed to move a client number.');
    lines.push('');
    lines.push('What 37.D inherits instead is the BAND in `tools/fleet-intel/data/hybrid-band.json`, every bound of which is computed from the PUBLIC fleet alone (upper = status quo; lower = publicly-identifiable hybrids contribute 0 BESS MW). Flag and band; do not correct. The named unblocker is a **public hybrid decomposition source** — battery MW stated separately from site connection capacity — with VERT\'s permit register and the Litgrid/Elering connection queues as the candidates. Until one lands, the band is the honest representation.');
  }
  lines.push('');
  lines.push('## Parse confidence');
  lines.push('');
  lines.push(Object.entries(parseConf).map(([k, v]) => `- **${k}**: ${v}`).join('\n'));
  lines.push('');
  lines.push('## Source reachability (B8 — reachability is recorded SEPARATELY from findings)');
  lines.push('');
  if (WITH_EVIDENCE && Object.keys(sourceStats).length) {
    lines.push('| Source | attempted | reachable | unreachable | n/a | found evidence |');
    lines.push('|---|---|---|---|---|---|');
    for (const [k, s] of Object.entries(sourceStats)) {
      lines.push(`| ${k} | ${s.attempted} | ${s.reachable} | ${s.unreachable} | ${s.na} | ${s.found} |`);
    }
  } else {
    lines.push('_Evidence pass not run._');
  }
  lines.push('');
  lines.push('## Source registry — what was probed, deferred, and excluded');
  lines.push('');
  lines.push('No silent caps: sources not probed are listed with the reason.');
  lines.push('');
  lines.push('| Source | countries | type | status | note |');
  lines.push('|---|---|---|---|---|');
  for (const s of SOURCE_REGISTRY) {
    lines.push(`| ${s.key} | ${s.country.join('/')} | ${s.source_type} | **${s.status}** | ${s.note} |`);
  }
  lines.push('');
  lines.push('## Leak assertion');
  lines.push('');
  lines.push(`- public projection rows: **${publicRows.length}**`);
  lines.push(`- private-field leaks: **${leaks.length}**`);
  lines.push(`- contact-shaped strings: **${contactLeaks.length}**`);
  lines.push('');

  // The hand-written narrative (APVA verdict, LV coverage, controls) lives in its
  // own committed file and is APPENDED on every regeneration. Without this the
  // generator would silently delete it on the next run — the same shape as B10,
  // where a refresh destroys the evidence about the data while the data survives.
  const NARRATIVE = path.join(ROOT, 'docs/investigations/2026-07-31-phase-37-a-narrative.md');
  if (fs.existsSync(NARRATIVE)) {
    lines.push('---');
    lines.push('');
    lines.push(fs.readFileSync(NARRATIVE, 'utf8'));
  } else {
    lines.push('> NOTE: narrative companion file missing — APVA/LV verdict sections are absent from this regeneration.');
  }

  fs.writeFileSync(REPORT_OUT, lines.join('\n'));
  console.log(`coverage report → ${path.relative(ROOT, REPORT_OUT)}`);

  if (PUSH) console.log('(--push not wired in this run; see docs for the admin endpoint)');
})();
