/**
 * Live /revenue byte-identity probe — Phase 37.H1 (B-045).
 *
 * The route-level probe (`_phase-36-b1-route-probe.mjs`) holds KV frozen and
 * compares two code versions. This one holds the CODE change at the deploy
 * boundary and compares the LIVE worker before and after, which is the only
 * check that can catch "the deploy shipped something other than what was
 * tested".
 *
 * `timestamp` / `updated_at` are per-request wall-clock and are stripped by the
 * same `stripVolatile` the regression gate uses — everything else is compared
 * byte for byte over the 54-configuration public matrix.
 *
 * B3: /revenue-class values flip at the hourly cron tick (`0 * * * *`). A
 * before/after pair straddling a tick would report a difference the deploy did
 * not cause, so each capture records the UTC hour it ran in and the comparison
 * refuses to conclude across a boundary.
 *
 *   node scripts/_phase-37-h1-live-revenue-probe.mjs capture <out.json>
 *   node scripts/_phase-37-h1-live-revenue-probe.mjs compare <a.json> <b.json>
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { publicParamMatrix, hashResult, canonical } from '../tools/consultancy/regression-reference.mjs';

const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
const [mode, a, b] = process.argv.slice(2);

const qs = (p) => new URLSearchParams({
  mw: String(p.mw),
  dur: p.dur_h === 2 ? '2h' : '4h',
  capex: p.capex_kwh === 120 ? 'low' : p.capex_kwh === 164 ? 'mid' : 'high',
  cod: String(p.cod_year),
  scenario: p.scenario,
  grant_pct: String(p.grant_pct),
}).toString();

async function capture(out) {
  const started = new Date().toISOString();
  const configs = {};
  for (const { id, params } of publicParamMatrix()) {
    const res = await fetch(`${WORKER}/revenue?${qs(params)}`);
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
    const body = await res.json();
    configs[id] = { hash: hashResult(body), canonical: canonical(body) };
  }
  const finished = new Date().toISOString();

  // A capture that straddles the hourly tick cannot be compared against
  // anything, so refuse to write one rather than let it be trusted later.
  if (started.slice(0, 13) !== finished.slice(0, 13)) {
    throw new Error(`capture straddled the hourly cron tick (${started} → ${finished}) — rerun`);
  }
  // Vacuity guard: 54 error pages would compare equal and prove nothing.
  const first = JSON.parse(configs[Object.keys(configs)[0]].canonical);
  if (typeof first.project_irr !== 'number') {
    throw new Error('capture invalid — /revenue did not return a revenue payload');
  }

  writeFileSync(out, JSON.stringify({ started, finished, utc_hour: started.slice(0, 13), configs }, null, 1));
  console.log(`captured ${Object.keys(configs).length} configs at ${started} (UTC hour ${started.slice(0, 13)})`);
  console.log(`reference config project_irr=${first.project_irr}`);
}

function compare(pathA, pathB) {
  const A = JSON.parse(readFileSync(pathA, 'utf8'));
  const B = JSON.parse(readFileSync(pathB, 'utf8'));
  const ids = Object.keys(A.configs);
  const diffs = ids.filter((id) => A.configs[id].hash !== B.configs[id]?.hash);
  const same = ids.length - diffs.length;

  console.log(`A: ${A.started} (UTC hour ${A.utc_hour})`);
  console.log(`B: ${B.started} (UTC hour ${B.utc_hour})`);
  console.log(`live /revenue byte-identity: ${same}/${ids.length} identical`);

  if (A.utc_hour !== B.utc_hour) {
    console.log(
      `NOTE: the two captures are in different UTC hours, so the hourly cron ` +
      `(0 * * * *) fired between them. A difference here is data movement, not ` +
      `necessarily a code effect (failure-modes B3).`
    );
  }
  if (diffs.length) {
    console.log('\ndiffering configs:');
    for (const id of diffs.slice(0, 10)) console.log(`  ${id}`);
    process.exitCode = 1;
  }
}

if (mode === 'capture') await capture(a);
else if (mode === 'compare') compare(a, b);
else { console.error('usage: capture <out.json> | compare <a.json> <b.json>'); process.exit(2); }
