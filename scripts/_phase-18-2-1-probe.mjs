#!/usr/bin/env node
// Phase 18.2.1 — Pause A audit + Pause C verify probe.
// 6-config (dark/light × 1440/1024/414) axe-core color-contrast scan + screenshots.
//
// Usage:
//   node scripts/_phase-18-2-1-probe.mjs            # audit-only (no screenshots)
//   SHOTS=1 node scripts/_phase-18-2-1-probe.mjs    # full Pause C run (6 PNGs)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:3100';
const OUT_VIS = 'docs/visual-audit/phase-18-2-1';
const OUT_DAT = '/tmp/axe-phase18-2-1';
const SHOTS = process.env.SHOTS === '1';
mkdirSync(OUT_VIS, { recursive: true });
mkdirSync(OUT_DAT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function scan(mode, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('theme', m); } catch {}
  }, mode);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.evaluate((m) => {
    document.documentElement.setAttribute('data-theme', m);
  }, mode);
  await page.waitForTimeout(800);

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
    out.push(`     html: ${(n.html || '').slice(0, 180)}`);
  });
  return nodes.length;
}

const CONFIGS = [
  { name: 'dark-1440',  mode: 'dark',  vp: { width: 1440, height: 1800 } },
  { name: 'dark-1024',  mode: 'dark',  vp: { width: 1024, height: 1400 } },
  { name: 'dark-414',   mode: 'dark',  vp: { width: 414,  height: 900  } },
  { name: 'light-1440', mode: 'light', vp: { width: 1440, height: 1800 } },
  { name: 'light-1024', mode: 'light', vp: { width: 1024, height: 1400 } },
  { name: 'light-414',  mode: 'light', vp: { width: 414,  height: 900  } },
];

const counts = {};
for (const c of CONFIGS) {
  const r = await scan(c.mode, c.vp);
  writeFileSync(`${OUT_DAT}/probe-${c.name}.json`, JSON.stringify(r, null, 2));
  counts[c.name] = logViolation(c.name.toUpperCase(), r);
}

out.push('\n--- TOTALS ---');
for (const c of CONFIGS) out.push(`  ${c.name.padEnd(11)} ${counts[c.name]}`);

if (SHOTS) {
  out.push('\n--- SCREENSHOTS ---');
  for (const c of CONFIGS) {
    const ctx = await browser.newContext({
      viewport: { ...c.vp, height: Math.max(c.vp.height, 2400) },
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript((m) => {
      try { localStorage.setItem('theme', m); } catch {}
    }, c.mode);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.evaluate((m) => {
      document.documentElement.setAttribute('data-theme', m);
    }, c.mode);
    await page.waitForTimeout(2000);
    const p = `${OUT_VIS}/${c.name}.png`;
    await page.screenshot({ path: p, fullPage: true });
    out.push(`  ${c.name} → ${p}`);
    await ctx.close();
  }
}

await browser.close();
console.log(out.join('\n'));
