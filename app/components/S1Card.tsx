'use client';

import { Fragment, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { S1CaptureData, CaptureRolling, DailyCaptureEntry, MonthlyCapture, GrossToNetLine } from '@/lib/signals/s1';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
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
import { leftSkewFootnote } from '@/app/lib/distributionShape';
import { formatHourEET } from '@/app/lib/hourLabels';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, LineController, Tooltip, Filler);

const W = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── Helpers ──────────────────────────────────────────────────────────────────

type Duration = '2h' | '4h';

function gross(cap: S1CaptureData | null, dur: Duration): number | null {
  if (!cap) return null;
  return dur === '2h'
    ? (cap.gross_2h ?? cap.capture_2h?.gross_eur_mwh ?? null)
    : (cap.gross_4h ?? cap.capture_4h?.gross_eur_mwh ?? null);
}

function rollingStats(cap: S1CaptureData | null, dur: Duration): CaptureRolling | null {
  return dur === '2h' ? cap?.rolling_30d?.stats_2h ?? null : cap?.rolling_30d?.stats_4h ?? null;
}

type Phase = 'OPEN' | 'TIGHTENING' | 'COMPRESSED';

function derivePhase(hero: number, stats: CaptureRolling | null): { phase: Phase; sentiment: 'positive' | 'caution' | 'negative' } {
  if (!stats) return { phase: 'TIGHTENING', sentiment: 'caution' };
  if (hero >= stats.p75) return { phase: 'OPEN', sentiment: 'positive' };
  if (hero >= stats.p25) return { phase: 'TIGHTENING', sentiment: 'caution' };
  return { phase: 'COMPRESSED', sentiment: 'negative' };
}

function fmtEuro(v: number | null | undefined): string {
  if (v == null) return '—';
  return '€' + Math.round(v);
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

export function S1Card() {
  const { status, data: cap, isRefreshing } = useSignal<S1CaptureData>(`${W}/s1/capture`, { refreshInterval: REFRESH_HOT });
  const [dur, setDur] = useState<Duration>('2h');
  const [pinned, setPinned] = useState<{ idx: number; date: string; value: number; swing: number | null } | null>(null);
  const flash = useRefreshFlash(isRefreshing);
  const drawerRef = useRef<DrawerHandle>(null);
  const openDrawer = (anchor: 'what' | 'how' | 'monthly' | 'bridge') => drawerRef.current?.open(anchor);
  const CC = useChartColors();
  const ttStyle = useTooltipStyle(CC);

  const heroVal = gross(cap, dur);
  const stats = rollingStats(cap, dur);
  const { phase, sentiment } = useMemo(() => derivePhase(heroVal ?? 0, stats), [heroVal, stats]);

  // Loading / error state
  if (status === 'loading' && !cap) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Loading DA capture data\u2026
        </p>
      </article>
    );
  }
  if (!cap) return null;

  const history = cap.history ?? [];
  const monthly = cap.monthly ?? [];

  return (
    <article style={{ padding: '24px' }}>
      {/* ── 1. Header ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          S1 · DA Arbitrage · Lithuania
        </span>
        <LiveSignal updatedAt={cap.updated_at} source="energy-charts.info" flash={flash} />
        <DurationToggle value={dur} onChange={setDur} />
      </div>

      {/* ── 2. Hero metric (clickable → drawer `what`) ──────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <HeroButton onClick={() => openDrawer('what')} ariaLabel="Read how gross capture is computed">
          {heroVal != null ? <AnimatedNumber value={heroVal} prefix={'€'} decimals={0} /> : '—'}
        </HeroButton>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>/MWh</span>
        {/* ── 3. Status chip ─────────────────────────────────── */}
        <StatusChip status={phase} sentiment={sentiment} />
      </div>

      {/* ── 4. Rolling context strip (tiles → `what` drawer) ────── */}
      {stats && (
        <>
          <div style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap',
            padding: '10px 0', marginBottom: '4px',
            borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)',
          }}>
            {([
              ['mean', stats.mean],
              ['p25', stats.p25],
              ['p50', stats.p50],
              ['p75', stats.p75],
              ['p90', stats.p90],
            ] as const).map(([label, val]) => (
              <TileButton key={label} onClick={() => openDrawer('what')} label={label} value={fmtEuro(val)} />
            ))}
            <TileButton onClick={() => openDrawer('what')} label="days" value={String(stats.days)} />
          </div>
          {(() => {
            const note = leftSkewFootnote({
              mean: stats.mean, p25: stats.p25, p50: stats.p50, p75: stats.p75, p90: stats.p90, days: stats.days,
            });
            if (!note) return null;
            return (
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.5625rem',
                color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5,
              }}>
                {note}
              </p>
            );
          })()}
        </>
      )}

      {/* ── 6. Sparkline — 30-day gross capture (click-to-pin) ──── */}
      {history.length > 2 && (
        <Sparkline
          history={history}
          dur={dur}
          stats={stats}
          CC={CC}
          ttStyle={ttStyle}
          pinned={pinned}
          onPin={setPinned}
        />
      )}

      {/* ── 8. Impact line ──────────────────────────────────────── */}
      {heroVal != null && (
        <p style={{
          fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)', lineHeight: 1.5, margin: '12px 0 8px',
        }}>
          At a{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>100 MW / {dur}</span>{' '}
          plant, today&apos;s gross capture implies{' '}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {fmtEuro(Math.round(heroVal * (dur === '2h' ? 200 : 400) / 100) * 100)}
          </span>
          /day of arbitrage optionality.
        </p>
      )}

      {/* ── 9. Source footer ────────────────────────────────────── */}
      <SourceFooter
        source="energy-charts.info (Fraunhofer ISE)"
        updatedAt={cap.updated_at ? timeAgo(cap.updated_at) : undefined}
        dataClass="derived"
      />

      {/* ── 10. Drawer — narrative + history ────────────────────── */}
      <DetailsDrawer ref={drawerRef} label="Reading this card">
        <DrawerSection id="what" title="What this is">
          <S1WhatSection heroVal={heroVal} stats={stats} dur={dur} />
        </DrawerSection>
        <DrawerSection id="how" title="How we compute this">
          <S1HowSection />
        </DrawerSection>
        <DrawerSection id="monthly" title="Monthly trajectory">
          {monthly.length > 0 ? <MonthlyChart monthly={monthly} dur={dur} CC={CC} ttStyle={ttStyle} /> : <MutedLine text="No monthly history yet." />}
        </DrawerSection>
        <DrawerSection id="bridge" title="Gross → Net bridge">
          {cap.gross_to_net && cap.gross_to_net.length > 0
            ? <BridgeChart bridge={cap.gross_to_net} chargePrice={cap.capture_2h?.avg_charge ?? null} rte={cap.capture_2h?.rte ?? 0.875} CC={CC} />
            : <MutedLine text="No bridge data yet." />}
          {cap.shape && <ShapeRow shape={cap.shape} refIso={cap.updated_at} />}
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

