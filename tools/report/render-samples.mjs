/**
 * Phase 36.F0 — render one sample of every built chart, in both themes, plus a
 * greyscale proof sheet.
 *
 * Exists because the validator checks colour and the tests check structure, and
 * neither of them looks at the picture. Label collisions, geometry and overflow
 * are found by opening the file.
 *
 *   node tools/report/render-samples.mjs [outDir]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cashflowWaterfall, revenueStack, dscrProfile, debtLadder, BUILT, NOT_BUILT } from './charts/index.mjs';
import { grayscaleSurvives } from './charts/grayscale.mjs';
import { theme } from './theme/tokens.mjs';

const OUT = resolve(process.argv[2] ?? 'docs/report-samples');
mkdirSync(OUT, { recursive: true });

const SOURCE = 'KKME engine v7 · frozen KV fixture (tools/consultancy/fixtures/regression-kv.json)';
const AS_OF = '2026-08-03';

const WATERFALL = [
  { label: 'Gross revenue', value: 8_300_025, kind: 'total' },
  { label: 'Operating cost', value: -1_420_000 },
  { label: 'Grid & BRP fees', value: -640_000 },
  { label: 'EBITDA', value: 6_240_025, kind: 'total' },
  { label: 'Debt service', value: -2_180_000 },
  { label: 'Equity cashflow', value: 4_060_025, kind: 'total' },
];
const DSCR = [2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]
  .map((year, i) => ({ year, dscr: [3.13, 2.69, 1.94, 1.22, 1.38, 1.51, 1.72, 1.88][i] }));
const STACK = Array.from({ length: 10 }, (_, i) => ({
  year: 2028 + i,
  values: {
    'DA arbitrage': 2_240_000 - i * 42_000,
    aFRR: 1_820_000 - i * 31_000,
    mFRR: 1_140_000 - i * 12_000,
    FCR: 620_000 + i * 9_000,
  },
}));
const LADDER = [
  { label: 'DSCR 1.30×', sustainable: 14_200_000, target: 16_000_000, binding: 'min DSCR, 2031' },
  { label: 'LLCR 1.40×', sustainable: 15_800_000, target: 16_000_000 },
  { label: 'Gearing 70%', sustainable: 16_400_000, target: 16_000_000 },
];

const charts = (themeName) => ({
  'waterfall': cashflowWaterfall(WATERFALL, { themeName, source: SOURCE, asOf: AS_OF, subtitle: '50 MW / 4h · base · COD 2028 · year 1' }),
  'revenue-stack': revenueStack(STACK, ['DA arbitrage', 'aFRR', 'mFRR', 'FCR'], { themeName, source: SOURCE, asOf: AS_OF, subtitle: 'per MW installed, nominal' }),
  'dscr-profile': dscrProfile(DSCR, { themeName, source: SOURCE, asOf: AS_OF, covenant: 1.30, subtitle: 'senior facility, 1.30× covenant' }),
  'debt-ladder': debtLadder(LADDER, { themeName, source: SOURCE, asOf: AS_OF, subtitle: 'sustainable debt by constraint' }),
});

const rows = [];
for (const themeName of ['light', 'dark']) {
  const t = theme(themeName);
  const exclude = [t.surface, t.surfaceAlt, t.grid, t.axis, t.ink, t.inkSecondary, t.inkMuted, t.band];
  for (const [name, svgStr] of Object.entries(charts(themeName))) {
    writeFileSync(join(OUT, `${name}-${themeName}.svg`), svgStr);
    const g = grayscaleSurvives(svgStr, { exclude });
    rows.push({ name, themeName, pass: g.pass, via: g.via, sep: g.minSeparation, colors: g.colors.length, patterns: g.patterns.length });
  }
}

// The proof sheet. `filter: grayscale(1)` is the browser doing the same
// projection a black-and-white printer does, so the claim is checkable by eye
// and not only by the assertion.
const sheet = `<!doctype html><meta charset="utf-8"><title>KKME chart kit — samples</title>
<style>
 body{font:13px/1.5 'IBM Plex Mono',monospace;margin:24px;background:#fcfcfb;color:#1a1a19}
 h1{font-size:16px} h2{font-size:12px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:#7a7a75}
 .row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
 .cell{border:1px solid #e2ded6}
 .gray{filter:grayscale(1)}
 table{border-collapse:collapse;font-size:11px;margin-top:8px}
 td,th{border:1px solid #e2ded6;padding:3px 8px;text-align:left}
</style>
<h1>KKME report chart kit — F0 samples</h1>
<p>Built: ${BUILT.join(', ')}<br>Not built: ${NOT_BUILT.join(', ')}</p>
<table><tr><th>chart</th><th>theme</th><th>greyscale</th><th>via</th><th>min luminance sep</th><th>fills</th><th>patterns</th></tr>
${rows.map((r) => `<tr><td>${r.name}</td><td>${r.themeName}</td><td>${r.pass ? 'PASS' : 'FAIL'}</td><td>${r.via}</td><td>${r.sep}</td><td>${r.colors}</td><td>${r.patterns}</td></tr>`).join('\n')}
</table>
${['light', 'dark'].map((th) => `<h2>${th}</h2><div class="row">${Object.keys(charts(th)).map((nm) => `<div class="cell">${charts(th)[nm]}</div>`).join('')}</div>`).join('')}
<h2>greyscale proof — the same SVGs under filter: grayscale(1)</h2>
${['light', 'dark'].map((th) => `<div class="row gray">${Object.keys(charts(th)).map((nm) => `<div class="cell">${charts(th)[nm]}</div>`).join('')}</div>`).join('')}
`;
writeFileSync(join(OUT, 'index.html'), sheet);

console.log(`wrote ${rows.length} SVGs + index.html → ${OUT}`);
for (const r of rows) console.log(`  ${r.name}/${r.themeName}: ${r.pass ? 'PASS' : 'FAIL'} via ${r.via} (sep ${r.sep}, ${r.colors} fills, ${r.patterns} patterns)`);
