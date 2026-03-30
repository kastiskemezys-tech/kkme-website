'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer, ImpactLine, DataClassBadge,
} from '@/app/components/primitives';
import { CopyButton } from './CopyButton';
import { copyToClipboard, formatTable } from '@/app/lib/copyUtils';
import { useChartColors, useTooltipStyle, CHART_FONT } from '@/app/lib/chartTheme';
import { useIsDesktop } from '@/app/lib/useIsDesktop';
import type { ImpactState, Sentiment } from '@/app/lib/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler);

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── types ──────────────────────────────────────────────────────────────────

interface YearRow {
  yr: number; cal_year: number; retention: number;
  rev_bal: number; rev_trd: number; rev_gross: number;
  rtm_fee: number; brp_fee: number; rev_net: number;
  opex: number; ebitda: number; dscr: number | null;
  cfads: number; ds: number; debt_bal: number;
  project_cf: number; equity_cf: number;
  compress_total: number; usable_mwh_per_mw: number;
  maint_capex: number; depr: number;
  rev_cap: number; rev_act: number;
}

interface ScenarioSummary {
  project_irr: number | null; equity_irr: number | null;
  min_dscr: number | null; net_mw_yr: number | null;
  bankability: string | null; ebitda_y1: number | null;
}

interface MatrixCell {
  cod: number; capex: string; capex_kwh: number;
  project_irr: number | null; equity_irr: number | null;
  min_dscr: number | null; net_mw_yr: number | null;
  bankability: string | null;
}

interface MonthlyDSCR {
  month: string; seasonal_factor: number;
  cfads: number; debt_service: number; dscr: number | null;
}

interface BaseYear {
  annual_totals: { gross: number; balancing: number; trading: number };
  months?: Array<{ month: string; trading: number; balancing: number; gross: number }>;
  data_coverage: { s1_months: number; s2_months: number };
  time_model?: { effective_arb_pct: number };
}

interface ForwardCompression {
  compression_rate_observed: number;
  compression_source: string;
  compression_data_points: number;
  scenario_multiplier: number;
  effective_compression_rate: number;
}

interface LiveRate {
  today_trading_daily: number; today_balancing_daily: number;
  today_total_daily: number; base_daily: number;
  delta_pct: number; annualised: number;
  capture_used: number; as_of: string;
  error?: string;
}

interface BacktestMonth {
  month: string; trading_daily: number; balancing_daily: number;
  total_daily: number; s1_capture: number; days: number;
}

interface SignalDelta { current: number; previous: number; delta: number; }
interface Deltas {
  irr_pp: number; net_rev: number;
  signals: Record<string, SignalDelta>;
  prev_date: string;
}

interface SignalInputs {
  s1_capture: number; afrr_clearing: number; mfrr_clearing: number;
  afrr_cap: number; mfrr_cap: number; euribor: number;
  rate_allin_pct: number;
}

interface Assumptions {
  trading_realisation: number;
  trading_realisation_note: string;
  compression_scenario_mult: number;
  effective_compression: number;
}

interface DurationDetail {
  capex_per_mw: number; irr_approx_pct: number;
  simple_payback_years: number | null;
  gross_annual_per_mw: number; opex_annual_per_mw: number;
  net_annual_per_mw: number;
}

interface RevenueData {
  // Config
  system: string; duration: number; capex_scenario: string;
  capex_kwh: number; capex_total: number; capex_net: number;
  gross_capex: number; net_capex: number; cod_year: number;
  scenario: string; model_version: string;

  // Market context
  sd_ratio: number | null; phase: string | null; cpi_at_cod: number | null;

  // Headline
  project_irr: number | null; equity_irr: number | null;
  min_dscr: number | null; bankability: string | null;
  simple_payback_years: number | null;
  net_mw_yr: number | null;
  crossover_year: number | null;
  revenue_crossover_year: number | null;
  revenue_crossover_note: string;

  // Y1 compat
  gross_revenue_y1: number; net_revenue_y1: number;
  ebitda_y1: number; opex_y1: number; rtm_fees_y1: number;
  capacity_y1: number; activation_y1: number; arbitrage_y1: number;

  // Financing
  debt_initial: number; equity_initial: number; rate_allin: number;
  annual_debt_service: number;

  // Timeseries
  years: YearRow[];
  fleet_trajectory: Array<{ year: number; sd_ratio: number; phase: string; cpi: number }> | null;

  // Scenarios + Matrix
  all_scenarios: Record<string, ScenarioSummary>;
  matrix: MatrixCell[];

  // Duration comparison
  h2: DurationDetail; h4: DurationDetail;
  irr_2h: number | null; irr_4h: number | null;

  // Monthly DSCR
  monthly_y1: MonthlyDSCR[];
  worst_month_dscr: number;

  // v7 fields
  base_year: BaseYear;
  forward: ForwardCompression;
  live_rate: LiveRate;
  backtest: BacktestMonth[];
  deltas: Deltas | null;
  signal_inputs: SignalInputs;
  assumptions: Assumptions;

  // Meta
  prices_source: string | null;
  updated_at: string | null;
  timestamp: string;
  eu_ranking: unknown[];
}

// ── controls ───────────────────────────────────────────────────────────────

type Duration = '2h' | '4h';
type CapexKey = 'low' | 'mid' | 'high';
type CodYear = '2027' | '2028' | '2029';
type Scenario = 'base' | 'conservative' | 'stress';

const CAPEX_LABELS: Record<CapexKey, string> = { low: 'Competitive', mid: 'Market', high: 'EPC' };
const CAPEX_VALUES: Record<CapexKey, number> = { low: 120, mid: 164, high: 262 };
const SCENARIO_LABELS: Record<Scenario, string> = { base: 'Base', conservative: 'Conservative', stress: 'Stress' };

// ── helpers ────────────────────────────────────────────────────────────────

function irrPct(v: number | null | undefined): number | null {
  if (v == null || !isFinite(v)) return null;
  return Math.round(v * 1000) / 10;
}

function fmtPct(v: number | null, d = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(d)}%`;
}

function fmtK(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n / 1000)}k`;
}

function fmtKPerMw(n: number | null | undefined, mw = 50): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n / mw / 1000)}k`;
}

function fmtEuro(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n).toLocaleString('en-GB')}`;
}

function irrColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v > 12) return 'var(--teal)';
  if (v > 8) return 'var(--amber)';
  return 'var(--rose)';
}

function dscrColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v >= 1.20) return 'var(--teal)';
  if (v >= 1.0) return 'var(--amber)';
  return 'var(--rose)';
}

function hurdleStatus(irr: number | null, dscr: number | null): { label: string; sentiment: Sentiment } {
  if (irr != null && irr > 12 && dscr != null && dscr >= 1.20)
    return { label: 'Above model hurdle', sentiment: 'positive' };
  if (irr != null && irr > 8 && dscr != null && dscr >= 1.0)
    return { label: 'Near model hurdle', sentiment: 'caution' };
  return { label: 'Below model hurdle', sentiment: 'negative' };
}

function impactFromIrr(irr: number | null): { impact: ImpactState; desc: string } {
  if (irr != null && irr > 12) return {
    impact: 'slight_positive',
    desc: 'Reference asset: Returns above model hurdles at current assumptions',
  };
  if (irr != null && irr > 8) return {
    impact: 'mixed',
    desc: 'Reference asset: Near hurdle — COD timing and CAPEX level are the dominant variables',
  };
  return {
    impact: 'slight_negative',
    desc: 'Reference asset: Below hurdle — viability requires different timing or cost assumptions',
  };
}

// ── pill selector ──────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        letterSpacing: '0.05em',
        padding: '3px 10px',
        border: `1px solid ${active ? 'rgba(0,180,160,0.40)' : 'var(--border-card)'}`,
        background: active ? 'var(--teal-bg)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        borderRadius: '2px',
      }}
    >{label}</button>
  );
}

function PillGroup({ label, options, value, onChange }: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>{label}</span>
      <div style={{ display: 'flex', gap: '3px' }}>
        {options.map(o => (
          <Pill key={o.key} label={o.label} active={value === o.key} onClick={() => onChange(o.key)} />
        ))}
      </div>
    </div>
  );
}

// ── share view button ──────────────────────────────────────────────────────

function ShareViewButton() {
  const [label, setLabel] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href);
    setLabel(ok ? 'copied' : 'failed');
    setTimeout(() => setLabel('idle'), 1500);
  };
  const text = label === 'copied' ? 'Link copied' : label === 'failed' ? 'Copy failed' : 'Share this view';
  const color = label === 'copied' ? 'var(--teal)' : label === 'failed' ? 'var(--rose)' : undefined;
  return (
    <button
      type="button" onClick={handleShare}
      style={{
        all: 'unset', display: 'inline-flex', alignItems: 'flex-end',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: color ?? 'var(--text-muted)', cursor: 'pointer',
        padding: '4px 0', transition: 'color 150ms ease',
        minHeight: '28px', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (label === 'idle') e.currentTarget.style.color = 'var(--text-tertiary)'; }}
      onMouseLeave={e => { if (label === 'idle') e.currentTarget.style.color = 'var(--text-muted)'; }}
    >{text}</button>
  );
}

// ── main export ────────────────────────────────────────────────────────────

