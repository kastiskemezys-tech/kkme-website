'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { dcColor } from './s5-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
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
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.52), textTransform: 'uppercase' }}>
          S5 — DC Power Viability
        </p>
      </div>

      <CardDisclosure
        explain={[
          'Grid headroom available for new hyperscaler connections.',
          'Open: >2000 MW free · Tightening: 500–2000 · Constrained: <500.',
          'Baltic pipeline: announced DC MW, manually updated quarterly.',
        ]}
        dataLines={[
          'Grid: Litgrid ArcGIS FeatureServer (Kaupikliai, near real-time)',
          'DC news: DataCenterKnowledge RSS (top 5 headlines)',
          'Pipeline: manual quarterly update via POST /s5/manual',
          'Stale: grid/news 6h',
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

      {/* Hero: signal */}
      <p style={{ ...MONO, fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', fontWeight: 400, color: signalColor, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
        {data.signal ?? '—'}
      </p>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.08em', marginBottom: '1.25rem' }}>
        Grid headroom for new DC connections
      </p>

      {/* Grid metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '1.25rem' }}>
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

      <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.25), letterSpacing: '0.06em', marginBottom: '1rem' }}>
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

      {/* DC news */}
      {data.news_items && data.news_items.length > 0 && (
        <>
          <div style={{ ...DIVIDER, marginBottom: '1rem' }} />
          <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.40), textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            DC industry
          </p>
          {data.news_items.map((item, i) => (
            <div key={i} style={{ marginBottom: '0.65rem' }}>
              <p style={{ ...SERIF, fontSize: '0.7rem', color: text(0.6), lineHeight: 1.5 }}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', borderBottom: `1px solid ${text(0.12)}` }}
                  >
                    {item.title}
                  </a>
                ) : item.title}
              </p>
              {item.date && (
                <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), marginTop: '0.15rem' }}>
                  {parseNewsDate(item.date)}
                </p>
              )}
            </div>
          ))}
        </>
      )}

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right', marginTop: '1rem' }}>
        {ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Grid: near real-time · News: DataCenterKnowledge RSS"
        compare="Signal: free MW vs 2 GW DC-scale threshold"
        updated={`${formatHHMM(ts)} UTC`}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
