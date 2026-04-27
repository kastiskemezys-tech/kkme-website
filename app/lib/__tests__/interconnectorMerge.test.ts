// Phase 12.7 — pins the persist-last-good and freshness merge semantics for
// the /s8 interconnector handler. Worker carries inline copies; if these
// tests change, mirror the change in workers/fetch-s1.js.

import { describe, it, expect } from 'vitest';
import { safe, freshnessFor } from '../interconnectorHelpers';

describe('safe(current, fallback)', () => {
  it('returns current when not null', () => {
    expect(safe(432, 100)).toBe(432);
  });

  it('returns fallback when current is null', () => {
    expect(safe(null, 100)).toBe(100);
  });

  it('returns null when both are null', () => {
    expect(safe(null, null)).toBe(null);
  });

  it('returns null when fallback is undefined', () => {
    expect(safe(null, undefined)).toBe(null);
  });

  it('preserves zero (not falsy)', () => {
    expect(safe(0, 100)).toBe(0);
  });

  it('preserves negative values (LT exporting case)', () => {
    expect(safe(-432, 100)).toBe(-432);
  });
});

describe('freshnessFor(current, fallback)', () => {
  it('returns "live" when current populated', () => {
    expect(freshnessFor(432, 100)).toBe('live');
  });

  it('returns "stale" when only fallback populated', () => {
    expect(freshnessFor(null, 100)).toBe('stale');
  });

  it('returns null when both null', () => {
    expect(freshnessFor(null, null)).toBe(null);
  });

  it('returns "live" when current is zero (balanced flow)', () => {
    expect(freshnessFor(0, 100)).toBe('live');
  });
});
