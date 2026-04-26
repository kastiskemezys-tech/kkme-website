import { describe, it, expect } from 'vitest';
import { formatNumber, formatNumberA11y, type NumberKind } from '../format';

// Phase 8.3c — formatNumber + a11y twin. Covers each NumberKind for precision +
// unit suffix; a11y twin verifies verbose unit phrasing on five representative
// kinds (per prompt). Edge cases: null/undefined, very large, negative.

describe('formatNumber — per-kind precision and unit', () => {
  it('capacity_mw: <100 → no decimals; ≥100 → 1 decimal', () => {
    expect(formatNumber(42, 'capacity_mw')).toBe('42 MW');
    expect(formatNumber(99, 'capacity_mw')).toBe('99 MW');
    expect(formatNumber(127.4, 'capacity_mw')).toBe('127.4 MW');
    expect(formatNumber(1234.56, 'capacity_mw')).toBe('1,234.6 MW');
  });

  it('capacity_gw: 2 decimals', () => {
    expect(formatNumber(1.23, 'capacity_gw')).toBe('1.23 GW');
    expect(formatNumber(2, 'capacity_gw')).toBe('2.00 GW');
  });

  it('price_eur_mwh: 1 decimal', () => {
    expect(formatNumber(36.42, 'price_eur_mwh')).toBe('36.4 €/MWh');
    expect(formatNumber(0, 'price_eur_mwh')).toBe('0.0 €/MWh');
  });

  it('price_eur_mw_h: 2 decimals (capacity payment, NOT €/MWh)', () => {
    expect(formatNumber(5.64, 'price_eur_mw_h')).toBe('5.64 €/MW/h');
    expect(formatNumber(11.6, 'price_eur_mw_h')).toBe('11.60 €/MW/h');
  });

  it('price_eur_mw_day: integer', () => {
    expect(formatNumber(292.4, 'price_eur_mw_day')).toBe('292 €/MW/day');
    expect(formatNumber(1234, 'price_eur_mw_day')).toBe('1,234 €/MW/day');
  });

  it('price_eur_mw_yr: nearest 1k, formatted as €Xk', () => {
    expect(formatNumber(114321, 'price_eur_mw_yr')).toBe('€114k');
    expect(formatNumber(99500, 'price_eur_mw_yr')).toBe('€100k');
    expect(formatNumber(0, 'price_eur_mw_yr')).toBe('€0k');
  });

  it('percent: 1 decimal', () => {
    expect(formatNumber(61.04, 'percent')).toBe('61.0%');
    expect(formatNumber(8.6, 'percent')).toBe('8.6%');
  });

  it('percent_pp: signed prefix, 1 decimal', () => {
    expect(formatNumber(1.2, 'percent_pp')).toBe('+1.2 pp');
    expect(formatNumber(-0.5, 'percent_pp')).toBe('−0.5 pp');
    expect(formatNumber(0, 'percent_pp')).toBe('0.0 pp');
  });

  it('irr: input is decimal, output is % with 1 decimal', () => {
    expect(formatNumber(0.086, 'irr')).toBe('8.6%');
    expect(formatNumber(0.11, 'irr')).toBe('11.0%');
  });

  it('multiple / ratio: 2 decimals + × suffix', () => {
    expect(formatNumber(1.85, 'multiple')).toBe('1.85×');
    expect(formatNumber(1.2, 'ratio')).toBe('1.20×');
  });

  it('cycles_per_yr: integer with suffix', () => {
    expect(formatNumber(350, 'cycles_per_yr')).toBe('350 cyc/yr');
    expect(formatNumber(347.6, 'cycles_per_yr')).toBe('348 cyc/yr');
  });

  it('count: integer with thousands separator', () => {
    expect(formatNumber(1234, 'count')).toBe('1,234');
    expect(formatNumber(29, 'count')).toBe('29');
  });

  it('ssh_pct: integer %', () => {
    expect(formatNumber(35.4, 'ssh_pct')).toBe('35%');
    expect(formatNumber(100, 'ssh_pct')).toBe('100%');
  });
});

describe('formatNumber — null / undefined / non-finite', () => {
  const ALL_KINDS: NumberKind[] = [
    'capacity_mw', 'capacity_gw', 'price_eur_mwh', 'price_eur_mw_h',
    'price_eur_mw_day', 'price_eur_mw_yr', 'percent', 'percent_pp',
    'irr', 'multiple', 'ratio', 'cycles_per_yr', 'count', 'ssh_pct',
  ];

  for (const k of ALL_KINDS) {
    it(`${k}: null → "n/a"`, () => {
      expect(formatNumber(null, k)).toBe('n/a');
    });
  }

  it('undefined / NaN / Infinity → "n/a"', () => {
    expect(formatNumber(undefined, 'capacity_mw')).toBe('n/a');
    expect(formatNumber(NaN, 'percent')).toBe('n/a');
    expect(formatNumber(Infinity, 'percent')).toBe('n/a');
    expect(formatNumber(-Infinity, 'percent')).toBe('n/a');
  });
});

describe('formatNumber — edge cases', () => {
  it('handles very large counts with thousands separator', () => {
    expect(formatNumber(10_000_000, 'count')).toBe('10,000,000');
  });

  it('handles very small numbers without flipping sign or losing precision', () => {
    expect(formatNumber(0.0001, 'percent')).toBe('0.0%');
    expect(formatNumber(0.0001, 'multiple')).toBe('0.00×');
  });

  it('handles negatives in capacity_mw / price_eur_mwh', () => {
    expect(formatNumber(-50, 'capacity_mw')).toBe('-50 MW');
    expect(formatNumber(-12.34, 'price_eur_mwh')).toBe('-12.3 €/MWh');
  });
});

describe('formatNumberA11y — verbose unit phrasing', () => {
  it('price_eur_mwh expands to "euros per megawatt-hour"', () => {
    expect(formatNumberA11y(36.4, 'price_eur_mwh')).toBe('36.4 euros per megawatt-hour');
  });

  it('price_eur_mw_h expands to "euros per megawatt per hour"', () => {
    expect(formatNumberA11y(5.64, 'price_eur_mw_h')).toBe('5.64 euros per megawatt per hour');
  });

  it('capacity_mw uses singular vs plural correctly', () => {
    expect(formatNumberA11y(1, 'capacity_mw')).toBe('1 megawatt');
    expect(formatNumberA11y(127.4, 'capacity_mw')).toBe('127.4 megawatts');
  });

  it('percent_pp directionalises (up / down / flat)', () => {
    expect(formatNumberA11y(1.2, 'percent_pp')).toBe('up 1.2 percentage points');
    expect(formatNumberA11y(-0.5, 'percent_pp')).toBe('down 0.5 percentage points');
    expect(formatNumberA11y(0, 'percent_pp')).toBe('0.0 percentage points');
  });

  it('irr expands to "<x> percent IRR"', () => {
    expect(formatNumberA11y(0.086, 'irr')).toBe('8.6 percent IRR');
  });

  it('null/undefined → "not available"', () => {
    expect(formatNumberA11y(null, 'price_eur_mwh')).toBe('not available');
    expect(formatNumberA11y(undefined, 'percent')).toBe('not available');
  });
});
