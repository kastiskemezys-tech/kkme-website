'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import {
  AnimatedNumber, StatusChip, SourceFooter, DetailsDrawer, DrawerSection, DataClassBadge,
} from '@/app/components/primitives';
import type { DrawerHandle } from '@/app/components/primitives';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, LineController,
  Tooltip, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { CHART_FONT, useChartColors, useTooltipStyle, buildScales } from '@/app/lib/chartTheme';
import { freshnessLabel } from '@/app/lib/freshness';

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
  if (v == null) return '—';
  return '€' + (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));
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

type Pinned = { idx: number; date: string; value: number; swing: number | null } | null;

export function S2Card() {
  const { status, data, isRefreshing } = useSignal<S2Signal>(`${W}/s2`, { refreshInterval: REFRESH_WARM });
  const [history, setHistory] = useState<S2HistoryEntry[]>([]);
  const [prod, setProd] = useState<Product>('aFRR');
  const [country, setCountry] = useState<Country>('LT');
  const [pinned, setPinned] = useState<Pinned>(null);
  const flash = useRefreshFlash(isRefreshing);
  const drawerRef = useRef<DrawerHandle>(null);
  const openDrawer = (anchor: 'what' | 'how' | 'monthly' | 'bridge') => drawerRef.current?.open(anchor);
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

  // Fetch history separately (lightweight array) — used for FCR fallback
  useEffect(() => {
    fetch(`${W}/s2/history`)
      .then(r => r.ok ? r.json() : [])
      .then((d: S2HistoryEntry[]) => { if (Array.isArray(d)) setHistory(d); })
      .catch(() => {});
  }, []);

  // Reset pin on product/country change — idx no longer maps to the same day
  useEffect(() => { setPinned(null); }, [prod, country]);

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

      {/* ── 2. Hero metric (clickable → drawer `what`) ──────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <HeroButton onClick={() => openDrawer('what')} ariaLabel="Read how balancing capacity clearing is computed">
          {hero != null ? <AnimatedNumber value={hero} prefix={'€'} decimals={prod === 'FCR' ? 2 : 1} /> : '—'}
        </HeroButton>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>/MW/h</span>
        {/* ── 3. Status chip ─────────────────────────────────── */}
        <StatusChip status={phase} sentiment={sentiment} />
        {/* Activation-rate chiplet (muted n/a when upstream null) */}
        {prod !== 'FCR' && <RateChip rate={rate} onClick={() => openDrawer('what')} />}
      </div>

      {/* ── 4. Imbalance context tiles (→ `what` drawer) ────────── */}
      {(data.imbalance_mean != null || data.imbalance_p90 != null || data.pct_above_100 != null) && (
        <div style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap',
          padding: '10px 0', marginBottom: '12px',
          borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <TileButton
            onClick={() => openDrawer('what')}
            label="imb. mean"
            value={data.imbalance_mean != null ? `${Math.round(data.imbalance_mean)} MWh` : '—'}
          />
          <TileButton
            onClick={() => openDrawer('what')}
            label="imb. p90"
            value={data.imbalance_p90 != null ? `${Math.round(data.imbalance_p90)} MWh` : '—'}
          />
          <TileButton
            onClick={() => openDrawer('what')}
            label="% >100 MWh"
            value={data.pct_above_100 != null ? `${Math.round(data.pct_above_100)}%` : '—'}
          />
        </div>
      )}

      {/* ── 5. Sparkline — monthly P50 trajectory per country, or FCR daily (click-to-pin) ─ */}
      {prod === 'FCR'
        ? (history.length > 2 && <HistoryChart history={history} prod={prod} CC={CC} ttStyle={ttStyle} pinned={pinned} onPin={setPinned} />)
        : (monthly && Object.keys(monthly).length > 1 && <MonthlyTrajectoryChart monthly={monthly} country={country} prod={prod} CC={CC} ttStyle={ttStyle} pinned={pinned} onPin={setPinned} />)}

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

      {/* ── Drawer — narrative + methodology + monthly + bridge ─── */}
      <DetailsDrawer ref={drawerRef} label="Reading this card">
        <DrawerSection id="what" title="What this is">
          <S2WhatSection prod={prod} country={country} hero={hero} />
        </DrawerSection>
        <DrawerSection id="how" title="How we compute this">
          <S2HowSection />
        </DrawerSection>
        <DrawerSection id="monthly" title="Monthly trajectory — Baltic aggregate">
          {capMonthly.length > 0 ? <CapacityChart monthly={capMonthly} prod={prod} CC={CC} ttStyle={ttStyle} /> : <MutedLine text="No capacity history yet." />}
        </DrawerSection>
        <DrawerSection id="bridge" title="Country detail + BTD context">
          <ContextTable data={data} country={country} prod={prod} />
        </DrawerSection>
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
  const fresh = freshnessLabel(updatedAt);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <span
        className="pulse-dot"
        aria-label={updatedAt ? `Data ${fresh.age} (${fresh.label.toLowerCase()})` : 'Data freshness unknown'}
        style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: flash ? 'var(--amber)' : `var(${fresh.colorToken})`,
          transition: 'background 150ms ease',
          display: 'inline-block',
          opacity: fresh.label === 'LIVE' ? 1 : 0.7,
        }}
      />
      <span
        title={fresh.absolute}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-2xs, 10px)',
          color: `var(${fresh.colorToken})`,
          padding: '2px 6px',
          border: '1px solid var(--border-subtle)',
          borderRadius: '2px',
          letterSpacing: '0.06em',
        }}
      >
        {fresh.label}
      </span>
      {updatedAt && (
        <span
          title={fresh.absolute}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
            color: 'var(--text-primary)',
            cursor: 'help',
          }}
        >
          {fresh.age}
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

