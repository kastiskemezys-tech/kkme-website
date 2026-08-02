// The trailing-edge lag. Filed by 36.E0.3, applied here in 36.E1+E2's step 0.
//
// WHY. The 2026-08 refresh tripped the append-only gate twice, and both anomalies had the same
// benign cause. `se`: 72 restated rows, all one delivery day (2026-07-31), because the previous
// fetch at 2026-07-30T10:35:31Z ran BEFORE Svenska kraftnät's D-1 auction for that day — the
// stored tranche was one of two, and the second one merged into it a month later. `da`: 96 of the
// 191 restatements were the same delivery day, our fetch having preceded DE_LU day-ahead
// publication. Neither is a data defect. Both are the refresh reading a market that had not
// finished publishing, storing a provisional value, and being surprised when the market finished.
//
// This recurs EVERY month by construction. Left alone, September reproduces August's two red
// flags for the same benign reason, and a gate that fires every scheduled run is a gate the
// operator learns to wave through — which is worse than not having it (B7).
//
// THE RULE, and the one thing it must never do. A row is withheld only when it is BOTH
//
//   (a) inside the trailing window — period_start at or after (now − LAG_DAYS), and
//   (b) not already committed — its key is absent from the shard's committed predecessor.
//
// Condition (b) is load-bearing and is the difference between a lag and a data loss. Withholding
// rows the previous run already published would SHRINK coverage, which is exactly the anomaly the
// append-only gate exists to catch — this fix would then be firing the alarm it was written to
// silence. So already-published rows are kept, restatements of them still surface as
// `history_restated`, and the lag only ever declines to ingest something NEW that the market has
// not finished settling.
//
// WHAT IT DOES NOT DO. It does not drop data: withheld rows are re-fetched next run, by which time
// the market has published, and they land as ordinary appends. It does not adjudicate values — a
// restatement of already-stored history is still an event an operator reads. And it does not make
// the gate quieter about anything real; it removes one specific, diagnosed, recurring false
// positive and leaves everything else exactly as loud.
//
// SURFACING (B8). A silent skip that nobody sees is how a source stops publishing without anyone
// noticing. Every run reports its cutoff and the per-source withheld count, and the report renders
// them even when zero — a withheld count is a positive statement about what the run chose not to
// take, not an absence.

import zlib from 'node:zlib';
import crypto from 'node:crypto';

/**
 * Days of publication lag excluded from every refresh.
 *
 * 2 days, and the reason it is 2 rather than 1: the observed misses were D-1 auctions for a
 * delivery day whose window opens the evening before, so a 1-day lag still catches a market
 * mid-publication when the fetch runs in the morning. 2 clears the whole D-1/D-0 cycle for every
 * source in the base. It is deliberately NOT tuned per source — a uniform, stated lag is
 * auditable; six per-source constants are six things to get wrong, and the cost of over-lagging is
 * one month of latency on rows nothing downstream reads yet.
 */
export const TRAILING_EDGE_LAG_DAYS = 2;

/** The instant at and after which this run declines to ingest anything new. */
export function trailingEdgeCutoff(now, lagDays = TRAILING_EDGE_LAG_DAYS) {
  return new Date(now.getTime() - lagDays * 864e5).toISOString();
}

/**
 * Split one shard's rows into what this run keeps and what it withholds.
 *
 * Pure: takes and returns NDJSON lines, so the rule can be tested on hand-built rows without a
 * network, a git history, or a gzip file anywhere near it.
 *
 * @param {string[]} lines        NDJSON lines the fetcher just wrote
 * @param {Set<string>} committedKeys  row keys present in the committed predecessor
 * @param {string} cutoff         ISO instant from `trailingEdgeCutoff`
 * @param {(row:object)=>string} rowKey  the orchestrator's row identity
 */
