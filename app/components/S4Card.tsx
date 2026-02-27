'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { gridColor } from './s4-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S4Pipeline {
  dev_total_mw:       number | null;
  dev_total_raw_mw:   number | null;
  filter_applied:     string | null;
  dev_count_filtered: number | null;
  dev_count_raw:      number | null;
  parse_warning:      string | null;
  gen_total_mw:       number | null;
  dev_velocity_3m:    number | null;
  dev_expiring_2027:  number | null;
  top_projects:       Array<{ company: string; mw: number; type: string }>;
  updated_at:         string | null;
}

interface S4Signal {
  timestamp?:      string | null;
  free_mw?:        number | null;
  connected_mw?:   number | null;
  reserved_mw?:    number | null;
  utilisation_pct?: number | null;
  signal?:         string | null;
  interpretation?: string | null;
  pipeline?:       S4Pipeline;
  _stale?:         boolean;
  _age_hours?:     number | null;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function fmw(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toLocaleString('en-GB')} MW`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

export function S4Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S4Signal>(`${WORKER_URL}/s4`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s4/history`)
      .then(r => r.json())
      .then((h: Array<{ free_mw: number }>) => setHistory(h.map(e => e.free_mw)))
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
        <SignalIcon type="grid" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          Grid Connection Scarcity
        </h3>
      </div>

      <CardDisclosure
        explain={[
          'Free MW: available transmission grid capacity.',
          'Headline only — node quality and approvals matter more.',
          'Pipeline filtered for BESS permits (validation pending).',
        ]}
        dataLines={[
          'Grid: Litgrid ArcGIS FeatureServer (near real-time)',
          'Pipeline: VERT.lt permit registry (monthly)',
          'Filter: Kaupikliai storage type only',
          'Stale: grid 6h · permits 35d',
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

function PipelineFlow({ dev, gen }: { dev: number | null; gen: number | null }) {
  const devGW  = dev  != null ? dev  / 1000 : null;
  const genGW  = gen  != null ? gen  / 1000 : null;
  const maxGW  = Math.max(devGW ?? 0, genGW ?? 0, 1);

  const stages: Array<{ label: string; sub: string; gw: number | null; color: string }> = [
    { label: 'Dev permits',  sub: 'VERT.lt storage', gw: devGW, color: 'rgba(123,94,167,0.65)' },
    { label: 'Gen permits',  sub: 'Operating / built', gw: genGW, color: 'rgba(86,166,110,0.65)' },
  ];

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', marginBottom: '1rem' }}>
      {stages.map(({ label, sub, gw, color }) => {
        const r = gw != null ? 12 + (gw / maxGW) * 28 : 8;
        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `1px solid ${color}`,
              background: color.replace('0.65', '0.08'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {gw != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color, fontWeight: 500 }}>
                  {gw.toFixed(1)}G
                </span>
              )}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'rgba(232,226,217,0.45)', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.4 }}>
              {label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'rgba(232,226,217,0.28)', textAlign: 'center' }}>
              {sub}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CapacityBar({ connected, reserved, free }: { connected: number; reserved: number; free: number }) {
  const reservedPct = (reserved / connected) * 100;
  const freePct     = (free     / connected) * 100;
  const usedPct     = Math.max(0, 100 - reservedPct - freePct);

  return (
    <div style={{ margin: '0 0 1.5rem' }}>
      <div style={{ display: 'flex', height: '20px', gap: '1px', overflow: 'hidden' }}>
        <div style={{ flex: usedPct,     background: 'rgba(214,88,88,0.25)' }} />
        <div style={{ flex: reservedPct, background: 'rgba(204,160,72,0.25)' }} />
        <div style={{ flex: freePct,     background: 'rgba(86,166,110,0.30)' }} />
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '5px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
        {([
          ['Used',     usedPct,     'rgba(214,88,88,0.7)'],
          ['Reserved', reservedPct, 'rgba(204,160,72,0.7)'],
          ['Free',     freePct,     'rgba(86,166,110,0.8)'],
        ] as [string, number, string][]).map(([label, pct, color]) => (
          <span key={label} style={{ color }}>{label} {pct.toFixed(0)}%</span>
        ))}
      </div>
    </div>
  );
}

interface LiveDataProps {
  data: S4Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const signalColor = gridColor(data.free_mw ?? 0);
  const ts          = data.timestamp ?? null;

  const metrics: [string, string][] = [
    ['Connected',   fmw(data.connected_mw)],
    ['Reserved',    fmw(data.reserved_mw)],
    ['Utilisation', data.utilisation_pct != null ? `${safeNum(data.utilisation_pct, 1)}%` : '—'],
  ];

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', margin: 0 }}>
          <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: signalColor }}>
            {safeNum(data.free_mw, 0, '')}
          </span>
          <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.52) }}>
            MW free
          </span>
        </p>
        <Sparkline values={history} color="#86efac" width={160} height={40} />
      </div>

      <p style={{ ...MONO, fontSize: '0.6rem', color: data.free_mw == null ? text(0.2) : text(0.52), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.free_mw == null ? 'Interpretation unavailable — feed incomplete.' : (data.interpretation ?? '—')}
      </p>

      <div style={{ borderTop: `1px solid rgba(232, 226, 217, 0.06)`, width: '100%', marginBottom: '1.25rem' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '0.75rem' }}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.40), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              {label}
            </p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {data.connected_mw != null && data.reserved_mw != null && data.free_mw != null && (
        <CapacityBar
          connected={data.connected_mw}
          reserved={data.reserved_mw}
          free={data.free_mw}
        />
      )}

      {data.pipeline && (
        <>
          <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

          <PipelineFlow dev={data.pipeline.dev_total_mw} gen={data.pipeline.gen_total_mw} />

          <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.40), textTransform: 'uppercase', marginBottom: '0.9rem' }}>
            Development permits (BESS filtered)
          </p>

          {(data.pipeline.parse_warning || (data.pipeline.dev_total_mw != null && data.pipeline.dev_total_mw > 5000)) ? (
            <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), fontStyle: 'italic', marginBottom: '0.75rem' }}>
              Pipeline: validation pending
            </p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Dev (storage)</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.dev_total_mw)}</p>

                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gen total</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.gen_total_mw)}</p>

                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Expiring 2027</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.dev_expiring_2027)}</p>
              </div>

              {data.pipeline.dev_total_raw_mw != null && (
                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                  Raw total: {data.pipeline.dev_total_raw_mw.toLocaleString('en-GB')} MW
                  {data.pipeline.dev_count_raw != null ? ` (${data.pipeline.dev_count_raw} permits)` : ''}
                  {' | '}Filtered for storage type: {(data.pipeline.dev_total_mw ?? 0).toLocaleString('en-GB')} MW
                  {data.pipeline.dev_count_filtered != null ? ` (${data.pipeline.dev_count_filtered})` : ''}
                </p>
              )}

              {data.pipeline.top_projects && data.pipeline.top_projects.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  {data.pipeline.top_projects.map((p, i) => (
                    <p key={i} style={{ ...MONO, fontSize: '0.575rem', color: text(0.52), lineHeight: 1.6 }}>
                      · {p.company.slice(0, 36)} — {p.mw} MW
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTimestamp(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Point-in-time snapshot"
        compare="Baseline: >2000 MW available"
        updated={`ArcGIS ${formatHHMM(ts)} UTC · Permits: monthly`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
