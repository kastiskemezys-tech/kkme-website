import { describe, it, expect } from 'vitest';
import { computeCycles, warrantyStatus, REVENUE_SCENARIOS } from '../throughputCycles';

describe('throughput-derived cycles per year', () => {
  it('base 2h scenario produces 600-750 EFC/yr (active-trader Baltic median)', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.total_efcs_yr).toBeGreaterThanOrEqual(600);
    expect(r.total_efcs_yr).toBeLessThanOrEqual(750);
  });

  it('base 4h scenario produces 400-500 EFC/yr (4h gentler cycling)', () => {
    const r = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    expect(r.total_efcs_yr).toBeGreaterThanOrEqual(400);
    expect(r.total_efcs_yr).toBeLessThanOrEqual(500);
  });

  it('base 4h scenario produces fewer EFC than base 2h (gentler cycling)', () => {
    const r2h = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const r4h = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    expect(r4h.total_efcs_yr).toBeLessThan(r2h.total_efcs_yr);
  });

  it('breakdown sums to total', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.fcr + r.afrr + r.mfrr + r.da).toBeCloseTo(r.total_efcs_yr, 1);
  });

  it('stress scenario produces fewer EFC than base', () => {
    const base   = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const stress = computeCycles({ MW: 1, dur_h: 2, scenario: 'stress' });
    expect(stress.total_efcs_yr).toBeLessThan(base.total_efcs_yr);
  });

  it('warranty_status returns "within" for typical Baltic dispatch', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.warranty_status).toBe('within');
  });

  it('warranty status thresholds: ≤730 within, ≤1460 premium-tier-required, >1460 unwarranted', () => {
    expect(warrantyStatus(500)).toBe('within');
    expect(warrantyStatus(730)).toBe('within');
    expect(warrantyStatus(731)).toBe('premium-tier-required');
    expect(warrantyStatus(1460)).toBe('premium-tier-required');
    expect(warrantyStatus(1461)).toBe('unwarranted');
    expect(warrantyStatus(2000)).toBe('unwarranted');
  });

  it('every (scenario × duration) combo lands in [300, 750] EFCs/yr — physical band', () => {
    for (const scenario of ['base', 'conservative', 'stress'] as const) {
      for (const dur_h of [2, 4]) {
        const r = computeCycles({ MW: 1, dur_h, scenario });
        expect(r.total_efcs_yr, `${scenario}/${dur_h}h`).toBeGreaterThanOrEqual(300);
        expect(r.total_efcs_yr, `${scenario}/${dur_h}h`).toBeLessThanOrEqual(750);
      }
    }
  });

  it('total throughput per MW is independent of MW (linear scaling)', () => {
    const r1 = computeCycles({ MW: 1,  dur_h: 2, scenario: 'base' });
    const r10 = computeCycles({ MW: 10, dur_h: 2, scenario: 'base' });
    expect(r10.total_efcs_yr).toBeCloseTo(r1.total_efcs_yr, 5);
  });

  it('DA component dominates for base 2h (>70% of EFCs)', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.da / r.total_efcs_yr).toBeGreaterThan(0.7);
  });

  it('total_cd matches total_efcs_yr / 365', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.total_cd).toBeCloseTo(r.total_efcs_yr / 365, 5);
  });

  it('conservative reduces all four product throughputs vs base', () => {
    const base = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    const cons = computeCycles({ MW: 1, dur_h: 2, scenario: 'conservative' });
    expect(cons.fcr).toBeLessThan(base.fcr);
    expect(cons.afrr).toBeLessThan(base.afrr);
    expect(cons.mfrr).toBeLessThan(base.mfrr);
    expect(cons.da).toBeLessThan(base.da);
  });

  it('base 2h total_cd lands ~1.6-2.0 c/d (active-trader Baltic merchant)', () => {
    const r = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(r.total_cd).toBeGreaterThan(1.6);
    expect(r.total_cd).toBeLessThan(2.0);
  });

  it('base 4h total_cd lands ~1.0-1.3 c/d (4h asset gentler cycling)', () => {
    const r = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    expect(r.total_cd).toBeGreaterThan(1.0);
    expect(r.total_cd).toBeLessThan(1.3);
  });
});

describe('per-duration DA anchors (recalibrated)', () => {
  it('base 2h DA throughput ≈ 1100 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.base.mwh_per_mw_yr_da_2h).toBe(1100);
  });
  it('base 4h DA throughput ≈ 1500 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.base.mwh_per_mw_yr_da_4h).toBe(1500);
  });
  it('conservative 2h DA throughput ≈ 1000 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.conservative.mwh_per_mw_yr_da_2h).toBe(1000);
  });
  it('conservative 4h DA throughput ≈ 1400 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.conservative.mwh_per_mw_yr_da_4h).toBe(1400);
  });
  it('stress 2h DA throughput ≈ 800 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.stress.mwh_per_mw_yr_da_2h).toBe(800);
  });
  it('stress 4h DA throughput ≈ 1240 MWh/MW/yr', () => {
    expect(REVENUE_SCENARIOS.stress.mwh_per_mw_yr_da_4h).toBe(1240);
  });

  it('DA 4h > DA 2h within each scenario (4h captures longer cycles)', () => {
    for (const scenario of ['base', 'conservative', 'stress'] as const) {
      const sc = REVENUE_SCENARIOS[scenario];
      expect(sc.mwh_per_mw_yr_da_4h).toBeGreaterThan(sc.mwh_per_mw_yr_da_2h);
    }
  });

  it('computed da_mwh per MW matches the per-duration anchor', () => {
    const base2 = computeCycles({ MW: 1, dur_h: 2, scenario: 'base' });
    expect(base2.da * 2).toBeCloseTo(1100, 1);  // da_efcs × dur_h = MWh per MW
    const base4 = computeCycles({ MW: 1, dur_h: 4, scenario: 'base' });
    expect(base4.da * 4).toBeCloseTo(1500, 1);
  });
});
