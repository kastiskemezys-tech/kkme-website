import { describe, it, expect } from 'vitest';
import { eetOffsetHours, utcHourToEet, formatHourEET } from '../hourLabels';

// Reference dates well inside each season, so DST flips are not in scope.
// EU DST runs from last Sunday of March (~25–31) to last Sunday of October.
const WINTER = '2026-01-15T00:00:00Z'; // EET (UTC+2)
const SUMMER = '2026-07-15T00:00:00Z'; // EEST (UTC+3)

describe('eetOffsetHours', () => {
  it('returns 2 in winter (EET)', () => {
    expect(eetOffsetHours(WINTER)).toBe(2);
  });

  it('returns 3 in summer (EEST, EU DST)', () => {
    expect(eetOffsetHours(SUMMER)).toBe(3);
  });

  it('falls back to 2 when input is unparseable', () => {
    expect(eetOffsetHours('not a date')).toBe(2);
  });
});

describe('utcHourToEet', () => {
  it('UTC h0 in winter → h2 (EET, 2am local)', () => {
    expect(utcHourToEet(0, WINTER)).toBe(2);
  });

  it('UTC h0 in summer → h3 (EEST, 3am local)', () => {
    expect(utcHourToEet(0, SUMMER)).toBe(3);
  });

  it('UTC h17 in winter → h19 (evening peak)', () => {
    expect(utcHourToEet(17, WINTER)).toBe(19);
  });

  it('UTC h22 in winter wraps past midnight → h0 next day', () => {
    expect(utcHourToEet(22, WINTER)).toBe(0);
  });

  it('UTC h23 in summer wraps past midnight → h2 next day', () => {
    expect(utcHourToEet(23, SUMMER)).toBe(2);
  });

  it('non-finite hour falls back to 0', () => {
    expect(utcHourToEet(Number.NaN, WINTER)).toBe(0);
  });
});

describe('formatHourEET', () => {
  it('renders the canonical "h{N} EET" string', () => {
    expect(formatHourEET(0, WINTER)).toBe('h2 EET');
    expect(formatHourEET(17, WINTER)).toBe('h19 EET');
    expect(formatHourEET(0, SUMMER)).toBe('h3 EET'); // colloquial EET label
  });
});
