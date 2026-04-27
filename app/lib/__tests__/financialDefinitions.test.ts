import { describe, it, expect } from 'vitest';
import {
  IRR_TILES,
  DSCR_LABELS,
  DEFAULT_DSCR_COVENANT,
  RETURNS_METRICS,
  MARKET_THICKNESS,
  isForbiddenIrrLabel,
} from '../financialDefinitions';

// Phase 7.7a — financialDefinitions vocabulary module (N-11 guard).

describe('IRR_TILES — tile spec for Project / Equity IRR', () => {
  it('Project IRR label is exactly "Project IRR" (no "Gross IRR" alias)', () => {
    expect(IRR_TILES.unlevered.label).toBe('Project IRR');
    expect(isForbiddenIrrLabel(IRR_TILES.unlevered.label)).toBe(false);
  });

  it('Equity IRR label is exactly "Equity IRR"', () => {
    expect(IRR_TILES.equity.label).toBe('Equity IRR');
    expect(isForbiddenIrrLabel(IRR_TILES.equity.label)).toBe(false);
  });

  it('Project IRR sublabel discloses unlevered convention', () => {
    expect(IRR_TILES.unlevered.sublabel.toLowerCase()).toContain('unlevered');
  });

  it('Equity IRR sublabel discloses levered convention', () => {
    expect(IRR_TILES.equity.sublabel.toLowerCase()).toContain('levered');
  });

  it('tooltip strings are non-empty and mention debt service', () => {
    expect(IRR_TILES.unlevered.tooltip.length).toBeGreaterThan(20);
    expect(IRR_TILES.equity.tooltip.length).toBeGreaterThan(20);
    expect(IRR_TILES.unlevered.tooltip.toLowerCase()).toContain('debt service');
    expect(IRR_TILES.equity.tooltip.toLowerCase()).toContain('debt service');
  });

  it('post-tax convention is documented in both tooltips', () => {
    expect(IRR_TILES.unlevered.tooltip.toLowerCase()).toContain('post-tax');
    expect(IRR_TILES.equity.tooltip.toLowerCase()).toContain('post-tax');
  });
});

describe('DSCR_LABELS — three variants', () => {
  it('exposes base, conservative, and worst_month variants', () => {
    expect(Object.keys(DSCR_LABELS).sort()).toEqual(['base', 'conservative', 'worst_month']);
  });

  it('base + conservative share the "Min DSCR" label, distinguished by sublabel', () => {
    expect(DSCR_LABELS.base.label).toBe('Min DSCR');
    expect(DSCR_LABELS.conservative.label).toBe('Min DSCR');
    expect(DSCR_LABELS.base.sublabel).not.toBe(DSCR_LABELS.conservative.sublabel);
  });

  it('worst_month label calls out the seasonality dimension', () => {
    expect(DSCR_LABELS.worst_month.label.toLowerCase()).toContain('worst-month');
  });

  it('every tooltip is non-empty', () => {
    for (const v of Object.values(DSCR_LABELS)) {
      expect(v.tooltip.length).toBeGreaterThan(20);
    }
  });

  it('default covenant threshold is 1.20×', () => {
    expect(DEFAULT_DSCR_COVENANT).toBe(1.2);
  });
});

describe('RETURNS_METRICS — auxiliary returns labels', () => {
  it('MOIC tooltip mentions multiple of money', () => {
    expect(RETURNS_METRICS.moic.tooltip.toLowerCase()).toContain('multiple of money');
  });
  it('Payback tooltip mentions years', () => {
    expect(RETURNS_METRICS.payback.tooltip.toLowerCase()).toContain('year');
  });
  it('NPV label includes WACC reference', () => {
    expect(RETURNS_METRICS.npv.label).toContain('WACC');
  });
});

describe('STORAGE_METRICS — Phase 7.7c vocabulary (LCOS / MOIC / Duration)', async () => {
  const { STORAGE_METRICS } = await import('../financialDefinitions');

  it('exposes LCOS / MOIC / DURATION_RECOMMENDATION', () => {
    expect(STORAGE_METRICS.LCOS).toBeDefined();
    expect(STORAGE_METRICS.MOIC).toBeDefined();
    expect(STORAGE_METRICS.DURATION_RECOMMENDATION).toBeDefined();
  });

  it('every short label fits the MetricTile budget (≤ 14 chars)', () => {
    for (const m of Object.values(STORAGE_METRICS)) {
      expect(m.short.length).toBeLessThanOrEqual(14);
    }
  });

  it('every tooltip is non-trivial (>= 30 chars)', () => {
    for (const m of Object.values(STORAGE_METRICS)) {
      expect(m.tooltip.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('LCOS unit is €/MWh-cycled (not €/MWh — distinct from energy price)', () => {
    expect(STORAGE_METRICS.LCOS.unit).toBe('€/MWh-cycled');
  });

  it('MOIC unit is the multiplication sign (×)', () => {
    expect(STORAGE_METRICS.MOIC.unit).toBe('×');
  });

  it('Duration tooltip mentions both 2h and 4h', () => {
    const t = STORAGE_METRICS.DURATION_RECOMMENDATION.tooltip.toLowerCase();
    expect(t).toContain('2h');
    expect(t).toContain('4h');
  });
});

describe('MARKET_THICKNESS — chip vocabulary for balancing tiles', () => {
  it('aFRR is thick, mFRR is medium, FCR is thin', () => {
    expect(MARKET_THICKNESS.afrr.level).toBe('thick');
    expect(MARKET_THICKNESS.mfrr.level).toBe('medium');
    expect(MARKET_THICKNESS.fcr.level).toBe('thin');
  });

  it('mFRR + FCR carry warning captions; aFRR has none', () => {
    expect(MARKET_THICKNESS.afrr.caption).toBeNull();
    expect(MARKET_THICKNESS.mfrr.caption).not.toBeNull();
    expect(MARKET_THICKNESS.fcr.caption).not.toBeNull();
  });

  it('FCR caption flags the price-taker breakdown for large assets', () => {
    expect(MARKET_THICKNESS.fcr.caption?.toLowerCase()).toContain('price-taker');
  });

  it('every tooltip is non-empty', () => {
    for (const v of Object.values(MARKET_THICKNESS)) {
      expect(v.tooltip.length).toBeGreaterThan(20);
    }
  });
});
