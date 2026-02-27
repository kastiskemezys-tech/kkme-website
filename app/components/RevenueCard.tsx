'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { CardFooter } from './CardFooter';
import { formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface RevenueResult {
  afrr_annual_per_mw:    number | null;
  mfrr_annual_per_mw:    number | null;
  trading_annual_per_mw: number | null;
  gross_annual_per_mw:   number | null;
  opex_annual_per_mw:    number | null;
  net_annual_per_mw:     number | null;
  capex_per_mw:          number | null;
  simple_payback_years:  number | null;
  irr_approx_pct:        number | null;
  irr_vs_ch_central:     string | null;
  ch_irr_central:        number | null;
  ch_irr_range:          string | null;
  market_window_note:    string | null;
}

interface MarketRow {
  country:            string;
  flag:               string;
  irr_pct:            number | null;
  net_annual_per_mw:  number | null;
  capex_per_mw:       number | null;
  note:               string;
  is_live:            boolean;
}

interface RevenueData {
  updated_at: string;
  prices: {
    afrr_up_avg:    number | null;
    mfrr_up_avg:    number | null;
    spread_eur_mwh: number | null;
    euribor_3m:     number | null;
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

function colorRevenue(value: number | null | undefined, type: 'afrr_mfrr' | 'trading' | 'net' | 'opex' | 'payback' | 'irr'): string {
  if (value == null || !isFinite(value)) return text(0.35);
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

function colorIrrMarket(irr: number | null | undefined): string {
  if (irr == null) return text(0.3);
  if (irr > 20) return STRONG_GREEN;
  if (irr > 12) return MID_GREEN;
  if (irr > 8)  return text(0.6);
  return MID_RED;
}

/** Format a €/yr value in thousands, or '—' if null/undefined/NaN. */
function fk(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n / 1000)}k`;
}

/** Format payback years, guarding against Infinity and null. */
function fPayback(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(1)}yr`;
}

/** Format percentage, guarding against null. */
function fPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
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
      <h3 style={{ ...MONO, fontSize: '0.8rem', letterSpacing: '0.14em', color: text(0.35), fontWeight: 400, textTransform: 'uppercase', marginBottom: '0.3rem' }}>
        BESS Revenue Engine
      </h3>
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1.75rem' }}>
        50 MW LFP · Lithuania · COD 2026 · 18yr life · Clean Horizon S1 2025 reference
      </p>

      <div aria-live="polite" aria-atomic="false">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState />}
        {status === 'success' && data && <LiveData data={data} />}
      </div>
    </article>
  );
}

function ShimmerRow() {
  return (
    <div style={{ height: '14px', background: 'rgba(232,226,217,0.06)', borderRadius: '2px', animation: 'shimmer 1.5s ease infinite', marginBottom: '6px' }} />
  );
}

