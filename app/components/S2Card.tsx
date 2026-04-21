'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
type Country = 'LT' | 'LV' | 'EE';

const COUNTRY_KEY: Record<Country, 'lt' | 'lv' | 'ee'> = { LT: 'lt', LV: 'lv', EE: 'ee' };

interface ActivationCountry {
  afrr_p50: number | null;
  afrr_rate: number | null;
  mfrr_p50?: number | null;
  mfrr_rate?: number | null;
}

interface MonthlyStat {
  avg: number | null;
  p50: number | null;
  p90: number | null;
  count: number | null;
  activation_rate: number | null;
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
    lt_monthly_afrr?: Record<string, MonthlyStat> | null;
    lt_monthly_mfrr?: Record<string, MonthlyStat> | null;
    lv_monthly_afrr?: Record<string, MonthlyStat> | null;
    lv_monthly_mfrr?: Record<string, MonthlyStat> | null;
    ee_monthly_afrr?: Record<string, MonthlyStat> | null;
    ee_monthly_mfrr?: Record<string, MonthlyStat> | null;
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

function heroValue(data: S2Signal, prod: Product, country: Country): number | null {
  if (prod === 'FCR') return data.fcr_avg ?? null;
  const act = data.activation?.[COUNTRY_KEY[country]];
  if (!act) return null;
  return prod === 'aFRR' ? (act.afrr_p50 ?? null) : (act.mfrr_p50 ?? null);
}

function activationRate(data: S2Signal, prod: Product, country: Country): number | null {
  if (prod === 'FCR') return null;
  const act = data.activation?.[COUNTRY_KEY[country]];
  if (!act) return null;
  return prod === 'aFRR' ? (act.afrr_rate ?? null) : (act.mfrr_rate ?? null);
}

function monthlySeries(data: S2Signal, prod: Product, country: Country): Record<string, MonthlyStat> | null {
  if (prod === 'FCR') return null;
  const key = `${COUNTRY_KEY[country]}_monthly_${prod === 'aFRR' ? 'afrr' : 'mfrr'}` as const;
  const series = data.activation?.[key as keyof NonNullable<S2Signal['activation']>];
  return (series && typeof series === 'object' && !Array.isArray(series)) ? (series as Record<string, MonthlyStat>) : null;
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
  const { status, data, isRefreshing } = useSignal<S2Signal>(`${W}/s2`, { refreshInterval: REFRESH_WARM });
  const [history, setHistory] = useState<S2HistoryEntry[]>([]);
  const [prod, setProd] = useState<Product>('aFRR');
  const [country, setCountry] = useState<Country>('LT');
  const flash = useRefreshFlash(isRefreshing);
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

  // Fetch history separately (lightweight array) — used for FCR fallback
  useEffect(() => {
    fetch(`${W}/s2/history`)
      .then(r => r.ok ? r.json() : [])
      .then((d: S2HistoryEntry[]) => { if (Array.isArray(d)) setHistory(d); })
      .catch(() => {});
  }, []);

  const hero = data ? heroValue(data, prod, country) : null;
  const rate = data ? activationRate(data, prod, country) : null;
  const activeAct = data?.activation?.[COUNTRY_KEY[country]];
  const { phase, sentiment } = useMemo(() => derivePhase(hero ?? 0, activeAct, prod), [hero, activeAct, prod]);
  const monthly = data ? monthlySeries(data, prod, country) : null;

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
        <LiveSignal updatedAt={data.timestamp} source="BTD" flash={flash} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <ProductToggle value={prod} onChange={setProd} />
          <span aria-hidden="true" style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
          <CountryToggle value={country} onChange={setCountry} disabled={prod === 'FCR'} />
        </span>
      </div>

      {/* ── 2. Hero metric ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
          {hero != null ? <AnimatedNumber value={hero} prefix={'\u20AC'} decimals={prod === 'FCR' ? 2 : 1} /> : '\u2014'}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>/MW/h</span>
        {/* ── 3. Status chip ─────────────────────────────────── */}
        <StatusChip status={phase} sentiment={sentiment} />
        {/* Activation-rate chiplet (muted n/a when upstream null) */}
        {prod !== 'FCR' && <RateChip rate={rate} />}
      </div>

      {/* ── 4. Imbalance context strip ──────────────────────────── */}
      {(data.imbalance_mean != null || data.imbalance_p90 != null || data.pct_above_100 != null) && (
        <div style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap',
          padding: '10px 0', marginBottom: '12px',
          borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ minWidth: '72px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>imb. mean</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
              {data.imbalance_mean != null ? `${Math.round(data.imbalance_mean)} MWh` : '—'}
            </div>
          </div>
          <div style={{ minWidth: '72px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>imb. p90</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
              {data.imbalance_p90 != null ? `${Math.round(data.imbalance_p90)} MWh` : '—'}
            </div>
          </div>
          <div style={{ minWidth: '72px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>% &gt;100 MWh</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
              {data.pct_above_100 != null ? `${Math.round(data.pct_above_100)}%` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Sparkline — monthly P50 trajectory per country, or FCR daily ─ */}
      {prod === 'FCR'
        ? (history.length > 2 && <HistoryChart history={history} prod={prod} CC={CC} ttStyle={ttStyle} />)
        : (monthly && Object.keys(monthly).length > 1 && <MonthlyTrajectoryChart monthly={monthly} country={country} prod={prod} CC={CC} ttStyle={ttStyle} />)}

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

// ── Live-signal row (pulse dot + timestamp + source chip) ───────────────────

function useRefreshFlash(isRefreshing: boolean): boolean {
  const [flash, setFlash] = useState(false);
  const prev = useRef(false);
  useEffect(() => {
    if (isRefreshing && !prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 300);
      prev.current = true;
      return () => clearTimeout(t);
    }
    if (!isRefreshing) prev.current = false;
  }, [isRefreshing]);
  return flash;
}

function LiveSignal({ updatedAt, source, flash }: { updatedAt?: string | null; source: string; flash: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <span
        className="pulse-dot"
        aria-label={updatedAt ? `Live data; last update ${timeAgo(updatedAt)}` : 'Live data'}
        style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: flash ? 'var(--amber)' : 'var(--teal)',
          transition: 'background 150ms ease',
          display: 'inline-block',
        }}
      />
      {updatedAt && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
          color: 'var(--text-primary)',
        }}>
          {timeAgo(updatedAt)}
        </span>
      )}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-2xs, 10px)',
        color: 'var(--text-tertiary)',
        padding: '2px 6px',
        border: '1px solid var(--border-subtle)',
        borderRadius: '2px',
        letterSpacing: '0.04em',
      }}>
        {source}
      </span>
    </span>
  );
}

