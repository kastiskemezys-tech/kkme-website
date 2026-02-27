'use client';

import { useState, type CSSProperties } from 'react';
import { flowColor, flowSignalColor } from './s8-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { SignalIcon } from './SignalIcon';
import { BalticMap } from './BalticMap';
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

function dirLabel(sig: string | null | undefined): string {
  if (sig === 'EXPORTING') return 'EXPORTING';
  if (sig === 'IMPORTING') return 'IMPORTING';
  return 'BALANCED';
}

function dirColor(sig: string | null | undefined): string {
  if (sig === 'EXPORTING') return 'rgba(45,212,168,0.85)';
  if (sig === 'IMPORTING') return 'rgba(245,158,11,0.85)';
  return 'rgba(232,226,217,0.38)';
}

export function S8Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S8Signal>(`${WORKER_URL}/s8`);
  const [mapView, setMapView] = useState<'bess' | 'dc'>('bess');

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
        <SignalIcon type="flows" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          Interconnector Flows
        </h3>
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

      <div aria-live="polite" aria-atomic="false">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState />}
        {status === 'success' && data && (
          <LiveData data={data} isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} mapView={mapView} setMapView={setMapView} />
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
  data: S8Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null;
  mapView: 'bess' | 'dc'; setMapView: (v: 'bess' | 'dc') => void;
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, mapView, setMapView }: LiveDataProps) {
  const ts = data.timestamp ?? null;

  // Per-arc direction — fully independent
  const nbSig = data.nordbalt_signal ?? null;
  const lpSig = data.litpol_signal  ?? null;

  // Hero: dominant direction = whichever arc has higher |MW|
  const nbMw = Math.abs(data.nordbalt_avg_mw ?? 0);
  const lpMw = Math.abs(data.litpol_avg_mw  ?? 0);
  const dominantSig = nbMw >= lpMw ? nbSig : lpSig;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero — dominant direction */}
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: dirColor(dominantSig), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
        {dirLabel(dominantSig)}
      </p>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.52), letterSpacing: '0.08em', marginBottom: '1.25rem' }}>
        LT net cross-border balance
      </p>

      {/* Flow rows — each arc independently coloured */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', marginBottom: '1.25rem' }}>
        {([
          ['NordBalt (→SE4)', data.nordbalt_avg_mw, nbSig],
          ['LitPol (→PL)',    data.litpol_avg_mw,   lpSig],
        ] as [string, number | null | undefined, string | null | undefined][]).map(([label, mw, sig]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.40), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: flowSignalColor(sig ?? null) }}>{mwLabel(mw)}</p>
            <span style={{ ...MONO, fontSize: '0.52rem', letterSpacing: '0.08em', color: dirColor(sig), marginTop: '0.1rem', display: 'block' }}>
              {dirLabel(sig)}
            </span>
          </div>
        ))}
      </div>

      {/* Baltic map with view tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '6px' }}>
        {(['bess', 'dc'] as const).map(v => (
          <button
            key={v}
            onClick={() => setMapView(v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: mapView === v ? 'rgba(232,226,217,0.88)' : 'rgba(232,226,217,0.35)',
              borderBottom: mapView === v ? '1px solid rgba(123,94,167,0.7)' : '1px solid transparent',
              padding: '0 0 2px 0', marginRight: '12px',
            }}
          >{v}</button>
        ))}
      </div>
      <BalticMap
        nordbalt_mw={data.nordbalt_avg_mw}
        nordbalt_dir={data.nordbalt_signal}
        litpol_mw={data.litpol_avg_mw}
        litpol_dir={data.litpol_signal}
        view={mapView}
      />

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right', marginTop: '1rem' }}>
        {ts ? formatTs(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="ENTSO-E A11 hourly flows"
        compare="Net: >+100MW EXPORTING · <−100MW IMPORTING"
        updated={`ENTSO-E ${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
