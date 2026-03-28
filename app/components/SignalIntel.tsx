'use client';

import { useState, useEffect } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface FeedItem {
  id: string;
  title: string;
  consequence?: string;
  source_url?: string;
  published_at?: string;
  impact_direction?: string;
  feed_score?: number;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function effectDot(impact?: string): string {
  if (impact === 'positive') return '\u{1F7E2}';
  if (impact === 'negative') return '\u{1F7E0}';
  return '';
}

export function SignalIntel({ signalId }: { signalId: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`${WORKER_URL}/feed/by-signal?signal=${signalId}`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : d?.items || [];
        setItems(list.slice(0, 3));
      })
      .catch(() => {});
  }, [signalId]);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: '8px', marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          all: 'unset',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'color 150ms',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        {expanded ? '▾' : '▸'} Latest intel ({items.length})
      </button>

      {expanded && (
        <div style={{ marginTop: '6px', paddingLeft: '8px', borderLeft: '1px solid var(--border-card)' }}>
          {items.map(item => (
            <div key={item.id} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              marginBottom: '4px',
            }}>
              {effectDot(item.impact_direction)}{' '}
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-secondary)', textDecoration: 'none', borderBottom: '1px dotted var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                >
                  {item.title} ↗
                </a>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>{item.title}</span>
              )}
              {item.published_at && (
                <span style={{ marginLeft: '6px', opacity: 0.6 }}>
                  · {relativeTime(item.published_at)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
