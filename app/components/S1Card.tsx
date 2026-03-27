'use client';

import { useState, useEffect, useMemo } from 'react';
import type { S1Signal } from '@/lib/signals/s1';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { ImpactState, Sentiment } from '@/app/lib/types';
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

interface SpreadHistory {
  date: string;
  spread_eur: number;
  spread_pct?: number;
  lt_swing?: number;
}

// Extend S1Signal with hourly data present in actual API response
interface S1WithHourly extends S1Signal {
  hourly_lt?: number[];
}

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

function spreadSentiment(spread: number): Sentiment {
  if (spread < -5) return 'negative';
  if (spread < 2) return 'neutral';
  if (spread < 10) return 'caution';
  return 'positive';
}

function spreadStatus(spread: number): string {
  if (spread < -5) return 'Inverted';
  if (spread < 2) return 'Weak';
  if (spread < 10) return 'Slightly supportive';
  if (spread < 25) return 'Supportive';
  return 'Strong';
}

function spreadInterpretation(spread: number): string {
  if (spread < 0) return 'Baltic prices are below neighboring markets. Arbitrage is not supportive at current levels.';
  if (spread < 5) return 'Narrow spreads. Arbitrage contributes modestly to storage economics.';
  if (spread < 15) return 'Moderate price separation. Day-ahead arbitrage provides meaningful revenue support.';
  return 'Wide Baltic price separation. Arbitrage is a significant contributor to storage revenues.';
}

function spreadImpact(spread: number): ImpactState {
  if (spread < 0) return 'slight_negative';
  if (spread < 5) return 'mixed';
  if (spread < 15) return 'slight_positive';
  return 'strong_positive';
}

function spreadImpactDesc(spread: number): string {
  if (spread < 0) return 'Reference asset: Arbitrage drag on both 2H and 4H';
  if (spread < 5) return 'Reference asset: Minor arbitrage support for 2H and 4H';
  if (spread < 15) return 'Reference asset: Moderate arbitrage support, stronger for 4H';
  return 'Reference asset: Strong arbitrage upside, especially for 4H duration';
}

