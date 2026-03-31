'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import type { ChartOptions, Plugin } from 'chart.js';
import { useChartColors, useTooltipStyle, CHART_FONT } from '@/app/lib/chartTheme';
import { DetailsDrawer } from '@/app/components/primitives';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
const MW = 50;

/* ── Types ────────────────────────────────────────────────────────── */

interface YearRow {
  yr: number; cal_year: number; retention: number; usable_mwh_per_mw: number;
  compress_total: number; rev_cap: number; rev_act: number; rev_bal: number;
  rev_trd: number; rev_gross: number; rtm_fee: number; brp_fee: number;
  rev_net: number; opex: number; ebitda: number; depr: number;
  cash_tax: number; cash_tax_unlev: number; cfads: number; maint_capex: number;
  ds: number; dscr: number; debt_bal: number; project_cf: number; equity_cf: number;
}

interface MonthlyDSCR { month: string; seasonal_factor: number; cfads: number; debt_service: number; dscr: number; }
interface MatrixEntry { cod: number; capex: string; capex_kwh: number; project_irr: number; equity_irr: number; min_dscr: number; net_mw_yr: number; bankability: string; }
interface BaseYearMonth { month: string; trading: number; balancing: number; gross: number; net: number; capture: number; days: number; source: string; }
interface LiveRate { today_trading_daily: number; today_balancing_daily: number; today_total_daily: number; base_daily: number; delta_pct: number; annualised: number; capture_used: number; as_of: string; }
interface FleetPoint { year: number; sd_ratio: number; phase: string; cpi: number; }

interface RevenueResponse {
  project_irr: number; equity_irr: number; net_mw_yr: number;
  min_dscr: number; payback_years: number; capex_total: number;
  capex_kwh: number; cod_year: number; duration: number; scenario: string;
  system: string; rate_allin: number; opex_y1: number; ebitda_y1: number;
  gross_revenue_y1: number; capacity_y1: number; activation_y1: number;
  arbitrage_y1: number; capacity_pct: number; activation_pct: number;
  arbitrage_pct: number; rtm_fees_y1: number; net_revenue_y1: number;
  model_version: string; timestamp: string; phase: string; sd_ratio: number;
  years: YearRow[]; monthly_y1: MonthlyDSCR[]; matrix: MatrixEntry[];
  base_year: { months: BaseYearMonth[]; data_coverage: { s1_months: number; s2_months: number; total_days: number; pct_observed: number }; annual_totals: { trading: number; balancing: number; gross: number; net: number }; time_model: { effective_arb_pct: number; source: string; note: string }; trading_realisation: number; trading_realisation_source: string; };
  live_rate: LiveRate | null;
  signal_inputs: { s1_capture: number; afrr_clearing: number; mfrr_clearing: number; afrr_cap: number; mfrr_cap: number; euribor: number; rate_allin_pct: number; };
  fleet_trajectory: FleetPoint[];
  forward: { compression_rate_observed: number; effective_compression_rate: number; scenario_multiplier: number; };
  assumptions: { trading_realisation: number; trading_realisation_note: string; compression_scenario_mult: number; effective_compression: number; };
  deltas: { irr_pp: number; net_rev: number; signals: Record<string, { current: number; previous: number; delta: number }>; prev_date: string; };
  prices: { afrr_up_avg: number; mfrr_up_avg: number; spread_eur_mwh: number; euribor_3m: number; };
  min_dscr_conservative?: number;
  debt_initial: number; equity_initial: number; total_debt: number; total_equity: number;
  annual_debt_service: number;
}

/* ── Constants ────────────────────────────────────────────────────── */

type Duration = '2h' | '4h';
type Capex = 'low' | 'mid' | 'high';
type Cod = '2027' | '2028' | '2029';
type Scenario = 'base' | 'conservative' | 'stress';

const CAPEX_LABELS: Record<Capex, string> = { low: '€120', mid: '€164', high: '€262' };
const SCENARIO_LABELS: Record<Scenario, string> = { base: 'Base', conservative: 'Cons.', stress: 'Stress' };

function irrColor(v: number): string {
  if (v >= 0.12) return 'var(--teal)';
  if (v >= 0.06) return 'var(--amber)';
  return 'var(--rose)';
}

function dscrColor(v: number): string {
  return v >= 1.20 ? 'var(--teal)' : 'var(--rose)';
}

