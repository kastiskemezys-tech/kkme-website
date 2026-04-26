import { describe, it, expect } from 'vitest';
import { formatTimestamp } from '../freshness';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-04-26T14:30:00Z');

describe('formatTimestamp', () => {
  it('renders "just now" for sub-minute deltas', () => {
    expect(formatTimestamp(NOW - 30_000, NOW)).toBe('just now');
  });

  it('renders relative minutes when <1h old', () => {
    expect(formatTimestamp(NOW - 12 * 60_000, NOW)).toBe('12m ago');
    expect(formatTimestamp(NOW - 45 * 60_000, NOW)).toBe('45m ago');
  });

  it('renders relative hours from 1h–24h', () => {
    expect(formatTimestamp(NOW - 2 * HOUR, NOW)).toBe('2h ago');
    expect(formatTimestamp(NOW - 18 * HOUR, NOW)).toBe('18h ago');
  });

  it('the 24h boundary picks relative ("24h ago")', () => {
    expect(formatTimestamp(NOW - 24 * HOUR, NOW)).toBe('24h ago');
  });

  it('flips to absolute UTC ISO8601 above 24h', () => {
    expect(formatTimestamp(NOW - 25 * HOUR, NOW)).toBe('2026-04-25 13:30 UTC');
    expect(formatTimestamp(NOW - 5 * 24 * HOUR, NOW)).toBe('2026-04-21 14:30 UTC');
  });

  it('returns "—" when input is null/undefined/unparseable', () => {
    expect(formatTimestamp(null, NOW)).toBe('—');
    expect(formatTimestamp(undefined, NOW)).toBe('—');
    expect(formatTimestamp('not a date', NOW)).toBe('—');
  });

  it('always shows the timezone (UTC) for absolute readings', () => {
    expect(formatTimestamp(NOW - 30 * HOUR, NOW)).toMatch(/ UTC$/);
  });
});