export function S1Card() {
  const { status, data } =
    useSignal<S1WithHourly>(`${WORKER_URL}/read`);
  const [historyRaw, setHistoryRaw] = useState<SpreadHistory[]>([]);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  useEffect(() => {
    fetch(`${WORKER_URL}/s1/history`)
      .then(r => r.json())
      .then((h: SpreadHistory[]) => setHistoryRaw(Array.isArray(h) ? h : []))
      .catch(() => {});
  }, []);

  const history = historyRaw.map(e => e.spread_eur);

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
          Price separation data unavailable
        </p>
      </article>
    );
  }

  const spread = data.spread_eur_mwh;
  const spreadP50 = data.spread_stats_90d?.p50 ?? null;
  const daysOfData = data.spread_stats_90d?.days_of_data ?? 0;
  const impact = spreadImpact(spread);

  // Compute spread percentile vs 30D history
  let percentileLabel = '';
  if (history.length > 7) {
    const sorted = [...history].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= spread).length;
    const pct = Math.round((rank / sorted.length) * 100);
    const suffix = pct % 100 >= 11 && pct % 100 <= 13 ? 'th'
      : pct % 10 === 1 ? 'st' : pct % 10 === 2 ? 'nd' : pct % 10 === 3 ? 'rd' : 'th';
    percentileLabel = `${pct}${suffix}`;
  }

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
          Baltic price separation
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          How far Baltic day-ahead prices diverge from neighbors. Wider spreads support storage arbitrage.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Lithuania-led · ENTSO-E day-ahead data
        </p>
      </div>

      {/* HERO METRIC */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <MetricTile
          label="Day-ahead price spread"
          value={`${spread >= 0 ? '+' : ''}${safeNum(spread, 1)}`}
          unit="€/MWh"
          size="hero"
          dataClass="observed"
          sublabel="LT minus SE4 average"
        />
        <StatusChip status={spreadStatus(spread)} sentiment={spreadSentiment(spread)} />
      </div>

      {/* HERO CHART — spread history (Chart.js) */}
      {historyRaw.length > 1 && (() => {
        const labels = historyRaw.map(h => {
          const d = new Date(h.date + 'T00:00:00');
          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        });
        const barColors = historyRaw.map(h =>
          h.spread_eur >= 0 ? CHART_COLORS.tealLight : CHART_COLORS.roseLight
        );
        const chartDataS1 = {
          labels,
          datasets: [{
            label: 'Spread',
            data: historyRaw.map(h => h.spread_eur),
            backgroundColor: barColors,
            borderWidth: 0,
            borderSkipped: false as const,
          }],
        };
        return (
          <div style={{ margin: '16px 0' }}>
            <div style={{ position: 'relative', height: '200px' }}>
              <Bar
                data={chartDataS1}
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
                          return `Spread    ${v >= 0 ? '+' : ''}${v.toFixed(1)} €/MWh`;
                        },
                        footer: (items) => {
                          const idx = items[0].dataIndex;
                          const h = historyRaw[idx];
                          const lines = [];
                          if (h.lt_swing != null) lines.push(`LT swing  ${Math.round(h.lt_swing)} €/MWh`);
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
                        callback: (_, i) => i % 15 === 0 ? labels[i] : '',
                      },
                    },
                    y: {
                      grid: { color: CHART_COLORS.grid, lineWidth: 0.5 },
                      border: { display: false },
                      ticks: {
                        color: CHART_COLORS.textMuted,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxTicksLimit: 5,
                        callback: (v) => `${v}€`,
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
              <span>{daysOfData > 0 ? `${daysOfData} days` : ''}</span>
              {spreadP50 != null && (
                <span style={{ color: CHART_COLORS.textMuted }}>
                  median {spreadP50 >= 0 ? '+' : ''}{spreadP50.toFixed(0)}€
                </span>
              )}
              <span>today</span>
            </div>
          </div>
        );
      })()}

      {/* BESS CAPTURE SCHEDULE STRIP */}
      {(() => {
        const hourlyRaw = data.hourly_lt;
        if (!hourlyRaw || hourlyRaw.length < 24) return null;
        // Take last 24 entries
        const hourly24 = hourlyRaw.slice(-24);
        // Find 2 cheapest and 2 most expensive hours
        const indexed = hourly24.map((p, i) => ({ price: p, idx: i }));
        const sorted = [...indexed].sort((a, b) => a.price - b.price);
        const cheapest = new Set(sorted.slice(0, 2).map(e => e.idx));
        const expensive = new Set(sorted.slice(-2).map(e => e.idx));
        const avgCheap = sorted.slice(0, 2).reduce((s, e) => s + e.price, 0) / 2;
        const avgExpensive = sorted.slice(-2).reduce((s, e) => s + e.price, 0) / 2;
        const netCapture = (avgExpensive - avgCheap) / 0.875;

        return (
          <div style={{ margin: '12px 0' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Optimal dispatch
            </p>
            <div style={{ display: 'flex', gap: '1px' }}>
              {hourly24.map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '12px',
                    background: cheapest.has(i) ? 'var(--teal)' :
                      expensive.has(i) ? 'var(--amber)' : 'var(--bg-elevated)',
                    opacity: cheapest.has(i) || expensive.has(i) ? 0.8 : 1,
                    borderRadius: '1px',
                  }}
                  title={`${String(i).padStart(2, '0')}:00 — €${hourly24[i].toFixed(1)}/MWh`}
                />
              ))}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '4px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--teal)' }}>■ Charge</span>
                <span style={{ color: 'var(--amber)' }}>■ Discharge</span>
                <span style={{ color: 'var(--text-muted)' }}>■ Hold</span>
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>
                Net capture: €{safeNum(netCapture, 1)}/MWh after RTE
              </span>
            </div>
          </div>
        );
      })()}

      {/* CAPTURE CAVEAT */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
        marginBottom: '8px',
        paddingLeft: '12px',
        borderLeft: '1px solid var(--amber-subtle)',
      }}>
        Theoretical capture from price shape only. Realized BESS capture depends on reserve commitment, SoC, and activation timing.
      </p>

      {/* INTERPRETATION */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginBottom: '8px',
      }}>
        {spreadInterpretation(spread)}
      </p>

      {/* IMPACT LINE */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--teal-strong)',
        marginBottom: '16px',
      }}>
        {spreadImpactDesc(spread)}
      </div>

      {/* SOURCE FOOTER — clickable to open drawer */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="ENTSO-E A44"
          updatedAt={data.updated_at ? new Date(data.updated_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="observed data"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>
          {/* Supporting metrics */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Supporting metrics
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '20px',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {data.bess_net_capture != null ? safeNum(data.bess_net_capture, 1) : '—'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>€/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                Battery arbitrage capture · net of RTE
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {spreadP50 != null ? `${spreadP50 >= 0 ? '+' : ''}${safeNum(spreadP50, 1)}` : '—'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>€/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                {daysOfData >= 90 ? '90-day' : daysOfData > 0 ? `${daysOfData}-day` : ''} median spread
              </div>
            </div>
            {percentileLabel && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {percentileLabel}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Spread percentile vs 30 days
                </div>
              </div>
            )}
            {!percentileLabel && data.pct_hours_above_20 != null && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {safeNum(data.pct_hours_above_20, 1)}%
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Hours above 20% spread
                </div>
              </div>
            )}
          </div>

          {/* Price breakdown */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Price breakdown
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
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
            {data.lt_daily_swing_eur_mwh != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>LT daily swing</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.lt_daily_swing_eur_mwh, 0)} €/MWh</span>
              </>
            )}
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

          {data.da_tomorrow?.lt_peak != null && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              marginBottom: '20px',
            }}>
              Tomorrow DA: {safeNum(data.da_tomorrow.lt_peak, 0)} peak · {safeNum(data.da_tomorrow.lt_avg, 0)} avg €/MWh
              {data.da_tomorrow.delivery_date && ` · ${data.da_tomorrow.delivery_date}`}
            </div>
          )}

          {/* Methodology — footer-level */}
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
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            opacity: 0.6,
          }}>
            Day-ahead directional estimate. Realised arbitrage depends on intraday conditions, efficiency, and market access.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
