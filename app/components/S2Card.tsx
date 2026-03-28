'use client';

import { useState } from 'react';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import { SignalIntel } from '@/app/components/SignalIntel';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer, DataClassBadge,
} from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Tooltip, Legend,
} from 'chart.js';
import { Bar, Chart } from 'react-chartjs-2';
import { CHART_COLORS, CHART_FONT, tooltipStyle } from '@/app/lib/chartTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// -- Interfaces (flat activation shape from worker) ---------------------------

interface FleetEntry {
  id?: string;
  name: string;
  mw: number;
  mwh?: number;
  status: string;
  cod?: number | null;
  country?: string;
  tso?: string;
}

interface FleetCountry {
  operational_mw: number;
  pipeline_mw: number;
  weighted_mw: number;
  entries?: FleetEntry[];
}

interface TrajectoryPoint {
  year: number;
  sd_ratio: number;
  phase: string;
  cpi?: number;
}

interface ProductSd {
  demand_mw: number;
  supply_mw: number;
  ratio: number | null;
  phase: string | null;
}

interface ActivationCountryFlat {
  afrr_p50: number | null;
  afrr_rate: number | null;
  mfrr_p50?: number | null;
  mfrr_rate?: number | null;
}

interface ActivationMonthly {
  avg: number;
  p50: number;
  p90: number;
  count: number;
  activation_rate: number;
}

interface ActivationData {
  lt?: ActivationCountryFlat;
  lv?: ActivationCountryFlat;
  ee?: ActivationCountryFlat;
  compression?: {
    afrr_lt_p50: number[];
    months: string[];
  } | null;
  lt_monthly_afrr?: Record<string, ActivationMonthly> | null;
  lt_monthly_mfrr?: Record<string, ActivationMonthly> | null;
  data_class?: string;
  period?: string;
  source?: string;
  stored_at?: string;
}

interface S2Signal {
  timestamp?: string | null;
  fcr_avg?: number | null;
  afrr_up_avg?: number | null;
  afrr_down_avg?: number | null;
  mfrr_up_avg?: number | null;
  mfrr_down_avg?: number | null;
  pct_up?: number | null;
  pct_down?: number | null;
  imbalance_mean?: number | null;
  imbalance_p90?: number | null;
  pct_above_100?: number | null;
  afrr_annual_per_mw_installed?: number | null;
  mfrr_annual_per_mw_installed?: number | null;
  cvi_afrr_eur_mw_yr?: number | null;
  cvi_mfrr_eur_mw_yr?: number | null;
  stress_index_p90?: number | null;
  fcr_note?: string | null;
  ordered_price?: number | null;
  ordered_mw?: number | null;
  signal?: string | null;
  interpretation?: string | null;
  source?: string | null;
  unavailable?: boolean;
  _stale?: boolean;
  _age_hours?: number | null;
  _serving?: string;
  sd_ratio?: number | null;
  phase?: string | null;
  cpi?: number | null;
  trajectory?: TrajectoryPoint[] | null;
  fleet?: Record<string, FleetCountry> | null;
  baltic_operational_mw?: number | null;
  baltic_pipeline_mw?: number | null;
  eff_demand_mw?: number | null;
  product_sd?: Record<string, ProductSd> | null;
  activation?: ActivationData | null;
}

// -- Helpers ------------------------------------------------------------------

function sdSentiment(): Sentiment {
  return 'neutral';
}

function sdStatus(sd: number): string {
  if (sd < 0.6) return 'S/D < 0.6';
  if (sd < 1.0) return 'S/D < 1.0';
  return 'S/D >= 1.0';
}

function pressureTrend(trajectory: TrajectoryPoint[] | null | undefined, currentSd: number): string {
  if (!trajectory || trajectory.length < 2) return '?';
  const nextYear = trajectory.find(pt => pt.year > new Date().getFullYear());
  if (!nextYear) return '+0.00';
  const delta = nextYear.sd_ratio - currentSd;
  return delta > 0 ? '+' + delta.toFixed(2) : delta.toFixed(2);
}

