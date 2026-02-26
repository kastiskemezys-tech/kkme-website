'use client';

import { useState, useEffect, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const TOPICS = ['ALL', 'BESS', 'DC', 'HYDROGEN', 'BATTERIES', 'GRID', 'TECHNOLOGY'] as const;
type Topic = typeof TOPICS[number];

interface FeedItem {
  id:           string;
  title:        string;
  topic:        string;
  added_at:     string;
  url?:         string | null;
  source?:      string | null;
  summary?:     string | null;
  content_type?: string;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };
const SERIF: CSSProperties = { fontFamily: 'var(--font-serif)' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function IntelFeed() {
  const [items, setItems]     = useState<FeedItem[]>([]);
  const [active, setActive]   = useState<Topic>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${WORKER_URL}/feed`)
      .then(r => r.json())
      .then((d: { items?: FeedItem[] }) => { setItems(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = active === 'ALL'
    ? items
    : items.filter(i => i.topic.toUpperCase() === active);

  return (
    <section style={{ maxWidth: '440px', width: '100%' }}>
      {/* Section header */}
      <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.35), textTransform: 'uppercase', marginBottom: '1.25rem' }}>
        Intel Feed
      </p>

      {/* Topic filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {TOPICS.map(t => {
          const isActive = t === active;
          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              style={{
                ...MONO,
                fontSize: '0.5rem',
                letterSpacing: '0.08em',
                padding: '0.25rem 0.6rem',
                border: `1px solid ${isActive ? 'rgba(123, 94, 167, 0.6)' : text(0.12)}`,
                background: isActive ? 'rgba(123, 94, 167, 0.08)' : 'none',
                color: isActive ? text(0.7) : text(0.3),
                cursor: 'pointer',
                borderRadius: '2px',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Feed rows */}
      {loading && (
        <p style={{ ...MONO, fontSize: '0.575rem', color: text(0.2), letterSpacing: '0.06em' }}>
          Fetching feed…
        </p>
      )}

      {!loading && filtered.length === 0 && (
        <p style={{ ...MONO, fontSize: '0.575rem', color: text(0.2), letterSpacing: '0.06em' }}>
          No items yet.
        </p>
      )}

      {!loading && filtered.map(item => {
        const isOpen = expanded === item.id;
        return (
          <div
            key={item.id}
            style={{
              borderTop: `1px solid ${text(0.06)}`,
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(isOpen ? null : item.id)}
          >
            {/* Row header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ ...MONO, fontSize: '0.45rem', letterSpacing: '0.1em', color: text(0.25), textTransform: 'uppercase', flexShrink: 0 }}>
                {item.topic}
              </span>
              <span style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), flexShrink: 0 }}>
                {formatDate(item.added_at)}
              </span>
            </div>

            {/* Title */}
            <p style={{ ...SERIF, fontSize: '0.75rem', color: text(0.65), lineHeight: 1.55, marginTop: '0.3rem', marginBottom: 0 }}>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: 'inherit', textDecoration: 'none', borderBottom: `1px solid ${text(0.15)}` }}
                >
                  {item.title}
                </a>
              ) : item.title}
            </p>
            {item.source && (
              <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), marginTop: '0.2rem' }}>
                {item.source}
              </p>
            )}

            {/* Expanded: summary */}
            {isOpen && item.summary && (
              <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.4), lineHeight: 1.65, marginTop: '0.6rem', borderLeft: `2px solid rgba(123,94,167,0.22)`, paddingLeft: '0.6rem' }}>
                {item.summary}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
