'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { CardFooter } from './CardFooter';
import { CardDisclosure } from './CardDisclosure';
import { StaleBanner } from './StaleBanner';
import { Sparkline } from './Sparkline';
import { SignalIcon } from './SignalIcon';
import { useSignal } from '@/lib/useSignal';
import { safeNum, fK, formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S2Signal {
  timestamp?: string | null;
  fcr_avg?:       number | null;
  afrr_up_avg?:   number | null;
  afrr_down_avg?: number | null;
  mfrr_up_avg?:   number | null;
  mfrr_down_avg?: number | null;
  pct_up?:        number | null;
  pct_down?:      number | null;
  imbalance_mean?: number | null;
  imbalance_p90?:  number | null;
  pct_above_100?:  number | null;
  afrr_annual_per_mw_installed?: number | null;
  mfrr_annual_per_mw_installed?: number | null;
  cvi_afrr_eur_mw_yr?:           number | null;
  cvi_mfrr_eur_mw_yr?:           number | null;
  stress_index_p90?:             number | null;
  fcr_note?:       string | null;
  ordered_price?:  number | null;
  ordered_mw?:     number | null;
  signal?:         string | null;
  interpretation?: string | null;
  source?:         string | null;
  unavailable?:    boolean;
  _stale?:         boolean;
  _age_hours?:     number | null;
  _serving?:       string;
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


export function S2Card() {
  const { status, data, isDefault, isStale, ageHours, defaultReason } =
    useSignal<S2Signal>(`${WORKER_URL}/s2`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s2/history`)
      .then(r => r.json())
      .then((h: Array<{ afrr_up: number }>) => setHistory(h.map(e => e.afrr_up)))
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
        <SignalIcon type="balancing" size={20} />
        <h3 style={{ ...MONO, fontSize: '0.82rem', letterSpacing: '0.06em', color: text(0.72), fontWeight: 500, textTransform: 'uppercase' }}>
          Balancing Stack
        </h3>
      </div>

      <CardDisclosure
        explain={[
          'aFRR/mFRR: Baltic TSO D-1 capacity auctions.',
          '0.5 MW service per 1 MW installed (2 MW/MW prequalification).',
          'aFRR saturates ~2028 per CH forecast. Revenue is per MW installed power.',
        ]}
        dataLines={[
          'Source: Baltic Transparency Dashboard · daily clearing, pay-as-clear',
          '7-day rolling window · LT cols: FCR[10] aFRR↑[11] aFRR↓[12] mFRR↑[13] mFRR↓[14]',
          'BTD blocks datacenter IPs — residential proxy only',
          'Stale threshold: 48h',
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

// Revenue opportunity bar — shows aFRR and mFRR vs CH targets
function OpportunityBar({ afrr, mfrr }: { afrr: number | null | undefined; mfrr: number | null | undefined }) {
  const CH2027_AFRR = 20;
  const CH2028_MFRR = 11;
  const MAX = 35;

  if (afrr == null && mfrr == null) return null;

  const bars = [
    { label: 'aFRR ↑', value: afrr, target: CH2027_AFRR, color: 'rgba(86,166,110,0.55)' },
    { label: 'mFRR ↑', value: mfrr, target: CH2028_MFRR, color: 'rgba(123,94,167,0.55)' },
  ] as const;

  return (
    <div style={{ marginBottom: '1rem' }}>
      {bars.map(({ label, value, target, color }) => {
        const pct    = value != null ? Math.min((value / MAX) * 100, 100) : 0;
        const tgtPct = Math.min((target / MAX) * 100, 100);
        return (
          <div key={label} style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'rgba(232,226,217,0.40)', marginBottom: '2px' }}>
              <span>{label}</span>
              <span style={{ color: 'rgba(232,226,217,0.55)' }}>{value != null ? `${value.toFixed(1)} €/MW/h` : '—'}</span>
            </div>
            <div style={{ position: 'relative', height: '8px', background: 'rgba(232,226,217,0.06)' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
              {/* CH target marker */}
              <div style={{ position: 'absolute', left: `${tgtPct}%`, top: '-2px', bottom: '-2px', width: '1px', background: 'rgba(232,226,217,0.35)' }} />
            </div>
          </div>
        );
      })}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.48rem', color: 'rgba(232,226,217,0.25)', marginTop: '4px' }}>
        · CH 2027 aFRR target €20/MW/h · CH 2028 mFRR target €11/MW/h
      </p>
    </div>
  );
}

function colorAfrr(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return text(0.3);
  if (v > 15) return 'rgba(74, 124, 89, 0.9)';
  if (v > 5)  return 'rgba(100, 160, 110, 0.75)';
  return text(0.5);
}

function colorStress(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return text(0.3);
  if (v > 200) return 'rgba(74, 124, 89, 0.9)';
  if (v > 100) return 'rgba(100, 160, 110, 0.75)';
  return text(0.5);
}

interface LiveDataProps {
  data: S2Signal; isDefault: boolean; isStale: boolean; ageHours: number | null; defaultReason: string | null; history: number[];
}

function LiveData({ data, isDefault, isStale, ageHours, defaultReason, history }: LiveDataProps) {
  const ts = data.timestamp ?? null;

  return (
    <>
      <StaleBanner isDefault={isDefault} isStale={isStale} ageHours={ageHours} defaultReason={defaultReason} />

      {/* Optional Litgrid tomorrow ordered line */}
      {(data.ordered_price != null || data.ordered_mw != null) && (
        <p style={{ ...MONO, fontSize: '0.575rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Tomorrow ordered{data.ordered_price != null ? ` ${data.ordered_price} €/MW/h` : ''}
          {data.ordered_mw != null ? ` · ${data.ordered_mw} MW` : ''}
        </p>
      )}

      {/* PRIMARY: aFRR and mFRR capacity revenue — shown separately, not summed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.4rem 1.25rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>aFRR</p>
        <p style={{ ...MONO, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 400, color: data.unavailable ? text(0.1) : colorAfrr(data.afrr_up_avg), lineHeight: 1, letterSpacing: '0.02em', margin: 0 }}>
          {data.unavailable ? '——' : fK(data.afrr_annual_per_mw_installed)}
          <span style={{ fontSize: '0.45em', marginLeft: '0.15em', color: text(0.3) }}>/MW/yr</span>
        </p>
        <Sparkline values={history} color="#86efac" width={160} height={40} />

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>mFRR</p>
        <p style={{ ...MONO, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 400, color: data.unavailable ? text(0.1) : colorAfrr(data.mfrr_up_avg), lineHeight: 1, letterSpacing: '0.02em', margin: 0 }}>
          {data.unavailable ? '——' : fK(data.mfrr_annual_per_mw_installed)}
          <span style={{ fontSize: '0.45em', marginLeft: '0.15em', color: text(0.3) }}>/MW/yr</span>
        </p>
        <span />
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1rem' }}>
        Per MW installed power · 0.5 MW service (2 MW/MW prequalification) · theoretical max if fully allocated
      </p>

      {/* Revenue opportunity bars vs CH targets */}
      <OpportunityBar afrr={data.afrr_up_avg} mfrr={data.mfrr_up_avg} />

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: data.unavailable ? text(0.2) : text(0.52), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.unavailable ? 'Interpretation unavailable — feed incomplete.' : (data.interpretation ?? '—')}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* SECONDARY: spot rates + stress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '1rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>aFRR ↑</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorAfrr(data.afrr_up_avg) }}>
          {safeNum(data.afrr_up_avg, 1)} €/MW/h
          <span style={{ color: text(0.40) }}> · CH 2027: €20 · CH 2028: €10</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>mFRR ↑</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorAfrr(data.mfrr_up_avg) }}>
          {safeNum(data.mfrr_up_avg, 1)} €/MW/h
          <span style={{ color: text(0.40) }}> · CH 2027: €20 · CH 2030: €11</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sys stress P90</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorStress(data.stress_index_p90) }}>
          {safeNum(data.stress_index_p90, 1)} €/MWh
        </p>
      </div>

      {/* TERTIARY: FCR — muted, context only */}
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        FCR {safeNum(data.fcr_avg, 1)} €/MW/h · market: 25 MW (all three Baltics) · saturating 2026
      </p>

      {/* Timestamp */}
      <time dateTime={ts ?? ''} style={{ ...MONO, fontSize: '0.575rem', color: text(0.40), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {ts ? formatTimestamp(ts) : '—'}
        <StaleBanner isDefault={false} isStale={isStale} ageHours={ageHours} defaultReason={null} />
      </time>

      <CardFooter
        period="D-1 capacity auction · 24h imbalance MTUs"
        compare="aFRR vs CH 2027 target: €20/MW/h"
        updated={`fetched ${formatHHMM(ts)} UTC`}
        timestamp={ts}
        isStale={isStale}
        ageHours={ageHours}
      />
    </>
  );
}
