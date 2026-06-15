// Phase 33.A.2 (W1a) — operator-curated operational-confirmation allowlist.
//
// Root cause (Phase 33.A.2 Pause A): upstream kkme_sync.py has no operational
// signal — permit/connection-register loaders never emit state='operational',
// and merge_with_existing only blocks downgrades, so a commissioned commercial
// BESS sits "announced" forever (4 of 5 known-operational were stale). The
// worker flips them via KNOWN_OPERATIONAL at POST /s2/fleet, BEFORE the C-01
// gate (which Phase 33.A made a hard reject for operational-without-TSO-evidence).
//
// These tests pin applyKnownOperational + its interaction with filterFleetEntries
// so the flip, the MW correction, the W3 disagreement flag, and the C-01-survival
// invariant can't silently regress.
import { describe, it, expect } from 'vitest';
import {
  applyKnownOperational,
  filterFleetEntries,
  normName,
} from '../../../workers/fetch-s1.js';

// Loose fleet-entry shape for fixtures — applyKnownOperational adds cod /
// _mw_disagreement at runtime (the worker .js is untyped), so the index
// signature lets the tests read those without `any`.
type FleetEntry = {
  id: string;
  name?: string;
  country: string;
  mw: number;
  mwh?: number;
  status: string;
  source?: string;
  cod?: string;
  _mw_disagreement?: { feed_mw: number; operator_mw: number; source_url: string };
  [k: string]: unknown;
};

describe('normName — matching normalization', () => {
  it('lowercases, strips diacritics + smart-quotes + company suffix noise', () => {
    expect(normName('UAB „Vilnius BESS“ 72.0')).toContain('vilnius bess');
    expect(normName('Tausolos saulė, UAB')).toContain('tausolos');
    expect(normName('Hertz 1 Jaago akupark')).toContain('hertz 1');
  });
  it('handles null/undefined safely', () => {
    expect(normName(undefined as unknown as string)).toBe('');
    expect(normName(null as unknown as string)).toBe('');
  });
});

describe('applyKnownOperational — status flip', () => {
  it('flips a matching announced entry to operational and corrects MW', () => {
    const entries: FleetEntry[] = [
      { id: 'h1', name: 'Hertz 1 Jaago akupark', country: 'EE', mw: 114.9, mwh: 229.7, status: 'announced', source: 'elering · Evecon Solar 461 OÜ' },
    ];
    const { flipped } = applyKnownOperational(entries);
    expect(entries[0].status).toBe('operational');
    expect(entries[0].mw).toBe(100);
    expect(entries[0].mwh).toBe(200);
    expect(entries[0].cod).toBe('2026-02-03');
    expect(flipped).toHaveLength(1);
    expect(flipped[0]).toMatchObject({ key: 'hertz-1', from: 'announced', mw_from: 114.9, mw_to: 100 });
  });

  it('matches despite company prefix, MW suffix, smart-quotes (Vilnius BESS)', () => {
    const entries: FleetEntry[] = [
      { id: 'v', name: 'UAB „Vilnius BESS“ 72.0', country: 'LT', mw: 72, mwh: 144, status: 'announced', source: 'vert · UAB „Vilnius BESS“' },
    ];
    applyKnownOperational(entries);
    expect(entries[0].status).toBe('operational');
    expect(entries[0].mw).toBe(65);
  });

  it('is country-scoped — an EE-rule name in the wrong country does not match', () => {
    const entries: FleetEntry[] = [
      { id: 'fake', name: 'Hertz 1 lookalike', country: 'LT', mw: 50, mwh: 100, status: 'announced', source: 'x' },
    ];
    const { flipped } = applyKnownOperational(entries);
    expect(flipped).toHaveLength(0);
    expect(entries[0].status).toBe('announced');
  });

  it('does not over-match Hertz 2 against the hertz-1 rule', () => {
    const entries: FleetEntry[] = [
      { id: 'h2', name: 'Hertz 2', country: 'EE', mw: 113.5, mwh: 227, status: 'announced', source: 'elering · Evecon Solar 435 OÜ' },
    ];
    const { flipped } = applyKnownOperational(entries);
    expect(flipped).toHaveLength(0);
    expect(entries[0].status).toBe('announced');
  });

  it('flips Vėjo galia and corrects the feed 50 MW (solar) to the 41 MW BESS rating', () => {
    const entries: FleetEntry[] = [
      { id: 'vg', name: 'UAB "Vėjo galia"', country: 'LT', mw: 50, mwh: 100, status: 'announced', source: 'litgrid · UAB "Vėjo galia"' },
    ];
    applyKnownOperational(entries);
    expect(entries[0].status).toBe('operational');
    expect(entries[0].mw).toBe(41);
    expect(entries[0].mwh).toBe(107.3);
    expect(entries[0]._mw_disagreement).toEqual({ feed_mw: 50, operator_mw: 41, source_url: expect.stringContaining('lrt.lt') });
  });

  it('does not over-match other vėjo-named entries (Vėjoteka) against vejo-galia', () => {
    const entries: FleetEntry[] = [
      { id: 'vt', name: 'UAB "Vėjoteka"', country: 'LT', mw: 90, mwh: 180, status: 'announced', source: 'litgrid · UAB "Vėjoteka"' },
    ];
    const { flipped } = applyKnownOperational(entries);
    expect(flipped).toHaveLength(0);
    expect(entries[0].status).toBe('announced');
  });

  it('leaves Auvere untouched (held back per Pause A operator decision)', () => {
    const entries: FleetEntry[] = [
      { id: 'a', name: 'Auvere salvesti', country: 'EE', mw: 75, mwh: 150, status: 'announced', source: 'elering · Enefit Industry AS' },
    ];
    const { flipped } = applyKnownOperational(entries);
    expect(flipped).toHaveLength(0);
    expect(entries[0].status).toBe('announced');
    expect(entries[0].mw).toBe(75);
  });
});

