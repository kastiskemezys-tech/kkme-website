/**
 * Phase 39 — the published floor copy.
 *
 * Asserted as RENDERED STRINGS, not component internals (B13). The specific
 * thing being guarded: the operator's decision that only the MEASURED channel
 * ships. The blend channel inflated the phase's first table by an order of
 * magnitude and must not reappear on a public surface with a caveat attached.
 */
import { describe, it, expect } from 'vitest';
import {
  FLOOR_REFERENCE, FLOOR_LEVER, FLOOR_LEVER_RATIO,
  contractedFloorExplainer, contractedFloorOneLiner,
} from '../contractedFloorCopy';

describe('the measured levers', () => {
  it('rise monotonically as the case worsens — the whole mechanism', () => {
    expect(FLOOR_LEVER.base).toBeLessThan(FLOOR_LEVER.conservative);
    expect(FLOOR_LEVER.conservative).toBeLessThan(FLOOR_LEVER.stress);
  });

  it('carries the UNROUNDED measured values from the Phase 39 run', () => {
    // Unrounded on purpose. Rounding first and dividing second turned 1.3030
    // into 1.28 and pushed the headline ratio from 2.00 to 2.04 in an earlier
    // draft — a number read off a formatted table rather than off the artifact.
    expect(FLOOR_LEVER.base).toBe(1.3030);
    expect(FLOOR_LEVER.conservative).toBe(2.2538);
    expect(FLOOR_LEVER.stress).toBe(2.6108);
  });

  it('derives the headline ratio rather than hardcoding it', () => {
    // Rule #2 — a number asserting a relationship between two others must be
    // computed from them.
    expect(FLOOR_LEVER_RATIO).toBeCloseTo(FLOOR_LEVER.stress / FLOOR_LEVER.base, 2);
    expect(FLOOR_LEVER_RATIO).toBe(2.00);
  });

  it('holds the cover ratio at the merchant level, so the floor is the only mover', () => {
    expect(FLOOR_REFERENCE.target_dscr).toBe(2.00);
  });
});

describe('the drawer copy', () => {
  const block = contractedFloorExplainer();
  const paras = block.paragraphs;

  it('carries a heading', () => {
    expect(block.heading).toBeTruthy();
  });

  it('states the floor level, term and share', () => {
    const all = paras.join(' ');
    expect(all).toContain('€116k/MW/yr');
    expect(all).toContain('10 years');
    expect(all).toContain('50% of nameplate');
  });

  it('gives the mechanism before the number', () => {
    const mechIdx = paras.findIndex((p) => p.includes('LOW years'));
    const numIdx = paras.findIndex((p) => p.includes('2.61'));
    expect(mechIdx).toBeGreaterThanOrEqual(0);
    expect(mechIdx).toBeLessThan(numIdx);
  });

  it('publishes all three measured levers and the ratio', () => {
    const all = paras.join(' ');
    expect(all).toContain('1.30×');
    expect(all).toContain('2.25×');
    expect(all).toContain('2.61×');
    expect(all).toContain('2.00×');
  });

  it('marks the floor as a structure test, not a term sheet (rule #3)', () => {
    const all = paras.join(' ');
    expect(all).toMatch(/structure test/);
    expect(all).toMatch(/not a term sheet/);
    expect(all).toMatch(/not an offer received/);
  });

  it('NEVER publishes the blend channel', () => {
    // The operator's condition. The retracted headline was "+25.5 % debt at
    // 50 % contracted", 98 % of which was the unsourced DSCR blend. Neither the
    // number nor the mechanism may appear on a public surface.
    const all = (paras.join(' ') + ' ' + contractedFloorOneLiner()).toLowerCase();
    expect(all).not.toMatch(/blend/);
    expect(all).not.toMatch(/25\.5/);
    expect(all).not.toMatch(/1\.60×|1\.80×/);      // the blended targets
    expect(all).not.toMatch(/unsourced/);           // no caveated re-introduction
  });

  it('carries no editorial state label (rule #6)', () => {
    const all = (paras.join(' ') + ' ' + contractedFloorOneLiner()).toUpperCase();
    for (const w of ['TIGHTENING', 'STABLE', 'RISING', 'ELEVATED', 'STRONG', 'ROBUST']) {
      expect(all).not.toContain(w);
    }
  });
});

describe('the one-liner', () => {
  it('states the asymmetry and its cause', () => {
    const s = contractedFloorOneLiner();
    expect(s).toContain('2.00×');
    expect(s).toMatch(/sculpting is set by the low years/);
  });
});
