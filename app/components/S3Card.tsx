'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { lithiumColor } from './s3-utils';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
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
      className="signal-card"
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <SignalIcon type="battery-cost" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          Cell Cost Stack
        </h3>
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
          {data.unavailable ? '—'
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

      {data.unavailable && !data.lithium_eur_t && (
        <div style={{ margin: '12px 0' }}>
          <div className="skeleton" style={{ height: '44px', width: '100%', marginBottom: '6px' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(232,226,217,0.28)', textAlign: 'center' }}>
            Li carbonate · awaiting feed
          </div>
        </div>
      )}

      <p style={{ ...MONO, fontSize: '0.6rem', color: data.unavailable ? text(0.2) : text(0.52), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.unavailable ? '' : (data.interpretation ?? '—')}
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
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1rem' }}>
        Turnkey includes BOS, civil, grid, HV: ~+€125k/MW vs equipment
      </p>

      {/* CAPEX waterfall breakdown */}
      {data.europe_system_eur_kwh != null && (
        <div style={{ margin: '0 0 1.25rem' }}>
          {[
            { label: 'Equipment DC', val: data.europe_system_eur_kwh * 0.62, color: 'var(--blue)' },
            { label: 'BOS + Civil',  val: data.europe_system_eur_kwh * 0.27, color: 'var(--violet)' },
            { label: 'HV Grid fix',  val: data.europe_system_eur_kwh * 0.11, color: 'rgba(123,94,167,0.45)' },
          ].map(({ label, val, color }) => {
            const pct = (val / data.europe_system_eur_kwh!) * 100;
            return (
              <div key={label} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(232,226,217,0.45)', marginBottom: '2px' }}>
                  <span>{label}</span>
                  <span style={{ color: 'rgba(232,226,217,0.70)' }}>€{val.toFixed(0)}/kWh</span>
                </div>
                <div style={{ height: '10px', width: `${pct}%`, background: color, opacity: 0.65, transition: 'width 0.6s ease' }} />
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid rgba(232,226,217,0.10)', paddingTop: '6px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'rgba(232,226,217,0.88)', fontWeight: 500 }}>
            <span>Total installed</span>
            <span>€{data.europe_system_eur_kwh.toFixed(0)}/kWh</span>
          </div>
        </div>
      )}

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Finance pill badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
        {nominal != null && (
          <span style={{
            ...MONO,
            fontSize: '0.60rem',
            padding: '0.18rem 0.55rem',
            border: '1px solid rgba(77,124,181,0.30)',
            background: 'rgba(77,124,181,0.08)',
            color: 'rgba(110,160,220,0.80)',
            borderRadius: '2px',
            letterSpacing: '0.04em',
          }}>
            Euribor 3M {safeNum(nominal, 2)}%
          </span>
        )}
        {hicp != null && (
          <span style={{
            ...MONO,
            fontSize: '0.60rem',
            padding: '0.18rem 0.55rem',
            border: '1px solid rgba(204,160,72,0.25)',
            background: 'rgba(204,160,72,0.07)',
            color: 'rgba(220,175,80,0.80)',
            borderRadius: '2px',
            letterSpacing: '0.04em',
          }}>
            HICP {safeNum(hicp, 1)}%
          </span>
        )}
        {real != null && (
          <span style={{
            ...MONO,
            fontSize: '0.60rem',
            padding: '0.18rem 0.55rem',
            border: '1px solid rgba(232,226,217,0.10)',
            background: 'rgba(232,226,217,0.03)',
            color: text(0.45),
            borderRadius: '2px',
            letterSpacing: '0.04em',
          }}>
            Real {safeNum(real, 2)}%
          </span>
        )}
      </div>

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
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
