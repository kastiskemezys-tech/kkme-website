import { describe, it, expect } from 'vitest';
import {
  findBaseCase,
  buildTornadoBars,
  tornadoAxisExtent,
} from '../sensitivity';

// Phase 7.7a (7.7.10) — sensitivity tornado from the 9-cell matrix.
//
// Fixture mirrors the worker's matrix layout: 3 CAPEX buckets × 3 COD years.
// Numbers approximate the live payload (project_irr ranging 0.13 → 0.27).

const FIXTURE = [
  { capex: 'low'  as const, cod: 2027, project_irr: 0.2738 },
  { capex: 'low'  as const, cod: 2028, project_irr: 0.2400 },
  { capex: 'low'  as const, cod: 2029, project_irr: 0.2100 },
  { capex: 'mid'  as const, cod: 2027, project_irr: 0.2050 },
  { capex: 'mid'  as const, cod: 2028, project_irr: 0.1797 }, // BASE
  { capex: 'mid'  as const, cod: 2029, project_irr: 0.1550 },
  { capex: 'high' as const, cod: 2027, project_irr: 0.1500 },
  { capex: 'high' as const, cod: 2028, project_irr: 0.1300 },
  { capex: 'high' as const, cod: 2029, project_irr: 0.1100 },
];

describe('findBaseCase — locate mid-CAPEX/2028-COD row', () => {
  it('returns the canonical mid/2028 cell', () => {
    const base = findBaseCase(FIXTURE);
    expect(base?.project_irr).toBe(0.1797);
  });

  it('returns null when matrix is empty', () => {
    expect(findBaseCase([])).toBeNull();
  });

  it('falls back to the first row when mid/2028 is missing', () => {
    const base = findBaseCase([
      { capex: 'low', cod: 2027, project_irr: 0.3 },
    ]);
    expect(base?.project_irr).toBe(0.3);
  });
});

describe('buildTornadoBars — deltas vs base', () => {
  it('lower CAPEX → positive delta; higher CAPEX → negative', () => {
    const bars = buildTornadoBars(FIXTURE);
    const capexLow = bars.find(b => b.label === 'CAPEX low');
    const capexHigh = bars.find(b => b.label === 'CAPEX high');
    expect(capexLow?.deltaPp).toBeGreaterThan(0);
    expect(capexHigh?.deltaPp).toBeLessThan(0);
  });

  it('earlier COD → positive delta; later COD → negative', () => {
    const bars = buildTornadoBars(FIXTURE);
    const cod2027 = bars.find(b => b.label === 'COD 2027');
    const cod2029 = bars.find(b => b.label === 'COD 2029');
    expect(cod2027?.deltaPp).toBeGreaterThan(0);
    expect(cod2029?.deltaPp).toBeLessThan(0);
  });

  it('base case is excluded (its delta is zero by construction)', () => {
    const bars = buildTornadoBars(FIXTURE);
    expect(bars.find(b => b.label === 'CAPEX mid')).toBeUndefined();
    expect(bars.find(b => b.label === 'COD 2028')).toBeUndefined();
  });

  it('sorts bars by absolute delta magnitude descending', () => {
    const bars = buildTornadoBars(FIXTURE);
    for (let i = 1; i < bars.length; i++) {
      expect(Math.abs(bars[i - 1].deltaPp)).toBeGreaterThanOrEqual(Math.abs(bars[i].deltaPp));
    }
  });

  it('CAPEX low delta is roughly +6 pp on this fixture (0.24 - 0.18 = ~6 pp)', () => {
    const bars = buildTornadoBars(FIXTURE);
    const capexLow = bars.find(b => b.label === 'CAPEX low');
    expect(capexLow?.deltaPp).toBeGreaterThan(5);
    expect(capexLow?.deltaPp).toBeLessThan(7);
  });

  it('appends scenario bars (conservative, stress) when provided', () => {
    const bars = buildTornadoBars(FIXTURE, {
      conservative: { project_irr: 0.1312 },
      stress: { project_irr: 0.0900 },
    });
    expect(bars.find(b => b.label === 'Conservative' && b.dimension === 'scenario')).toBeTruthy();
    expect(bars.find(b => b.label === 'Stress' && b.dimension === 'scenario')).toBeTruthy();
  });

  it('skips scenarios with null project_irr (engine sometimes returns null for stress)', () => {
    const bars = buildTornadoBars(FIXTURE, {
      conservative: { project_irr: 0.1312 },
      stress: { project_irr: null },
    });
    expect(bars.find(b => b.label === 'Conservative')).toBeTruthy();
    expect(bars.find(b => b.label === 'Stress')).toBeUndefined();
  });

  it('returns empty array on empty matrix', () => {
    expect(buildTornadoBars([])).toEqual([]);
  });
});

describe('tornadoAxisExtent — symmetric range padding', () => {
  it('returns max abs delta padded ~10%', () => {
    const ext = tornadoAxisExtent([
      { label: 'a', dimension: 'capex', deltaPp: 6, absoluteIrr: 0.24 },
      { label: 'b', dimension: 'capex', deltaPp: -4, absoluteIrr: 0.14 },
    ]);
    expect(ext).toBeGreaterThan(6);
    expect(ext).toBeLessThan(7);
  });

  it('returns a sensible default for empty input', () => {
    expect(tornadoAxisExtent([])).toBeGreaterThan(0);
  });
});
