'use client';

import { useEffect, useState, type CSSProperties } from 'react';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface RevenueResult {
  afrr_annual_per_mw: number;
  mfrr_annual_per_mw: number;
  trading_annual_per_mw: number;
  gross_annual_per_mw: number;
  opex_annual_per_mw: number;
  net_annual_per_mw: number;
  capex_per_mw: number;
  simple_payback_years: number;
  irr_approx_pct: number;
  irr_vs_ch_central: string;
  ch_irr_central: number;
  ch_irr_range: string;
  market_window_note: string;
}

interface MarketRow {
  country: string;
  flag: string;
  irr_pct: number;
  net_annual_per_mw: number;
  capex_per_mw: number;
  note: string;
  is_live: boolean;
}

interface RevenueData {
  updated_at: string;
  prices: {
    afrr_up_avg: number;
    mfrr_up_avg: number;
    spread_eur_mwh: number;
    euribor_3m: number;
  };
  h2: RevenueResult;
  h4: RevenueResult;
  eu_ranking: MarketRow[];
  interpretations: {
    s1: string; s2: string; s3: string; s4: string; combined: string;
  } | null;
}

const text = (o: number) => `rgba(232, 226, 217, ${o})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

const STRONG_GREEN = 'rgba(74, 124, 89, 0.9)';
const MID_GREEN    = 'rgba(100, 160, 110, 0.75)';
const MID_AMBER    = 'rgba(180, 140, 60, 0.85)';
const MID_RED      = 'rgba(155, 48, 67, 0.85)';

function colorRevenue(value: number, type: 'afrr_mfrr' | 'trading' | 'net' | 'opex' | 'payback' | 'irr'): string {
  if (type === 'opex') return text(0.35);
  if (type === 'afrr_mfrr') {
    if (value > 200000) return STRONG_GREEN;
    if (value > 100000) return MID_GREEN;
    if (value > 50000)  return text(0.6);
    return text(0.3);
  }
  if (type === 'trading') {
    if (value > 50000) return MID_GREEN;
    if (value > 20000) return text(0.6);
    return text(0.35);
  }
  if (type === 'net') {
    if (value > 300000) return STRONG_GREEN;
    if (value > 150000) return MID_GREEN;
    if (value > 100000) return text(0.6);
    return MID_AMBER;
  }
  if (type === 'payback') {
    if (value < 2)  return STRONG_GREEN;
    if (value < 4)  return MID_GREEN;
    if (value < 6)  return text(0.6);
    return MID_AMBER;
  }
  if (type === 'irr') {
    if (value > 30) return STRONG_GREEN;
    if (value > 15) return MID_GREEN;
    if (value > 12) return text(0.6);
    return MID_RED;
  }
  return text(0.6);
}

function colorIrrMarket(irr: number): string {
  if (irr > 20) return STRONG_GREEN;
  if (irr > 12) return MID_GREEN;
  if (irr > 8)  return text(0.6);
  return MID_RED;
}

function fk(n: number): string {
  return `€${Math.round(n / 1000)}k`;
}

type Status = 'loading' | 'success' | 'error';
const FETCH_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS   = 2_000;

export function RevenueCard() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData]     = useState<RevenueData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (attempt: number): Promise<void> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`${WORKER_URL}/revenue`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as RevenueData;
        if (!cancelled) { setData(d); setStatus('success'); }
      } catch (_err) {
        clearTimeout(timer);
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
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
        maxWidth: '520px',
        width: '100%',
      }}
    >
      {/* Header */}
      <p style={{ ...MONO, fontSize: '0.625rem', letterSpacing: '0.14em', color: text(0.35), textTransform: 'uppercase', marginBottom: '0.3rem' }}>
        BESS Revenue Engine
      </p>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1.75rem' }}>
        50 MW LFP · Lithuania · COD 2026 · 18yr life · Clean Horizon S1 2025 reference
      </p>

      {status === 'loading' && <Skeleton />}
      {status === 'error'   && <ErrorState />}
      {status === 'success' && data && <LiveData data={data} />}
    </article>
  );
}

function Skeleton() {
  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, marginBottom: '0.75rem' }}>——————</p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em' }}>Fetching</p>
    </>
  );
}

function ErrorState() {
  return (
    <>
      <p style={{ ...MONO, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 400, color: text(0.1), lineHeight: 1, marginBottom: '0.75rem' }}>——————</p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.25), letterSpacing: '0.1em' }}>Data unavailable</p>
    </>
  );
}

const DIVIDER: CSSProperties = { borderTop: `1px solid rgba(232, 226, 217, 0.06)`, width: '100%' };

const COL_HEADER: CSSProperties = {
  ...MONO, fontSize: '0.5rem', color: 'rgba(232, 226, 217, 0.25)',
  letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'right',
};

function Row({
  label, v2, v2Color, v4, v4Color,
}: {
  label: string; v2: string; v2Color?: string; v4: string; v4Color?: string;
}) {
  return (
    <>
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center' }}>{label}</p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: v2Color ?? text(0.6), textAlign: 'right' }}>{v2}</p>
      <p style={{ ...MONO, fontSize: '0.625rem', color: v4Color ?? text(0.6), textAlign: 'right' }}>{v4}</p>
    </>
  );
}

function LiveData({ data }: { data: RevenueData }) {
  const { h2, h4, eu_ranking, interpretations } = data;

  return (
    <>
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '0.45rem 1rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
        <span />
        <p style={{ ...COL_HEADER }}>2h</p>
        <p style={{ ...COL_HEADER }}>4h</p>

        <Row
          label="CAPEX/MW"
          v2={`€${(h2.capex_per_mw / 1000).toFixed(0)}k`}
          v2Color={text(0.4)}
          v4={`€${(h4.capex_per_mw / 1000).toFixed(0)}k`}
          v4Color={text(0.4)}
        />
        <Row
          label="aFRR/MW/yr"
          v2={fk(h2.afrr_annual_per_mw)}
          v2Color={colorRevenue(h2.afrr_annual_per_mw, 'afrr_mfrr')}
          v4={fk(h4.afrr_annual_per_mw)}
          v4Color={colorRevenue(h4.afrr_annual_per_mw, 'afrr_mfrr')}
        />
        <Row
          label="mFRR/MW/yr"
          v2={fk(h2.mfrr_annual_per_mw)}
          v2Color={colorRevenue(h2.mfrr_annual_per_mw, 'afrr_mfrr')}
          v4={fk(h4.mfrr_annual_per_mw)}
          v4Color={colorRevenue(h4.mfrr_annual_per_mw, 'afrr_mfrr')}
        />
        <Row
          label="Trading/MW/yr"
          v2={fk(h2.trading_annual_per_mw)}
          v2Color={colorRevenue(h2.trading_annual_per_mw, 'trading')}
          v4={fk(h4.trading_annual_per_mw)}
          v4Color={colorRevenue(h4.trading_annual_per_mw, 'trading')}
        />
        <Row
          label="OPEX/MW/yr"
          v2={`−${fk(h2.opex_annual_per_mw)}`}
          v2Color={colorRevenue(h2.opex_annual_per_mw, 'opex')}
          v4={`−${fk(h4.opex_annual_per_mw)}`}
          v4Color={colorRevenue(h4.opex_annual_per_mw, 'opex')}
        />
        <Row
          label="NET/MW/yr"
          v2={fk(h2.net_annual_per_mw)}
          v2Color={colorRevenue(h2.net_annual_per_mw, 'net')}
          v4={fk(h4.net_annual_per_mw)}
          v4Color={colorRevenue(h4.net_annual_per_mw, 'net')}
        />
      </div>

      <div style={{ ...DIVIDER, marginBottom: '0.75rem' }} />

      {/* Payback + IRR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '0.45rem 1rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
        <Row
          label="Payback"
          v2={`${h2.simple_payback_years}yr`}
          v2Color={colorRevenue(h2.simple_payback_years, 'payback')}
          v4={`${h4.simple_payback_years}yr`}
          v4Color={colorRevenue(h4.simple_payback_years, 'payback')}
        />
        <Row
          label="IRR est."
          v2={`${h2.irr_approx_pct}%`}
          v2Color={colorRevenue(h2.irr_approx_pct, 'irr')}
          v4={`${h4.irr_approx_pct}%`}
          v4Color={colorRevenue(h4.irr_approx_pct, 'irr')}
        />
      </div>

      {/* CH benchmark reference */}
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        CH central: {h2.ch_irr_central}% (2h) · Range: {h2.ch_irr_range} · Target: 12%
      </p>

      {/* LLM interpretation */}
      {interpretations?.combined && (
        <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.55), lineHeight: 1.6, fontStyle: 'italic', marginBottom: '1.25rem' }}>
          {interpretations.combined}
        </p>
      )}

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Model note */}
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), lineHeight: 1.7, marginBottom: '1.5rem' }}>
        Model: aFRR/mFRR capacity + 1 DA cycle/day · 0.5 MW aFRR per MW installed (2h system) · 8%/yr revenue decay post-2028 · CAPEX from CH S1 2025 tier-1 quotes
      </p>

      {/* EU Market Ranking */}
      <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.9rem' }}>
        EU Market Ranking — 2h BESS
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.35rem 0.75rem', marginBottom: '1rem', alignItems: 'baseline' }}>
        {eu_ranking.map((m) => (
          <>
            <span key={`${m.country}-flag`} style={{ ...MONO, fontSize: '0.75rem' }}>{m.flag}</span>
            <div key={`${m.country}-name`}>
              <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.65) }}>
                {m.country}{' '}
                {m.is_live
                  ? <span style={{ fontSize: '0.5rem', color: 'rgba(120,200,120,0.8)', background: 'rgba(120,200,120,0.12)', padding: '0 0.3em', borderRadius: '2px' }}>live</span>
                  : <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.3) }}>ref</span>
                }
              </p>
              <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), marginTop: '0.1rem' }}>{m.note}</p>
            </div>
            <p key={`${m.country}-irr`} style={{ ...MONO, fontSize: '0.625rem', color: colorIrrMarket(m.irr_pct), textAlign: 'right' }}>{m.irr_pct.toFixed(0)}%</p>
            <p key={`${m.country}-net`} style={{ ...MONO, fontSize: '0.6rem', color: text(0.4), textAlign: 'right' }}>{fk(m.net_annual_per_mw)}/MW</p>
          </>
        ))}
      </div>

      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), lineHeight: 1.6 }}>
        LT uses live signal data. Other markets: static reference. Source: Clean Horizon S1 2025, public ENTSO-E data
      </p>
    </>
  );
}
