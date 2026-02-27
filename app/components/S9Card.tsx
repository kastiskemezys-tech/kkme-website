'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { carbonColor } from './s9-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S9Signal {
  timestamp?:     string | null;
  signal?:        string | null;
  eua_eur_t?:     number | null;
  eua_trend?:     string | null;
  interpretation?: string | null;
  _stale?:        boolean;
  _age_hours?:    number | null;
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

export function S9Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S9Signal>(`${WORKER_URL}/s9`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s9/history`)
      .then(r => r.json())
      .then((h: Array<{ eua_eur_t: number }>) => setHistory(h.map(e => e.eua_eur_t)))
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
          S9 — EU ETS Carbon
        </p>
      </div>

      <CardDisclosure
        explain={[
          'EU ETS: European Allowance price €/t CO₂.',
          'HIGH >70 €/t: strong incentive to displace gas peakers with BESS.',
          'LOW <30 €/t: reduced carbon premium on peaker economics.',
        ]}
        dataLines={[
          'Source: energy-charts.info API (weekly EU CO₂ price)',
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
  data: S9Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const signalColor = carbonColor(data.signal ?? null);
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: signalColor }}>
            {data.eua_eur_t != null ? `${safeNum(data.eua_eur_t, 1)}` : '—'}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.4) }}>
            €/t {data.eua_trend ?? ''}
          </span>
        </p>
        <Sparkline values={history} color="#c084fc" width={80} height={24} />
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
        compare="Threshold: >70 HIGH · >50 ELEVATED · <30 LOW"
        updated={`EUA ${formatHHMM(ts)} UTC`}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
