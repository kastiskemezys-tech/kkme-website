/**
 * Phase 44 — every validator proven failable with a malformed fixture.
 *
 * The gate on this phase is not "a contract exists" — it is that the contract
 * REJECTS the real failures we have actually seen. Each case below is a
 * recorded production failure, not an invented one.
 */
import { describe, it, expect } from 'vitest';
import { admit, checkEnvelope, checkVolume, checkEncoding, CONTRACTS, CONTRACT_COUNT } from '../lib/sourceContracts.js';

describe('envelope — the check that runs before the parse', () => {
  it('rejects the exact energy-charts 503 seen on 2026-08-03', () => {
    // Verbatim body from the live probe at 16:36Z.
    const r = admit('energy-charts:price:LT', {
      status: 503,
      contentType: 'text/html',
      body: '<html><body><h1>503 Service Unavailable</h1>\nNo server is available to handle this request.\n</body></html>\n',
    });
    expect(r.admitted).toBe(false);
    expect(r.diagnosis).toContain('HTTP 503');
    expect(r.envelope.ctype).toBe('text/html');
    expect(r.envelope.bytes).toBeGreaterThan(0);
  });

  it('rejects an HTML error page served under a 200 — the NordPool shape', () => {
    // The failure that starved the forecast path for months: NordPool began
    // returning HTML with a 200, so status alone said nothing.
    const r = admit('energy-charts:price:LT', {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!DOCTYPE html><html><head><title>Error</title></head><body>Service temporarily unavailable</body></html>',
    });
    expect(r.admitted).toBe(false);
    expect(r.diagnosis).toMatch(/HTML body where JSON was expected/);
  });

  it('rejects an empty body under a 200', () => {
    const r = admit('energy-charts:price:LT', { status: 200, contentType: 'application/json', body: '' });
    expect(r.admitted).toBe(false);
    expect(r.diagnosis).toMatch(/empty body/);
  });

  it('admits a well-formed response', () => {
    const r = admit('energy-charts:price:LT', {
      status: 200,
      contentType: 'application/json',
      body: '{"price":[1,2],"unix_seconds":[1,2]}',
      count: 96,
      parsed: { price: [1, 2], unix_seconds: [1, 2] },
    });
    expect(r.admitted).toBe(true);
    expect(r.diagnosis).toBeNull();
  });
});

describe('volume envelope — the check that `length > 0` is not', () => {
  it('rejects a truncation that would pass every non-empty check', () => {
    // 3 rows where 96 were expected. Non-empty, plausible, wrong.
    const r = checkVolume(CONTRACTS['energy-charts:price:LT'], 3);
    expect(r.ok).toBe(false);
    expect(r.diagnosis).toMatch(/truncation, not a result/);
  });

  it('rejects an over-long series — the window or the shape changed', () => {
    // 190 is what a UTC-bounded A44 request actually returns: two market days
    // concatenated. Against the energy-charts contract that is out of envelope.
    expect(checkVolume(CONTRACTS['energy-charts:price:LT'], 190).ok).toBe(false);
  });

  it('admits both MTU eras for the source that spans them', () => {
    // 24 (hourly, pre-2025-10-01) and 96 (quarter-hourly) are both correct, and
    // a contract that only knew one would fail on half the history.
    expect(checkVolume(CONTRACTS['entsoe:A44:LT'], 24).ok).toBe(true);
    expect(checkVolume(CONTRACTS['entsoe:A44:LT'], 96).ok).toBe(true);
    // …and a DST day, which is neither.
    expect(checkVolume(CONTRACTS['entsoe:A44:LT'], 100).ok).toBe(true);
    expect(checkVolume(CONTRACTS['entsoe:A44:LT'], 92).ok).toBe(true);
  });
});

describe('encoding — the cp1257 precedent', () => {
  it('rejects a decoder that has already given up', () => {
    const r = checkEncoding('Vilniaus kogeneracin� jegain�');
    expect(r.ok).toBe(false);
    expect(r.diagnosis).toMatch(/replacement char/);
  });

  it('rejects UTF-8 bytes decoded as a single-byte charset', () => {
    const r = checkEncoding('EnergÄ³os skirstymo operatorius Ä®monÄ— Å½emaitija Ä®staiga');
    expect(r.ok).toBe(false);
    expect(r.diagnosis).toMatch(/double-encoding/);
  });

  it('admits correctly-encoded Lithuanian and Latvian', () => {
    expect(checkEncoding('Energijos skirstymo operatorius · Įmonė · Žemaitija · Augstsprieguma tīkls').ok).toBe(true);
  });

  it('does not attempt to repair — a guessed re-decode is how a wrong name gets published', () => {
    const r = checkEncoding('Ä®monÄ—');
    expect(r).not.toHaveProperty('repaired');
    expect(r).not.toHaveProperty('text');
  });
});

describe('admission discipline', () => {
  it('refuses to admit a source with no declared contract', () => {
    // "Not in the registry" must never read as "fine". Same rule as the NDA
    // gate refusing to report a pass when its needle list is missing.
    const r = admit('some-new-source-nobody-declared', { status: 200, contentType: 'application/json', body: '{}' });
    expect(r.admitted).toBe(false);
    expect(r.diagnosis).toMatch(/no contract declared/);
  });

  it('quarantines wholly — there is no partially-admitted payload', () => {
    const r = admit('energy-charts:price:LT', {
      status: 200, contentType: 'application/json', body: '{"price":[1]}', count: 2, parsed: { price: [1] },
    });
    expect(r.admitted).toBe(false);
    // Both the volume and the shape failures are reported, not just the first.
    expect(r.checks.filter((c) => !c.ok).length).toBeGreaterThanOrEqual(2);
  });

  it('every declared contract states freshness from its OWN cadence, not a global constant', () => {
    expect(CONTRACT_COUNT).toBeGreaterThanOrEqual(5);
    for (const [id, c] of Object.entries(CONTRACTS)) {
      expect(c.freshness_hours, `${id}.freshness_hours`).toBeGreaterThan(0);
      expect(c.cadence, `${id}.cadence`).toBeTruthy();
      expect(c.volume[0], `${id}.volume floor`).toBeGreaterThan(0);
      // `>=`, not `>`. A scalar source — a single spot price — has exactly one
      // value, so [1, 1] is its true envelope. The first version of this
      // assertion demanded a strictly wider band and failed on
      // `tradingeconomics:lithium`, where the contract was right and the
      // assertion was wrong. Recorded rather than quietly widened (B6).
      expect(c.volume[1], `${id}.volume ceiling`).toBeGreaterThanOrEqual(c.volume[0]);
      expect(c.notes, `${id}.notes`).toBeTruthy();
    }
  });
});

describe('generated artifacts stay in sync with the tree', () => {
  it('docs/ingestion-map.md matches the current ingestion paths', async () => {
    // A hand-maintained inventory is a second definition of what we ingest, and
    // A7 exists because "the N sources" is exactly the claim that turns out to
    // be N+1. Adding a source without regenerating the map is a red test here
    // rather than a stale document nobody re-reads.
    const { execFileSync } = await import('node:child_process');
    expect(() => execFileSync('node', ['scripts/gates/ingestion-map.mjs', '--check'], { encoding: 'utf8' })).not.toThrow();
  });
});
