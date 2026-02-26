'use client';

import { useState, type CSSProperties } from 'react';
import type { S1Signal } from '@/lib/signals/s1';
import { getInterpretation, spreadColor } from './s1-utils';
import { CardFooter } from './CardFooter';
import { StaleBanner } from './StaleBanner';
import { useSignal } from '@/lib/useSignal';

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

const btnStyle = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: '0.5rem',
  letterSpacing: '0.06em',
  color: active ? 'rgba(232, 226, 217, 0.7)' : 'rgba(232, 226, 217, 0.28)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
});

export function S1Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S1Signal>('https://kkme-fetch-s1.kastis-kemezys.workers.dev/read');
  const [explainOpen, setExplainOpen] = useState(false);
  const [dataOpen, setDataOpen]       = useState(false);

  const toggleExplain = () => { setExplainOpen(o => !o); setDataOpen(false); };
  const toggleData    = () => { setDataOpen(o => !o); setExplainOpen(false); };

  return (
    <article
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.35), textTransform: 'uppercase' }}>
          S1 — Baltic Price Separation
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={toggleExplain} style={btnStyle(explainOpen)}>[Explain]</button>
          <button onClick={toggleData}    style={btnStyle(dataOpen)}>[Data]</button>
        </div>
      </div>

      {explainOpen && (
        <div style={{ ...MONO, fontSize: '0.575rem', color: 'rgba(232, 226, 217, 0.5)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.4rem' }}>LT-SE4 spread emerged post-synchronisation (Feb 2025). Nordic hydro deficit and Baltic thermal constraints drive persistent divergence.</p>
          <p>aFRR and mFRR capacity prices are the primary BESS revenue driver. DA arbitrage is secondary. Revenue window closes 2028–2029 as new capacity enters.</p>
        </div>
      )}

      {dataOpen && (
        <div style={{ ...MONO, fontSize: '0.5rem', color: 'rgba(232, 226, 217, 0.4)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.3rem' }}>Source: ENTSO-E Transparency Platform · API A44 (day-ahead prices)</p>
          <p style={{ marginBottom: '0.3rem' }}>LT: 10YLT-1001A0008Q · SE4: 10Y1001A1001A46L</p>
          <p>Updated daily 06:00 UTC via Cloudflare Worker cron</p>
        </div>
      )}

      {status === 'loading' && <Skeleton />}
      {status === 'error'   && <ErrorState />}
      {status === 'success' && data && (
        <LiveData data={data} isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />
      )}
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

interface LiveDataProps {
  data:          S1Signal;
  isDefault:     boolean;
  isStale:       boolean;
  ageHours:      number | null;
  defaultReason: string | null;
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason }: LiveDataProps) {
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
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

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
      <time dateTime={data.updated_at ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em' }}>
        {data.updated_at ? formatTimestamp(data.updated_at) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Daily average"
        compare="Baseline: SE4 Nordic reference"
        updated="ENTSO-E A44 · 06:00 UTC"
      />
    </>
  );
}
