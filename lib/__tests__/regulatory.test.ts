/**
 * Regulatory feed loader + schema gate tests.
 *
 * The renderer must refuse a major-version bump (HANDOVER §3, §7) and never
 * crash on a missing or malformed feed.
 */
import { describe, it, expect } from 'vitest';
import { feedSchema, itemSchema, SUPPORTED_MAJOR } from '../regulatory-schema';
import { sortItems, groupByWeek, impactSentiment } from '../regulatory';
import type { RegulatoryItem } from '../regulatory-schema';

const validItem: RegulatoryItem = {
  id: '2026-04-20-test-item',
  scan_date: '2026-04-20',
  event_date: '2026-04-15',
  title: 'Test',
  summary: 'Test summary.',
  source: 'VERT',
  source_type: 'lt_regulation',
  source_url: 'https://example.com',
  impact: 'medium',
  category: 'grid_connection',
  tags: ['bess'],
};

describe('SUPPORTED_MAJOR', () => {
  it('is pinned to 1', () => {
    expect(SUPPORTED_MAJOR).toBe('1');
  });
});

describe('itemSchema', () => {
  it('accepts a minimal valid item', () => {
    const r = itemSchema.safeParse(validItem);
    expect(r.success).toBe(true);
  });

  it('rejects malformed dates', () => {
    const r = itemSchema.safeParse({ ...validItem, scan_date: '20-04-2026' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown source_type', () => {
    const r = itemSchema.safeParse({ ...validItem, source_type: 'tweet' });
    expect(r.success).toBe(false);
  });

  it('accepts unknown category as raw string (HANDOVER §7)', () => {
    const r = itemSchema.safeParse({ ...validItem, category: 'completely_new_category' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid source_url', () => {
    const r = itemSchema.safeParse({ ...validItem, source_url: 'not-a-url' });
    expect(r.success).toBe(false);
  });

  it('accepts deadline qualifier', () => {
    const r = itemSchema.safeParse({
      ...validItem,
      event_date_qualifier: 'deadline',
    });
    expect(r.success).toBe(true);
  });
});

describe('feedSchema', () => {
  it('accepts a minimal valid feed', () => {
    const r = feedSchema.safeParse({
      schema_version: '1.0',
      feed_metadata: {
        title: 't',
        description: 'd',
        publisher: 'p',
        publisher_url: 'https://example.com',
        language: 'en',
        last_updated: '2026-04-20',
        next_run: '2026-04-27',
        cadence: 'weekly',
        items_count: 1,
      },
      categories: ['grid_connection'],
      impact_levels: { high: 'a', medium: 'b', low: 'c' },
      items: [validItem],
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const r = feedSchema.safeParse({ schema_version: '1.0' });
    expect(r.success).toBe(false);
  });
});

describe('sortItems', () => {
  it('sorts by scan_date desc, then impact desc, then event_date desc', () => {
    const a: RegulatoryItem = { ...validItem, id: 'a', scan_date: '2026-04-20', impact: 'low', event_date: '2026-04-19' };
    const b: RegulatoryItem = { ...validItem, id: 'b', scan_date: '2026-04-20', impact: 'high', event_date: '2026-04-15' };
    const c: RegulatoryItem = { ...validItem, id: 'c', scan_date: '2026-04-13', impact: 'high', event_date: '2026-04-12' };
    const sorted = sortItems([c, a, b]);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('groupByWeek', () => {
  it('groups by scan_date, weeks newest-first', () => {
    const a: RegulatoryItem = { ...validItem, id: 'a', scan_date: '2026-04-20' };
    const b: RegulatoryItem = { ...validItem, id: 'b', scan_date: '2026-04-13' };
    const c: RegulatoryItem = { ...validItem, id: 'c', scan_date: '2026-04-20' };
    const groups = groupByWeek([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups[0].scanDate).toBe('2026-04-20');
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(groups[1].scanDate).toBe('2026-04-13');
  });
});

describe('impactSentiment', () => {
  it('maps high → negative (rose), medium → caution (amber), low → neutral', () => {
    expect(impactSentiment('high')).toBe('negative');
    expect(impactSentiment('medium')).toBe('caution');
    expect(impactSentiment('low')).toBe('neutral');
  });
});
