'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { dcColor } from './s5-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { SignalIcon } from './SignalIcon';
import { BulletChart } from './BulletChart';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface NewsItem {
  title: string;
  url:   string | null;
  date:  string | null;
}

interface S5Signal {
  timestamp?:        string | null;
  signal?:           string | null;
  grid_free_mw?:     number | null;
  grid_connected_mw?: number | null;
  grid_utilisation?: number | null;
  pipeline_mw?:      number | null;
  pipeline_note?:    string | null;
  pipeline_updated?: string | null;
  news_items?:       NewsItem[];
  _stale?:           boolean;
  _age_hours?:       number | null;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };
const SERIF: CSSProperties = { fontFamily: 'var(--font-serif)' };

function fmw(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toLocaleString('en-GB')} MW`;
}

function parseNewsDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  } catch { return ''; }
}

export function S5Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S5Signal>(`${WORKER_URL}/s5`);

  return (
    <article
      className="signal-card"
      style={{ width: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <SignalIcon type="dc-power" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          DC Power Viability
        </h3>
      </div>

      <CardDisclosure
        explain={[
          'Litgrid publishes a consumption-side capacity map: grid nodes where DCs and large industrial users can connect with minimal upgrade cost.',
          'Institutional signal: the TSO is actively marketing available capacity to large consumers — validates the DC corridor thesis for Vilnius and Kaunas nodes.',
          'Lithuania electricity consumption growing ~4% per year — among the fastest in Europe — driven by heating electrification and new industrial load.',
        ]}
        dataLines={[
          'Grid: Litgrid ArcGIS FeatureServer (Kaupikliai, near real-time)',
          'Grid: Litgrid FeatureServer · filtered for DC-relevant nodes',
          'Pipeline: manual quarterly update via POST /s5/manual',
          'Stale: grid/news 6h',
        ]}
      />

      <div aria-live="polite" aria-atomic="false">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState />}
        {status === 'success' && data && (
          <LiveData data={data} isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />
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
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em' }}>Fetching</p>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
        —
      </p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.40), letterSpacing: '0.1em' }}>Data unavailable</p>
    </>
  );
}

const DIVIDER: CSSProperties = { borderTop: `1px solid rgba(232, 226, 217, 0.06)`, width: '100%' };

interface LiveDataProps {
  data: S5Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null;
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason }: LiveDataProps) {
  const signalColor = dcColor(data.signal ?? null);
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero: dot + signal text */}
      {(() => {
        const glowColor = {
          OPEN:        'rgba(45,212,168,0.55)',
          TIGHTENING:  'rgba(212,160,60,0.55)',
          CONSTRAINED: 'rgba(212,88,88,0.55)',
        }[data.signal ?? 'OPEN'] ?? 'rgba(45,212,168,0.55)';
        return (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: glowColor,
                boxShadow: `0 0 10px ${glowColor}`,
                flexShrink: 0, display: 'inline-block',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2.2rem',
                letterSpacing: '0.08em',
                fontWeight: 500,
                color: glowColor,
                textShadow: `0 0 20px ${glowColor.replace('0.55', '0.25')}`,
                lineHeight: 1,
              }}>
                {data.signal ?? 'OPEN'}
              </span>
            </div>
            <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.08em' }}>
              Grid headroom for new DC connections
            </p>
          </div>
        );
      })()}

      {/* Grid metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '1rem' }}>
        {([
          ['Free MW',   fmw(data.grid_free_mw)],
          ['Connected', fmw(data.grid_connected_mw)],
          ['Utilisation', data.grid_utilisation != null ? `${safeNum(data.grid_utilisation, 1)}%` : '—'],
        ] as [string, string][]).map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.40), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Bullet chart — grid headroom */}
      <BulletChart
        label="Grid headroom"
        value={data.grid_free_mw ?? 0}
        min={0}
        max={5000}
        unit="MW"
        width={180}
        thresholds={[
          { value: 500,  label: '500',  color: 'rgba(239,68,68,1)' },
          { value: 2000, label: '2GW',  color: 'rgba(245,158,11,1)' },
          { value: 4000, label: '4GW',  color: 'rgba(74,222,128,1)' },
        ]}
      />

      <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.25), letterSpacing: '0.06em', marginTop: '0.5rem', marginBottom: '1rem' }}>
        Same grid dataset as S4 — filtered for DC-relevant connection nodes.
      </p>

      {/* Baltic DC pipeline (manual, optional) */}
      {data.pipeline_mw != null && (
        <>
          <div style={{ ...DIVIDER, marginBottom: '1rem' }} />
          <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.40), textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            Baltic DC pipeline
          </p>
          <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55), marginBottom: '0.3rem' }}>
            {data.pipeline_mw.toLocaleString('en-GB')} MW announced
          </p>
          {data.pipeline_note && (
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.3), marginBottom: '0.3rem' }}>
              {data.pipeline_note}
            </p>
          )}
          {data.pipeline_updated && (
            <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), marginBottom: '0.75rem' }}>
              Updated {parseNewsDate(data.pipeline_updated)}
            </p>
          )}
        </>
      )}

      {/* DC news feed removed — generic RSS headlines undermine card credibility */}
      <a
        href="https://experience.arcgis.com/experience/d5e4105c8c634a0aaa117d518ab1b37d/page/Page"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center',
          gap: '6px', marginTop: '12px',
          fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
          color: 'var(--teal)',
          textDecoration: 'none',
          opacity: 0.75,
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.75')}
      >
        ↗ Litgrid consumption capacity map
      </a>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right', marginTop: '1rem' }}>
        {ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'rgba(232,226,217,0.22)', letterSpacing: '0.06em', marginTop: '12px' }}>
        MODEL INPUT → DC corridor thesis (qualitative)
      </div>

      <CardFooter
        period="Grid: Litgrid FeatureServer · Signal: free MW vs 2 GW DC threshold"
        compare="Signal: free MW vs 2 GW DC-scale threshold"
        updated={`${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
