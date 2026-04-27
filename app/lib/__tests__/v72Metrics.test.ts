import { describe, it, expect } from 'vitest';

// Phase 7.7c Session 1 — v7.2 derived-metric specs (N-10 / N-11).
//
// LCOS, MOIC, duration_recommendation, assumptions_panel are pure additions
// to the /revenue payload (model_version 'v7.2'). These specs assert the
// math sanity bands and the engine_changelog vocabulary against live
// post-deploy fixtures captured in §5.

import base2h          from '../../../docs/audits/phase-7-7c/baseline-base-2h-v7-2.json';
import base4h          from '../../../docs/audits/phase-7-7c/baseline-base-4h-v7-2.json';
import conservative2h  from '../../../docs/audits/phase-7-7c/baseline-conservative-2h-v7-2.json';
import conservative4h  from '../../../docs/audits/phase-7-7c/baseline-conservative-4h-v7-2.json';
import stress2h        from '../../../docs/audits/phase-7-7c/baseline-stress-2h-v7-2.json';
import stress4h        from '../../../docs/audits/phase-7-7c/baseline-stress-4h-v7-2.json';

const ALL_SCENARIOS = [
  ['base/2h',         base2h],
  ['base/4h',         base4h],
  ['conservative/2h', conservative2h],
  ['conservative/4h', conservative4h],
  ['stress/2h',       stress2h],
  ['stress/4h',       stress4h],
] as const;

describe('Phase 7.7c v7.2 — model_version + engine_changelog', () => {
  it.each(ALL_SCENARIOS)('every scenario stamps model_version v7.2 (%s)', (_label, fix) => {
    expect(fix.model_version).toBe('v7.2');
  });

  it('engine_changelog exposes both v7→v7.1 and v7.1→v7.2 transitions', () => {
    const cl = base4h.engine_changelog as { v7_to_v7_1: string[]; v7_1_to_v7_2: string[] };
    expect(Array.isArray(cl.v7_to_v7_1)).toBe(true);
    expect(Array.isArray(cl.v7_1_to_v7_2)).toBe(true);
    expect(cl.v7_1_to_v7_2.length).toBe(4);
  });

  it('v7.2 changelog mentions the four new surfaces', () => {
    const joined = (base4h.engine_changelog as { v7_1_to_v7_2: string[] })
      .v7_1_to_v7_2.join(' ').toLowerCase();
    expect(joined).toContain('lcos');
    expect(joined).toContain('moic');
    expect(joined).toContain('duration');
    expect(joined).toContain('assumptions panel');
  });
});

describe('LCOS — €/MWh-cycled sanity (7.7.3)', () => {
  it.each(ALL_SCENARIOS)('lcos_eur_mwh is in the [€60, €150] industry band (%s)', (_label, fix) => {
    expect(fix.lcos_eur_mwh).not.toBeNull();
    expect(fix.lcos_eur_mwh).toBeTypeOf('number');
    expect(fix.lcos_eur_mwh).toBeGreaterThanOrEqual(60);
    expect(fix.lcos_eur_mwh).toBeLessThanOrEqual(150);
  });

  it('base/4h LCOS is in the [€70, €120] tighter base-case band', () => {
    expect(base4h.lcos_eur_mwh).toBeGreaterThanOrEqual(70);
    expect(base4h.lcos_eur_mwh).toBeLessThanOrEqual(120);
  });

  it('LCOS rises monotonically with adverse scenarios at fixed duration', () => {
    // Charging cost rises (lower availability), CAPEX recovery is fixed,
    // discharged MWh falls (lower availability) → LCOS climbs in stress.
    expect(base4h.lcos_eur_mwh!).toBeLessThanOrEqual(stress4h.lcos_eur_mwh!);
    expect(base2h.lcos_eur_mwh!).toBeLessThanOrEqual(stress2h.lcos_eur_mwh!);
  });
});