// ── Product toggle ───────────────────────────────────────────────────────────

function ProductToggle({ value, onChange }: { value: Product; onChange: (p: Product) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
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

// ── Country toggle ───────────────────────────────────────────────────────────

function CountryToggle({ value, onChange, disabled }: {
  value: Country; onChange: (c: Country) => void; disabled: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }} aria-disabled={disabled}>
      {(['LT', 'LV', 'EE'] as const).map(c => {
        const active = !disabled && value === c;
        return (
          <button
            key={c}
            onClick={() => !disabled && onChange(c)}
            disabled={disabled}
            style={{
              padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              cursor: disabled ? 'not-allowed' : 'pointer', border: '1px solid',
              borderColor: active ? 'var(--teal)' : 'var(--border-card)',
              borderRadius: '3px',
              background: active ? 'var(--teal-bg)' : 'transparent',
              color: disabled ? 'var(--text-muted)' : (active ? 'var(--teal)' : 'var(--text-secondary)'),
              opacity: disabled ? 0.45 : 1,
              transition: 'all 0.15s',
            }}
          >{c}</button>
        );
      })}
    </span>
  );
}

// ── Rate chiplet (next to hero) ──────────────────────────────────────────────

function RateChip({ rate }: { rate: number | null }) {
  const muted = rate == null;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-2xs, 10px)',
      color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      padding: '2px 6px',
      border: '1px solid var(--border-subtle)',
      borderRadius: '2px',
      letterSpacing: '0.04em',
      marginLeft: '2px',
    }} title={muted ? 'Activation rate not published for this country yet' : 'Share of periods cleared'}>
      {muted ? 'n/a' : `${Math.round(rate * 100)}%`}
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

// ── Monthly P50 trajectory (per-country, per-product) ───────────────────────

function MonthlyTrajectoryChart({ monthly, country, prod, CC, ttStyle }: {
  monthly: Record<string, MonthlyStat>;
  country: Country;
  prod: Product;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
}) {
  const months = Object.keys(monthly).sort();
  const labels = months.map(fmtMonth);
  const values = months.map(m => monthly[m]?.p50 ?? null);
  const scales = buildScales(CC);

  return (
    <div style={{ height: '120px', marginBottom: '8px' }}>
      <Line
        data={{
          labels,
          datasets: [{
            label: `${country} ${prod} P50`,
            data: values,
            borderColor: CC.teal,
            backgroundColor: CC.fillTeal,
            borderWidth: 1.5,
            pointRadius: 2,
            pointHoverRadius: 4,
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
                label: (item) => `${country} ${prod} ${fmtEuro(item.raw as number)}/MW/h`,
              },
            },
          },
          scales: {
            ...scales,
            x: { ...scales.x, ticks: { ...scales.x.ticks, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { ...scales.y, ticks: { ...scales.y.ticks, callback: (v) => `€${v}` } },
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
