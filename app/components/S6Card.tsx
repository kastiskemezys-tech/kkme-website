'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { hydro6Color } from './s6-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

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
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.52), textTransform: 'uppercase' }}>
          S6 — Nordic Hydro Reservoir
        </p>
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

      {status === 'loading' && <Skeleton />}
      {status === 'error'   && <ErrorState />}
      {status === 'success' && data && (
        <LiveData data={data} isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} history={history} />
      )}
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

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const signalColor = hydro6Color(data.signal ?? null);
  const ts = data.timestamp ?? null;

  const devSign = (data.deviation_pp ?? 0) >= 0 ? '+' : '';

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: signalColor }}>
            {data.fill_pct != null ? `${safeNum(data.fill_pct, 1)}%` : '—'}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.4) }}>
            {data.signal ?? ''}
          </span>
        </p>
        <Sparkline values={history} color="#6fa3ef" width={80} height={24} />
      </div>

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
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