function RateChip({ rate, onClick }: { rate: number | null; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  if (rate == null) {
    // Muted branch — informational, no click target when data is absent.
    return (
      <span
        title="Activation rate not published for this country yet"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-2xs, 10px)',
          color: 'var(--text-muted)',
          padding: '2px 6px',
          border: '1px solid var(--border-subtle)',
          borderRadius: '2px',
          letterSpacing: '0.04em',
          marginLeft: '2px',
        }}
      >
        n/a
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      title="Share of periods cleared — read methodology"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-2xs, 10px)',
        color: 'var(--text-secondary)',
        padding: '2px 6px',
        border: '1px solid var(--border-subtle)',
        borderRadius: '2px',
        letterSpacing: '0.04em',
        marginLeft: '2px',
        background: 'transparent',
        cursor: 'pointer',
        textDecoration: hover ? 'underline' : 'none',
        textDecorationColor: 'var(--text-muted)',
        textUnderlineOffset: '3px',
      }}
    >
      {`${Math.round(rate * 100)}%`}
    </button>
  );
}

// ── Pinned readout (mirrors S1 pattern, no swing) ───────────────────────────

function PinReadout({ prefix, pinned, onClear, fmtKey }: {
  prefix: string;
  pinned: NonNullable<Pinned>;
  onClear: () => void;
  fmtKey: (raw: string) => string;
}) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: 'var(--text-secondary)',
        padding: '2px 0 10px',
      }}
    >
      <span style={{ color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Pinned</span>
      <span>
        {prefix} {fmtKey(pinned.date)}: <span style={{ color: 'var(--text-primary)' }}>{fmtEuro(pinned.value)}/MW/h</span>
      </span>
      <button
        onClick={onClear}
        style={{
          marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
          cursor: 'pointer', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-2xs, 10px)',
          textDecoration: 'underline',
        }}
      >
        unpin
      </button>
    </div>
  );
}

// ── History line chart (FCR) ────────────────────────────────────────────────

