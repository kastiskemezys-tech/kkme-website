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
import { DetailsDrawer, ChartTooltipPortal, useChartTooltipState } from '@/app/components/primitives';
import { buildExternalTooltipHandler } from '@/app/lib/chartTooltip';
import { RevenueSensitivityTornado } from '@/app/components/RevenueSensitivityTornado';
import { RevenueBacktest } from '@/app/components/RevenueBacktest';
import type { BacktestRow } from '@/app/lib/backtest';
import { findMatrixCell, type MatrixCell as SensMatrixCell } from '@/app/lib/sensitivityMatrix';
import { DISPATCH_LABELS, vsCanonicalDispatchFootnote } from '@/app/lib/dispatchDefinitions';
import { IRR_LABELS } from '@/app/lib/irrLabels';
import {
  IRR_TILES, DSCR_LABELS, DEFAULT_DSCR_COVENANT, STORAGE_METRICS,
} from '@/app/lib/financialDefinitions';
import { formatNumber } from '@/app/lib/format';
import {
  projectDegradationCurve,
  degradationAxisRange,
  AUGMENTATION_THRESHOLD,
  END_OF_LIFE_THRESHOLD,
} from '@/app/lib/degradation';
import {
  projectCannibalizationCurve,
  cannibalizationAxisRange,
  TODAYS_MARKET_REFERENCE,
  type FleetYearRow,
} from '@/app/lib/cannibalization';

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

interface AssumptionRow {
  value: number;
  label: string;
  unit: string;
  note: string;
}

export interface CyclesBreakdown {
  fcr: number;
  afrr: number;
  mfrr: number;
  da: number;
  total_cd: number;
  total_efcs_yr: number;
  label?: string;
}

interface AssumptionsPanelData {
  rte: AssumptionRow;
  // v7.2 carried this as AssumptionRow; v7.3 replaced it with cycles_breakdown.
  // Kept optional for back-compat; the renderer derives a synthetic row from
  // cycles_breakdown when v7.3 shape is detected.
  cycles_per_year?: AssumptionRow;
  cycles_breakdown?: CyclesBreakdown;
  warranty_status?: 'within' | 'premium-tier-required' | 'unwarranted';
  availability: AssumptionRow;
  hold_period: AssumptionRow;
  wacc: AssumptionRow;
}

interface DurationRecommendation {
  current_default: number;
  optimal: number | null;
  delta_pp: number | null;
  irr_2h: number | null;
  irr_4h: number | null;
  note: string;
}

export interface EngineCalibrationSource {
  soh_curves?: string;
  rte_decay?: string;
  availability?: string;
  throughput_per_product?: string;
  capex_per_mw?: string;
  last_calibrated?: string;
  next_review?: string;
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
  // v7.2 — Phase 7.7c Session 1 derived metrics
  lcos_eur_mwh?: number | null;
  moic?: number | null;
  roundtrip_efficiency?: number;
  duration_recommendation?: DurationRecommendation;
  assumptions_panel?: AssumptionsPanelData;
  // v7.3 — Phase 7.7d empirical-calibration surfaces
  roundtrip_efficiency_curve?: number[];
  engine_calibration_source?: EngineCalibrationSource;
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
  fleet_trajectory?: FleetYearRow[];
  cpi_at_cod?: number;
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

// ═══ Duration Optimizer (7.7.15) ════════════════════════════════════════════
//
// Real-options duration hint. Renders the engine's `duration_recommendation`
// derived field — the engine already ran the dual-duration projection so the
// surface is just chips + a one-sentence interpretation.

function DurationOptimizer({ rec }: { rec: DurationRecommendation | undefined }) {
  if (!rec || rec.optimal == null || rec.irr_2h == null || rec.irr_4h == null) return null;

  const dominantIs = (h: 2 | 4) => rec.optimal === h;

  const Chip = ({ hours, irr }: { hours: 2 | 4; irr: number }) => (
    <div style={{
      flex: 1,
      padding: '8px 12px',
      border: `1px solid ${dominantIs(hours) ? 'var(--mint)' : 'var(--border-card)'}`,
      borderRadius: 4,
      background: dominantIs(hours) ? 'color-mix(in srgb, var(--mint) 8%, transparent)' : 'transparent',
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 2 }}>
        {hours}h IRR
      </div>
      <div style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1rem',
        fontWeight: 500, lineHeight: 1.1,
        color: dominantIs(hours) ? 'var(--mint)' : 'var(--text-primary)' }}>
        {formatNumber(irr, 'irr')}
      </div>
    </div>
  );

  return (
    <div data-testid="duration-optimizer" style={{
      padding: '10px 14px',
      border: '1px solid var(--border-card)',
      borderRadius: 6,
    }} title={STORAGE_METRICS.DURATION_RECOMMENDATION.tooltip}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em' }}>
          {STORAGE_METRICS.DURATION_RECOMMENDATION.short} · {STORAGE_METRICS.DURATION_RECOMMENDATION.long}
        </div>
        {rec.delta_pp != null && (
          <div style={{ color: 'var(--mint)', fontSize: 'var(--font-xs)',
            fontFamily: 'var(--font-mono)' }}>
            {rec.optimal}h optimal · +{rec.delta_pp.toFixed(1)}pp
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Chip hours={2} irr={rec.irr_2h} />
        <Chip hours={4} irr={rec.irr_4h} />
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: "'Cormorant Garamond',serif", fontStyle: 'italic',
        marginTop: 8, lineHeight: 1.35 }}>
        {rec.note}
      </div>
    </div>
  );
}

