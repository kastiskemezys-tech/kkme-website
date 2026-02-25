'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S2Signal {
  timestamp: string;
  fcr_avg:       number | null;
  afrr_up_avg:   number | null;
  afrr_down_avg: number | null;
  pct_up:        number | null;
  pct_down:      number | null;
  imbalance_mean: number | null;
  imbalance_p90:  number | null;
  pct_above_100:  number | null;
  ordered_price?: number | null;
  ordered_mw?:    number | null;
  signal: 'EARLY' | 'ACTIVE' | 'COMPRESSING';
  interpretation: string;
  source: string;
  unavailable?: boolean;
}

const SIGNAL_COLOR: Record<S2Signal['signal'], string> = {
  EARLY:       'rgba(74, 124, 89, 0.85)',
  ACTIVE:      'rgba(100, 100, 140, 0.85)',
  COMPRESSING: 'rgba(180, 140, 60, 0.85)',
};

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function fmt(n: number | null, decimals = 1): string {
  return n === null ? '—' : n.toFixed(decimals);
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

export function S2Card() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData]     = useState<S2Signal | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(`${WORKER_URL}/s2`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as S2Signal;
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
        S2 — Balancing Stack
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
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
        ——————
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
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
        ——————
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

function LiveData({ data }: { data: S2Signal }) {
  const signalColor = SIGNAL_COLOR[data.signal];

  const metrics: [string, string][] = [
    ['FCR',    `${fmt(data.fcr_avg)} €/MW/h`],
    ['aFRR ↑', `${fmt(data.afrr_up_avg)} €/MW/h`],
    ['Sys ↑↓', `${fmt(data.pct_up)}% ↑ / ${fmt(data.pct_down)}% ↓`],
    ['P90',    `${fmt(data.imbalance_p90)} €/MWh`],
  ];

  return (
    <>
      {/* Optional Litgrid tomorrow ordered line */}
      {(data.ordered_price != null || data.ordered_mw != null) && (
        <p style={{ ...MONO, fontSize: '0.575rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Tomorrow ordered{data.ordered_price != null ? ` ${data.ordered_price} €/MW/h` : ''}
          {data.ordered_mw != null ? ` · ${data.ordered_mw} MW` : ''}
        </p>
      )}

      {/* Large signal word */}
      <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
        {data.unavailable ? (
          <span style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: text(0.15) }}>——————</span>
        ) : (
          <span style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: signalColor }}>
            {data.signal}
          </span>
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

      {/* Four metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.25rem', marginBottom: '1.5rem' }}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              {label}
            </p>
            <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.6) }}>
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
