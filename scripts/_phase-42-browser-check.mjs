/**
 * Phase 42 §4 — the browser-layer check, because that is where the last defect lived.
 *
 * B-045 made the calculator's full tier unauthenticated in EVERY browser, and it
 * passed every endpoint test we had, because the tests spoke to the endpoint
 * directly and never issued a CORS preflight. The bug was in a header the tests
 * were structurally incapable of sending.
 *
 * So this drives a real browser. It asserts:
 *   1. the preflight for POST /calculate permits `authorization` — the exact
 *      B-045 regression;
 *   2. the sample tier renders without a token;
 *   3. a URL configuration is actually adopted by the mounted component (§3),
 *      which is a claim about hydration that no unit test can make.
 *
 * NOT IN CI, and stated rather than implied: the CI runner has no browser and
 * the overnight rules forbid adding a service. `npm run gates` does not include
 * it. Run it by hand:
 *
 *   node scripts/_phase-42-browser-check.mjs [origin]
 *
 * Exit 0 = all checks pass. Exit 1 = a check failed. Exit 2 = could not run.
 */
import { chromium } from 'playwright';

const ORIGIN = process.argv[2] ?? 'https://kkme.eu';
const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.error(`cannot launch a browser: ${e.message}`);
  console.error('Refusing to report a pass from a check that did not execute.');
  process.exit(2);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// ── 1. The B-045 regression, triggered as a browser actually triggers it ────
//
// FIRST VERSION OF THIS CHECK WAS WRONG, and wrong in the way playbook B11
// describes: it issued `fetch(..., { method: 'OPTIONS' })` from the page and
// read the response headers. A browser will not let you do that — an explicit
// OPTIONS is itself a non-simple request, so the browser preflights the
// preflight and the headers you read are not the ones under test. It reported
// `access-control-allow-headers: (absent)` and would have been filed as a
// B-045 regression. Checked a second way with curl: the header is present and
// carries `Authorization`, and the control route /s2/update returns the same
// header WITHOUT it — two different responses, so the probe is valid.
//
// The honest browser-layer test is to make a real cross-origin request with an
// Authorization header and see whether the browser lets it through. If the
// preflight does not permit the header, the browser blocks the request and
// `fetch` rejects — which is exactly what the user experienced under B-045.
await page.goto(`${ORIGIN}/calculator`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const pre = await page.evaluate(async (worker) => {
  try {
    const res = await fetch(`${worker}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer probe-not-a-real-token' },
      body: JSON.stringify({ mw: 50, mwh: 100, cod_year: 2028, capex_eur_kwh: 164 }),
    });
    // Any HTTP status means the preflight PASSED and the request was sent. A
    // 401/403 on the token is the correct outcome here and is not a failure of
    // this check — the check is about the header being permitted at all.
    return { reached: true, status: res.status };
  } catch (e) {
    return { reached: false, error: String(e) };
  }
}, WORKER);

record(
  'a cross-origin request carrying `Authorization` is not blocked by CORS (B-045)',
  pre.reached === true,
  pre.reached ? `request reached the worker, HTTP ${pre.status}` : `blocked by the browser — ${pre.error}`,
);

// ── 2. Sample tier renders without a token ──────────────────────────────────
await page.goto(`${ORIGIN}/calculator`, { waitUntil: 'networkidle', timeout: 60000 });
const hasForm = await page.locator('input').first().isVisible().catch(() => false);
record('sample tier renders the input form without a token', hasForm);

// ── 3. A URL configuration is adopted after hydration (§3) ──────────────────
//
// The claim no unit test can make: the component MOUNTED and took the values.
await page.goto(`${ORIGIN}/calculator?mw=250&mwh=500&cod=2031&capex=210`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const values = await page.locator('input[type="text"]').evaluateAll((els) => els.map((e) => e.value));
const adopted = values.includes('250') && values.includes('500') && values.includes('2031') && values.includes('210');
record('URL configuration is adopted by the mounted component', adopted, `inputs read ${JSON.stringify(values.slice(0, 4))}`);

// ── 4. …and an out-of-range parameter is refused, visibly ───────────────────
await page.goto(`${ORIGIN}/calculator?mw=99999`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
const notice = await page.locator('[role="status"]').first().textContent().catch(() => null);
record(
  'an out-of-range link parameter is refused and SAID SO',
  Boolean(notice && /not applied/i.test(notice)),
  notice ? notice.trim().slice(0, 90) : '(no status notice found)',
);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('');
console.log(`${results.length - failed.length}/${results.length} browser-layer checks passed`);
if (failed.length) console.log('NOTE: checks 3 and 4 fail against a deployment that predates this branch — that is expected before merge.');
process.exit(failed.length ? 1 : 0);
