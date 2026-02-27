'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { hydro6Color } from './s6-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';
import { signalColor } from '@/lib/signalColor';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S6Signal {
  timestamp?:       string | null;
  signal?:          string | null;
  fill_pct?:        number | null;
  median_fill_pct?: number | null;
  deviation_pp?:    number | null;
  week?:            number | null;
  year?:            number | null;
  interpretation?:  string | null;
  _stale?:          boolean;
  _age_hours?:      number | null;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

export function S6Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S6Signal>(`${WORKER_URL}/s6`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s6/history`)
      .then(r => r.json())
      .then((h: Array<{ fill_pct: number }>) => setHistory(h.map(e => e.fill_pct)))
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <SignalIcon type="hydro" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          Nordic Hydro Reservoir
        </h3>
      </div>

      <CardDisclosure
        explain={[
          'Norway reservoir fill as % of total capacity.',
          'HIGH: >5pp above median → surplus, lower Nordic baseload likely.',
          'LOW: >5pp below median → deficit, upward price pressure.',
        ]}
        dataLines={[
          'Source: NVE biapi (magasinstatistikk) — weekly release',
          'Coverage: Norway aggregate (all reservoirs)',
          'Stale: 168h (weekly data)',
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
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>—</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em' }}>Fetching</p>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>—</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.625rem', color: text(0.40), letterSpacing: '0.1em' }}>Data unavailable</p>
    </>
  );
}

interface LiveDataProps {
  data: S6Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function FillBar({ fill, median }: { fill: number; median: number }) {
  const isLow  = fill < median - 5;
  const isHigh = fill > median + 5;
  const bg = isLow
    ? 'rgba(204,160,72,0.25)'
    : isHigh
    ? 'rgba(86,166,110,0.25)'
    : 'rgba(100,130,200,0.20)';
  const shimmerColor = isLow
    ? 'rgba(204,160,72,0.15)'
    : isHigh
    ? 'rgba(86,166,110,0.15)'
    : 'rgba(100,130,200,0.12)';

  return (
    <div style={{ margin: '12px 0 8px' }}>
      <div style={{ position: 'relative', height: '28px', background: 'rgba(232,226,217,0.06)', border: '1px solid rgba(232,226,217,0.10)', overflow: 'hidden' }}>
        {/* Fill level */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(fill, 100)}%`, background: bg, transition: 'width 0.6s ease' }} />
        {/* Water-shimmer highlight */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.min(fill, 100)}%`,
          background: shimmerColor,
          animation: 'water-shimmer 3s ease-in-out infinite',
        }} />
        {/* Median marker */}
        <div style={{ position: 'absolute', left: `${Math.min(median, 100)}%`, top: '-4px', bottom: '-4px', width: '1px', background: 'rgba(232,226,217,0.40)' }} />
        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'rgba(232,226,217,0.80)' }}>
          {fill.toFixed(1)}%
        </span>
        <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(232,226,217,0.42)' }}>
          median {median.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(232,226,217,0.32)' }}>
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
    </div>
  );
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const devPP = data.deviation_pp ?? 0;
  const heroState = devPP < -5 ? 'negative' : devPP > 5 ? 'positive' : 'neutral';
  const heroColor = signalColor(heroState);
  const ts = data.timestamp ?? null;

  const devSign = devPP >= 0 ? '+' : '';

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: heroColor }}>
            {data.fill_pct != null ? `${safeNum(data.fill_pct, 1)}%` : '—'}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.4) }}>
            {data.signal ?? ''}
          </span>
        </p>
        <Sparkline values={history} color="#6fa3ef" width={160} height={40} />
      </div>

      {/* Fill bar */}
      {data.fill_pct != null && data.median_fill_pct != null && (
        <FillBar fill={data.fill_pct} median={data.median_fill_pct} />
      )}

      {/* Deviation row */}
      {data.deviation_pp != null && (
        <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.45), lineHeight: 1.5, marginBottom: '0.75rem' }}>
          {devSign}{safeNum(data.deviation_pp, 1)}pp vs median
          {data.median_fill_pct != null && ` (median ${safeNum(data.median_fill_pct, 1)}%)`}
          {data.week != null && `, week ${data.week}`}
        </p>
      )}

      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.4), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.interpretation ?? '—'}
      </p>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTs(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Weekly NVE release"
        compare="Signal: deviation vs historical median ±5pp"
        updated={`NVE ${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
