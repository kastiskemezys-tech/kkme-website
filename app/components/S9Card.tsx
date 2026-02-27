'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { carbonColor } from './s9-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
import { BulletChart } from './BulletChart';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';
import { signalColor, regimeToState } from '@/lib/signalColor';

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
      className="signal-card"
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <SignalIcon type="carbon" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          EU ETS Carbon
        </h3>
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
  data: S9Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const heroColor = signalColor(regimeToState(data.signal));
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: heroColor }}>
            {data.eua_eur_t != null ? `${safeNum(data.eua_eur_t, 1)}` : '—'}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.4) }}>
            €/t {data.eua_trend ?? ''}
          </span>
        </p>
        <Sparkline values={history} color="#c084fc" width={160} height={40} />
      </div>

      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.4), lineHeight: 1.5, marginBottom: '1rem' }}>
        {data.interpretation ?? '—'}
      </p>

      {/* Bullet chart — EUA carbon range */}
      <BulletChart
        label="EUA carbon price"
        value={data.eua_eur_t ?? 0}
        min={0}
        max={120}
        unit="€/t"
        width={180}
        thresholds={[
          { value: 40, label: '40', color: 'rgba(74,222,128,1)' },
          { value: 60, label: '60', color: 'rgba(245,158,11,1)' },
          { value: 80, label: '80', color: 'rgba(239,68,68,1)' },
        ]}
      />

      {/* BESS breakeven annotation */}
      <p style={{ ...MONO, fontSize: '0.58rem', color: text(0.30), letterSpacing: '0.06em', marginTop: '0.35rem', marginBottom: '1rem' }}>
        BESS peaker displacement breakeven: ~€55/t · arbitrage premium above that threshold
        {data.eua_eur_t != null && data.eua_eur_t >= 55 && (
          <span style={{ color: 'rgba(86,166,110,0.75)', marginLeft: '6px' }}>↑ above breakeven</span>
        )}
        {data.eua_eur_t != null && data.eua_eur_t < 55 && (
          <span style={{ color: 'rgba(204,160,72,0.70)', marginLeft: '6px' }}>↓ below breakeven</span>
        )}
      </p>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right', marginTop: '1rem' }}>
        {ts ? formatTs(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="energy-charts.info weekly"
        compare="Threshold: >70 HIGH · >50 ELEVATED · <30 LOW"
        updated={`EUA ${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