// ── Duration toggle ──────────────────────────────────────────────────────────

function DurationToggle({ value, onChange }: { value: Duration; onChange: (d: Duration) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: '2px', marginLeft: 'auto' }}>
      {(['2h', '4h'] as const).map(d => (
        <button key={d} onClick={() => onChange(d)} style={{
          padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          cursor: 'pointer', border: '1px solid',
          borderColor: value === d ? 'var(--teal)' : 'var(--border-card)',
          borderRadius: '3px',
          background: value === d ? 'var(--teal-bg)' : 'transparent',
          color: value === d ? 'var(--teal)' : 'var(--text-secondary)',
          transition: 'all 0.15s',
        }}>{d}</button>
      ))}
    </span>
  );
}

// ── Sparkline chart (click-to-pin) ───────────────────────────────────────────

type Pinned = { idx: number; date: string; value: number; swing: number | null } | null;

function Sparkline({ history, dur, stats, CC, ttStyle, pinned, onPin }: {
  history: DailyCaptureEntry[];
  dur: Duration;
  stats: CaptureRolling | null;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
  pinned: Pinned;
  onPin: (p: Pinned) => void;
}) {
  const field = dur === '2h' ? 'gross_2h' : 'gross_4h';
  const labels = history.map(h => fmtDate(h.date));
  const values = history.map(h => (h[field as keyof DailyCaptureEntry] as number | null) ?? null);

  const datasets: Array<Record<string, unknown>> = [
    {
      label: `Gross ${dur}`,
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
    },
  ];

  // P50 reference line
  if (stats?.p50 != null) {
    datasets.push({
      label: 'p50',
      data: values.map(() => stats.p50),
      borderColor: CC.textFaint,
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
    });
  }

  const scales = buildScales(CC);

  return (
    <>
    <div style={{ height: '120px', marginBottom: pinned ? '4px' : '8px' }}>
      <Line
        data={{ labels, datasets: datasets as never }}
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
              onPin({ idx, date: entry.date, value: val, swing: entry.swing });
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...ttStyle,
              callbacks: {
                title: (items) => labels[items[0].dataIndex],
                label: (item) => `${fmtEuro(item.raw as number)}/MWh`,
              },
            },
          },
          scales: {
            ...scales,
            x: {
              ...scales.x,
              ticks: {
                ...scales.x.ticks,
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 6,
              },
            },
            y: {
              ...scales.y,
              ticks: {
                ...scales.y.ticks,
                callback: (v) => `€${v}`,
              },
            },
          },
        }}
      />
    </div>
    {pinned && (
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
        <span>{fmtDate(pinned.date)}: <span style={{ color: 'var(--text-primary)' }}>{fmtEuro(pinned.value)}/MWh</span></span>
        {pinned.swing != null && <span style={{ color: 'var(--text-muted)' }}>swing {fmtEuro(pinned.swing)}</span>}
        <button
          onClick={() => onPin(null)}
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
    )}
    </>
  );
}

// ── Monthly bar chart ────────────────────────────────────────────────────────

