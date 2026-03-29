'use client';

import { useState, useEffect } from 'react';
import type { S1Signal, S1CaptureData, DailyCaptureEntry } from '@/lib/signals/s1';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, SourceFooter, DetailsDrawer, DataClassBadge,
} from '@/app/components/primitives';
// Sentiment type removed — no editorial labels on this card
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { CHART_COLORS, CHART_FONT, useChartColors, useTooltipStyle } from '@/app/lib/chartTheme';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Legend, Filler
);

// Extend S1Signal with hourly data present in actual API response
interface S1WithCapture extends S1Signal {
  hourly_lt?: number[];
}

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── Capture-driven sentiment ──────────────────────────────────────────────

// No editorial labels or sentiment mappings — data speaks for itself

// ── Component ─────────────────────────────────────────────────────────────

export function S1Card() {
  const { status, data } = useSignal<S1WithCapture>(`${WORKER_URL}/read`);
  const [captureData, setCaptureData] = useState<S1CaptureData | null>(null);
  const [duration, setDuration] = useState<'2h' | '4h'>('4h');
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

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
    <article style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
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
      <div style={{ marginBottom: '4px' }}>
        <MetricTile
          label={`Gross DA capture (${duration}) · today`}
          value={grossToday != null ? `€${safeNum(grossToday, 1)}` : '—'}
          unit="/MWh"
          size="hero"
          dataClass="derived"
          sublabel="From observed DA prices · perfect-foresight dispatch"
        />
        {/* €/MW/day — revenue intensity for reference asset */}
        {grossToday != null && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            €{Math.round(grossToday * (duration === '2h' ? 2 : 4)).toLocaleString()}/MW/day gross
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
              {duration === '2h' ? '50MW/100MWh' : '50MW/200MWh'} reference
            </span>
          </div>
        )}
      </div>

      {/* TRAILING 12-MONTH RANGE */}
      {(() => {
        const monthlyAvgs = monthly.map(m =>
          duration === '4h' ? m.avg_gross_4h : m.avg_gross_2h
        ).filter((v): v is number => v != null);
        if (monthlyAvgs.length < 3 || grossToday == null) return null;
        const sorted = [...monthlyAvgs].sort((a, b) => a - b);
        const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0];
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
        const range = p95 - p5;
        const todayPct = range > 0 ? Math.min(100, Math.max(0, ((grossToday - p5) / range) * 100)) : 50;
        return (
          <div style={{ margin: '8px 0 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '2px' }}>
              <span>€{Math.round(p5)}</span>
              <span>12-month range</span>
              <span>€{Math.round(p95)}</span>
            </div>
            <div style={{ position: 'relative', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
              <div style={{
                position: 'absolute', left: `${todayPct}%`, top: '-2px',
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--text-primary)', transform: 'translateX(-50%)',
              }} />
            </div>
          </div>
        );
      })()}

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
                      ...ttStyle,
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
                      border: { color: CC.border },
                      ticks: {
                        color: CC.textMuted,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxRotation: 0,
                        callback: (_, i) => {
                          const step = Math.max(1, Math.floor(chartEntries.length / 5));
                          return i % step === 0 ? labels[i] : '';
                        },
                      },
                    },
                    y: {
                      grid: { color: CC.grid, lineWidth: 0.5 },
                      border: { display: false },
                      ticks: {
                        color: CC.textMuted,
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

      {/* TODAY'S PRICE SHAPE — sparkline */}
      {(() => {
        const prices: number[] | undefined = (data as unknown as Record<string, unknown>).today_prices_15min as number[] | undefined ?? data.hourly_lt;
        if (!prices || prices.length < 12) return null;

        const n = prices.length;
        const intervalMin = Math.round(24 * 60 / n);
        const sorted = [...prices].map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
        const k = Math.max(1, Math.round((duration === '4h' ? 4 : 2) * 60 / intervalMin));
        const chargeSet = new Set(sorted.slice(0, k).map(e => e.i));
        const dischargeSet = new Set(sorted.slice(-k).map(e => e.i));

        const labels = prices.map((_: number, i: number) => {
          const h = Math.floor(i * intervalMin / 60);
          const m = (i * intervalMin) % 60;
          return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        });

        return (
          <div style={{ margin: '12px 0' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)', letterSpacing: '0.06em',
              textTransform: 'uppercase', marginBottom: '6px',
            }}>
              Today&apos;s price shape · {n > 24 ? '15-min' : 'hourly'} · Lithuania
            </div>
            <div style={{ position: 'relative', height: '80px' }}>
              <Line
                data={{
                  labels,
                  datasets: [{
                    data: prices,
                    borderColor: 'rgba(120,118,112,0.7)',
                    borderWidth: 2,
                    pointRadius: prices.map((_: number, i: number) =>
                      chargeSet.has(i) || dischargeSet.has(i) ? 2.5 : 0
                    ),
                    pointBackgroundColor: prices.map((_: number, i: number) =>
                      chargeSet.has(i) ? CHART_COLORS.teal :
                      dischargeSet.has(i) ? CHART_COLORS.amber : 'transparent'
                    ),
                    pointBorderWidth: 0,
                    fill: false,
                    tension: 0.2,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...ttStyle,
                      callbacks: {
                        title: (items) => labels[items[0].dataIndex],
                        label: (item) => {
                          const i = item.dataIndex;
                          const role = chargeSet.has(i) ? ' (charge)' :
                            dischargeSet.has(i) ? ' (discharge)' : '';
                          return `€${(item.raw as number).toFixed(1)}/MWh${role}`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      grid: { display: false },
                      border: { display: false },
                      ticks: {
                        color: CC.textMuted,
                        font: { family: CHART_FONT.family, size: 9 },
                        maxRotation: 0,
                        callback: (_: unknown, i: number) => {
                          if (n > 48) return i % 16 === 0 ? labels[i] : '';
                          return i % 4 === 0 ? labels[i] : '';
                        },
                      },
                    },
                    y: {
                      display: true,
                      grid: { color: CC.grid, lineWidth: 0.5 },
                      border: { display: false },
                      ticks: {
                        color: CC.textMuted,
                        font: { family: CHART_FONT.family, size: 9 },
                        maxTicksLimit: 3,
                        callback: (v: unknown) => `€${v}`,
                      },
                    },
                  },
                }}
              />
            </div>
            <div style={{
              display: 'flex', gap: '12px', marginTop: '4px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            }}>
              <span style={{ color: CHART_COLORS.teal }}>● Charge ({k} cheapest)</span>
              <span style={{ color: CHART_COLORS.amber }}>● Discharge ({k} most expensive)</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Swing €{safeNum(swing, 0)}/MWh
              </span>
            </div>
          </div>
        );
      })()}

      {/* MONTHLY CAPTURE TABLE */}
      {monthly.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
          }}>
            Monthly capture ({duration})
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr 1fr',
            gap: '2px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
          }}>
            {monthly.slice(-6).map(m => {
              const gVal = duration === '4h' ? m.avg_gross_4h : m.avg_gross_2h;
              return (
                <div key={m.month} style={{ display: 'contents' }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {gVal != null ? `€${Math.round(gVal)}` : '—'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                    {m.days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CHARGE / DISCHARGE SUMMARY */}
      {(() => {
        const capDetail = duration === '2h' ? captureData?.capture_2h : captureData?.capture_4h;
        if (!capDetail) return null;
        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginTop: '16px',
            padding: '12px',
            background: 'var(--bg-elevated)',
            borderRadius: '4px',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--teal)', textTransform: 'uppercase', marginBottom: '4px' }}>Charge</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                €{safeNum(capDetail.avg_charge, 1)}
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: '2px' }}>/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                avg of {duration === '4h' ? 4 : 2}h cheapest · today
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '4px' }}>Discharge</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                €{safeNum(capDetail.avg_discharge, 1)}
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: '2px' }}>/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                avg of {duration === '4h' ? 4 : 2}h most expensive · today
              </div>
            </div>
          </div>
        );
      })()}

      {/* Spacer pushes footer to bottom when card stretches */}
      <div style={{ flex: 1 }} />

      {/* SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="energy-charts.info · ENTSO-E A44"
          updatedAt={data.updated_at ? new Date(data.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined}
          dataClass="derived from observed DA prices"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0} portalId="signal-drawer-portal">

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
                Net capture ({duration}) after RTE · today
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
                  Peak-to-trough swing · today
                </div>
              </div>
            )}
            {shape && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {String(shape.peak_hour).padStart(2, '0')}:00 / {String(shape.trough_hour).padStart(2, '0')}:00
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Peak / trough hour · today
                </div>
              </div>
            )}
          </div>

          {/* ── Gross-to-net bridge ── */}
          {(() => {
            // Build bridge from duration-specific capture data (worker gross_to_net is 2h-only)
            const capDetail = duration === '2h' ? captureData?.capture_2h : captureData?.capture_4h;
            if (!capDetail) return null;

            const rte = capDetail.rte ?? (duration === '2h' ? 0.875 : 0.87);
            const rteLoss = -Math.round((capDetail.avg_charge / rte - capDetail.avg_charge) * 100) / 100;
            const bridgeLines: { label: string; value: number; type: 'base' | 'deduction' | 'result'; annotation: string }[] = [
              { label: `Gross spread (${duration})`, value: capDetail.gross_eur_mwh, type: 'base', annotation: 'observed' },
              { label: `RTE loss (${duration})`, value: rteLoss, type: 'deduction', annotation: `Round-trip efficiency ×${rte}` },
              { label: `Net capture (${duration})`, value: capDetail.net_eur_mwh, type: 'result', annotation: 'derived' },
            ];

            return (
              <>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Gross-to-net bridge ({duration}, per MWh discharged)
                </p>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', marginBottom: '8px' }}>
                  {bridgeLines.map((line, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0',
                      color: line.type === 'result' ? 'var(--text-secondary)' : line.type === 'deduction' ? 'var(--rose)' : 'var(--text-secondary)',
                      borderTop: line.type === 'result' ? '1px solid var(--border-card)' : 'none',
                      fontWeight: line.type === 'result' ? 500 : 400,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {line.label}
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', opacity: 0.7 }}>
                          {line.annotation}
                        </span>
                      </span>
                      <span>{line.value >= 0 ? '' : '−'}€{safeNum(Math.abs(line.value), 2)}/MWh</span>
                    </div>
                  ))}
                </div>

                {/* Friction estimates — not included in net capture above */}
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  Not included in net capture
                </p>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '8px' }}>
                  {[
                    { label: 'Cycle degradation', range: '€8–15/MWh', status: 'estimated' },
                    { label: 'Grid fees + PSO', range: '€3–5/MWh', status: 'estimated' },
                    { label: 'Optimizer / RTM fees', range: '5–10% of gross', status: 'estimated' },
                    { label: 'Auxiliary consumption', range: '2–3% of throughput', status: 'estimated' },
                    { label: 'Imbalance admin (Litgrid)', range: '€0.58/MWh', status: 'confirmed' },
                    { label: 'Availability haircut', range: '3–5% annual hours', status: 'estimated' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--text-muted)' }}>
                      <span>{item.label} <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{item.status}</span></span>
                      <span>{item.range}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '20px' }}>
                  Realized capture is typically 40–65% of gross, depending on asset-specific factors.
                </p>
              </>
            );
          })()}

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
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
            LT-SE4 spread reflects interconnector price coupling. Wider spread = more DA arbitrage opportunity for LT-connected BESS. Spread narrows when NordBalt flows freely.
          </p>

          {/* ── Monthly seasonal view ── */}
          {monthly.length > 1 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                  color: 'var(--text-tertiary)', letterSpacing: '0.1em',
                  textTransform: 'uppercase', margin: 0,
                }}>
                  Monthly capture ({duration})
                </p>
                <button
                  onClick={() => {
                    const header = 'Month\tGross\tNet\tDays';
                    const rows = monthly.map(m => {
                      const g = duration === '2h' ? m.avg_gross_2h : m.avg_gross_4h;
                      const n = duration === '2h' ? m.avg_net_2h : m.avg_net_4h;
                      return `${m.month}\t${g?.toFixed(1) ?? ''}\t${n?.toFixed(1) ?? ''}\t${m.days}`;
                    });
                    navigator.clipboard.writeText([header, ...rows].join('\n'));
                  }}
                  title="Copy table as TSV"
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-xs)',
                    color: 'var(--text-muted)',
                    padding: '2px 8px',
                    border: '1px solid var(--border-card)',
                    borderRadius: '2px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-highlight)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  Copy
                </button>
              </div>
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
            marginBottom: '6px',
          }}>
            Market context · Q1 2026
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
            fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)', lineHeight: 1.5, opacity: 0.8, marginBottom: '12px',
          }}>
            Perfect-foresight sort-and-dispatch on LT DA prices ({captureData?.resolution ?? '15min'} resolution where available, hourly for data before mid-2025). Picks cheapest {duration === '2h' ? '2' : '4'} hours to charge, most expensive {duration === '2h' ? '2' : '4'} to discharge. Single cycle per day. RTE {duration === '2h' ? '87.5' : '87.0'}% (assumed). This is gross market opportunity from observed prices — not realized asset revenue. Does not model reserve commitment, partial cycles, or intraday re-optimization.
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: '4px', opacity: 0.7,
          }}>
            Sources
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', lineHeight: 1.5, opacity: 0.6, marginBottom: '12px',
          }}>
            energy-charts.info · ENTSO-E A44 day-ahead prices · Nord Pool
          </p>
          <DetailsDrawer label="Use this data">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5, opacity: 0.6 }}>
              curl kkme-fetch-s1.kastis-kemezys.workers.dev/s1/capture
            </p>
          </DetailsDrawer>
        </DetailsDrawer>
      </div>
    </article>
  );
}
