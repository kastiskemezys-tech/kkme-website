'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useChartColors, CHART_FONT, useTooltipStyle } from '@/app/lib/chartTheme';
import { DetailsDrawer, SourceFooter } from '@/app/components/primitives';
import { normaliseHourlyDispatch, dailyAvgPerHour } from '@/app/lib/dispatchChart';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend, Filler
);

const WORKER = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ═══ Types (exact match to /api/dispatch response) ══════════════════════════

type Mode = 'realised' | 'forecast';
type DurH = 2 | 4;

interface DispatchResponse {
  meta: {
    mw_total: number; dur_h: number; mwh_total: number; rte_decimal: number;
    mode: Mode; drr_active: boolean; date_iso: string; as_of_iso: string;
    data_class: string; sources: string[];
  };
  revenue_per_mw: {
    daily_eur: number; annual_eur: number;
    capacity_eur_day: number; activation_eur_day: number; arbitrage_eur_day: number;
  };
  split_pct: { capacity: number; activation: number; arbitrage: number };
  mw_allocation: {
    avg_reserves_mw: number; avg_arbitrage_mw: number;
    max_reserve_mw: number; min_arb_mw: number;
  };
  arbitrage_detail: {
    capture_eur_mwh: number; capture_eur_mwh_15min_uplifted: number;
    cycles_per_day_count: number; charge_isp_count: number;
    discharge_isp_count: number; capture_quality_label: 'low' | 'moderate' | 'high';
  };
  reserves_detail: {
    fcr_mw_avg: number; afrr_mw_avg: number; mfrr_mw_avg: number;
    activation_rate_pct: number;
  };
  market_context: {
    peak_offpeak_ratio_decimal: number;
    da_avg_eur_mwh: number; da_min_eur_mwh: number; da_max_eur_mwh: number;
  };
  soc_dynamics: { soc_min_pct: number; soc_max_pct: number; soc_avg_pct: number };
  drr_note: {
    derogation_expires_iso: string;
    post_drr_fcr_price_eur_mw_h: number;
  };
  scenarios: {
    drr_uplift_eur_mw_day: number;
    post_drr_daily_eur: number;
    post_drr_annual_eur: number;
  };
  hourly_dispatch: Array<{
    hour: number; da_price_eur_mwh: number;
    revenue_eur: { capacity: number; activation: number; arbitrage: number; total: number };
    avg_soc_pct: number;
  }>;
  isp_dispatch: Array<{
    isp: number; time: string; da_price: number;
    reserves_mw: number; arb_mw: number; soc: number;
    revenue: { capacity: number; activation: number; arbitrage: number; total: number };
  }>;
}

// ═══ Helpers ════════════════════════════════════════════════════════════════

function getDurFromURL(): DurH {
  if (typeof window === 'undefined') return 4;
  const v = new URLSearchParams(window.location.search).get('dur');
  return v === '2h' ? 2 : 4;
}

function setDurInURL(dur: DurH) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  p.set('dur', `${dur}h`);
  window.history.replaceState({}, '', `?${p}${window.location.hash}`);
  window.dispatchEvent(new Event('urlstatechange'));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function qualityColor(q: string): string {
  if (q === 'high') return 'var(--teal)';
  if (q === 'moderate') return 'var(--amber)';
  return 'var(--text-muted)';
}

// ═══ Toggle Button ══════════════════════════════════════════════════════════

