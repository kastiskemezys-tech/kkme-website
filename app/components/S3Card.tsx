'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S3Signal {
  timestamp: string;
  price_raw: number;
  price_unit: string;
  signal: 'FALLING' | 'STABLE' | 'RISING';
  interpretation: string;
  source: string;
  unavailable?: boolean;
  _scrape_error?: string;
  _scrape_debug?: { status: number | null; bodyPreview: string };
}

const SIGNAL_COLOR: Record<S3Signal['signal'], string> = {
  FALLING: 'rgba(74, 124, 89, 0.7)',
  STABLE:  'rgba(100, 100, 140, 0.7)',
  RISING:  'rgba(155, 48, 67, 0.7)',
};

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatPrice(n: number): string {
  return n.toLocaleString('en-GB');
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

type Status = 'loading' | 'success' | 'error';

const FETCH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS   = 2_000;

export function S3Card() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<S3Signal | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(`${WORKER_URL}/s3`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as S3Signal;
        if (!cancelled) { setData(d); setStatus('success'); }
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
        S3 — Lithium Cell Price
      </p>

      {status === 'loading' && <Skeleton />}
      {status === 'error'   && <ErrorState />}
      {status === 'success' && data && <LiveData data={data} />}
    </article>
  );
}

function Skeleton() {
  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        —
      </p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em' }}>
        Fetching
      </p>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        —
      </p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.25), letterSpacing: '0.1em' }}>
        Data unavailable
      </p>
    </>
  );
}

const DIVIDER: CSSProperties = {
  borderTop: `1px solid rgba(232, 226, 217, 0.06)`,
  width: '100%',
};

function LiveData({ data }: { data: S3Signal }) {
  const signalColor = SIGNAL_COLOR[data.signal];

  const metrics: [string, string][] = [
    ['Source', data.source],
    ['Updated', formatTimestamp(data.timestamp).split(',')[0]],
  ];

  return (
    <>
      {/* Large price number */}
      <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
        {data.unavailable ? (
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: text(0.15) }}>—</span>
        ) : (
          <>
            <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: 'var(--text)' }}>
              {formatPrice(data.price_raw)}
            </span>
            <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.35) }}>
              {data.price_unit}
            </span>
          </>
        )}
      </p>

      {/* Signal badge */}
      <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.18em', color: signalColor, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        ● {data.signal}
      </p>

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.35), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.interpretation}
      </p>

      {/* Divider */}
      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', marginBottom: '1.5rem' }}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              {label}
            </p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Timestamp */}
      <time dateTime={data.timestamp} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {formatTimestamp(data.timestamp)}
      </time>
    </>
  );
}
