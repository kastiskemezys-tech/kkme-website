// Phase 33.A.2.b (W2-curated + W4) — Latvia coverage.
//
// Pause A: the LV permit pipeline is architecturally dead (entity_resolver has no
// sprk/bis/vvd extractor; the scraper emits only PDF-title garbage). The real LV
// operational fleet is small (~4 projects) and press-documented, so it's curated-
// injected at POST /s2/fleet. These tests pin injectCuratedFleet (add + dedup +
// C-01 survival + tso_bess typing) and injectManualAdditions (the W4 safety valve).
import { describe, it, expect } from 'vitest';
import {
  CURATED_FLEET,
  injectCuratedFleet,
  injectManualAdditions,
  filterFleetEntries,
} from '../../../workers/fetch-s1.js';

type FleetEntry = {
  id?: string; name: string; country: string; mw: number; mwh?: number; status: string;
  source?: string; type?: string; _curated?: boolean; _manual?: boolean;
  [k: string]: unknown;
};

describe('CURATED_FLEET — the 4 LV operational entries', () => {
  it('covers Targale, AJ Power, Rēzekne, Tume', () => {
    expect(CURATED_FLEET.map((c: { match: string }) => c.match).sort())
      .toEqual(['aj power', 'rezekne', 'targale', 'tume']);
    expect(CURATED_FLEET.every((c: FleetEntry) => c.country === 'LV')).toBe(true);
  });
  it('Rēzekne is 60 MW (rule #4 — matches the corrected storage_by_country ledger)', () => {
    const r = CURATED_FLEET.find((c: { match: string }) => c.match === 'rezekne') as FleetEntry;
    expect(r.mw).toBe(60);
  });
  it('TSO-owned AST assets are typed tso_bess; commercial ones are not', () => {
    const byMatch = (m: string) => CURATED_FLEET.find((c: { match: string }) => c.match === m) as FleetEntry;
    expect(byMatch('rezekne').type).toBe('tso_bess');
    expect(byMatch('tume').type).toBe('tso_bess');
    expect(byMatch('targale').type).toBeUndefined();
    expect(byMatch('aj power').type).toBeUndefined();
  });
  it('every entry carries a primary source_url (rule #3)', () => {
    expect(CURATED_FLEET.every((c: { source_url?: string }) => !!c.source_url && /^https:\/\//.test(c.source_url!))).toBe(true);
  });
});

describe('injectCuratedFleet — add + dedup', () => {
  it('injects all 4 when absent and marks them _curated', () => {
    const entries: FleetEntry[] = [
      { id: 'x', name: 'Aretis Iļģuciems', country: 'LV', mw: 15, mwh: 30, status: 'announced' },
    ];
    const { injected } = injectCuratedFleet(entries);
    expect(injected).toHaveLength(4);
    expect(entries).toHaveLength(5);
    const added = entries.filter(e => e._curated);
    expect(added.every(e => e.country === 'LV' && e.status === 'operational')).toBe(true);
    expect(added.map(e => e.name)).toContain('Utilitas Targale BESS');
  });

  it('does not double-add a project already present in the feed', () => {
    const entries: FleetEntry[] = [
      { id: 'r', name: 'AST BESS (Rēzekne)', country: 'LV', mw: 60, mwh: 120, status: 'operational', source: 'AST' },
    ];
    const { injected } = injectCuratedFleet(entries);
    // Rēzekne already present (normName match) → only the other 3 inject.
    expect(injected.map(i => i.id)).not.toContain('ast-bess-rezekne-lv');
    expect(injected).toHaveLength(3);
  });
});

describe('injectCuratedFleet → filterFleetEntries (C-01 survival)', () => {
  it('all 4 injected operational entries survive the C-01 gate', () => {
    const entries: FleetEntry[] = [];
    injectCuratedFleet(entries);
    const { accepted, dropped } = filterFleetEntries(entries);
    expect(dropped).toHaveLength(0);
    expect(accepted).toHaveLength(4);
    expect(accepted.every(e => e.status === 'operational')).toBe(true);
  });
});

describe('injectManualAdditions — W4 safety valve', () => {
  it('merges a manual LV entry not already present', () => {
    const entries: FleetEntry[] = [];
    const manual = [{ id: 'foo-lv', name: 'Foo BESS', country: 'LV', mw: 12, mwh: 24, status: 'announced' }];
    const { merged } = injectManualAdditions(entries, manual);
    expect(merged).toHaveLength(1);
    expect(entries[0]._manual).toBe(true);
  });

  it('dedups against an entry already in the batch (e.g. curated)', () => {
    const entries: FleetEntry[] = [];
    injectCuratedFleet(entries);
    const manual = [{ id: 'ast-bess-tume-lv', name: 'AST BESS Tume', country: 'LV', mw: 20, status: 'operational', source: 'AST' }];
    const { merged } = injectManualAdditions(entries, manual);
    expect(merged).toHaveLength(0); // already curated-injected
  });

  it('ignores malformed manual entries (missing name/country)', () => {
    const entries: FleetEntry[] = [];
    const { merged } = injectManualAdditions(entries, [{ mw: 5 } as unknown as FleetEntry]);
    expect(merged).toHaveLength(0);
  });
});
