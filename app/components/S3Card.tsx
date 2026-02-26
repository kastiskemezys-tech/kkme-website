'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S3Signal {
  timestamp: string;
  lithium_eur_t?:        number | null;
  lithium_trend?:        '↓ falling' | '→ stable' | '↑ rising' | null;
  cell_eur_kwh?:         number | null;
  china_system_eur_kwh:  number;
  europe_system_eur_kwh: number;
  global_avg_eur_kwh:    number;
  ref_source:            string;
  euribor_3m:            number | null;
  euribor_trend:         '↓ falling' | '→ stable' | '↑ rising' | null;
  signal: 'COMPRESSING' | 'STABLE' | 'PRESSURE' | 'WATCH';
  interpretation: string;
  source: string;
  unavailable?: boolean;
}

const SIGNAL_COLOR: Record<S3Signal['signal'], string> = {
  COMPRESSING: 'rgba(74, 124, 89, 0.85)',
  STABLE:      'rgba(100, 100, 140, 0.85)',
  PRESSURE:    'rgba(155, 48, 67, 0.85)',
  WATCH:       'rgba(180, 140, 60, 0.85)',
};

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

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
  const [data, setData]     = useState<S3Signal | null>(null);

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
        S3 — Cell Cost Stack
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


function LiveData({ data }: { data: S3Signal }) {
  const signalColor = SIGNAL_COLOR[data.signal];

  return (
    <>
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

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.35), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.interpretation}
      </p>

      {/* Divider */}
      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Three-row cost stack: SYSTEM / FREIGHT / CAPITAL COST */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.45rem 1.25rem', marginBottom: '1.25rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.1em', textTransform: 'uppercase' }}>System</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {data.lithium_trend ?? '—'}
          {data.lithium_eur_t != null ? ` · €${data.lithium_eur_t.toLocaleString('en-GB')}/t` : ''}
          {data.cell_eur_kwh != null ? ` · €${data.cell_eur_kwh}/kWh` : ''}
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.1em', textTransform: 'uppercase' }}>Freight</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.3) }}>—</p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.1em', textTransform: 'uppercase' }}>Capital cost</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {data.euribor_3m != null ? `${data.euribor_3m}% 3M Euribor` : '—'}
        </p>
      </div>

      {/* Timestamp */}
      <time dateTime={data.timestamp} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {formatTimestamp(data.timestamp)}
      </time>
    </>
  );
}
