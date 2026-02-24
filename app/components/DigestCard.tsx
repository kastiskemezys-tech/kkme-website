'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { DigestItem } from '@/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

type Status = 'loading' | 'empty' | 'success' | 'error';

const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS   = 2_000;

export function DigestCard() {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<DigestItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(`${WORKER_URL}/digest`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as DigestItem[];
        if (!cancelled) {
          if (d.length === 0) {
            setStatus('empty');
          } else {
            setItems(d);
            setStatus('success');
          }
        }
      } catch (_err) {
        clearTimeout(timer);
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          if (!cancelled) await load(2);
        } else {
          setStatus('error');
        }
      }
    };

    load(1);
    return () => { cancelled = true; };
  }, []);

  return (
    <article
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          letterSpacing: '0.14em',
          color: text(0.35),
          textTransform: 'uppercase',
          marginBottom: '1.75rem',
        }}
      >
        Daily Digest
      </p>

      {status === 'loading' && <DigestSkeleton />}
      {status === 'error'   && <DigestError />}
      {status === 'empty'   && <DigestEmpty />}
      {status === 'success' && <DigestList items={items} />}
    </article>
  );
}

function DigestSkeleton() {
  return (
    <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em' }}>
      Fetching
    </p>
  );
}

function DigestError() {
  return (
    <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.25), letterSpacing: '0.1em' }}>
      Data unavailable
    </p>
  );
}

function DigestEmpty() {
  return (
    <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.25), letterSpacing: '0.1em' }}>
      No entries this week
    </p>
  );
}

function DigestList({ items }: { items: DigestItem[] }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <p
              style={{
                ...MONO,
                fontSize: '0.6875rem',
                color: text(0.75),
                letterSpacing: '0.01em',
                lineHeight: 1.45,
                marginBottom: '0.5rem',
              }}
            >
              {item.title}
            </p>
          </a>

          <p
            style={{
              ...MONO,
              fontSize: '0.625rem',
              color: text(0.5),
              lineHeight: 1.6,
              marginBottom: '0.65rem',
            }}
          >
            {item.summary}
          </p>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
            <span style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em' }}>
              {item.source}
            </span>
            <span style={{ ...MONO, fontSize: '0.575rem', color: text(0.2) }}>
              {formatDate(item.date)}
            </span>
            <span style={{ ...MONO, fontSize: '0.575rem', color: text(0.15), marginLeft: 'auto' }}>
              {'▪'.repeat(item.relevance)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
