// 36.E0.2 — the canonical manifest writer and the append-only provenance rule.
//
// These assert the property the from-scratch writers violated, not the refactor that fixed it: a
// manifest may come to know MORE than its predecessor and may never come to know less.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  writeManifest, assertProvenanceAppendOnly, carryForwardProvenance,
  preserveAcquisitionMetadata, PROVENANCE_KEYS,
} from '../mature-markets/manifest-writer.mjs';

let dir: string;
const read = (f = 'manifest.json') => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const seed = (m: unknown, f = 'manifest.json') =>
  fs.writeFileSync(path.join(dir, f), JSON.stringify(m, null, 1) + '\n');

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kkme-manifest-')); });
afterEach(() => fsp.rm(dir, { recursive: true, force: true }));

describe('provenance is append-only', () => {
  it('refuses a write that explicitly destroys coverage_verification', async () => {
    seed({ licence: 'x', coverage_verification: { per_month: { '2020-01': 744 } }, rows: 10 });
    await expect(writeManifest({
      dir, window: 'full', dataset: 'test',
      // Not an omission — an assertion that the block is now empty. That is a claim about the
      // source, it is a loss, and it must not reach disk.
      manifest: { licence: 'x', rows: 20, coverage_verification: {} },
    })).rejects.toThrow(/would REMOVE provenance/);
  });

  it('repairs a from-scratch rebuild that simply omits the block', async () => {
    // The shape all eight fetchers had. Omission is not a claim, so it is carried forward rather
    // than refused — otherwise every direct fetcher run would fail on a manifest it never had an
    // opinion about, and the gate would be noise instead of signal.
    seed({ licence: 'x', coverage_verification: { per_month: { '2020-01': 744 } }, rows: 10 });
    const { carried } = await writeManifest({
      dir, window: 'full', dataset: 'test', manifest: { licence: 'x', rows: 20 },
    });
    expect(carried).toContain('coverage_verification');
    expect(read().coverage_verification.per_month['2020-01']).toBe(744);
    expect(read().rows).toBe(20);
  });

  it('the raw assert still treats a bare omission as removal', () => {
    // writeManifest repairs before asserting, so this property is only visible on the assert
    // itself — and it is the property the gate is named for.
    expect(() => assertProvenanceAppendOnly({ coverage_verification: { a: 1 } }, { rows: 1 }))
      .toThrow(/would REMOVE provenance/);
  });

  it('names the removed keys in the error', () => {
    expect(() => assertProvenanceAppendOnly(
      { coverage_verification: { a: 1 }, last_successful_refresh: '2026-08-01T00:00:00Z' },
      {}, { dataset: 'se' },
    )).toThrow(/coverage_verification.*last_successful_refresh/);
  });

  it('treats an emptied key as removed — blanking is not preserving', () => {
    expect(() => assertProvenanceAppendOnly(
      { coverage_verification: { per_month: { '2020-01': 1 } } },
      { coverage_verification: {} },
    )).toThrow(/would REMOVE provenance/);
  });

  it('allows a write that ADDS provenance', async () => {
    seed({ rows: 10 });
    await writeManifest({
      dir, window: 'full', dataset: 'test',
      manifest: { rows: 20, licence: 'new', coverage_verification: { checked: true } },
    });
    expect(read().licence).toBe('new');
  });

  it('carries forward what the caller did not set, rather than only alarming', () => {
    // The repair, not just the detector. A `full` fetcher run directly does not know about
    // last_successful_refresh — the orchestrator stamps it — so without the carry-forward it
    // would drop the field the staleness surface ages and exempt the source permanently (B12).
    const before = { last_successful_refresh: '2026-08-01T00:00:00Z', refresh_cadence_months: 1, licence: 'L' };
    const next: Record<string, unknown> = { rows: 5 };
    const carried = carryForwardProvenance(before, next);
    expect(carried).toEqual(expect.arrayContaining(['last_successful_refresh', 'refresh_cadence_months', 'licence']));
    expect(next.last_successful_refresh).toBe('2026-08-01T00:00:00Z');
  });

  it('does not carry retrieved_at — every run legitimately restamps it', () => {
    expect(PROVENANCE_KEYS).not.toContain('retrieved_at');
  });

  it('a first write with no manifest on disk is allowed, not an error', async () => {
    // Absence of provenance is NOT an error state. A dataset acquired by hand and never refreshed
    // has no last_successful_refresh and is being honest; gating on mere key presence would have
    // false-alarmed on exactly such an artifact (B-048).
    await writeManifest({ dir, window: 'full', dataset: 'new', manifest: { rows: 1 } });
    expect(read().rows).toBe(1);
  });
});

