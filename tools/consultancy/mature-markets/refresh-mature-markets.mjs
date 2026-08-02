// Periodic refresh of the mature-market evidence base — Phase 36.E0.1.
//
// WHY. E0 acquired 1.43 M rows across four markets and B-036 added the settled activation
// prices. Auction results keep publishing. A stale evidence base rots silently: every
// per-service forecast in E1-E6 is grounded on it, and nothing about a stale dataset looks
// wrong — it just quietly stops describing the market. This script is the refresh, and the
// GitHub Actions workflow in .github/workflows/refresh-mature-markets.yml is the schedule.
//
// PATH NOTE. The E0.1 prompt named this file `tools/consultancy/data/refresh-mature-markets.mjs`.
// It lives here instead, because in this repo `tools/consultancy/data/` is the DATA tree and
// `tools/consultancy/mature-markets/` is the code that reads and writes it. The filename is the
// prompt's; only the directory moved, to keep code out of the data tree.
//
// ── The shape, and why each part of it is load-bearing ──────────────────────────────────────
//
// INCREMENTAL BY YEAR SHARD, RECONCILED BY ROW. Every dataset in the base is sharded by calendar
// year, and a monthly refresh re-fetches only from the start of the current year. That was
// originally expected to be sufficient on its own — earlier years' files simply never touched.
// **It is not, and running it is the only way that showed up.** Sources that publish local wall
// clock and are stored as UTC spill across the year boundary: Svenska kraftnät's window starting
// 2026-01-01 local begins at 2025-12-31T23:00Z, so the fetcher rewrote the 2025 shard with one
// boundary hour and took the dataset from 146 733 rows to 15 261. The append-only gate caught it.
// `reconcileShards()` is the fix, and it keeps the gate meaningful rather than muting it — see the
// comment on that function.
//
// APPEND-ONLY IS ASSERTED, NOT ASSUMED. For every data file the run touched, the previous
// version is read out of git (`git show HEAD:<path>`) and compared row by row on
// (series, period_start, resolution). Three outcomes:
//   * rows added and nothing else            → normal, the expected result
//   * a row REMOVED                          → ANOMALY. Coverage never shrinks on its own.
//   * a shared row's PRICE CHANGED           → ANOMALY 'history_restated'.
// The third is not hypothetical — settlement corrections happen, and A84 carries a
// revisionNumber precisely because published balancing prices get restated. A restatement is a
// real event that an operator must see with its diff, so it is surfaced and the run exits
// non-zero. It is NOT silently accepted, and it is NOT rejected either: rejecting it would
// pin the evidence base to a number the TSO has withdrawn.
//
// COMPARISON IGNORES RETRIEVAL METADATA, DELIBERATELY. Rows are compared on the substantive
// fields — price, price_eur, price_norm, volume, price_basis, period_end, resolution — and not
// on `extra`, which legitimately carries per-retrieval provenance. Comparing whole rows would
// flag every row of every refresh as restated and the gate would be trained to be ignored,
// which is worse than not having it (B7).
//
// THE HUMAN STAYS IN THE LOOP. This script never commits and never pushes. It refreshes, gates,
// and writes a report. The workflow opens a PR from the report. Data grounding gets the same
// review discipline as forecast adoption, and a broken source produces a reviewable red PR
// instead of silent corruption of main.
//
// COMPARABILITY IS HUMAN-OWNED. `docs/research/mature-market-comparability.md` is an analytical
// judgement about which market is a valid analogue for which service. No automated run may
// touch it, and the gate asserts it is unmodified.
//
// SEGMENTATION STAYS ANALYSIS-SIDE. New rows landing after a known break are fine. This script
// never recomputes break segmentation and never edits the break calendar's event list — that is
// E1-E6's work. Refresh is data-side only.
//
// FAILURE IS PER SOURCE AND NAMED (B8). One dead source does not abort the others and does not
// pass quietly. Each source ends in exactly one of ok / no_change / failed / anomaly, with the
// reason, and the report leads with anything that is not ok. Encountered while building this:
// the ENTSO-E platform serves scheduled maintenance as an HTTP 503 HTML page, which is a
// different failure from a rate limit and needs saying so by name.
//
// Usage:
//   node tools/consultancy/mature-markets/refresh-mature-markets.mjs
//   node tools/consultancy/mature-markets/refresh-mature-markets.mjs --sources activation,de
//   node tools/consultancy/mature-markets/refresh-mature-markets.mjs --dry-run
//   node tools/consultancy/mature-markets/refresh-mature-markets.mjs --report-only

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// 36.E0.2: the single sanctioned manifest writer. `preserveAcquisitionMetadata` used to be
// defined here, which meant it protected only the manifests this orchestrator wrote — a fetcher
// run directly bypassed it entirely. It now lives beside the write itself so both paths share it.
import { writeManifest } from './manifest-writer.mjs';