function Toggle({ options, value, onChange }: {
  options: { key: string; label: string }[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)} style={{
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
  );
}

// ═══ Hourly Chart ═══════════════════════════════════════════════════════════

function HourlyChart({ data, CC, ts }: {
  data: DispatchResponse;
  CC: ReturnType<typeof useChartColors>;
  ts: ReturnType<typeof useTooltipStyle>;
}) {
  const hourly = data.hourly_dispatch;
  const mwTotal = data.meta.mw_total;
  // Normalise raw € (absolute, for the reference asset) to €/MW/h so the
  // y-axis unit matches the headline (€/MW/day = sum of these bars).
  const norm = normaliseHourlyDispatch(hourly, mwTotal);
  const avgLine = dailyAvgPerHour(data.revenue_per_mw.daily_eur);
  const chartData = {
    labels: hourly.map(h => `${String(h.hour).padStart(2, '0')}:00`),
    datasets: [
      {
        label: 'Capacity',
        data: norm.map(h => h.capacity_eur_per_mw_h),
        backgroundColor: CC.tealLight,
        borderColor: CC.teal,
        borderWidth: 0.5, stack: 'rev',
      },
      {
        label: 'Activation',
        data: norm.map(h => h.activation_eur_per_mw_h),
        backgroundColor: CC.tealMid,
        stack: 'rev',
      },
      {
        label: 'Arbitrage',
        data: norm.map(h => Math.max(0, h.arbitrage_eur_per_mw_h)),
        backgroundColor: CC.amberLight,
        stack: 'rev',
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
            const n = norm[ctx.dataIndex];
            if (!n) return '';
            if (ctx.datasetIndex === 0) return `Capacity €${n.capacity_eur_per_mw_h.toFixed(2)}/MW/h`;
            if (ctx.datasetIndex === 1) return `Activation €${n.activation_eur_per_mw_h.toFixed(2)}/MW/h`;
            if (ctx.datasetIndex === 2) return `Arbitrage €${n.arbitrage_eur_per_mw_h.toFixed(2)}/MW/h`;
            return '';
          },
          footer: (items: any[]) => {
            const h = hourly[items[0]?.dataIndex];
            return h ? `DA €${h.da_price_eur_mwh}/MWh · SoC ${h.avg_soc_pct}%` : '';
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          autoSkip: true, maxTicksLimit: 12 },
        stacked: true,
      },
      y: {
        stacked: true,
        grid: { color: CC.grid, lineWidth: 0.5 },
        border: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          callback: (v: number | string) => '€' + Number(v).toFixed(0) },
        title: { display: true, text: '€/MW/h', color: CC.textMuted,
          font: { family: CHART_FONT.family, size: 9 } },
      },
    },
  };

  return (
    <div style={{ height: 220, position: 'relative' }}>
      <Bar data={chartData} options={options} />
      <div style={{
        position: 'absolute', top: 0, right: 0,
        fontFamily: CHART_FONT.family, fontSize: '0.5625rem',
        color: 'var(--text-muted)', pointerEvents: 'none',
      }}>
        Daily avg: €{avgLine.toFixed(2)}/MW/h · sum = €{data.revenue_per_mw.daily_eur}/MW/day
      </div>
    </div>
  );
}

// ═══ ISP Drawer Table ═══════════════════════════════════════════════════════