function MonthlyChart({ monthly, dur, CC, ttStyle }: {
  monthly: MonthlyCapture[];
  dur: Duration;
  CC: ReturnType<typeof useChartColors>;
  ttStyle: ReturnType<typeof useTooltipStyle>;
}) {
  const field = dur === '2h' ? 'avg_gross_2h' : 'avg_gross_4h';
  const labels = monthly.map(m => fmtMonth(m.month));
  const values = monthly.map(m => (m[field as keyof MonthlyCapture] as number | null) ?? null);
  const scales = buildScales(CC);

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Monthly avg gross {dur} <DataClassBadge dataClass="derived" />
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
            plugins: { legend: { display: false }, tooltip: { ...ttStyle, callbacks: { label: (item) => `${fmtEuro(item.raw as number)}/MWh` } } },
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

// ── Gross→Net bridge ─────────────────────────────────────────────────────────

function BridgeChart({ bridge, chargePrice, rte, CC }: {
  bridge: GrossToNetLine[];
  chargePrice: number | null;
  rte: number;
  CC: ReturnType<typeof useChartColors>;
}) {
  // Loss fraction applied on the charge leg (e.g. 0.875 round-trip → 12.5%).
  const lossFrac = Math.max(0, 1 - rte);
  const lossPct = Math.round(lossFrac * 1000) / 10; // one decimal: 12.5
  const charge = chargePrice ?? 0;
  // Today's RTE €/MWh contribution: lossFrac × charge price (the formula the
  // bridge silently applies). Negative or near-zero charge → near-zero loss,
  // which is mathematically correct but presentationally confusing — hence
  // the explicit formula + typical-day anchor below.
  const todayLoss = lossFrac * charge;
  const typicalCharge = 30;
  const typicalLoss = lossFrac * typicalCharge;
  const fmtChargeEuro = (v: number): string => `€${Math.abs(v) < 0.5 ? v.toFixed(2) : Math.round(v)}`;

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Gross → Net bridge (2h)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {bridge.map((line, i) => (
          <Fragment key={i}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              padding: '2px 0',
              color: line.type === 'result' ? 'var(--text-primary)' : line.type === 'deduction' ? 'var(--rose)' : 'var(--text-secondary)',
              fontWeight: line.type === 'result' ? 600 : 400,
            }}>
              <span>{line.label}</span>
              <span>{line.value >= 0 ? '+' : ''}{fmtEuro(line.value)}</span>
            </div>
            {line.type === 'deduction' && line.label.startsWith('RTE loss') && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-2xs, 10px)',
                color: 'var(--text-muted)', padding: '0 0 6px', lineHeight: 1.5,
              }}>
                <div>
                  = {lossPct}% × charge price ({fmtChargeEuro(charge)} today) = {fmtChargeEuro(todayLoss)}/MWh
                </div>
                <div>
                  Typical: €{typicalCharge} charge → ≈ €{typicalLoss.toFixed(typicalLoss < 10 ? 1 : 0)}/MWh
                </div>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Price shape summary ──────────────────────────────────────────────────────

function ShapeRow({ shape, refIso }: { shape: NonNullable<S1CaptureData['shape']>; refIso?: string | null }) {
  return (
    <div style={{
      display: 'flex', gap: '16px', flexWrap: 'wrap',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
      paddingTop: '8px', borderTop: '1px solid var(--border-subtle)',
    }}>
      <span>Peak {formatHourEET(shape.peak_hour, refIso)} {fmtEuro(shape.peak_price)}</span>
      <span>Trough {formatHourEET(shape.trough_hour, refIso)} {fmtEuro(shape.trough_price)}</span>
      <span>Swing {fmtEuro(shape.swing)}</span>
      {shape.evening_premium != null && <span>Eve premium {fmtEuro(shape.evening_premium)}</span>}
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

// ── Tile button (percentile / imbalance tiles → drawer) ──────────────────────

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
        minWidth: '48px',
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

function S1WhatSection({ heroVal, stats, dur }: {
  heroVal: number | null;
  stats: CaptureRolling | null;
  dur: Duration;
}) {
  const bucket = useMemo(() => {
    if (heroVal == null || !stats) return null;
    if (heroVal >= stats.p90) return 'p90+';
    if (heroVal >= stats.p75) return 'p75–p90';
    if (heroVal >= stats.p50) return 'p50–p75';
    if (heroVal >= stats.p25) return 'p25–p50';
    return '<p25';
  }, [heroVal, stats]);

  return (
    <DrawerProse>
      Today&rsquo;s gross {dur} capture is{' '}
      <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fmtEuro(heroVal)}/MWh</strong>
      {bucket && <>, in the <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{bucket}</strong> band of the rolling 30-day distribution</>}
      .
    </DrawerProse>
  );
}

function S1HowSection() {
  return (
    <ul style={{
      fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
      color: 'var(--text-secondary)', lineHeight: 1.6,
      margin: '0 0 8px', paddingLeft: '18px',
    }}>
      <li>Peak-2h average price minus trough-2h average, on day-ahead clearing prices.</li>
      <li>85% round-trip efficiency applied on the charge leg (gross → net).</li>
      <li>
        Source:{' '}
        <a href="https://energy-charts.info" target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)' }}>energy-charts.info</a>
        {' '}(Fraunhofer ISE), polled every 5 minutes.
      </li>
    </ul>
  );
}
