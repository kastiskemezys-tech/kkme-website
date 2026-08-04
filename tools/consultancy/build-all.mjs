/**
 * Phase 34.7 — one-command delivery build.
 *
 * Runs the whole chain in dependency order, so a future engagement is one
 * command rather than a remembered sequence:
 *
 *   engine runners → portfolio → scenarios → sensitivity → reconciliation
 *   → Excel → deliverable HTML (consistency gate) → PDFs → packaged delivery
 *
 * Every stage regenerates from the one before it. Nothing is cached across
 * runs and nothing is hand-carried, so the workbook, the summary document and
 * the engine cannot disagree — that is what makes the consistency gate at the
 * end meaningful rather than decorative.
 *
 * Any stage failing stops the build. A deliverable is not partially valid.
 *
 * Usage:
 *   node tools/consultancy/build-all.mjs                # live KV — the delivery run
 *   node tools/consultancy/build-all.mjs --offline      # frozen fixture, for rehearsal
 *   node tools/consultancy/build-all.mjs --skip-runners # reuse existing runner output
 *   node tools/consultancy/build-all.mjs --no-pdf       # engine + xlsx + HTML gate only
 *
 * `--no-pdf` stops before PDF rendering. It exists because rendering needs a
 * Playwright Chromium binary, which a CI runner does not have — and the two
 * automated checks built on this chain (`fixture-currency` and the generator
 * smoke test) verify the ENGINE outputs and the consistency gate, neither of
 * which involves a PDF. Installing a browser so those checks can walk past a
 * stage they do not test would be paying for coverage nobody gets.
 *
 * The coverage this gives up is stated rather than hidden: with `--no-pdf`,
 * PDF rendering and the packaged bundle are exercised ONLY by a full local
 * build. See docs/gates.md.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, OUTPUT_DIR } from './engine.mjs';
import { generateXlsx, XLSX_NAME } from './generate-xlsx.mjs';
import { generateDeliverable, HTML_NAME } from './generate-deliverable.mjs';
import { generatePdfs, SUMMARY_PDF, ANNEX_PDF, LENDER_PDF } from './generate-pdf.mjs';
import { recordArtefact } from './lib/runs.mjs';

export const DELIVERY_DIR = join(OUTPUT_DIR, 'delivery');

const RUNNERS = [
  ['run-project.mjs', ['--all'], 'engine runs · 3 projects + reference asset'],
  ['run-portfolio.mjs', [], 'portfolio roll-up + bridge tie-out'],
  ['run-scenarios.mjs', [], 'Downside / Central / Upside'],
  ['run-sensitivity.mjs', [], '8-driver one-at-a-time perturbation'],
  ['reconcile.mjs', [], 'reconciliation harness'],
];

function runStage(script, args, offline) {
  const argv = offline ? [...args, '--offline'] : args;
  const res = spawnSync(process.execPath, [join(HERE, script), ...argv], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  });
  if (res.status !== 0) {
    process.stderr.write(res.stdout ?? '');
    process.stderr.write(res.stderr ?? '');
    throw new Error(`${script} exited ${res.status} — build stopped`);
  }
  return res.stdout;
}

const kb = (p) => (statSync(p).size / 1024).toFixed(1);

/** The delivery README the client opens first. */
function readme(inp, files, meta) {
  const e = inp.notes.engagement;
  const rec = inp.reconciliation.summary;
  const p = inp.portfolio.portfolio;
  const line = (s = '') => s;
  return [
    `${e.provider}`,
    `${e.deliverable} — ${e.version}`,
    `Prepared for ${e.client} · ${e.client_contact}`,
    `Generated ${meta.generatedAt} · KKME engine ${e.engine_version}`,
    `Run ${inp.build.run_id} · register ${inp.register.version?.id ?? '—'} · commit ${inp.portfolio.run.engine_git_sha}`,
    '',
    '='.repeat(72),
    'FILES IN THIS DELIVERY',
    '='.repeat(72),
    '',
    ...files.map((f) => `  ${f.name.padEnd(46)} ${f.size.padStart(9)} kB   ${f.what}`),
    '',
    '='.repeat(72),
    'WHAT THIS IS',
    '='.repeat(72),
    '',
    ...wrap(inp.notes.figures_basis),
    '',
    ...wrap(`Portfolio: ${p.projects} projects · ${p.mw} MW / ${p.mwh} MWh · ${p.calendar_span}. `
      + `Discount rate ${(p.wacc * 100).toFixed(1)}% WACC.`),
    '',
    ...wrap(inp.notes.scope_lock),
    '',
    '='.repeat(72),
    'HOW THE OVERRIDES WORK',
    '='.repeat(72),
    '',
    ...wrap(inp.notes.override_mechanism),
    '',
    ...wrap('To have overrides applied, send the edited Assumptions tab back to KKME '
      + 'and the model is re-run against them. Turnaround is same-day for a '
      + 'register-only change.'),
    '',
    '='.repeat(72),
    'RECONCILIATION',
    '='.repeat(72),
    '',
    ...wrap(`${rec.internal.pass} of ${rec.internal.total} internal arithmetic assertions pass. `
      + `${rec.external.pass} of ${rec.external.total} external benchmark checks are in band`
      + `${rec.external.warn ? `, with ${rec.external.warn} flagged` : ''}. `
      + `Full detail is on the Reconciliation tab of the workbook and in section 02 of the summary.`),
    ...(rec.external.warn ? ['', ...wrap(inp.notes.upside_warn_note)] : []),
    '',
    '='.repeat(72),
    'PROVENANCE',
    '='.repeat(72),
    '',
    ...wrap(inp.notes.run_registry_note),
    '',
    ...Object.entries(inp.run_sources).map(([k, v]) => `  ${k.padEnd(22)} ${v}`),
    '',
    '='.repeat(72),
    'CONTACT',
    '='.repeat(72),
    '',
    `  ${e.provider_contact}`,
    '',
    line(),
  ].join('\n');
}

