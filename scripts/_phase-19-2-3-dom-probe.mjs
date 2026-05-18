import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
async function probe(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((m) => { try { localStorage.setItem('theme', m); } catch {} }, mode);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3100/', { waitUntil: 'networkidle', timeout: 45_000 });
  await page.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode);
  await page.waitForTimeout(1500);
  // Find spans containing "↓ Financing"
  const result = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('span'));
    const target = all.find(s => s.textContent && s.textContent.includes('↓ Financing'));
    if (!target) return { found: false };
    const cs = getComputedStyle(target);
    const parent = target.parentElement;
    const cp = parent ? getComputedStyle(parent) : null;
    return {
      found: true,
      text: target.textContent,
      span_color: cs.color,
      span_opacity: cs.opacity,
      parent_opacity: cp ? cp.opacity : null,
      parent_tag: parent ? parent.tagName : null,
    };
  });
  console.log(mode, JSON.stringify(result, null, 2));
  await ctx.close();
}
await probe('light');
await probe('dark');
await browser.close();
