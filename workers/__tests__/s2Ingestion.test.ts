/**
 * Phase 36.C — S2 multi-leg ingestion: admission control, column resolution,
 * and observation-window recency.
 *
 * The 2026-07-17 stall was not a source outage. BTD stayed up; KKME's two
 * ingestion legs failed independently and each was coded to assume the other
 * was covering, so nothing wrote and nothing complained. These tests pin the
 * three mechanisms that make that specific failure loud instead of silent:
 *
 *   1. `s2DataWindowEnd` — recency measured by the DATA's last delivery day,
 *      not by wall-clock write time. BTD publishes with a ~2-day lag, so a
 *      payload written now can describe older data than one written an hour ago.
 *   2. `s2AdmitWrite` — freshness wins outright; source priority only breaks
 *      ties inside the same window. A stale leg can never clobber a fresh one.
 *   3. `s2ResolveCountryBase` — Lithuania's column offset comes from the
 *      payload's own header_groups rather than a hardcoded 10.
 *
 * Anchored on a real recorded BTD response
 * (`fixtures/btd-price-procured-reserves-2026-07-26.json`, pulled from the live
 * API during the Pause-A audit) rather than a hand-written object, because what
 * is being asserted is that the parser handles what the platform actually sends.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { s2AdmitWrite, s2ResolveCountryBase, s2DataWindowEnd } from '../fetch-s1.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, 'fixtures/btd-price-procured-reserves-2026-07-26.json'), 'utf8'),
);

describe('s2ResolveCountryBase — column offsets come from the payload', () => {
  it('resolves Lithuania to 10 on the real BTD response', () => {
    expect(s2ResolveCountryBase(FIXTURE, 'Lithuania')).toBe(10);
  });

  it('resolves the other two Baltic areas', () => {
    expect(s2ResolveCountryBase(FIXTURE, 'Estonia')).toBe(0);
    expect(s2ResolveCountryBase(FIXTURE, 'Latvia')).toBe(5);
  });

  it('follows header_groups when BTD reorders countries', () => {
    // The whole point of resolving rather than hardcoding: if Lithuania moves,
    // the parser must move with it. A hardcoded 10 would read Latvia's prices
    // and label them Lithuanian, with nothing downstream able to tell.
    const reordered = structuredClone(FIXTURE);
    reordered.data.header_groups[0] = [
      { label: 'Lithuania', width: 5, start: 0, to: 4 },
      { label: 'Estonia', width: 5, start: 5, to: 9 },
      { label: 'Latvia', width: 5, start: 10, to: 14 },
    ];
    expect(s2ResolveCountryBase(reordered, 'Lithuania')).toBe(0);
  });

  it('falls back to the historical constant when header_groups is absent', () => {
    const stripped = structuredClone(FIXTURE);
    delete stripped.data.header_groups;
    delete stripped.data.columns;
    expect(s2ResolveCountryBase(stripped, 'Lithuania')).toBe(10);
  });

  it('falls back to columns[] when only header_groups is missing', () => {
    const stripped = structuredClone(FIXTURE);
    delete stripped.data.header_groups;
    expect(s2ResolveCountryBase(stripped, 'Latvia')).toBe(5);
  });
});

describe('s2DataWindowEnd — recency is a property of the data', () => {
  it('reads the last delivery date from the real response', () => {
    expect(s2DataWindowEnd(FIXTURE)).toBe('2026-07-26');
  });

  it('ignores trailing all-null rows', () => {
    // BTD returns rows for dates it has no data for. Counting those as coverage
    // would let an empty fetch outrank a populated one.
    const padded = structuredClone(FIXTURE);
    padded.data.timeseries.push(
      { _from: '2026-07-27 00:00', from: '2026-07-27T00:00:00+00:00', values: [null, null, null] },
      { _from: '2026-07-28 00:00', from: '2026-07-28T00:00:00+00:00', values: [null, null, null] },
    );
    expect(s2DataWindowEnd(padded)).toBe('2026-07-26');
  });

  it('returns null for an empty or malformed dataset', () => {
    expect(s2DataWindowEnd(null)).toBeNull();
    expect(s2DataWindowEnd({ data: { timeseries: [] } })).toBeNull();
    expect(s2DataWindowEnd({ data: { timeseries: [{ _from: 'garbage', values: [1] }] } })).toBeNull();
  });
});

describe('s2AdmitWrite — freshness wins, priority breaks ties', () => {
  const stored = (win: string | null, source: string) => ({
    data_window_end: win,
    _meta: { source },
  });

  it('admits when KV is empty', () => {
    expect(s2AdmitWrite({ data_window_end: '2026-07-26', source: 'vps' }, null).admit).toBe(true);
  });

  it('admits a fresher window regardless of source rank', () => {
    // The worker-direct leg is lower-ranked than vps, but it holds newer data,
    // so it must win. Ranking exists to break ties, not to gate freshness.
    const v = s2AdmitWrite(
      { data_window_end: '2026-07-27', source: 'worker-direct' },
      stored('2026-07-26', 'vps'),
    );
    expect(v.admit).toBe(true);
    expect(v.reason).toContain('fresher window');
  });

  it('rejects a stale window even from the highest-priority leg', () => {
    // This is the regression that matters: a VPS run holding a week-old window
    // must not overwrite fresher data just because it is the primary.
    const v = s2AdmitWrite(
      { data_window_end: '2026-07-20', source: 'vps' },
      stored('2026-07-26', 'worker-direct'),
    );
    expect(v.admit).toBe(false);
    expect(v.reason).toContain('stale window');
  });

  it('prefers the higher-priority leg within the same window', () => {
    expect(s2AdmitWrite(
      { data_window_end: '2026-07-26', source: 'vps' },
      stored('2026-07-26', 'worker-direct'),
    ).admit).toBe(true);
  });

  it('refuses a lower-priority leg within the same window', () => {
    expect(s2AdmitWrite(
      { data_window_end: '2026-07-26', source: 'worker-direct' },
      stored('2026-07-26', 'vps'),
    ).admit).toBe(false);
  });

  it('lets a leg refresh its own write (idempotent re-run)', () => {
    expect(s2AdmitWrite(
      { data_window_end: '2026-07-26', source: 'vps' },
      stored('2026-07-26', 'vps'),
    ).admit).toBe(true);
  });

  it('ranks an unnamed caller below every named leg', () => {
    // A stray script POSTing without `source` must not displace the primary.
    expect(s2AdmitWrite(
      { data_window_end: '2026-07-26', source: undefined },
      stored('2026-07-26', 'vps'),
    ).admit).toBe(false);
  });

  it('ranks the retired Mac leg below the VPS', () => {
    // fetch-btd.js is retired but not unreachable; if it ever runs again it
    // must not outrank the primary.
    expect(s2AdmitWrite(
      { data_window_end: '2026-07-26', source: 'mac' },
      stored('2026-07-26', 'vps'),
    ).admit).toBe(false);
  });

  it('admits uncompared when either side predates data_window_end', () => {
    // Legacy payloads have no window. Refusing to compare would freeze S2
    // permanently — the failure mode this phase exists to remove — so admit,
    // but say plainly that no comparison happened.
    const v = s2AdmitWrite({ data_window_end: '2026-07-26', source: 'vps' }, stored(null, 'mac'));
    expect(v.admit).toBe(true);
    expect(v.reason).toContain('uncompared');
  });
});
