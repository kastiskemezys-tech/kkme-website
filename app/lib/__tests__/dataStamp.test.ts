/**
 * Phase 38.1 — freshness badges must measure data age, not fetch age.
 *
 * Before this phase the S1 and S2 cards sat side by side badging different
 * quantities. S1 passed its capture's computation stamp (a data stamp) and read
 * `STALE · 33h ago` honestly through an 8-tick ingestion outage. S2 passed
 * `timestamp`, the moment the fetch ran, and read "1h ago" over a
 * `data_window_end` of 2026-07-30 — three days of lag, and the field was
 * rendered nowhere on the site.
 *
 * `marketDayEndStamp` is the one conversion both surfaces now share.
 */

import { describe, it, expect } from 'vitest';
import { marketDayEndStamp, freshnessLabel } from '../freshness';

describe('marketDayEndStamp', () => {
  it('a window ending on day D covers through the END of D', () => {
    // Not D at 00:00 — that would age the series a full day too fast.
    expect(marketDayEndStamp('2026-07-30')).toBe('2026-07-31T00:00:00.000Z');
  });

  it('refuses to guess', () => {
    // Returning a fetch stamp on missing input is the exact substitution this
    // phase removes, so the helper must not be able to make it.
    expect(marketDayEndStamp(null)).toBeNull();
    expect(marketDayEndStamp(undefined)).toBeNull();
    expect(marketDayEndStamp('')).toBeNull();
    expect(marketDayEndStamp('2026-07-30T00:00:00Z')).toBeNull();
    expect(marketDayEndStamp('30/07/2026')).toBeNull();
    expect(marketDayEndStamp('not-a-date')).toBeNull();
  });
});

describe('the S2 shape that made a 3-day-old window read fresh', () => {
  // The live payload, 2026-08-02T09:17Z: fetched minutes ago, data through
  // 2026-07-30. The badge is required to describe the second, not the first.
  const now = Date.parse('2026-08-02T09:17:00Z');
  const fetchStamp = '2026-08-02T08:00:04.124Z';
  const windowEnd = '2026-07-30';

  it('the fetch stamp would have claimed the data was an hour old', () => {
    const wrong = freshnessLabel(fetchStamp, now);
    expect(wrong.label).toBe('RECENT');
    expect(wrong.age).toBe('1h ago');
  });

  it('the data stamp tells the truth about the same payload', () => {
    const right = freshnessLabel(marketDayEndStamp(windowEnd), now);
    expect(right.label).toBe('STALE');
    expect(right.hoursStale).toBeGreaterThan(48);
  });

  it('the data stamp is never fresher than the fetch stamp for the same payload', () => {
    // The invariant, independent of these particular fixtures: you cannot know
    // more recent data than the moment you fetched it. A future regression that
    // reintroduces the substitution breaks this without needing new numbers.
    const dataAge = freshnessLabel(marketDayEndStamp(windowEnd), now).hoursStale;
    const fetchAge = freshnessLabel(fetchStamp, now).hoursStale;
    expect(dataAge).toBeGreaterThanOrEqual(fetchAge);
  });
});