// Fleet MW timeline -- hardcoded from KKME fleet tracker
const FLEET_MW_TIMELINE: Record<string, number> = {
  '2025-10': 27, '2025-11': 27, '2025-12': 87,
  '2026-01': 127, '2026-02': 227, '2026-03': 227,
};

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function productPhaseColor(phase: string | null): string {
  if (phase === 'SCARCITY') return 'var(--teal)';
  if (phase === 'COMPRESS') return 'var(--amber)';
  if (phase === 'MATURE') return 'var(--rose)';
  return 'var(--text-muted)';
}

function productPhaseLabel(phase: string | null): string {
  if (phase === 'SCARCITY') return 'Scarcity';
  if (phase === 'COMPRESS') return 'Tightening';
  if (phase === 'MATURE') return 'Saturated';
  return '--';
}

// -- Component ----------------------------------------------------------------

export function S2Card() {
  const { status, data } =
    useSignal<S2Signal>(`${WORKER_URL}/s2`);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '1rem', width: '55%', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '2rem', width: '30%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.75rem', width: '65%', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '100px', width: '100%' }} />
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Balancing market data unavailable
        </p>
      </article>
    );
  }

  const sd = data.sd_ratio ?? null;
  const opMw = data.baltic_operational_mw;
  const pipeMw = data.baltic_pipeline_mw;
  const trajectory = data.trajectory ?? null;
  const activation = data.activation ?? null;
  const productSd = data.product_sd ?? null;

  // Flat activation accessors
  const ltAct = activation?.lt ?? null;
  const compressionTraj = activation?.compression ?? null;
  const ltMonthlyAfrr = activation?.lt_monthly_afrr ?? null;
  const ltMonthlyMfrr = activation?.lt_monthly_mfrr ?? null;

  // Collect all fleet entries for the details drawer
  const STATUS_ORDER: Record<string, number> = {
    operational: 0, commissioned: 1, under_construction: 2,
    connection_agreement: 3, application: 4,
  };
  const allEntries: FleetEntry[] = Object.values(data.fleet || {})
    .flatMap((c: unknown) => ((c as FleetCountry)?.entries || []))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  // Recent 3-month activation counts from lt_monthly_afrr / lt_monthly_mfrr
  const recentAfrrCount = ltMonthlyAfrr
    ? Object.values(ltMonthlyAfrr).slice(-3).reduce((s, m) => s + m.count, 0)
    : null;
  const recentMfrrCount = ltMonthlyMfrr
    ? Object.values(ltMonthlyMfrr).slice(-3).reduce((s, m) => s + m.count, 0)
    : null;

  return (
    <article style={{ width: '100%' }}>
      {/* -- HEADER -- */}
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
          Baltic balancing market
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Battery fleet competition vs balancing demand — the supply/demand ratio that drives capacity pricing.
        </p>
      </div>

      {/* -- HERO METRIC -- */}
      {sd != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile
              label="Battery competition vs balancing demand"
              value={sd.toFixed(2)}
              unit="x"
              size="hero"
              dataClass="derived"
              sublabel="below 1.0x = demand exceeds fleet supply"
            />
            <StatusChip status={sdStatus(sd)} sentiment={sdSentiment()} />
          </div>
        </div>
      )}

      {/* -- INTERPRETATION -- */}
      {sd != null && (
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: '12px 0 20px',
        }}>
          Fleet weighted supply {Math.round(sd * 100)}% of estimated balancing demand ({data.eff_demand_mw ?? '?'} MW).
        </p>
      )}

      {/* -- FLEET PRESSURE SUMMARY -- */}
      <div style={{
        display: 'flex',
        gap: '16px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {opMw != null && <span>{opMw} MW operational</span>}
        {pipeMw != null && (
          <>
            <span>·</span>
            <span>{pipeMw} MW pipeline</span>
          </>
        )}
        {sd != null && trajectory && (
          <>
            <span>·</span>
            <span>{pressureTrend(trajectory, sd)} S/D next year</span>
          </>
        )}
      </div>

      {/* -- EXCLUDED ITEMS -- */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        marginBottom: '20px',
        padding: '10px 14px',
        border: '1px solid var(--border-card)',
        borderRadius: '4px',
      }}>
        <div style={{ marginBottom: '4px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
          What this card does not show
        </div>
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          <li>Realized asset revenue — clearing prices are market-wide, not asset-level capture</li>
          <li>Real-time dispatch optimization or multi-product revenue stacking</li>
          <li>Forward capacity contract terms or bilateral arrangements</li>
        </ul>
      </div>

      {/* -- ACTIVATION CLEARING PRICES (flat shape) -- */}
      {ltAct && (ltAct.afrr_p50 != null || ltAct.mfrr_p50 != null) && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            Activation clearing prices · Lithuania
            <DataClassBadge dataClass="observed" />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '8px',
          }}>
            {ltAct.afrr_p50 != null && (
              <div style={{
                padding: '14px 16px',
                borderLeft: '3px solid var(--teal)',
                background: 'var(--bg-elevated)',
                borderRadius: '0 4px 4px 0',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                  <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                    {'\u20AC'}{Math.round(ltAct.afrr_p50)}
                  </span>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginLeft: '4px' }}>/MWh</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  aFRR median clearing · {ltAct.afrr_rate != null ? Math.round(ltAct.afrr_rate * 100) : '?'}% activation rate
                </div>
                {recentAfrrCount != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {recentAfrrCount.toLocaleString()} events in period
                  </div>
                )}
              </div>
            )}
            {ltAct.mfrr_p50 != null && (
              <div style={{
                padding: '14px 16px',
                borderLeft: '3px solid var(--amber)',
                background: 'var(--bg-elevated)',
                borderRadius: '0 4px 4px 0',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                  <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                    {'\u20AC'}{Math.round(ltAct.mfrr_p50)}
                  </span>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginLeft: '4px' }}>/MWh</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  mFRR median clearing · {ltAct.mfrr_rate != null ? Math.round(ltAct.mfrr_rate * 100) : '?'}% activation rate
                </div>
                {recentMfrrCount != null && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {recentMfrrCount.toLocaleString()} events in period
                  </div>
                )}
              </div>
            )}
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}>
            Capacity prices: BTD bid averages (reference estimate, not clearing).
          </p>
        </div>
      )}

      {/* -- COMPRESSION CHART -- dual-axis: aFRR P50 bars + fleet MW line -- */}
      {compressionTraj && compressionTraj.months.length > 0 && (() => {
        const months = compressionTraj.months;
        const p50 = compressionTraj.afrr_lt_p50;
        const fleetMw = months.map(m => FLEET_MW_TIMELINE[m] ?? 0);
        const maxP50 = Math.max(...p50);
        const maxMw = Math.max(...fleetMw);

        return (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              Observed aFRR clearing vs fleet growth · Lithuania
              <DataClassBadge dataClass="derived" />
            </div>
            <div style={{ position: 'relative', height: '200px' }}>
              <Chart
                type="bar"
                data={{
                  labels: months.map(formatMonth),
                  datasets: [
                    {
                      type: 'bar' as const,
                      label: 'aFRR P50 EUR/MWh',
                      data: p50,
                      backgroundColor: CHART_COLORS.tealMid,
                      borderWidth: 0,
                      borderRadius: 2,
                      barPercentage: 0.6,
                      yAxisID: 'y',
                      order: 2,
                    },
                    {
                      type: 'line' as const,
                      label: 'Fleet MW',
                      data: fleetMw,
                      borderColor: CHART_COLORS.amber,
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      pointRadius: 3,
                      pointBackgroundColor: CHART_COLORS.amber,
                      tension: 0.3,
                      yAxisID: 'y1',
                      order: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...tooltipStyle,
                      callbacks: {
                        title: (items) => items[0].label,
                        label: (item) => {
                          if (item.datasetIndex === 0) {
                            return `aFRR P50  EUR${Math.round(item.raw as number)}/MWh`;
                          }
                          return `Fleet     ${item.raw} MW`;
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
                        font: { family: CHART_FONT.family, size: 11 },
                      },
                    },
                    y: {
                      position: 'left',
                      min: 0,
                      max: maxP50 * 1.15,
                      grid: { color: CHART_COLORS.grid, lineWidth: 0.5 },
                      border: { display: false },
                      ticks: {
                        color: CHART_COLORS.textMuted,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxTicksLimit: 5,
                        callback: (v) => `EUR${v}`,
                      },
                    },
                    y1: {
                      position: 'right',
                      min: 0,
                      max: maxMw * 1.3,
                      grid: { display: false },
                      border: { display: false },
                      ticks: {
                        color: CHART_COLORS.amber,
                        font: { family: CHART_FONT.family, size: 10 },
                        maxTicksLimit: 4,
                        callback: (v) => `${v} MW`,
                      },
                    },
                  },
                }}
              />
            </div>
            {/* Legend + caption */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              marginTop: '4px',
            }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span><span style={{ color: CHART_COLORS.teal }}>■</span> aFRR P50</span>
                <span><span style={{ color: CHART_COLORS.amber }}>━</span> Fleet MW</span>
              </div>
            </div>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              marginTop: '4px',
            }}>
              Fleet capacity grew as clearing prices compressed. Correlation is visible; causation is not established.
            </p>
          </div>
        );
      })()}

      {/* -- IMPACT LINE (COD timing numbers) -- */}
      {trajectory && trajectory.length >= 2 && (() => {
        const pt27 = trajectory.find(p => p.year === 2027);
        const pt29 = trajectory.find(p => p.year === 2029);
        if (!pt27 && !pt29) return null;
        return (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--teal-strong)',
            marginBottom: '20px',
          }}>
            {pt27 && <>2027: S/D {pt27.sd_ratio.toFixed(2)}x</>}
            {pt27 && pt29 && '  ·  '}
            {pt29 && <>2029: S/D {pt29.sd_ratio.toFixed(2)}x</>}
          </div>
        );
      })()}

      {/* -- S/D METHODOLOGY NOTE -- */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
        marginBottom: '8px',
      }}>
        <p style={{ margin: '0 0 4px' }}>
          S/D = weighted fleet supply / effective demand (1,190 MW). Weights: operational 1.0, construction 0.9, agreement 0.6.
        </p>
        <p style={{ margin: 0 }}>
          Compression trajectory shows observed aFRR clearing-price decline as fleet MW grew. This is a historical pattern, not a forecast.
        </p>
      </div>

      {/* -- SIGNAL INTEL -- */}
      <SignalIntel signalId="S2" />

      {/* -- SOURCE FOOTER -- */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="BTD + fleet tracker + BTD activation clearing"
          updatedAt={(() => {
            const ts = activation?.stored_at || data.timestamp;
            if (!ts) return undefined;
            return new Date(ts).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            });
          })()}
          dataClass="mixed: observed + ref estimate + modeled"
        />
      </button>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        marginTop: '2px',
      }}>
        Capacity prices: ~2-day BTD lag · Activation data: manual refresh · Fleet: KKME tracker
      </p>

      {/* ================================================================== */}
      {/* -- DETAILS DRAWER -- */}
      {/* ================================================================== */}
      <div style={{ marginTop: '20px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>

          {/* -- Balancing depth -- */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Balancing depth · editorial assessment · Q1 2026
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>aFRR</span>
              <span style={{ color: 'var(--amber)' }}>Thin · small marginal clears can distort signals</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>mFRR</span>
              <span style={{ color: 'var(--amber)' }}>Thin · growing participation, still shallow</span>
            </div>
          </div>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '8px',
          }}>
            Posted prices != usable revenue. Visible price spikes on small marginal clears overstate repeatable opportunity for 50MW-scale assets.
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            marginBottom: '24px',
          }}>
            Awaiting BTD volume integration for observed depth metrics
          </p>

          {/* -- Market structure -- */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Market structure
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '24px' }}>
            Settlement: 15-minute ISP (since Oct 2025) · Balancing: aFRR + mFRR active, FCR via BBCM · Post-synchronization regime still normalizing — historical patterns may not be repeatable.
          </div>

          {/* -- Per-product S/D -- */}
          {productSd && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                Per-product supply/demand stress view
                <DataClassBadge dataClass="derived" />
              </div>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                marginBottom: '8px',
                paddingLeft: '12px',
                borderLeft: '1px solid var(--amber-subtle)',
              }}>
                Worst-case view — assumes all fleet capacity competes in each product independently. Actual competition is lower because fleet is split across products.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 70px 70px',
                gap: '4px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
              }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Product</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Demand</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>S/D</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Phase</span>
                {Object.entries(productSd).map(([prod, ps]) => (
                  <div key={prod} style={{ display: 'contents' }}>
                    <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{prod}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{ps.demand_mw} MW</span>
                    <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                      {ps.ratio != null ? `${ps.ratio.toFixed(1)}x` : '--'}
                    </span>
                    <span style={{ color: productPhaseColor(ps.phase), textAlign: 'right' }}>
                      {productPhaseLabel(ps.phase)}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                marginTop: '6px',
              }}>
                Demand: FCR 25 MW (BBCM), aFRR 170 MW, mFRR 700 MW (Elering Oct 2025). Supply: {productSd.fcr?.supply_mw ?? '--'} MW weighted fleet.
              </p>
            </div>
          )}

          {/* -- Cross-border comparison (flat shape) -- */}
          {activation && (activation.lv || activation.ee) && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}>
                Cross-border comparison · aFRR recent 3 months
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '90px 70px 60px',
                gap: '4px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
              }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Country</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>P50</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Rate</span>
                {([
                  ['Lithuania', activation.lt],
                  ['Latvia', activation.lv],
                  ['Estonia', activation.ee],
                ] as [string, ActivationCountryFlat | undefined][])
                  .filter(([, c]) => c && c.afrr_p50 != null)
                  .map(([name, c]) => (
                    <div key={name} style={{ display: 'contents' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                        {'\u20AC'}{Math.round(c!.afrr_p50!)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                        {c!.afrr_rate != null ? Math.round(c!.afrr_rate * 100) : '?'}%
                      </span>
                    </div>
                  ))}
              </div>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                marginTop: '6px',
              }}>
                Latvia has no mFRR data in this dataset. Estonia has both aFRR and mFRR.
              </p>
            </div>
          )}

          {/* -- Monthly activation table (flat shape) -- */}
          {ltMonthlyAfrr && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}>
                Activation detail · Lithuania · monthly
              </p>
              {/* aFRR */}
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                aFRR up
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 55px 45px 60px',
                gap: '2px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                marginBottom: '12px',
              }}>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Month</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>P50</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Rate</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Events</span>
                {Object.entries(ltMonthlyAfrr).map(([month, m]) => (
                  <div key={month} style={{ display: 'contents' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{formatMonth(month)}</span>
                    <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{'\u20AC'}{Math.round(m.p50)}</span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{Math.round(m.activation_rate * 100)}%</span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{m.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {/* mFRR */}
              {ltMonthlyMfrr && (
                <>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    mFRR up
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 55px 45px 60px',
                    gap: '2px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-xs)',
                    marginBottom: '8px',
                  }}>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Month</span>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>P50</span>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Rate</span>
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textAlign: 'right' }}>Events</span>
                    {Object.entries(ltMonthlyMfrr).map(([month, m]) => (
                      <div key={month} style={{ display: 'contents' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{formatMonth(month)}</span>
                        <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{'\u20AC'}{Math.round(m.p50)}</span>
                        <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{Math.round(m.activation_rate * 100)}%</span>
                        <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{m.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                Source: {activation?.source ?? 'BTD'} · Period: {activation?.period ?? '--'}
              </p>
            </div>
          )}

          {/* -- Regime markers -- */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              Market context
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
              {[
                { label: 'Baltic sync', date: 'Feb 2025', note: 'Disconnection from BRELL, synchronization with Continental Europe' },
                { label: '15-min ISP', date: 'Oct 2025', note: 'Settlement period halved — aFRR/mFRR market structure changed' },
                { label: 'BESS fleet ramp', date: 'Q4 2025+', note: 'Operational fleet grew from ~27 MW to ~227 MW in 6 months' },
                { label: 'MARI go-live', date: 'TBC 2027', note: 'mFRR platform integration — Baltic prices converge to EU range' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: '90px' }}>{r.date}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>-- {r.note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* -- S/D trajectory (in drawer) -- */}
          {trajectory && trajectory.length > 0 && (() => {
            const sdBarColor = (sdVal: number): string => {
              if (sdVal < 0.6) return CHART_COLORS.teal;
              if (sdVal < 1.0) return CHART_COLORS.amber;
              return CHART_COLORS.rose;
            };
            const barBg = trajectory.map(pt => sdBarColor(pt.sd_ratio));
            const maxSd = Math.max(...trajectory.map(p => p.sd_ratio), 1.5);
            const trajData = {
              labels: trajectory.map(pt => String(pt.year)),
              datasets: [{
                label: 'S/D ratio',
                data: trajectory.map(pt => pt.sd_ratio),
                backgroundColor: barBg,
                borderWidth: 0,
                borderRadius: 2,
                barPercentage: 0.7,
              }],
            };
            return (
              <div style={{ marginBottom: '24px' }}>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  S/D ratio trajectory (projected)
                  <DataClassBadge dataClass="modeled" />
                </p>
                <div style={{ position: 'relative', height: '160px' }}>
                  <Bar
                    data={trajData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          ...tooltipStyle,
                          callbacks: {
                            title: (items) => items[0].label,
                            label: (item) => {
                              const idx = item.dataIndex;
                              const pt = trajectory[idx];
                              return [
                                `S/D ratio  ${pt.sd_ratio.toFixed(2)}x`,
                                `Status     ${sdStatus(pt.sd_ratio)}`,
                                ...(pt.cpi != null ? [`CPI        ${pt.cpi.toFixed(2)}`] : []),
                              ];
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
                            font: { family: CHART_FONT.family, size: 11 },
                          },
                        },
                        y: {
                          max: maxSd + 0.2,
                          min: 0,
                          grid: { color: CHART_COLORS.grid, lineWidth: 0.5 },
                          border: { display: false },
                          ticks: {
                            color: CHART_COLORS.textMuted,
                            font: { family: CHART_FONT.family, size: 10 },
                            maxTicksLimit: 5,
                            callback: (v) => `${v}x`,
                          },
                        },
                      },
                    }}
                  />
                </div>
                {/* CPI row -- moved into drawer */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                  paddingLeft: '30px',
                }}>
                  {trajectory.map(pt => (
                    <span key={pt.year} style={{ textAlign: 'center', flex: 1 }}>
                      {pt.cpi != null ? pt.cpi.toFixed(2) : ''}
                    </span>
                  ))}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span><span style={{ color: CHART_COLORS.teal }}>■</span> S/D &lt; 0.6</span>
                    <span><span style={{ color: CHART_COLORS.amber }}>■</span> S/D 0.6-1.0</span>
                    <span><span style={{ color: CHART_COLORS.rose }}>■</span> S/D &gt; 1.0</span>
                  </div>
                  <span>CPI = capacity price index <DataClassBadge dataClass="modeled" /></span>
                </div>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}>
                  Projection: 0.15 S/D growth per year from new fleet entrants. CPI floor 0.40 (Baltic structural reserve need).
                </p>
              </div>
            );
          })()}

          {/* -- Market references (capacity reservation prices) -- */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Capacity reservation prices
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '12px',
          }}>
            <div style={{ padding: '6px 10px', borderLeft: '1px solid var(--amber)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {data.afrr_up_avg != null ? safeNum(data.afrr_up_avg, 0) : '--'} <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EUR/MW/h</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                aFRR reservation <DataClassBadge dataClass="reference_estimate" />
              </div>
            </div>
            <div style={{ padding: '6px 10px', borderLeft: '1px solid var(--amber)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {data.mfrr_up_avg != null ? safeNum(data.mfrr_up_avg, 0) : '--'} <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EUR/MW/h</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                mFRR reservation <DataClassBadge dataClass="reference_estimate" />
              </div>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '24px' }}>
            KKME estimates from BTD procurement bid averages. Not observed clearing prices.
          </div>

          {/* -- Fleet composition -- */}
          {allEntries.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}>
                Baltic BESS fleet ({allEntries.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {allEntries.map((e, i) => (
                  <div
                    key={e.id ?? `${e.name}-${i}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: '0 8px',
                      alignItems: 'baseline',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-xs)',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{e.name}</span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{e.mw} MW</span>
                    <span style={{
                      color: (e.status === 'operational' || e.status === 'commissioned') ? 'var(--teal-strong)' :
                        e.status === 'under_construction' ? 'var(--amber)' : 'var(--text-muted)',
                      textAlign: 'right',
                      minWidth: '80px',
                    }}>
                      {e.status.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                      {e.cod ? `COD ${e.cod}` : ''}
                      {e.country ? ` · ${e.country}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -- Nested price detail drawer -- */}
          <div style={{ marginBottom: '24px' }}>
            <DetailsDrawer label="View price detail and estimates">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '6px 16px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                marginBottom: '16px',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>aFRR reservation <DataClassBadge dataClass="reference_estimate" /></span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {safeNum(data.afrr_up_avg, 1)} EUR/MW/h · CH 2027: EUR20 · CH 2028: EUR10
                </span>
                <span style={{ color: 'var(--text-muted)' }}>mFRR reservation <DataClassBadge dataClass="reference_estimate" /></span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {safeNum(data.mfrr_up_avg, 1)} EUR/MW/h · CH 2027: EUR20 · CH 2030: EUR11
                </span>
                {data.fcr_avg != null && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>FCR <DataClassBadge dataClass="reference_estimate" /></span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {safeNum(data.fcr_avg, 1)} EUR/MW/h · ~28 MW Baltic total · DRR covers 100% at zero price
                    </span>
                  </>
                )}
                {data.stress_index_p90 != null && (data.stress_index_p90 > 0) && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>P90 imbalance spike</span>
                    <span style={{ color: 'var(--rose)' }}>{safeNum(data.stress_index_p90, 0)} EUR/MWh</span>
                  </>
                )}
              </div>
              {(data.afrr_annual_per_mw_installed != null || data.mfrr_annual_per_mw_installed != null) && (
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-xs)',
                  color: 'var(--text-muted)',
                }}>
                  {data.afrr_annual_per_mw_installed != null && (
                    <div>aFRR annual estimate: EUR{Math.round(data.afrr_annual_per_mw_installed / 1000)}k/MW/yr</div>
                  )}
                  {data.mfrr_annual_per_mw_installed != null && (
                    <div>mFRR annual estimate: EUR{Math.round(data.mfrr_annual_per_mw_installed / 1000)}k/MW/yr</div>
                  )}
                  <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Per MW installed · 0.5 MW service (2 MW/MW prequalification) · theoretical max if fully allocated
                  </p>
                </div>
              )}
            </DetailsDrawer>
          </div>

          {/* -- Methodology -- */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Methodology · data classes
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-tertiary)' }}>Observed:</strong> Activation clearing prices from BTD transparency dashboard — local-marginal-price per 15-min ISP. These are market-wide energy prices, not asset-level revenue.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-tertiary)' }}>Reference estimate:</strong> Capacity reservation prices derived from BTD procurement bid averages (AST Latvia Sept 2025 reference). Not observed clearing.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-tertiary)' }}>Modeled:</strong> CPI (capacity price index) computed from piecewise S/D-to-price function. Floor 0.40, slope 0.08. Reflects fleet trajectory assumptions, not market clearing.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-tertiary)' }}>Derived:</strong> S/D ratio, per-product S/D, compression trajectory — KKME computations from observed inputs. Methodology: weighted fleet / effective demand (1,190 MW = 1,700 MW x 0.70 stacking factor, Elering Oct 2025).
            </p>
          </div>
        </DetailsDrawer>
      </div>
    </article>
  );
}
