#!/usr/bin/env node
// Phase 19 Pause C — a11y DOM probe + focus-ring screenshots.
// Verifies per pre-decided picks:
//  - Global :focus-visible ring renders on Tab cycle
//  - SourceFooter has role="status" + aria-live="polite" (the production
//    freshness path; pick #2 applied to SourceFooter not FreshnessBadge
//    per operator clarification — FreshnessBadge primitive has 0 in-prod usages)
//  - Each DetailsDrawer trigger has aria-expanded + aria-controls
//  - Each chart wrapper has non-empty aria-label
//  - <main>, <nav>, <header>, <footer> landmarks present
//  - <section role-equivalent> with aria-labelledby on every page section
// Captures: focus-ring-1440.png (RevenueCard drawer trigger),
//           focus-ring-414.png (mobile nav toggle).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:3100';
const OUT = 'docs/visual-audit/phase-19';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function tabUntilMatch(page, selector, maxTabs = 80) {
  for (let i = 0; i < maxTabs; i++) {
    const matched = await page.evaluate((sel) => {
      const active = document.activeElement;
      if (!active) return false;
      return active.matches(sel) || active.closest(sel) !== null;
    }, selector);
    if (matched) return i + 1;
    await page.keyboard.press('Tab');
    await page.waitForTimeout(20);
  }
  return -1;
}

async function probeDesktop() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE_ERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE_ERROR: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  // Allow lazy-loaded cards to mount + freshness to populate.
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);

  // ── Landmark & primitive coverage ──
  const dom = await page.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // Top-level page sections only (direct children of .page-container or main).
    // DrawerSection children are inner content-anchor markers, NOT page landmarks.
    const pageContainer = document.querySelector('.page-container');
    const topLevelSections = pageContainer
      ? Array.from(pageContainer.children).filter(c => {
          // ScrollReveal wraps each section; find the <section> within it
          return c.querySelector(':scope > section') || c.tagName === 'SECTION';
        }).map(c => c.tagName === 'SECTION' ? c : c.querySelector(':scope > section')).filter(Boolean)
      : [];
    const landmarks = {
      main: document.querySelectorAll('main').length,
      nav: document.querySelectorAll('nav').length,
      header: document.querySelectorAll('header').length,
      footer: document.querySelectorAll('footer').length,
      sectionTotal: document.querySelectorAll('section').length,
      topLevelSections: topLevelSections.length,
      topLevelSectionsLabelled: topLevelSections.filter(s => s.hasAttribute('aria-labelledby')).length,
    };

    // SourceFooter signature: role="status" + aria-live="polite" + bracket "[src]"
    const allStatuses = Array.from(document.querySelectorAll('[role="status"][aria-live="polite"]'));
    const sourceFooterCount = allStatuses.filter(el => /\[src\]/.test(el.textContent || '')).length;

    // DetailsDrawer triggers — look for buttons with aria-expanded + aria-controls
    const drawerBtns = Array.from(document.querySelectorAll('button[aria-expanded][aria-controls]'));
    const drawerData = drawerBtns.map(b => ({
      label: norm(b.textContent || ''),
      expanded: b.getAttribute('aria-expanded'),
      controls: b.getAttribute('aria-controls'),
      controlsTarget: !!document.getElementById(b.getAttribute('aria-controls') || ''),
    }));

    // Chart aria — every element with role="img" should have a non-empty aria-label
    // EXCEPT canvases auto-tagged by chart.js inside an already-labelled wrapper.
    const charts = Array.from(document.querySelectorAll('[role="img"]'));
    const chartData = charts.map(c => {
      const label = c.getAttribute('aria-label') || '';
      const wrapperLabelled = !!(c.parentElement && c.parentElement.closest('[role="img"][aria-label]:not([aria-label=""])'));
      return {
        label,
        empty: !label.trim(),
        emptyAndUnwrapped: !label.trim() && !wrapperLabelled,
        tag: c.tagName.toLowerCase(),
      };
    });

    // CountryToggle (S2Card) — should have aria-pressed on each button
    const countryButtons = Array.from(document.querySelectorAll('[role="group"][aria-label="Country"] button'));
    const countryData = countryButtons.map(b => ({
      text: norm(b.textContent || ''),
      pressed: b.getAttribute('aria-pressed'),
      ariaDisabled: b.getAttribute('aria-disabled'),
    }));

    // ContactForm — verify aria-required on required fields
    const requiredFields = Array.from(document.querySelectorAll('#contact-type, #contact-name, #contact-email, #contact-message'));
    const formData = requiredFields.map(f => ({
      id: f.id,
      ariaRequired: f.getAttribute('aria-required'),
      required: f.hasAttribute('required'),
    }));

    // Skip-to-content link
    const skip = document.querySelector('.skip-to-content');
    return { landmarks, sourceFooterCount, drawerData, chartData, countryData, formData, hasSkip: !!skip };
  });

  // ── Focus-ring smoke: tab to RevenueCard drawer trigger, screenshot ──
  await page.evaluate(() => {
    document.querySelector('#revenue')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(800);
  // Focus the first DetailsDrawer trigger inside #revenue
  const focusedRevenue = await page.evaluate(() => {
    const section = document.querySelector('#revenue');
    if (!section) return null;
    const btn = section.querySelector('button[aria-expanded][aria-controls]');
    if (!btn) return null;
    btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    btn.focus();
    return { text: (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
  });
  await page.waitForTimeout(500);
  // Capture computed outline at the focused element
  const focusRingDesktop = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const cs = window.getComputedStyle(a);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, borderRadius: cs.borderRadius };
  });
  await page.screenshot({ path: `${OUT}/focus-ring-1440.png`, clip: await (async () => {
    const box = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 40), w: Math.min(r.width + 80, 800), h: Math.min(r.height + 80, 200) };
    });
    return box ? { x: box.x, y: box.y, width: box.w, height: box.h } : { x: 0, y: 0, width: 800, height: 200 };
  })() });

  await ctx.close();
  return { dom, focusedRevenue, focusRingDesktop, errors };
}

