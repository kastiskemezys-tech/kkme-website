'use client';

import { useState, useEffect } from 'react';
import type { S1Signal, S1CaptureData, DailyCaptureEntry } from '@/lib/signals/s1';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer, DataClassBadge,
} from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { CHART_COLORS, CHART_FONT, tooltipStyle } from '@/app/lib/chartTheme';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler
);

// Extend S1Signal with hourly data present in actual API response
interface S1WithCapture extends S1Signal {
  hourly_lt?: number[];
}

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── Capture-driven sentiment ──────────────────────────────────────────────

function captureSentiment(grossCapture: number): Sentiment {
  if (grossCapture < 10) return 'negative';
  if (grossCapture < 30) return 'neutral';
  if (grossCapture < 60) return 'caution';
  return 'positive';
}

function captureStatus(grossCapture: number): string {
  if (grossCapture < 10) return 'Flat';
  if (grossCapture < 30) return 'Narrow';
  if (grossCapture < 60) return 'Supportive';
  if (grossCapture < 100) return 'Strong';
  return 'Very strong';
}

function captureInterpretation(gross2h: number | null, gross4h: number | null, swing: number | null): string {
  const g = gross4h ?? gross2h;
  if (g == null) return 'Capture data not yet available. Awaiting first computation from LT day-ahead prices.';
  if (g < 10) return 'Today\'s DA price shape offers little arbitrage opportunity. Flat profiles limit the DA capture component of storage revenue.';
  if (g < 30) return 'Modest DA price separation. Day-ahead capture contributes but is not the primary revenue driver at these levels.';
  if (g < 60) return 'Clear DA price separation. The day-ahead capture component is meaningful — though realized revenue depends on reserve commitments and dispatch.';
  if (g < 100) return 'Wide DA price separation. The theoretical day-ahead capture is strong — actual revenue will be lower after reserve drag and partial cycling.';
  return 'Exceptional DA price volatility. Gross capture is well above seasonal norms — likely driven by weather or outage events. Not representative of sustained revenue.';
}

function captureImpact2H(gross2h: number | null): string {
  const g = gross2h ?? 0;
  if (g < 10) return `2H: Weak DA capture (€${safeNum(g, 0)}/MWh gross)`;
  if (g < 30) return `2H: Modest DA capture (€${safeNum(g, 0)}/MWh gross)`;
  if (g < 60) return `2H: Supportive DA capture (€${safeNum(g, 0)}/MWh gross)`;
  return `2H: Strong DA capture (€${safeNum(g, 0)}/MWh gross)`;
}

