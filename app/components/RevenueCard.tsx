'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { useChartColors, CHART_FONT, useTooltipStyle } from '@/app/lib/chartTheme';
import { DetailsDrawer } from '@/app/components/primitives';
import { RevenueSensitivityTornado } from '@/app/components/RevenueSensitivityTornado';
import { RevenueBacktest } from '@/app/components/RevenueBacktest';
import type { BacktestRow } from '@/app/lib/backtest';
import { findMatrixCell, type MatrixCell as SensMatrixCell } from '@/app/lib/sensitivityMatrix';
import { DISPATCH_LABELS, vsCanonicalDispatchFootnote } from '@/app/lib/dispatchDefinitions';
import { IRR_LABELS } from '@/app/lib/irrLabels';
import { IRR_TILES, DSCR_LABELS, DEFAULT_DSCR_COVENANT } from '@/app/lib/financialDefinitions';
import { formatNumber } from '@/app/lib/format';
import {
  projectDegradationCurve,
  degradationAxisRange,
  AUGMENTATION_THRESHOLD,
  END_OF_LIFE_THRESHOLD,
} from '@/app/lib/degradation';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Legend, Filler
);

// ═══ Types ══════════════════════════════════════════════════════════════════

interface YearData {
  yr: number; cal_year: number; rev_bal: number; rev_trd: number;
  rev_cap: number; rev_act: number; rev_gross: number; rev_net: number;
  rtm_fee: number; brp_fee: number; opex: number; ebitda: number;
  cfads: number; dscr: number | null; sd_ratio: number; trading_fraction: number;
  switching_friction: number; R: number; T: number; usable_mwh_per_mw: number;
  retention: number; ds: number; cash_tax: number; maint_capex: number;
  equity_cf: number; project_cf: number; debt_bal: number;
}

interface MonthlyDSCR {
  month: string; seasonal_factor: number;
  cfads: number; debt_service: number; dscr: number;
}

interface BaseMonth {
  month: string; trading: number; balancing: number;
  gross: number; net: number; capture: number; days: number; source: string;
}

interface MatrixCell {
  cod: number; capex: string; capex_kwh: number;
  project_irr: number | null; min_dscr: number;
}

interface ScenarioSummary {
  project_irr: number | null; min_dscr: number;
  net_mw_yr?: number; bankability?: string;
}

interface RevenueData {
  system: string; duration: number;
  capex_eur_kwh: number; capex_total: number; cod_year: number;
  scenario: string; model_version: string;
  project_irr: number | null; equity_irr: number | null;
  irr_status: string; net_rev_per_mw_yr: number;
  min_dscr: number | null; min_dscr_conservative: number | null;
  payback_years: number | null; rate_allin: number;
  debt_initial: number; equity_initial: number;
  ebitda_y1: number; opex_y1: number;
  revenue_crossover_year: number | null;
  worst_month_dscr: number;
  timestamp: string;
  years: YearData[];
  monthly_y1: MonthlyDSCR[];
  base_year: {
    period: string;
    months: BaseMonth[];
    annual_totals: { trading: number; balancing: number; gross: number; net: number };
    data_coverage: { s1_months: number; s2_months: number; pct_observed: number };
    time_model?: { trading_fraction: number };
  };
  live_rate?: {
    today_total_daily: number; today_trading_daily: number;
    today_balancing_daily: number; delta_pct: number; as_of: string;
  };
  signal_inputs: {
    s1_capture: number; afrr_clearing: number; mfrr_clearing: number;
    afrr_cap: number; mfrr_cap: number; euribor: number; rate_allin_pct: number;
  };
  matrix: MatrixCell[];
  all_scenarios: Record<string, ScenarioSummary>;
  backtest?: BacktestRow[];
  fleet_context: { source?: string };
  reconciliation: Record<string, boolean>;
}

// ═══ Constants ══════════════════════════════════════════════════════════════

const MW = 50;
const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function irrColor(irr: number | null): string {
  if (irr === null) return 'var(--rose)';
  const pct = irr * 100;
  if (pct >= 12) return 'var(--teal)';
  if (pct >= 6) return 'var(--amber)';
  return 'var(--rose)';
}

function dscrColor(d: number | null): string {
  if (d === null) return 'var(--text-muted)';
  if (d >= 1.20) return 'var(--teal)';
  if (d >= 1.0) return 'var(--amber)';
  return 'var(--rose)';
}

