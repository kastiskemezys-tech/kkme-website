/**
 * Single regulatory item card. Server component.
 *
 * Per feed contract §4:
 *  - Impact badge (color via sentiment palette)
 *  - Title (h3) + LT subtitle (italic) per decision A: show-by-default
 *  - Metadata row: event_date · source · category
 *  - Summary (1-4 sentences from feed; never auto-translated)
 *  - "Read source" link, opens in new tab
 *
 * Stable id used as anchor fragment for permalinks.
 */
import { StatusChip } from '@/app/components/primitives/StatusChip';
import {
  type RegulatoryItem as RegulatoryItemType,
  type Impact,
} from '@/lib/regulatory-schema';
import { impactSentiment } from '@/lib/regulatory';

interface Props {
  item: RegulatoryItemType;
  impactTooltip?: string;
  /** Compact = preview block; full = /regulatory archive page. */
  variant?: 'compact' | 'full';
}

const formatDate = (iso: string): string => {
  // YYYY-MM-DD → "26 Apr 2026" — terse, mono-friendly
  const [y, m, d] = iso.split('-');
  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1] ?? m;
  return `${Number(d)} ${monthShort} ${y}`;
};

const impactLabel: Record<Impact, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export function RegulatoryItem({ item, impactTooltip, variant = 'full' }: Props) {
  const sentiment = impactSentiment(item.impact);
  const dateLabel =
    item.event_date_qualifier === 'deadline'
      ? `Deadline ${formatDate(item.event_date)}`
      : formatDate(item.event_date);

  return (
    <article
      id={item.id}
      style={{
        padding: variant === 'full' ? '20px 0' : '16px 0',
        borderTop: '1px solid var(--border-subtle)',
        scrollMarginTop: '80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '12px',
          marginBottom: '8px',
          flexWrap: 'wrap',
        }}
      >
        <span title={impactTooltip}>
          <StatusChip status={impactLabel[item.impact]} sentiment={sentiment} />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {dateLabel} · {item.source} · {item.category.replace(/_/g, ' ')}
        </span>
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: variant === 'full' ? 'var(--font-lg)' : 'var(--font-base)',
          color: 'var(--text-primary)',
          lineHeight: 1.3,
          margin: 0,
          fontWeight: 500,
        }}
      >
        {item.title}
      </h3>

      {item.title_lt ? (
        <p
          lang="lt"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            lineHeight: 1.4,
            margin: '4px 0 0',
          }}
        >
          {item.title_lt}
        </p>
      ) : null}

      {variant === 'full' ? (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-base)',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '12px 0 0',
          }}
        >
          {item.summary}
        </p>
      ) : null}

      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
        }}
      >
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--teal)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Read source ↗
        </a>
        {item.act_reference ? (
          <span style={{ color: 'var(--text-muted)' }}>
            {item.act_reference}
          </span>
        ) : null}
      </div>
    </article>
  );
}