function Skeleton() {
  return (
    <>
      <ShimmerRow /><ShimmerRow /><ShimmerRow /><ShimmerRow />
      <p style={{ ...MONO, fontSize: '0.625rem', color: text(0.2), letterSpacing: '0.1em', marginTop: '8px' }}>Computing…</p>
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
  ...MONO, fontSize: '0.65rem', color: 'rgba(232, 226, 217, 0.30)',
  letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'right',
};

function IrrBar({ irr, max = 50 }: { irr: number; max?: number }) {
  const pct = Math.min((irr / max) * 100, 100);
  const barColor = irr > 30 ? 'rgba(86,166,110,0.7)' : irr > 15 ? 'rgba(204,160,72,0.7)' : 'rgba(214,88,88,0.6)';
  return (
    <div style={{ display: 'inline-block', width: '60px', height: '4px', background: 'rgba(232,226,217,0.08)', verticalAlign: 'middle', marginLeft: '8px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barColor }} />
    </div>
  );
}

function Row({
  label, v2, v2Color, v4, v4Color, net,
}: {
  label: string; v2: string; v2Color?: string; v4: string; v4Color?: string; net?: boolean;
}) {
  const netStyle: CSSProperties = net ? {
    borderTop: '1px solid rgba(232,226,217,0.12)',
    paddingTop: '8px',
    marginTop: '4px',
  } : {};
  return (
    <>
      <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.30), letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center', ...netStyle }}>{label}</p>
      <p style={{ ...MONO, fontSize: net ? '0.75rem' : '0.625rem', fontWeight: net ? 500 : 400, color: v2Color ?? text(0.6), textAlign: 'right', ...netStyle }}>{v2}</p>
      <p style={{ ...MONO, fontSize: net ? '0.75rem' : '0.625rem', fontWeight: net ? 500 : 400, color: v4Color ?? text(0.6), textAlign: 'right', ...netStyle }}>{v4}</p>
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
          v2={h2.capex_per_mw != null ? `€${(h2.capex_per_mw / 1000).toFixed(0)}k` : '—'}
          v2Color="rgba(214,88,88,0.65)"
          v4={h4.capex_per_mw != null ? `€${(h4.capex_per_mw / 1000).toFixed(0)}k` : '—'}
          v4Color="rgba(214,88,88,0.65)"
        />
        <Row
          label="aFRR/MW/yr"
          v2={fk(h2.afrr_annual_per_mw)}
          v2Color="rgba(86,166,110,0.75)"
          v4={fk(h4.afrr_annual_per_mw)}
          v4Color="rgba(86,166,110,0.75)"
        />
        <Row
          label="mFRR/MW/yr"
          v2={fk(h2.mfrr_annual_per_mw)}
          v2Color="rgba(86,166,110,0.75)"
          v4={fk(h4.mfrr_annual_per_mw)}
          v4Color="rgba(86,166,110,0.75)"
        />
        <Row
          label="Trading/MW/yr"
          v2={fk(h2.trading_annual_per_mw)}
          v2Color="rgba(86,166,110,0.75)"
          v4={fk(h4.trading_annual_per_mw)}
          v4Color="rgba(86,166,110,0.75)"
        />
        <Row
          label="OPEX/MW/yr"
          v2={h2.opex_annual_per_mw != null ? `−${fk(h2.opex_annual_per_mw)}` : '—'}
          v2Color="rgba(214,88,88,0.65)"
          v4={h4.opex_annual_per_mw != null ? `−${fk(h4.opex_annual_per_mw)}` : '—'}
          v4Color="rgba(214,88,88,0.65)"
        />
        <Row
          label="NET/MW/yr"
          net
          v2={fk(h2.net_annual_per_mw)}
          v2Color={colorRevenue(h2.net_annual_per_mw, 'net')}
          v4={fk(h4.net_annual_per_mw)}
          v4Color={colorRevenue(h4.net_annual_per_mw, 'net')}
        />
      </div>

      <div style={{ ...DIVIDER, marginBottom: '0.75rem' }} />

      {/* Payback + IRR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '0.45rem 1rem', marginBottom: '0.75rem', alignItems: 'baseline' }}>
        <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.30), letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center' }}>Payback</p>
        <p style={{ ...MONO, fontSize: '0.82rem', fontWeight: 500, color: colorRevenue(h2.simple_payback_years, 'payback'), textAlign: 'right' }}>{fPayback(h2.simple_payback_years)}</p>
        <p style={{ ...MONO, fontSize: '0.82rem', fontWeight: 500, color: colorRevenue(h4.simple_payback_years, 'payback'), textAlign: 'right' }}>{fPayback(h4.simple_payback_years)}</p>

        <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.30), letterSpacing: '0.08em', textTransform: 'uppercase', alignSelf: 'center' }}>IRR est.</p>
        <p style={{ ...MONO, fontSize: '0.82rem', fontWeight: 500, color: colorRevenue(h2.irr_approx_pct, 'irr'), textAlign: 'right' }}>{fPct(h2.irr_approx_pct)}</p>
        <p style={{ ...MONO, fontSize: '0.82rem', fontWeight: 500, color: colorRevenue(h4.irr_approx_pct, 'irr'), textAlign: 'right' }}>{fPct(h4.irr_approx_pct)}</p>
      </div>

      {/* CH benchmark reference */}
      <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.3), letterSpacing: '0.06em', marginBottom: '1.25rem' }}>
        CH central: {fPct(h2.ch_irr_central).replace('%', '')}% (2h) · Range: {h2.ch_irr_range ?? '—'} · Target: 12%
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
        Model: aFRR/mFRR capacity + 1 DA cycle/day · 4h system: full 0.5 MW aFRR per MW · 2h system: SoC-constrained ~0.31 MW · 8%/yr revenue decay post-2028 · CAPEX from CH S1 2025
      </p>

      {/* EU Market Ranking */}
      <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.9rem' }}>
        EU Market Ranking — 2h BESS
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.35rem 0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        {eu_ranking.map((m) => {
          const isLT = m.country === 'Lithuania';
          const rowStyle: CSSProperties = isLT ? {
            borderLeft: '2px solid rgba(123,94,167,0.6)',
            paddingLeft: '8px',
            background: 'rgba(123,94,167,0.04)',
          } : {};
          return (
            <>
              <span key={`${m.country}-flag`} style={{ ...MONO, fontSize: '0.75rem' }}>{m.flag}</span>
              <div key={`${m.country}-name`} style={rowStyle}>
                <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.65) }}>
                  {m.country}{' '}
                  {m.is_live
                    ? (
                      <span className="live-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', color: 'rgba(86,166,110,0.8)', background: 'rgba(86,166,110,0.12)', padding: '0 0.3em', borderRadius: '2px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'rgba(86,166,110,0.8)', display: 'inline-block' }} />
                        live
                      </span>
                    )
                    : <span style={{ ...MONO, fontSize: '0.65rem', color: text(0.3) }}>ref</span>
                  }
                </p>
                <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.30), marginTop: '0.1rem' }}>{m.note}</p>
              </div>
              <p key={`${m.country}-irr`} style={{ ...MONO, fontSize: '0.65rem', color: colorIrrMarket(m.irr_pct), textAlign: 'right' }}>
                {m.irr_pct != null ? `${m.irr_pct.toFixed(0)}%` : '—'}
                {m.irr_pct != null && <IrrBar irr={m.irr_pct} />}
              </p>
              <p key={`${m.country}-net`} style={{ ...MONO, fontSize: '0.65rem', color: text(0.4), textAlign: 'right' }}>
                {fk(m.net_annual_per_mw)}/MW
              </p>
            </>
          );
        })}
      </div>

      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), lineHeight: 1.6 }}>
        LT uses live signal data. Other markets: static reference. Source: Clean Horizon S1 2025, public ENTSO-E data
      </p>

      <CardFooter
        period="COD today · 18yr life · live prices = year 1"
        compare="CH central (COD 2027): 2h = 16.6% IRR"
        updated={`computed ${formatHHMM(data.updated_at)} UTC`}
      />
    </>
  );
}