function HistoryChart({ history, prod, CC, ttStyle, pinned, onPin }: {
  history: S2HistoryEntry[];
  prod: Product;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
  pinned: Pinned;
  onPin: (p: Pinned) => void;
}) {
  const field = historyField(prod);
  const labels = history.map(h => fmtDate(h.date));
  const values = history.map(h => (h[field] as number | null) ?? null);
  const scales = buildScales(CC);

  return (
    <>
      <div style={{ height: '120px', marginBottom: pinned ? '4px' : '8px' }}>
        <Line
          data={{
            labels,
            datasets: [{
              label: prod,
              data: values,
              borderColor: CC.teal,
              backgroundColor: CC.fillTeal,
              borderWidth: 1.5,
              pointRadius: values.map((_, i) => (pinned?.idx === i ? 4 : 0)),
              pointHoverRadius: 3,
              pointBackgroundColor: CC.teal,
              pointBorderColor: CC.teal,
              tension: 0.3,
              fill: true,
              spanGaps: true,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
              if (!elements || elements.length === 0) {
                onPin(null);
                return;
              }
              const idx = elements[0].index;
              const entry = history[idx];
              const val = values[idx];
              if (!entry || val == null) return;
              if (pinned?.idx === idx) {
                onPin(null);
              } else {
                onPin({ idx, date: entry.date, value: val, swing: null });
              }
            },
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
              y: { ...scales.y, ticks: { ...scales.y.ticks, callback: (v) => `€${v}` } },
            },
          }}
        />
      </div>
      {pinned && (
        <PinReadout
          prefix="FCR"
          pinned={pinned}
          onClear={() => onPin(null)}
          fmtKey={fmtDate}
        />
      )}
    </>
  );
}

// ── Monthly P50 trajectory (per-country, per-product) ───────────────────────

function MonthlyTrajectoryChart({ monthly, country, prod, CC, ttStyle, pinned, onPin }: {
  monthly: Record<string, MonthlyStat>;
  country: Country;
  prod: Product;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
  pinned: Pinned;
  onPin: (p: Pinned) => void;
}) {
  const months = Object.keys(monthly).sort();
  const labels = months.map(fmtMonth);
  const values = months.map(m => monthly[m]?.p50 ?? null);
  const scales = buildScales(CC);

  return (
    <>
      <div style={{ height: '120px', marginBottom: pinned ? '4px' : '8px' }}>
        <Line
          data={{
            labels,
            datasets: [{
              label: `${country} ${prod} P50`,
              data: values,
              borderColor: CC.teal,
              backgroundColor: CC.fillTeal,
              borderWidth: 1.5,
              pointRadius: values.map((_, i) => (pinned?.idx === i ? 4 : 2)),
              pointHoverRadius: 4,
              pointBackgroundColor: CC.teal,
              pointBorderColor: CC.teal,
              tension: 0.3,
              fill: true,
              spanGaps: true,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_evt, elements) => {
              if (!elements || elements.length === 0) {
                onPin(null);
                return;
              }
              const idx = elements[0].index;
              const key = months[idx];
              const val = values[idx];
              if (!key || val == null) return;
              if (pinned?.idx === idx) {
                onPin(null);
              } else {
                onPin({ idx, date: key, value: val, swing: null });
              }
            },
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
      {pinned && (
        <PinReadout
          prefix={`${country} ${prod}`}
          pinned={pinned}
          onClear={() => onPin(null)}
          fmtKey={fmtMonth}
        />
      )}
    </>
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
              y: { ...scales.y, ticks: { ...scales.y.ticks, callback: (v) => `€${v}` } },
            },
          }}
        />
      </div>
    </div>
  );
}

// ── Context table (drawer) ───────────────────────────────────────────────────

