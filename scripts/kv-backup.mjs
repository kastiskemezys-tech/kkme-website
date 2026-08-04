/**
 * Phase 50 — export/restore for the KV classes that exist only in KV.
 *
 * The platform's whole state lives in one Cloudflare KV namespace and there has
 * never been an export, so there has never been a restore to test. This is that
 * export, and `--restore` plus `--verify` are what make it a backup rather than
 * a pile of files.
 *
 * ── The tiering, and why it is not "back up everything" ────────────────────
 *
 * Most of the namespace is RE-DERIVABLE and does not need protecting: `s1`,
 * `s2`, `s3`…`s9` are recomputed by cron within hours; `raw:*` carries a 7-day
 * TTL and is forensic; `s2_daily_clearing` is re-derivable from BTD, which was
 * checked rather than assumed (see the note below). What cannot be re-fetched
 * is the WRITE-STAMPED and OPERATOR-AUTHORED material: what we published on a
 * given day, what a human curated, what a counterparty sent us.
 *
 * ── s2_daily_clearing: a correction to an earlier finding ──────────────────
 *
 * Phase 48 reported that BTD's window slides forward one day per day, so the
 * archive was losing a day of recoverability daily. **That was wrong.** Probing
 * the same absolute dates on 2026-08-03 and 2026-08-04 returns identical
 * coverage (2025-09-29 → 8 %, 2025-09-30 → 25 %, 2025-10-01 → 100 % on both
 * days). The boundary is a fixed DATA START at 2025-10-01, not a rolling
 * retention window, and the ramp below it is products coming online rather than
 * decay. So the series is re-derivable and stays so. It is still exported here,
 * because "re-derivable from a single source that has had outages" is a recovery
 * plan, not a backup — but it is not on a clock, and this file says so rather
 * than letting the earlier urgency stand uncorrected.
 *
 * ── The private tier ──────────────────────────────────────────────────────
 *
 * `fleet_private:*` must never land anywhere public. It is routed to a
 * gitignored directory by construction, the public manifest never names a
 * private key, and `kvBackup.test.ts` asserts both. (As of 2026-08-04 the
 * namespace holds ZERO `fleet_private:*` keys — the tier is wired before it is
 * populated, deliberately, because wiring it afterwards is how leaks happen.)
 *
 *   node scripts/kv-backup.mjs --out <dir>            export
 *   node scripts/kv-backup.mjs --verify <dir>         re-hash and compare
 *   node scripts/kv-backup.mjs --restore <dir> --namespace-id <id>   restore
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const NAMESPACE_ID = '323b493a50764b24b88a8b4a5687a24b';

/**
 * ── Where the backup is allowed to live, and why it is NOT in the repo ──────
 *
 * The first version of this tool wrote the bulk of the export to `data/kv-backup`
 * and a weekly Action committed it. The NDA gate refused that commit, and it was
 * right for a reason worth writing down, plus a worse one it could not see:
 *
 *  1. **What the gate caught.** Six needle hits inside the BTD clearing prices.
 *     They are coincidences — a contracted figure equal, to the cent, to a public
 *     market clearing price — but that is the point: a large public NUMERIC corpus
 *     will collide with numeric needles sooner or later, and the gate cannot tell
 *     a coincidence from a disclosure. Committing such a corpus makes the gate
 *     permanently red or permanently weakened, and weakening a disclosure gate to
 *     land a commit is the worst available trade.
 *
 *  2. **What the gate could NOT catch, and matters more.** `contact_submissions`
 *     holds inbound enquiries — name, email address, company and free-text message
 *     for real people. **This repository is public** (`gh repo view` →
 *     `isPrivate: false`, re-checked 2026-08-04). Committing the export would have
 *     published third-party personal data. No needle covers that, because needles
 *     are counterparty names and contracted figures, not arbitrary people's email
 *     addresses.
 *
 * So: **the whole backup is gitignored. None of it is committed.** The offsite
 * copy belongs in an object store; see the runbook for the R2 proposal and the
 * credentials it needs. `RESTRICTED_OUT` exists so the private-tier separation is
 * still explicit inside that tree.
 */
export const BACKUP_ROOT = join(ROOT, 'docs/_private/kv-backup');
export const PUBLIC_OUT = join(BACKUP_ROOT, 'general');
export const PRIVATE_OUT = join(BACKUP_ROOT, 'private');

/**
 * What gets backed up, and the reason each class cannot simply be re-fetched.
 * `prefix: true` means every key starting with `key`.
 */
