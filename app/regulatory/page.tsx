/**
 * /regulatory — full archive of Lithuanian BESS regulatory updates.
 *
 * Static-rendered. Reads data/regulatory_feed.json at build time.
 * Filtering UI (impact / category / tag) is client-side via URL search params.
 *
 * Disclaimer required by feed contract §5: this is not legal advice.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadRegulatoryFeed, DISCLAIMER } from '@/lib/regulatory';
import {
  type Impact,
  type RegulatoryItem,
} from '@/lib/regulatory-schema';
import { RegulatoryFeedView } from '@/app/components/regulatory/RegulatoryFeed';
import { RegulatoryFilters } from '@/app/components/regulatory/RegulatoryFilters';
import { RegulatoryEmpty } from '@/app/components/regulatory/RegulatoryEmpty';

export const metadata: Metadata = {
  title: 'Regulatory updates — KKME',
  description:
    'Weekly Lithuanian and EU regulatory updates relevant to BESS procurement, operation, and grid connection. Curated by KKME Energy Advisory.',
};

export default function RegulatoryPage() {
  const result = loadRegulatoryFeed();

  if (!result.ok) {
    return (
      <main style={{ padding: '80px 24px 120px', maxWidth: '880px', margin: '0 auto' }}>
        <PageHeader />
        <RegulatoryEmpty result={result} />
        <Footer />
      </main>
    );
  }

  const { feed } = result;
  const items = feed.items;

  if (items.length === 0) {
    return (
      <main style={{ padding: '80px 24px 120px', maxWidth: '880px', margin: '0 auto' }}>
        <PageHeader />
        <RegulatoryEmpty
          result={{ ok: false, reason: 'feed-missing' }}
          description={feed.feed_metadata.description}
          nextRun={feed.feed_metadata.next_run}
        />
        <Footer />
      </main>
    );
  }

  // Build filter facet counts from FULL item set (not filtered) so chip labels
  // remain stable across user toggles.
  const impactCounts = countBy(items, (it) => it.impact) as Record<Impact, number>;
  const categoryCounts = countMap(items, (it) => it.category);
  const tagCounts = countMap(items.flatMap((it) => it.tags.map((t) => ({ tag: t }))), (it) => it.tag);

  const categories = Array.from(categoryCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  const tags = Array.from(tagCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <main style={{ padding: '80px 24px 120px', maxWidth: '880px', margin: '0 auto' }}>
      <PageHeader description={feed.feed_metadata.description} lastUpdated={feed.feed_metadata.last_updated} nextRun={feed.feed_metadata.next_run} />

      <Suspense fallback={null}>
        <RegulatoryFilters
          impactCounts={{
            high: impactCounts.high ?? 0,
            medium: impactCounts.medium ?? 0,
            low: impactCounts.low ?? 0,
          }}
          categories={categories}
          tags={tags}
        />
        <RegulatoryFeedView feed={feed} />
      </Suspense>

      <Footer />
    </main>
  );
}

function PageHeader({
  description,
  lastUpdated,
  nextRun,
}: {
  description?: string;
  lastUpdated?: string;
  nextRun?: string;
}) {
  return (
    <header style={{ marginBottom: '32px' }}>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          margin: '0 0 8px',
        }}
      >
        KKME · Lithuanian BESS regulatory monitor
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(28px, 4vw, 44px)',
          color: 'var(--text-primary)',
          lineHeight: 1.1,
          margin: '0 0 16px',
          fontWeight: 400,
        }}
      >
        Regulatory updates
      </h1>
      {description ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-base)',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '0 0 12px',
            maxWidth: '64ch',
          }}
        >
          {description}
        </p>
      ) : null}
      {lastUpdated || nextRun ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          {lastUpdated ? `Updated ${lastUpdated.slice(0, 10)}` : null}
          {lastUpdated && nextRun ? ' · ' : null}
          {nextRun ? `Next run ${nextRun.slice(0, 10)}` : null}
        </p>
      ) : null}
    </header>
  );
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: '64px',
        paddingTop: '24px',
        borderTop: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        letterSpacing: '0.04em',
        lineHeight: 1.5,
      }}
    >
      {DISCLAIMER}
    </footer>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
function countBy<T, K extends string | number | symbol>(
  items: T[],
  key: (t: T) => K,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const it of items) {
    const k = key(it);
    out[k] = ((out[k] ?? 0) as number) + 1;
  }
  return out;
}

function countMap<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

// Suppress TS unused-import warning when components are tree-shaken.
export type _RegulatoryItemRef = RegulatoryItem;
