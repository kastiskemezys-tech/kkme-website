import { describe, it, expect } from 'vitest';
import { INTERCONNECTORS, resolveFlow } from '../baltic-places';

// Phase 12.4 hotfix regression guard. Pins canonical API convention
// (positive = importing) end-to-end through resolveFlow into hero arrows.
// If positiveFlowReceives flips for any Baltic interconnector, this fails.

describe('resolveFlow direction (Phase 12.4 hotfix)', () => {
  const s8 = {
    nordbalt_avg_mw:  -429,  // LT exporting 429 to SE
    litpol_avg_mw:    -166,  // LT exporting 166 to PL
    estlink_avg_mw:   +860,  // EE importing 860 from FI
    fennoskan_avg_mw: +607,  // FI importing 607 from SE
    lv_lt_avg_mw:     +360,
  };
  const byId = Object.fromEntries(
    INTERCONNECTORS.map(spec => [spec.id, resolveFlow(spec, s8)])
  );

  it('NordBalt: LT exporting (negative) → from LT to SE', () => {
    expect(byId['nordbalt'].fromCountry).toBe('LT');
    expect(byId['nordbalt'].toCountry).toBe('SE');
    expect(byId['nordbalt'].mw).toBe(429);
  });

  it('LitPol: LT exporting (negative) → from LT to PL', () => {
    expect(byId['litpol'].fromCountry).toBe('LT');
    expect(byId['litpol'].toCountry).toBe('PL');
    expect(byId['litpol'].mw).toBe(166);
  });

  it('EstLink: EE importing (positive) → from FI to EE', () => {
    expect(byId['estlink-1'].fromCountry).toBe('FI');
    expect(byId['estlink-1'].toCountry).toBe('EE');
    expect(byId['estlink-2'].fromCountry).toBe('FI');
    expect(byId['estlink-2'].toCountry).toBe('EE');
  });

  it('Fenno-Skan: FI importing (positive) → from SE to FI', () => {
    expect(byId['fennoskan-1'].fromCountry).toBe('SE');
    expect(byId['fennoskan-1'].toCountry).toBe('FI');
    expect(byId['fennoskan-2'].fromCountry).toBe('SE');
    expect(byId['fennoskan-2'].toCountry).toBe('FI');
  });
});
