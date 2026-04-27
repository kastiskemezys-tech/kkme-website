/**
 * Homepage preview block — top 3 most-recent items.
 * Lives in the #intel section; links to /regulatory for full archive.
 */
import Link from 'next/link';
import { loadRegulatoryFeed, sortItems, DISCLAIMER } from '@/lib/regulatory';
import { RegulatoryItem } from './RegulatoryItem';

export function RegulatoryPreview() {
  const result = loadRegulatoryFeed();

  if (!result.ok) {
    // Don't shout the error on the homepage — silently degrade so the rest
    // of #intel keeps reading well. The /regulatory page surfaces the issue.
    return null;
  }

  const top3 = sortItems(result.feed.items).slice(0, 3);
  if (top3.length === 0) return null;

  const lastUpdated = result.feed.feed_metadata.last_updated;
  const lastUpdatedShort = lastUpdated.slice(0, 10);

  return (
    <div
      style={{
        marginBottom: '32px',
        padding: '20px 0',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '16px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              margin: 0,
              fontWeight: 500,
            }}
          >
            Lithuanian BESS regulatory updates
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              margin: '4px 0 0',
              letterSpacing: '0.04em',
            }}
          >
            Updated {lastUpdatedShort} · weekly
          </p>
        </div>
        <Link
          href="/regulatory"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--teal)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          See all updates →
        </Link>
      </header>

      {top3.map((item) => (
        <RegulatoryItem
          key={item.id}
          item={item}
          impactTooltip={result.feed.impact_levels[item.impact]}
          variant="compact"
        />
      ))}

      <p
        style={{
          marginTop: '16px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          fontStyle: 'normal',
        }}
      >
        {DISCLAIMER}
      </p>
    </div>
  );
}