function ContextTable({ data, country, prod }: { data: S2Signal; country: Country; prod: Product }) {
  const act = data.activation?.[COUNTRY_KEY[country]];
  const countryP50 = prod === 'FCR' ? null : (prod === 'aFRR' ? act?.afrr_p50 ?? null : act?.mfrr_p50 ?? null);
  const countryRate = prod === 'FCR' ? null : (prod === 'aFRR' ? act?.afrr_rate ?? null : act?.mfrr_rate ?? null);

  const balticRows = [
    ['aFRR up avg', data.afrr_up_avg, '€/MW/h'],
    ['mFRR up avg', data.mfrr_up_avg, '€/MW/h'],
    ['FCR avg', data.fcr_avg, '€/MW/h'],
    ['Imbalance mean', data.imbalance_mean, 'MWh'],
    ['Imbalance p90', data.imbalance_p90, 'MWh'],
    ['% above 100 MWh', data.pct_above_100, '%'],
    ['% upward', data.pct_up, '%'],
  ] as const;

  const labelStyle = { color: 'var(--text-muted)' };
  const valueStyle = { color: 'var(--text-primary)', textAlign: 'right' as const };
  const unitStyle = { color: 'var(--text-muted)' };

  return (
    <div style={{ paddingTop: '4px' }}>
      {/* Country-prefixed header rows */}
      {prod !== 'FCR' && (
        <>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            {country} {prod} — country-scoped
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '12px' }}>
            <span style={labelStyle}>{country} {prod} P50</span>
            <span style={valueStyle}>{countryP50 != null ? (Math.abs(countryP50) >= 10 ? Math.round(countryP50) : countryP50.toFixed(1)) : '—'}</span>
            <span style={unitStyle}>€/MW/h</span>

            <span style={labelStyle}>{country} {prod} rate</span>
            <span style={{ ...valueStyle, color: countryRate == null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
              {countryRate != null ? `${Math.round(countryRate * 100)}` : 'n/a'}
            </span>
            <span style={unitStyle}>%</span>
          </div>
        </>
      )}

      {/* Baltic-wide averages caption + 9-day rows */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-2xs, 10px)',
        color: 'var(--text-muted)', letterSpacing: '0.04em',
        marginBottom: '6px',
      }}>
        Imbalance &amp; Baltic-wide averages:
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '2px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
        {balticRows.map(([label, val, unit]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span style={labelStyle}>{label}</span>
            <span style={valueStyle}>{val != null ? (typeof val === 'number' ? (Math.abs(val) >= 10 ? Math.round(val) : val.toFixed(1)) : val) : '—'}</span>
            <span style={unitStyle}>{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hero button (keeps AnimatedNumber intact, adds hover underline) ─────────

function HeroButton({ children, onClick, ariaLabel }: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 1,
        textDecoration: hover ? 'underline' : 'none',
        textDecorationColor: 'var(--text-muted)',
        textUnderlineOffset: '4px',
        textDecorationThickness: '1px',
      }}
    >
      {children}
    </button>
  );
}

// ── Tile button (imbalance tiles → drawer) ──────────────────────────────────

function TileButton({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        minWidth: '72px',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
        color: hover ? 'var(--text-secondary)' : 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        transition: 'color 0.12s',
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)',
        color: 'var(--text-primary)',
        textDecoration: hover ? 'underline' : 'none',
        textDecorationColor: 'var(--text-muted)',
        textUnderlineOffset: '3px',
      }}>{value}</div>
    </button>
  );
}

// ── Drawer content: narrative sections ───────────────────────────────────────

function MutedLine({ text }: { text: string }) {
  return (
    <p style={{
      fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
      color: 'var(--text-muted)', margin: 0,
    }}>
      {text}
    </p>
  );
}

function DrawerProse({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
      color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 8px',
    }}>
      {children}
    </p>
  );
}

function S2WhatSection({ prod, country, hero }: {
  prod: Product;
  country: Country;
  hero: number | null;
}) {
  return (
    <>
      <DrawerProse>
        {country} {prod} clears at{' '}
        <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fmtEuro(hero)}/MW/h</strong>{' '}
        on a 7-day rolling P50.
      </DrawerProse>
      <DrawerProse>
        This is capacity payment — paid per MW offered per hour, regardless of activation.
      </DrawerProse>
    </>
  );
}

function S2HowSection() {
  return (
    <ul style={{
      fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
      color: 'var(--text-secondary)', lineHeight: 1.6,
      margin: '0 0 8px', paddingLeft: '18px',
    }}>
      <li>7-day rolling P50 of capacity clearing prices, per country, per product.</li>
      <li>aFRR / mFRR / FCR are reserve products; LT has the richest mix, LV/EE are aFRR-dominated.</li>
      <li>
        Source: BTD —{' '}
        <a href="https://api-baltic.transparency-dashboard.eu" target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)' }}>api-baltic.transparency-dashboard.eu</a>
        , polled every 20 minutes.
      </li>
    </ul>
  );
}