/** Hard-wrap prose to 72 columns so the README reads in any text viewer. */
function wrap(text, width = 72) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > width) { lines.push(cur); cur = w; } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Build ──────────────────────────────────────────────────────────────────

export async function buildAll({ offline = false, skipRunners = false, noPdf = false, generatedAt } = {}) {
  const stamp = generatedAt ?? new Date().toISOString().slice(0, 10);
  const log = [];
  const step = (n, what) => { log.push(`  ${String(n).padStart(2)}. ${what}`); console.log(`  ${String(n).padStart(2)}. ${what}`); };

  let n = 0;
  if (!skipRunners) {
    for (const [script, args, what] of RUNNERS) {
      runStage(script, args, offline);
      step(++n, `${what.padEnd(46)} ✓`);
    }
  } else {
    step(++n, 'runners SKIPPED — reusing existing output/*.json');
  }

  const { path: xlsxPath, inputs } = await generateXlsx({ generatedAt: stamp });
  step(++n, `Excel workbook (8 tabs)${''.padEnd(24)} ✓  ${kb(xlsxPath)} kB`);

  const { path: htmlPath } = generateDeliverable({ generatedAt: stamp });
  step(++n, `Deliverable HTML + consistency gate${''.padEnd(11)} ✓  ${kb(htmlPath)} kB`);

  let pdfs = null;
  if (noPdf) {
    step(++n, 'PDF rendering SKIPPED (--no-pdf) — engine + workbook + consistency gate only');
  } else {
    pdfs = await generatePdfs({
      generatedAt: stamp, engineVersion: inputs.portfolio.engine_version, build: inputs.build,
    });
    step(++n, `Summary PDF (${String(pdfs.summary.pages).padStart(2)} pp)${''.padEnd(28)} ✓  ${kb(pdfs.summary.path)} kB`
      + (pdfs.summary.fontsLoaded ? '' : '  [webfonts unavailable]'));
    step(++n, `Methodology annex PDF (${String(pdfs.annex.pages).padStart(2)} pp)${''.padEnd(18)} ✓  ${kb(pdfs.annex.path)} kB`);
    step(++n, `Lender methodology PDF (${String(pdfs.lender.pages).padStart(2)} pp)${''.padEnd(17)} ✓  ${kb(pdfs.lender.path)} kB`);
  }

  // ── Package ──────────────────────────────────────────────────────────────
  rmSync(DELIVERY_DIR, { recursive: true, force: true });
  mkdirSync(DELIVERY_DIR, { recursive: true });

  // Without PDFs the bundle is the workbook and the README. It is deliberately
  // still assembled: the packaging step is part of the chain under test, and a
  // partial bundle that says so is more useful than a skipped stage.
  const bundle = [
    [XLSX_NAME, xlsxPath, 'The model — 8 tabs, editable assumption overrides, scenario selector'],
    ...(pdfs ? [
      [SUMMARY_PDF, pdfs.summary.path, `The summary — ${pdfs.summary.pages} pp, sections 01-10`],
      [ANNEX_PDF, pdfs.annex.path, `Methodology — ${pdfs.annex.pages} pp, KKME's published methodology in full`],
      [LENDER_PDF, pdfs.lender.path,
        `Lender annex — ${pdfs.lender.pages} pp, what is measured vs assumed, and the known-limitations list`],
    ] : []),
  ];
  const files = bundle.map(([name, src, what]) => {
    copyFileSync(src, join(DELIVERY_DIR, name));
    return { name, size: kb(src), what };
  });

  const readmePath = join(DELIVERY_DIR, 'README.txt');
  writeFileSync(readmePath, readme(inputs, files, { generatedAt: stamp }), 'utf8');
  recordArtefact({ build: inputs.build, artefact: 'README.txt', path: readmePath });
  files.push({ name: 'README.txt', size: kb(readmePath), what: 'File inventory, how overrides work, contact' });
  step(++n, `Packaged to output/delivery/${''.padEnd(20)} ✓  ${files.length} files`);

  return { files, delivery: DELIVERY_DIR, pdfs, inputs, log };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const offline = process.argv.includes('--offline');
  const skipRunners = process.argv.includes('--skip-runners');
  const noPdf = process.argv.includes('--no-pdf');
  console.log(`\n  KKME consultancy delivery build${offline ? ' — OFFLINE (frozen fixture, rehearsal only)' : ''}\n`);
  const res = await buildAll({ offline, skipRunners, noPdf });
  console.log('\n  Delivery bundle:\n');
  for (const f of res.files) console.log(`    ${f.name.padEnd(46)} ${f.size.padStart(9)} kB`);
  console.log(`\n  → ${res.delivery}\n`);
  if (offline) {
    console.log('  NOTE: built --offline against the frozen fixture. Do not deliver these files.\n');
  }
}