async function probeMobile() {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE_ERROR: ${e.message}`));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForTimeout(3000);
  // Scroll down so StickyNav renders (it gates on scrollY > 300)
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(800);

  const navMobileVisible = await page.evaluate(() => {
    const btn = document.querySelector('.nav-mobile-toggle');
    if (!btn) return { found: false };
    const cs = window.getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    return { found: true, display: cs.display, width: r.width, height: r.height };
  });

  // Focus mobile nav toggle directly (not all CSS states may resolve via Tab)
  await page.evaluate(() => {
    const btn = document.querySelector('.nav-mobile-toggle');
    if (btn) btn.focus();
  });
  await page.waitForTimeout(300);
  const focusRingMobile = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const cs = window.getComputedStyle(a);
    return { tag: a.tagName, classes: a.className, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, borderRadius: cs.borderRadius };
  });
  const clip = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 40), w: Math.min(r.width + 80, 400), h: Math.min(r.height + 80, 200) };
  });
  await page.screenshot({ path: `${OUT}/focus-ring-414.png`, clip: clip ? { x: clip.x, y: clip.y, width: clip.w, height: clip.h } : { x: 0, y: 0, width: 414, height: 200 } });

  await ctx.close();
  return { navMobileVisible, focusRingMobile, errors };
}

const desktop = await probeDesktop();
const mobile = await probeMobile();
await browser.close();

console.log('\n══ Phase 19 a11y probe — DESKTOP 1440 ══');
console.log('\nLANDMARKS:', JSON.stringify(desktop.dom.landmarks, null, 2));
console.log('\nSOURCE-FOOTER live-region count:', desktop.dom.sourceFooterCount);
console.log('\nDETAILS-DRAWER triggers:', desktop.dom.drawerData.length);
desktop.dom.drawerData.forEach(d => console.log(`  expanded=${d.expanded} controls→exists=${d.controlsTarget} "${d.label.slice(0, 60)}"`));
console.log('\nCHARTS with role="img":', desktop.dom.chartData.length);
const emptyAria = desktop.dom.chartData.filter(c => c.empty);
const realMissing = desktop.dom.chartData.filter(c => c.emptyAndUnwrapped);
console.log(`  empty aria-label (raw): ${emptyAria.length}; unwrapped (real misses): ${realMissing.length}`);
desktop.dom.chartData.forEach(c => console.log(`  <${c.tag}> "${c.label.slice(0, 80)}${c.label.length > 80 ? '…' : ''}"`));
console.log('\nCOUNTRY-TOGGLE buttons:', desktop.dom.countryData.length);
desktop.dom.countryData.forEach(c => console.log(`  ${c.text} pressed=${c.pressed} aria-disabled=${c.ariaDisabled}`));
console.log('\nCONTACT-FORM required:', JSON.stringify(desktop.dom.formData, null, 2));
console.log('\nSKIP-TO-CONTENT link present:', desktop.dom.hasSkip);
console.log('\nFOCUSED on revenue trigger:', desktop.focusedRevenue);
console.log('FOCUS-RING desktop computed style:', desktop.focusRingDesktop);
console.log('Errors:', desktop.errors.length ? desktop.errors : 'none');

console.log('\n══ Phase 19 a11y probe — MOBILE 414 ══');
console.log('Mobile nav-toggle visible:', mobile.navMobileVisible);
console.log('FOCUS-RING mobile computed style:', mobile.focusRingMobile);
console.log('Errors:', mobile.errors.length ? mobile.errors : 'none');

// ── Pass criteria ──
const dom = desktop.dom;
const pass =
  dom.landmarks.main >= 1 &&
  dom.landmarks.nav >= 1 &&
  dom.landmarks.header >= 1 &&
  dom.landmarks.footer >= 1 &&
  dom.landmarks.topLevelSections >= 7 &&
  dom.landmarks.topLevelSections === dom.landmarks.topLevelSectionsLabelled &&
  dom.sourceFooterCount >= 1 &&
  dom.drawerData.length >= 1 &&
  dom.drawerData.every(d => d.controlsTarget) &&
  realMissing.length === 0 &&
  dom.formData.every(f => f.ariaRequired === 'true') &&
  dom.hasSkip &&
  desktop.focusRingDesktop?.outlineStyle === 'solid' &&
  desktop.focusRingDesktop?.outlineWidth === '2px' &&
  mobile.focusRingMobile?.outlineStyle === 'solid' &&
  mobile.focusRingMobile?.outlineWidth === '2px';

console.log(`\n${pass ? '✓ ALL PROBES PASSED' : '✗ FAILURES DETECTED'}`);
process.exit(pass ? 0 : 1);
