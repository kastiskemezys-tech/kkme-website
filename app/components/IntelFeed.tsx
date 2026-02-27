'use client';

import { useState, useEffect, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const TOPICS = ['ALL', 'BESS', 'DC', 'HYDROGEN', 'BATTERIES', 'GRID', 'TECHNOLOGY'] as const;
type Topic = typeof TOPICS[number];

interface FeedItem {
  id:            string;
  title:         string;
  topic:         string;
  added_at:      string;
  url?:          string | null;
  source?:       string | null;
  summary?:      string | null;
  content_type?: string;
  companies?:    string[];
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties  = { fontFamily: 'var(--font-mono)' };
const SERIF: CSSProperties = { fontFamily: 'var(--font-serif)' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}

// ─── Source icon ──────────────────────────────────────────────────────────────

function SourceIcon({ source }: { source: string | null | undefined }) {
  if (!source) return null;

  const s = source.toLowerCase();

  if (s.includes('linkedin')) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px', opacity: 0.45 }}>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    );
  }

  if (s.includes('substack')) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px', opacity: 0.45 }}>
        <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
      </svg>
    );
  }

  if (s.includes('twitter') || s.includes('x.com')) {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px', opacity: 0.45 }}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.736l7.733-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }

  return null;
}

// ─── Company chips ─────────────────────────────────────────────────────────────

function CompanyChips({ companies }: { companies?: string[] }) {
  if (!companies?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
      {companies.map(co => (
        <span
          key={co}
          style={{
            ...MONO,
            fontSize: '0.4rem',
            letterSpacing: '0.06em',
            padding: '0.12rem 0.45rem',
            border: '1px solid rgba(123, 94, 167, 0.22)',
            background: 'rgba(123, 94, 167, 0.06)',
            color: 'rgba(123, 94, 167, 0.7)',
            borderRadius: '2px',
          }}
        >
          {co}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function IntelFeed() {
  const [items, setItems]       = useState<FeedItem[]>([]);
  const [active, setActive]     = useState<Topic>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`${WORKER_URL}/feed`)
      .then(r => r.json())
      .then((d: { items?: FeedItem[] }) => { setItems(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Strip bot commands and items too short/incomplete to be useful
  const visible = items.filter(i =>
    !i.title?.match(/^\/\w+/) &&     // no bot commands
    (i.title?.length ?? 0) >= 20 &&  // min title length
    (i.url || (i.summary && i.summary.length > 30))  // needs URL or meaningful summary
  );

  const filtered = active === 'ALL'
    ? visible
    : visible.filter(i => i.topic.toUpperCase() === active);

  return (
    <section style={{ maxWidth: '440px', width: '100%' }}>
      {/* Section header */}
      <h2 style={{ ...MONO, fontSize: '0.75rem', letterSpacing: '0.14em', color: text(0.52), fontWeight: 400, textTransform: 'uppercase', marginBottom: '1.25rem' }}>
        Intel Feed
      </h2>

      {/* Topic filter pills */}
      <nav aria-label="Intel feed filters">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
          {TOPICS.map(t => {
            const isActive = t === active;
            return (
              <button
                key={t}
                onClick={() => setActive(t)}
                aria-pressed={isActive}
                style={{
                  ...MONO,
                  fontSize: '0.5rem',
                  letterSpacing: '0.08em',
                  padding: '0.25rem 0.6rem',
                  border: `1px solid ${isActive ? 'rgba(123, 94, 167, 0.6)' : text(0.12)}`,
                  background: isActive ? 'rgba(123, 94, 167, 0.08)' : 'none',
                  color: isActive ? text(0.7) : text(0.45),
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
      </nav>

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
              <span style={{ ...MONO, fontSize: '0.45rem', letterSpacing: '0.1em', color: text(0.45), textTransform: 'uppercase', flexShrink: 0 }}>
                {item.topic}
              </span>
              <span style={{ ...MONO, fontSize: '0.45rem', color: text(0.35), flexShrink: 0 }}>
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

            {/* Source row: icon + domain */}
            {item.source && (
              <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.35), marginTop: '0.2rem' }}>
                <SourceIcon source={item.source} />
                {item.source}
              </p>
            )}

            {/* Company chips */}
            <CompanyChips companies={item.companies} />

            {/* Expanded: summary */}
            {isOpen && item.summary && (
              <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.45), lineHeight: 1.65, marginTop: '0.6rem', borderLeft: `2px solid rgba(123,94,167,0.22)`, paddingLeft: '0.6rem' }}>
                {item.summary}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
