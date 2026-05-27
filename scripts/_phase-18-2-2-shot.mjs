#!/usr/bin/env node
// Phase 18.2.2 — focused S4Card pipeline-bar screenshots (light + dark).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:3100';
const OUT = 'docs/visual-audit/phase-18-2-2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const mode of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('theme', m); } catch {}
  }, mode);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.evaluate((m) => {
    document.documentElement.setAttribute('data-theme', m);
  }, mode);
  await page.waitForTimeout(1500);

  // Find the pipeline bar (LT tab in S4Card) — the 40px-tall flex bar with 3 segments
  const bar = await page.evaluateHandle(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const installedSpan = spans.find((s) => /Installed:/.test(s.textContent || ''));
    if (!installedSpan) return null;
    // Walk up to find the pipeline-bar wrapper (sibling of the legend line)
    let el = installedSpan.closest('div');
    while (el && el.parentElement) {
      const parent = el.parentElement;
      const flexRow = parent.querySelector?.(':scope > div[style*="height: 40px"]');
      if (flexRow) return flexRow.parentElement; // wrap including bar + legend
      el = parent;
      if (el.tagName === 'BODY') break;
    }
    return null;
  });

  const handle = bar.asElement ? bar.asElement() : bar;
  if (handle) {
    await handle.screenshot({ path: `${OUT}/s4-pipeline-bar-${mode}-1440.png` });
    console.log(`✓ ${mode}: ${OUT}/s4-pipeline-bar-${mode}-1440.png`);
  } else {
    console.log(`✗ ${mode}: pipeline-bar element not found, falling back to fullPage`);
    await page.screenshot({ path: `${OUT}/s4-fullpage-${mode}-1440.png`, fullPage: true });
  }

  await ctx.close();
}

await browser.close();
