'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { lithiumColor } from './s3-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { useSignal } from '@/lib/useSignal';
import { safeNum, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S3Signal {
  timestamp?:             string | null;
  lithium_eur_t?:         number | null;
  lithium_trend?:         '↓ falling' | '→ stable' | '↑ rising' | null;
  cell_eur_kwh?:          number | null;
  china_system_eur_kwh?:  number | null;
  europe_system_eur_kwh?: number | null;
  global_avg_eur_kwh?:    number | null;
  ref_source?:            string | null;
  euribor_3m?:            number | null;
  euribor_nominal_3m?:    number | null;
  euribor_real_3m?:       number | null;
  hicp_yoy?:              number | null;
  euribor_trend?:         '↓ falling' | '→ stable' | '↑ rising' | null;
  signal?:                string | null;
  interpretation?:        string | null;
  source?:                string | null;
  unavailable?:           boolean;
  _stale?:                boolean;
  _age_hours?:            number | null;
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

export function S3Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S3Signal>(`${WORKER_URL}/s3`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s3/history`)
      .then(r => r.json())
      .then((h: Array<{ equip_eur_kwh: number }>) => setHistory(h.map(e => e.equip_eur_kwh)))
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
          S3 — Cell Cost Stack
        </p>
      </div>

      <CardDisclosure
        explain={[
          'Equipment: AC system delivered from China, tier-1.',
          'Installed cost adds EPC, civil works, HV grid.',
          'Cell price drop ≠ installed CAPEX drop 1:1.',
        ]}
        dataLines={[
          'Equipment: manual update (Ember/BNEF benchmark)',
          'Euribor: ECB API nominal 3M',
          'CAPEX: (equip + EPC) × MWh + €35k/MW HV fixed',
          'Stale: equipment 30d · euribor 7d',
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

interface LiveDataProps {
  data: S3Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const signalColor = lithiumColor(data.signal ?? null);
  const nominal     = data.euribor_nominal_3m ?? data.euribor_3m ?? null;
  const real        = data.euribor_real_3m ?? null;
  const hicp        = data.hicp_yoy ?? null;
  const turnkey_eur_kwh = 262.5;
  const ts          = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Lithium hero + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.3rem' }}>
        <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, lineHeight: 1, letterSpacing: '0.04em', margin: 0,
          color: data.unavailable ? text(0.1) : signalColor }}>
          {data.unavailable ? '——————'
            : data.lithium_eur_t != null
              ? `€${safeNum(data.lithium_eur_t / 1000, 0)}k/t`
              : '—'}
        </p>
        {history.length > 1 && (
          <Sparkline values={history} color="rgba(232,226,217,0.55)" width={80} height={24} />
        )}
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        Li carbonate {data.lithium_trend ?? ''}
      </p>

      <p style={{ ...MONO, fontSize: '0.6rem', color: data.unavailable ? text(0.2) : text(0.52), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.unavailable ? 'Interpretation unavailable — feed incomplete.' : (data.interpretation ?? '—')}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.40), textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        CAPEX tracks
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '0.5rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Equipment DC</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {data.europe_system_eur_kwh != null ? `€${safeNum(data.europe_system_eur_kwh, 0)}/kWh` : '—'}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '1.25rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Euribor 3M</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.6) }}>
          {nominal != null ? `${safeNum(nominal, 2)}%` : '—'}
          <span style={{ color: text(0.3) }}> nominal (finance input)</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>HICP YoY</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.55) }}>
          {hicp != null ? `${safeNum(hicp, 1)}%` : '—'}
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Real rate</p>
        <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.4) }}>
          {real != null ? `${safeNum(real, 2)}%` : '—'}
          <span style={{ color: text(0.2) }}> (context)</span>
        </p>
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        IRR model uses fixed 10% discount rate (CH S1 2025 convention)
      </p>

      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTimestamp(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="Spot price · daily"
        compare="Baseline: CH S1 2025 turnkey €262.5/kWh"
        updated={`Euribor ${formatHHMM(ts)} UTC`}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
