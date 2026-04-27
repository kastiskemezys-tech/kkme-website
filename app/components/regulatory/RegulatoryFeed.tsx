/**
 * Full archive list — grouped by scan_date (week-of header).
 * Client component so it can read URL search params for filtering.
 */
'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  type RegulatoryFeed as RegulatoryFeedType,
  type RegulatoryItem as RegulatoryItemType,
} from '@/lib/regulatory-schema';
import { groupByWeek, sortItems } from '@/lib/regulatory';
import { RegulatoryItem } from './RegulatoryItem';

const formatWeekHeader = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1] ?? m;
  return `Week of ${Number(d)} ${monthShort} ${y}`;
};

export function RegulatoryFeedView({
  feed,
}: {
  feed: RegulatoryFeedType;
}) {
  const searchParams = useSearchParams();
  const impactFilter = searchParams.get('impact');
  const categoryFilter = searchParams.get('category');
  const tagFilter = searchParams.get('tag');

  const filteredSorted = useMemo(() => {
    const filtered = feed.items.filter((it) => {
      if (impactFilter && it.impact !== impactFilter) return false;
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (tagFilter && !it.tags.includes(tagFilter)) return false;
      return true;
    });
    return groupByWeek(sortItems(filtered));
  }, [feed.items, impactFilter, categoryFilter, tagFilter]);

  if (filteredSorted.length === 0) {
    return (
      <div
        style={{
          padding: '40px 0',
          textAlign: 'center',
          fontFamily: 'var(--font-serif)',
          color: 'var(--text-tertiary)',
          fontStyle: 'italic',
        }}
      >
        No items match the current filters.
      </div>
    );
  }

  return (
    <div>
      {filteredSorted.map(({ scanDate, items }) => (
        <section key={scanDate} style={{ marginBottom: '40px' }}>
          <header
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            {formatWeekHeader(scanDate)} · {items.length} {items.length === 1 ? 'update' : 'updates'}
          </header>
          {items.map((item) => (
            <RegulatoryItem
              key={item.id}
              item={item}
              impactTooltip={feed.impact_levels[item.impact]}
              variant="full"
            />
          ))}
        </section>
      ))}
    </div>
  );
}

export type { RegulatoryItemType };
