import { describe, it, expect } from 'vitest';
import {
  SD_STATUS_WEIGHT,
  weightedSupplyMw,
  sdRatio,
  sdFormulaCaption,
} from '../sdRatio';

describe('S/D ratio computation', () => {
  it('STATUS_WEIGHT mirrors worker constants', () => {
    expect(SD_STATUS_WEIGHT.operational).toBe(1.0);
    expect(SD_STATUS_WEIGHT.commissioned).toBe(1.0);
    expect(SD_STATUS_WEIGHT.under_construction).toBe(0.9);
    expect(SD_STATUS_WEIGHT.connection_agreement).toBe(0.6);
    expect(SD_STATUS_WEIGHT.application).toBe(0.3);
    expect(SD_STATUS_WEIGHT.announced).toBe(0.1);
  });

  it('weighted supply applies status weights to commercial BESS only', () => {
    const w = weightedSupplyMw([
      { mw: 100, status: 'operational' },        // 100 × 1.0 = 100
      { mw: 100, status: 'under_construction' }, // 100 × 0.9 = 90
      { mw: 100, status: 'connection_agreement' }, // 100 × 0.6 = 60
      { mw: 100, status: 'application' },        // 100 × 0.3 = 30
      { mw: 100, status: 'announced' },          // 100 × 0.1 = 10
    ]);
    expect(w).toBe(290);
  });

  it('excludes pumped hydro and tso_bess (DRR-suppressed)', () => {
    const w = weightedSupplyMw([
      { mw: 100, status: 'operational' },
      { mw: 205, status: 'operational', type: 'pumped_hydro' }, // Kruonis: ignored
      { mw: 50, status: 'operational', type: 'tso_bess' },      // ignored
    ]);
    expect(w).toBe(100);
  });

  it('unknown status falls back to 0.1 (announced-equivalent)', () => {
    const w = weightedSupplyMw([{ mw: 100, status: 'mystery_state' }]);
    expect(w).toBe(10);
  });

  it('sdRatio = weighted / effective demand, rounded to 2dp', () => {
    expect(sdRatio(1358, 752)).toBe(1.81); // audit case
    expect(sdRatio(290, 100)).toBe(2.9);
  });

  it('sdRatio returns null for invalid demand', () => {
    expect(sdRatio(100, 0)).toBeNull();
    expect(sdRatio(100, -5)).toBeNull();
    expect(sdRatio(NaN, 100)).toBeNull();
    expect(sdRatio(100, NaN)).toBeNull();
  });

  it('formula caption surfaces both inputs and the ratio (the 7.6.4 fix)', () => {
    const caption = sdFormulaCaption(1358, 752);
    expect(caption).toContain('S/D');
    expect(caption).toContain('1358 MW');   // weighted numerator visible
    expect(caption).toContain('752 MW');    // effective demand visible
    expect(caption).toContain('1.81');      // computed ratio matches displayed
    // Regression guard: never publish only the ratio without the inputs
    expect(caption).toMatch(/=\s*1\.81/);
  });
});
