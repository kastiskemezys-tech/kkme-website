/**
 * Phase 34.7 — PDF rendering + the methodology annex.
 *
 * Two outputs, both A4 with backgrounds on:
 *   Prosperus_BESS_Model_v0.5_Summary.pdf   — the deliverable HTML
 *   Prosperus_BESS_Methodology_Annex.pdf    — docs/methodology.md, same brand
 *
 * The deliverable's print CSS already collapses the `details` drills and forces
 * a page break at the scope divider, so the summary prints at summary level
 * while the on-screen HTML keeps the derivation detail.
 *
 * Fonts: the template links Google Fonts. Chromium is given a real network
 * idle wait so the webfonts land before the PDF is taken; if they cannot be
 * fetched the CSS fallbacks (Georgia / Menlo) render and the PDF is still
 * correct, just less pretty. That degradation is reported, never silent.
 *
 * Usage:
 *   node tools/consultancy/generate-pdf.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { marked } from 'marked';
import { HERE, REPO_ROOT, OUTPUT_DIR } from './engine.mjs';
import { TEMPLATE_PATH, HTML_NAME } from './generate-deliverable.mjs';

export const SUMMARY_PDF = 'Prosperus_BESS_Model_v0.5_Summary.pdf';
export const ANNEX_PDF = 'Prosperus_BESS_Methodology_Annex.pdf';
export const ANNEX_HTML = 'Prosperus_BESS_Methodology_Annex.html';
export const METHODOLOGY_PATH = join(REPO_ROOT, 'docs/methodology.md');

/** Lift the template's `:root` block so the annex is the same brand, not a lookalike. */
export function brandRoot(template = readFileSync(TEMPLATE_PATH, 'utf8')) {
  const m = template.match(/:root\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('template :root block not found — annex branding cannot be derived');
  return m[0];
}

/** Wrap docs/methodology.md in a minimal same-brand shell. */
export function buildAnnexHtml({ generatedAt, engineVersion }) {
  const md = readFileSync(METHODOLOGY_PATH, 'utf8');
  marked.setOptions({ gfm: true, breaks: false });
  const body = marked.parse(md);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>KKME Methodology Annex — Prosperus BESS Portfolio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${brandRoot()}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--birch); color: var(--tobacco); font-family: var(--font-display); font-size: 13px; line-height: 1.6; }
body { max-width: 900px; margin: 0 auto; padding: 40px 36px 64px; }
h1 { font-size: 28px; font-weight: 300; letter-spacing: -0.02em; margin: 0 0 6px; font-variation-settings: "opsz" 144; }
h2 { font-size: 19px; font-weight: 500; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); font-variation-settings: "opsz" 80; }
h3 { font-size: 15px; font-weight: 500; margin: 18px 0 8px; }
h4 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px 22px; }
li { margin-bottom: 4px; }
a { color: var(--sea-deep); text-decoration: none; border-bottom: 1px solid var(--sea-glaze); }
code { font-family: var(--font-mono); font-size: 11px; background: var(--birch-dark); padding: 1px 5px; }
pre { background: var(--birch-dark); border: 1px solid var(--border-hair); padding: 12px; overflow-x: auto; margin: 0 0 12px; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid var(--amber); background: var(--amber-glaze); padding: 10px 14px; margin: 0 0 12px; font-style: italic; }
table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 0 0 14px; }
th { text-align: left; font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--tobacco-3); font-weight: 500; padding: 7px 9px; border-bottom: 1px solid var(--border); }
td { padding: 6px 9px; border-bottom: 1px solid var(--border-hair); vertical-align: top; }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
strong { font-weight: 600; }

.annex-head { border-bottom: 1px solid var(--border-strong); padding-bottom: 20px; margin-bottom: 28px; }
.wordmark { font-family: var(--font-display); font-weight: 600; font-size: 22px; letter-spacing: -0.02em; }
.wordmark .amber-dot { color: var(--amber); }
.annex-tag { font-family: var(--font-mono); font-size: 10px; color: var(--tobacco-3); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 8px; display: block; }
.annex-note { font-family: var(--font-mono); font-size: 10px; color: var(--tobacco-2); background: var(--sea-glaze); border-left: 3px solid var(--sea); padding: 10px 14px; margin: 16px 0 24px; line-height: 1.65; }

@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { max-width: 100%; padding: 0; font-size: 10.5px; }
  h2 { break-after: avoid; }
  table, pre, blockquote { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="annex-head">
  <div class="wordmark">KKME<span class="amber-dot">.</span></div>
  <span class="annex-tag">Methodology annex · engine ${engineVersion} · generated ${generatedAt}</span>
  <h1 style="margin-top: 14px;">How these numbers are computed</h1>
</div>
<div class="annex-note">
This annex is KKME's published methodology document, reproduced in full and unedited. It describes the engine that produced every figure in the accompanying model and summary — the same engine that runs the public platform at kkme.eu, not a bespoke one built for this engagement. Nothing has been omitted for this delivery: where the methodology states a limitation, that limitation applies to your numbers too.
</div>
${body}
</body>
</html>`;
}

// ── Rendering ──────────────────────────────────────────────────────────────

async function renderPdf(browser, htmlPath, pdfPath) {
  const page = await browser.newPage();
  let fontsLoaded = true;
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle', timeout: 45_000 });
  } catch {
    // Offline or slow font CDN — the page still renders on CSS fallbacks.
    fontsLoaded = false;
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 45_000 });
  }
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  });
  await page.close();
  return { fontsLoaded };
}

/** Page count, read back off the emitted file — reported, never assumed. */
export function pdfPageCount(path) {
  const buf = readFileSync(path);
  const matches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : null;
}

export async function generatePdfs({ outputDir = OUTPUT_DIR, generatedAt, engineVersion } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const summaryHtml = join(outputDir, HTML_NAME);
  if (!statSync(summaryHtml, { throwIfNoEntry: false })) {
    throw new Error(`${summaryHtml} not found — run generate-deliverable.mjs first`);
  }

  const annexHtmlPath = join(outputDir, ANNEX_HTML);
  writeFileSync(annexHtmlPath, buildAnnexHtml({
    generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10),
    engineVersion: engineVersion ?? 'v7.3',
  }), 'utf8');

  const browser = await chromium.launch();
  try {
    const summaryPdf = join(outputDir, SUMMARY_PDF);
    const annexPdf = join(outputDir, ANNEX_PDF);
    const a = await renderPdf(browser, summaryHtml, summaryPdf);
    const b = await renderPdf(browser, annexHtmlPath, annexPdf);
    return {
      summary: { path: summaryPdf, pages: pdfPageCount(summaryPdf), ...a },
      annex: { path: annexPdf, pages: pdfPageCount(annexPdf), ...b },
    };
  } finally {
    await browser.close();
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await generatePdfs();
  for (const [name, r] of Object.entries(res)) {
    const kb = (statSync(r.path).size / 1024).toFixed(1);
    console.log(`  ${name.padEnd(8)} ${r.pages ?? '?'} pp · ${kb} kB${r.fontsLoaded ? '' : ' · WEBFONTS UNAVAILABLE, rendered on CSS fallbacks'}`);
    console.log(`           → ${r.path}`);
  }
  console.log('');
}
