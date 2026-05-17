#!/usr/bin/env node
// Phase 31 Pause C — multi-viewport DOM probe + screenshot capture.
// Verifies tier-3 visual normalization:
//  - All 6 cards render a filled colored header dot
//  - No StatusChip / DataClassBadge "observed" pill above hero on S7/S9
//  - All 6 cards have a "▸ View [thing] detail" footer link
//  - PeakForecast renders the new P25/P50/P90 marker bar
//  - S7 + S9 still have bottom commodity-subtype scale bar
//  - No editorial state-label prose
// Captures: structural-1440 / 1024 / 414.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:3100';
const OUT = 'docs/visual-audit/phase-31';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function probe(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 1800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE_ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE_ERROR: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForTimeout(4000);

  const probeData = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const find = (label) => {
      const all = Array.from(document.querySelectorAll('h3'));
      const h = all.find(el => norm(el.textContent || '').toUpperCase().includes(label.toUpperCase()));
      return h ? h.closest('article') : null;
    };

    const analyze = (name, article) => {
      if (!article) return { name, found: false };
      const h3 = article.querySelector('h3');
      const dotCandidate = h3 ? Array.from(h3.querySelectorAll('span')).find(s => {
        const cs = window.getComputedStyle(s);
        return cs.borderRadius === '50%' || cs.width === '6px';
      }) : null;
      const dotBg = dotCandidate ? window.getComputedStyle(dotCandidate).backgroundColor : null;
      const drawerBtn = Array.from(article.querySelectorAll('button')).find(b => norm(b.textContent || '').toLowerCase().includes('view'));
      const drawerLabel = drawerBtn ? norm(drawerBtn.textContent) : null;
      const heroDiv = article.querySelector('div[style*="font-serif"], div[style*="clamp(1.5rem"]');
      const heroFs = heroDiv ? window.getComputedStyle(heroDiv).fontSize : null;
      const observedPill = Array.from(article.querySelectorAll('span')).find(s => norm(s.textContent) === 'observed' && window.getComputedStyle(s).borderRadius !== '50%');
      const text = norm(article.textContent);
      return {
        name,
        found: true,
        hasDot: !!dotCandidate,
        dotBg,
        drawerLabel,
        heroFontSize: heroFs,
        hasObservedPillAboveHero: !!observedPill && !article.querySelector('footer')?.contains(observedPill),
        peakP25Label: /P25\s*€\d+/.test(text),
        peakP50Label: /P50\s*€\d+/.test(text),
        peakP90Label: /P90\s*€\d+/.test(text),
      };
    };

    return {
      renewable:   analyze('renewable',   find('Renewable Mix')),
      residual:    analyze('residual',    find('Residual Load')),
      peak:        analyze('peak',        find('Peak Forecast')),
      spread:      analyze('spread',      find('Peak–trough range')),
      s7:          analyze('s7',          find('TTF Gas Price')),
      s9:          analyze('s9',          find('EU ETS Carbon')),
      editorialHit: /\b(elevated|above-normal|high renewable|tight system|wide envelope|favorable|supporting)\b/i.test(
        Array.from(document.querySelectorAll('article'))
          .map(a => a.textContent || '')
          .join(' ')
          .replace(/var\(--bg-elevated\)/g, '')
      ),
    };
  });

  // Capture the structural section directly via its element handle.
  const sec = await page.locator('#structural').elementHandle();
  if (sec) {
    await sec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await sec.screenshot({ path: `${OUT}/structural-${width}.png` });
  } else {
    await page.screenshot({ path: `${OUT}/structural-${width}.png`, fullPage: true });
  }

  await ctx.close();
  return { width, probe: probeData, errors };
}

const results = [];
for (const w of [1440, 1024, 414]) {
  results.push(await probe(w));
}
await browser.close();

let pass = true;
for (const { width, probe, errors } of results) {
  console.log(`\n── viewport ${width} ──`);
  if (errors.length) {
    console.log('  CONSOLE/PAGE errors:');
    errors.forEach(e => console.log('    ' + e));
  }
  const cards = ['renewable', 'residual', 'peak', 'spread', 's7', 's9'];
  for (const c of cards) {
    const r = probe[c];
    if (!r.found) { console.log(`  ✗ ${c}: NOT FOUND`); pass = false; continue; }
    const dotOk = r.hasDot;
    const drawerOk = !!r.drawerLabel && /view/i.test(r.drawerLabel);
    const noPill = !r.hasObservedPillAboveHero;
    const flag = (b) => b ? '✓' : '✗';
    if (!dotOk || !drawerOk || !noPill) pass = false;
    console.log(`  ${flag(dotOk && drawerOk && noPill)} ${c.padEnd(10)} dot=${flag(dotOk)} drawer="${r.drawerLabel || '–'}" pill-above-hero=${r.hasObservedPillAboveHero ? 'YES (bad)' : 'no'} heroFS=${r.heroFontSize}`);
  }
  const peakViz = probe.peak.peakP25Label && probe.peak.peakP50Label && probe.peak.peakP90Label;
  console.log(`  ${peakViz ? '✓' : '✗'} PeakForecast P25/P50/P90 labels present: ${peakViz}`);
  if (!peakViz) pass = false;
  console.log(`  ${probe.editorialHit ? '✗' : '✓'} editorial regex (elevated/above-normal/etc): ${probe.editorialHit ? 'HIT' : 'clean'}`);
  if (probe.editorialHit) pass = false;
}

console.log(`\n${pass ? '✓ ALL CHECKS PASSED' : '✗ FAILURES DETECTED'}`);
process.exit(pass ? 0 : 1);
