'use client';

import { useState, type CSSProperties } from 'react';
import { lithiumColor } from './s3-utils';
import { CardFooter } from './CardFooter';
import { StaleBanner } from './StaleBanner';
import { useSignal } from '@/lib/useSignal';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S3Signal {
  timestamp: string;
  lithium_eur_t?:         number | null;
  lithium_trend?:         '↓ falling' | '→ stable' | '↑ rising' | null;
  cell_eur_kwh?:          number | null;
  china_system_eur_kwh:   number;
  europe_system_eur_kwh:  number;
  global_avg_eur_kwh:     number;
  ref_source:             string;
  // Euribor — nominal (project finance input) vs real (context)
  euribor_3m:             number | null;   // alias for euribor_nominal_3m
  euribor_nominal_3m?:    number | null;
  euribor_real_3m?:       number | null;
  hicp_yoy?:              number | null;
  euribor_trend:          '↓ falling' | '→ stable' | '↑ rising' | null;
  signal: string;
  interpretation: string;
  source: string;
  unavailable?: boolean;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

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

export function S3Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S3Signal>(`${WORKER_URL}/s3`);
  const [explainOpen, setExplainOpen] = useState(false);
  const [dataOpen, setDataOpen]       = useState(false);

  const toggleExplain = () => { setExplainOpen(o => !o); setDataOpen(false); };
  const toggleData    = () => { setDataOpen(o => !o); setExplainOpen(false); };


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
          S3 — Cell Cost Stack
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={toggleExplain} style={btnStyle(explainOpen)}>[Explain]</button>
          <button onClick={toggleData}    style={btnStyle(dataOpen)}>[Data]</button>
        </div>
      </div>

      {explainOpen && (
        <div style={{ ...MONO, fontSize: '0.575rem', color: 'rgba(232, 226, 217, 0.5)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.4rem' }}>LFP cell cost is 60–70% of equipment CAPEX. Lithium carbonate spot leads cell prices by 3–6 months.</p>
          <p>Turnkey 2h: equipment + BOS + civil + HV grid = €257k/MW at Q1 2026 pricing. CH S1 2025 used €525k/MW — costs fell ~50% through 2024–2025.</p>
        </div>
      )}

      {dataOpen && (
        <div style={{ ...MONO, fontSize: '0.5rem', color: 'rgba(232, 226, 217, 0.4)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.3rem' }}>Lithium: Trading Economics (CNY/T spot) · Equipment: InfoLink + BNEF/Ember</p>
          <p style={{ marginBottom: '0.3rem' }}>Euribor 3M: ECB daily · HICP: Eurostat YoY</p>
          <p>Updated daily 06:00 UTC via Cloudflare Worker cron</p>
        </div>
      )}

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
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
        ——————
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
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
        ——————
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


interface LiveDataProps {
  data: S3Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null;
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason }: LiveDataProps) {
  const signalColor = lithiumColor(data.signal);
  const nominal     = data.euribor_nominal_3m ?? data.euribor_3m;
  const real        = data.euribor_real_3m;
  const hicp        = data.hicp_yoy;

  // Turnkey installed cost: €525k/MW ÷ 2h = €262.5/kWh (from CH S1 2025)
  const turnkey_eur_kwh = 262.5;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Lithium — headline */}
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, lineHeight: 1, letterSpacing: '0.04em', marginBottom: '0.3rem',
        color: data.unavailable ? text(0.1) : signalColor }}>
        {data.unavailable ? '——————'
          : data.lithium_eur_t != null
            ? `€${Math.round(data.lithium_eur_t / 1000)}k/t`
            : '—'}
      </p>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        Li carbonate {data.lithium_trend ?? ''}
      </p>

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: data.unavailable ? text(0.2) : text(0.35), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.unavailable ? 'Interpretation unavailable — feed incomplete.' : data.interpretation}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* CAPEX dual tracks */}
      <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        CAPEX tracks
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '0.5rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Equipment DC</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {data.europe_system_eur_kwh != null ? `€${data.europe_system_eur_kwh}/kWh` : '—'}
          <span style={{ color: text(0.3) }}> (containers/cells)</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Turnkey AC 2h</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          €{turnkey_eur_kwh}/kWh
          <span style={{ color: text(0.3) }}> (CH S1 2025)</span>
        </p>
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        Turnkey includes BOS, civil, grid, HV: ~+€125k/MW vs equipment
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Euribor tracks — nominal is finance input, real is context */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '1.25rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Euribor 3M</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {nominal != null ? `${nominal}%` : '—'}
          <span style={{ color: text(0.3) }}> nominal (finance input)</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>HICP YoY</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>
          {hicp != null ? `${hicp}%` : '—'}
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Real rate</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.4) }}>
          {real != null ? `${real}%` : '—'}
          <span style={{ color: text(0.2) }}> (context)</span>
        </p>
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        IRR model uses fixed 10% discount rate (CH S1 2025 convention)
      </p>

      {/* Timestamp */}
      <time dateTime={data.timestamp ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {data.timestamp ? formatTimestamp(data.timestamp) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Spot price · daily"
        compare="Baseline: CH S1 2025 turnkey €262.5/kWh"
        updated="Trading Economics · InfoLink · 06:00 UTC"
      />
    </>
  );
}