function captureImpact4H(gross4h: number | null): string {
  const g = gross4h ?? 0;
  if (g < 10) return `4H: Weak DA capture (€${safeNum(g, 0)}/MWh gross)`;
  if (g < 30) return `4H: Modest DA capture (€${safeNum(g, 0)}/MWh gross)`;
  if (g < 60) return `4H: Supportive DA capture (€${safeNum(g, 0)}/MWh gross)`;
  return `4H: Strong DA capture (€${safeNum(g, 0)}/MWh gross)`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function S1Card() {
  const { status, data } = useSignal<S1WithCapture>(`${WORKER_URL}/read`);
  const [captureData, setCaptureData] = useState<S1CaptureData | null>(null);
  const [duration, setDuration] = useState<'2h' | '4h'>('4h');
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  // Fetch full capture data
  useEffect(() => {
    fetch(`${WORKER_URL}/s1/capture`)
      .then(r => r.ok ? r.json() : null)
      .then((d: S1CaptureData | null) => { if (d) setCaptureData(d); })
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '1rem', width: '50%', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '2rem', width: '35%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.75rem', width: '60%', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '100px', width: '100%' }} />
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Price data unavailable
        </p>
      </article>
    );
  }

  // Capture values — from embedded capture or full capture endpoint
  const cap = data.capture;
  const grossToday = duration === '2h' ? (cap?.gross_2h ?? null) : (cap?.gross_4h ?? null);
  const netToday = duration === '2h' ? (cap?.net_2h ?? null) : (cap?.net_4h ?? null);
  const rolling = duration === '2h' ? cap?.rolling_30d?.stats_2h : cap?.rolling_30d?.stats_4h;
  const swing = cap?.shape_swing ?? data.lt_daily_swing_eur_mwh ?? null;

  // History for chart — from capture endpoint
  const history = captureData?.history ?? [];
  const historyField = duration === '2h' ? 'gross_2h' : 'gross_4h';

  // Price shape — from capture endpoint
  const shape = captureData?.shape ?? null;

  // Monthly — from capture endpoint
  const monthly = captureData?.monthly ?? [];

  // Spread (demoted to drawer)
  const spread = data.spread_eur_mwh;

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
          Day-ahead arbitrage capture
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          What a storage asset could capture from today&apos;s LT day-ahead price shape using perfect-foresight dispatch.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Lithuania · energy-charts.info day-ahead prices
        </p>
      </div>

      {/* DURATION TOGGLE */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '12px',
        background: 'var(--bg-elevated)',
        borderRadius: '4px',
        padding: '2px',
        width: 'fit-content',
      }}>
        {(['2h', '4h'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            style={{
              all: 'unset',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              padding: '4px 12px',
              borderRadius: '3px',
              cursor: 'pointer',
              color: duration === d ? 'var(--text-primary)' : 'var(--text-muted)',
              background: duration === d ? 'var(--border-card)' : 'transparent',
              transition: 'all 150ms ease',
              letterSpacing: '0.04em',
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* HERO METRIC — gross capture */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <MetricTile
          label={`Gross DA capture (${duration})`}
          value={grossToday != null ? `€${safeNum(grossToday, 1)}` : '—'}
          unit="/MWh"
          size="hero"
          dataClass="derived"
          sublabel="From observed DA prices · perfect-foresight dispatch"
        />
        <StatusChip
          status={grossToday != null ? captureStatus(grossToday) : 'Pending'}
          sentiment={grossToday != null ? captureSentiment(grossToday) : 'neutral'}
        />
      </div>

      {/* 30-DAY CAPTURE CHART */}
      {history.length > 1 && (() => {
        const chartEntries = history.filter((h: DailyCaptureEntry) => h[historyField as keyof DailyCaptureEntry] != null);
        if (chartEntries.length < 2) return null;

        const labels = chartEntries.map((h: DailyCaptureEntry) => {
          const d = new Date(h.date + 'T00:00:00');
          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        });

        const values = chartEntries.map((h: DailyCaptureEntry) => h[historyField as keyof DailyCaptureEntry] as number);
        const median = rolling?.p50 ?? null;

        const barColors = values.map(v =>
          v >= 60 ? CHART_COLORS.teal :
          v >= 30 ? CHART_COLORS.tealLight :
          v >= 10 ? CHART_COLORS.amberLight :
          CHART_COLORS.roseLight
        );

        return (
          <div style={{ margin: '16px 0' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              DA gross capture by day
              <DataClassBadge dataClass="derived" />
            </div>
            <div style={{ position: 'relative', height: '200px' }}>
              <Bar
                data={{
                  labels,
                  datasets: [{
                    label: `Gross ${duration}`,
                    data: values,
                    backgroundColor: barColors,
                    borderWidth: 0,
                    borderSkipped: false as const,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...tooltipStyle,
                      callbacks: {
                        title: (items) => items[0].label.toUpperCase(),
                        label: (item) => {
                          const v = item.raw as number;
                          return `Gross ${duration}  €${v.toFixed(1)}/MWh`;
                        },
                        footer: (items) => {
                          const idx = items[0].dataIndex;
                          const entry = chartEntries[idx];
                          const lines = [];
                          if (entry.swing != null) lines.push(`Swing     €${Math.round(entry.swing)}/MWh`);
                          return lines.join('\n');
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      border: { color: 'rgba(232,226,217,0.08)' },
                      ticks: {
                        color: CHART_COLORS.textMuted,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxRotation: 0,
                        callback: (_, i) => {
                          const step = Math.max(1, Math.floor(chartEntries.length / 5));
                          return i % step === 0 ? labels[i] : '';
                        },
                      },
                    },
                    y: {
                      grid: { color: CHART_COLORS.grid, lineWidth: 0.5 },
                      border: { display: false },
                      ticks: {
                        color: CHART_COLORS.textMuted,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxTicksLimit: 5,
                        callback: (v) => `€${v}`,
                      },
                    },
                  },
                }}
              />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              marginTop: '4px',
            }}>
              <span>{chartEntries.length} days</span>
              {median != null && (
                <span>30-day median DA capture €{safeNum(median, 0)}/MWh</span>
              )}
              <span>today</span>
            </div>
          </div>
        );
      })()}

      {/* PRICE SHAPE STRIP — today's hourly profile */}
      {shape && shape.hourly_profile && shape.hourly_profile.length >= 12 && (() => {
        const profile = shape.hourly_profile;
        const maxP = Math.max(...profile);
        const minP = Math.min(...profile);
        const range = maxP - minP || 1;

        return (
          <div style={{ margin: '12px 0' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.04em',
              marginBottom: '6px',
            }}>
              Today&apos;s DA price shape
            </p>
            <div style={{ display: 'flex', gap: '1px', alignItems: 'flex-end', height: '32px' }}>
              {profile.map((p: number, i: number) => {
                const h = Math.max(4, ((p - minP) / range) * 28);
                const isCharge = p <= minP + range * 0.15;
                const isDischarge = p >= maxP - range * 0.15;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}px`,
                      background: isCharge ? 'var(--teal)' :
                        isDischarge ? 'var(--amber)' : 'var(--bg-elevated)',
                      opacity: isCharge || isDischarge ? 0.8 : 1,
                      borderRadius: '1px',
                    }}
                    title={`${String(i).padStart(2, '0')}:00 — €${p}/MWh`}
                  />
                );
              })}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '4px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--teal)' }}>■ Charge</span>
                <span style={{ color: 'var(--amber)' }}>■ Discharge</span>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>
                Peak-to-trough €{safeNum(shape.swing, 0)}/MWh
              </span>
            </div>
          </div>
        );
      })()}

      {/* EXCLUDED ITEMS BOX */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
        marginBottom: '8px',
        paddingLeft: '12px',
        borderLeft: '1px solid var(--amber-subtle)',
      }}>
        Gross DA capture only. Excludes: reserve drag, partial cycles, RTE losses, intraday re-optimization, grid fees, imbalance risk.
      </div>

      {/* INTERPRETATION */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginBottom: '8px',
      }}>
        {captureInterpretation(cap?.gross_2h ?? null, cap?.gross_4h ?? null, swing)}
      </p>

      {/* IMPACT LINE — split 2H / 4H */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--teal-strong)',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        <span>Reference asset: {captureImpact2H(cap?.gross_2h ?? null)}</span>
        <span>Reference asset: {captureImpact4H(cap?.gross_4h ?? null)}</span>
      </div>

      {/* SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="energy-charts.info · ENTSO-E A44"
          updatedAt={data.updated_at ? new Date(data.updated_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="derived from observed DA prices"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>

          {/* ── Capture detail ── */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '8px',
          }}>
            Capture detail
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '14px', marginBottom: '20px',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {netToday != null ? `€${safeNum(netToday, 1)}` : '—'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                Net capture ({duration}) after RTE
              </div>
            </div>
            {rolling && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  €{safeNum(rolling.p50, 0)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>/MWh</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  30-day median gross ({duration})
                </div>
              </div>
            )}
            {swing != null && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  €{safeNum(swing, 0)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>/MWh</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Peak-to-trough swing
                </div>
              </div>
            )}
            {shape && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {String(shape.peak_hour).padStart(2, '0')}:00 / {String(shape.trough_hour).padStart(2, '0')}:00
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Peak / trough hour
                </div>
              </div>
            )}
          </div>

          {/* ── Gross-to-net bridge ── */}
          {captureData?.gross_to_net && captureData.gross_to_net.length > 0 && (
            <>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Gross-to-net bridge (indicative)
              </p>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
                marginBottom: '20px',
              }}>
                {captureData.gross_to_net.map((line, i) => {
                  const classLabel = line.type === 'base' ? 'observed'
                    : line.type === 'deduction' ? 'assumed'
                    : 'modeled';
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 0',
                      color: line.type === 'result' ? 'var(--text-secondary)' :
                        line.type === 'deduction' ? 'var(--rose)' : 'var(--text-secondary)',
                      borderTop: line.type === 'result' ? '1px solid var(--border-card)' : 'none',
                      fontWeight: line.type === 'result' ? 500 : 400,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {line.label}
                        <span style={{
                          fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
                          opacity: 0.7,
                        }}>{classLabel}</span>
                      </span>
                      <span>{line.value >= 0 ? '' : '−'}€{safeNum(Math.abs(line.value), 2)}/MWh</span>
                    </div>
                  );
                })}
                <p style={{
                  fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
                  marginTop: '6px', lineHeight: 1.4,
                }}>
                  Net is modeled, not measured. Excludes reserve drag, partial cycles, grid fees, imbalance. Realized capture is typically 40–65% of gross.
                </p>
              </div>
            </>
          )}

          {/* ── Cross-border spread (demoted) ── */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '8px',
          }}>
            Cross-border price spread
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>LT average</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.lt_avg_eur_mwh, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>SE4 average</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.se4_avg_eur_mwh, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Spread</span>
            <span style={{ color: 'var(--text-secondary)' }}>{spread >= 0 ? '+' : ''}{safeNum(spread, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Separation</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.separation_pct, 1)}% vs SE4</span>
            {data.p_high_avg != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>P_high (top-4h)</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.p_high_avg, 1)} €/MWh</span>
              </>
            )}
            {data.p_low_avg != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>P_low (bottom-4h)</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.p_low_avg, 1)} €/MWh</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '20px' }}>
            <DataClassBadge dataClass="observed" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
              ENTSO-E A44 day-ahead prices
            </span>
          </div>

          {/* ── Monthly seasonal view ── */}
          {monthly.length > 1 && (
            <>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Monthly capture ({duration})
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto',
                gap: '4px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
                marginBottom: '20px',
              }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Month</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Gross</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Net</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Days</span>
                {monthly.slice(-6).map(m => {
                  const gVal = duration === '2h' ? m.avg_gross_2h : m.avg_gross_4h;
                  const nVal = duration === '2h' ? m.avg_net_2h : m.avg_net_4h;
                  return (
                    <div key={m.month} style={{ display: 'contents' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{m.month}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {gVal != null ? `€${safeNum(gVal, 1)}` : '—'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {nVal != null ? `€${safeNum(nVal, 1)}` : '—'}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{m.days}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── DA tomorrow ── */}
          {data.da_tomorrow?.lt_peak != null && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', marginBottom: '20px',
            }}>
              Tomorrow DA: {safeNum(data.da_tomorrow.lt_peak, 0)} peak · {safeNum(data.da_tomorrow.lt_avg, 0)} avg €/MWh
              {data.da_tomorrow.delivery_date && ` · ${data.da_tomorrow.delivery_date}`}
            </div>
          )}

          {/* ── Market context ── */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '6px',
          }}>
            Market context
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px',
          }}>
            {[
              { period: 'Feb 2025', note: 'Baltic synchronization with Continental Europe' },
              { period: 'Oct 2025', note: 'NordBalt maintenance — reduced SE4 coupling, wider LT spreads' },
              { period: 'Summer', note: 'Solar suppresses midday DA prices — deeper charge trough, higher gross capture' },
              { period: 'Winter', note: 'Heating demand + low renewables — elevated peak prices widen spreads' },
            ].map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-tertiary)', minWidth: '64px', flexShrink: 0 }}>{e.period}</span>
                <span>{e.note}</span>
              </div>
            ))}
          </div>

          {/* ── Methodology ── */}
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '4px', opacity: 0.7,
          }}>
            Methodology
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', lineHeight: 1.5, opacity: 0.6,
          }}>
            Perfect-foresight sort-and-dispatch on LT DA prices ({captureData?.resolution ?? '15min'} resolution where available, hourly for data before mid-2025). Picks cheapest {duration === '2h' ? '2' : '4'} hours to charge, most expensive {duration === '2h' ? '2' : '4'} to discharge. Single cycle per day. RTE {duration === '2h' ? '87.5' : '87.0'}% (assumed). This is gross market opportunity from observed prices — not realized asset revenue. Does not model reserve commitment, partial cycles, or intraday re-optimization.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
