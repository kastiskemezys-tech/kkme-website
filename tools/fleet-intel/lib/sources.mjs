// Phase 37.B.1 — source acquisition for the lifecycle detector runner.
//
// One rule governs this file: REACHABILITY IS RECORDED SEPARATELY FROM FINDINGS.
//
// B11 is the paid-for reason. A source that returns "no match" tells you about
// reality only if you have first proven the probe works. Every acquisition below
// therefore returns `{reachable, fetched_at, error, stats}` alongside its data, and
// a source that could not be reached yields `reachable:false` — never an empty
// array that a downstream count would render as "nothing happened".
//
// The second rule: NOTHING HERE DECIDES ANYTHING. These functions fetch and parse.
// The interpreter (lifecycle.mjs) decides. Keeping the split means a source going
// dark changes a reachability flag, not a verdict.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildIndex as buildLvIndex, REGISTER_CSV, NAME_HISTORY_CSV, LV_REGISTER_FILE_URL } from './lv-register.mjs';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');

export const FLEET_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/fleet';
export const SNAPSHOT_DIR = path.join(ROOT, '.cache/fleet-lifecycle');

/** The VPS is where the daily VERT and lv_press artifacts land (control-center pipeline). */
export const VPS_HOST = 'root@89.167.124.42';
export const VPS_PROCESSED = '/opt/kkme/processed';

const nowIso = () => new Date().toISOString();

/**
 * The public fleet DB — the population whose status a retirement would actually
 * change. Fetched from the live worker rather than a cached copy: a stale snapshot
 * would make every disappearance diff a lie (A3).
 */
