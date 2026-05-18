#!/usr/bin/env node
// Phase 18.2.1 Pause C — DOM probe.
// Samples 5 previously-failing accent selectors at light-1440 + verifies computed
// color routes through the new -accent-text tokens. Also asserts that the
// chart canvases render (no broken styling from getComputedStyle resolution).
import { chromium } from 'playwright';

const URL = 'http://localhost:3100/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch {} });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.waitForTimeout(1200);

const results = await page.evaluate(() => {
  const out = [];
  function ratio(fgRgb, bgRgb) {
    const lum = (rgb) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const L1 = lum(fgRgb), L2 = lum(bgRgb);
    return ((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2);
  }
  function parseColor(s) {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    return m[1].split(',').slice(0, 3).map(x => Math.round(parseFloat(x)));
  }
  function compositeOver(fg, fgAlpha, bg) {
    const a = fgAlpha;
    return [
      Math.round(a * fg[0] + (1 - a) * bg[0]),
      Math.round(a * fg[1] + (1 - a) * bg[1]),
      Math.round(a * fg[2] + (1 - a) * bg[2]),
    ];
  }
  // sample 5 sites that previously failed: nav anchor, S3Card EU turnkey teal,
  // S3Card "↓ equipment" teal, "↑ grid" amber, RevenueCard IRR row.
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  out.push({ token: '--teal-accent-text (light)', value: cssVar('--teal-accent-text') });
  out.push({ token: '--amber-accent-text (light)', value: cssVar('--amber-accent-text') });
  out.push({ token: '--teal-medium-accent-text (light)', value: cssVar('--teal-medium-accent-text') });
  out.push({ token: '--rose (light, shifted)', value: cssVar('--rose') });

  // try to locate a nav anchor pointing at #revenue
  const anchors = Array.from(document.querySelectorAll('a[href$="#revenue"]'))
    .filter(a => /Revenue Engine|Full computation|Revenue impact/.test(a.textContent || ''));
  for (let i = 0; i < Math.min(2, anchors.length); i++) {
    const el = anchors[i];
    const fg = getComputedStyle(el).color;
    out.push({ selector: `anchor #revenue [${(el.textContent || '').trim().slice(0,40)}]`, fg });
  }
  // EU turnkey span (S3Card)
  const eu = Array.from(document.querySelectorAll('span')).find(s => /EU turnkey/.test(s.textContent || ''));
  if (eu) {
    const fg = getComputedStyle(eu).color;
    out.push({ selector: `S3Card EU-turnkey span`, fg });
  }
  // 351 MW awaiting TSO confirmation (HeroBalticMap)
  const awa = Array.from(document.querySelectorAll('div')).find(s => /MW awaiting TSO confirmation/.test(s.textContent || '') && s.children.length === 0);
  if (awa) {
    const fg = getComputedStyle(awa).color;
    out.push({ selector: `Hero awaiting-TSO`, fg });
  }
  // ↓ Battery hardware (S3Card driver chip)
  const battery = Array.from(document.querySelectorAll('span')).find(s => /Battery hardware/.test(s.textContent || ''));
  if (battery) {
    const fg = getComputedStyle(battery).color;
    out.push({ selector: `S3Card driver Battery hardware`, fg });
  }

  // Chart canvas count
  const canvases = document.querySelectorAll('canvas');
  out.push({ chartCanvasCount: canvases.length });
  // For each canvas, check it has nonzero width/height (rendered)
  const renderedCanvases = Array.from(canvases).filter(c => c.width > 0 && c.height > 0);
  out.push({ renderedCanvases: renderedCanvases.length });

  // Verify --rose got the new value (#b82828 = rgb(184, 40, 40))
  const rose = cssVar('--rose');
  out.push({ roseExpected: '#b82828 / rgb(184, 40, 40)', roseActual: rose });

  return { out, bgCard: cssVar('--bg-card'), bgPage: cssVar('--bg-page') };
});

console.log(JSON.stringify(results, null, 2));

// also check no console errors during render
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
console.log('Console errors after reload:', consoleErrors.length);
if (consoleErrors.length) console.log(consoleErrors.slice(0, 5).join('\n'));

await ctx.close();
await browser.close();