export const CLASSES = [
  // ── operator-authored / inbound: no other copy exists anywhere ───────────
  { key: 'contact_submissions', tier: 'public', why: 'inbound enquiries — no second copy in any system' },
  { key: 's4_manual_additions', tier: 'public', why: 'operator-curated fleet additions' },
  { key: 's4_buildability', tier: 'public', why: 'operator-curated buildability assertions' },
  { key: 's3_editorial', tier: 'public', why: 'operator-authored editorial' },
  { key: 'fleet_lifecycle:', prefix: true, tier: 'public', why: 'observed transitions — a register that has since changed cannot re-yield them' },

  // ── write-stamped series: the value is re-computable, the RECORD is not ──
  // These say "this is what we published on day D". Re-deriving the numbers
  // does not re-derive that claim, and the platform's product is auditability.
  { key: 's1_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's1_capture_history', tier: 'public', why: 'write-stamped; values re-derivable from ENTSO-E, the record is not' },
  { key: 's2_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's2_btd_history', tier: 'public', why: 'rolling means stamped with the WRITE date' },
  { key: 's3_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's4_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's6_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's7_history', tier: 'public', why: 'write-stamped published series' },
  { key: 's9_history', tier: 'public', why: 'write-stamped published series' },
  { key: 'baltic_storage_index_history', tier: 'public', why: 'write-stamped index history' },
  { key: 's2_rolling_180d', tier: 'public', why: 'accumulated window' },
  { key: 's2_capacity_watch:', prefix: true, tier: 'public', why: 'daily accumulator over s2 snapshots — point-in-time, not reconstructible' },

  // ── the published intel record ──────────────────────────────────────────
  { key: 'curations:index', tier: 'public', why: 'curation index' },
  { key: 'curation:', prefix: true, tier: 'public', why: 'curated items; upstream DB retention is not guaranteed' },
  { key: 'feed_', prefix: true, tier: 'public', why: 'published feed + hand-pushed events that exist nowhere else' },

  // ── point-in-time source captures used for change detection ─────────────
  { key: 'litgrid_watch:', prefix: true, tier: 'public', why: 'page snapshots — the live pages have moved on' },

  // ── the archive the phase was called for ────────────────────────────────
  { key: 's2_daily_clearing', tier: 'public', why: 're-derivable from BTD (fixed start 2025-10-01) but single-sourced' },

  // ── trading record ──────────────────────────────────────────────────────
  { key: 'trading:', prefix: true, tier: 'public', why: 'daily signals + raw captures, write-stamped' },

  // ── PRIVATE TIER — never public ─────────────────────────────────────────
  { key: 'fleet_private:', prefix: true, tier: 'private', why: 'private-tier fleet intel; NEVER leaves a gitignored path' },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Filesystem-safe name for a KV key, reversibly encoded. */
export const safeName = (key) => encodeURIComponent(key).replace(/\*/g, '%2A');
export const unsafeName = (name) => decodeURIComponent(name);

function wrangler(args, { capture = true } = {}) {
  return new Promise((res) => {
    const p = spawn('npx', ['wrangler', ...args], { cwd: ROOT, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    const out = []; const err = [];
    if (capture) p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('close', (code) => res({ code, out: Buffer.concat(out), err: Buffer.concat(err).toString() }));
  });
}

export async function listKeys(prefix, nsId = NAMESPACE_ID) {
  const r = await wrangler(['kv', 'key', 'list', '--namespace-id', nsId, '--remote', '--prefix', prefix]);
  if (r.code !== 0) throw new Error(`list ${prefix}: ${r.err.slice(0, 300)}`);
  const txt = r.out.toString().trim();
  if (!txt) return [];
  try { return JSON.parse(txt).map((k) => k.name); } catch { return []; }
}

async function getValue(key, nsId = NAMESPACE_ID) {
  const r = await wrangler(['kv', 'key', 'get', key, '--namespace-id', nsId, '--remote']);
  if (r.code !== 0) return null;
  return r.out;
}

/**
 * Retries are not defensive padding — they were earned. The first full restore
 * into a scratch namespace put 1130 of 1131 keys and dropped
 * `curation:mrbo9pz1-2ryt2q` to a transient error; the identical command
 * succeeded on the next attempt. A restore tool without retry loses keys
 * silently at scale, and a restore that silently loses one key in a thousand is
 * exactly the kind of backup that reads as working until the day it matters.
 */
async function putValue(key, buf, nsId, { attempts = 4 } = {}) {
  const tmp = join('/tmp', `kvput-${process.pid}-${Math.abs(hashInt(key))}`);
  writeFileSync(tmp, buf);
  for (let i = 1; i <= attempts; i++) {
    const r = await wrangler(['kv', 'key', 'put', key, '--path', tmp, '--namespace-id', nsId, '--remote'], { capture: false });
    if (r.code === 0) return true;
    if (i < attempts) await new Promise((res) => setTimeout(res, 400 * i));
  }
  return false;
}
const hashInt = (s) => [...s].reduce((a, c) => ((a * 31 + c.charCodeAt(0)) | 0), 7);

/** Run `fn` over `items` with bounded concurrency. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

// ─── export ─────────────────────────────────────────────────────────────────

async function runExport(outBase) {
  const publicDir = outBase ? join(outBase, 'public') : PUBLIC_OUT;
  const privateDir = outBase ? join(outBase, 'private') : PRIVATE_OUT;

  const resolved = [];
  for (const c of CLASSES) {
    const keys = c.prefix ? await listKeys(c.key) : [c.key];
    for (const k of keys) resolved.push({ key: k, tier: c.tier, why: c.why, class: c.key });
  }
  console.log(`resolved ${resolved.length} keys across ${CLASSES.length} classes`);

  const entries = [];
  let skipped = 0;
  await pool(resolved, 8, async (r) => {
    const buf = await getValue(r.key);
    if (buf === null || buf.length === 0) { skipped++; return; }
    const dir = r.tier === 'private' ? privateDir : publicDir;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, safeName(r.key)), buf);
    entries.push({ key: r.key, class: r.class, tier: r.tier, bytes: buf.length, sha256: sha256(buf), why: r.why });
  });

  entries.sort((a, b) => a.key.localeCompare(b.key));
  const pub = entries.filter((e) => e.tier === 'public');
  const priv = entries.filter((e) => e.tier === 'private');

  // The PUBLIC manifest must not name a private key — not the key, not the
  // class, not the count-by-name. It records only that a private tier exists.
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'MANIFEST.json'), `${JSON.stringify({
    _what: 'KV export manifest — general tier. The whole backup lives under a gitignored path and is never committed: it carries third-party personal data (contact_submissions) and this repository is public. Private-tier keys are separated again below and are deliberately not named here.',
    namespace_id: NAMESPACE_ID,
    key_count: pub.length,
    total_bytes: pub.reduce((a, e) => a + e.bytes, 0),
    private_tier_present: priv.length > 0,
    keys: pub,
  }, null, 2)}\n`);

  if (priv.length) {
    mkdirSync(privateDir, { recursive: true });
    writeFileSync(join(privateDir, 'MANIFEST.json'), `${JSON.stringify({
      _what: 'PRIVATE TIER — never commit, never publish.',
      namespace_id: NAMESPACE_ID, key_count: priv.length, keys: priv,
    }, null, 2)}\n`);
  }

  console.log(`public:  ${pub.length} keys, ${(pub.reduce((a, e) => a + e.bytes, 0) / 1024).toFixed(0)} KiB → ${publicDir}`);
  console.log(`private: ${priv.length} keys → ${priv.length ? privateDir : '(none present)'}`);
  if (skipped) console.log(`skipped: ${skipped} key(s) absent or empty`);
  return { publicDir, privateDir, pub, priv };
}

// ─── verify ─────────────────────────────────────────────────────────────────

export function verifyDir(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  const bad = [];
  for (const e of manifest.keys) {
    const p = join(dir, safeName(e.key));
    if (!existsSync(p)) { bad.push({ key: e.key, why: 'file missing' }); continue; }
    const buf = readFileSync(p);
    if (buf.length !== e.bytes) { bad.push({ key: e.key, why: `bytes ${buf.length} != ${e.bytes}` }); continue; }
    if (sha256(buf) !== e.sha256) bad.push({ key: e.key, why: 'sha256 mismatch' });
  }
  // A file present on disk but absent from the manifest is also a fault: it
  // means the manifest does not describe the directory it claims to describe.
  const named = new Set(manifest.keys.map((e) => safeName(e.key)));
  for (const f of readdirSync(dir)) {
    if (f === 'MANIFEST.json') continue;
    if (!named.has(f)) bad.push({ key: unsafeName(f), why: 'on disk but not in the manifest' });
  }
  return { total: manifest.keys.length, bad };
}

// ─── verify-restore: read back from the restored namespace ──────────────────

/**
 * Read every key OUT of a namespace and compare its sha256 to the manifest.
 *
 * `restored N/N` is the tool reporting on itself. This asks the other side what
 * it actually holds. Two things were learned the first time it ran, and both are
 * encoded here rather than remembered:
 *
 *  1. **KV is eventually consistent.** The first read-back reported
 *     `curation:mrbo9o5b-4yns92` MISSING on a key the restore had reported as
 *     written — and the same key read back correct, at the correct byte length,
 *     minutes later. A verification that reads immediately after a write
 *     measures propagation, not durability. This is C8's post-deploy edge
 *     window in a different costume, so misses are re-read after a delay before
 *     being called missing.
 *  2. A single read is never evidence. A key is only reported missing after it
 *     has failed `attempts` reads spread over the propagation window.
 */
export async function verifyRestore(dir, nsId, { concurrency = 8, attempts = 3, delayMs = 20000, log = console.log } = {}) {
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  let pending = manifest.keys.slice();
  const mismatched = [];
  let matched = 0;

  for (let attempt = 1; attempt <= attempts && pending.length; attempt++) {
    if (attempt > 1) {
      log(`  ${pending.length} key(s) not yet visible — waiting ${delayMs / 1000}s for KV propagation (attempt ${attempt}/${attempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const stillPending = [];
    await pool(pending, concurrency, async (e) => {
      const r = await wrangler(['kv', 'key', 'get', e.key, '--namespace-id', nsId, '--remote']);
      if (r.code !== 0 || r.out.length === 0) { stillPending.push(e); return; }
      if (sha256(r.out) === e.sha256) matched++;
      else mismatched.push({ key: e.key, expected: e.sha256, got: sha256(r.out), bytes: [e.bytes, r.out.length] });
    });
    pending = stillPending;
  }

  return { total: manifest.keys.length, matched, missing: pending.map((e) => e.key), mismatched };
}

// ─── restore ────────────────────────────────────────────────────────────────

async function runRestore(dir, nsId) {
  if (!nsId) throw new Error('--namespace-id is required for a restore');
  if (nsId === NAMESPACE_ID) {
    throw new Error('refusing to restore over the PRODUCTION namespace from this tool — pass a scratch namespace id');
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  console.log(`restoring ${manifest.keys.length} keys into ${nsId}`);
  let ok = 0; const failed = [];
  await pool(manifest.keys, 8, async (e) => {
    const buf = readFileSync(join(dir, safeName(e.key)));
    if (await putValue(e.key, buf, nsId)) ok++; else failed.push(e.key);
  });
  console.log(`restored ${ok}/${manifest.keys.length}${failed.length ? `, FAILED: ${failed.slice(0, 5).join(', ')}` : ''}`);
  return { ok, failed };
}

// ─── entry ──────────────────────────────────────────────────────────────────

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  try {
    if (argv.includes('--verify-restore')) {
      const dir = arg('--verify-restore');
      const r = await verifyRestore(dir, arg('--namespace-id'));
      console.log(`matched ${r.matched}/${r.total} · missing ${r.missing.length} · mismatched ${r.mismatched.length}`);
      for (const m of r.mismatched.slice(0, 8)) console.error(`  ${m.key}: bytes ${m.bytes[0]} -> ${m.bytes[1]}`);
      for (const k of r.missing.slice(0, 8)) console.error(`  MISSING ${k}`);
      const ok = r.matched === r.total && !r.missing.length && !r.mismatched.length;
      console.log(ok
        ? 'RESTORE VERIFIED — every key read back from the restored namespace hashes identically to the backup'
        : 'RESTORE NOT VERIFIED');
      process.exit(ok ? 0 : 1);
    } else if (argv.includes('--verify')) {
      const dir = arg('--verify');
      const r = verifyDir(dir);
      if (r.bad.length) {
        console.error(`VERIFY FAILED — ${r.bad.length} of ${r.total}`);
        for (const b of r.bad.slice(0, 10)) console.error(`  ${b.key}: ${b.why}`);
        process.exit(1);
      }
      console.log(`VERIFY OK — ${r.total} keys, every sha256 matches`);
    } else if (argv.includes('--restore')) {
      await runRestore(arg('--restore'), arg('--namespace-id'));
    } else {
      await runExport(arg('--out'));
    }
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(2);
  }
}
