'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { gasColor } from './s7-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S7Signal {
  timestamp?:    string | null;
  signal?:       string | null;
  ttf_eur_mwh?:  number | null;
  ttf_trend?:    string | null;
  interpretation?: string | null;
  _stale?:       boolean;
  _age_hours?:   number | null;
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

export function S7Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S7Signal>(`${WORKER_URL}/s7`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s7/history`)
      .then(r => r.json())
      .then((h: Array<{ ttf_eur_mwh: number }>) => setHistory(h.map(e => e.ttf_eur_mwh)))
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
          S7 — TTF Gas Price
        </p>
      </div>

      <CardDisclosure
        explain={[
          'TTF: Dutch Title Transfer Facility — European gas benchmark.',
          'HIGH >50 €/MWh: gas-fired peakers expensive → strong BESS arbitrage case.',
          'LOW <15 €/MWh: cheap gas compresses peaker margins.',
        ]}
        dataLines={[
          'Source: energy-charts.info API (weekly EU gas prices)',
          'No authentication required',
          'Stale: 12h',
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
  data: S7Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const signalColor = gasColor(data.signal ?? null);
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: signalColor }}>
            {data.ttf_eur_mwh != null ? `${safeNum(data.ttf_eur_mwh, 1)}` : '—'}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.4) }}>
            €/MWh {data.ttf_trend ?? ''}
          </span>
        </p>
        <Sparkline values={history} color="#f6a35a" width={80} height={24} />
      </div>

      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.4), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.interpretation ?? '—'}
      </p>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTs(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="energy-charts.info weekly"
        compare="Threshold: >50 HIGH · >30 ELEVATED · <15 LOW"
        updated={`TTF ${formatHHMM(ts)} UTC`}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