describe('windowed refreshes do not overwrite acquisition evidence', () => {
  const acquisition = {
    licence: 'L',
    coverage_verification: { verdict: 'absence served as zero', per_month: { '2020-01': 744, '2026-01': 744 } },
    retrieved_at: '2026-01-01T00:00:00Z',
    rows: 146733,
    files: [{ file: 'se-2020.ndjson.gz', rows: 100 }],
  };

  it('keeps the acquisition-time coverage block beside the window, not under it', async () => {
    seed(acquisition);
    await writeManifest({
      dir, window: 'current_year', dataset: 'se',
      // What a 2026-only re-fetch honestly knows: this year only.
      manifest: {
        coverage_verification: { per_month: { '2026-01': 744 } },
        retrieved_at: '2026-08-02T00:00:00Z', requested_span: '2026-01..2026-08',
        rows: 216, files: [{ file: 'se-2026.ndjson.gz', rows: 216 }],
      },
    });
    const m = read();
    expect(m.coverage_verification.verdict).toBe('absence served as zero');
    expect(Object.keys(m.coverage_verification.per_month)).toContain('2020-01');
    expect(m.last_refresh.windowed_metadata.coverage_verification.per_month).toEqual({ '2026-01': 744 });
    expect(m.retrieved_at).toBe('2026-08-02T00:00:00Z');
    expect(m.acquisition_retrieved_at).toBe('2026-01-01T00:00:00Z');
  });

  it('a full-window source does replace its manifest', () => {
    const out = preserveAcquisitionMetadata('full', { coverage_verification: { old: true } }, { coverage_verification: { new: true } });
    expect(out.coverage_verification).toEqual({ new: true });
  });

  it('is idempotent — applying it twice does not nest last_refresh inside itself', () => {
    // The fetcher writes through this module and the orchestrator re-writes through it again after
    // reconciling shards, so it runs twice per orchestrated refresh. Without excluding last_refresh
    // from the windowed capture, every month would bury the previous month's block one level deeper.
    const before = { coverage_verification: { verdict: 'v' }, retrieved_at: '2026-01-01T00:00:00Z' };
    const win = { coverage_verification: { per_month: {} }, retrieved_at: '2026-08-02T00:00:00Z', requested_span: 's', rows: 1, files: [] };
    const once = preserveAcquisitionMetadata('current_year', before, win);
    const twice = preserveAcquisitionMetadata('current_year', before, once);
    expect(twice.last_refresh.windowed_metadata.last_refresh).toBeUndefined();
    expect(twice.coverage_verification.verdict).toBe('v');
  });
});

describe('the writer is the only sanctioned path', () => {
  it('refuses a write that does not declare its window', async () => {
    await expect(writeManifest({ dir, manifest: { rows: 1 }, dataset: 'x' } as never))
      .rejects.toThrow(/window is required/);
  });

  it('honours a non-default manifest filename', async () => {
    // The calendar's manifest IS structural-breaks.json. Hardcoding manifest.json would have left
    // it unwritten and produced a spurious second file beside it.
    await writeManifest({
      dir, window: 'full', dataset: 'calendar', file: 'structural-breaks.json',
      manifest: { dataset: 'structural-breaks', n_events: 3 },
    });
    expect(read('structural-breaks.json').n_events).toBe(3);
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(false);
  });
});
