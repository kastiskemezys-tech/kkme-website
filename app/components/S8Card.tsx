'use client';

import { type CSSProperties } from 'react';
import { flowColor, flowSignalColor } from './s8-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S8Signal {
  timestamp?:        string | null;
  signal?:           string | null;
  nordbalt_avg_mw?:  number | null;
  litpol_avg_mw?:    number | null;
  nordbalt_signal?:  string | null;
  litpol_signal?:    string | null;
  interpretation?:   string | null;
  _stale?:           boolean;
  _age_hours?:       number | null;
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

function mwLabel(mw: number | null | undefined): string {
  if (mw == null) return '—';
  const sign = mw >= 0 ? '+' : '';
  return `${sign}${mw.toLocaleString('en-GB')} MW`;
}

export function S8Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S8Signal>(`${WORKER_URL}/s8`);

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
          S8 — Interconnector Flows
        </p>
      </div>

      <CardDisclosure
        explain={[
          'Net cross-border physical flows: LT → SE4 (NordBalt) and LT → PL (LitPol).',
          'Positive = LT exporting. Negative = LT importing.',
          'EXPORTING: >100 MW net out. IMPORTING: >100 MW net in.',
        ]}
        dataLines={[
          'Source: ENTSO-E Transparency Platform (A11 document type)',
          'Pairs: NordBalt (LT↔SE4), LitPol (LT↔PL)',
          'Stale: 12h',
        ]}
      />

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
  data: S8Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null;
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason }: LiveDataProps) {
  const signalColor = flowColor(data.signal ?? null);
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero */}
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: signalColor, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
        {data.signal ?? '—'}
      </p>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.52), letterSpacing: '0.08em', marginBottom: '1.25rem' }}>
        LT net cross-border balance
      </p>

      {/* Flow rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', marginBottom: '1.25rem' }}>
        {([
          ['NordBalt (→SE4)', data.nordbalt_avg_mw, data.nordbalt_signal],
          ['LitPol (→PL)',    data.litpol_avg_mw,   data.litpol_signal],
        ] as [string, number | null | undefined, string | null | undefined][]).map(([label, mw, sig]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.40), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: flowSignalColor(sig ?? null) }}>{mwLabel(mw)}</p>
            {sig && <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.40), marginTop: '0.1rem' }}>{sig}</p>}
          </div>
        ))}
      </div>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTs(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="ENTSO-E A11 hourly flows"
        compare="Net: >+100MW EXPORTING · <−100MW IMPORTING"
        updated={`ENTSO-E ${formatHHMM(ts)} UTC`}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