function ISPTable({ isps }: { isps: DispatchResponse['isp_dispatch'] }) {
  const th: React.CSSProperties = {
    padding: '3px 6px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
    fontFamily: "var(--font-mono)", fontWeight: 400, textAlign: 'right',
    borderBottom: '1px solid var(--border-card)',
  };
  const td: React.CSSProperties = {
    padding: '2px 6px', fontSize: 'var(--font-xs)',
    fontFamily: "var(--font-mono)", color: 'var(--text-secondary)', textAlign: 'right',
  };

  return (
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Time</th>
            <th style={th}>DA €</th>
            <th style={th}>Res MW</th>
            <th style={th}>Arb MW</th>
            <th style={th}>SoC</th>
            <th style={th}>Rev €</th>
          </tr>
        </thead>
        <tbody>
          {isps.map(p => (
            <tr key={p.isp} style={{ borderBottom: p.isp % 4 === 3 ? '1px solid var(--border-card)' : 'none' }}>
              <td style={{ ...td, textAlign: 'left' }}>{p.time}</td>
              <td style={td}>{p.da_price}</td>
              <td style={td}>{p.reserves_mw}</td>
              <td style={td}>{p.arb_mw}</td>
              <td style={td}>{(p.soc * 100).toFixed(0)}%</td>
              <td style={td}>{p.revenue.total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══ Main Component ═════════════════════════════════════════════════════════

export function TradingEngineCard() {
  const [dur, setDur] = useState<DurH>(4);
  const [mode, setMode] = useState<Mode>('realised');
  const [realised, setRealised] = useState<DispatchResponse | null>(null);
  const [forecast, setForecast] = useState<DispatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [revEngineLive, setRevEngineLive] = useState<number | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const CC = useChartColors();
  const ts = useTooltipStyle(CC);

  // Sync dur with URL (shared with RevenueCard)
  useEffect(() => {
    setDur(getDurFromURL());
    const onChange = () => setDur(getDurFromURL());
    window.addEventListener('urlstatechange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('urlstatechange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  // Fetch both modes
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [r, f] = await Promise.all([
      fetch(`${WORKER}/api/dispatch?dur=${dur}h&mode=realised`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${WORKER}/api/dispatch?dur=${dur}h&mode=forecast`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setRealised(r?.meta ? r : null);
    setForecast(f?.meta ? f : null);
    setLoading(false);
  }, [dur]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cross-reference: Revenue Engine live rate
  useEffect(() => {
    fetch(`${WORKER}/revenue?dur=${dur}h`)
      .then(r => r.json())
      .then(d => setRevEngineLive(d?.live_rate?.today_total_daily ?? null))
      .catch(() => setRevEngineLive(null));
  }, [dur]);

  const data = mode === 'forecast' ? forecast : realised;

  if (loading && !data) {
    return <div style={{ padding: 40, color: 'var(--text-muted)',
      fontFamily: "var(--font-mono)", textAlign: 'center' }}>Loading dispatch intelligence…</div>;
  }

  return (
    <div style={{ padding: 24, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-highlight)', borderRadius: 8 }}>

      {/* ── Title ── */}
      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
        fontFamily: "var(--font-mono)", textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 8 }}>
        Dispatch intelligence
      </div>
      <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
        How the KKME dispatch algorithm allocates a 50 MW reference BESS across Baltic balancing and arbitrage.
      </p>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16,
        paddingBottom: 12, borderBottom: '1px solid var(--border-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
            fontFamily: "var(--font-mono)", textTransform: 'uppercase',
            letterSpacing: '0.08em' }}>Dur</span>
          <Toggle value={`${dur}h`}
            options={[{ key: '2h', label: '2H' }, { key: '4h', label: '4H' }]}
            onChange={v => { const d = v === '2h' ? 2 : 4; setDur(d); setDurInURL(d); }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
            fontFamily: "var(--font-mono)", textTransform: 'uppercase',
            letterSpacing: '0.08em' }}>View</span>
          <Toggle value={mode}
            options={[{ key: 'realised', label: 'Today' }, { key: 'forecast', label: 'Tomorrow' }]}
            onChange={v => setMode(v as Mode)} />
        </div>
      </div>

      {/* ── No data state ── */}
      {!data && mode === 'forecast' && (
        <div style={{ padding: '24px 0', color: 'var(--text-muted)',
          fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)', textAlign: 'center' }}>
          Tomorrow&apos;s dispatch forecast not yet available.<br />
          DA prices typically publish ~14:00 CET. Check back later.
        </div>
      )}
      {!data && mode === 'realised' && !loading && (
        <div style={{ padding: '24px 0', color: 'var(--text-muted)',
          fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)', textAlign: 'center' }}>
          No dispatch data yet. Waiting for BTD push.
        </div>
      )}

      {data && (
        <>
          {/* ── Headline ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1.5rem',
                  fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
                  €{data.revenue_per_mw.daily_eur}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
                  color: 'var(--text-secondary)' }}>/MW/day</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                  color: qualityColor(data.arbitrage_detail.capture_quality_label),
                  border: `1px solid ${qualityColor(data.arbitrage_detail.capture_quality_label)}`,
                  borderRadius: 3, padding: '1px 6px' }}>
                  {data.arbitrage_detail.capture_quality_label}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)', marginTop: 4 }}>
                €{data.revenue_per_mw.annual_eur.toLocaleString()}/MW/yr annualised · {data.meta.mw_total}MW · {data.meta.dur_h}H · {data.meta.mode} · {fmtDate(data.meta.date_iso)}
              </div>
            </div>
          </div>

          {/* ── KPI strip ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'Capacity', pct: data.split_pct.capacity, eur: data.revenue_per_mw.capacity_eur_day, color: CC.tealLight },
              { label: 'Activation', pct: data.split_pct.activation, eur: data.revenue_per_mw.activation_eur_day, color: CC.tealMid },
              { label: 'Arbitrage', pct: data.split_pct.arbitrage, eur: data.revenue_per_mw.arbitrage_eur_day, color: CC.amberLight },
            ].map(k => (
              <div key={k.label} style={{ flex: 1, minWidth: 90 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
                  fontFamily: "var(--font-mono)", textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1rem',
                  color: 'var(--text-primary)', fontWeight: 500 }}>{k.pct}%</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                  color: 'var(--text-secondary)' }}>€{k.eur}/MW/day</div>
              </div>
            ))}
          </div>

          {/* ── DRR catalyst (prominent) ── */}
          {data.scenarios && data.scenarios.drr_uplift_eur_mw_day > 0 && (
            <div style={{
              border: '1px solid var(--teal)',
              borderRadius: 4, padding: '12px 16px', marginBottom: 16,
              background: 'var(--teal-bg)',
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                FCR market reopens ~{data.drr_note.derogation_expires_iso}
              </div>
              <div style={{ fontFamily: "'Unbounded',sans-serif", fontSize: '1.25rem',
                color: 'var(--teal)', marginTop: 4, fontWeight: 500 }}>
                +€{data.scenarios.drr_uplift_eur_mw_day}/MW/day
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-secondary)', marginTop: 4 }}>
                FCR at €{data.drr_note.post_drr_fcr_price_eur_mw_h}/MW/h → €{data.scenarios.post_drr_daily_eur}/MW/day total (€{Math.round(data.scenarios.post_drr_annual_eur / 1000)}k/MW/yr, +{Math.round((data.scenarios.post_drr_annual_eur / data.revenue_per_mw.annual_eur - 1) * 100)}% uplift)
              </div>
            </div>
          )}

          {/* ── MW Allocation ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16,
            padding: '12px 0', borderTop: '1px solid var(--border-card)' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
                fontFamily: "var(--font-mono)", textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 4 }}>Reserves</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
                color: 'var(--text-secondary)' }}>
                avg {data.mw_allocation.avg_reserves_mw} MW (FCR {data.reserves_detail.fcr_mw_avg} + aFRR {data.reserves_detail.afrr_mw_avg} + mFRR {data.reserves_detail.mfrr_mw_avg})
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)', marginTop: 2 }}>
                Activation rate {data.reserves_detail.activation_rate_pct}%
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
                fontFamily: "var(--font-mono)", textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 4 }}>Arbitrage</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
                color: 'var(--text-secondary)' }}>
                avg {data.mw_allocation.avg_arbitrage_mw} MW · {data.arbitrage_detail.cycles_per_day_count} cycles/day
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)', marginTop: 2 }}>
                Capture €{data.arbitrage_detail.capture_eur_mwh}/MWh (€{data.arbitrage_detail.capture_eur_mwh_15min_uplifted} with 15-min uplift)
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
                fontFamily: "var(--font-mono)", textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 4 }}>SoC dynamics</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-sm)',
                color: 'var(--text-secondary)' }}>
                {data.soc_dynamics.soc_min_pct}% – {data.soc_dynamics.soc_max_pct}% (avg {data.soc_dynamics.soc_avg_pct}%)
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)', marginTop: 2 }}>
                DA spread €{data.market_context.da_min_eur_mwh}–{data.market_context.da_max_eur_mwh}/MWh
              </div>
            </div>
          </div>

          {/* ── Hourly chart ── */}
          <HourlyChart data={data} CC={CC} ts={ts} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8,
            fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8,
              borderRadius: 1, background: CC.tealLight, marginRight: 4 }} />Capacity</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8,
              borderRadius: 1, background: CC.tealMid, marginRight: 4 }} />Activation</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8,
              borderRadius: 1, background: CC.amberLight, marginRight: 4 }} />Arbitrage</span>
          </div>

          {/* ── Cross-reference ── */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', marginTop: 12 }}>
            {revEngineLive !== null && (
              <span>Revenue Engine live: €{revEngineLive}/MW/day · </span>
            )}
            Dispatch ({data.meta.mode}, {data.meta.date_iso}): €{data.revenue_per_mw.daily_eur}/MW/day
          </div>

          {/* ── Source footer ── */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)', marginTop: 8, opacity: 0.7 }}>
            v2 · {data.meta.sources.join(' + ')} · {data.meta.data_class} · {fmtDate(data.meta.as_of_iso)}
          </div>

          {/* ── 96-ISP Drawer ── */}
          <DetailsDrawer key={drawerKey} defaultOpen={drawerKey > 0}
            label="▸ View 96-ISP dispatch detail">
            <ISPTable isps={data.isp_dispatch} />
          </DetailsDrawer>
        </>
      )}
    </div>
  );
}

export default TradingEngineCard;