export async function acquirePublicFleet({ url = FLEET_URL } = {}) {
  const out = { key: 'public_fleet', reachable: false, fetched_at: nowIso(), entries: [], stats: {} };
  try {
    const res = await fetch(url);
    if (!res.ok) { out.error = `http ${res.status}`; return out; }
    const j = await res.json();
    const entries = Array.isArray(j.raw_entries) ? j.raw_entries : [];
    // A 200 carrying no entries is a broken fetch presenting as an empty fleet.
    // It is reported as unreachable, not as a fleet that lost every project.
    if (entries.length === 0) { out.error = '200 with zero raw_entries — treating as unreachable, not as an empty fleet'; return out; }
    out.reachable = true;
    out.entries = entries;
    out.stats = { entries: entries.length, updated_at: j.updated_at ?? null };
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
}

/**
 * Latvian Uzņēmumu reģistrs bulk open data.
 *
 * `refresh` re-downloads when the upstream Last-Modified is newer than the local
 * copy. The download is 128 MB, so the default is to use the cache and REPORT its
 * age rather than to pretend the cache is live.
 */
export async function acquireLvRegister({ refresh = false, registerPath = REGISTER_CSV, historyPath = NAME_HISTORY_CSV } = {}) {
  const out = { key: 'lv_ur_opendata', reachable: false, fetched_at: nowIso(), index: null, stats: {} };
  try {
    if (refresh) {
      const head = await fetch(LV_REGISTER_FILE_URL, { method: 'HEAD' });
      if (!head.ok) { out.error = `upstream HEAD http ${head.status}`; return out; }
      const upstream = Date.parse(head.headers.get('last-modified') || '') || 0;
      const localMs = fs.existsSync(registerPath) ? fs.statSync(registerPath).mtimeMs : 0;
      if (upstream > localMs) {
        const res = await fetch(LV_REGISTER_FILE_URL);
        if (!res.ok) { out.error = `download http ${res.status}`; return out; }
        fs.mkdirSync(path.dirname(registerPath), { recursive: true });
        fs.writeFileSync(registerPath, Buffer.from(await res.arrayBuffer()));
        out.refreshed = true;
      }
    }
    if (!fs.existsSync(registerPath)) {
      out.error = `register not present at ${registerPath} — run with --refresh-register`;
      return out;
    }
    const index = await buildLvIndex({ registerPath, historyPath });
    out.reachable = true;
    out.index = index;
    out.stats = {
      ...index.stats,
      terminated_share: index.stats.entities ? index.stats.terminated / index.stats.entities : null,
      register_mtime: new Date(fs.statSync(registerPath).mtime).toISOString(),
      history_present: fs.existsSync(historyPath),
    };
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
}

/**
 * Read a daily artifact off the VPS.
 *
 * The control-center pipeline (cron_daily.sh, 06:00 UTC) writes VERT and lv_press
 * JSON to /opt/kkme/processed. Those files are the ONLY copy — they are not in this
 * repo and not in KV — so a host that cannot reach the VPS genuinely cannot run
 * those detectors. That is reported as `reachable:false`, which is loudly different
 * from a detector that ran and found nothing.
 */
async function readVpsJson(prefix, { host = VPS_HOST, dir = VPS_PROCESSED, localOverride = null } = {}) {
  if (localOverride) {
    return { ok: true, via: 'local-override', body: fs.readFileSync(localOverride, 'utf8'), name: path.basename(localOverride) };
  }
  const { stdout } = await execFileP('ssh', [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host,
    `f=$(ls -1 ${dir}/${prefix}_*.json 2>/dev/null | tail -1); [ -n "$f" ] && echo "__NAME__$(basename $f)" && cat "$f"`,
  ], { maxBuffer: 64 * 1024 * 1024 });
  const m = /^__NAME__(.+)\n/.exec(stdout);
  if (!m) return { ok: false, error: `no ${prefix}_*.json found under ${dir}` };
  return { ok: true, via: 'ssh', name: m[1], body: stdout.slice(m[0].length) };
}

/** VERT monthly permit register (LT), as parsed by the control-center scraper. */
export async function acquireVert(opts = {}) {
  const out = { key: 'vert_monthly', reachable: false, fetched_at: nowIso(), records: [], stats: {} };
  try {
    const r = await readVpsJson('vert', opts);
    if (!r.ok) { out.error = r.error; return out; }
    const parsed = JSON.parse(r.body);
    const records = Array.isArray(parsed) ? parsed : (parsed.records || []);
    out.reachable = true;
    out.via = r.via;
    out.records = records;
    out.stats = {
      file: r.name,
      permits_parsed: records.length,
      with_expiry: records.filter((x) => x && x.permit_expiry).length,
    };
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
}

/** lv_press discovery tripwire (LV), as written by the control-center scraper. */
export async function acquireLvPress(opts = {}) {
  const out = { key: 'lv_press_tripwire', reachable: false, fetched_at: nowIso(), candidates: [], stats: {} };
  try {
    const r = await readVpsJson('lv_press', opts);
    if (!r.ok) { out.error = r.error; return out; }
    const parsed = JSON.parse(r.body);
    out.reachable = true;
    out.via = r.via;
    out.candidates = Array.isArray(parsed.projects) ? parsed.projects : [];
    out.stats = {
      file: r.name,
      scraped_at: parsed.scraped_at ?? null,
      items_scanned: parsed.items_scanned ?? null,
      candidates_found: parsed.candidates_found ?? out.candidates.length,
      feeds_scanned: parsed.feeds_scanned ?? [],
    };
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
}

/**
 * Previous TSO-queue snapshot, for the disappearance diff.
 *
 * There has never been one: nothing in this repo or in KV stores a prior fleet
 * snapshot (`grep -on "KKME_SIGNALS.put('[a-z0-9_:]*'" workers/fetch-s1.js` lists
 * `s4_fleet` and no `_prev` sibling). The first run therefore ESTABLISHES the
 * baseline and the detector cannot fire — which is reported as exactly that, and
 * never as "no project disappeared".
 */
export function loadPreviousSnapshot({ dir = SNAPSHOT_DIR } = {}) {
  const out = { key: 'queue_snapshot', reachable: false, fetched_at: nowIso(), ids: [], stats: {} };
  try {
    if (!fs.existsSync(dir)) { out.error = 'no snapshot directory — first run establishes the baseline'; return out; }
    const files = fs.readdirSync(dir).filter((f) => /^snapshot-.*\.json$/.test(f)).sort();
    if (!files.length) { out.error = 'no prior snapshot — first run establishes the baseline'; return out; }
    const prev = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
    out.reachable = true;
    out.ids = Array.isArray(prev.ids) ? prev.ids : [];
    out.stats = { file: files[files.length - 1], taken_at: prev.taken_at ?? null, rows: out.ids.length };
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  }
}

/** Write this run's snapshot. NOT a status write — it records what the queue held. */
export function writeSnapshot(entries, { dir = SNAPSHOT_DIR, at = null } = {}) {
  const taken_at = at || nowIso();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `snapshot-${taken_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ taken_at, ids: entries.map((e) => e.id), rows: entries.length }, null, 2));
  return file;
}