const exec = promisify(execFile);

const HERE = import.meta.dirname;
const REPO = path.join(HERE, '..', '..', '..');
const DATA = path.join(HERE, '..', 'data', 'mature-markets');
const REPORT_DIR = path.join(HERE, '..', 'data', 'mature-markets');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(`--${k}`);

const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

/**
 * The sources.
 *
 * `window` decides what the refresh re-fetches. `current_year` re-fetches from January of the
 * current year, which touches only this year's shards. `full` sources are whole-file datasets
 * small enough that partial refresh would be more machinery than it saves — FX is a few hundred
 * monthly rates, the break calendar is 24 events, and NESO's GB series arrives as four chained
 * whole-file resources that cannot be windowed at the source anyway.
 *
 * `cadence_months` may be overridden per source by a `refresh_cadence_months` field in that
 * source's manifest, so a faster-moving source can be sped up without editing this list.
 */
const SOURCES = [
  { name: 'de', dir: 'de', script: 'fetch-de-regelleistung.mjs', window: 'current_year', cadence_months: 1, note: 'regelleistung.net CRDS v2 — DE FCR/aFRR/mFRR capacity + RAM energy' },
  { name: 'se', dir: 'se', script: 'fetch-se-svk.mjs', window: 'current_year', cadence_months: 1, note: 'Svenska kraftnät Mimer — FCR-N, FCR-D up/down' },
  { name: 'gb', dir: 'gb', script: 'fetch-gb-neso.mjs', window: 'full', cadence_months: 1, note: 'NESO CKAN — DC/DM/DR + EAC reserve. Four chained whole-file resources; not windowable at source.' },
  { name: 'au', dir: 'au', script: 'fetch-au-aemo.mjs', window: 'current_year', cadence_months: 1, note: 'AEMO price+demand — SA1 and NSW1 spot' },
  { name: 'da', dir: 'da', script: 'fetch-entsoe-da.mjs', window: 'current_year_number', cadence_months: 1, note: 'ENTSO-E A44 (DE, SE) + Elexon BMRS (GB) day-ahead — the arbitrage denominator' },
  { name: 'activation', dir: 'activation', script: 'fetch-activation-prices.mjs', window: 'current_year', cadence_months: 1, note: 'ENTSO-E A84 — settled aFRR/mFRR activation prices, DE and AT (B-036)' },
  // fx-monthly.json is the DERIVED rate table and is not in the manifest's file list, so it would
  // not otherwise be reported. It is added here because a revised historical ECB rate silently
  // changes `price_eur` on every GB and AU row. The row-level consequence is still caught on those
  // datasets' shards (price_eur is a compared field); this makes the cause visible too.
  { name: 'fx', dir: 'fx', script: 'fetch-fx.mjs', window: 'full', cadence_months: 1, extra_files: ['fx-monthly.json'], note: 'ECB reference rates — the non-EUR conversion table' },
  // The calendar has no manifest.json: structural-breaks.json is its own manifest and its own
  // data, carrying retrieved_at, the five source verdicts and the event list in one file. Left to
  // the default it would find no manifest, audit an empty file list, and report "no change"
  // forever — a source that can never fail is a source that is not being checked (B8).
  {
    name: 'calendar', dir: 'calendar', script: 'fetch-calendar.mjs', window: 'full', cadence_months: 3,
    manifest_file: 'structural-breaks.json', extra_files: ['structural-breaks.json'],
    note: 'Structural-break calendar. Re-fetched to re-verify its 5 primary sources still serve their evidence lines; the EVENT LIST is human-owned and this run never adds to it.',
  },
];

