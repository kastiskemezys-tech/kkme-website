'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import type { S1Signal } from '@/lib/signals/s1';
import { spreadColor } from './s1-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';
import { flashOnChange } from '@/lib/animations';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

export function S1Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S1Signal>(`${WORKER_URL}/read`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s1/history`)
      .then(r => r.json())
      .then((h: Array<{ spread_eur: number }>) => setHistory(h.map(e => e.spread_eur)))
      .catch(() => {});
  }, []);

  return (
    <article
      className="signal-card"
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
        <SignalIcon type="price-separation" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.8rem', letterSpacing: '0.14em', color: text(0.52), fontWeight: 400, textTransform: 'uppercase' }}>
          Baltic Price Separation
        </h3>
      </div>

      <CardDisclosure
        explain={[
          'Spread: LT minus SE4 day-ahead hourly average.',
          'Driver: usually NTC cap or Nordic wind dump to SE4.',
          'Below €15/MWh: coupling day, low congestion value.',
        ]}
        dataLines={[
          'Source: ENTSO-E A44 day-ahead prices',
          'Method: mean of 24 hourly prices, LT and SE4',
          'LT: 10YLT-1001A0008Q · SE4: 10Y1001A1001A46L',
          'Stale threshold: 36h',
        ]}
      />

      <div aria-live="polite" aria-atomic="false">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState />}
        {status === 'success' && data && (
          <LiveData data={data} isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} history={history} />
        )}
      </div>
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
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.40), letterSpacing: '0.1em' }}>
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
  history:       number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const heroRef   = useRef<HTMLParagraphElement>(null);
  const prevSpread = useRef<number | null>(null);

  useEffect(() => {
    if (heroRef.current && data.spread_eur_mwh != null) {
      if (prevSpread.current !== null && prevSpread.current !== data.spread_eur_mwh) {
        const dir: 'up' | 'down' | 'neutral' =
          data.spread_eur_mwh > prevSpread.current ? 'up' : 'down';
        flashOnChange(heroRef.current, dir);
      }
      prevSpread.current = data.spread_eur_mwh;
    }
  }, [data.spread_eur_mwh]);

  const heroColor = spreadColor(data.spread_eur_mwh);

  const spreadN   = data.spread_stats_90d?.days_of_data ?? 0;
  const spreadP50 = data.spread_stats_90d?.p50 ?? null;
  const medianLabel = spreadN >= 90 ? '90d median' : spreadN > 0 ? `${spreadN}d median` : 'Median';
  const compare   = spreadN > 7
    ? `vs ${medianLabel} ${safeNum(spreadP50, 0)} €/MWh`
    : 'building history (< 7 days)';

  const rsi     = data.rsi_30d != null
    ? `${data.rsi_30d >= 0 ? '+' : ''}${data.rsi_30d.toFixed(2)}`
    : '—';
  const trend   = data.trend_vs_90d != null ? (data.trend_vs_90d >= 0 ? '↑' : '↓') : '—';
  const capture = data.pct_hours_above_20 != null
    ? `${data.pct_hours_above_20.toFixed(1)}%` : '—';

  const spread90d = spreadP50 != null
    ? `${spreadP50 >= 0 ? '+' : ''}${spreadP50.toFixed(1)} €`
    : (rsi !== '—' ? `${rsi} €` : '—');

  const regimeMetrics: [string, string][] = [
    [medianLabel, spread90d],
    ['Trend',     trend],
    ['Capture',   capture],
  ];

  const sourceRows: [string, string][] = [
    ['LT avg',  `${safeNum(data.lt_avg_eur_mwh, 2)} €/MWh`],
    ['SE4 avg', `${safeNum(data.se4_avg_eur_mwh, 2)} €/MWh`],
    ['Spread',  `${data.spread_eur_mwh >= 0 ? '+' : ''}${safeNum(data.spread_eur_mwh, 2)} €/MWh`],
  ];

  const ts = data.updated_at ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {data.da_tomorrow?.lt_peak != null && (
        <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.52), letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Tomorrow: {safeNum(data.da_tomorrow.lt_peak, 0)} peak · {safeNum(data.da_tomorrow.lt_avg, 0)} avg €/MWh
        </p>
      )}

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.3rem' }}>
        <p
          ref={heroRef}
          style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: heroColor, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}
        >
          {data.spread_eur_mwh >= 0 ? '+' : ''}{safeNum(data.spread_eur_mwh, 1)}
          <span style={{ fontSize: '0.45em', marginLeft: '0.15em', opacity: 0.55 }}>€/MWh</span>
        </p>
        <Sparkline values={history} p50={spreadP50 ?? undefined} color="#4ade80" width={80} height={24} />
      </div>

      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
        {data.spread_eur_mwh >= 0 ? '+' : ''}{safeNum(data.separation_pct, 1)}% vs SE4
        {data.lt_daily_swing_eur_mwh != null
          ? ` · swing ${safeNum(data.lt_daily_swing_eur_mwh, 0)} €/MWh`
          : ''}
      </p>

      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.52), lineHeight: 1.65, marginBottom: '1.5rem' }}>
        {data.interpretation ?? ''}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

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

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1.5rem', rowGap: '0.35rem', marginBottom: '1.5rem' }}>
        {sourceRows.map(([label, value]) => (
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.3), letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>{value}</span>
          </span>
        ))}
      </div>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em' }}>
        {ts ? formatTimestamp(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period={`Delivery ${data.da_tomorrow?.delivery_date ?? 'today'} · DA 24h avg`}
        compare={compare}
        updated={`~13:00 CET publish · fetched ${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
