import { describe, it, expect } from 'vitest';
import {
  fmtTooltipDate,
  fmtTooltipTime,
  fmtTooltipValue,
} from '../chartTooltip';

describe('fmtTooltipDate', () => {
  it('formats a Date as "Apr 27" by default', () => {
    expect(fmtTooltipDate(new Date('2026-04-27T12:00:00Z'))).toBe('Apr 27');
  });

  it('includes weekday when showWeekday=true', () => {
    expect(fmtTooltipDate(new Date('2026-04-27T12:00:00Z'), { showWeekday: true })).toMatch(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d+ Apr/,
    );
  });

  it('includes year when showYear=true', () => {
    expect(fmtTooltipDate(new Date('2026-04-27T12:00:00Z'), { showYear: true })).toMatch(
      /^\d+ Apr 2026$/,
    );
  });

  it('handles weekday + year together', () => {
    expect(
      fmtTooltipDate(new Date('2026-04-27T12:00:00Z'), { showWeekday: true, showYear: true }),
    ).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d+ Apr 2026$/);
  });

  it('handles ISO string input', () => {
    expect(fmtTooltipDate('2026-04-27T12:00:00Z')).toBe('Apr 27');
  });

  it('falls back to the raw string when unparseable', () => {
    expect(fmtTooltipDate('not-a-date')).toBe('not-a-date');
  });
});

describe('fmtTooltipTime', () => {
  it('passes through HH:MM strings with a UTC suffix', () => {
    expect(fmtTooltipTime('14:30')).toBe('14:30 UTC');
  });

  it('strips seconds when present', () => {
    expect(fmtTooltipTime('14:30:00')).toBe('14:30 UTC');
  });

  it('extracts HH:MM from an ISO timestamp', () => {
    expect(fmtTooltipTime('2026-04-27T14:30:00Z')).toBe('14:30 UTC');
  });

  it('returns empty for empty input', () => {
    expect(fmtTooltipTime('')).toBe('');
  });
});

describe('fmtTooltipValue', () => {
  it('€/MWh uses 2 decimals with currency-leading symbol', () => {
    expect(fmtTooltipValue(12.345, '€/MWh')).toBe('€12.35/MWh');
  });

  it('MW uses 0 decimals', () => {
    expect(fmtTooltipValue(432.7, 'MW')).toBe('433 MW');
  });

  it('% uses 1 decimal with no space', () => {
    expect(fmtTooltipValue(85.234, '%')).toBe('85.2%');
  });

  it('c/d uses 2 decimals with a space', () => {
    expect(fmtTooltipValue(1.234, 'c/d')).toBe('1.23 c/d');
  });

  it('EFCs/yr uses 0 decimals with thousands separator', () => {
    expect(fmtTooltipValue(1234.5, 'EFCs/yr')).toBe('1,235 EFCs/yr');
  });

  it('large MW shortens to k', () => {
    expect(fmtTooltipValue(12345, 'MW')).toBe('12.3k MW');
  });

  it('multi-million count shortens to M', () => {
    expect(fmtTooltipValue(2_345_678, 'EFCs/yr')).toBe('2.3M EFCs/yr');
  });

  it('ratio (×) renders without a space', () => {
    expect(fmtTooltipValue(2.51, '×')).toBe('2.51×');
  });

  it('pp uses 2 decimals with no space', () => {
    expect(fmtTooltipValue(0.453, 'pp')).toBe('0.45pp');
  });

  it('returns "—" for nullish / NaN values', () => {
    expect(fmtTooltipValue(NaN, '€/MWh')).toBe('—');
    expect(fmtTooltipValue(Infinity, 'MW')).toBe('—');
  });

  it('€/MW/h renders with the trailing path verbatim', () => {
    expect(fmtTooltipValue(8.21, '€/MW/h')).toBe('€8.21/MW/h');
  });

  it('default falls back to 2 decimals', () => {
    expect(fmtTooltipValue(0.123, 'whatever')).toBe('0.12 whatever');
  });
});
