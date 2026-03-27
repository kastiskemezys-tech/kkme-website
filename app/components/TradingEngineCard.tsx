'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
  DataClassBadge, ConfidenceBadge,
} from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── types matching actual API response ────────────────────────────────────

interface HourlyEntry {
  hour: number;
  da_price: number;
  revenue: {
    capacity: number;
    activation: number;
    arbitrage: number;
    total: number;
  };
  avg_soc: number;
  activations: number;
}

interface TradingTotals {
  gross: number;
  per_mw: number;
  capacity: number;
  activation: number;
  arbitrage: number;
  splits_pct: {
    capacity: number;
    activation: number;
    arbitrage: number;
  };
  annualised: number;
  annualised_per_mw: number;
}

interface DaArbSignal {
  charge_hours: number[];
  discharge_hours: number[];
  avg_charge_price: number;
  avg_discharge_price: number;
  net_capture: number;
  confidence: string;
  data_class: string;
}

interface DrrDistortion {
  note: string;
  derogation_expires: string;
  extension_possible: string;
  impact: string;
  data_class: string;
}

interface TradingSignals {
  da_arb: DaArbSignal;
  imbalance_bias: string;
  activation_probability: number;
  drr_distortion: DrrDistortion;
}

interface TradingStrategy {
  peak_offpeak_ratio: number;
  activation_rate_pct: number;
  soc_range: [number, number];
  fcr_baseload_mw: number;
}

interface TradingMeta {
  date: string;
  computed: string;
  battery: string;
  data_sources: string[];
  note: string;
  data_class: string;
  kruonis_disaggregation?: string;
}

interface TradingData {
  _meta: TradingMeta;
  dispatch: {
    isps: number;
    hourly: HourlyEntry[];
  };
  totals: TradingTotals;
  strategy: TradingStrategy;
  signals: TradingSignals;
}

interface HistoryEntry {
  date: string;
  totals: TradingTotals;
  strategy: TradingStrategy;
  signals: TradingSignals;
}

// ── helpers ───────────────────────────────────────────────────────────────

function revenueSentiment(annualisedPerMw: number): Sentiment {
  if (annualisedPerMw > 200000) return 'positive';
  if (annualisedPerMw > 100000) return 'caution';
  return 'negative';
}

function revenueStatus(annualisedPerMw: number): string {
  if (annualisedPerMw > 200000) return 'Strong revenue';
  if (annualisedPerMw > 100000) return 'Moderate';
  return 'Below target';
}

function revenueInterpretation(data: TradingData): string {
  const perMw = data.totals.per_mw;
  const annK = Math.round(data.totals.annualised_per_mw / 1000);
  const actRate = data.strategy.activation_rate_pct;
  const arbNeg = data.totals.arbitrage < 0;

  if (annK > 250) {
    return `Daily dispatch revenue of €${Math.round(perMw)}/MW annualises to €${annK}k/MW — well above the €200k threshold for strong storage economics. Activation rate at ${safeNum(actRate, 0)}% of settlement periods indicates consistent balancing demand.`;
  }
  if (annK > 150) {
    return `Revenue of €${Math.round(perMw)}/MW/day (€${annK}k annualised) supports base-case storage economics. ${arbNeg ? 'Day-ahead arbitrage is negative today, with revenue driven by capacity and activation payments.' : 'Arbitrage contributes modestly alongside capacity payments.'}`;
  }
  return `Daily revenue of €${Math.round(perMw)}/MW (€${annK}k annualised) is below the €200k threshold for strong returns. ${actRate < 30 ? 'Low activation rates suggest limited balancing demand today.' : 'Activation rates remain healthy but price levels are compressed.'}`;
}