// ═══ Phase 7.7e — RTE decay sparkline ══════════════════════════════════════
//
// Inline sparkline of the 18-year roundtrip-efficiency curve. Visualises the
// engine's RTE-decay assumption (0.20 pp/yr, anchored on Tier 1 LFP integrator
// consensus) so investors can read the curve, not just the BOL number.

export function RteSparkline({ curve }: { curve: number[] | undefined }) {
  const tt = useChartTooltipState();
  if (!curve || curve.length < 2) return null;

  const W = 96;
  const H = 18;
  const valid = curve.filter(v => typeof v === 'number' && isFinite(v));
  if (valid.length < 2) return null;

  // Hard-anchor y-axis to [bol_minus_a_bit, bol] so the decay reads as a curve
  // rather than a flat line zoomed to its own range.
  const bol = Math.max(...valid);
  const eol = Math.min(...valid);
  const range = bol - eol || 0.01;
  const padTop = 1;
  const padBot = 1;

  const toY = (v: number) =>
    H - padBot - ((v - eol) / range) * (H - padTop - padBot);

  const pts = valid.map((v, i) => ({
    x: parseFloat(((i / (valid.length - 1)) * W).toFixed(1)),
    y: parseFloat(toY(v).toFixed(1)),
    yr: i,
    v,
  }));
  const points = pts.map(p => `${p.x},${p.y}`).join(' ');

  const areaPath = [
    `M${pts[0].x},${H}`,
    ...pts.map(p => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${H}`,
    'Z',
  ].join(' ');

  const gradId = 'rte-spark-grad';

  return (
    <span
      data-testid="rte-sparkline"
      style={{ display: 'inline-block', verticalAlign: 'middle', lineHeight: 0 }}
      onMouseLeave={() => tt.hide()}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--text-tertiary)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--text-tertiary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <polyline
          points={points}
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Year-zero dot (BOL) and year-final dot (EOL) for legibility. */}
        <circle cx={pts[0].x} cy={pts[0].y} r={1.2} fill="var(--text-secondary)" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={1.2} fill="var(--text-secondary)" />
        {/* Hover hit areas */}
        {pts.map(p => {
          const segW = W / pts.length;
          return (
            <rect
              key={p.yr}
              x={p.x - segW / 2}
              y={0}
              width={segW}
              height={H}
              fill="transparent"
              onMouseEnter={(e) => tt.show({
                label: `Year ${p.yr}`,
                value: p.v * 100,
                unit: '%',
                secondary: [{ label: 'vs BOL', value: ((p.v - bol) * 100), unit: 'pp' }],
              }, e.clientX, e.clientY)}
              onMouseMove={(e) => tt.show({
                label: `Year ${p.yr}`,
                value: p.v * 100,
                unit: '%',
                secondary: [{ label: 'vs BOL', value: ((p.v - bol) * 100), unit: 'pp' }],
              }, e.clientX, e.clientY)}
            />
          );
        })}
      </svg>
      <ChartTooltipPortal tt={tt} />
    </span>
  );
}

// ═══ Phase 7.7e — cycles_breakdown 4-bar mini-chart ════════════════════════
//
// FCR / aFRR / mFRR / DA EFCs/yr decomposition. Replaces the v7.3 italicized
// note with a scannable per-product split. Hues from the canonical
// `--cycles-{fcr,afrr,mfrr,da}` palette (lavender / teal / amber / blue).

const PRODUCT_LABEL: Record<'fcr' | 'afrr' | 'mfrr' | 'da', string> = {
  fcr:  'FCR',
  afrr: 'aFRR',
  mfrr: 'mFRR',
  da:   'DA',
};
const PRODUCT_COLOR: Record<'fcr' | 'afrr' | 'mfrr' | 'da', string> = {
  fcr:  'var(--cycles-fcr)',
  afrr: 'var(--cycles-afrr)',
  mfrr: 'var(--cycles-mfrr)',
  da:   'var(--cycles-da)',
};
const WARRANTY_STYLE: Record<'within' | 'premium-tier-required' | 'unwarranted', { color: string; label: string }> = {
  'within':                  { color: 'var(--teal)',   label: 'within warranty' },
  'premium-tier-required':   { color: 'var(--amber)',  label: 'premium tier required' },
  'unwarranted':             { color: 'var(--coral)',  label: 'unwarranted' },
};

export function CyclesBreakdownChart({
  breakdown,
  warrantyStatus,
}: {
  breakdown: CyclesBreakdown;
  warrantyStatus?: 'within' | 'premium-tier-required' | 'unwarranted';
}) {
  const tt = useChartTooltipState();
  const total = breakdown.total_efcs_yr || 1;
  const products: Array<{ key: 'fcr' | 'afrr' | 'mfrr' | 'da'; value: number }> = [
    { key: 'fcr',  value: breakdown.fcr },
    { key: 'afrr', value: breakdown.afrr },
    { key: 'mfrr', value: breakdown.mfrr },
    { key: 'da',   value: breakdown.da },
  ];

  const W = 240;
  const H = 12;

  // Cumulative offsets for stacked bar
  let cum = 0;
  const segs = products.map(p => {
    const w = (p.value / total) * W;
    const x = cum;
    cum += w;
    return { ...p, x, w };
  });

  const warrantyDef = warrantyStatus ? WARRANTY_STYLE[warrantyStatus] : null;

  return (
    <div
      data-testid="cycles-breakdown-chart"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, width: '100%' }}
      onMouseLeave={() => tt.hide()}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', maxWidth: W, height: H, overflow: 'visible' }}
      >
        <rect x={0} y={0} width={W} height={H} rx={2} fill="var(--bg-elevated)" />
        {segs.map(s => {
          const showTip = (e: React.MouseEvent) => tt.show({
            label: PRODUCT_LABEL[s.key],
            value: s.value,
            unit: 'EFCs/yr',
            secondary: [
              { label: 'Of total', value: (s.value / total) * 100, unit: '%' },
              { label: 'Total c/d', value: breakdown.total_cd, unit: 'c/d' },
            ],
          }, e.clientX, e.clientY);
          return (
            <rect
              key={s.key}
              data-product={s.key}
              x={s.x}
              y={0}
              width={Math.max(1, s.w - 1)}
              height={H}
              fill={PRODUCT_COLOR[s.key]}
              opacity={0.78}
              rx={1.5}
              onMouseEnter={showTip}
              onMouseMove={showTip}
            />
          );
        })}
      </svg>
      {/* Legend + totals */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'baseline',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {products.map(p => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: 1.5,
              background: PRODUCT_COLOR[p.key], opacity: 0.78,
            }} />
            <span style={{ color: 'var(--text-secondary)' }}>{PRODUCT_LABEL[p.key]}</span>
            <span>{Math.round(p.value)}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{Math.round(total)}</span>
          {' EFCs/yr · '}
          <span style={{ color: 'var(--text-primary)' }}>{breakdown.total_cd.toFixed(2)}</span>
          {' c/d'}
        </span>
        {warrantyDef && (
          <span style={{
            marginLeft: 4,
            padding: '1px 6px',
            border: `1px solid ${warrantyDef.color}`,
            borderRadius: 2,
            color: warrantyDef.color,
            fontSize: 'var(--font-xs)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {warrantyDef.label}
          </span>
        )}
      </div>
      <ChartTooltipPortal tt={tt} />
    </div>
  );
}

// ═══ Phase 7.7e — Calibration source footer ════════════════════════════════
//
// Reassurance, not headline. Italic single-line summary with a click-to-expand
// reveal of the per-constant provenance from `engine_calibration_source`.

export function CalibrationFooter({ source }: { source: EngineCalibrationSource | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!source) return null;
  const lastCalibrated = source.last_calibrated;
  const nextReview = source.next_review;
  const summary = lastCalibrated
    ? `Calibrated ${lastCalibrated} against Tier 1 LFP integrator consensus + public market research`
    : 'Calibrated against Tier 1 LFP integrator consensus + public market research';
  const nextSuffix = nextReview ? ` · Next review ${nextReview}` : '';

  const rows: Array<[string, string | undefined]> = [
    ['SOH curves',                source.soh_curves],
    ['RTE decay',                 source.rte_decay],
    ['Availability',              source.availability],
    ['Throughput per product',    source.throughput_per_product],
    ['CAPEX per MW',              source.capex_per_mw],
    ['Last calibrated',           source.last_calibrated],
    ['Next review',               source.next_review],
  ];

  return (
    <div data-testid="calibration-footer" style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: 'italic',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          width: '100%',
        }}
      >
        <span style={{ flex: 1 }}>{summary}{nextSuffix}</span>
        <span aria-hidden style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          fontStyle: 'normal',
          padding: '1px 5px',
          borderRadius: 2,
          border: '1px solid var(--border-subtle)',
          transition: 'transform 0.18s ease',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>i</span>
      </button>
      {expanded && (
        <div
          data-testid="calibration-footer-detail"
          style={{
            marginTop: 8,
            padding: '10px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            background: 'var(--bg-elevated)',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 12,
            rowGap: 5,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {rows.map(([label, value]) =>
            value ? (
              <div key={label} style={{ display: 'contents' }}>
                <span style={{
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  paddingTop: 1,
                }}>
                  {label}
                </span>
                <span>{value}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ═══ Assumptions Panel (7.7.5) ══════════════════════════════════════════════
//
// Read-only display of engine assumptions. NO sliders / NO interactive
// elements (capital-structure controls land in Phase 7.7c Session 2).

function AssumptionsPanel({ panel, rteCurve, calibrationSource }: {
  panel: AssumptionsPanelData | undefined;
  rteCurve?: number[];
  calibrationSource?: EngineCalibrationSource;
}) {
  if (!panel) return null;

  // Phase 7.7e — when v7.3 cycles_breakdown is present, the cycles row renders
  // as a per-product mini-chart (CyclesBreakdownChart) replacing the v7.2 note.
  // v7.2 fallback: render the flat row identically to before.
  const useV73CyclesChart = !!panel.cycles_breakdown;
  const v72CyclesRow = panel.cycles_per_year ?? null;

  const standardRows: Array<{ key: string; row: AssumptionRow }> = [
    ...(panel.availability ? [{ key: 'availability', row: panel.availability }] : []),
    ...(panel.hold_period  ? [{ key: 'hold_period',  row: panel.hold_period  }] : []),
    ...(panel.wacc         ? [{ key: 'wacc',         row: panel.wacc         }] : []),
  ];

  return (
    <div data-testid="assumptions-panel" style={{
      padding: '12px 16px',
      border: '1px solid var(--border-card)',
      borderRadius: 6,
    }}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 10 }}>
        Engine assumptions
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 8 }}>
        {/* RTE row — value + inline RteSparkline of the 18-yr decay curve */}
        {panel.rte && (
          <>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 8,
            }} title={panel.rte.note}>
              <span style={{ color: 'var(--text-primary)' }}>{panel.rte.label}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {panel.rte.value}{panel.rte.unit}
              </span>
              {rteCurve && rteCurve.length >= 2 && <RteSparkline curve={rteCurve} />}
            </div>
            <div style={{
              fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
              fontStyle: 'italic', color: 'var(--text-muted)', lineHeight: 1.35,
            }}>
              {panel.rte.note}
              {rteCurve && rteCurve.length >= 2 && (
                <> · {(rteCurve[0] * 100).toFixed(1)}% Y0 → {(rteCurve[rteCurve.length - 1] * 100).toFixed(1)}% Y{rteCurve.length - 1}</>
              )}
            </div>
          </>
        )}

        {/* Cycles row — v7.3 cycles_breakdown chart, or v7.2 fallback row */}
        {useV73CyclesChart && panel.cycles_breakdown && (
          <>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', whiteSpace: 'nowrap', alignSelf: 'start',
              paddingTop: 2,
            }}>
              <span style={{ color: 'var(--text-primary)' }}>Cycles per year</span>
            </div>
            <div>
              <CyclesBreakdownChart
                breakdown={panel.cycles_breakdown}
                warrantyStatus={panel.warranty_status}
              />
            </div>
          </>
        )}
        {!useV73CyclesChart && v72CyclesRow && (
          <>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', whiteSpace: 'nowrap',
            }} title={v72CyclesRow.note}>
              <span style={{ color: 'var(--text-primary)' }}>{v72CyclesRow.label}</span>
              {' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {v72CyclesRow.value}{v72CyclesRow.unit}
              </span>
            </div>
            <div style={{
              fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
              fontStyle: 'italic', color: 'var(--text-muted)', lineHeight: 1.35,
            }}>
              {v72CyclesRow.note}
            </div>
          </>
        )}

        {/* Remaining standard rows — availability / hold / wacc */}
        {standardRows.map(({ key, row }) => (
          <div key={key} style={{ display: 'contents' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', whiteSpace: 'nowrap',
            }} title={row.note}>
              <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
              {' '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {row.value}{row.unit}
              </span>
            </div>
            <div style={{
              fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
              fontStyle: 'italic', color: 'var(--text-muted)', lineHeight: 1.35,
            }}>
              {row.note}
            </div>
          </div>
        ))}
      </div>
      <CalibrationFooter source={calibrationSource} />
    </div>
  );
}

// ═══ Degradation Curve (7.7.6) ══════════════════════════════════════════════
//
// State-of-health trajectory pulled from /revenue.years[].retention. Reference
// lines at 0.80 (typical augmentation trigger) and 0.70 (typical end-of-life).
// Engine math is unchanged — this is pure binding of a field already present.

function DegradationChart({ years, CC }: {
  years: YearData[];
  CC: ReturnType<typeof useChartColors>;
  /** Phase 7.7e: tooltip migrated to unified primitive; legacy prop preserved. */
  ts?: unknown;
}) {
  const points = projectDegradationCurve(years);
  if (!points.length) return null;
  const { min, max } = degradationAxisRange(points);

  const tt = useChartTooltipState();
  const externalTooltip = useTooltipStyle(CC, {
    external: buildExternalTooltipHandler(tt.setState, (point, title) => ({
      label: `Retention · ${title ?? 'Y' + (points[point.dataIndex ?? 0]?.year ?? 0)}`,
      value: typeof point.parsed?.y === 'number' ? point.parsed.y * 100 : 0,
      unit: '%',
    })),
  });

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
      tooltip: externalTooltip,
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
      <ChartTooltipPortal tt={tt} />
    </div>
  );
}

// ═══ Cannibalization Curve (7.7.13) ═════════════════════════════════════════
//
// Capacity-payment compression projection from /revenue.fleet_trajectory.
// Public: chart line shape + axis. Drawer-only (P3): the cpi formula
// coefficients (S/D thresholds 0.6 / 1.0, slopes 2.5 / 1.5 / 0.08 inside the
// worker). Investor sees how the curve evolves; sponsor IP stays unpublished.

function CannibalizationChart({ rows, codYear, CC }: {
  rows: FleetYearRow[];
  codYear?: number;
  CC: ReturnType<typeof useChartColors>;
  /** Phase 7.7e: tooltip migrated to unified primitive; legacy prop preserved. */
  ts?: unknown;
}) {
  const points = projectCannibalizationCurve(rows);
  if (!points.length) return null;
  const { min, max } = cannibalizationAxisRange(points);

  const tt = useChartTooltipState();
  const externalTooltip = useTooltipStyle(CC, {
    external: buildExternalTooltipHandler(tt.setState, (point, title) => ({
      label: `CPI · ${title ?? points[point.dataIndex ?? 0]?.year ?? ''}`,
      value: typeof point.parsed?.y === 'number' ? point.parsed.y : 0,
      unit: '×',
    })),
  });

  const data = {
    labels: points.map(p => String(p.year)),
    datasets: [{
      label: 'CPI',
      data: points.map(p => p.cpi),
      borderColor: CC.amber,
      borderWidth: 1.5,
      pointRadius: 2,
      tension: 0.3,
      fill: false,
    }],
  };

  const refLine = {
    id: 'cpi-today-ref',
    afterDraw(chart: any) {
      const { ctx, scales } = chart;
      const yPx = scales.y.getPixelForValue(TODAYS_MARKET_REFERENCE);
      if (!Number.isFinite(yPx)) return;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = CC.textMuted;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(scales.x.left, yPx);
      ctx.lineTo(scales.x.right, yPx);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CC.textMuted;
      ctx.font = `9px ${CHART_FONT.family}`;
      ctx.textAlign = 'right';
      ctx.fillText('1.0 · today', scales.x.right - 4, yPx - 3);
      ctx.restore();
    },
  };

  const options: any = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: externalTooltip,
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 } },
      },
      y: {
        min, max,
        grid: { color: CC.grid, lineWidth: 0.5 },
        border: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          callback: (v: number | string) => Number(v).toFixed(2) + '×' },
      },
    },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em' }}>
          Capacity-payment compression · KKME proprietary supply-stack model
        </div>
        {codYear && (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
            fontFamily: 'var(--font-mono)' }}>COD {codYear}</div>
        )}
      </div>
      <div style={{ height: 160 }}>
        <Line data={data} plugins={[refLine]} options={options} />
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        cpi at COD applied as multiplier on capacity + balancing revenue
      </div>
      <ChartTooltipPortal tt={tt} />
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

function RevenueChart({ years, CC }: {
  years: YearData[];
  CC: ReturnType<typeof useChartColors>;
  /** Phase 7.7e: tooltip migrated to unified primitive; legacy prop preserved. */
  ts?: unknown;
}) {
  const tt = useChartTooltipState();
  const externalTooltip = useTooltipStyle(CC, {
    external: buildExternalTooltipHandler(tt.setState, (point, title) => {
      const i = point.dataIndex ?? 0;
      const y = years[i];
      const seriesLabels = ['Total', 'Balancing', 'OPEX', 'Fleet S/D'];
      const dsIdx = point.datasetIndex ?? 0;
      const seriesLabel = seriesLabels[dsIdx];
      // datasetIndex 3 = ratio; else € k figures
      const isRatio = dsIdx === 3;
      const value = typeof point.parsed?.y === 'number' ? point.parsed.y : 0;
      return {
        label: `${seriesLabel} · ${title ?? 'Y' + (y?.yr ?? 0)}`,
        value,
        unit: isRatio ? '×' : '€/MW-yr (k)',
        secondary: y && dsIdx === 0 ? [
          { label: 'Trading', value: Math.round(y.rev_trd / MW / 1000), unit: 'k' },
          { label: 'Trading %', value: y.trading_fraction * 100, unit: '%' },
        ] : undefined,
      };
    }),
  });

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
      tooltip: externalTooltip,
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

  return (
    <div style={{ height: 280, position: 'relative' }}>
      <Line data={chartData} options={options} />
      <ChartTooltipPortal tt={tt} />
    </div>
  );
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

      {/* Returns metrics — Project IRR + Equity IRR (7.7.1) + CFADS + Payback + LCOS + MOIC (7.7c) */}
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
        <MetricCell label={STORAGE_METRICS.LCOS.short}
          value={data.lcos_eur_mwh != null ? '€' + data.lcos_eur_mwh.toFixed(0) : '—'}
          methodVersion={data.model_version}
          title={STORAGE_METRICS.LCOS.tooltip}
          sub={STORAGE_METRICS.LCOS.unit} />
        <MetricCell label={STORAGE_METRICS.MOIC.short}
          value={data.moic != null ? formatNumber(data.moic, 'multiple') : '—'}
          methodVersion={data.model_version}
          title={STORAGE_METRICS.MOIC.tooltip}
          sub={STORAGE_METRICS.MOIC.long.toLowerCase()} />
      </div>

      {/* Duration optimizer + DSCR triple panel (7.7c + 7.7.2) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <DurationOptimizer rec={data.duration_recommendation} />
        <DSCRPanel base={data.min_dscr} conservative={data.min_dscr_conservative}
          worstMonth={data.worst_month_dscr} covenant={DEFAULT_DSCR_COVENANT} />
      </div>

      {/* Assumptions panel — RTE / cycles / availability / hold / WACC (7.7.5) */}
      <div style={{ marginBottom: 20 }}>
        <AssumptionsPanel
          panel={data.assumptions_panel}
          rteCurve={data.roundtrip_efficiency_curve}
          calibrationSource={data.engine_calibration_source}
        />
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

      {/* Analytics row — degradation, sensitivity, cannibalization, backtest */}
      <div className="rv-analytics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 24, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-card)' }}>
        <DegradationChart years={data.years} CC={CC} ts={ts} />
        <RevenueSensitivityTornado matrix={data.matrix}
          scenarios={{
            conservative: data.all_scenarios.conservative,
            stress: data.all_scenarios.stress,
          }} />
        {data.fleet_trajectory && data.fleet_trajectory.length > 0 && (
          <CannibalizationChart rows={data.fleet_trajectory}
            codYear={data.cod_year} CC={CC} ts={ts} />
        )}
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
