'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { S1Signal, SignalState } from '@/lib/signals/s1';

// Muted state colours — not traffic-light (per KKME.md design brief)
const STATE_COLOR: Record<SignalState, string> = {
  CALM: '#5a7d5e',
  WATCH: '#b8863a',
  ACT:  '#9b3043',
};

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

type Status = 'loading' | 'success' | 'error';

const FETCH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS  = 2_000;

export function S1Card() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<S1Signal | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch('https://kkme-fetch-s1.kastis-kemezys.workers.dev/read', { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as S1Signal;
        if (!cancelled) {
          setData(d);
          setStatus('success');
        }
      } catch (_err) {
        clearTimeout(timer);
        if (cancelled) return;
        if (attempt === 1) {
          // Retry once after a short delay
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
      {/* Signal label — always visible */}
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
        S1 — Baltic Price Separation
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

function LiveData({ data }: { data: S1Signal }) {
  const stateColor = STATE_COLOR[data.state];

  const rows: [string, string][] = [
    ['LT avg',  `${data.lt_avg_eur_mwh.toFixed(2)} €/MWh`],
    ['SE4 avg', `${data.se4_avg_eur_mwh.toFixed(2)} €/MWh`],
    ['Spread',  `${data.spread_eur_mwh >= 0 ? '+' : ''}${data.spread_eur_mwh.toFixed(2)} €/MWh`],
  ];

  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        {formatPct(data.separation_pct)}
        <span style={{ fontSize: '0.45em', marginLeft: '0.15em', opacity: 0.55 }}>%</span>
      </p>

      <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.18em', color: stateColor, textTransform: 'uppercase', marginBottom: '2rem' }}>
        ● {data.state}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1.5rem', rowGap: '0.35rem', marginBottom: '2rem' }}>
        {rows.map(([label, value]) => (
          // Fragment key must be on the wrapper, not on children
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.3), letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>{value}</span>
          </span>
        ))}
      </div>

      <time dateTime={data.updated_at} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em' }}>
        {formatTimestamp(data.updated_at)}
      </time>
    </>
  );
}
