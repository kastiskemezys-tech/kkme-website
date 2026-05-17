#!/usr/bin/env node
// Phase 19.2 — Pause A audit + Pause C verify probe.
// Scans color-contrast violations in both dark + light modes via axe-core
// injected into a playwright page. Captures multi-viewport screenshots.
//
// Usage:
//   node scripts/_phase-19-2-probe.mjs            # audit-only (no screenshots)
//   SHOTS=1 node scripts/_phase-19-2-probe.mjs    # full Pause C run (4 PNGs)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:3100';
const OUT_VIS = 'docs/visual-audit/phase-19-2';
const OUT_DAT = '/tmp/axe-phase19-2';
const SHOTS = process.env.SHOTS === '1';
mkdirSync(OUT_VIS, { recursive: true });
mkdirSync(OUT_DAT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function scan(mode, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  // pre-seed localStorage so the layout.tsx inline boot script picks the mode
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('theme', m); } catch {}
  }, mode);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  // ensure the html data-theme attribute matches (covers SSR fallback)
  await page.evaluate((m) => {
    document.documentElement.setAttribute('data-theme', m);
  }, mode);
  await page.waitForTimeout(800);

  // Inject axe-core 4.11 from CDN-equivalent npm via fetch isn't possible offline;
  // load from local node_modules via Playwright's addScriptTag using a file path.
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

  const results = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      runOnly: { type: 'rule', values: ['color-contrast'] },
    });
  });
  await ctx.close();
  return results;
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const out = [];
function logViolation(label, results) {
  const cc = results.violations.find((v) => v.id === 'color-contrast');
  const nodes = cc ? cc.nodes : [];
  out.push(`\n=== ${label} — ${nodes.length} color-contrast violations ===`);
  nodes.forEach((n, i) => {
    const d = n.any?.[0]?.data || {};
    out.push(
      `  #${i + 1} ratio=${d.contrastRatio} fg=${d.fgColor} bg=${d.bgColor} sz=${d.fontSize} fw=${d.fontWeight}`,
    );
    out.push(`     sel: ${n.target[0]}`);
    out.push(`     html: ${(n.html || '').slice(0, 160)}`);
  });
  return nodes.length;
}

// Audit pass — desktop viewport for both modes
const darkResults = await scan('dark', { width: 1440, height: 1800 });
const lightResults = await scan('light', { width: 1440, height: 1800 });
writeFileSync(`${OUT_DAT}/probe-dark.json`, JSON.stringify(darkResults, null, 2));
writeFileSync(`${OUT_DAT}/probe-light.json`, JSON.stringify(lightResults, null, 2));
const darkCount = logViolation('DARK 1440', darkResults);
const lightCount = logViolation('LIGHT 1440', lightResults);

// Mobile audit too, since prod scan caught more nodes at narrower widths
const darkMobile = await scan('dark', { width: 414, height: 900 });
const lightMobile = await scan('light', { width: 414, height: 900 });
writeFileSync(`${OUT_DAT}/probe-dark-414.json`, JSON.stringify(darkMobile, null, 2));
writeFileSync(`${OUT_DAT}/probe-light-414.json`, JSON.stringify(lightMobile, null, 2));
const dmCount = logViolation('DARK 414', darkMobile);
const lmCount = logViolation('LIGHT 414', lightMobile);

out.push(
  `\n--- TOTALS ---\n  dark 1440: ${darkCount}\n  light 1440: ${lightCount}\n  dark 414:  ${dmCount}\n  light 414: ${lmCount}`,
);

// Pause C — multi-viewport screenshots
if (SHOTS) {
  out.push('\n--- SCREENSHOTS ---');
  const shots = [
    { name: 'light-1440', mode: 'light', vp: { width: 1440, height: 2400 } },
    { name: 'light-414', mode: 'light', vp: { width: 414, height: 2400 } },
    { name: 'dark-1440', mode: 'dark', vp: { width: 1440, height: 2400 } },
    { name: 'dark-414', mode: 'dark', vp: { width: 414, height: 2400 } },
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2 });
    await ctx.addInitScript((m) => {
      try { localStorage.setItem('theme', m); } catch {}
    }, s.mode);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.evaluate((m) => {
      document.documentElement.setAttribute('data-theme', m);
    }, s.mode);
    await page.waitForTimeout(2000);
    const p = `${OUT_VIS}/${s.name}.png`;
    await page.screenshot({ path: p, fullPage: true });
    out.push(`  ${s.name} → ${p}`);
    await ctx.close();
  }
}

await browser.close();
console.log(out.join('\n'));
