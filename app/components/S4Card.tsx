'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { gridColor } from './s4-utils';
import { CardFooter } from './CardFooter';

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
  timestamp: string;
  free_mw: number;
  connected_mw: number;
  reserved_mw: number;
  utilisation_pct: number;
  signal: string;
  interpretation: string;
  pipeline?: S4Pipeline;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatMw(n: number): string {
  return n.toLocaleString('en-GB');
}

function fmw(n: number | null): string {
  return n == null ? '—' : `${n.toLocaleString('en-GB')} MW`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

type Status = 'loading' | 'success' | 'error';

const FETCH_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS   = 2_000;

const btnStyle = (active: boolean): CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: '0.5rem',
  letterSpacing: '0.06em',
  color: active ? 'rgba(232, 226, 217, 0.7)' : 'rgba(232, 226, 217, 0.28)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
});

export function S4Card() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<S4Signal | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [dataOpen, setDataOpen]       = useState(false);

  const toggleExplain = () => { setExplainOpen(o => !o); setDataOpen(false); };
  const toggleData    = () => { setDataOpen(o => !o); setExplainOpen(false); };

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(`${WORKER_URL}/s4`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as S4Signal;
        if (!cancelled) { setData(d); setStatus('success'); }
      } catch (_err) {
        clearTimeout(timer);
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          if (!cancelled) await load(2);
        } else {
          setStatus('error');
        }
      }
    };

    load(1);
    return () => { cancelled = true; };
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.35), textTransform: 'uppercase' }}>
          S4 — Grid Connection Scarcity
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={toggleExplain} style={btnStyle(explainOpen)}>[Explain]</button>
          <button onClick={toggleData}    style={btnStyle(dataOpen)}>[Data]</button>
        </div>
      </div>

      {explainOpen && (
        <div style={{ ...MONO, fontSize: '0.575rem', color: 'rgba(232, 226, 217, 0.5)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.4rem' }}>Litgrid publishes grid connection capacity by technology type. Storage category is Kaupikliai.</p>
          <p>Free capacity is the binding constraint for new BESS projects — not land, not planning. Lithuania entered EU single electricity market Feb 2025.</p>
        </div>
      )}

      {dataOpen && (
        <div style={{ ...MONO, fontSize: '0.5rem', color: 'rgba(232, 226, 217, 0.4)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.3rem' }}>Source: Litgrid FeatureServer/8 (ArcGIS) · Tipas: Kaupikliai</p>
          <p style={{ marginBottom: '0.3rem' }}>Fields: Laisva_galia_prijungimui · Prijungtoji_galia_PT · Pasirasytu_ketinimu_pro_galia</p>
          <p>Updated daily 06:00 UTC · No auth required</p>
        </div>
      )}

      {status === 'loading' && <Skeleton />}
      {status === 'error'   && <ErrorState />}
      {status === 'success' && data && <LiveData data={data} />}
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
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.25), letterSpacing: '0.1em' }}>
        Data unavailable
      </p>
    </>
  );
}

const DIVIDER: CSSProperties = {
  borderTop: `1px solid rgba(232, 226, 217, 0.06)`,
  width: '100%',
};

function LiveData({ data }: { data: S4Signal }) {
  const signalColor = gridColor(data.free_mw);

  const metrics: [string, string][] = [
    ['Connected', `${formatMw(data.connected_mw)} MW`],
    ['Reserved',  `${formatMw(data.reserved_mw)} MW`],
    ['Utilisation', `${data.utilisation_pct.toFixed(1)}%`],
  ];

  return (
    <>
      {/* Large free MW number */}
      <p style={{ ...MONO, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '1rem' }}>
        <span style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', color: signalColor }}>
          {formatMw(data.free_mw)}
        </span>
        <span style={{ fontSize: '0.75rem', marginLeft: '0.4em', color: text(0.35) }}>
          MW free
        </span>
      </p>

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: data.free_mw == null ? text(0.2) : text(0.35), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.free_mw == null ? 'Interpretation unavailable — feed incomplete.' : data.interpretation}
      </p>

      {/* Divider */}
      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Three metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.25rem', marginBottom: '1.5rem' }}>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              {label}
            </p>
            <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Optional: VERT.lt permitted pipeline */}
      {data.pipeline && (
        <>
          <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

          <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.9rem' }}>
            Development permits (BESS filtered)
          </p>

          {/* Pipeline guard: hide unvalidated numbers */}
          {(data.pipeline.parse_warning || (data.pipeline.dev_total_mw != null && data.pipeline.dev_total_mw > 5000)) ? (
            <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), fontStyle: 'italic', marginBottom: '0.75rem' }}>
              Pipeline: validation pending
            </p>
          ) : (
            <>
              {/* Pipeline metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Dev (storage)</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.dev_total_mw)}</p>

                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Gen total</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.gen_total_mw)}</p>

                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Expiring 2027</p>
                <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>{fmw(data.pipeline.dev_expiring_2027)}</p>
              </div>

              {/* Raw vs filtered audit note */}
              {data.pipeline.dev_total_raw_mw != null && (
                <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                  Raw total: {data.pipeline.dev_total_raw_mw.toLocaleString('en-GB')} MW
                  {data.pipeline.dev_count_raw != null ? ` (${data.pipeline.dev_count_raw} permits)` : ''}
                  {' | '}Filtered for storage type: {(data.pipeline.dev_total_mw ?? 0).toLocaleString('en-GB')} MW
                  {data.pipeline.dev_count_filtered != null ? ` (${data.pipeline.dev_count_filtered})` : ''}
                </p>
              )}

              {/* Top 3 projects */}
              {data.pipeline.top_projects.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  {data.pipeline.top_projects.map((p, i) => (
                    <p key={i} style={{ ...MONO, fontSize: '0.575rem', color: text(0.35), lineHeight: 1.6 }}>
                      · {p.company.slice(0, 36)} — {p.mw} MW
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Timestamp */}
      <time dateTime={data.timestamp} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {formatTimestamp(data.timestamp)}
      </time>

      <CardFooter
        period="Point-in-time snapshot"
        compare="Baseline: >2000 MW available"
        updated="Litgrid ArcGIS · 06:00 UTC"
      />
    </>
  );
}
