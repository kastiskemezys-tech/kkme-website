'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import {
  AnimatedNumber, StatusChip, SourceFooter, DetailsDrawer, DataClassBadge,
} from '@/app/components/primitives';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { CHART_FONT, useChartColors, useTooltipStyle, buildScales } from '@/app/lib/chartTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, LineController, Tooltip, Filler);

const W = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── Types ────────────────────────────────────────────────────────────────────

type Product = 'aFRR' | 'mFRR' | 'FCR';

interface ActivationCountry {
  afrr_p50: number | null;
  afrr_rate: number | null;
  mfrr_p50?: number | null;
  mfrr_rate?: number | null;
}

interface CapacityMonth {
  month: string;
  afrr_avg: number | null;
  mfrr_avg: number | null;
  fcr_avg: number | null;
  days: number;
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
  stress_index_p90?: number | null;
  source?: string | null;
  activation?: {
    lt?: ActivationCountry;
    lv?: ActivationCountry;
    ee?: ActivationCountry;
  } | null;
  capacity_monthly?: CapacityMonth[] | null;
  rolling_180d?: {
    products?: Record<string, {
      cap_avg?: number | null;
      act_avg?: number | null;
      days?: number;
    }>;
  } | null;
}

interface S2HistoryEntry {
  date: string;
  afrr_up: number | null;
  mfrr_up: number | null;
  fcr: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function heroValue(data: S2Signal, prod: Product): number | null {
  if (prod === 'aFRR') return data.afrr_up_avg ?? null;
  if (prod === 'mFRR') return data.mfrr_up_avg ?? null;
  return data.fcr_avg ?? null;
}

function historyField(prod: Product): keyof S2HistoryEntry {
  if (prod === 'aFRR') return 'afrr_up';
  if (prod === 'mFRR') return 'mfrr_up';
  return 'fcr';
}

type Phase = 'HIGH' | 'STABLE' | 'LOW';

function derivePhase(hero: number, act: ActivationCountry | undefined, prod: Product): { phase: Phase; sentiment: 'positive' | 'caution' | 'negative' } {
  // Compare today's clearing to activation P50 (a longer-term benchmark)
  const p50 = prod === 'mFRR' ? act?.mfrr_p50 : act?.afrr_p50;
  if (p50 == null) return { phase: 'STABLE', sentiment: 'caution' };
  if (hero > p50 * 1.3) return { phase: 'HIGH', sentiment: 'positive' };
  if (hero < p50 * 0.7) return { phase: 'LOW', sentiment: 'negative' };
  return { phase: 'STABLE', sentiment: 'caution' };
}

function fmtEuro(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  return '\u20AC' + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function timeAgo(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function S2Card() {
  const { status, data } = useSignal<S2Signal>(`${W}/s2`, { refreshInterval: REFRESH_WARM });
  const [history, setHistory] = useState<S2HistoryEntry[]>([]);
  const [prod, setProd] = useState<Product>('aFRR');
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

  // Fetch history separately (lightweight array)
  useEffect(() => {
    fetch(`${W}/s2/history`)
      .then(r => r.ok ? r.json() : [])
      .then((d: S2HistoryEntry[]) => { if (Array.isArray(d)) setHistory(d); })
      .catch(() => {});
  }, []);

  const hero = data ? heroValue(data, prod) : null;
  const ltAct = data?.activation?.lt;
  const { phase, sentiment } = useMemo(() => derivePhase(hero ?? 0, ltAct, prod), [hero, ltAct, prod]);

  if (status === 'loading' && !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Loading balancing data\u2026
        </p>
      </article>
    );
  }
  if (!data) return null;

  const capMonthly = data.capacity_monthly ?? [];

  return (
    <article style={{ padding: '24px' }}>
      {/* ── 1. Header ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          S2 · Balancing · LT/LV/EE
        </span>
        {data.timestamp && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            {timeAgo(data.timestamp)}
          </span>
        )}
        <ProductToggle value={prod} onChange={setProd} />
      </div>

      {/* ── 2. Hero metric ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
          {hero != null ? <AnimatedNumber value={hero} prefix={'\u20AC'} decimals={prod === 'FCR' ? 2 : 1} /> : '\u2014'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>/MW/h</span>
        {/* ── 3. Status chip ─────────────────────────────────── */}
        <StatusChip status={phase} sentiment={sentiment} />
      </div>

      {/* ── 4. Interpretation ───────────────────────────────────── */}
      <p style={{
        fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px',
      }}>
        {prod} capacity clearing at{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtEuro(hero)}/MW/h</span>.
        {data.imbalance_mean != null && (
          <> LT imbalance averaging{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.imbalance_mean)} MWh</span>
            {data.pct_above_100 != null && <> ({Math.round(data.pct_above_100)}% of periods above 100 MWh)</>}.
          </>
        )}
        {data.imbalance_p90 != null && (
          <> p90 stress at{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.imbalance_p90)} MWh</span>.
          </>
        )}
      </p>

      {/* ── 5. Rolling context — activation P50 per country ─────── */}
      {data.activation && (
        <div style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap',
          padding: '10px 0', marginBottom: '12px',
          borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          {([
            ['LT', data.activation.lt],
            ['LV', data.activation.lv],
            ['EE', data.activation.ee],
          ] as const).map(([cc, act]) => (
            <div key={cc} style={{ minWidth: '70px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cc}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
                aFRR {fmtEuro(act?.afrr_p50)}
              </div>
              {act?.mfrr_p50 != null && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  mFRR {fmtEuro(act.mfrr_p50)}
                </div>
              )}
            </div>
          ))}
          {data.rolling_180d?.products?.[prod]?.act_avg != null && (
            <div style={{ minWidth: '70px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>180d avg</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>{fmtEuro(data.rolling_180d!.products![prod]!.act_avg)}</div>
            </div>
          )}
        </div>
      )}

      {/* ── 6. Sparkline — 35-day history ───────────────────────── */}
      {history.length > 2 && <HistoryChart history={history} prod={prod} CC={CC} ttStyle={ttStyle} />}

      {/* ── 9. Impact line ──────────────────────────────────────── */}
      {hero != null && prod === 'aFRR' && (
        <p style={{
          fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)', lineHeight: 1.5, margin: '12px 0 8px',
        }}>
          At a{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>50 MW</span>{' '}
          aFRR offer, today&apos;s clearing implies{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {fmtEuro(Math.round(hero * 50 * 24 * 365 / 1000))}k
          </span>
          /year of reserved-capacity revenue.
        </p>
      )}

      {/* ── 10. Source footer ───────────────────────────────────── */}
      <SourceFooter
        source="BTD (Baltics TSOs)"
        updatedAt={data.timestamp ? timeAgo(data.timestamp) : undefined}
        dataClass="source"
      />

      {/* ── Drawer — capacity monthly + methodology ─────────────── */}
      <DetailsDrawer label="Capacity monthly + detail">
        {capMonthly.length > 0 && <CapacityChart monthly={capMonthly} prod={prod} CC={CC} ttStyle={ttStyle} />}
        <ContextTable data={data} />
      </DetailsDrawer>
    </article>
  );
}

// ── Product toggle ───────────────────────────────────────────────────────────

function ProductToggle({ value, onChange }: { value: Product; onChange: (p: Product) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px', marginLeft: 'auto' }}>
      {(['aFRR', 'mFRR', 'FCR'] as const).map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          cursor: 'pointer', border: '1px solid',
          borderColor: value === p ? 'var(--teal)' : 'var(--border-card)',
          borderRadius: '3px',
          background: value === p ? 'var(--teal-bg)' : 'transparent',
          color: value === p ? 'var(--teal)' : 'var(--text-secondary)',
          transition: 'all 0.15s',
        }}>{p}</button>
      ))}
    </span>
  );
}