describe('applyKnownOperational — W3 MW disagreement', () => {
  it('records feed/operator MW disagreement when they differ', () => {
    const entries: FleetEntry[] = [
      { id: 'h1', name: 'Hertz 1 Jaago akupark', country: 'EE', mw: 114.9, mwh: 229.7, status: 'announced', source: 'elering · x' },
    ];
    applyKnownOperational(entries);
    expect(entries[0]._mw_disagreement).toEqual({ feed_mw: 114.9, operator_mw: 100, source_url: expect.stringContaining('evecon.ee') });
  });

  it('omits the disagreement flag when feed MW matches (Tausolos 30=30)', () => {
    const entries: FleetEntry[] = [
      { id: 't', name: 'Tausolos saulė, UAB', country: 'LT', mw: 30, mwh: 60, status: 'announced', source: 'litgrid · Tausolos saulė, UAB' },
    ];
    applyKnownOperational(entries);
    expect(entries[0]._mw_disagreement).toBeUndefined();
    expect(entries[0].mw).toBe(30);
    expect(entries[0].mwh).toBe(67.7); // mwh still corrected
  });
});

describe('applyKnownOperational → filterFleetEntries (C-01 survival invariant)', () => {
  // The flip sets operational status; without an operational-evidence source the
  // C-01 gate (Phase 33.A hard reject) would drop the entry. Assert the allowlist
  // attaches enough evidence that flipped entries survive the gate.
  it('flipped entries are NOT dropped by the C-01 gate', () => {
    const entries: FleetEntry[] = [
      { id: 'h1', name: 'Hertz 1 Jaago akupark', country: 'EE', mw: 114.9, mwh: 229.7, status: 'announced', source: 'elering · Evecon Solar 461 OÜ' },
      { id: 'v',  name: 'UAB „Vilnius BESS“ 72.0', country: 'LT', mw: 72, mwh: 144, status: 'announced', source: 'vert · UAB „Vilnius BESS“' },
      { id: 't',  name: 'Tausolos saulė, UAB', country: 'LT', mw: 30, mwh: 60, status: 'announced', source: 'litgrid · Tausolos saulė, UAB' },
    ];
    applyKnownOperational(entries);
    const { accepted, dropped } = filterFleetEntries(entries);
    expect(dropped).toHaveLength(0);
    expect(accepted.map(e => e.id).sort()).toEqual(['h1', 't', 'v']);
    expect(accepted.every(e => e.status === 'operational')).toBe(true);
  });

  it('every flipped source string satisfies the C-01 evidence regex', () => {
    const entries: FleetEntry[] = [
      { id: 'v', name: 'UAB „Vilnius BESS“ 72.0', country: 'LT', mw: 72, mwh: 144, status: 'announced', source: 'vert · only' },
    ];
    applyKnownOperational(entries);
    // 'vert' alone would trip C-01; the appended 'operational' token saves it.
    expect(entries[0].source).toMatch(/TSO|Litgrid|Elering|AST|operational/i);
  });
});
