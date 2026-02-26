'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { CardFooter } from './CardFooter';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S2Signal {
  timestamp: string;
  fcr_avg:       number | null;
  afrr_up_avg:   number | null;
  afrr_down_avg: number | null;
  mfrr_up_avg:   number | null;
  mfrr_down_avg: number | null;
  pct_up:        number | null;
  pct_down:      number | null;
  imbalance_mean: number | null;
  imbalance_p90:  number | null;
  pct_above_100:  number | null;
  afrr_annual_per_mw_installed: number | null;
  mfrr_annual_per_mw_installed: number | null;
  cvi_afrr_eur_mw_yr:           number | null;
  cvi_mfrr_eur_mw_yr:           number | null;
  stress_index_p90:             number | null;
  fcr_note?:               string;
  ordered_price?: number | null;
  ordered_mw?:    number | null;
  signal: string;
  interpretation: string;
  source: string;
  unavailable?: boolean;
}

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

function fmt(n: number | null, decimals = 1): string {
  return n === null ? '—' : n.toFixed(decimals);
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

export function S2Card() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData]     = useState<S2Signal | null>(null);
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
        const res = await fetch(`${WORKER_URL}/s2`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as S2Signal;
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
          S2 — Balancing Stack
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={toggleExplain} style={btnStyle(explainOpen)}>[Explain]</button>
          <button onClick={toggleData}    style={btnStyle(dataOpen)}>[Data]</button>
        </div>
      </div>

      {explainOpen && (
        <div style={{ ...MONO, fontSize: '0.575rem', color: 'rgba(232, 226, 217, 0.5)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.4rem' }}>FCR, aFRR, and mFRR are separate frequency regulation markets — each MW is in one market per hour.</p>
          <p>Baltic prequalification: 2 MW power + 4 MWh energy provides 1 MW symmetric service. Revenue is shown per MW installed (power binding, always 0.5 MW service).</p>
        </div>
      )}

      {dataOpen && (
        <div style={{ ...MONO, fontSize: '0.5rem', color: 'rgba(232, 226, 217, 0.4)', lineHeight: 1.65, marginBottom: '1.25rem', borderLeft: '2px solid rgba(232, 226, 217, 0.08)', paddingLeft: '0.75rem' }}>
          <p style={{ marginBottom: '0.3rem' }}>Source: BTD (Baltic Transparency Data) via residential IP cron 05:30 UTC</p>
          <p style={{ marginBottom: '0.3rem' }}>7-day rolling window · LT columns: FCR[10] aFRR↑[11] aFRR↓[12] mFRR↑[13] mFRR↓[14]</p>
          <p>BTD blocks datacenter IPs — residential proxy is the only path</p>
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

function colorStack(v: number | null): string {
  if (v === null) return text(0.3);
  if (v > 200000) return 'rgba(74, 124, 89, 0.9)';
  if (v > 100000) return 'rgba(100, 160, 110, 0.75)';
  if (v > 50000)  return text(0.6);
  return 'rgba(155, 48, 67, 0.85)';
}

function colorAfrr(v: number | null): string {
  if (v === null) return text(0.3);
  if (v > 15) return 'rgba(74, 124, 89, 0.9)';
  if (v > 5)  return 'rgba(100, 160, 110, 0.75)';
  return text(0.5);
}

function colorStress(v: number | null): string {
  if (v === null) return text(0.3);
  if (v > 200) return 'rgba(74, 124, 89, 0.9)';
  if (v > 100) return 'rgba(100, 160, 110, 0.75)';
  return text(0.5);
}

function fmtK(v: number | null): string {
  if (v === null) return '—';
  return `€${Math.round(v / 1000)}k`;
}

function LiveData({ data }: { data: S2Signal }) {
  return (
    <>
      {/* Optional Litgrid tomorrow ordered line */}
      {(data.ordered_price != null || data.ordered_mw != null) && (
        <p style={{ ...MONO, fontSize: '0.575rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1rem' }}>
          Tomorrow ordered{data.ordered_price != null ? ` ${data.ordered_price} €/MW/h` : ''}
          {data.ordered_mw != null ? ` · ${data.ordered_mw} MW` : ''}
        </p>
      )}

      {/* PRIMARY: aFRR and mFRR capacity revenue — shown separately, not summed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>aFRR</p>
        <p style={{ ...MONO, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 400, color: data.unavailable ? text(0.1) : colorAfrr(data.afrr_up_avg), lineHeight: 1, letterSpacing: '0.02em' }}>
          {data.unavailable ? '——' : fmtK(data.afrr_annual_per_mw_installed)}
          <span style={{ fontSize: '0.45em', marginLeft: '0.15em', color: text(0.3) }}>/MW/yr</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>mFRR</p>
        <p style={{ ...MONO, fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', fontWeight: 400, color: data.unavailable ? text(0.1) : colorAfrr(data.mfrr_up_avg), lineHeight: 1, letterSpacing: '0.02em' }}>
          {data.unavailable ? '——' : fmtK(data.mfrr_annual_per_mw_installed)}
          <span style={{ fontSize: '0.45em', marginLeft: '0.15em', color: text(0.3) }}>/MW/yr</span>
        </p>
      </div>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1rem' }}>
        Per MW installed power · 0.5 MW service (2 MW/MW prequalification) · theoretical max if fully allocated
      </p>

      {/* Interpretation */}
      <p style={{ ...MONO, fontSize: '0.6rem', color: data.unavailable ? text(0.2) : text(0.35), lineHeight: 1.5, marginBottom: '1.5rem' }}>
        {data.unavailable ? 'Interpretation unavailable — feed incomplete.' : data.interpretation}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* SECONDARY: spot rates + stress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1.25rem', marginBottom: '1rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>aFRR ↑</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorAfrr(data.afrr_up_avg) }}>
          {fmt(data.afrr_up_avg)} €/MW/h
          <span style={{ color: text(0.25) }}> · CH 2027: €20 · CH 2028: €10</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>mFRR ↑</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorAfrr(data.mfrr_up_avg) }}>
          {fmt(data.mfrr_up_avg)} €/MW/h
          <span style={{ color: text(0.25) }}> · CH 2027: €20 · CH 2030: €11</span>
        </p>

        <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sys stress P90</p>
        <p style={{ ...MONO, fontSize: '0.6rem', color: colorStress(data.stress_index_p90) }}>
          {fmt(data.stress_index_p90)} €/MWh
        </p>
      </div>

      {/* TERTIARY: FCR — muted, context only */}
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        FCR {fmt(data.fcr_avg)} €/MW/h · market: 25 MW (all three Baltics) · saturating 2026
      </p>

      {/* Timestamp */}
      <time dateTime={data.timestamp} style={{ ...MONO, fontSize: '0.575rem', color: text(0.25), letterSpacing: '0.06em', display: 'block', textAlign: 'right' }}>
        {formatTimestamp(data.timestamp)}
      </time>

      <CardFooter
        period="7-day rolling average"
        compare="Baseline: CH S1 2025 central (aFRR €20, mFRR €20 by 2027)"
        updated="BTD · 05:30 UTC"
      />
    </>
  );
}