function fmtPct(v: number): string {
  if (v <= -0.5) return '<0';
  return (v * 100).toFixed(1);
}

function fmtEurK(v: number): string {
  return '€' + Math.round(v / 1000) + 'k';
}

function fmtDate(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
      dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

/* ── URL params ────────────────────────────────────────────────────── */

function readParams(): { dur: Duration; capex: Capex; cod: Cod; scenario: Scenario } {
  if (typeof window === 'undefined') return { dur: '4h', capex: 'mid', cod: '2028', scenario: 'base' };
  const p = new URLSearchParams(window.location.search);
  return {
    dur: (['2h', '4h'].includes(p.get('dur') || '') ? p.get('dur') as Duration : '4h'),
    capex: (['low', 'mid', 'high'].includes(p.get('capex') || '') ? p.get('capex') as Capex : 'mid'),
    cod: (['2027', '2028', '2029'].includes(p.get('cod') || '') ? p.get('cod') as Cod : '2028'),
    scenario: (['base', 'conservative', 'stress'].includes(p.get('scenario') || '') ? p.get('scenario') as Scenario : 'base'),
  };
}

function writeParams(p: { dur: Duration; capex: Capex; cod: Cod; scenario: Scenario }) {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('dur', p.dur);
  u.searchParams.set('capex', p.capex);
  u.searchParams.set('cod', p.cod);
  u.searchParams.set('scenario', p.scenario);
  window.history.replaceState(null, '', u.toString());
}

/* ── Component ────────────────────────────────────────────────────── */

export function RevenueCard() {
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

  const [dur, setDur] = useState<Duration>('4h');
  const [capex, setCapex] = useState<Capex>('mid');
  const [cod, setCod] = useState<Cod>('2028');
  const [scenario, setScenario] = useState<Scenario>('base');
  const [allScenarios, setAllScenarios] = useState<Record<string, RevenueResponse>>({});
  const [loading, setLoading] = useState(true);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = useCallback(() => setDrawerKey(k => k + 1), []);

  useEffect(() => {
    const p = readParams();
    setDur(p.dur); setCapex(p.capex); setCod(p.cod); setScenario(p.scenario);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const base = `${WORKER}/revenue?dur=${dur}&capex=${capex}&cod=${cod}`;
    Promise.all([
      fetch(`${base}&scenario=base`).then(r => r.json()),
      fetch(`${base}&scenario=conservative`).then(r => r.json()),
      fetch(`${base}&scenario=stress`).then(r => r.json()),
    ]).then(([b, c, s]) => {
      if (cancelled) return;
      setAllScenarios({ base: b, conservative: c, stress: s });
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dur, capex, cod]);

  useEffect(() => { writeParams({ dur, capex, cod, scenario }); }, [dur, capex, cod, scenario]);

  const d = allScenarios[scenario] as RevenueResponse | undefined;
  const dBase = allScenarios.base as RevenueResponse | undefined;
  const dCons = allScenarios.conservative as RevenueResponse | undefined;
  const dStress = allScenarios.stress as RevenueResponse | undefined;

  if (loading || !d) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)' }}>
        Loading revenue model…
      </div>
    );
  }

  const si = d.signal_inputs;
  const by = d.base_year;
  const lr = d.live_rate;
  const y1 = d.years[0];

  const otherScenarios = (['base', 'conservative', 'stress'] as Scenario[]).filter(s => s !== scenario);
  const s1 = allScenarios[otherScenarios[0]] as RevenueResponse | undefined;
  const s2 = allScenarios[otherScenarios[1]] as RevenueResponse | undefined;

  /* ── S/D trajectory ────────────────────────────────────────────── */
  const sdTrajectory = useMemo(() => {
    const ft = d.fleet_trajectory || [];
    return Array.from({ length: 20 }, (_, i) => {
      const calYear = d.cod_year + 1 + i;
      const ftEntry = ft.find(f => f.year === calYear);
      if (ftEntry) return Math.min(ftEntry.sd_ratio, 3.0);
      const lastFt = ft[ft.length - 1];
      if (lastFt && calYear > lastFt.year) {
        const yearsAfter = calYear - lastFt.year;
        return Math.min(lastFt.sd_ratio * Math.pow(1.12, yearsAfter), 3.0);
      }
      return Math.min(1.16 * Math.pow(1.12, i), 3.0);
    });
  }, [d.fleet_trajectory, d.cod_year]);

  /* ── Revenue chart ─────────────────────────────────────────────── */
  const xLabels = d.years.map(y => `Y${y.yr}`);
  const totalPerMW = d.years.map(y => (y.rev_bal + y.rev_trd) / MW);
  const balPerMW = d.years.map(y => y.rev_bal / MW);
  const opexPerMW = d.years.map(y => y.opex / MW);

  const revenueChartData = {
    labels: xLabels,
    datasets: [
      { label: 'Total (balancing + trading)', data: totalPerMW, borderColor: CC.amber, backgroundColor: CC.amberLight, fill: '+1' as const, borderWidth: 1.5, pointRadius: 0, tension: 0.35, yAxisID: 'y', order: 2 },
      { label: 'Balancing', data: balPerMW, borderColor: CC.teal, backgroundColor: CC.tealLight, fill: 'origin' as const, borderWidth: 1.5, pointRadius: 0, tension: 0.35, yAxisID: 'y', order: 3 },
      { label: 'OPEX', data: opexPerMW, borderColor: CC.textMuted, backgroundColor: 'transparent', fill: false, borderWidth: 1, borderDash: [6, 3], pointRadius: 0, tension: 0.35, yAxisID: 'y', order: 4 },
      { label: 'Fleet S/D ratio', data: sdTrajectory, borderColor: CC.textMuted + '60', backgroundColor: 'transparent', fill: false, borderWidth: 1, borderDash: [2, 4], pointRadius: 0, tension: 0.35, yAxisID: 'y2', order: 1 },
    ],
  };

  const fleetMilestonePlugin: Plugin<'line'> = useMemo(() => ({
    id: 'fleetMilestones',
    afterDraw(chart) {
      const ctx = chart.ctx;
      const y2Scale = chart.scales.y2;
      const xScale = chart.scales.x;
      if (!y2Scale || !xScale) return;
      ctx.save();
      ctx.font = `9px ${CHART_FONT.family}`;
      ctx.fillStyle = CC.textMuted;
      ctx.textAlign = 'center';
      const x3 = xScale.getPixelForValue(2);
      if (x3) ctx.fillText('Ignitis 291MW', x3, y2Scale.getPixelForValue(1.5) - 8);
      const idx2x = sdTrajectory.findIndex(v => v >= 2.0);
      if (idx2x >= 0) {
        const xPx = xScale.getPixelForValue(idx2x);
        if (xPx) ctx.fillText('fleet 2×', xPx, y2Scale.getPixelForValue(2.0) - 8);
      }
      ctx.restore();
    },
  }), [CC.textMuted, sdTrajectory]);

  const revenueChartOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { ...ttStyle, callbacks: {
        label(ctx) {
          const idx = ctx.datasetIndex;
          const v = ctx.parsed.y ?? 0;
          if (idx === 0) {
            const bal = balPerMW[ctx.dataIndex];
            const trd = v - bal;
            const trdPct = v > 0 ? Math.round((trd / v) * 100) : 0;
            return `Trading ${fmtEurK(trd)} (${trdPct}%)`;
          }
          if (idx === 1) return `Balancing ${fmtEurK(v)}`;
          if (idx === 2) return `OPEX ${fmtEurK(v)}`;
          if (idx === 3) return `Fleet S/D ${v.toFixed(2)}×`;
          return '';
        },
      }},
    },
    scales: {
      x: { grid: { display: false }, border: { color: CC.border }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 10 }, maxTicksLimit: 6 } },
      y: { position: 'left', min: 0, max: 200000, grid: { color: CC.grid, lineWidth: 0.5 }, border: { display: false }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 10 }, maxTicksLimit: 5, callback: (v) => '€' + Math.round(Number(v) / 1000) + 'k' } },
      y2: { position: 'right', min: 0.5, max: 3, grid: { display: false }, border: { display: false }, ticks: { color: CC.textMuted + '80', font: { family: CHART_FONT.family, size: 9 }, maxTicksLimit: 4, callback: (v) => Number(v).toFixed(1) + '×' } },
    },
  };

  /* ── DSCR bar chart ────────────────────────────────────────────── */
  const dscrMonths = d.monthly_y1 || [];

  const dscrThresholdPlugin: Plugin<'bar'> = useMemo(() => ({
    id: 'dscrThreshold',
    afterDraw(chart) {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const ctx = chart.ctx;
      const yPx = yScale.getPixelForValue(1.20);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = CC.textMuted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chart.chartArea.left, yPx);
      ctx.lineTo(chart.chartArea.right, yPx);
      ctx.stroke();
      ctx.font = `9px ${CHART_FONT.family}`;
      ctx.fillStyle = CC.textMuted;
      ctx.textAlign = 'right';
      ctx.fillText('1.20×', chart.chartArea.right, yPx - 4);
      ctx.restore();
    },
  }), [CC.textMuted]);

  const dscrChartData = {
    labels: dscrMonths.map(m => m.month.slice(0, 1)),
    datasets: [{
      data: dscrMonths.map(m => m.dscr),
      backgroundColor: dscrMonths.map(m => m.dscr >= 1.20 ? CC.teal + '90' : m.dscr >= 1.0 ? CC.amber + '90' : CC.rose + '90'),
      borderRadius: 2, barPercentage: 0.7,
    }],
  };

  const dscrChartOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...ttStyle, callbacks: { label: ctx => `DSCR ${(ctx.parsed.y ?? 0).toFixed(2)}×` } } },
    scales: {
      x: { grid: { display: false }, border: { color: CC.border }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 } } },
      y: { min: 0, max: Math.max(2.5, ...dscrMonths.map(m => m.dscr + 0.3)), grid: { color: CC.grid, lineWidth: 0.5 }, border: { display: false }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 }, maxTicksLimit: 4, callback: v => Number(v).toFixed(1) + '×' } },
    },
  };

  /* ── Sensitivity matrix ────────────────────────────────────────── */
  const matrix = d.matrix || [];
  const capexOrder: Capex[] = ['low', 'mid', 'high'];
  const codOrder: Cod[] = ['2027', '2028', '2029'];
  const matrixLookup = (cx: string, co: number) => matrix.find(m => m.capex === cx && m.cod === co);

  /* ── Heatmap ───────────────────────────────────────────────────── */
  const heatMonths = by?.months || [];
  const maxBal = Math.max(...heatMonths.map(m => m.balancing), 1);
  const maxTrd = Math.max(...heatMonths.map(m => m.trading), 1);

  function heatBg(v: number, max: number, color: 'teal' | 'amber'): string {
    const intensity = Math.min(v / max, 1);
    if (color === 'teal') return `rgba(0,180,160,${0.08 + intensity * 0.35})`;
    return `rgba(212,160,60,${0.08 + intensity * 0.35})`;
  }

  /* ── Styles ────────────────────────────────────────────────────── */
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  const cardStyle: React.CSSProperties = { ...mono, background: 'var(--bg-elevated)', border: '1px solid var(--border-highlight)', borderRadius: '6px', padding: '24px' };
  const controlBtn = (active: boolean): React.CSSProperties => ({
    ...mono, fontSize: '0.5625rem', padding: '3px 8px',
    border: `1px solid ${active ? 'var(--border-highlight)' : 'var(--border-card)'}`,
    borderRadius: '3px', background: active ? 'var(--bg-elevated)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', letterSpacing: '0.02em',
  });
  const metricCell: React.CSSProperties = { padding: '12px 8px', borderRight: '1px solid var(--border-card)' };

  return (
    <div style={cardStyle}>
      {/* ── 1. Headline ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', cursor: 'pointer' }} onClick={openDrawer}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ ...mono, fontSize: '2.25rem', fontWeight: 500, color: irrColor(d.project_irr), lineHeight: 1 }}>
            {fmtPct(d.project_irr)}
          </span>
          <span style={{ ...mono, fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>% IRR</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ ...mono, fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>
            {fmtEurK(d.net_mw_yr)}
          </span>
          <span style={{ ...mono, fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>/MW/yr</span>
        </div>
      </div>

      {/* ── 2. Params line ───────────────────────────────────────── */}
      <div style={{ ...mono, fontSize: '0.5625rem', color: 'var(--text-tertiary)', marginTop: '8px', lineHeight: 1.6 }}>
        <div>{MW} MW · {dur === '2h' ? '2H' : '4H'} LFP · {CAPEX_LABELS[capex]}/kWh · COD {cod} · {SCENARIO_LABELS[scenario]} · 20-yr unlevered DCF</div>
        {by?.data_coverage && (
          <div>Year 1 built from {by.data_coverage.s1_months} months observed DA prices + {by.data_coverage.s2_months} months BTD activation data</div>
        )}
      </div>

      {/* ── 3. Live rate ─────────────────────────────────────────── */}
      {lr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', ...mono, fontSize: 'var(--font-sm)', flexWrap: 'wrap' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--teal)', display: 'inline-block', boxShadow: '0 0 4px var(--teal)' }} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>€{Math.round(lr.annualised / 1000)}k/MW/yr</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{lr.delta_pct >= 0 ? '+' : ''}{lr.delta_pct}% vs model</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: 'var(--font-xs)' }}>{fmtDate(lr.as_of)}</span>
        </div>
      )}

      {/* ── 4. Extreme event callout ─────────────────────────────── */}
      <div style={{
        marginTop: '12px', borderLeft: '2px solid var(--amber)', background: 'var(--bg-elevated)',
        borderRadius: '5px', padding: '8px 12px', ...mono, fontSize: 'var(--font-xs)',
        color: 'var(--text-secondary)', lineHeight: 1.5,
      }}>
        <span style={{ color: 'var(--text-tertiary)' }}>30 Mar 14:00</span>
        {' · mFRR down activation cleared at '}
        <span style={{ color: 'var(--amber)', fontWeight: 500 }}>−€10,000/MWh</span>
        {' · 14 MW from Lithuania'}
      </div>

      {/* ── 5. Controls ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
        <ControlGroup label="Duration" options={[['2h','2H'],['4h','4H']]} value={dur} onChange={v => setDur(v as Duration)} controlBtn={controlBtn} />
        <ControlGroup label="Installed cost" options={[['low','€120'],['mid','€164'],['high','€262']]} value={capex} onChange={v => setCapex(v as Capex)} controlBtn={controlBtn} />
        <ControlGroup label="COD" options={[['2027','2027'],['2028','2028'],['2029','2029']]} value={cod} onChange={v => setCod(v as Cod)} controlBtn={controlBtn} />
        <ControlGroup label="Scenario" options={[['base','Base'],['conservative','Cons.'],['stress','Stress']]} value={scenario} onChange={v => setScenario(v as Scenario)} controlBtn={controlBtn} />
      </div>

      {/* ── 6. Metric cells ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', marginTop: '20px', border: '1px solid var(--border-card)', borderRadius: '4px' }}>
        <div style={metricCell}>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Unlevered IRR</div>
          <div style={{ ...mono, fontSize: '1.125rem', fontWeight: 500, color: irrColor(d.project_irr), marginTop: '4px' }}>{fmtPct(d.project_irr)}%</div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {s1 && `${otherScenarios[0].slice(0,4)}. ${fmtPct(s1.project_irr)}%`}
            {s1 && s2 && ' · '}
            {s2 && `${otherScenarios[1].slice(0,4)}. ${fmtPct(s2.project_irr)}%`}
          </div>
        </div>
        <div style={metricCell}>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CFADS/MW/yr</div>
          <div style={{ ...mono, fontSize: '1.125rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: '4px' }}>{fmtEurK(y1.cfads / MW)}</div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>net {fmtEurK(y1.rev_net / MW)} less opex, tax</div>
        </div>
        <div style={metricCell}>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Min DSCR</div>
          <div style={{ ...mono, fontSize: '1.125rem', fontWeight: 500, color: dscrColor(d.min_dscr), marginTop: '4px' }}>{d.min_dscr.toFixed(2)}×</div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {s1 && `${otherScenarios[0].slice(0,4)}. ${s1.min_dscr.toFixed(2)}×`} · debt {(d.rate_allin * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ ...metricCell, borderRight: 'none' }}>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Payback</div>
          <div style={{ ...mono, fontSize: '1.125rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: '4px' }}>{d.payback_years} yr</div>
          <div style={{ ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '2px' }}>{fmtEurK(d.capex_total / MW)}/MW capex</div>
        </div>
      </div>

      {/* ── 7. Main content: chart + right panel ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '5fr 3fr', gap: '24px', marginTop: '24px' }}>
        <div>
          <div style={{ height: '280px' }}>
            <Line data={revenueChartData} options={revenueChartOptions} plugins={[fleetMilestonePlugin]} />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
            <LegendItem color={CC.teal} label="Balancing" />
            <LegendItem color={CC.amber} label="Trading" />
            <LegendItem color={CC.textMuted} label="OPEX" dashed />
            <LegendItem color={CC.textMuted + '60'} label="Fleet S/D" dotted />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Sensitivity table */}
          <div>
            <table style={{ ...mono, fontSize: 'var(--font-xs)', width: '100%', borderCollapse: 'collapse', color: 'var(--text-secondary)' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 400 }}>IRR %</th>
                  {codOrder.map(c => <th key={c} style={{ textAlign: 'center', padding: '4px 6px', color: 'var(--text-muted)', fontWeight: 400 }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {capexOrder.map(cx => (
                  <tr key={cx}>
                    <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{CAPEX_LABELS[cx]}</td>
                    {codOrder.map(co => {
                      const entry = matrixLookup(cx, Number(co));
                      const isCurrent = cx === capex && co === cod;
                      const irr = entry?.project_irr ?? 0;
                      return (
                        <td key={co} style={{
                          textAlign: 'center', padding: '4px 6px',
                          background: isCurrent ? 'var(--bg-elevated)' : 'transparent',
                          color: isCurrent ? 'var(--teal)' : (irr < 0.12 ? 'var(--amber)' : 'var(--text-secondary)'),
                          fontWeight: irr >= 0.12 ? 600 : 400, borderRadius: isCurrent ? '3px' : 0,
                        }}>
                          {fmtPct(irr)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
              Each year of COD delay adds ~1.5pp compression to fleet S/D
            </div>
          </div>

          {/* Monthly DSCR */}
          <div>
            <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Monthly DSCR Y1</div>
            <div style={{ height: '140px' }}>
              <Bar data={dscrChartData} options={dscrChartOptions} plugins={[dscrThresholdPlugin]} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 8. Monthly observed heatmap ──────────────────────────── */}
      {heatMonths.length > 2 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Monthly observed · per MW
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `50px repeat(${heatMonths.length}, 1fr)`, gap: '1px' }}>
            <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', padding: '6px 4px', display: 'flex', alignItems: 'center' }}>Bal</div>
            {heatMonths.map(m => (
              <div key={'b' + m.month} style={{
                ...mono, fontSize: 'var(--font-xs)', textAlign: 'center', padding: '6px 2px',
                background: heatBg(m.balancing, maxBal, 'teal'), color: 'var(--text-secondary)', borderRadius: '2px',
              }}>
                {Math.round(m.balancing / 1000)}
              </div>
            ))}
            <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', padding: '6px 4px', display: 'flex', alignItems: 'center' }}>Trd</div>
            {heatMonths.map(m => (
              <div key={'t' + m.month} style={{
                ...mono, fontSize: 'var(--font-xs)', textAlign: 'center', padding: '6px 2px',
                background: m.trading > 0 ? heatBg(m.trading, maxTrd, 'amber') : 'transparent',
                color: m.trading > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', borderRadius: '2px',
              }}>
                {m.trading > 0 ? Math.round(m.trading / 1000) : '—'}
              </div>
            ))}
            <div />
            {heatMonths.map(m => {
              const num = m.month.length >= 7 ? parseInt(m.month.slice(5, 7)) : 0;
              const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              return (
                <div key={'l' + m.month} style={{ ...mono, fontSize: 'var(--font-xs)', textAlign: 'center', color: 'var(--text-muted)', padding: '2px 0' }}>
                  {names[num] || m.month.slice(0, 3)}
                </div>
              );
            })}
          </div>
          <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
            Values in €k/MW. Heatmap intensity scaled to observed range.
          </div>
        </div>
      )}

      {/* ── 9. Disclosure ────────────────────────────────────────── */}
      <div style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: 'italic',
        fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '20px', lineHeight: 1.6,
      }}>
        Year 1 from observed market data, not modeled assumptions. Forward compression derived from S2 fleet trajectory. Not investment advice.
      </div>

      {/* ── 10. Source footer ────────────────────────────────────── */}
      <div onClick={openDrawer} style={{
        ...mono, fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: '12px',
        paddingTop: '8px', borderTop: '1px solid var(--border-card)', cursor: 'pointer',
      }}>
        {d.model_version} · S1 €{si.s1_capture.toFixed(0)}/MWh · S2 aFRR €{si.afrr_clearing.toFixed(0)} · Euribor {si.euribor}% · {fmtDate(d.timestamp)}
      </div>

      {/* ── 11. Drawer ───────────────────────────────────────────── */}
      <div style={{ marginTop: '8px' }}>
        <DetailsDrawer key={drawerKey} defaultOpen={drawerKey > 0} label="Revenue detail, degradation, monthly DSCR, data sources">
          <DrawerContent d={d} dBase={dBase} dCons={dCons} dStress={dStress} CC={CC} />
        </DetailsDrawer>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function ControlGroup({ label, options, value, onChange, controlBtn }: {
  label: string; options: [string, string][]; value: string;
  onChange: (v: string) => void; controlBtn: (active: boolean) => React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      {options.map(([val, lbl]) => (
        <button key={val} style={controlBtn(value === val)} onClick={() => onChange(val)}>{lbl}</button>
      ))}
    </div>
  );
}

function LegendItem({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {dashed || dotted ? (
        <svg width="16" height="2" style={{ display: 'block' }}>
          <line x1="0" y1="1" x2="16" y2="1" stroke={color} strokeWidth="1.5" strokeDasharray={dotted ? '2,3' : '4,2'} />
        </svg>
      ) : (
        <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, display: 'inline-block' }} />
      )}
      <span>{label}</span>
    </div>
  );
}

function DrawerContent({ d, dBase, dCons, dStress, CC }: {
  d: RevenueResponse; dBase?: RevenueResponse; dCons?: RevenueResponse; dStress?: RevenueResponse;
  CC: ReturnType<typeof useChartColors>;
}) {
  const y1 = d.years[0];
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  const subhead: React.CSSProperties = { ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' };
  const valStyle: React.CSSProperties = { ...mono, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' };
  const noteStyle: React.CSSProperties = { ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)' };

  const tblRow = (label: string, val: string) => (
    <tr key={label}>
      <td style={{ ...noteStyle, padding: '3px 8px 3px 0' }}>{label}</td>
      <td style={{ ...valStyle, padding: '3px 0', textAlign: 'right' }}>{val}</td>
    </tr>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Revenue split */}
      <div>
        <div style={subhead}>Revenue split — Year 1</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {tblRow('aFRR capacity', fmtEurK(0.34 * y1.rev_cap / MW))}
            {tblRow('mFRR capacity', fmtEurK(0.50 * y1.rev_cap / MW))}
            {tblRow('FCR capacity', fmtEurK(0.16 * y1.rev_cap / MW))}
            {tblRow('aFRR dispatch', fmtEurK(0.34 / 0.84 * y1.rev_act / MW))}
            {tblRow('mFRR dispatch', fmtEurK(0.50 / 0.84 * y1.rev_act / MW))}
            <tr><td colSpan={2} style={{ borderTop: '1px solid var(--border-card)', height: '4px' }} /></tr>
            {tblRow('= Balancing', fmtEurK(y1.rev_bal / MW))}
            {tblRow('Trading', fmtEurK(y1.rev_trd / MW))}
            {tblRow('Gross revenue', fmtEurK(y1.rev_gross / MW))}
            {tblRow('− Fees (RTM+BRP)', fmtEurK((y1.rtm_fee + y1.brp_fee) / MW))}
            {tblRow('Net revenue', fmtEurK(y1.rev_net / MW))}
            {tblRow('− OPEX', fmtEurK(y1.opex / MW))}
            <tr><td colSpan={2} style={{ borderTop: '1px solid var(--border-card)', height: '4px' }} /></tr>
            {tblRow('= EBITDA', fmtEurK(y1.ebitda / MW))}
          </tbody>
        </table>
      </div>

      {/* 2. Scenario comparison */}
      {dBase && dCons && dStress && (
        <div>
          <div style={subhead}>Scenario comparison</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', ...mono, fontSize: 'var(--font-sm)' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '3px 8px 3px 0', fontWeight: 400 }}></th>
                <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 400 }}>Base</th>
                <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 400 }}>Cons.</th>
                <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 400 }}>Stress</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['IRR', fmtPct(dBase.project_irr) + '%', fmtPct(dCons.project_irr) + '%', fmtPct(dStress.project_irr) + '%'],
                ['DSCR', dBase.min_dscr.toFixed(2) + '×', dCons.min_dscr.toFixed(2) + '×', dStress.min_dscr.toFixed(2) + '×'],
                ['Net €/MW', fmtEurK(dBase.net_mw_yr), fmtEurK(dCons.net_mw_yr), fmtEurK(dStress.net_mw_yr)],
                ['Compression', (dBase.forward.effective_compression_rate * 100).toFixed(1) + '%', (dCons.forward.effective_compression_rate * 100).toFixed(1) + '%', (dStress.forward.effective_compression_rate * 100).toFixed(1) + '%'],
                ['Trading real.', (dBase.assumptions.trading_realisation * 100).toFixed(0) + '%', (dCons.assumptions.trading_realisation * 100).toFixed(0) + '%', (dStress.assumptions.trading_realisation * 100).toFixed(0) + '%'],
              ].map(([label, ...vals]) => (
                <tr key={label as string}>
                  <td style={{ ...noteStyle, padding: '3px 8px 3px 0' }}>{label}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ ...valStyle, textAlign: 'right', padding: '3px 4px' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Financing */}
      <div>
        <div style={subhead}>Financing</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {tblRow('Debt share', Math.round(d.debt_initial / d.capex_total * 100) + '%')}
            {tblRow('All-in rate', (d.rate_allin * 100).toFixed(1) + '%')}
            {tblRow('Tenor', '8 yr')}
            {tblRow('Grace period', '1 yr')}
            {tblRow('Annual debt service', fmtEurK(d.annual_debt_service))}
          </tbody>
        </table>
      </div>

      {/* 4. Degradation */}
      <div>
        <div style={subhead}>Cell degradation + product eligibility</div>
        <div style={{ height: '120px' }}>
          <DegradationChart years={d.years} CC={CC} />
        </div>
        <div style={{ ...noteStyle, marginTop: '6px' }}>
          OEM LFP {d.duration * MW}MWh · 1 cycle/day · augmentation Y10
        </div>
      </div>

      {/* 5. Data sources */}
      <div>
        <div style={subhead}>Data sources</div>
        <div style={{ ...noteStyle, lineHeight: 1.8 }}>
          <div>S1 Day-ahead prices · ENTSO-E A44 · updated every 4h</div>
          <div>S2 Balancing market · BTD ordered capacity · updated every 4h</div>
          <div>Euribor · ECB Statistical Data Warehouse · {d.signal_inputs.euribor}%</div>
        </div>
      </div>
    </div>
  );
}

