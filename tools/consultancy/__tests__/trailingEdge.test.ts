// 36.E1 step 0 — the trailing-edge publication lag.
//
// These reconstruct the 2026-08 incident rather than testing the implementation's shape: the
// 2026-07-30 fetch stored a provisional 2026-07-31 delivery day, and the 2026-09 refresh restated
// it. The property under test is that the first of those two runs declines to store the
// provisional row at all — AND that it never withholds a row it already published, which is the
// difference between a lag and a coverage shrink.
//
// The tests drive real gzip bytes through `applyTrailingEdgeLag` with injected IO, so what is
// asserted is what the orchestrator commits, not what a helper returns in isolation.

import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import {
  applyTrailingEdgeLag, partitionTrailingEdge, trailingEdgeCutoff, TRAILING_EDGE_LAG_DAYS,
} from '../mature-markets/trailing-edge.mjs';

type Row = {
  market: string; area: string; product: string; direction: string | null; mechanism: string;
  period_start: string; period_end: string; resolution: string; price: number;
};

const rowKey = (r: Row) =>
  `${r.market}|${r.area}|${r.product}|${r.direction ?? '-'}|${r.mechanism}|${r.period_start}|${r.resolution}`;

/** One hourly SE FCR-N row, shaped like the real ones in the incident report. */
const row = (day: string, hour: number, price = 16): Row => ({
  market: 'SE', area: 'SE', product: 'FCR-N', direction: 'symmetric', mechanism: 'cap',
  period_start: `${day}T${String(hour).padStart(2, '0')}:00:00Z`,
  period_end: `${day}T${String(hour + 1).padStart(2, '0')}:00:00Z`,
  resolution: 'PT1H', price,
});

const gz = (rows: Row[]) => zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
const ungz = (buf: Buffer): Row[] =>
  zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/**
 * Run the lag over a single shard with in-memory IO.
 * `committed` is the previous run's bytes (null = the shard is new).
 */
async function run(now: string, onDisk: Row[], committed: Row[] | null, lagDays = TRAILING_EDGE_LAG_DAYS) {
  const manifest = { rows: onDisk.length, files: [{ file: 'se-fcr-2026.ndjson.gz', rows: onDisk.length, sha256: 'stale' }] };
  const written: Record<string, Buffer> = {};
  const removed: string[] = [];
  const result = await applyTrailingEdgeLag({
    manifest,
    cutoff: trailingEdgeCutoff(new Date(now), lagDays),
    rowKey,
    readShard: async () => gz(onDisk),
    readCommitted: async () => (committed ? gz(committed) : null),
    writeShard: async (f: string, b: Buffer) => { written[f] = b; },
    removeShard: async (f: string) => { removed.push(f); },
  });
  const file = written['se-fcr-2026.ndjson.gz'];
  return { result, manifest, removed, kept: file ? ungz(file) : null, wrote: Boolean(file) };
}

describe('the cutoff', () => {
  it('is now minus the lag, and the lag is 2 days', () => {
    expect(TRAILING_EDGE_LAG_DAYS).toBe(2);
    expect(trailingEdgeCutoff(new Date('2026-07-30T10:35:31Z'))).toBe('2026-07-28T10:35:31.000Z');
  });
});

describe('the 2026-08 incident, replayed', () => {
  // The real sequence: fetch at 2026-07-30T10:35:31Z, before SvK's D-1 auction for delivery day
  // 2026-07-31. Under the lag that day is never stored, so there is nothing to restate.
  const fetchedAt = '2026-07-30T10:35:31Z';
  const settled = [row('2026-07-20', 0), row('2026-07-25', 0), row('2026-07-27', 0)];
  const provisional = [row('2026-07-30', 0), row('2026-07-31', 0), row('2026-07-31', 1)];

  it('withholds the delivery day the market had not finished publishing', async () => {
    const { result, kept } = await run(fetchedAt, [...settled, ...provisional], null);
    expect(result.rows_withheld).toBe(3);
    expect(kept!.map((r) => r.period_start.slice(0, 10))).toEqual(['2026-07-20', '2026-07-25', '2026-07-27']);
    expect(result.newest_kept).toBe('2026-07-27T00:00:00Z');
  });

  it('leaves nothing to restate a month later', async () => {
    // Run 1 stores only settled days. Run 2 re-fetches and finds the merged tranche — a DIFFERENT
    // price on 07-31. Because run 1 never stored 07-31, run 2's version is an append, not a
    // restatement, and the append-only gate has nothing to fire on.
    const { kept: afterFirst } = await run(fetchedAt, [...settled, ...provisional], null);
    const merged = [...settled, row('2026-07-30', 0, 19.4), row('2026-07-31', 0, 19.4), row('2026-07-31', 1, 21.1)];
    const { result, wrote } = await run('2026-09-01T03:00:00Z', merged, afterFirst!);
    expect(result.rows_withheld).toBe(0);
    expect(wrote).toBe(false);          // nothing withheld, so the fetcher's bytes stand as written
    // What run 2 commits is `merged`. None of its rows collides with a differently-priced row
    // run 1 stored, so the append-only audit sees six appends and zero restatements.
    const restated = merged.filter((r) => afterFirst!.some((o) => rowKey(o) === rowKey(r) && o.price !== r.price));
    expect(restated).toEqual([]);
    expect(merged.length).toBe(6);
  });
});