describe('MOIC — multiple of money sanity (7.7.9)', () => {
  it.each(ALL_SCENARIOS)('moic is a positive number (%s)', (_label, fix) => {
    expect(fix.moic).not.toBeNull();
    expect(fix.moic).toBeTypeOf('number');
    expect(fix.moic).toBeGreaterThanOrEqual(0);
  });

  it('base/4h MOIC is in the [1.0×, 3.5×] base-case investor band', () => {
    expect(base4h.moic).toBeGreaterThanOrEqual(1.0);
    expect(base4h.moic).toBeLessThanOrEqual(3.5);
  });

  it('stress MOIC < base MOIC at the same duration (returns < capital)', () => {
    expect(stress4h.moic!).toBeLessThan(base4h.moic!);
    expect(stress2h.moic!).toBeLessThan(base2h.moic!);
  });

  it.each(ALL_SCENARIOS)('moic equals Σ positive equity_cf ÷ equity_initial within rounding (%s)', (_label, fix) => {
    type Yr = { equity_cf: number };
    const sumPositive = (fix.years as Yr[]).reduce(
      (s, y) => s + Math.max(0, y.equity_cf),
      0,
    );
    const expected = Math.round((sumPositive / fix.equity_initial) * 100) / 100;
    expect(fix.moic).toBeCloseTo(expected, 1);
  });
});

describe('Duration recommendation — real-options optimizer (7.7.15)', () => {
  it.each(ALL_SCENARIOS)('duration_recommendation echoes irr_2h and irr_4h (%s)', (_label, fix) => {
    const rec = fix.duration_recommendation as {
      irr_2h: number | null; irr_4h: number | null;
      optimal: number | null; delta_pp: number | null;
    };
    expect(rec).toBeDefined();
    expect(rec.irr_2h).toBe(fix.irr_2h);
    expect(rec.irr_4h).toBe(fix.irr_4h);
  });

  it('base scenarios pick the higher-IRR duration as optimal', () => {
    const rec = base4h.duration_recommendation as { optimal: number; irr_2h: number; irr_4h: number };
    if (rec.irr_2h != null && rec.irr_4h != null) {
      const expectedOptimal = rec.irr_4h > rec.irr_2h ? 4 : 2;
      expect(rec.optimal).toBe(expectedOptimal);
    }
  });

  it('delta_pp matches |irr_4h − irr_2h| × 100 within rounding', () => {
    const rec = base4h.duration_recommendation as {
      irr_2h: number; irr_4h: number; delta_pp: number;
    };
    if (rec.irr_2h != null && rec.irr_4h != null) {
      const expected = Math.round(Math.abs(rec.irr_4h - rec.irr_2h) * 10000) / 100;
      expect(rec.delta_pp).toBeCloseTo(expected, 2);
    }
  });

  it('stress scenarios degrade gracefully when IRR is null', () => {
    const rec = stress4h.duration_recommendation as {
      optimal: number | null; note: string;
    };
    if (stress4h.irr_2h == null || stress4h.irr_4h == null) {
      expect(rec.optimal).toBeNull();
      expect(rec.note.toLowerCase()).toContain('insufficient');
    }
  });
});

describe('Assumptions panel — read-only display (7.7.5)', () => {
  it.each(ALL_SCENARIOS)('panel exposes 5 rows with value/label/unit/note (%s)', (_label, fix) => {
    const panel = fix.assumptions_panel as Record<string, { value: number; label: string; unit: string; note: string }>;
    expect(panel).toBeDefined();
    for (const key of ['rte', 'cycles_per_year', 'availability', 'hold_period', 'wacc']) {
      const row = panel[key];
      expect(row, `panel.${key} present`).toBeDefined();
      expect(row.value).toBeTypeOf('number');
      expect(row.label.length).toBeGreaterThan(2);
      expect(typeof row.unit).toBe('string');
      expect(row.note.length).toBeGreaterThan(10);
    }
  });

  it('hold_period is exactly 20 years across every scenario', () => {
    for (const [, fix] of ALL_SCENARIOS) {
      expect(fix.assumptions_panel!.hold_period.value).toBe(20);
    }
  });

  it('wacc is exactly 8% (matches LCOS CRF and NPV discount rate)', () => {
    expect(base4h.assumptions_panel!.wacc.value).toBe(8);
  });

  it('availability matches the scenario availability factor', () => {
    // base = 95, conservative = 94, stress = 92 (from REVENUE_SCENARIOS)
    expect(base4h.assumptions_panel!.availability.value).toBe(95);
    expect(conservative4h.assumptions_panel!.availability.value).toBe(94);
    expect(stress4h.assumptions_panel!.availability.value).toBe(92);
  });

  it('RTE matches the engine roundtrip_efficiency value', () => {
    // assumptions_panel.rte.value is rounded to 1 decimal; roundtrip_efficiency is the raw value.
    const rounded = Math.round(base4h.roundtrip_efficiency! * 1000) / 10;
    expect(base4h.assumptions_panel!.rte.value).toBe(rounded);
  });
});
