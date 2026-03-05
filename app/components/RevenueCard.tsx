'use client';

import React, { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { CardFooter } from './CardFooter';
import { formatHHMM } from '@/lib/safeNum';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const text = (o: number) => `rgba(232, 226, 217, ${o})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };
const DIVIDER: CSSProperties = { borderTop: `1px solid rgba(232, 226, 217, 0.06)`, width: '100%' };

interface TrajPoint { year: number; sd_ratio: number; phase: string; cpi: number; }

interface MarketRow {
  country: string; flag: string;
  irr_pct: number | null; net_annual_per_mw: number | null;
  capex_per_mw: number | null; note: string; is_live: boolean;
}

interface RevenueData {
  project_irr:      number | null;
  equity_irr:       number | null;
  min_dscr:         number | null;
  bankability:      string | null;
  gross_revenue_y1: number | null;
  net_revenue_y1:   number | null;
  capacity_y1:      number | null;
  activation_y1:    number | null;
  arbitrage_y1:     number | null;
  rtm_fees_y1:      number | null;
  opex_y1:          number | null;
  ebitda_y1:        number | null;
  net_mw_yr:        number | null;
  cod_year:         number | null;
  sd_ratio:         number | null;
  phase:            string | null;
  cpi_at_cod:       number | null;
  fleet_trajectory: TrajPoint[] | null;
  prices_source:    string | null;
  model_version:    string | null;
  updated_at:       string | null;
  eu_ranking:       MarketRow[];
  // compat
  irr_2h: number | null;
  irr_4h: number | null;
}

interface S2Data {
  sd_ratio:   number | null;
  phase:      string | null;
  trajectory: TrajPoint[] | null;
}

// ── helpers ────────────────────────────────────────────────────────────────

function fkMw(n: number | null | undefined, mw = 50): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n / mw / 1000)}k`;
}

