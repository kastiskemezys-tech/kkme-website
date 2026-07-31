// Staleness surface for the mature-market evidence base — Phase 36.E0.1 gate (B8).
//
// A silently stale evidence base is the failure mode this whole phase exists to prevent. The
// refresh can fail for reasons nobody sees: a portal changes its URL scheme, a token expires, a
// workflow gets disabled, a cron never fires. None of those look like anything. This script is
// the thing that looks.
//
// Rule: a source is STALE when its last successful refresh is older than TWO cadence periods.
// One missed cycle is noise — a maintenance window, a transient 503, a run that was re-queued.
// Two missed cycles means the refresh is not working and nobody noticed, which is the condition
// worth an alarm.
//
// Deliberately NOT a vitest test. A gate that fails purely because time passed would go red on
// unrelated pull requests, and a gate that is red for unrelated reasons is a gate that gets
// ignored (B7). It runs in the refresh workflow and in `scripts/diagnose.sh`, where a red result
// means what it says.
//
// A source with no `last_successful_refresh` at all is reported as `never_refreshed` rather than
// stale — that is the state of every dataset acquired by hand in E0 before this automation
// existed, and it is a different fact from "the automation stopped working".
//
// Usage:
//   node tools/consultancy/mature-markets/check-freshness.mjs
//   node tools/consultancy/mature-markets/check-freshness.mjs --json

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA = path.join(import.meta.dirname, '..', 'data', 'mature-markets');
const DEFAULT_CADENCE_MONTHS = 1;
const MISSED_CYCLES_BEFORE_STALE = 2;

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

const DAY = 864e5;

async function main() {
  const dirs = (await fs.readdir(DATA, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const now = Date.now();
  const rows = [];
  for (const dir of dirs) {
    // The break calendar keeps its provenance in structural-breaks.json rather than a separate
    // manifest. Skipping directories without manifest.json would silently drop it from the
    // staleness surface — and a calendar whose primary sources have gone dead is exactly the
    // thing this check exists to notice.
    let manifest = null;
    for (const candidate of ['manifest.json', 'structural-breaks.json']) {
      try { manifest = JSON.parse(await fs.readFile(path.join(DATA, dir, candidate), 'utf8')); break; }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    if (!manifest) continue;

    const cadence = manifest.refresh_cadence_months ?? DEFAULT_CADENCE_MONTHS;
    const last = manifest.last_successful_refresh ?? null;
    // 30 days per cadence month: the cadence is "monthly", not "on the 3rd", so an exact calendar
    // month would make the threshold drift with month length for no gain.
    const staleAfterDays = cadence * 30 * MISSED_CYCLES_BEFORE_STALE;
    const ageDays = last ? Math.floor((now - Date.parse(last)) / DAY) : null;
    const status = last === null ? 'never_refreshed' : ageDays > staleAfterDays ? 'STALE' : 'fresh';
    rows.push({
      source: dir, status, cadence_months: cadence,
      last_successful_refresh: last, age_days: ageDays, stale_after_days: staleAfterDays,
      retrieved_at: manifest.retrieved_at ?? null,
      rows: manifest.rows ?? null,
    });
  }

  const stale = rows.filter((r) => r.status === 'STALE');
  const never = rows.filter((r) => r.status === 'never_refreshed');

  if (asJson) {
    console.log(JSON.stringify({ checked_at: new Date(now).toISOString(), stale: stale.length, never_refreshed: never.length, sources: rows }, null, 1));
  } else {
    console.log('Evidence-base freshness — stale after 2 missed cadence cycles\n');
    console.log('source       status           cadence  last success  age    threshold');
    for (const r of rows) {
      console.log(`${r.source.padEnd(12)} ${r.status.padEnd(16)} ${String(r.cadence_months + 'm').padEnd(8)} ${(r.last_successful_refresh ?? '—').slice(0, 10).padEnd(13)} ${(r.age_days === null ? '—' : r.age_days + 'd').padEnd(6)} ${r.stale_after_days}d`);
    }
    console.log('');
    if (stale.length) console.log(`STALE: ${stale.map((r) => `${r.source} (${r.age_days}d)`).join(', ')} — the refresh is not working for these sources.`);
    if (never.length) console.log(`Never refreshed by automation: ${never.map((r) => r.source).join(', ')} — acquired by hand in 36.E0; the first scheduled run stamps them.`);
    if (!stale.length && !never.length) console.log('All sources fresh.');
  }

  // Only genuine staleness is a failure. `never_refreshed` is reported and does not fail, so that
  // adding this check does not turn the pre-automation state of the base into a red light.
  if (stale.length) process.exitCode = 1;
}

await main();