const HUMAN_OWNED = ['docs/research/mature-market-comparability.md'];

// Substantive fields only. `extra` carries per-retrieval provenance and is excluded on purpose —
// see the header. `market`/`area`/`product`/`direction`/`mechanism` are in the key, not here.
const COMPARED_FIELDS = ['period_end', 'resolution', 'price', 'price_unit', 'currency', 'price_eur', 'price_norm', 'price_norm_unit', 'volume', 'volume_unit', 'price_basis'];

const rowKey = (r) => `${r.market}|${r.area}|${r.product}|${r.direction ?? '-'}|${r.mechanism}|${r.period_start}|${r.resolution}`;
const rowValue = (r) => COMPARED_FIELDS.map((f) => JSON.stringify(r[f] ?? null)).join('');

const manifestPath = (source) => path.join(DATA, source.dir, source.manifest_file ?? 'manifest.json');

async function readManifest(source) {
  try { return JSON.parse(await fs.readFile(manifestPath(source), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/** Previous committed bytes for a path, or null if the file is new in this run. */
async function gitHead(relPath) {
  try {
    const { stdout } = await exec('git', ['show', `HEAD:${relPath}`], { cwd: REPO, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
    return stdout;
  } catch { return null; }
}

function readRows(buf, relPath) {
  const text = relPath.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    map.set(rowKey(r), rowValue(r));
  }
  return map;
}

/**
 * The append-only gate. Compares every NDJSON data file in the manifest against its committed
 * predecessor. Non-NDJSON payloads (source CSV/XLSX caches, the FX table, the calendar JSON) are
 * reported as changed-or-not but not row-compared, because they have no row identity to compare.
 */
async function appendOnlyAudit(source, manifest) {
  const files = [...new Set([...(manifest?.files ?? []).map((f) => f.file), ...(source.extra_files ?? [])])];
  const audit = { rows_added: 0, files_changed: [], files_unchanged: 0, files_new: [], anomalies: [] };
  if (!files.length) audit.anomalies.push({ kind: 'nothing_to_audit', file: source.manifest_file ?? 'manifest.json', consequence: `The ${source.name} source produced no auditable file list, so "this run only appended" could not be checked. A source that can never fail this gate is not being gated.` });

  for (const file of files) {
    const abs = path.join(DATA, source.dir, file);
    const relPath = rel(abs);
    let now;
    try { now = await fs.readFile(abs); } catch { audit.anomalies.push({ kind: 'file_missing_after_refresh', file }); continue; }
    const before = await gitHead(relPath);
    if (!before) { audit.files_new.push(file); if (file.endsWith('.ndjson.gz')) audit.rows_added += readRows(now, relPath).size; continue; }
    if (before.equals(now)) { audit.files_unchanged++; continue; }
    audit.files_changed.push(file);
    if (!file.endsWith('.ndjson.gz')) continue;

    const oldRows = readRows(before, relPath);
    const newRows = readRows(now, relPath);
    const removed = [];
    const restated = [];
    for (const [k, v] of oldRows) {
      if (!newRows.has(k)) { if (removed.length < 5) removed.push(k); continue; }
      if (newRows.get(k) !== v && restated.length < 5) restated.push({ key: k, was: v.split(''), now: newRows.get(k).split('') });
    }
    const added = [...newRows.keys()].filter((k) => !oldRows.has(k)).length;
    audit.rows_added += added;
    if (removed.length) audit.anomalies.push({ kind: 'rows_removed', file, n_removed: [...oldRows.keys()].filter((k) => !newRows.has(k)).length, examples: removed, consequence: 'Coverage shrank. A source withdrawing published history is an event, not a refresh — do not merge without establishing why.' });
    if (restated.length) audit.anomalies.push({ kind: 'history_restated', file, examples: restated, consequence: 'A previously published value changed. Settlement corrections do happen and A84 carries a revisionNumber for exactly this, so this may be legitimate — but it must be a decision, with the diff read, not an automatic merge.' });
  }
  return audit;
}

/**
 * Carry forward manifest entries for shards this run's window did not cover.
 *
 * A windowed fetcher writes `files` from what it fetched. Entries for earlier years must be
 * restored from the previous manifest, and only if the file is still on disk with the sha256 the
 * previous manifest recorded — carrying forward an entry for a file that changed or vanished
 * would make the manifest assert something untrue, which is the one thing it exists not to do.
 *
 * Mutates `after` in place and returns what happened.
 */
// `preserveAcquisitionMetadata()` moved to ./manifest-writer.mjs in 36.E0.2 — see the note on the
// import. It is reached here through `writeManifest()`, which every fetcher now also uses.

async function mergeManifestFiles(source, before, after) {
  const out = { preserved: [], missing: [], drifted: [] };
  if (!before?.files || !after?.files) return out;

  const nowListed = new Set(after.files.map((f) => f.file));
  for (const f of before.files) {
    if (nowListed.has(f.file)) continue;
    let buf;
    try { buf = await fs.readFile(path.join(DATA, source.dir, f.file)); }
    catch { out.missing.push(f.file); continue; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (f.sha256 && sha !== f.sha256) { out.drifted.push(f.file); continue; }
    after.files.push(f);
    out.preserved.push(f.file);
  }
  if (out.drifted.length) out.missing.push(...out.drifted.map((f) => `${f} (sha256 drifted while outside the refresh window)`));
  if (out.preserved.length) {
    after.files.sort((a, b) => String(a.file).localeCompare(String(b.file)));
    if (typeof after.rows === 'number') after.rows = after.files.reduce((s, f) => s + (f.rows ?? 0), 0);
    after.manifest_files_carried_forward = out.preserved.length;
  }
  return out;
}

/**
 * Reconcile the shards a windowed fetch rewrote, so a refresh appends instead of truncating.
 *
 * THIS EXISTS BECAUSE THE YEAR-SHARD PREMISE IS FALSE, and it was false in a way that only showed
 * up by running it. Sharding by calendar year was supposed to mean a `--from <year>-01` refresh
 * could never touch an earlier year's file. Measured on Svenska kraftnät: it does. SvK publishes
 * Swedish local wall clock, stored as UTC instants, so the window starting 2026-01-01 local begins
 * at 2025-12-31T23:00Z — inside the 2025 shard. The fetcher rewrote `se-fcr-2025.ndjson.gz` with
 * that single boundary hour and the dataset went from 146 733 rows to 15 261. The append-only gate
 * caught it (26 277 rows removed), which is the gate earning its place — but a gate that fires on
 * every scheduled run is an alarm nobody keeps.
 *
 * The fix has to preserve the gate's meaning, so it cannot simply union old and new: that would
 * hide a genuine withdrawal by the source. The distinction is INSIDE vs OUTSIDE the window the
 * fetcher actually covered:
 *
 *   * outside it — the fetcher never looked, so old rows are carried forward
 *   * inside it  — the new file is authoritative, so a row the source dropped really disappears
 *                  and the audit still reports it
 *
 * The window start is taken from the NEW data's own earliest row rather than from the `--from`
 * argument. That makes it self-describing and immune to exactly the local-time-versus-UTC reasoning
 * that caused the bug: whatever the fetcher actually reached is what defines the boundary.
 */
async function reconcileShards(source, after) {
  const result = { shards_reconciled: [], rows_carried_forward: 0, window_start: null };
  const shards = (after?.files ?? []).filter((f) => String(f.file).endsWith('.ndjson.gz'));
  if (!shards.length) return result;

  // Earliest instant this run actually wrote, across every rewritten shard.
  let windowStart = null;
  const newContent = new Map();
  for (const f of shards) {
    const abs = path.join(DATA, source.dir, f.file);
    let buf;
    try { buf = await fs.readFile(abs); } catch { continue; }
    const lines = zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean);
    newContent.set(f.file, lines);
    for (const line of lines) {
      const ps = JSON.parse(line).period_start;
      if (windowStart === null || ps < windowStart) windowStart = ps;
    }
  }
  if (windowStart === null) return result;
  result.window_start = windowStart;

  for (const f of shards) {
    const abs = path.join(DATA, source.dir, f.file);
    const relPath = rel(abs);
    const beforeBuf = await gitHead(relPath);
    if (!beforeBuf) continue;                        // brand-new shard, nothing to carry forward
    const newLines = newContent.get(f.file);
    if (!newLines) continue;

    const oldLines = zlib.gunzipSync(beforeBuf).toString('utf8').split('\n').filter(Boolean);
    const carried = oldLines.filter((l) => JSON.parse(l).period_start < windowStart);
    if (!carried.length) continue;                   // shard lies wholly inside the window

    const merged = [...carried, ...newLines]
      .map((l) => [JSON.parse(l), l])
      .sort((a, b) => a[0].period_start.localeCompare(b[0].period_start) || rowKey(a[0]).localeCompare(rowKey(b[0])))
      .map(([, l]) => l);
    const gz = zlib.gzipSync(Buffer.from(merged.join('\n') + '\n'), { level: 9 });
    await fs.writeFile(abs, gz);

    const first = JSON.parse(merged[0]);
    const last = JSON.parse(merged.at(-1));
    f.rows = merged.length;
    f.bytes_gz = gz.length;
    f.span = `${first.period_start}..${last.period_end}`;
    f.sha256 = crypto.createHash('sha256').update(gz).digest('hex');
    result.shards_reconciled.push(f.file);
    result.rows_carried_forward += carried.length;
  }
  if (result.shards_reconciled.length && typeof after.rows === 'number') {
    after.rows = after.files.reduce((s, x) => s + (x.rows ?? 0), 0);
  }
  return result;
}

async function runFetcher(source, year) {
  const script = path.join(HERE, source.script);
  const args = [script];
  if (source.window === 'current_year') args.push('--from', `${year}-01`);
  if (source.window === 'current_year_number') args.push('--from', String(year));
  const started = Date.now();
  try {
    const { stdout, stderr } = await exec(process.execPath, args, { cwd: REPO, maxBuffer: 64 * 1024 * 1024, env: process.env });
    return { ok: true, seconds: Math.round((Date.now() - started) / 1000), tail: (stdout + stderr).trim().split('\n').slice(-6).join('\n') };
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
    // Name the failure. A maintenance window, a rate limit and a schema change all fail here and
    // want different operator responses; collapsing them into "fetch failed" throws that away.
    const kind = /SOURCE_UNAVAILABLE|Scheduled maintenance|Service Temporarily Unavailable/i.test(out) ? 'source_unavailable'
      : /HTTP 429|rate.?limit/i.test(out) ? 'rate_limited'
        : /INVALID|schema|validateRow|unhandled resolution/i.test(out) ? 'schema_drift'
          : /ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(out) ? 'network'
            : 'unknown';
    return { ok: false, kind, seconds: Math.round((Date.now() - started) / 1000), tail: out.trim().split('\n').slice(-12).join('\n') };
  }
}

/** Rebuild the summary table and prove it is deterministic by building it twice. */
async function rebuildSummaryTable() {
  const target = path.join(DATA, 'summary-table.json');
  const script = path.join(HERE, 'build-summary-table.mjs');
  const strip = (s) => s.replace(/"built_at": "[^"]*"/g, '"built_at": "<stamp>"');
  try {
    await exec(process.execPath, [script], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
    const first = strip(await fs.readFile(target, 'utf8'));
    await exec(process.execPath, [script], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
    const second = strip(await fs.readFile(target, 'utf8'));
    return { ok: true, deterministic: first === second };
  } catch (e) {
    return { ok: false, error: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`.trim().split('\n').slice(-10).join('\n') };
  }
}

/** Checksums + schema over what is actually on disk. loadDataset throws on any mismatch. */
async function verifyIntegrity(dirs) {
  const { loadDataset } = await import('./loader.mjs');
  const out = {};
  for (const d of dirs) {
    try { const { rows, filesChecked } = await loadDataset(d); out[d] = { ok: true, rows: rows.length, files_checked: filesChecked }; }
    catch (e) { out[d] = { ok: false, error: e.message.slice(0, 400) }; }
  }
  return out;
}

/**
 * Hash the human-owned files so the gate can say what THIS RUN did.
 *
 * The first version compared against `git status`, which reports any uncommitted change including
 * one a human made before the run started. In a clean CI checkout the two are the same thing, but
 * the report would still have claimed "this run modified a human-owned file" about an edit the run
 * did not make — and a gate that misattributes is a gate that gets argued with. Snapshot before,
 * compare after.
 */
async function snapshotHumanOwned() {
  const out = {};
  for (const f of HUMAN_OWNED) {
    try { out[f] = crypto.createHash('sha256').update(await fs.readFile(path.join(REPO, f))).digest('hex'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; out[f] = null; }
  }
  return out;
}

async function humanOwnedUntouched(before) {
  const after = await snapshotHumanOwned();
  const modified = HUMAN_OWNED.filter((f) => before[f] !== after[f]);
  return { ok: modified.length === 0, modified };
}

async function main() {
  const now = new Date();
  const year = Number(arg('year', String(now.getUTCFullYear())));
  const wanted = arg('sources', SOURCES.map((s) => s.name).join(',')).split(',').map((s) => s.trim());
  const sources = SOURCES.filter((s) => wanted.includes(s.name));
  const dryRun = has('dry-run');
  // Snapshot BEFORE any fetcher runs, so the human-owned gate measures this run and not the
  // working tree it inherited.
  const humanOwnedBefore = await snapshotHumanOwned();

  const results = [];
  for (const source of sources) {
    const before = await readManifest(source);
    const cadence = before?.refresh_cadence_months ?? source.cadence_months;
    const last = before?.last_successful_refresh ?? null;
    const dueInDays = last ? Math.round((Date.parse(last) + cadence * 30 * 864e5 - now.getTime()) / 864e5) : -1;

    if (dryRun) {
      results.push({ source: source.name, status: 'dry_run', cadence_months: cadence, last_successful_refresh: last, due_in_days: dueInDays, window: source.window });
      console.log(`${source.name.padEnd(11)} dry-run · cadence ${cadence}m · last ${last ?? 'never'} · ${source.window}`);
      continue;
    }

    process.stdout.write(`${source.name.padEnd(11)} fetching (${source.window})… `);
    const run = await runFetcher(source, year);
    if (!run.ok) {
      results.push({ source: source.name, status: 'failed', failure_kind: run.kind, seconds: run.seconds, cadence_months: cadence, last_successful_refresh: last, detail: run.tail });
      console.log(`FAILED (${run.kind}, ${run.seconds}s)`);
      continue;
    }

    const after = await readManifest(source);
    // MERGE the manifest before auditing it. This is the second half of the incremental-refresh
    // trap and it is not obvious: the E0 fetchers build `files` from WHAT THIS RUN FETCHED, so a
    // windowed re-fetch writes a manifest listing only the current year's shards. The earlier
    // shards stay on disk but stop being listed — and `loadDataset` reads the manifest, so the
    // dataset would silently shrink to one year while every checksum still passed and every gate
    // still went green. Year-sharding stopped the FILES being rewritten; this stops the manifest
    // forgetting them.
    // ORDER MATTERS, and getting it wrong silently disabled the fix. Reconcile FIRST, while
    // `after.files` still lists only what the fetcher actually wrote: `reconcileShards` derives the
    // refresh window from the earliest row across those files, and if the carried-forward shards
    // from earlier years were already in the list the window would be computed as 2020 and every
    // shard would look wholly inside it — reconciling nothing, exactly as before.
    const reconciled = await reconcileShards(source, after);
    const preserved = await mergeManifestFiles(source, before, after);
    // The audit runs last, so it grades what will actually be committed rather than the fetcher's
    // raw windowed output.
    const audit = await appendOnlyAudit(source, after);
    if (preserved.missing.length) {
      audit.anomalies.push({
        kind: 'shard_vanished', file: preserved.missing.join(', '),
        consequence: 'A shard listed in the previous manifest is no longer on disk. The refresh window did not cover it, so nothing should have removed it. Do not merge: the dataset has lost history.',
      });
    }
    const status = audit.anomalies.length ? 'anomaly' : (audit.files_changed.length || audit.files_new.length) ? 'ok' : 'no_change';

    // The manifest is ALWAYS written when a fetch succeeded, because it must describe what is
    // actually on disk — an earlier version skipped the write on anomaly and left a manifest
    // listing two shards beside seven files, which is a worse state than the anomaly it was
    // avoiding. What the anomaly withholds is only `last_successful_refresh`: stamping that on a
    // bad run would make the staleness surface lie in the one situation it exists for, and a
    // source that quietly stopped publishing would read as fresh forever.
    if (after) {
      after.refresh_cadence_months = cadence;
      if (status !== 'anomaly') after.last_successful_refresh = now.toISOString();
      // The fetcher already wrote through `writeManifest`, so `after` is the preserved manifest
      // read back off disk. Writing it again through the same path is deliberate and safe:
      // `preserveAcquisitionMetadata` is idempotent, and this second pass is what carries the
      // reconciled shard list and the two orchestrator-owned stamps above.
      await writeManifest({
        dir: path.dirname(manifestPath(source)), file: path.basename(manifestPath(source)),
        manifest: after, window: source.window, dataset: source.name,
      });
    }

    results.push({
      source: source.name, status, seconds: run.seconds, cadence_months: cadence,
      last_successful_refresh: status === 'anomaly' ? last : now.toISOString(),
      rows_total: after?.rows ?? null,
      rows_added: audit.rows_added,
      files_changed: audit.files_changed, files_new: audit.files_new, files_unchanged: audit.files_unchanged,
      manifest_entries_carried_forward: preserved.preserved.length,
      shards_reconciled: reconciled.shards_reconciled,
      rows_carried_forward: reconciled.rows_carried_forward,
      refresh_window_start: reconciled.window_start,
      anomalies: audit.anomalies,
    });
    console.log(`${status}${audit.rows_added ? ` · +${audit.rows_added} rows` : ''}${audit.anomalies.length ? ` · ${audit.anomalies.length} ANOMALY` : ''} (${run.seconds}s)`);
  }

  if (dryRun) { console.log('\ndry run — nothing fetched, nothing written'); return; }

  console.log('\nrebuilding summary table…');
  const table = await rebuildSummaryTable();
  const integrity = await verifyIntegrity(sources.filter((s) => !['fx', 'calendar'].includes(s.name)).map((s) => s.dir));
  const humanOwned = await humanOwnedUntouched(humanOwnedBefore);

  const failed = results.filter((r) => r.status === 'failed');
  const anomalous = results.filter((r) => r.status === 'anomaly');
  const integrityFailed = Object.entries(integrity).filter(([, v]) => !v.ok);
  const gatesPass = !failed.length && !anomalous.length && !integrityFailed.length
    && table.ok && table.deterministic && humanOwned.ok;

  const report = {
    artifact: 'mature-market evidence-base refresh report',
    phase: '36.E0.1',
    refreshed_at: now.toISOString(),
    year_window: year,
    gates_pass: gatesPass,
    gates: {
      all_sources_served: !failed.length,
      append_only: !anomalous.length,
      checksums_and_schema: !integrityFailed.length,
      summary_table_rebuilds: table.ok,
      summary_table_deterministic: table.ok ? table.deterministic : null,
      human_owned_files_untouched: humanOwned.ok,
    },
    human_owned_files: HUMAN_OWNED,
    human_owned_modified: humanOwned.modified,
    summary_table: table,
    integrity,
    sources: results,
    totals: {
      rows_added: results.reduce((s, r) => s + (r.rows_added ?? 0), 0),
      sources_ok: results.filter((r) => r.status === 'ok').length,
      sources_no_change: results.filter((r) => r.status === 'no_change').length,
      sources_failed: failed.length,
      sources_anomalous: anomalous.length,
    },
  };
  await fs.writeFile(path.join(REPORT_DIR, 'refresh-report.json'), JSON.stringify(report, null, 1) + '\n');
  await fs.writeFile(path.join(REPORT_DIR, 'refresh-report.md'), renderReport(report));

  console.log(`\n${report.totals.rows_added} rows added · ${report.totals.sources_ok} ok · ${report.totals.sources_no_change} unchanged · ${report.totals.sources_failed} failed · ${report.totals.sources_anomalous} anomalous`);
  console.log(`gates: ${gatesPass ? 'PASS' : 'FAIL'} — ${Object.entries(report.gates).filter(([, v]) => v === false).map(([k]) => k).join(', ') || 'all green'}`);
  console.log(`report: ${rel(path.join(REPORT_DIR, 'refresh-report.md'))}`);
  if (!gatesPass) process.exitCode = 1;
}

function renderReport(r) {
  const L = [];
  L.push(`# Evidence-base refresh — ${r.refreshed_at.slice(0, 10)}`);
  L.push('');
  L.push(`**Gates: ${r.gates_pass ? 'PASS' : 'FAIL'}** · ${r.totals.rows_added} rows added · ${r.totals.sources_ok} served, ${r.totals.sources_no_change} unchanged, ${r.totals.sources_failed} failed, ${r.totals.sources_anomalous} anomalous.`);
  L.push('');
  // Anything not ok leads. A refresh report whose bad news is below the fold is a report that
  // gets skimmed and merged.
  const bad = r.sources.filter((s) => s.status === 'failed' || s.status === 'anomaly');
  if (bad.length) {
    L.push('## Needs a decision before merge');
    L.push('');
    for (const s of bad) {
      if (s.status === 'failed') {
        L.push(`### \`${s.source}\` — FAILED (${s.failure_kind})`);
        L.push('');
        L.push('```');
        L.push(s.detail ?? '');
        L.push('```');
        L.push(`Last successful refresh: ${s.last_successful_refresh ?? 'never'}.`);
      } else {
        L.push(`### \`${s.source}\` — APPEND-ONLY ANOMALY`);
        L.push('');
        for (const a of s.anomalies) {
          L.push(`**${a.kind}** in \`${a.file}\`${a.n_removed ? ` — ${a.n_removed} rows` : ''}`);
          L.push('');
          L.push(a.consequence);
          L.push('');
          L.push('```json');
          L.push(JSON.stringify(a.examples, null, 1));
          L.push('```');
        }
      }
      L.push('');
    }
  }
  L.push('## Per source');
  L.push('');
  L.push('| Source | Status | Rows total | Rows added | Files changed | New | Unchanged | Cadence | Last success |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of r.sources) {
    L.push(`| \`${s.source}\` | ${s.status === 'ok' ? 'ok' : `**${s.status}**`} | ${s.rows_total ?? '—'} | ${s.rows_added ?? 0} | ${(s.files_changed ?? []).length} | ${(s.files_new ?? []).length} | ${s.files_unchanged ?? 0} | ${s.cadence_months}m | ${(s.last_successful_refresh ?? 'never').slice(0, 10)} |`);
  }
  L.push('');
  L.push('## Gates');
  L.push('');
  L.push('| Gate | Result |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(r.gates)) L.push(`| ${k} | ${v === null ? '—' : v ? 'PASS' : '**FAIL**'} |`);
  L.push('');
  if (!r.gates.human_owned_files_untouched) {
    L.push(`**Human-owned files were modified:** ${r.human_owned_modified.join(', ')}. This run may not do that; revert before merging.`);
    L.push('');
  }
  L.push('## Integrity (checksums + schema, read from disk)');
  L.push('');
  if (!Object.keys(r.integrity).length) {
    L.push('No NDJSON dataset was in scope this run, so there was nothing to checksum. `fx` and');
    L.push('`calendar` are not row-schema datasets and are verified by their own fetchers.');
  } else {
    L.push('| Dataset | Result | Rows | Files checked |');
    L.push('|---|---|---|---|');
    for (const [k, v] of Object.entries(r.integrity)) L.push(`| ${k} | ${v.ok ? 'PASS' : `**FAIL** — ${v.error}`} | ${v.rows ?? '—'} | ${v.files_checked ?? '—'} |`);
  }
  L.push('');
  L.push('## What this run did not do');
  L.push('');
  L.push('- It did not touch `docs/research/mature-market-comparability.md` or any other human-owned analysis. That file is a judgement about which market is a valid analogue for which service, and no scheduled job gets to revise it.');
  L.push('- It did not recompute structural-break segmentation and did not add events to the break calendar. New rows after a known break are data; deciding what a break means is 36.E1-E6\'s work.');
  L.push('- It did not commit or push. A human merges this.');
  L.push('');
  return L.join('\n');
}

await main();

// TEMPORARY 36.E0.3 GATE-FAILABILITY INJECTION — reverted in the next commit.
process.exitCode = 1;