function fmtIrr(v: number | null): string {
  if (v === null) return 'N/A';
  return (v * 100).toFixed(1) + '%';
}

function fmtK(v: number): string { return Math.round(v / 1000) + 'k'; }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const mon = MONTH_NAMES[d.getMonth()]?.slice(0, 3) ?? '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${h}:${m}`;
}

// ═══ Controls ═══════════════════════════════════════════════════════════════

function ControlGroup({ label, options, value, onChange }: {
  label: string; options: { key: string; label: string }[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {options.map(o => (
          <button key={o.key} onClick={() => onChange(o.key)}
            style={{
              padding: '3px 10px', fontSize: 'var(--font-sm)',
              fontFamily: "var(--font-mono)", cursor: 'pointer',
              border: '1px solid',
              borderColor: value === o.key ? 'var(--teal)' : 'var(--border-card)',
              borderRadius: 3,
              background: value === o.key ? 'var(--teal-bg)' : 'transparent',
              color: value === o.key ? 'var(--teal)' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ═══ Metric Cell ════════════════════════════════════════════════════════════

function MetricCell({ label, value, sub, color, title, methodVersion }: {
  label: string; value: string; sub?: string; color?: string;
  /** Browser-native tooltip (title=…). */
  title?: string;
  /** Methodology version stamp ("v7"); rendered as superscript on the label (N-6). */
  methodVersion?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 110 }} title={title}>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 4 }}>
        {label}
        {methodVersion && (
          <sup style={{ marginLeft: 4, color: 'var(--lavender)',
            fontSize: '0.55rem', letterSpacing: '0.04em', top: '-0.35em',
            position: 'relative' }}>{methodVersion}</sup>
        )}
      </div>
      <div style={{ color: color || 'var(--text-primary)',
        fontSize: '1.25rem', fontFamily: "'Unbounded',sans-serif",
        fontWeight: 500, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ═══ Degradation Curve (7.7.6) ══════════════════════════════════════════════
//
// State-of-health trajectory pulled from /revenue.years[].retention. Reference
// lines at 0.80 (typical augmentation trigger) and 0.70 (typical end-of-life).
// Engine math is unchanged — this is pure binding of a field already present.

function DegradationChart({ years, CC, ts }: {
  years: YearData[];
  CC: ReturnType<typeof useChartColors>;
  ts: ReturnType<typeof useTooltipStyle>;
}) {
  const points = projectDegradationCurve(years);
  if (!points.length) return null;
  const { min, max } = degradationAxisRange(points);

  const data = {
    labels: points.map(p => 'Y' + p.year),
    datasets: [{
      label: 'Retention',
      data: points.map(p => p.retention),
      borderColor: CC.teal,
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: false,
    }],
  };

  // Reference-line plugin (Chart.js doesn't ship annotations in core).
  const refLines = {
    id: 'degradation-refs',
    afterDraw(chart: any) {
      const { ctx, scales } = chart;
      const xL = scales.x.left;
      const xR = scales.x.right;
      const drawLine = (yVal: number, color: string, label: string) => {
        const yPx = scales.y.getPixelForValue(yVal);
        if (yPx == null || !Number.isFinite(yPx)) return;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(xL, yPx);
        ctx.lineTo(xR, yPx);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = `9px ${CHART_FONT.family}`;
        ctx.textAlign = 'right';
        ctx.fillText(label, xR - 4, yPx - 3);
        ctx.restore();
      };
      drawLine(AUGMENTATION_THRESHOLD, CC.amber, '0.80 · augment');
      drawLine(END_OF_LIFE_THRESHOLD, CC.rose, '0.70 · EoL');
    },
  };

  const options: any = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...ts,
        callbacks: {
          title: (items: any[]) => items[0]?.label ?? '',
          label: (ctx: any) => `Retention ${(ctx.parsed.y * 100).toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          autoSkip: true, maxTicksLimit: 7 },
      },
      y: {
        min, max,
        grid: { color: CC.grid, lineWidth: 0.5 },
        border: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          callback: (v: number | string) => (Number(v) * 100).toFixed(0) + '%' },
      },
    },
  };

  return (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 6 }}>
        State-of-health trajectory · OEM curve · LFP 4h
      </div>
      <div style={{ height: 160 }}>
        <Line data={data} plugins={[refLines]} options={options} />
      </div>
    </div>
  );
}

// ═══ DSCR Triple Panel (7.7.2) ══════════════════════════════════════════════
//
// Three values from the worker, three different stories:
//   base         — min annual DSCR over debt life, base scenario
//   conservative — same metric, conservative scenario (banks size against this)
//   worst-month  — lowest monthly DSCR within Y1 (cash-trap risk)
//
// Covenant hairline at 1.20× (industry standard for Baltic merchant BESS).

function DSCRPanel({ base, conservative, worstMonth, covenant }: {
  base: number | null;
  conservative: number | null;
  worstMonth: number | null;
  covenant?: number;
}) {
  const all = [base, conservative, worstMonth].filter((v): v is number => v != null);
  if (!all.length) return null;
  const max = Math.max(3, ...all, covenant ?? 0) * 1.05;
  const min = 0;
  const cov = covenant ?? null;
  const covPct = cov != null ? ((cov - min) / (max - min)) * 100 : null;

  const cells: Array<{
    spec: typeof DSCR_LABELS[keyof typeof DSCR_LABELS];
    value: number | null;
    muted?: boolean;
  }> = [
    { spec: DSCR_LABELS.base, value: base },
    { spec: DSCR_LABELS.conservative, value: conservative, muted: true },
    { spec: DSCR_LABELS.worst_month, value: worstMonth, muted: true },
  ];

  return (
    <div data-testid="dscr-triple-panel" style={{
      padding: '12px 16px',
      border: '1px solid var(--border-card)',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em' }}>Debt-service coverage</div>
        {cov != null && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
            fontFamily: 'var(--font-mono)' }}
            title={`Covenant threshold for Baltic merchant BESS debt: DSCR ≥ ${cov.toFixed(2)}×`}>
            covenant {formatNumber(cov, 'ratio')}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {cells.map((c) => (
          <div key={c.spec.variant} title={c.spec.tooltip}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
              fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 4,
              opacity: c.muted ? 0.78 : 1 }}>
              {c.spec.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1.125rem',
                fontWeight: 500, lineHeight: 1.1,
                color: dscrColor(c.value) }}>
                {c.value != null ? formatNumber(c.value, 'ratio') : '—'}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
              fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {c.spec.sublabel}
            </div>
            <div style={{ position: 'relative', height: 4, background: 'var(--border-card)',
              borderRadius: 1, marginTop: 6 }}>
              {c.value != null && (
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, ((c.value - min) / (max - min)) * 100)}%`,
                  background: dscrColor(c.value), borderRadius: 1,
                  opacity: 0.85 }} />
              )}
              {covPct != null && (
                <div style={{ position: 'absolute', top: -2, bottom: -2,
                  left: `${covPct}%`, width: 1, background: 'var(--text-muted)' }}
                  title="Covenant threshold" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Sensitivity Table ══════════════════════════════════════════════════════

function SensitivityTable({ matrix, currentCod, currentCapex }: {
  matrix: MatrixCell[]; currentCod: number; currentCapex: number;
}) {
  const getCell = (kwh: number, cod: number) => {
    const item = findMatrixCell(matrix as unknown as SensMatrixCell[], kwh, cod);
    if (!item || item.project_irr === null) return { display: '—', color: 'var(--rose)', bold: false };
    const irr = item.project_irr * 100;
    return {
      display: irr.toFixed(1),
      color: irr >= 12 ? 'var(--text-primary)' : irr >= 6 ? 'var(--amber)' : 'var(--rose)',
      bold: irr >= 12,
    };
  };

  const cods = [2027, 2028, 2029];
  const capexes = [120, 164, 262];
  const th: React.CSSProperties = {
    padding: '4px 8px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
    fontFamily: "var(--font-mono)", fontWeight: 400,
  };

  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 8 }}>{IRR_LABELS.unlevered.short} sensitivity</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>€/kWh</th>
            {cods.map(c => <th key={c} style={{ ...th, textAlign: 'right' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {capexes.map(kwh => (
            <tr key={kwh}>
              <td style={{ padding: '5px 8px', fontSize: 'var(--font-sm)',
                fontFamily: "var(--font-mono)", color: 'var(--text-secondary)' }}>€{kwh}</td>
              {cods.map(c => {
                const cell = getCell(kwh, c);
                const isCurrent = kwh === currentCapex && c === currentCod;
                return (
                  <td key={c} style={{
                    padding: '5px 8px', textAlign: 'right',
                    fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
                    background: isCurrent ? 'var(--bg-elevated)' : 'transparent',
                    color: isCurrent ? 'var(--teal)' : cell.color,
                    fontWeight: cell.bold || isCurrent ? 600 : 400,
                  }}>{cell.display}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", marginTop: 6 }}>
        Each year of COD delay adds ~1.5pp compression to fleet S/D</div>
    </div>
  );
}

// ═══ Monthly Heatmap ════════════════════════════════════════════════════════

function MonthlyHeatmap({ months }: { months: BaseMonth[] }) {
  if (!months.length) return null;
  const balVals = months.map(m => m.balancing);
  const trdVals = months.map(m => m.trading);
  const balMin = Math.min(...balVals), balMax = Math.max(...balVals);
  const trdMin = Math.min(...trdVals), trdMax = Math.max(...trdVals);
  const opacity = (v: number, min: number, max: number) =>
    max > min ? 0.25 + 0.55 * (v - min) / (max - min) : 0.4;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 8 }}>Observed monthly revenue (€k/MW)</div>
      <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(${months.length}, 1fr)`,
        gap: 2, fontSize: 'var(--font-xs)', fontFamily: "var(--font-mono)" }}>
        <div style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Bal</div>
        {months.map((m, i) => (
          <div key={'b' + i} style={{
            background: `rgba(0,180,160,${opacity(m.balancing, balMin, balMax)})`,
            padding: '4px 2px', textAlign: 'center',
            color: 'var(--text-primary)', borderRadius: 2,
          }}>{Math.round(m.balancing / 1000)}</div>
        ))}
        <div style={{ color: 'var(--text-muted)', padding: '4px 0' }}>Trd</div>
        {months.map((m, i) => (
          <div key={'t' + i} style={{
            background: `rgba(212,160,60,${opacity(m.trading, trdMin, trdMax)})`,
            padding: '4px 2px', textAlign: 'center',
            color: 'var(--text-primary)', borderRadius: 2,
          }}>{Math.round(m.trading / 1000)}</div>
        ))}
        <div />
        {months.map((m, i) => (
          <div key={'l' + i} style={{ textAlign: 'center',
            color: 'var(--text-muted)', padding: '2px 0' }}>
            {MONTH_NAMES[parseInt(m.month.split('-')[1]) - 1]?.slice(0, 3)}</div>
        ))}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", marginTop: 4 }}>
        {months[0]?.month} to {months[months.length - 1]?.month}</div>
    </div>
  );
}

// ═══ Revenue Chart ══════════════════════════════════════════════════════════

function RevenueChart({ years, CC, ts }: {
  years: YearData[];
  CC: ReturnType<typeof useChartColors>;
  ts: ReturnType<typeof useTooltipStyle>;
}) {
  const chartData = {
    labels: years.map(y => 'Y' + y.yr),
    datasets: [
      {
        label: 'Total',
        data: years.map(y => (y.rev_bal + y.rev_trd) / MW / 1000),
        fill: { target: 1, above: CC.fillAmber },
        borderColor: CC.amber, borderWidth: 1.5,
        pointRadius: 0, tension: 0.35, yAxisID: 'y',
      },
      {
        label: 'Balancing',
        data: years.map(y => y.rev_bal / MW / 1000),
        fill: { target: 'origin', above: CC.fillTeal },
        borderColor: CC.teal, borderWidth: 1.5,
        pointRadius: 0, tension: 0.35, yAxisID: 'y',
      },
      {
        label: 'OPEX',
        data: years.map(y => y.opex / MW / 1000),
        fill: false, borderColor: CC.textMuted, borderWidth: 1,
        borderDash: [4, 4], pointRadius: 0, yAxisID: 'y',
      },
      {
        label: 'Fleet S/D',
        data: years.map(y => y.sd_ratio),
        fill: false, borderColor: CC.fillSd, borderWidth: 1,
        borderDash: [2, 3], pointRadius: 0, yAxisID: 'y2',
      },
    ],
  };

  const options: any = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...ts,
        callbacks: {
          title: (items: any[]) => items[0]?.label ?? '',
          label: (ctx: any) => {
            const y = years[ctx.dataIndex];
            if (!y) return '';
            if (ctx.datasetIndex === 0) {
              const trdK = Math.round(y.rev_trd / MW / 1000);
              const pct = Math.round(y.trading_fraction * 100);
              return `Trading €${trdK}k (${pct}%)`;
            }
            if (ctx.datasetIndex === 1) return `Balancing €${Math.round(y.rev_bal / MW / 1000)}k`;
            if (ctx.datasetIndex === 2) return `OPEX €${Math.round(y.opex / MW / 1000)}k`;
            if (ctx.datasetIndex === 3) return `Fleet S/D ${y.sd_ratio.toFixed(2)}×`;
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 10 },
          autoSkip: true, maxTicksLimit: 7 },
      },
      y: {
        position: 'left', min: 0, max: 200,
        grid: { color: CC.grid, lineWidth: 0.5 },
        border: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 10 },
          callback: (v: number | string) => '€' + v + 'k' },
      },
      y2: {
        position: 'right', min: 0.5, max: 3,
        grid: { display: false }, border: { display: false },
        ticks: { color: CC.textFaint,
          font: { family: CHART_FONT.family, size: 10 },
          callback: (v: number | string) => Number(v).toFixed(1) + '×' },
      },
    },
  };

  return <div style={{ height: 280 }}><Line data={chartData} options={options} /></div>;
}

// ═══ DSCR Chart ═════════════════════════════════════════════════════════════

function DSCRChart({ monthly, CC }: {
  monthly: MonthlyDSCR[]; CC: ReturnType<typeof useChartColors>;
}) {
  const labels = monthly.map(m => {
    const idx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m.month);
    return idx >= 0 ? MONTH_LETTERS[idx] : m.month.slice(0, 1);
  });

  const data = {
    labels,
    datasets: [{
      data: monthly.map(m => m.dscr),
      backgroundColor: monthly.map(m =>
        m.dscr >= 1.20 ? CC.tealLight : m.dscr >= 1.0 ? CC.amberLight : CC.roseLight
      ),
      borderRadius: 2, barPercentage: 0.65,
    }],
  };

  const covenantPlugin = {
    id: 'dscr-covenant',
    afterDraw(chart: any) {
      const { ctx, scales } = chart;
      const yPixel = scales.y.getPixelForValue(1.20);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = CC.textMuted;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(scales.x.left, yPixel);
      ctx.lineTo(scales.x.right, yPixel);
      ctx.stroke();
      ctx.restore();
    },
  };

  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 6 }}>Y1 monthly DSCR</div>
      <div style={{ height: 140 }}>
        <Bar data={data} plugins={[covenantPlugin]} options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { grid: { display: false },
              ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 } } },
            y: { min: 0, max: 3,
              grid: { color: CC.grid, lineWidth: 0.5 },
              border: { display: false },
              ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
                maxTicksLimit: 4, callback: (v: number | string) => Number(v).toFixed(1) + '×' } },
          },
        }} />
      </div>
    </div>
  );
}

// ═══ Drawer Content ═════════════════════════════════════════════════════════

function DrawerContent({ data }: { data: RevenueData }) {
  const y1 = data.years[0];
  if (!y1) return null;
  const CC = useChartColors();

  const head: React.CSSProperties = {
    color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
    fontFamily: "var(--font-mono)", textTransform: 'uppercase',
    letterSpacing: '0.1em', marginTop: 20, marginBottom: 8,
  };
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
    color: 'var(--text-secondary)', padding: '2px 0',
  };

  const R = ({ label, val, bold }: { label: string; val: string; bold?: boolean }) => (
    <div style={{ ...row, fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span><span>{val}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 540 }}>
      <div style={head}>Revenue split (Y1 per MW)</div>
      <R label="Capacity fees" val={`€${fmtK(y1.rev_cap / MW)}`} />
      <R label="Dispatch energy" val={`€${fmtK(y1.rev_act / MW)}`} />
      <R label="= Balancing" val={`€${fmtK(y1.rev_bal / MW)}`} bold />
      <div style={{ height: 6 }} />
      <R label="Trading" val={`€${fmtK(y1.rev_trd / MW)}`} bold />
      <div style={{ height: 6 }} />
      <R label="Gross" val={`€${fmtK(y1.rev_gross / MW)}`} />
      <R label="− RTM fees" val={`€${fmtK(y1.rtm_fee / MW)}`} />
      <R label="= Net" val={`€${fmtK(y1.rev_net / MW)}`} bold />
      <R label="− OPEX" val={`€${fmtK(y1.opex / MW)}`} />
      <R label="= EBITDA" val={`€${fmtK(y1.ebitda / MW)}`} bold />

      <div style={head}>Scenario comparison</div>
      <table style={{ width: '100%', borderCollapse: 'collapse',
        fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '3px 4px' }} />
            {['base', 'conservative', 'stress'].map(s => (
              <th key={s} style={{ textAlign: 'right', fontWeight: 400,
                padding: '3px 6px', fontSize: 'var(--font-xs)' }}>
                {s === 'conservative' ? 'Cons.' : s.charAt(0).toUpperCase() + s.slice(1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['IRR', 'DSCR', 'Net/MW', 'Bankability'].map(metric => (
            <tr key={metric} style={{ color: 'var(--text-secondary)' }}>
              <td style={{ padding: '3px 4px' }}>{metric}</td>
              {['base', 'conservative', 'stress'].map(s => {
                const sc = data.all_scenarios[s];
                let val = '—';
                if (sc) {
                  if (metric === 'IRR') val = fmtIrr(sc.project_irr);
                  else if (metric === 'DSCR') val = sc.min_dscr != null ? sc.min_dscr.toFixed(2) + '×' : '—';
                  else if (metric === 'Net/MW') val = sc.net_mw_yr ? '€' + fmtK(sc.net_mw_yr) : '—';
                  else if (metric === 'Bankability') val = sc.bankability ?? '—';
                }
                return <td key={s} style={{ textAlign: 'right', padding: '3px 6px' }}>{val}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={head}>Financing</div>
      <R label="Debt share" val={`55% (€${fmtK(data.debt_initial)})`} />
      <R label="Rate" val={`${(data.rate_allin * 100).toFixed(1)}%`} />
      <R label="Tenor" val="8 yr" />
      <R label="Grace" val="1 yr" />
      <R label="Equity" val={`€${fmtK(data.equity_initial)}`} />

      <div style={head}>Degradation</div>
      <div style={{ height: 120 }}>
        <Line data={{
          labels: data.years.map(y => 'Y' + y.yr),
          datasets: [{
            data: data.years.map(y => y.usable_mwh_per_mw),
            borderColor: CC.teal, borderWidth: 1.5, pointRadius: 0,
            tension: 0.3, fill: false,
          }],
        }} options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { grid: { display: false },
              ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
                autoSkip: true, maxTicksLimit: 6 } },
            y: { min: 0, max: 5,
              grid: { color: CC.grid, lineWidth: 0.5 },
              border: { display: false },
              ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
                callback: (v: number | string) => v + ' MWh' } },
          },
        }} />
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", marginTop: 4 }}>
        OEM LFP · 1 cycle/day · augmentation Y10</div>

      <div style={head}>Data sources</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', lineHeight: 1.6 }}>
        S1: ENTSO-E A44, 15-min ISP, LT zone — {data.base_year.data_coverage.s1_months} months<br />
        S2: Baltic Transparency Dashboard — {data.base_year.data_coverage.s2_months} months<br />
        S4: Fleet tracker — {data.fleet_context?.source ?? 'live'}<br />
        Euribor: ECB — {data.signal_inputs.euribor}%<br />
        Model: {data.model_version}
      </div>
    </div>
  );
}

// ═══ Main Component ═════════════════════════════════════════════════════════

export function RevenueCard() {
  const [dur, setDur] = useState<'2h' | '4h'>('4h');
  const [capex, setCapex] = useState<'low' | 'mid' | 'high'>('mid');
  const [cod, setCod] = useState(2028);
  const [scenario, setScenario] = useState('base');
  const [data, setData] = useState<RevenueData | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [drawerKey, setDrawerKey] = useState(0);
  // Canonical dispatch (ISP model) for the live-rate footnote — never derive locally
  const [canonicalDispatch, setCanonicalDispatch] = useState<number | null>(null);
  const CC = useChartColors();
  const ts = useTooltipStyle(CC);
  const initDone = useRef(false);

  // Read URL params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('dur') === '2h' || p.get('dur') === '4h') setDur(p.get('dur') as '2h' | '4h');
    if (p.get('capex') && ['low', 'mid', 'high'].includes(p.get('capex')!))
      setCapex(p.get('capex') as 'low' | 'mid' | 'high');
    if (p.get('cod')) { const c = parseInt(p.get('cod')!); if ([2027, 2028, 2029].includes(c)) setCod(c); }
    if (p.get('scenario') && ['base', 'conservative', 'stress'].includes(p.get('scenario')!))
      setScenario(p.get('scenario')!);
    initDone.current = true;
  }, []);

  // Write URL params on change
  useEffect(() => {
    if (!initDone.current || typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    p.set('dur', dur); p.set('capex', capex);
    p.set('cod', String(cod)); p.set('scenario', scenario);
    window.history.replaceState({}, '', '?' + p.toString() + window.location.hash);
  }, [dur, capex, cod, scenario]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const r = await fetch(`${WORKER}/revenue?dur=${dur}&capex=${capex}&cod=${cod}&scenario=${scenario}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as RevenueData;
      setData(d);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [dur, capex, cod, scenario]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Pull canonical dispatch headline so live-rate can footnote it.
  useEffect(() => {
    fetch(`${WORKER}/api/dispatch?dur=${dur}&mode=realised`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { revenue_per_mw?: { daily_eur?: number | null } } | null) => {
        if (d?.revenue_per_mw?.daily_eur != null) setCanonicalDispatch(d.revenue_per_mw.daily_eur);
      })
      .catch(() => {});
  }, [dur]);

  if (status === 'loading' && !data) {
    return <div style={{ padding: 40, color: 'var(--text-muted)',
      fontFamily: "var(--font-mono)", textAlign: 'center' }}>Loading revenue model…</div>;
  }
  if (status === 'error' && !data) {
    return <div style={{ padding: 40, color: 'var(--rose)',
      fontFamily: "var(--font-mono)", textAlign: 'center' }}>Revenue model unavailable</div>;
  }
  if (!data) return null;

  const y1 = data.years[0];
  const si = data.signal_inputs;
  const lr = data.live_rate;
  const openDrawer = () => setDrawerKey(k => k + 1);

  return (
    <div style={{ padding: 24, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-highlight)', borderRadius: 8 }}>

      {/* Headline */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1.75rem',
              fontWeight: 600, color: irrColor(data.project_irr), lineHeight: 1,
              opacity: status === 'loading' ? 0.5 : 1, transition: 'opacity 0.2s' }}>
              {fmtIrr(data.project_irr)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)' }}>
              €{fmtK(data.net_rev_per_mw_yr)} net/MW/yr</span>
            {data.irr_status && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: irrColor(data.project_irr), opacity: 0.75,
                border: `1px solid ${irrColor(data.project_irr)}`,
                borderRadius: 3, padding: '1px 6px' }}>{data.irr_status}</span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', marginTop: 6, cursor: 'pointer' }}
            onClick={openDrawer}>
            {data.system} · €{data.capex_eur_kwh}/kWh · COD {data.cod_year} · {data.scenario} · 20-yr unlevered DCF
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
            fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
            Year 1 built from {data.base_year.data_coverage.s1_months} months observed DA prices + {data.base_year.data_coverage.s2_months} months BTD activation data
          </div>
        </div>

        {lr && lr.today_total_daily > 0 && (() => {
          const liveLabel = DISPATCH_LABELS.live_rate_aggregate;
          const dispatchNote = vsCanonicalDispatchFootnote('live_rate_aggregate', canonicalDispatch);
          return (
            <div style={{ textAlign: 'right', minWidth: 140 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 2 }}>{liveLabel.short}</div>
              <div style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1.1rem',
                color: 'var(--text-primary)', fontWeight: 500 }}>
                €{lr.today_total_daily}/MW/day</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: '0.5625rem',
                color: 'var(--text-muted)' }}>{liveLabel.detail}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: lr.delta_pct >= 0 ? 'var(--teal)' : 'var(--amber)', marginTop: 2 }}>
                {lr.delta_pct >= 0 ? '+' : ''}{lr.delta_pct}% vs trailing avg</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)' }}>{fmtDate(lr.as_of)}</div>
              {dispatchNote && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: '0.5625rem',
                  color: 'var(--text-ghost)', marginTop: 4, lineHeight: 1.4 }}>
                  {dispatchNote}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16,
        paddingBottom: 12, borderBottom: '1px solid var(--border-card)' }}>
        <ControlGroup label="Dur" value={dur}
          options={[{ key: '2h', label: '2H' }, { key: '4h', label: '4H' }]}
          onChange={v => setDur(v as '2h' | '4h')} />
        <ControlGroup label="Cost" value={capex}
          options={[{ key: 'low', label: '€120' }, { key: 'mid', label: '€164' }, { key: 'high', label: '€262' }]}
          onChange={v => setCapex(v as 'low' | 'mid' | 'high')} />
        <ControlGroup label="COD" value={String(cod)}
          options={[{ key: '2027', label: '2027' }, { key: '2028', label: '2028' }, { key: '2029', label: '2029' }]}
          onChange={v => setCod(parseInt(v))} />
        <ControlGroup label="Scenario" value={scenario}
          options={[{ key: 'base', label: 'Base' }, { key: 'conservative', label: 'Cons.' }, { key: 'stress', label: 'Stress' }]}
          onChange={v => setScenario(v)} />
      </div>

      {/* Returns metrics — Project IRR + Equity IRR (split per 7.7.1) + CFADS + Payback */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <MetricCell label={IRR_TILES.unlevered.label}
          value={formatNumber(data.project_irr, 'irr')}
          color={irrColor(data.project_irr)}
          methodVersion={data.model_version}
          title={IRR_TILES.unlevered.tooltip}
          sub={IRR_TILES.unlevered.sublabel} />
        <MetricCell label={IRR_TILES.equity.label}
          value={formatNumber(data.equity_irr, 'irr')}
          color={irrColor(data.equity_irr)}
          methodVersion={data.model_version}
          title={IRR_TILES.equity.tooltip}
          sub={IRR_TILES.equity.sublabel} />
        <MetricCell label="CFADS/MW/yr"
          value={y1 ? '€' + fmtK(y1.cfads / MW) : '—'}
          sub={`net €${fmtK(data.net_rev_per_mw_yr)} less opex, tax`} />
        <MetricCell label="Payback"
          value={data.payback_years != null ? data.payback_years + ' yr' : '—'}
          sub={`€${fmtK(data.capex_total / MW)}/MW capex · debt ${(data.rate_allin * 100).toFixed(1)}%`} />
      </div>

      {/* DSCR triple panel — base, conservative, worst-month (7.7.2) */}
      <div style={{ marginBottom: 20 }}>
        <DSCRPanel base={data.min_dscr} conservative={data.min_dscr_conservative}
          worstMonth={data.worst_month_dscr} covenant={DEFAULT_DSCR_COVENANT} />
      </div>

      {/* Main chart area */}
      <div className="rv-main" style={{ display: 'grid', gridTemplateColumns: '5fr 3fr', gap: 20 }}>
        <div>
          <RevenueChart years={data.years} CC={CC} ts={ts} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8,
            fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8,
              borderRadius: 1, background: CC.teal, marginRight: 4 }} />Balancing</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8,
              borderRadius: 1, background: CC.amber, marginRight: 4 }} />Trading</span>
            <span style={{ borderBottom: '1px dashed var(--text-muted)', paddingBottom: 1 }}>OPEX</span>
            <span style={{ borderBottom: '1px dotted var(--text-muted)', paddingBottom: 1 }}>Fleet S/D</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SensitivityTable matrix={data.matrix}
            currentCod={data.cod_year} currentCapex={data.capex_eur_kwh} />
          <DSCRChart monthly={data.monthly_y1} CC={CC} />
        </div>
      </div>

      {/* Heatmap */}
      <MonthlyHeatmap months={data.base_year.months} />

      {/* Analytics row — degradation, sensitivity, backtest, cannibalization */}
      <div className="rv-analytics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 24, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-card)' }}>
        <DegradationChart years={data.years} CC={CC} ts={ts} />
        <RevenueSensitivityTornado matrix={data.matrix}
          scenarios={{
            conservative: data.all_scenarios.conservative,
            stress: data.all_scenarios.stress,
          }} />
        <div style={{ gridColumn: '1 / -1' }}>
          <RevenueBacktest rows={data.backtest ?? []}
            modeledY1Daily={data.net_rev_per_mw_yr ? data.net_rev_per_mw_yr / 365 : null} />
        </div>
      </div>

      {/* Disclosure */}
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
        fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 16 }}>
        Year 1 from observed market data, not modeled assumptions. Forward compression derived from S2 fleet trajectory. Not investment advice.
      </div>

      {/* Source footer */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', marginTop: 8, opacity: 0.7, cursor: 'pointer' }}
        onClick={openDrawer}>
        {data.model_version} · S1 €{si.s1_capture?.toFixed(0)}/MWh · S2 aFRR €{si.afrr_clearing?.toFixed(0)} · Euribor {si.euribor}% · {fmtDate(data.timestamp)}
      </div>

      {/* Drawer */}
      <DetailsDrawer key={drawerKey} defaultOpen={drawerKey > 0}
        label="▸ Revenue detail, degradation, monthly DSCR, data sources">
        <DrawerContent data={data} />
      </DetailsDrawer>

      <style>{`
        @media (max-width: 768px) {
          .rv-main { grid-template-columns: 1fr !important; }
          .rv-analytics { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

export default RevenueCard;
