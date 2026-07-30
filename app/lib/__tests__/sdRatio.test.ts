import { describe, it, expect } from 'vitest';
import {
  SD_STATUS_WEIGHT,
  weightedSupplyMw,
  sdRatio,
  sdFormulaCaption,
  sdCaptionIsConsistent,
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

describe('the caption reproduces the ratio it sits beside (Phase 36.D)', () => {
  // The defect this replaces was live and public: SignalBar and the hero map
  // both rendered `(operational + 0.5 × pipeline) / demand`, which on the
  // production payload (op 782, pipeline 15 239, demand 935) evaluates to 8.99×
  // while the headline immediately beside it displayed 2.55×. A reader who did
  // the arithmetic the tooltip prescribed got a number 3.5× the one shown.
  const LIVE = { weightedMw: 2385, effDemandMw: 752, absorptionMw: 200, publishedSdRatio: 2.91 };

  it('states the subtraction when supply is contracted away', () => {
    const c = sdFormulaCaption(LIVE);
    expect(c).toContain('(2385 − 200) MW');
    expect(c).toContain('752 MW');
    expect(c).toContain('2.91');
    expect(c).toContain('contracted-away');
  });

  it('omits the subtraction term when there is nothing to subtract', () => {
    const c = sdFormulaCaption({ weightedMw: 2385, effDemandMw: 752 });
    expect(c).toContain('2385 MW / 752 MW');
    expect(c).not.toContain('contracted-away');
    expect(c).toContain('3.17');
  });

  it('the arithmetic in the caption equals the ratio the worker published', () => {
    expect(sdCaptionIsConsistent(LIVE)).toBe(true);
    // And it catches the case that shipped: the old formula's inputs against
    // the real published ratio.
    expect(sdCaptionIsConsistent({
      weightedMw: 782 + 0.5 * 15239, effDemandMw: 935, publishedSdRatio: 2.55,
    })).toBe(false);
  });

  it('is silent rather than wrong when the worker published no ratio', () => {
    expect(sdCaptionIsConsistent({ weightedMw: 1, effDemandMw: 1 })).toBe(true);
  });

  it('still answers the pre-36.D two-argument call', () => {
    // A stale caller must degrade to the gross form, not throw on a public page.
    expect(sdFormulaCaption(1358, 752)).toContain('1358 MW / 752 MW');
  });

  it('shows the clamp instead of incoherent arithmetic when absorption exceeds supply', () => {
    // Rendering "(100 − 500) MW … = 0.00×" would be precisely the defect this
    // function exists to prevent, in a new place. It also signals that the
    // module claims more contracted MW than the fleet holds — a data problem
    // the reader should see, not a rounding note to swallow.
    const c = sdFormulaCaption({ weightedMw: 100, effDemandMw: 752, absorptionMw: 500 });
    expect(c).toContain('(100 − 500 → 0, capped)');
    expect(c).toContain('0.00×');
    expect(c).not.toMatch(/-\d/);
  });
});