function impactDescription(annualisedPerMw: number): string {
  if (annualisedPerMw > 200000) return '50MW reference asset: Strong revenue day — supports base-case IRR above 12%';
  if (annualisedPerMw > 100000) return '50MW reference asset: Moderate revenue — consistent with conservative-case projections';
  return '50MW reference asset: Below-target revenue — stress-case economics if sustained';
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

// ── skeleton loading ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <article style={{ width: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <div className="skeleton" style={{ height: '1rem', width: '50%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.75rem', width: '75%' }} />
      </div>
      <div className="skeleton" style={{ height: '2.5rem', width: '35%', marginBottom: '8px' }} />
      <div className="skeleton" style={{ height: '0.875rem', width: '45%', marginBottom: '16px' }} />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: '1.5rem', width: '22%', borderRadius: '3px' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: '120px', width: '100%', marginBottom: '16px' }} />
      <div className="skeleton" style={{ height: '40px', width: '100%', marginBottom: '16px' }} />
      <div className="skeleton" style={{ height: '0.875rem', width: '80%' }} />
    </article>
  );
}

// ── 24-hour revenue bar chart ─────────────────────────────────────────────

function HourlyBars({ hourly, date }: { hourly: HourlyEntry[]; date?: string }) {
  if (!hourly || hourly.length === 0) return null;

  const maxTotal = Math.max(...hourly.map(h => Math.abs(h.revenue.total)), 1);
  // Use a wider viewBox with left margin for Y-axis and bottom for labels
  const leftM = 14;
  const chartW = 96;
  const chartH = 100;
  const labelH = 10;
  const vbW = leftM + chartW;
  const vbH = chartH + labelH + 2;
  const barW = chartW / 24;
  const maxEur = Math.round(maxTotal);

  // Format date for title
  const dateLabel = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return (
    <div style={{ margin: '16px 0' }}>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ width: '100%', height: '200px', display: 'block' }}
      >
        {/* Y-axis max label */}
        <text x={leftM - 1} y={6} textAnchor="end" fill="var(--text-muted)"
          style={{ fontSize: '3px', fontFamily: 'var(--font-mono)' }}>
          €{maxEur > 999 ? `${(maxEur / 1000).toFixed(1)}k` : maxEur}
        </text>
        {/* Y-axis mid gridline */}
        <line x1={leftM} y1={chartH / 2} x2={leftM + chartW} y2={chartH / 2}
          stroke="var(--border-card)" strokeWidth={0.3} />
        <text x={leftM - 1} y={chartH / 2 + 1.5} textAnchor="end" fill="var(--text-muted)"
          style={{ fontSize: '2.5px', fontFamily: 'var(--font-mono)' }}>
          €{Math.round(maxEur / 2)}
        </text>
        {/* Y-axis baseline */}
        <line x1={leftM} y1={chartH} x2={leftM + chartW} y2={chartH}
          stroke="var(--border-card)" strokeWidth={0.3} />

        {/* Bars */}
        {hourly.map((h) => {
          const cap = Math.max(0, h.revenue.capacity);
          const act = Math.max(0, h.revenue.activation);
          const arb = h.revenue.arbitrage;
          const x = leftM + h.hour * barW;
          // Min bar height of 1.5 for nonzero values
          const capH = cap > 0 ? Math.max(1.5, (cap / maxTotal) * chartH) : 0;
          const actH = act > 0 ? Math.max(1.5, (act / maxTotal) * chartH) : 0;
          const arbH = Math.abs(arb) > 0 ? Math.max(1.5, (Math.abs(arb) / maxTotal) * chartH) : 0;

          return (
            <g key={h.hour}>
              {/* Capacity — base, dimmer */}
              {capH > 0 && <rect x={x + 0.25} y={chartH - capH} width={barW - 0.5} height={capH}
                fill="var(--teal)" opacity={0.4} />}
              {/* Activation — brighter */}
              {actH > 0 && <rect x={x + 0.25} y={chartH - capH - actH} width={barW - 0.5} height={actH}
                fill="var(--teal)" opacity={1} />}
              {/* Arbitrage */}
              {arbH > 0 && <rect x={x + 0.25}
                y={arb > 0 ? chartH - capH - actH - arbH : chartH - capH - actH - arbH}
                width={barW - 0.5} height={arbH}
                fill={arb > 0 ? 'var(--amber)' : 'var(--rose)'} opacity={1} />}
              {/* Hour labels every 3 hours */}
              {h.hour % 3 === 0 && (
                <text x={x + barW / 2} y={chartH + labelH}
                  textAnchor="middle" fill="var(--text-muted)"
                  style={{ fontSize: '2.8px', fontFamily: 'var(--font-mono)' }}>
                  {String(h.hour).padStart(2, '0')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{
        display: 'flex', gap: '14px', marginTop: '6px',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)', alignItems: 'center',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '1px', background: 'var(--teal)', opacity: 0.4 }} />Capacity
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '1px', background: 'var(--teal)', opacity: 1 }} />Activation
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '1px', background: 'var(--amber)' }} />Arbitrage
        </span>
        {dateLabel && <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>{dateLabel}</span>}
      </div>
    </div>
  );
}

// ── 7-day sparkline ───────────────────────────────────────────────────────

function WeekSparkline({ history }: { history: HistoryEntry[] }) {
  if (history.length < 3) {
    return (
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        margin: '8px 0',
      }}>
        Accumulating data — chart populates in 3–5 days.
      </p>
    );
  }

  const values = history.map(h => h.totals.per_mw);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const minIdx = values.indexOf(minVal);
  const maxIdx = values.indexOf(maxVal);

  // Layout: left margin for Y labels, right margin, top for labels, bottom for dates
  const leftM = 16;
  const rightM = 2;
  const topM = 8;
  const bottomM = 10;
  const chartW = 100 - leftM - rightM;
  const chartH = 32;
  const vbW = 100;
  const vbH = topM + chartH + bottomM;

  const isWeekend = (dateStr: string) => {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6;
  };

  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getXY = (i: number) => {
    const x = leftM + (values.length > 1 ? (i / (values.length - 1)) * chartW : chartW / 2);
    const y = topM + (1 - (values[i] - minVal) / range) * chartH;
    return { x, y };
  };

  const linePoints = values.map((_, i) => {
    const { x, y } = getXY(i);
    return `${x},${y}`;
  });
  const areaPoints = [
    `${leftM},${topM + chartH}`,
    ...linePoints,
    `${leftM + chartW},${topM + chartH}`,
  ].join(' ');

  return (
    <div style={{ margin: '8px 0' }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: '80px', display: 'block' }}>
        {/* Weekend shading */}
        {history.map((h, i) => {
          if (!isWeekend(h.date)) return null;
          const { x } = getXY(i);
          const halfStep = values.length > 1 ? (chartW / (values.length - 1)) / 2 : chartW / 2;
          return (
            <rect key={`we-${i}`} x={x - halfStep} y={topM} width={halfStep * 2} height={chartH}
              fill="var(--text-muted)" opacity={0.04} />
          );
        })}

        {/* Horizontal gridline at midpoint */}
        <line x1={leftM} y1={topM + chartH / 2} x2={leftM + chartW} y2={topM + chartH / 2}
          stroke="var(--border-card)" strokeWidth={0.3} />

        {/* Y-axis labels */}
        <text x={leftM - 1} y={topM + 2} textAnchor="end" fill="var(--text-muted)"
          style={{ fontSize: '2.8px', fontFamily: 'var(--font-mono)' }}>
          €{Math.round(maxVal)}
        </text>
        <text x={leftM - 1} y={topM + chartH + 1} textAnchor="end" fill="var(--text-muted)"
          style={{ fontSize: '2.8px', fontFamily: 'var(--font-mono)' }}>
          €{Math.round(minVal)}
        </text>

        {/* Area fill + line */}
        <polygon points={areaPoints} fill="var(--teal)" opacity={0.08} />
        <polyline points={linePoints.join(' ')} fill="none"
          stroke="var(--teal)" strokeWidth="0.7" opacity={0.7} />

        {/* Data point dots */}
        {values.map((_, i) => {
          const { x, y } = getXY(i);
          const weekend = isWeekend(history[i].date);
          const isExtreme = i === minIdx || i === maxIdx;
          return (
            <circle key={i} cx={x} cy={y} r={isExtreme ? 1.5 : 1}
              fill={isExtreme ? (i === maxIdx ? 'var(--teal)' : 'var(--rose)') : 'var(--teal)'}
              opacity={weekend ? 0.4 : 0.85} />
          );
        })}

        {/* Max label */}
        {(() => {
          const { x, y } = getXY(maxIdx);
          return (
            <text x={x} y={y - 2.5} textAnchor="middle" fill="var(--teal)"
              style={{ fontSize: '2.8px', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              ▲ €{Math.round(maxVal)}/MW
            </text>
          );
        })()}
        {/* Min label */}
        {(() => {
          const { x, y } = getXY(minIdx);
          return (
            <text x={x} y={y + 4.5} textAnchor="middle" fill="var(--rose)"
              style={{ fontSize: '2.8px', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              ▼ €{Math.round(minVal)}/MW
            </text>
          );
        })()}

        {/* X-axis date labels */}
        {history.map((h, i) => {
          const { x } = getXY(i);
          // Show all dates if <= 7, else every other
          if (history.length > 7 && i % 2 !== 0 && i !== history.length - 1) return null;
          return (
            <text key={`d-${i}`} x={x} y={topM + chartH + bottomM - 1}
              textAnchor="middle" fill={isWeekend(h.date) ? 'var(--text-muted)' : 'var(--text-tertiary)'}
              style={{ fontSize: '2.5px', fontFamily: 'var(--font-mono)' }}>
              {fmtDate(h.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export function TradingEngineCard() {
  const { status, data } = useSignal<TradingData>(`${WORKER_URL}/api/trading/latest`);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  useEffect(() => {
    fetch(`${WORKER_URL}/api/trading/history?days=7`)
      .then(r => r.json())
      .then((h: HistoryEntry[]) => setHistory(Array.isArray(h) ? h : []))
      .catch(() => {});
  }, []);

  // ── loading state ────────────────────────────────────────────────────
  if (status === 'loading') {
    return <LoadingSkeleton />;
  }

  // ── calibrating / error state ────────────────────────────────────────
  if (status === 'error' || !data || !data.totals) {
    return (
      <article style={{ width: '100%' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9375rem',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '6px',
          }}>
            Dispatch intelligence
          </h3>
        </div>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          Calibrating — first analysis available within 48h.
        </p>
      </article>
    );
  }

  // ── derived values ───────────────────────────────────────────────────
  const { totals, signals, strategy, dispatch } = data;
  const annPerMw = totals.annualised_per_mw;
  const sentiment = revenueSentiment(annPerMw);
  const hourly = dispatch?.hourly ?? [];
  const avgAct = hourly.length > 0
    ? hourly.reduce((s, h) => s + h.revenue.activation, 0) / hourly.length
    : 0;

  return (
    <article style={{ width: '100%' }}>
      {/* HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3
          onClick={openDrawer}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9375rem',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '6px',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          Dispatch intelligence
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Optimal BESS revenue allocation across Baltic balancing products and day-ahead arbitrage.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Lithuania-led · BTD + ENTSO-E calibrated · {data._meta?.date}
        </p>
      </div>

      {/* HERO METRIC */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <MetricTile
          label="Daily revenue per MW"
          value={`€${safeNum(totals.per_mw, 0)}`}
          unit="/MW/day"
          size="hero"
          dataClass="derived"
        />
        <StatusChip status={revenueStatus(annPerMw)} sentiment={sentiment} />
      </div>

      {/* Annualised helper */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        marginBottom: '16px',
      }}>
        Annualised: €{Math.round(annPerMw / 1000)}k/MW/yr
      </p>

      {/* SUB-METRICS PILLS */}
      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap',
        marginBottom: '16px',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-secondary)',
          background: 'var(--bg-elevated)',
          padding: '3px 8px', borderRadius: '3px',
          border: '1px solid var(--border-card)',
        }}>
          Gross: €{totals.gross.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-secondary)',
          background: 'var(--bg-elevated)',
          padding: '3px 8px', borderRadius: '3px',
          border: '1px solid var(--border-card)',
        }}>
          Capacity: {totals.splits_pct.capacity}%
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-secondary)',
          background: 'var(--bg-elevated)',
          padding: '3px 8px', borderRadius: '3px',
          border: '1px solid var(--border-card)',
        }}>
          Activation: {totals.splits_pct.activation}%
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: totals.splits_pct.arbitrage < 0 ? 'var(--rose)' : 'var(--text-secondary)',
          background: 'var(--bg-elevated)',
          padding: '3px 8px', borderRadius: '3px',
          border: `1px solid ${totals.splits_pct.arbitrage < 0 ? 'var(--rose)' : 'var(--border-card)'}`,
          opacity: totals.splits_pct.arbitrage < 0 ? 0.85 : 1,
        }}>
          Arbitrage: {totals.splits_pct.arbitrage}%
        </span>
        {strategy.fcr_baseload_mw === 0 && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--amber)',
            background: 'var(--bg-elevated)',
            padding: '3px 8px', borderRadius: '3px',
            border: '1px dashed var(--amber)',
            opacity: 0.85,
          }}>
            FCR ⚠ DRR
          </span>
        )}
      </div>

      {/* 24-HOUR REVENUE BARS */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: '4px',
      }}>
        24-hour dispatch profile
      </p>
      <HourlyBars hourly={hourly} date={data._meta?.date} />

      {/* 7-DAY SPARKLINE */}
      {history.length > 0 && (
        <>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginTop: '12px',
            marginBottom: '4px',
          }}>
            7-day revenue trend (€/MW/day)
          </p>
          <WeekSparkline history={history} />
        </>
      )}

      {/* INTERPRETATION */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginTop: '12px',
        marginBottom: '8px',
      }}>
        {revenueInterpretation(data)}
      </p>

      {/* DRR DISTORTION NOTE */}
      {signals.drr_distortion && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--amber)',
          borderRadius: '3px',
          padding: '8px 12px',
          marginBottom: '12px',
          lineHeight: 1.5,
          opacity: 0.9,
        }}>
          <span style={{ color: 'var(--amber)' }}>⚠</span>{' '}
          FCR revenue = €0. Baltic FCR covered by TSO resources (DRR) at zero price.
          Capacity prices reflect DRR-distorted market. Derogation expires ~{signals.drr_distortion.derogation_expires}.
        </div>
      )}

      {/* IMPACT LINE */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--teal-strong)',
        marginBottom: '16px',
      }}>
        {impactDescription(annPerMw)}
      </div>

      {/* SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="BTD + ENTSO-E A44"
          updatedAt={data._meta?.computed ? new Date(data._meta.computed).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="derived"
        />
      </button>

      {/* DOWNLOAD LINKS */}
      <div style={{
        display: 'flex', gap: '8px', marginTop: '8px',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
      }}>
        <a href={`${WORKER_URL}/api/trading/export?format=csv&days=7`}
          style={{ color: 'var(--teal)', textDecoration: 'none' }}
          download>↓ CSV (7d)</a>
        <a href={`${WORKER_URL}/api/trading/export?format=json&days=7`}
          style={{ color: 'var(--teal)', textDecoration: 'none' }}
          target="_blank" rel="noopener noreferrer">↓ JSON (7d)</a>
        <a href={`${WORKER_URL}/api/trading/export?format=csv&days=30`}
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          download>↓ CSV (30d)</a>
      </div>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>

          {/* DISPATCH SIGNALS */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Dispatch signals
          </p>

          {/* DA Arbitrage */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '6px',
            marginBottom: '16px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>DA Arbitrage</span>
              <span style={{ color: 'var(--teal)' }}>
                CHARGE {signals.da_arb.charge_hours.map(fmtHour).join(', ')}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <span style={{ color: 'var(--amber)' }}>
                DISCHARGE {signals.da_arb.discharge_hours.map(fmtHour).join(', ')}
              </span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Capture €{safeNum(signals.da_arb.net_capture, 0)}/MWh
              </span>
              <ConfidenceBadge
                level={signals.da_arb.confidence.toLowerCase() as 'high' | 'medium' | 'low'}
              />
              <DataClassBadge dataClass={signals.da_arb.data_class as 'derived' | 'observed' | 'proxy' | 'modeled' | 'reference'} />
            </div>
          </div>

          {/* Imbalance bias */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            marginBottom: '12px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Imbalance bias</span>
            <span style={{
              color: signals.imbalance_bias === 'SHORT' ? 'var(--rose)' :
                signals.imbalance_bias === 'LONG' ? 'var(--teal)' : 'var(--text-secondary)',
            }}>
              {signals.imbalance_bias}
            </span>
          </div>

          {/* Activation probability */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Activation probability</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {safeNum((signals.activation_probability ?? 0) * 100, 0)}% of ISPs
            </span>
          </div>

          {/* STRATEGY SUMMARY */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Strategy parameters
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Peak/off-peak ratio</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(strategy.peak_offpeak_ratio, 2)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Activation rate</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(strategy.activation_rate_pct, 1)}%</span>
            <span style={{ color: 'var(--text-muted)' }}>SoC range</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {safeNum((strategy.soc_range?.[0] ?? 0) * 100, 0)}% – {safeNum((strategy.soc_range?.[1] ?? 0) * 100, 0)}%
            </span>
            <span style={{ color: 'var(--text-muted)' }}>FCR baseload</span>
            <span style={{ color: strategy.fcr_baseload_mw === 0 ? 'var(--amber)' : 'var(--text-secondary)' }}>
              {strategy.fcr_baseload_mw} MW {strategy.fcr_baseload_mw === 0 ? '(DRR distortion)' : ''}
            </span>
          </div>

          {/* HOURLY DATA TABLE */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Hourly dispatch detail
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              borderCollapse: 'collapse',
              width: '100%',
            }}>
              <thead>
                <tr>
                  {['Hour', 'DA€', 'Cap€', 'Act€', 'Arb€', 'SoC%', 'Total€'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '4px 6px',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-card)',
                      fontWeight: 400,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hourly.map(h => {
                  const highAct = h.revenue.activation > avgAct * 2;
                  return (
                    <tr key={h.hour} style={{
                      background: highAct ? 'var(--bg-elevated)' : 'transparent',
                    }}>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{String(h.hour).padStart(2, '0')}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{safeNum(h.da_price, 1)}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{safeNum(h.revenue.capacity, 0)}</td>
                      <td style={{ padding: '3px 6px', color: highAct ? 'var(--teal)' : 'var(--text-secondary)' }}>{safeNum(h.revenue.activation, 0)}</td>
                      <td style={{ padding: '3px 6px', color: h.revenue.arbitrage < 0 ? 'var(--rose)' : 'var(--text-secondary)' }}>{safeNum(h.revenue.arbitrage, 0)}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{safeNum(h.avg_soc * 100, 0)}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{safeNum(h.revenue.total, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* METHODOLOGY */}
          <div style={{ marginTop: '20px' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '4px',
              opacity: 0.7,
            }}>
              Methodology
            </p>
            <p style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              opacity: 0.8,
            }}>
              KKME&apos;s dispatch algorithm computes optimal BESS allocation across Baltic balancing products (aFRR, mFRR) and day-ahead arbitrage for each 15-minute settlement period. Revenue decomposes into capacity payments, activation payments, and arbitrage. Calibrated on observed market data via BTD clearing prices and ENTSO-E day-ahead prices. FCR revenue currently €0 — Baltic FCR is covered by TSO demand reduction resources under a temporary derogation expiring ~Feb 2028.
            </p>
          </div>

          {/* DRR Impact detail */}
          {signals.drr_distortion && (
            <div style={{ marginTop: '16px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                opacity: 0.6,
              }}>
                DRR extension possible until {signals.drr_distortion.extension_possible}. {signals.drr_distortion.impact}.
              </p>
            </div>
          )}
        </DetailsDrawer>
      </div>

      {/* MODEL INPUT footer */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-ghost)',
        marginTop: '8px',
        letterSpacing: '0.06em',
      }}>
        MODEL INPUT → Revenue Engine dispatch assumptions, activation rates, capacity allocation
      </p>
    </article>
  );
}

export default TradingEngineCard;
