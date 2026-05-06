import { describe, it, expect } from 'vitest';
import { formatTimestamp, freshnessLabel } from '../freshness';

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

// Phase 12.11 — calendar-today-in-EET semantics for the TODAY chip bucket.
// Per discipline rule #2 (no-hardcoded-temporal-label), the TODAY label must
// reflect a calendar-day computation in Europe/Vilnius (Baltic operator + reader
// audience), not a raw hours-stale bucket.
describe('freshnessLabel — calendar-today-in-EET', () => {
  it('reads STALE when timestamp falls in a previous EET calendar day, even if <24h old', () => {
    // Now: 2026-05-06 12:33 UTC = 15:33 EET (summer, UTC+3) → 2026-05-06 EET.
    // ts:  2026-05-05 18:00 UTC = 21:00 EET prev day → 2026-05-05 EET.
    // hoursStale ≈ 18.5h, different EET days. Old behaviour returned TODAY;
    // new behaviour returns STALE because the EET calendar day differs.
    const now = Date.parse('2026-05-06T12:33:00Z');
    const ts = Date.parse('2026-05-05T18:00:00Z');
    expect(freshnessLabel(ts, now).label).toBe('STALE');
  });

  it('reads TODAY when timestamp and now share the same EET calendar day in the 6h–24h window', () => {
    // Now: 2026-05-06 18:00 UTC = 21:00 EET 2026-05-06.
    // ts:  2026-05-06 06:00 UTC = 09:00 EET 2026-05-06.
    // hoursStale = 12h, same EET day → TODAY.
    const now = Date.parse('2026-05-06T18:00:00Z');
    const ts = Date.parse('2026-05-06T06:00:00Z');
    expect(freshnessLabel(ts, now).label).toBe('TODAY');
  });

  it('LIVE/RECENT bands win over the EET-day check (recency takes precedence)', () => {
    // Now: 2026-05-06 22:00 UTC = 01:00 EET 2026-05-07 (next EET day).
    // ts:  2026-05-06 20:00 UTC = 23:00 EET 2026-05-06 (prev EET day).
    // hoursStale = 2h. Different EET days, but RECENT wins.
    const now = Date.parse('2026-05-06T22:00:00Z');
    const ts = Date.parse('2026-05-06T20:00:00Z');
    expect(freshnessLabel(ts, now).label).toBe('RECENT');
  });

  it('preserves the STALE → OUTDATED boundary at 72h', () => {
    const now = Date.parse('2026-05-06T12:00:00Z');
    expect(freshnessLabel(now - 71 * HOUR, now).label).toBe('STALE');
    expect(freshnessLabel(now - 73 * HOUR, now).label).toBe('OUTDATED');
  });

  it('preserves the LIVE band (<1h)', () => {
    const now = Date.parse('2026-05-06T12:00:00Z');
    expect(freshnessLabel(now - 30 * 60_000, now).label).toBe('LIVE');
  });

  it('returns OUTDATED with absolute "—" for null/undefined/unparseable input', () => {
    const now = Date.parse('2026-05-06T12:00:00Z');
    expect(freshnessLabel(null, now).label).toBe('OUTDATED');
    expect(freshnessLabel(undefined, now).label).toBe('OUTDATED');
    expect(freshnessLabel('not a date', now).label).toBe('OUTDATED');
  });
});