function fPct(n: number | null | undefined, d = 1): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(d)}%`;
}

function irrColor(v: number | null | undefined): string {
  if (v == null) return text(0.35);
  if (v > 20) return 'rgba(74,222,128,0.95)';
  if (v > 12) return 'rgba(74,222,128,0.70)';
  if (v > 8)  return 'rgba(245,158,11,0.85)';
  return 'rgba(239,68,68,0.80)';
}

function dscrColor(v: number | null | undefined): string {
  if (v == null) return text(0.35);
  if (v >= 1.5)  return 'rgba(74,222,128,0.85)';
  if (v >= 1.20) return 'rgba(245,158,11,0.85)';
  return 'rgba(239,68,68,0.80)';
}

function phaseColor(phase: string | null | undefined): string {
  if (!phase) return text(0.3);
  if (phase === 'SCARCITY') return 'rgba(74,222,128,0.80)';
  if (phase === 'MATURE')   return 'rgba(245,158,11,0.80)';
  if (phase === 'COMPRESS') return 'rgba(239,68,68,0.70)';
  return text(0.45);
}

function colorIrrMarket(irr: number | null | undefined): string {
  if (irr == null) return text(0.3);
  if (irr > 20) return 'rgba(74,222,128,0.80)';
  if (irr > 12) return 'rgba(74,222,128,0.55)';
  if (irr > 8)  return text(0.6);
  return 'rgba(239,68,68,0.65)';
}

// ── sub-components ─────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
        letterSpacing: '0.05em', padding: '3px 8px',
        border: `1px solid ${active ? 'rgba(45,212,168,0.45)' : 'rgba(232,226,217,0.10)'}`,
        background: active ? 'rgba(45,212,168,0.07)' : 'transparent',
        color: active ? 'var(--teal)' : text(0.35),
        cursor: 'pointer', transition: 'all 0.15s', borderRadius: '2px',
      }}
    >{label}</button>
  );
}

function TRow({ label, value, valueColor, bold, net }: {
  label: string; value: string; valueColor?: string; bold?: boolean; net?: boolean;
}) {
  const netStyle: CSSProperties = net
    ? { borderTop: '1px solid rgba(232,226,217,0.10)', paddingTop: '6px', marginTop: '2px' }
    : {};
  return (
    <>
      <span style={{ ...MONO, fontSize: '0.6rem', color: text(0.30), letterSpacing: '0.06em', textTransform: 'uppercase', alignSelf: 'center', ...netStyle }}>
        {label}
      </span>
      <span style={{ ...MONO, fontSize: bold ? '0.72rem' : '0.625rem', fontWeight: bold ? 500 : 400, color: valueColor ?? text(0.6), textAlign: 'right', ...netStyle }}>
        {value}
      </span>
    </>
  );
}

function IrrBar({ irr, max = 50 }: { irr: number; max?: number }) {
  const pct = Math.min((irr / max) * 100, 100);
  const c = irr > 20 ? 'rgba(74,222,128,0.65)' : irr > 12 ? 'rgba(245,158,11,0.65)' : 'rgba(239,68,68,0.55)';
  return (
    <div style={{ width: '60px', height: '4px', background: 'rgba(232,226,217,0.08)', alignSelf: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, background: c }} />
    </div>
  );
}

function Skeleton() {
  return (
    <>
      {[80, 55, 95, 70, 85].map((w, i) => (
        <div key={i} style={{ height: '14px', width: `${w}%`, background: 'rgba(232,226,217,0.06)', borderRadius: '2px', animation: 'shimmer 1.5s ease infinite', marginBottom: '6px' }} />
      ))}
      <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.2), letterSpacing: '0.1em', marginTop: '8px' }}>Computing…</p>
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

// ── LiveData ───────────────────────────────────────────────────────────────

function LiveData({ data, s2, cod, setCod, mw, mwh }: {
  data: RevenueData; s2: S2Data | null; cod: string; setCod: (v: string) => void; mw: number; mwh: number;
}) {
  const fleetTraj = data.fleet_trajectory ?? s2?.trajectory ?? null;
  const trajByYear: Record<string, TrajPoint> = fleetTraj
    ? Object.fromEntries(fleetTraj.map(t => [String(t.year), t]))
    : {};

  const projIrr = data.project_irr != null ? Math.round(data.project_irr * 1000) / 10 : null;
  const eqIrr   = data.equity_irr  != null ? Math.round(data.equity_irr  * 1000) / 10 : null;
  const ts = data.updated_at ?? null;

  return (
    <>
      {/* Dual IRR heroes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', marginBottom: '1.25rem' }}>
        {[
          { label: 'Project IRR', value: projIrr },
          { label: 'Equity IRR',  value: eqIrr },
        ].map(({ label, value }) => (
          <div key={label} style={{ padding: '12px 16px', border: '1px solid rgba(232,226,217,0.06)', background: 'rgba(232,226,217,0.015)' }}>
            <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.3), letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</p>
            <p style={{ ...MONO, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 400, color: irrColor(value), lineHeight: 1, letterSpacing: '-0.01em' }}>
              {value != null ? `${value.toFixed(1)}%` : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Delta vs CH benchmark */}
      {projIrr != null && (() => {
        const benchmarkIrr = 16.6;
        const delta = projIrr - benchmarkIrr;
        const sign = delta >= 0 ? '+' : '';
        return (
          <div style={{ ...MONO, fontSize: '0.6rem', color: text(0.35), marginBottom: '1rem', textAlign: 'center' }}>
            {`CH S1 2025 ref: ${benchmarkIrr.toFixed(1)}% · Live: ${sign}${delta.toFixed(1)}pp vs benchmark`}
          </div>
        );
      })()}

      {/* DSCR bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.3), letterSpacing: '0.08em', textTransform: 'uppercase' }}>Min DSCR</span>
          <span style={{ ...MONO, fontSize: '0.72rem', color: dscrColor(data.min_dscr), fontWeight: 500 }}>
            {data.min_dscr != null ? `${data.min_dscr.toFixed(2)}×` : '—'}
            {' '}
            <span style={{ fontSize: '0.55rem', color: text(0.3) }}>
              {data.bankability === 'PASS' ? '✓ Bankable' : data.bankability === 'FAIL' ? '✗ Not bankable' : ''}
            </span>
          </span>
        </div>
        <div style={{ height: '3px', background: 'rgba(232,226,217,0.08)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-2px', bottom: '-2px', left: `${Math.min((1.2 / 3) * 100, 100)}%`, width: '1px', background: 'rgba(245,158,11,0.5)' }} />
          {data.min_dscr != null && (
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min((data.min_dscr / 3) * 100, 100)}%`, background: dscrColor(data.min_dscr) }} />
          )}
        </div>
        <div style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), marginTop: '3px' }}>1.20× threshold · bankability floor</div>
      </div>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* Revenue table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 1.5rem', marginBottom: '0.5rem', alignItems: 'baseline' }}>
        <TRow label="Capacity / yr"   value={fkMw(data.capacity_y1, mw)}   valueColor="rgba(74,222,128,0.70)" />
        <TRow label="Activation / yr" value={fkMw(data.activation_y1, mw)} valueColor="rgba(74,222,128,0.55)" />
        <TRow label="Arbitrage / yr"  value={fkMw(data.arbitrage_y1, mw)}  valueColor="rgba(74,222,128,0.45)" />
        <TRow label="RTM fees"        value={data.rtm_fees_y1 != null ? `−${fkMw(data.rtm_fees_y1, mw)}` : '—'} valueColor={text(0.3)} />
        <TRow label="Gross / yr"      value={fkMw(data.gross_revenue_y1, mw)} bold />
        <TRow label="OPEX / yr"       value={data.opex_y1 != null ? `−${fkMw(data.opex_y1, mw)}` : '—'} valueColor="rgba(239,68,68,0.60)" />
        <TRow label="EBITDA / yr"     value={fkMw(data.ebitda_y1, mw)} bold valueColor="rgba(74,222,128,0.80)" net />
        <TRow label="Net / MW / yr"   value={data.net_mw_yr != null ? `€${data.net_mw_yr.toLocaleString('en-GB')}` : '—'} />
      </div>
      <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.2), marginBottom: '1.25rem' }}>
        Per MW · Year 1 · {mw} MW / {mwh} MWh · 20yr model
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* COD sensitivity bars */}
      <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.12em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.75rem' }}>
        COD · Fleet S/D at delivery
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1.25rem' }}>
        {(['2027', '2028', '2029'] as const).map(yr => {
          const t = trajByYear[yr];
          const isCod = cod === yr;
          const sdVal = t?.sd_ratio ?? null;
          const barPct = sdVal != null ? Math.min(sdVal * 100, 100) : 0;
          return (
            <button
              key={yr}
              onClick={() => setCod(yr)}
              style={{
                display: 'grid', gridTemplateColumns: '2.5rem 1fr 3rem 4.5rem',
                gap: '0 8px', alignItems: 'center',
                background: isCod ? 'rgba(232,226,217,0.04)' : 'transparent',
                border: `1px solid ${isCod ? 'rgba(232,226,217,0.12)' : 'rgba(232,226,217,0.04)'}`,
                padding: '5px 8px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ ...MONO, fontSize: '0.6rem', color: isCod ? text(0.7) : text(0.35), fontWeight: isCod ? 500 : 400 }}>{yr}</span>
              <div style={{ height: '3px', background: 'rgba(232,226,217,0.08)', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${barPct}%`, background: phaseColor(t?.phase) }} />
              </div>
              <span style={{ ...MONO, fontSize: '0.55rem', color: phaseColor(t?.phase), textAlign: 'right' }}>
                {sdVal != null ? `${sdVal.toFixed(2)}×` : '—'}
              </span>
              <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.25), textAlign: 'right' }}>
                {t?.phase ?? '—'}
              </span>
            </button>
          );
        })}
      </div>
      <p style={{ ...MONO, fontSize: '0.45rem', color: text(0.18), marginBottom: '1.25rem' }}>
        S/D ratio = fleet capacity vs revenue opportunity · source: {data.prices_source ?? 'S2 fleet model'}
      </p>

      <div style={{ ...DIVIDER, marginBottom: '1.25rem' }} />

      {/* EU Market Ranking */}
      {data.eu_ranking && data.eu_ranking.length > 0 && (
        <>
          <p style={{ ...MONO, fontSize: '0.5rem', letterSpacing: '0.14em', color: text(0.25), textTransform: 'uppercase', marginBottom: '0.9rem' }}>
            EU Market Ranking — BESS IRR
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 50px 70px 70px', gap: '0.35rem 0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            {data.eu_ranking.map(m => {
              const isLT = m.country === 'Lithuania';
              return (
                <React.Fragment key={m.country}>
                  <span style={{ ...MONO, fontSize: '0.75rem', lineHeight: 1 }}>{m.flag}</span>
                  <div style={isLT ? { borderLeft: '2px solid rgba(123,94,167,0.6)', paddingLeft: '8px', background: 'rgba(123,94,167,0.04)' } : {}}>
                    <p style={{ ...MONO, fontSize: '0.65rem', color: text(0.65) }}>
                      {m.country}{' '}
                      {m.is_live
                        ? <span style={{ fontSize: '0.55rem', color: 'rgba(74,222,128,0.75)', background: 'rgba(74,222,128,0.1)', padding: '0 0.3em', borderRadius: '2px' }}>live</span>
                        : <span style={{ ...MONO, fontSize: '0.55rem', color: text(0.3) }}>ref</span>
                      }
                    </p>
                    <p style={{ ...MONO, fontSize: '0.55rem', color: text(0.28), marginTop: '1px' }}>{m.note}</p>
                  </div>
                  <p style={{ ...MONO, fontSize: '0.65rem', color: colorIrrMarket(m.irr_pct), textAlign: 'right' }}>
                    {m.irr_pct != null ? `${m.irr_pct.toFixed(0)}%` : '—'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '4px' }}>
                    {m.irr_pct != null && <IrrBar irr={m.irr_pct} />}
                  </div>
                  <p style={{ ...MONO, fontSize: '0.6rem', color: text(0.4), textAlign: 'right' }}>
                    {m.net_annual_per_mw != null ? `€${Math.round(m.net_annual_per_mw / 1000)}k` : '—'}
                  </p>
                </React.Fragment>
              );
            })}
          </div>
          <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), lineHeight: 1.6, marginBottom: '1.25rem' }}>
            LT uses live signal data. Other markets: static reference. Source: CH S1 2025
          </p>
        </>
      )}

      {/* Stacking disclosure */}
      <div style={{ ...DIVIDER, marginBottom: '1rem' }} />
      <p style={{ ...MONO, fontSize: '0.5rem', color: text(0.22), lineHeight: 1.7, marginBottom: '1rem' }}>
        Revenue stack: FCR + aFRR + mFRR capacity + 1 DA arbitrage cycle/day.
        CPI at COD: {data.cpi_at_cod != null ? fPct(data.cpi_at_cod * 100, 0) : '—'}.
        CAPEX: 70% debt / 30% equity.
        {data.model_version ? ` Model ${data.model_version}.` : ''}
      </p>

      {/* Model input footer */}
      <div style={{ ...MONO, fontSize: '0.55rem', color: text(0.22), letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
        MODEL INPUT → IRR · DSCR · Revenue waterfall
      </div>

      <CardFooter
        period={`COD ${cod} · ${mw} MW / ${mwh} MWh`}
        compare="CH ref: 2h COD 2027 = 16.6% IRR"
        updated={`computed ${formatHHMM(ts)} UTC`}
        timestamp={ts}
      />
    </>
  );
}

// ── main export ────────────────────────────────────────────────────────────

export function RevenueCard() {
  const [mw,     setMw]     = useState<number>(50);
  const [mwh,    setMwh]    = useState<number>(100);
  const [capex,  setCapex]  = useState<'low' | 'mid' | 'high'>('mid');
  const [grant,  setGrant]  = useState<'none' | 'partial' | 'full'>('none');
  const [cod,    setCod]    = useState<string>('2028');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [data,   setData]   = useState<RevenueData | null>(null);
  const [s2,     setS2]     = useState<S2Data | null>(null);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ mw: String(mw), mwh: String(mwh), capex, grant, cod });
      const [rev, s2r] = await Promise.all([
        fetch(`${WORKER_URL}/revenue?${params}`).then(r => r.json()),
        fetch(`${WORKER_URL}/s2`).then(r => r.json()).catch(() => null),
      ]);
      setData(rev as RevenueData);
      setS2(s2r as S2Data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [mw, mwh, capex, grant, cod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const numInputStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
    background: 'transparent', border: '1px solid rgba(232,226,217,0.12)',
    color: text(0.65), padding: '2px 6px', width: '52px',
    borderRadius: '2px', textAlign: 'center' as const,
  };

  return (
    <article
      style={{
        border: `1px solid rgba(232, 226, 217, 0.10)`,
        padding: '2rem 2.5rem',
        maxWidth: '100%', width: '100%', overflow: 'hidden',
      }}
    >
      <h3 style={{ ...MONO, fontSize: '0.8rem', letterSpacing: '0.14em', color: text(0.35), fontWeight: 400, textTransform: 'uppercase', marginBottom: '4px' }}>
        BESS Revenue Engine
      </h3>
      {/* CH benchmark anchor */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
        color: 'var(--text-tertiary)', lineHeight: 1.6,
        padding: '10px 12px', marginBottom: '20px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-card)',
      }}>
        Clean Horizon S1 2025 central:{' '}
        <span style={{ color: 'var(--text-secondary)' }}>16.6% IRR (2H)</span><br />
        Range: 6–31% · Target hurdle: 12%
      </div>

      {/* Selectors */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', marginBottom: '1.5rem' }}>
        {/* System — presets + custom inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ ...MONO, fontSize: '0.48rem', color: text(0.22), letterSpacing: '0.10em', textTransform: 'uppercase' }}>System</span>
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            <Pill label="2H" active={mw === 50 && mwh === 100} onClick={() => { setMw(50); setMwh(100); }} />
            <Pill label="4H" active={mw === 50 && mwh === 200} onClick={() => { setMw(50); setMwh(200); }} />
            <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.2), margin: '0 4px' }}>or</span>
            <input
              type="number" value={mw} min={1} max={500}
              onChange={e => setMw(Math.max(1, parseInt(e.target.value) || 50))}
              style={numInputStyle}
              title="MW"
            />
            <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.2) }}>MW</span>
            <input
              type="number" value={mwh} min={1} max={2000}
              onChange={e => setMwh(Math.max(1, parseInt(e.target.value) || 100))}
              style={numInputStyle}
              title="MWh"
            />
            <span style={{ ...MONO, fontSize: '0.5rem', color: text(0.2) }}>MWh</span>
          </div>
        </div>
        {/* CAPEX */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ ...MONO, fontSize: '0.48rem', color: text(0.22), letterSpacing: '0.10em', textTransform: 'uppercase' }}>CAPEX</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['low', 'mid', 'high'] as const).map(v => (
              <Pill key={v} label={v === 'low' ? '€120' : v === 'mid' ? '€164' : '€262'} active={capex === v} onClick={() => setCapex(v)} />
            ))}
          </div>
        </div>
        {/* Grant */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ ...MONO, fontSize: '0.48rem', color: text(0.22), letterSpacing: '0.10em', textTransform: 'uppercase' }}>Grant</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['none', 'partial', 'full'] as const).map((v, i) => (
              <Pill key={v} label={['none', '10%', '30%'][i]} active={grant === v} onClick={() => setGrant(v)} />
            ))}
          </div>
        </div>
        {/* COD */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ ...MONO, fontSize: '0.48rem', color: text(0.22), letterSpacing: '0.10em', textTransform: 'uppercase' }}>COD</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['2027', '2028', '2029'] as const).map(v => (
              <Pill key={v} label={v} active={cod === v} onClick={() => setCod(v)} />
            ))}
          </div>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="false">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState />}
        {status === 'success' && data && (
          <LiveData data={data} s2={s2} cod={cod} setCod={setCod} mw={mw} mwh={mwh} />
        )}
      </div>
    </article>
  );
}
