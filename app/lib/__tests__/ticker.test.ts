import { describe, it, expect } from 'vitest';
import { unitForTickerKind, formatTickerItem } from '../ticker';

describe('ticker units', () => {
  it('reserve products render €/MW/h (capacity payment)', () => {
    expect(unitForTickerKind('afrr')).toBe('€/MW/h');
    expect(unitForTickerKind('mfrr')).toBe('€/MW/h');
    expect(unitForTickerKind('fcr')).toBe('€/MW/h');
  });

  it('DA capture renders €/MWh (energy)', () => {
    expect(unitForTickerKind('da_capture')).toBe('€/MWh');
  });

  it('formatTickerItem composes label, value, and correct unit', () => {
    expect(formatTickerItem('afrr', 'AFRR', 5.64, 2)).toBe('AFRR €5.64/MW/h');
    expect(formatTickerItem('mfrr', 'MFRR', 11.6, 1)).toBe('MFRR €11.6/MW/h');
    expect(formatTickerItem('fcr', 'FCR', 0.37, 2)).toBe('FCR €0.37/MW/h');
    expect(formatTickerItem('da_capture', 'DA CAPTURE', 36, 0)).toBe('DA CAPTURE €36/MWh');
  });

  it('reserve products never render €/MWh (regression for 7.6.1)', () => {
    for (const k of ['afrr', 'mfrr', 'fcr'] as const) {
      const out = formatTickerItem(k, 'X', 10);
      expect(out).not.toMatch(/\/MWh\b/); // bare /MWh would be the bug
      expect(out).toContain('/MW/h');
    }
  });
});