function DegradationChart({ years, CC }: { years: YearRow[]; CC: ReturnType<typeof useChartColors> }) {
  const ttStyle = useTooltipStyle(CC);

  const thresholdPlugin: Plugin<'line'> = useMemo(() => ({
    id: 'degradationThresholds',
    afterDraw(chart) {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = CC.textMuted + '60';
      ctx.lineWidth = 0.5;
      for (const th of [1.0, 0.5]) {
        if (th > yScale.max || th < yScale.min) continue;
        const yPx = yScale.getPixelForValue(th);
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, yPx);
        ctx.lineTo(chart.chartArea.right, yPx);
        ctx.stroke();
      }
      ctx.restore();
    },
  }), [CC.textMuted]);

  const data = {
    labels: years.map(y => `Y${y.yr}`),
    datasets: [{
      data: years.map(y => y.usable_mwh_per_mw),
      borderColor: CC.teal, backgroundColor: 'transparent', fill: false,
      borderWidth: 1.5, pointRadius: 0, tension: 0.3,
    }],
  };

  const options: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { ...ttStyle, callbacks: { label: ctx => `${(ctx.parsed.y ?? 0).toFixed(2)} MWh/MW` } } },
    scales: {
      x: { grid: { display: false }, border: { color: CC.border }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 }, maxTicksLimit: 5 } },
      y: { min: 0, grid: { color: CC.grid, lineWidth: 0.5 }, border: { display: false }, ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 }, maxTicksLimit: 4 } },
    },
  };

  return <Line data={data} options={options} plugins={[thresholdPlugin]} />;
}

export default RevenueCard;
