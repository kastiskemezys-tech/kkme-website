'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { S1Signal } from '@/lib/signals/s1';
import { getInterpretation, spreadColor } from './s1-utils';

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
const RETRY_DELAY_MS   = 2_000;

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

const DIVIDER: CSSProperties = {
  borderTop: `1px solid rgba(232, 226, 217, 0.06)`,
  width: '100%',
};

function LiveData({ data }: { data: S1Signal }) {
  const heroColor = spreadColor(data.spread_eur_mwh);
  const interp    = getInterpretation(data.state, data.separation_pct);

  // Regime metrics — safe fallback to '—' for old KV entries without historical data
  const rsi      = data.rsi_30d != null
    ? `${data.rsi_30d >= 0 ? '+' : ''}${data.rsi_30d.toFixed(2)}`
    : '—';
  const trend    = data.trend_vs_90d != null
    ? (data.trend_vs_90d >= 0 ? '↑' : '↓')
    : '—';
  const capture  = data.pct_hours_above_20 != null
    ? `${data.pct_hours_above_20.toFixed(1)}%`
    : '—';

  const sourceRows: [string, string][] = [
    ['LT avg',  `${data.lt_avg_eur_mwh.toFixed(2)} €/MWh`],
    ['SE4 avg', `${data.se4_avg_eur_mwh.toFixed(2)} €/MWh`],
    ['Spread',  `${data.spread_eur_mwh >= 0 ? '+' : ''}${data.spread_eur_mwh.toFixed(2)} €/MWh`],
  ];

  // 90d rolling stats — fall back to 30d rolling avg if no history yet
  const spreadP50 = data.spread_stats_90d?.p50;
  const spreadN   = data.spread_stats_90d?.days_of_data ?? 0;
  const spread90d = spreadP50 != null
    ? `${spreadP50 >= 0 ? '+' : ''}${spreadP50.toFixed(1)} €`
    : (rsi !== '—' ? `${rsi} €` : '—');

  const regimeMetrics: [string, string][] = [
    ['90d median', spread90d],
    ['Trend',      trend],
    ['Capture',    capture],
  ];

  return (
    <>
      {/* Tomorrow DA — available after ~13:00 CET when ENTSO-E publishes */}
      {data.da_tomorrow?.lt_peak != null && (
        <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.35), letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Tomorrow: {data.da_tomorrow.lt_peak.toFixed(0)} peak · {data.da_tomorrow.lt_avg?.toFixed(0) ?? '—'} avg €/MWh
        </p>
      )}

      {/* Today's spread — €/MWh is primary, color reflects magnitude */}
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: heroColor, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.3rem' }}>
        {data.spread_eur_mwh >= 0 ? '+' : ''}{data.spread_eur_mwh.toFixed(1)}
        <span style={{ fontSize: '0.45em', marginLeft: '0.15em', opacity: 0.55 }}>€/MWh</span>
      </p>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.08em', marginBottom: '0.75rem' }}
         title="% unreliable when SE4 near zero — use €/MWh">
        {formatPct(data.separation_pct)}% vs SE4
        {data.lt_daily_swing_eur_mwh != null
          ? ` · swing ${data.lt_daily_swing_eur_mwh.toFixed(0)} €/MWh`
          : ''}
      </p>

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.35), lineHeight: 1.65, marginBottom: '1.5rem' }}>
        {interp}
      </p>

      {/* Divider */}
      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Regime metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '0.5rem' }}>
        {regimeMetrics.map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              {label}
            </p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        {spreadN < 14
          ? `Building history — ${spreadN} day${spreadN === 1 ? '' : 's'} of data`
          : `${spreadN} days of data`}
      </p>

      {/* Divider */}
      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Source data grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1.5rem', rowGap: '0.35rem', marginBottom: '1.5rem' }}>
        {sourceRows.map(([label, value]) => (
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.3), letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>{value}</span>
          </span>
        ))}
      </div>

      {/* Timestamp */}
      <time dateTime={data.updated_at} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em' }}>
        {formatTimestamp(data.updated_at)}
      </time>
    </>
  );
}