export function partitionTrailingEdge(lines, committedKeys, cutoff, rowKey) {
  const kept = [];
  const withheld = [];
  for (const line of lines) {
    const row = JSON.parse(line);
    // Already published → keep, unconditionally. See condition (b) in the header.
    if (committedKeys.has(rowKey(row)) || row.period_start < cutoff) kept.push(line);
    else withheld.push(row.period_start);
  }
  return { kept, withheld };
}

/**
 * Apply the lag to every NDJSON shard a fetcher just wrote, rewriting the files and the manifest
 * entries that describe them.
 *
 * Runs BEFORE `reconcileShards`, deliberately. Reconciliation derives its window start from the
 * earliest row across the new files; the lag only ever removes rows at the LATEST end, so the two
 * do not interact — but running it after would mean trimming rows that reconciliation had just
 * carried forward from the committed shard, which is precisely the coverage shrink condition (b)
 * forbids.
 *
 * A shard that empties out is dropped from the manifest and left unwritten rather than committed
 * as a zero-row file. That happens in the first days of January, when the year's only rows are all
 * inside the lag window; a zero-row shard would be an assertion that the year has no data.
 *
 * @param {object}   opts
 * @param {object}   opts.manifest   manifest as the fetcher wrote it — MUTATED in place
 * @param {(file:string)=>Promise<Buffer|null>} opts.readCommitted  committed bytes for a shard
 * @param {(file:string)=>Promise<void>} opts.writeShard  persist rewritten gzip bytes
 * @param {(file:string)=>Promise<void>} opts.removeShard  delete a shard that emptied
 * @param {(file:string)=>Promise<Buffer>} opts.readShard  current bytes on disk
 * @param {(row:object)=>string} opts.rowKey
 * @param {string}   opts.cutoff
 */
export async function applyTrailingEdgeLag({ manifest, readCommitted, readShard, writeShard, removeShard, rowKey, cutoff }) {
  const result = { cutoff, rows_withheld: 0, shards_trimmed: [], shards_emptied: [], newest_kept: null };
  const shards = (manifest?.files ?? []).filter((f) => String(f.file).endsWith('.ndjson.gz'));
  if (!shards.length) return result;

  const drop = new Set();
  for (const f of shards) {
    let buf;
    try { buf = await readShard(f.file); } catch { continue; }
    const lines = zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean);

    const committedBuf = await readCommitted(f.file);
    const committedKeys = new Set();
    if (committedBuf) {
      for (const line of zlib.gunzipSync(committedBuf).toString('utf8').split('\n')) {
        if (line) committedKeys.add(rowKey(JSON.parse(line)));
      }
    }

    const { kept, withheld } = partitionTrailingEdge(lines, committedKeys, cutoff, rowKey);
    for (const k of kept) {
      const ps = JSON.parse(k).period_start;
      if (result.newest_kept === null || ps > result.newest_kept) result.newest_kept = ps;
    }
    if (!withheld.length) continue;

    result.rows_withheld += withheld.length;
    if (!kept.length) {
      // Nothing survives and nothing was committed here before — the shard is entirely inside the
      // lag window. Drop it rather than commit an empty file asserting the year is empty.
      result.shards_emptied.push(f.file);
      drop.add(f.file);
      await removeShard(f.file);
      continue;
    }

    const gz = zlib.gzipSync(Buffer.from(kept.join('\n') + '\n'), { level: 9 });
    await writeShard(f.file, gz);
    const first = JSON.parse(kept[0]);
    const last = JSON.parse(kept.at(-1));
    f.rows = kept.length;
    f.bytes_gz = gz.length;
    f.span = `${first.period_start}..${last.period_end}`;
    f.sha256 = crypto.createHash('sha256').update(gz).digest('hex');
    result.shards_trimmed.push(f.file);
  }

  if (drop.size) manifest.files = manifest.files.filter((f) => !drop.has(f.file));
  if ((result.shards_trimmed.length || drop.size) && typeof manifest.rows === 'number') {
    manifest.rows = manifest.files.reduce((s, f) => s + (f.rows ?? 0), 0);
  }
  return result;
}