// ── History line chart ───────────────────────────────────────────────────────

function HistoryChart({ history, prod, CC, ttStyle }: {
  history: S2HistoryEntry[];
  prod: Product;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
}) {
  const field = historyField(prod);
  const labels = history.map(h => fmtDate(h.date));
  const values = history.map(h => (h[field] as number | null) ?? null);
  const scales = buildScales(CC);

  return (
    <div style={{ height: '120px', marginBottom: '8px' }}>
      <Line
        data={{
          labels,
          datasets: [{
            label: prod,
            data: values,
            borderColor: CC.teal,
            backgroundColor: CC.fillTeal,
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0.3,
            fill: true,
            spanGaps: true,
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
                label: (item) => `${fmtEuro(item.raw as number)}/MW/h`,
              },
            },
          },
          scales: {
            ...scales,
            x: { ...scales.x, ticks: { ...scales.x.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { ...scales.y, ticks: { ...scales.y.ticks, callback: (v) => `\u20AC${v}` } },
          },
        }}
      />
    </div>
  );
}

// ── Capacity monthly bar chart ───────────────────────────────────────────────

function CapacityChart({ monthly, prod, CC, ttStyle }: {
  monthly: CapacityMonth[];
  prod: Product;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
}) {
  const field = prod === 'aFRR' ? 'afrr_avg' : prod === 'mFRR' ? 'mfrr_avg' : 'fcr_avg';
  const labels = monthly.map(m => fmtMonth(m.month));
  const values = monthly.map(m => (m[field as keyof CapacityMonth] as number | null) ?? null);
  const scales = buildScales(CC);

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Monthly {prod} capacity clearing <DataClassBadge dataClass="observed" />
      </div>
      <div style={{ height: '140px' }}>
        <Bar
          data={{
            labels,
            datasets: [{
              data: values,
              backgroundColor: CC.tealLight,
              borderColor: CC.teal,
              borderWidth: 0.5,
              borderRadius: 2,
              barPercentage: 0.7,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { ...ttStyle, callbacks: { label: (item) => `${fmtEuro(item.raw as number)}/MW/h` } } },
            scales: {
              ...scales,
              x: { ...scales.x, ticks: { ...scales.x.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
              y: { ...scales.y, ticks: { ...scales.y.ticks, callback: (v) => `\u20AC${v}` } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ── Context table (drawer) ───────────────────────────────────────────────────

function ContextTable({ data }: { data: S2Signal }) {
  const rows = [
    ['aFRR up avg', data.afrr_up_avg, '\u20AC/MW/h'],
    ['mFRR up avg', data.mfrr_up_avg, '\u20AC/MW/h'],
    ['FCR avg', data.fcr_avg, '\u20AC/MW/h'],
    ['Imbalance mean', data.imbalance_mean, 'MWh'],
    ['Imbalance p90', data.imbalance_p90, 'MWh'],
    ['% above 100 MWh', data.pct_above_100, '%'],
    ['% upward', data.pct_up, '%'],
  ] as const;

  return (
    <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        9-day BTD averages
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
        {rows.map(([label, val, unit]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{val != null ? (typeof val === 'number' ? (Math.abs(val) >= 10 ? Math.round(val) : val.toFixed(1)) : val) : '\u2014'}</span>
            <span style={{ color: 'var(--text-muted)' }}>{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