describe('a lag, never a coverage shrink', () => {
  it('keeps an already-committed row that now falls inside the lag window', async () => {
    // The condition that makes this a lag rather than a deletion. If a previous run published a
    // row and this run fires within the lag window of it, withholding it would REMOVE published
    // history — the exact anomaly the append-only gate exists to catch.
    const published = [row('2026-07-30', 0), row('2026-07-31', 0)];
    const { result, wrote } = await run('2026-08-01T03:00:00Z', published, published);
    expect(result.rows_withheld).toBe(0);
    expect(wrote).toBe(false);          // nothing to rewrite: every row survives
  });

  it('still surfaces a restatement of already-committed history', async () => {
    // Withholding is not adjudication. A value that changed on a row we already published is a
    // real event and must reach the audit unchanged.
    const published = [row('2026-07-31', 0, 16)];
    const { kept } = await run('2026-08-01T03:00:00Z', [row('2026-07-31', 0, 19.4)], published);
    expect(kept).toBeNull();            // untouched by the lag…
    // …so the orchestrator's audit compares the fetcher's restated bytes, as before.
  });
});

describe('shards wholly inside the lag window', () => {
  it('is dropped from the manifest rather than committed as a zero-row file', async () => {
    // Early January: the year's only rows are all provisional. A zero-row shard would assert the
    // year has no data.
    const { result, manifest, removed } = await run('2026-01-02T06:00:00Z', [row('2026-01-01', 0), row('2026-01-02', 0)], null);
    expect(result.rows_withheld).toBe(2);
    expect(result.shards_emptied).toEqual(['se-fcr-2026.ndjson.gz']);
    expect(removed).toEqual(['se-fcr-2026.ndjson.gz']);
    expect(manifest.files).toEqual([]);
    expect(manifest.rows).toBe(0);
  });
});

describe('the manifest describes what is on disk', () => {
  it('rewrites rows, span, bytes and sha256 for a trimmed shard', async () => {
    const { manifest, kept } = await run('2026-07-30T10:35:31Z', [row('2026-07-20', 0), row('2026-07-31', 0)], null);
    const f = manifest.files[0];
    expect(f.rows).toBe(1);
    expect(f.span).toBe('2026-07-20T00:00:00Z..2026-07-20T01:00:00Z');
    expect(f.sha256).not.toBe('stale');
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.rows).toBe(1);
    expect(kept!.length).toBe(1);
  });
});

describe('the rule itself', () => {
  // Behavioural, on the pure partition: both halves of the condition are load-bearing and each is
  // shown to be by removing the other's effect.
  const cutoff = '2026-07-28T10:35:31.000Z';
  const lines = [row('2026-07-20', 0), row('2026-07-31', 0)].map((r) => JSON.stringify(r));

  it('withholds a new row inside the window', () => {
    const { kept, withheld } = partitionTrailingEdge(lines, new Set(), cutoff, rowKey as never);
    expect(withheld).toEqual(['2026-07-31T00:00:00Z']);
    expect(kept.length).toBe(1);
  });

  it('keeps the same row once it is committed', () => {
    const committed = new Set([rowKey(row('2026-07-31', 0))]);
    const { kept, withheld } = partitionTrailingEdge(lines, committed, cutoff, rowKey as never);
    expect(withheld).toEqual([]);
    expect(kept.length).toBe(2);
  });

  it('keeps a new row outside the window', () => {
    const older = [JSON.stringify(row('2026-07-27', 0))];
    const { withheld } = partitionTrailingEdge(older, new Set(), cutoff, rowKey as never);
    expect(withheld).toEqual([]);
  });
});