export function RevenueCard() {
  const [duration, setDuration] = useState<Duration>('2h');
  const [capexKey, setCapexKey] = useState<CapexKey>('mid');
  const [cod, setCod] = useState<CodYear>('2028');
  const [scenario, setScenario] = useState<Scenario>('base');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [data2h, setData2h] = useState<RevenueData | null>(null);
  const [data4h, setData4h] = useState<RevenueData | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);
  const isDesktop = useIsDesktop();

  // URL param persistence — read on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const urlDur = p.get('dur');
    const urlCapex = p.get('capex');
    const urlCod = p.get('cod');
    const urlScen = p.get('scenario');
    if (urlDur === '4h') setDuration('4h');
    if (urlCapex && ['low', 'mid', 'high'].includes(urlCapex)) setCapexKey(urlCapex as CapexKey);
    if (urlCod && ['2027', '2028', '2029'].includes(urlCod)) setCod(urlCod as CodYear);
    if (urlScen && ['base', 'conservative', 'stress'].includes(urlScen)) setScenario(urlScen as Scenario);
  }, []);

  // URL param persistence — write on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (duration !== '2h') p.set('dur', duration);
    if (capexKey !== 'mid') p.set('capex', capexKey);
    if (cod !== '2028') p.set('cod', cod);
    if (scenario !== 'base') p.set('scenario', scenario);
    const search = p.toString();
    window.history.replaceState({}, '', search ? `?${search}` : window.location.pathname);
  }, [duration, capexKey, cod, scenario]);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const common = { capex: capexKey, grant: 'none', cod, scenario };
      const [rev2h, rev4h] = await Promise.all([
        fetch(`${WORKER_URL}/revenue?${new URLSearchParams({ mw: '50', mwh: '100', ...common })}`).then(r => r.json()),
        fetch(`${WORKER_URL}/revenue?${new URLSearchParams({ mw: '50', mwh: '200', ...common })}`).then(r => r.json()),
      ]);
      setData2h(rev2h as RevenueData);
      setData4h(rev4h as RevenueData);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [capexKey, cod, scenario]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDrawer = () => setDrawerKey(k => k + 1);

  // Selected data
  const selected = duration === '4h' ? data4h : data2h;
  const other = duration === '4h' ? data2h : data4h;

  // Scenario data from selected
  const scenData = useMemo(() => {
    if (!selected?.all_scenarios) return null;
    return selected.all_scenarios[scenario] ?? null;
  }, [selected, scenario]);

  const selIrr = scenData ? irrPct(scenData.project_irr) : (selected ? irrPct(selected.project_irr) : null);
  const selDscr = scenData?.min_dscr ?? selected?.min_dscr ?? null;
  const selEbitda = scenData?.ebitda_y1 ?? selected?.ebitda_y1 ?? null;
  const selNetMw = scenData?.net_mw_yr ?? selected?.net_mw_yr ?? null;

  const otherIrr = other ? irrPct(other.all_scenarios?.[scenario]?.project_irr ?? other.project_irr) : null;
  const otherDscr = other?.all_scenarios?.[scenario]?.min_dscr ?? other?.min_dscr ?? null;
  const otherEbitda = other?.all_scenarios?.[scenario]?.ebitda_y1 ?? other?.ebitda_y1 ?? null;

  // ── loading / error ──────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <article style={{ width: '100%' }}>
        <div className="skeleton" style={{ height: '1rem', width: '45%', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '2.5rem', width: '30%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.75rem', width: '55%', marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div className="skeleton" style={{ height: '3rem', width: '25%' }} />
          <div className="skeleton" style={{ height: '3rem', width: '25%' }} />
          <div className="skeleton" style={{ height: '3rem', width: '25%' }} />
        </div>
        <div className="skeleton" style={{ height: '180px', width: '100%' }} />
      </article>
    );
  }

  if (status === 'error' || !data2h) {
    return (
      <article style={{ width: '100%' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Revenue model data unavailable
        </p>
      </article>
    );
  }

  // ── derived values ───────────────────────────────────────────────────────

  const irr2h = irrPct(data2h.all_scenarios?.[scenario]?.project_irr ?? data2h.project_irr);
  const irr4h = data4h ? irrPct(data4h.all_scenarios?.[scenario]?.project_irr ?? data4h.project_irr) : null;
  const dscr2h = data2h.all_scenarios?.[scenario]?.min_dscr ?? data2h.min_dscr;
  const dscr4h = data4h?.all_scenarios?.[scenario]?.min_dscr ?? data4h?.min_dscr ?? null;
  const ebitda2h = data2h.all_scenarios?.[scenario]?.ebitda_y1 ?? data2h.ebitda_y1;
  const ebitda4h = data4h?.all_scenarios?.[scenario]?.ebitda_y1 ?? data4h?.ebitda_y1 ?? null;
  const hurdle2h = hurdleStatus(irr2h, dscr2h);
  const hurdle4h = hurdleStatus(irr4h, dscr4h);

  // Takeaway
  const takeawayBorder = selIrr != null && selIrr > 12
    ? 'var(--teal)' : selIrr != null && selIrr > 8
    ? 'var(--amber)' : 'var(--rose)';
  const durationTag = duration === '4h' ? '4H' : '2H';
  const dscrStr = selDscr != null ? `${selDscr.toFixed(2)}×` : '—';
  const scenarioNote = scenario !== 'base' ? ` (${SCENARIO_LABELS[scenario]} scenario)` : '';

  let takeawayText: string;
  if (selIrr != null && selIrr > 12) {
    takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, ${dscrStr} DSCR, COD ${cod}${scenarioNote}. Above model hurdle — timing supports investment case.`;
  } else if (selIrr != null && selIrr > 8) {
    takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, ${dscrStr} DSCR${scenarioNote}. Near model hurdle — COD timing is the dominant variable.`;
  } else {
    takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, COD ${cod}${scenarioNote}. Below hurdle — earlier timing or lower cost changes the outcome.`;
  }

  const { impact, desc: impactDesc } = impactFromIrr(selIrr);
  const ts = selected?.updated_at ?? data2h.updated_at ?? null;

  // Revenue balance for selected
  const y1 = selected?.years?.[0];
  const revBalPct = y1 && y1.rev_gross > 0 ? Math.round(y1.rev_bal / y1.rev_gross * 100) : null;
  const revTrdPct = y1 && y1.rev_gross > 0 ? Math.round(y1.rev_trd / y1.rev_gross * 100) : null;

  // Payback
  const payback = selected?.simple_payback_years ?? null;

  // Matrix
  const matrix = selected?.matrix ?? [];

  // Revenue crossover
  const crossoverYear = selected?.revenue_crossover_year ?? null;

  return (
    <article style={{ width: '100%' }}>
      {/* 1. HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3
          onClick={openDrawer}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.9375rem',
            color: 'var(--text-tertiary)', letterSpacing: '0.06em',
            textTransform: 'uppercase', fontWeight: 600,
            marginBottom: '6px', cursor: 'pointer', transition: 'color 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          Baltic reference asset returns
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          How timing, duration, and installed cost shape storage economics under current Baltic market conditions.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)', marginTop: '4px',
        }}>
          50MW modeled reference · Lithuania-led Baltic
        </p>
      </div>

      {/* 2. CONTROL STRIP */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '12px 20px',
        marginBottom: '16px', alignItems: 'flex-end',
      }}>
        <PillGroup label="Duration"
          options={[{ key: '2h', label: '2H' }, { key: '4h', label: '4H' }]}
          value={duration} onChange={k => setDuration(k as Duration)} />
        <PillGroup label="CAPEX"
          options={[
            { key: 'low', label: `Competitive (€${CAPEX_VALUES.low})` },
            { key: 'mid', label: `Market (€${CAPEX_VALUES.mid})` },
            { key: 'high', label: `EPC (€${CAPEX_VALUES.high})` },
          ]}
          value={capexKey} onChange={k => setCapexKey(k as CapexKey)} />
        <PillGroup label="COD"
          options={(['2027', '2028', '2029'] as const).map(yr => ({ key: yr, label: yr }))}
          value={cod} onChange={k => setCod(k as CodYear)} />
        <PillGroup label="Scenario"
          options={[
            { key: 'base', label: 'Base' },
            { key: 'conservative', label: 'Conservative' },
            { key: 'stress', label: 'Stress' },
          ]}
          value={scenario} onChange={k => setScenario(k as Scenario)} />
        <ShareViewButton />
      </div>

      {/* 3. 2H vs 4H COMPARISON */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
        gap: '12px', marginBottom: '12px',
      }}>
        {/* 2H card */}
        <div style={{
          padding: '16px',
          border: `1px solid ${duration === '2h' ? 'var(--border-highlight)' : 'var(--border-card)'}`,
          borderLeft: duration === '2h' ? '2px solid var(--teal-subtle)' : undefined,
          background: duration === '2h' ? 'var(--bg-elevated)' : 'transparent',
          opacity: duration === '2h' ? 1 : 0.65,
          transition: 'opacity 150ms ease, border 150ms ease, background 150ms ease',
          cursor: duration === '2h' ? 'default' : 'pointer',
        }}
        onClick={() => { if (duration !== '2h') setDuration('2h'); }}
        >
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: '12px',
          }}>50MW / 2H (100 MWh)</p>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Project IRR</span>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500, color: irrColor(irr2h), marginTop: '4px' }}>
              {fmtPct(irr2h)}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EBITDA/MW/yr</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                {ebitda2h != null ? fmtEuro(Math.round(ebitda2h / 50)) : '—'}
              </p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Min DSCR</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: dscrColor(dscr2h), marginTop: '2px' }}>
                {dscr2h != null ? `${dscr2h.toFixed(2)}×` : '—'}
              </p>
            </div>
          </div>
          <StatusChip status={hurdle2h.label} sentiment={hurdle2h.sentiment} />
        </div>

        {/* 4H card */}
        <div style={{
          padding: '16px',
          border: `1px solid ${duration === '4h' ? 'var(--border-highlight)' : 'var(--border-card)'}`,
          borderLeft: duration === '4h' ? '2px solid var(--teal-subtle)' : undefined,
          background: duration === '4h' ? 'var(--bg-elevated)' : 'transparent',
          opacity: duration === '4h' ? 1 : 0.65,
          transition: 'opacity 150ms ease, border 150ms ease, background 150ms ease',
          cursor: duration === '4h' ? 'default' : 'pointer',
        }}
        onClick={() => { if (duration !== '4h') setDuration('4h'); }}
        >
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: '12px',
          }}>50MW / 4H (200 MWh)</p>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Project IRR</span>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500, color: irrColor(irr4h), marginTop: '4px' }}>
              {fmtPct(irr4h)}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EBITDA/MW/yr</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                {ebitda4h != null ? fmtEuro(Math.round(ebitda4h / 50)) : '—'}
              </p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Min DSCR</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: dscrColor(dscr4h), marginTop: '2px' }}>
                {dscr4h != null ? `${dscr4h.toFixed(2)}×` : '—'}
              </p>
            </div>
          </div>
          <StatusChip status={hurdle4h.label} sentiment={hurdle4h.sentiment} />
        </div>
      </div>

      {/* 4. CENTRAL TAKEAWAY */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)', background: 'var(--bg-elevated)',
        padding: '12px', borderLeft: `2px solid ${takeawayBorder}`,
        marginBottom: '16px', lineHeight: 1.6,
      }}>
        {takeawayText}
      </div>

      {/* 5. METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)',
        gap: '12px', marginBottom: '20px',
      }}>
        <MetricTile label="Project IRR" value={fmtPct(selIrr)} size="standard" />
        <MetricTile label="EBITDA/MW/yr" value={selEbitda != null ? fmtEuro(Math.round(selEbitda / 50)) : '—'} size="standard" />
        <MetricTile label="Min DSCR" value={selDscr != null ? `${selDscr.toFixed(2)}×` : '—'} size="standard" />
        <MetricTile label="Simple payback" value={payback != null ? `${payback} yr` : '—'} size="standard" />
        <MetricTile label="Revenue balance" value={revBalPct != null && revTrdPct != null ? `${revBalPct}% / ${revTrdPct}%` : '—'} size="standard" sublabel="Balancing / Trading" />
      </div>

      {/* 6. 20yr REVENUE STRUCTURE CHART */}
      {selected && selected.years && selected.years.length > 0 && (
        <RevenueStructureChart
          years={selected.years}
          crossoverYear={crossoverYear}
          codYear={selected.cod_year}
          CC={CC}
          ttStyle={ttStyle}
          isDesktop={isDesktop}
        />
      )}

      {/* 7. REVENUE BRIDGE */}
      {selected && (
        <RevenueBridgeChart
          data={selected}
          CC={CC}
          ttStyle={ttStyle}
          isDesktop={isDesktop}
        />
      )}

      {/* 8. 3×3 IRR SENSITIVITY MATRIX */}
      {matrix.length > 0 && (
        <SensitivityMatrix
          matrix={matrix}
          selectedCod={parseInt(cod)}
          selectedCapex={capexKey}
          duration={durationTag}
        />
      )}

      {/* 9. MONTHLY DSCR HEATMAP */}
      {selected && selected.monthly_y1 && selected.monthly_y1.length > 0 && (
        <MonthlyDscrHeatmap months={selected.monthly_y1} />
      )}

      {/* 10. INTERPRETATION */}
      {selected && (() => {
        const capShare = y1 && y1.rev_gross > 0 ? Math.round(y1.rev_bal / y1.rev_gross * 100) : null;
        let interp = '';
        if (selIrr != null && selIrr > 15 && selDscr != null && selDscr > 1.5) {
          interp = `Balancing income makes up ${capShare != null ? `~${capShare}%` : 'the majority'} of gross revenue. At COD ${cod}, fleet competition has not yet compressed these prices enough to narrow the margin.`;
        } else if (selIrr != null && selIrr > 12) {
          interp = `Revenue is split between balancing${capShare != null ? ` (~${capShare}%)` : ''} and trading${revTrdPct != null ? ` (~${revTrdPct}%)` : ''}. Fleet growth has begun to tighten balancing clearing but has not eliminated the spread.`;
        } else if (selIrr != null && selIrr > 8) {
          interp = `Fleet additions by COD ${cod} compress balancing prices enough that small changes in timing or cost shift the outcome between viable and marginal. Trading alone does not close the gap.`;
        } else {
          interp = `By COD ${cod}, fleet growth drives supply past the compression threshold. Balancing clearing prices fall, and the remaining trading revenue cannot cover the cost structure at this CAPEX level.`;
        }
        return (
          <p style={{
            fontFamily: 'var(--font-serif)', fontSize: '0.9375rem',
            color: 'var(--text-secondary)', lineHeight: 1.7,
            margin: '4px 0 16px',
          }}>{interp}</p>
        );
      })()}

      {/* 11. IMPACT LINE */}
      <div style={{ marginBottom: '16px' }}>
        <ImpactLine impact={impact} description={impactDesc} />
      </div>

      {/* 12. SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source={`Model ${selected?.model_version ?? 'v7'} · observed + proxy + modeled`}
          updatedAt={ts ? new Date(ts).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="modeled"
        />
      </button>

      {/* 13. DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View model detail and methodology" defaultOpen={drawerKey > 0}>
          <DrawerContent
            data2h={data2h} data4h={data4h} selected={selected}
            duration={duration} capexKey={capexKey} cod={cod} scenario={scenario}
            CC={CC}
          />
        </DetailsDrawer>
      </div>
    </article>
  );
}

// ── 20yr Revenue Structure Chart ───────────────────────────────────────────

function RevenueStructureChart({ years, crossoverYear, codYear, CC, ttStyle, isDesktop }: {
  years: YearRow[];
  crossoverYear: number | null;
  codYear: number;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
  isDesktop: boolean;
}) {
  const labels = years.map(y => `Y${y.yr}`);
  const mw = 50;
  const balData = years.map(y => Math.round(y.rev_bal / mw / 1000 * 10) / 10);
  const trdData = years.map(y => Math.round(y.rev_trd / mw / 1000 * 10) / 10);

  const crossoverIdx = crossoverYear ? years.findIndex(y => y.cal_year === crossoverYear) : -1;

  return (
    <div style={{ marginBottom: '20px' }}>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
        color: 'var(--text-tertiary)', letterSpacing: '0.04em', marginBottom: '8px',
      }}>
        20-year revenue structure (per MW)
      </p>
      <div style={{ height: isDesktop ? '200px' : '160px' }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Balancing',
                data: balData,
                fill: 'origin',
                backgroundColor: 'rgba(0,180,160,0.25)',
                borderColor: CC.teal,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.3,
              },
              {
                label: 'Trading',
                data: trdData.map((t, i) => t + balData[i]),
                fill: '-1',
                backgroundColor: 'rgba(212,160,60,0.2)',
                borderColor: CC.amber,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.3,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                ...ttStyle,
                callbacks: {
                  title: (items) => items[0]?.label ?? '',
                  label: (ctx) => {
                    const idx = ctx.dataIndex;
                    return [
                      `Balancing: €${balData[idx]}k/MW`,
                      `Trading: €${trdData[idx]}k/MW`,
                      `Total: €${(balData[idx] + trdData[idx]).toFixed(1)}k/MW`,
                    ][0];
                  },
                  afterBody: (items) => {
                    const idx = items[0]?.dataIndex ?? 0;
                    return [
                      `Balancing: €${balData[idx]}k/MW`,
                      `Trading: €${trdData[idx]}k/MW`,
                      `Total: €${(balData[idx] + trdData[idx]).toFixed(1)}k/MW`,
                    ];
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: CC.border },
                ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 10 }, maxTicksLimit: 10 },
              },
              y: {
                grid: { color: CC.grid, lineWidth: 0.5 },
                border: { display: false },
                ticks: {
                  color: CC.textMuted,
                  font: { family: CHART_FONT.family, size: 10 },
                  callback: (v) => `€${v}k`,
                  maxTicksLimit: 5,
                },
                beginAtZero: true,
              },
            },
          }}
        />
      </div>
      {/* Inline legend + crossover annotation */}
      <div style={{
        display: 'flex', gap: '16px', alignItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', marginTop: '6px',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', background: CC.teal, display: 'inline-block' }} />
          Balancing
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', background: CC.amber, display: 'inline-block' }} />
          Trading
        </span>
        {crossoverYear && crossoverIdx >= 0 && (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Trading exceeds balancing: Y{crossoverIdx + 1} ({crossoverYear})
          </span>
        )}
      </div>
    </div>
  );
}

// ── Revenue Bridge (Horizontal Waterfall) ──────────────────────────────────

function RevenueBridgeChart({ data, CC, ttStyle, isDesktop }: {
  data: RevenueData;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
  isDesktop: boolean;
}) {
  const mw = 50;
  const bal = Math.round(data.capacity_y1 / mw / 1000 * 10) / 10 + Math.round(data.activation_y1 / mw / 1000 * 10) / 10;
  const trd = Math.round(data.arbitrage_y1 / mw / 1000 * 10) / 10;
  const rtm = Math.round(data.rtm_fees_y1 / mw / 1000 * 10) / 10;
  const gross = Math.round((data.gross_revenue_y1) / mw / 1000 * 10) / 10;
  const opex = Math.round(data.opex_y1 / mw / 1000 * 10) / 10;
  const ebitda = Math.round(data.ebitda_y1 / mw / 1000 * 10) / 10;

  const labels = ['Balancing', 'Trading', '−RTM fees', '=Gross', '−OPEX', '=EBITDA'];
  const starts = [0, bal, gross, 0, gross - rtm, 0];
  const ends = [bal, bal + trd, gross - rtm, gross, gross - rtm - opex, ebitda];

  // Floating bar data: [start, end] for each segment
  const barData = labels.map((_, i) => [Math.min(starts[i], ends[i]), Math.max(starts[i], ends[i])]);

  const colors = [
    CC.teal, CC.amber, CC.roseLight, CC.textMuted, CC.roseLight,
    ebitda > 0 ? CC.teal : CC.rose,
  ];

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
          color: 'var(--text-tertiary)', letterSpacing: '0.04em',
        }}>
          Revenue bridge — Year 1 per MW (€k)
        </p>
        <CopyButton
          variant="text"
          label="Copy revenue bridge"
          value={formatTable(
            ['Stream', '€k/MW/yr'],
            labels.map((l, i) => [l, `€${barData[i][1].toFixed(1)}k`]),
          )}
        />
      </div>
      <div style={{ height: isDesktop ? '180px' : '140px' }}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: barData,
              backgroundColor: colors,
              borderColor: colors,
              borderWidth: 1,
              borderSkipped: false,
            }],
          }}
          options={{
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                ...ttStyle,
                callbacks: {
                  label: (ctx) => {
                    const raw = ctx.raw as [number, number];
                    const val = raw[1] - raw[0];
                    return `€${val.toFixed(1)}k/MW/yr`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { color: CC.grid, lineWidth: 0.5 },
                border: { display: false },
                ticks: {
                  color: CC.textMuted,
                  font: { family: CHART_FONT.family, size: 10 },
                  callback: (v) => `€${v}k`,
                },
              },
              y: {
                grid: { display: false },
                border: { color: CC.border },
                ticks: {
                  color: CC.textSecondary,
                  font: { family: CHART_FONT.family, size: 11 },
                },
              },
            },
          }}
        />
      </div>
    </div>
  );
}

// ── 3×3 IRR Sensitivity Matrix ─────────────────────────────────────────────

function SensitivityMatrix({ matrix, selectedCod, selectedCapex, duration }: {
  matrix: MatrixCell[];
  selectedCod: number;
  selectedCapex: CapexKey;
  duration: string;
}) {
  const codYears = [2027, 2028, 2029];
  const capexKeys: CapexKey[] = ['low', 'mid', 'high'];
  const capexLabels = ['Competitive', 'Market', 'EPC'];

  const getCell = (cod: number, capex: string): MatrixCell | undefined =>
    matrix.find(m => m.cod === cod && m.capex === capex);

  // Determine dominant driver
  const codIrrs = codYears.map(yr => {
    const cell = getCell(yr, selectedCapex);
    return cell ? irrPct(cell.project_irr) : null;
  }).filter((v): v is number => v != null);
  const capexIrrs = capexKeys.map(ck => {
    const cell = getCell(selectedCod, ck);
    return cell ? irrPct(cell.project_irr) : null;
  }).filter((v): v is number => v != null);
  const codSpread = codIrrs.length >= 2 ? Math.max(...codIrrs) - Math.min(...codIrrs) : 0;
  const capexSpread = capexIrrs.length >= 2 ? Math.max(...capexIrrs) - Math.min(...capexIrrs) : 0;
  const summary = codSpread > capexSpread + 2
    ? `For ${duration}, COD timing drives more IRR variance than installed cost.`
    : capexSpread > codSpread + 2
    ? `For ${duration}, installed cost drives more IRR variance than COD timing.`
    : `For ${duration}, COD timing and installed cost have comparable impact on Project IRR.`;

  const copyRows = codYears.map(yr =>
    [String(yr), ...capexKeys.map(ck => {
      const cell = getCell(yr, ck);
      return cell ? fmtPct(irrPct(cell.project_irr)) : '—';
    })]
  );

  const hdr: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
    color: 'var(--text-tertiary)', padding: '6px 8px', textAlign: 'center',
    letterSpacing: '0.06em', fontWeight: 500,
  };
  const rowLabel: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
    color: 'var(--text-tertiary)', padding: '8px', display: 'flex',
    alignItems: 'center', fontWeight: 500,
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
          IRR sensitivity — {duration}
        </p>
        <CopyButton
          variant="text"
          label="Copy IRR sensitivity matrix"
          value={formatTable(['COD', ...capexLabels], copyRows)}
        />
      </div>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', marginBottom: '12px',
      }}>
        Base scenario · Project IRR across COD and installed cost
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
        <span style={{ padding: '4px 8px' }} />
        {capexLabels.map(l => <span key={l} style={hdr}>{l.toUpperCase()}</span>)}
        {codYears.map(yr => (
          <React.Fragment key={yr}>
            <span style={rowLabel}>{yr}</span>
            {capexKeys.map(ck => {
              const cell = getCell(yr, ck);
              const irr = cell ? irrPct(cell.project_irr) : null;
              const isSelected = yr === selectedCod && ck === selectedCapex;
              const bg = irr != null && irr > 12 ? 'var(--teal-bg)'
                : irr != null && irr > 8 ? 'var(--amber-bg)'
                : irr != null ? 'var(--rose-bg)' : 'transparent';
              return (
                <div key={ck} style={{
                  textAlign: 'center', padding: '8px', background: bg,
                  border: isSelected ? '2px solid var(--border-highlight)' : '1px solid var(--border-card)',
                }}>
                  <span style={{
                    fontFamily: "'Unbounded', sans-serif", fontSize: '1rem',
                    color: irrColor(irr), fontWeight: 400,
                  }}>
                    {irr != null ? fmtPct(irr) : '—'}
                  </span>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: '6px',
      }}>{summary}</p>
    </div>
  );
}

// ── Monthly DSCR Heatmap ───────────────────────────────────────────────────

function MonthlyDscrHeatmap({ months }: { months: MonthlyDSCR[] }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
        color: 'var(--text-tertiary)', letterSpacing: '0.04em', marginBottom: '8px',
      }}>
        Monthly DSCR — Year 1 seasonal profile
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '2px',
      }}>
        {months.map(m => {
          const bg = m.dscr == null ? 'var(--bg-elevated)'
            : m.dscr >= 1.50 ? 'var(--teal-bg)'
            : m.dscr >= 1.20 ? 'var(--teal-subtle)'
            : m.dscr >= 1.0 ? 'var(--amber-bg)'
            : 'var(--rose-bg)';
          const color = m.dscr == null ? 'var(--text-muted)'
            : m.dscr >= 1.20 ? 'var(--teal)' : m.dscr >= 1.0 ? 'var(--amber)' : 'var(--rose)';
          return (
            <div key={m.month} style={{
              background: bg, padding: '6px 2px', textAlign: 'center',
              border: '1px solid var(--border-card)',
            }}
            title={`${m.month}: DSCR ${m.dscr?.toFixed(2) ?? '—'}×`}
            >
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.5625rem',
                color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '2px',
              }}>{m.month}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                color, fontWeight: 500,
              }}>
                {m.dscr != null ? m.dscr.toFixed(1) : '—'}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', marginTop: '4px',
      }}>
        Bankability floor: 1.20×. Summer months carry seasonal risk.
      </p>
    </div>
  );
}

// ── Drawer Content ─────────────────────────────────────────────────────────

function DrawerContent({ data2h, data4h, selected, duration, capexKey, cod, scenario, CC }: {
  data2h: RevenueData;
  data4h: RevenueData | null;
  selected: RevenueData | null;
  duration: Duration;
  capexKey: CapexKey;
  cod: CodYear;
  scenario: Scenario;
  CC: ReturnType<typeof useChartColors>;
}) {
  if (!selected) return null;

  const subhead: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
    color: 'var(--text-tertiary)', letterSpacing: '0.1em',
    textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500,
  };
  const gridStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'auto 1fr',
    gap: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
    marginBottom: '24px',
  };
  const lbl: React.CSSProperties = { color: 'var(--text-muted)' };
  const val: React.CSSProperties = { color: 'var(--text-secondary)' };
  const note: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
    color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '20px',
  };

  // All scenarios comparison
  const allScen = selected.all_scenarios;
  const scenKeys: Scenario[] = ['base', 'conservative', 'stress'];

  return (
    <>
      {/* SCENARIO COMPARISON */}
      <p style={subhead}>Scenario comparison</p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr',
        gap: '6px 16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
        marginBottom: '24px',
      }}>
        <span style={lbl} />
        {scenKeys.map(s => (
          <span key={s} style={{
            ...val, fontSize: 'var(--font-xs)',
            fontWeight: s === scenario ? 600 : 400,
            color: s === scenario ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}>{SCENARIO_LABELS[s]}</span>
        ))}
        {[
          { label: 'Project IRR', fn: (s: ScenarioSummary) => fmtPct(irrPct(s.project_irr)) },
          { label: 'Equity IRR', fn: (s: ScenarioSummary) => fmtPct(irrPct(s.equity_irr)) },
          { label: 'Min DSCR', fn: (s: ScenarioSummary) => s.min_dscr != null ? `${s.min_dscr.toFixed(2)}×` : '—' },
          { label: 'EBITDA/MW', fn: (s: ScenarioSummary) => s.ebitda_y1 != null ? fmtEuro(Math.round(s.ebitda_y1 / 50)) : '—' },
          { label: 'Net/MW/yr', fn: (s: ScenarioSummary) => s.net_mw_yr != null ? fmtEuro(s.net_mw_yr) : '—' },
          { label: 'Bankability', fn: (s: ScenarioSummary) => s.bankability ?? '—' },
        ].map(row => (
          <React.Fragment key={row.label}>
            <span style={lbl}>{row.label}</span>
            {scenKeys.map(sk => {
              const s = allScen?.[sk];
              return <span key={sk} style={val}>{s ? row.fn(s) : '—'}</span>;
            })}
          </React.Fragment>
        ))}
      </div>

      {/* DEGRADATION CURVE */}
      {selected.years?.length > 0 && (
        <>
          <p style={subhead}>Degradation and retention</p>
          <div style={{ height: '120px', marginBottom: '24px' }}>
            <Line
              data={{
                labels: selected.years.map(y => `Y${y.yr}`),
                datasets: [{
                  label: 'Retention',
                  data: selected.years.map(y => Math.round(y.retention * 100)),
                  borderColor: CC.teal,
                  borderWidth: 1.5,
                  pointRadius: (ctx) => ctx.dataIndex === 9 ? 4 : 0,
                  pointBackgroundColor: CC.amber,
                  fill: false,
                  tension: 0.2,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: {
                  callbacks: { label: (ctx) => `${ctx.parsed.y}% capacity` },
                }},
                scales: {
                  x: { grid: { display: false }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 }, maxTicksLimit: 10 } },
                  y: { min: 60, max: 105, grid: { color: CC.grid, lineWidth: 0.5 }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 }, callback: (v) => `${v}%` } },
                },
              }}
            />
          </div>
          <p style={note}>Augmentation at Year 10 (marked). 2.5%/yr degradation. Retention = usable capacity vs nameplate.</p>
        </>
      )}

      {/* BASE YEAR MONTHLY */}
      {selected.base_year?.months && selected.base_year.months.length > 0 && (
        <>
          <p style={subhead}>Base year monthly breakdown</p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr',
            gap: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            marginBottom: '24px',
          }}>
            <span style={lbl}>Month</span>
            <span style={lbl}>Trading</span>
            <span style={lbl}>Balancing</span>
            <span style={lbl}>Gross</span>
            {selected.base_year.months.map(m => (
              <React.Fragment key={m.month}>
                <span style={{ color: 'var(--text-tertiary)' }}>{m.month}</span>
                <span style={val}>{fmtK(m.trading)}</span>
                <span style={val}>{fmtK(m.balancing)}</span>
                <span style={val}>{fmtK(m.gross)}</span>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {/* REVENUE STREAM CONFIDENCE */}
      <p style={subhead}>Revenue stream confidence</p>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '3px',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '8px',
      }}>
        {[
          { stream: 'Arbitrage', confidence: 'High', color: 'var(--teal)', reason: 'observable day-ahead spreads' },
          { stream: 'aFRR capacity', confidence: 'Medium', color: 'var(--amber)', reason: 'proxy prices, thin clearing depth' },
          { stream: 'mFRR capacity', confidence: 'Medium', color: 'var(--amber)', reason: 'proxy prices, growing but shallow' },
          { stream: 'FCR', confidence: 'Low', color: 'var(--rose)', reason: 'BBCM transition, no Baltic track record' },
        ].map(({ stream, confidence, color, reason }) => (
          <div key={stream} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={lbl}>{stream}</span>
            <span style={{ color, opacity: 0.75 }}>{confidence} · {reason}</span>
          </div>
        ))}
      </div>
      <p style={note}>Conservative and stress scenarios adjust for confidence gaps in each stream.</p>

      {/* FORWARD COMPRESSION */}
      {selected.forward && (
        <>
          <p style={subhead}>Forward compression assumptions</p>
          <div style={gridStyle}>
            <span style={lbl}>Observed rate</span>
            <span style={val}>{(selected.forward.compression_rate_observed * 100).toFixed(1)}%/yr</span>
            <span style={lbl}>Source</span>
            <span style={val}>{selected.forward.compression_source}</span>
            <span style={lbl}>Data points</span>
            <span style={val}>{selected.forward.compression_data_points}</span>
            <span style={lbl}>Scenario multiplier</span>
            <span style={val}>{selected.forward.scenario_multiplier}×</span>
            <span style={lbl}>Effective rate</span>
            <span style={val}>{(selected.forward.effective_compression_rate * 100).toFixed(1)}%/yr</span>
          </div>
        </>
      )}

      {/* LIVE RATE */}
      {selected.live_rate && !selected.live_rate.error && (
        <>
          <p style={subhead}>Live rate check</p>
          <div style={gridStyle}>
            <span style={lbl}>Today&apos;s trading/MW/day</span>
            <span style={val}>{fmtEuro(selected.live_rate.today_trading_daily)}</span>
            <span style={lbl}>Today&apos;s balancing/MW/day</span>
            <span style={val}>{fmtEuro(selected.live_rate.today_balancing_daily)}</span>
            <span style={lbl}>Total daily/MW</span>
            <span style={val}>{fmtEuro(selected.live_rate.today_total_daily)}</span>
            <span style={lbl}>Base year daily avg</span>
            <span style={val}>{fmtEuro(selected.live_rate.base_daily)}</span>
            <span style={lbl}>Delta vs base</span>
            <span style={{ color: selected.live_rate.delta_pct >= 0 ? 'var(--teal)' : 'var(--rose)' }}>
              {selected.live_rate.delta_pct >= 0 ? '+' : ''}{selected.live_rate.delta_pct}%
            </span>
            <span style={lbl}>Annualised</span>
            <span style={val}>{fmtEuro(selected.live_rate.annualised)}/MW/yr</span>
          </div>
        </>
      )}

      {/* DELTAS / WHAT CHANGED */}
      {selected.deltas && (
        <>
          <p style={subhead}>What changed</p>
          <div style={gridStyle}>
            <span style={lbl}>IRR change</span>
            <span style={{ color: selected.deltas.irr_pp >= 0 ? 'var(--teal)' : 'var(--rose)' }}>
              {selected.deltas.irr_pp >= 0 ? '+' : ''}{selected.deltas.irr_pp.toFixed(2)}pp
            </span>
            <span style={lbl}>Net rev change</span>
            <span style={{ color: selected.deltas.net_rev >= 0 ? 'var(--teal)' : 'var(--rose)' }}>
              {selected.deltas.net_rev >= 0 ? '+' : ''}{fmtEuro(selected.deltas.net_rev)}/MW/yr
            </span>
            {Object.entries(selected.deltas.signals).map(([key, s]) => (
              <React.Fragment key={key}>
                <span style={lbl}>{key}</span>
                <span style={val}>{s.previous} → {s.current} ({s.delta >= 0 ? '+' : ''}{s.delta.toFixed(2)})</span>
              </React.Fragment>
            ))}
            <span style={lbl}>Previous snapshot</span>
            <span style={val}>{selected.deltas.prev_date ? new Date(selected.deltas.prev_date).toLocaleDateString('en-GB') : '—'}</span>
          </div>
        </>
      )}

      {/* MODEL CONFIGURATION */}
      <p style={subhead}>Model configuration</p>
      <div style={gridStyle}>
        <span style={lbl}>Duration</span>
        <span style={val}>{duration === '4h' ? '4H (50 MW / 200 MWh)' : '2H (50 MW / 100 MWh)'}</span>
        <span style={lbl}>CAPEX</span>
        <span style={val}>{CAPEX_LABELS[capexKey]} (€{CAPEX_VALUES[capexKey]}/kWh)</span>
        <span style={lbl}>COD</span>
        <span style={val}>{cod}</span>
        <span style={lbl}>Scenario</span>
        <span style={val}>{SCENARIO_LABELS[scenario]}</span>
        <span style={lbl}>Grant</span>
        <span style={val}>None</span>
      </div>

      {/* FINANCING ASSUMPTIONS */}
      <p style={subhead}>Financing assumptions</p>
      <div style={gridStyle}>
        <span style={lbl}>Debt share</span>
        <span style={val}>55%</span>
        <span style={lbl}>Interest rate</span>
        <span style={val}>{selected.rate_allin ? `${(selected.rate_allin * 100).toFixed(2)}% all-in` : '4.5% all-in'}</span>
        <span style={lbl}>Tenor</span>
        <span style={val}>8 years</span>
        <span style={lbl}>Grace period</span>
        <span style={val}>1 year</span>
        <span style={lbl}>DSCR basis</span>
        <span style={val}>Minimum annual CFADS-based</span>
      </div>
      <p style={note}>DSCR appears stable across COD scenarios because debt is sized to maintain coverage — the debt quantum changes, not the ratio.</p>

      {/* ASSET LIFE AND AUGMENTATION */}
      <p style={subhead}>Asset life and augmentation</p>
      <div style={gridStyle}>
        <span style={lbl}>Degradation</span>
        <span style={val}>2.5%/yr</span>
        <span style={lbl}>Augmentation</span>
        <span style={val}>Year 10, €25/kWh</span>
        <span style={lbl}>Depreciation</span>
        <span style={val}>10yr on gross CAPEX</span>
        <span style={lbl}>Tax</span>
        <span style={val}>17% Lithuanian CIT</span>
      </div>

      {/* DATA CONFIDENCE */}
      <p style={subhead}>Data confidence</p>
      <div style={gridStyle}>
        <span style={lbl}>Arbitrage</span>
        <span style={val}>Observed/Derived (ENTSO-E A44)</span>
        <span style={lbl}>Capacity prices</span>
        <span style={val}>Proxy (Baltic-calibrated, not clearing)</span>
        <span style={lbl}>Fleet S/D</span>
        <span style={val}>Derived (manual fleet tracker)</span>
        <span style={lbl}>CAPEX</span>
        <span style={val}>Reference (CH S1 2025 benchmarks)</span>
        <span style={lbl}>Financing</span>
        <span style={val}>Observed (Euribor) + Modeled (margin)</span>
      </div>

      {/* SIGNAL INPUTS */}
      {selected.signal_inputs && (
        <>
          <p style={subhead}>Signal inputs used</p>
          <div style={gridStyle}>
            <span style={lbl}>S1 capture</span>
            <span style={val}>€{selected.signal_inputs.s1_capture?.toFixed(1) ?? '—'}/MWh</span>
            <span style={lbl}>aFRR clearing</span>
            <span style={val}>€{selected.signal_inputs.afrr_clearing?.toFixed(0) ?? '—'}/MWh</span>
            <span style={lbl}>mFRR clearing</span>
            <span style={val}>€{selected.signal_inputs.mfrr_clearing?.toFixed(0) ?? '—'}/MWh</span>
            <span style={lbl}>aFRR cap</span>
            <span style={val}>€{selected.signal_inputs.afrr_cap?.toFixed(1) ?? '—'}/MW/h</span>
            <span style={lbl}>mFRR cap</span>
            <span style={val}>€{selected.signal_inputs.mfrr_cap?.toFixed(1) ?? '—'}/MW/h</span>
            <span style={lbl}>Euribor 3M</span>
            <span style={val}>{selected.signal_inputs.euribor?.toFixed(2) ?? '—'}%</span>
            <span style={lbl}>Rate all-in</span>
            <span style={val}>{selected.signal_inputs.rate_allin_pct?.toFixed(2) ?? '—'}%</span>
          </div>
        </>
      )}

      {/* METHODOLOGY */}
      <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '16px' }}>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)', letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: '4px', opacity: 0.7,
        }}>Methodology</p>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)', lineHeight: 1.5, opacity: 0.6,
        }}>
          20-year DCF. Observed base year (S1 capture monthly data) as Year 1 foundation. Forward compression derived from S2 trajectory. Differential compression: balancing at full rate, trading at 0.5× (RES volatility offsets BESS fleet pressure). Hierarchy dispatch (FCR → aFRR → mFRR → arbitrage). 17% CIT, 10yr depreciation. CFADS-based DSCR. WACC 8%. Scenarios adjust compression multiplier (base 1×, conservative 2×, stress 3.5×). Trading realisation: {selected.assumptions?.trading_realisation ?? 0.85}×. Full model: BESS_Financial_Model_Visaginas_50MW v5.
        </p>
      </div>
    </>
  );
}
