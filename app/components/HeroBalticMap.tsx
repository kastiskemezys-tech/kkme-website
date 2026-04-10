'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(MotionPathPlugin);

const W = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ═══ Types ═══════════════════════════════════════════════════════════════════

interface FleetCountry { operational_mw: number; pipeline_mw: number; weighted_mw: number }
interface FleetData {
  sd_ratio?: number | null;
  phase?: string | null;
  cpi?: number | null;
  baltic_operational_mw?: number | null;
  baltic_pipeline_mw?: number | null;
  eff_demand_mw?: number | null;
  countries?: Record<string, FleetCountry>;
}
interface LiveRate {
  today_total_daily?: number;
  today_trading_daily?: number;
  today_balancing_daily?: number;
  base_daily?: number;
  delta_pct?: number;
  annualised?: number;
  capture_used?: number;
  as_of?: string;
}
interface RevenueData {
  live_rate?: LiveRate;
  project_irr?: number;
  equity_irr?: number;
  ebitda_y1?: number;
  min_dscr?: number;
  capex_eur_kwh?: number;
  cod_year?: number;
  duration?: number;
}
interface S8Data {
  nordbalt_avg_mw?: number | null;
  litpol_avg_mw?: number | null;
  ltlv_avg_mw?: number | null;
  nordbalt_signal?: string | null;
  litpol_signal?: string | null;
  ltlv_signal?: string | null;
}
interface CaptureHistory { date: string; gross_4h?: number; gross_2h?: number }
interface S1CaptureData { history?: CaptureHistory[]; capture_4h?: { gross_eur_mwh: number } }
interface ReadData {
  capture?: { gross_4h?: number; net_4h?: number };
  bess_net_capture?: number;
  updated_at?: string;
}

// ═══ Map geometry (viewBox 1024×1332) ════════════════════════════════════════

const CABLES: { id: string; d: string; field: keyof S8Data; label: string }[] = [
  { id: 'nordbalt', d: 'M 240,660 C 300,670 380,685 470,695', field: 'nordbalt_avg_mw', label: 'NORDBALT' },
  { id: 'litpol', d: 'M 530,890 C 525,915 520,940 510,960', field: 'litpol_avg_mw', label: 'LITPOL' },
  { id: 'ltlv', d: 'M 610,670 C 630,650 660,630 690,610', field: 'ltlv_avg_mw', label: 'LT↔LV' },
];

const COUNTRY_RINGS: { key: string; cx: number; cy: number }[] = [
  { key: 'LT', cx: 580, cy: 770 },
  { key: 'LV', cx: 700, cy: 550 },
  { key: 'EE', cx: 700, cy: 320 },
];

const PROJECT_DOTS = [
  { cx: 540, cy: 770, label: 'Energy Cells Kruonis' },
  { cx: 560, cy: 745, label: 'E energija' },
  { cx: 640, cy: 810, label: 'Olana Šalčininkai' },
  { cx: 830, cy: 530, label: 'AST Rēzekne' },
  { cx: 610, cy: 545, label: 'AST Tume' },
  { cx: 625, cy: 590, label: 'European Energy Saldus' },
  { cx: 660, cy: 295, label: 'BSP Hertz Kiisa' },
  { cx: 800, cy: 290, label: 'Eesti Energia Auvere' },
  { cx: 720, cy: 360, label: 'Zirgu Tsirguliina' },
];

// ═══ Helpers ═════════════════════════════════════════════════════════════════

function useTheme(): 'dark' | 'light' {
  const [t, setT] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const el = document.documentElement;
    setT((el.getAttribute('data-theme') as 'dark' | 'light') || 'dark');
    const obs = new MutationObserver(() =>
      setT((el.getAttribute('data-theme') as 'dark' | 'light') || 'dark'));
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return t;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function flowColor(mw: number | null | undefined): string {
  if (mw == null || Math.abs(mw) < 5) return 'var(--text-ghost)';
  return mw < 0 ? 'var(--amber)' : 'var(--teal)';
}

function flowArrow(mw: number | null | undefined): string {
  if (mw == null || Math.abs(mw) < 5) return '·';
  return mw < 0 ? '↙' : '↗';
}

function flowWord(mw: number | null | undefined): string {
  if (mw == null || Math.abs(mw) < 5) return 'BALANCED';
  return mw < 0 ? 'IMPORTING' : 'EXPORTING';
}

function fmt(n: number | null | undefined, fallback = '—'): string {
  if (n == null) return fallback;
  return new Intl.NumberFormat('en-GB').format(Math.round(n));
}

// ═══ Sparkline ═══════════════════════════════════════════════════════════════

function Sparkline({ data, width = 120, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 3) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--teal)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Today dot */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        const x = width;
        const y = height - ((last - min) / range) * (height - 4) - 2;
        return <circle cx={x - 1} cy={y} r="2.5" fill="var(--teal)" />;
      })()}
    </svg>
  );
}

// ═══ Scrolling ticker ════════════════════════════════════════════════════════

function Ticker({ items }: { items: string[] }) {
  const text = items.join(' · ');
  const doubled = `${text} · ${text} · `;
  const reduced = reducedMotion();
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '36px',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      background: 'var(--hero-glass)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid var(--hero-border)',
      zIndex: 20,
    }}>
      <div style={{
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        letterSpacing: '0.04em',
        animation: reduced ? 'none' : 'tickerScroll 60s linear infinite',
        paddingLeft: reduced ? '16px' : undefined,
      }}>
        {reduced ? text : doubled}
      </div>
    </div>
  );
}

// ═══ Main component ═════════════════════════════════════════════════════════

export function HeroBalticMap() {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [read, setRead] = useState<ReadData | null>(null);
  const [s8, setS8] = useState<S8Data | null>(null);
  const [captureHistory, setCaptureHistory] = useState<number[]>([]);

  // Fetch all data
  useEffect(() => {
    Promise.all([
      fetch(`${W}/s4/fleet`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/revenue?dur=4h`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/read`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s8`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s1/capture`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([f, r, rd, i, cap]) => {
      setFleet(f); setRevenue(r); setRead(rd); setS8(i);
      if (cap?.history) {
        setCaptureHistory(
          (cap.history as CaptureHistory[])
            .map((h: CaptureHistory) => h.gross_4h)
            .filter((v): v is number => v != null)
        );
      }
    });
  }, []);

  // GSAP particles
  useGSAP(() => {
    if (!svgRef.current || reducedMotion()) return;
    CABLES.forEach(cable => {
      const mw = s8?.[cable.field] as number | null | undefined;
      const absMw = Math.abs(mw ?? 0);
      if (absMw < 5) return;
      const dur = Math.max(4, Math.min(14, 16 - absMw / 50));
      const rev = (mw ?? 0) < 0;
      const particles = svgRef.current!.querySelectorAll(`[data-cable="${cable.id}"]`);
      particles.forEach((p, i) => {
        gsap.to(p, {
          motionPath: {
            path: `#path-${cable.id}`,
            align: `#path-${cable.id}`,
            alignOrigin: [0.5, 0.5],
            start: rev ? 1 - i * 0.15 : i * 0.15,
            end: rev ? -(i * 0.15) : 1 + i * 0.15,
          },
          duration: dur,
          repeat: -1,
          ease: 'none',
          delay: i * (dur / 6),
        });
      });
    });
  }, { scope: svgRef, dependencies: [s8] });

  // Derived
  const lr = revenue?.live_rate;
  const sd = fleet?.sd_ratio;
  const opMw = fleet?.baltic_operational_mw;
  const pipeMw = fleet?.baltic_pipeline_mw;
  const countries = fleet?.countries;
  const totalOp = opMw ?? 0;

  const RING_R = 50;
  const RING_C = 2 * Math.PI * RING_R;
  const maxWeighted = countries
    ? Math.max(...Object.values(countries).map(c => c.weighted_mw))
    : 1;

  // Ticker items from live data
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (read?.capture?.gross_4h != null) items.push(`DA CAPTURE €${fmt(read.capture.gross_4h)}/MWh`);
    if (s8?.nordbalt_avg_mw != null) items.push(`NORDBALT ${Math.abs(s8.nordbalt_avg_mw)} MW ${flowWord(s8.nordbalt_avg_mw)}`);
    if (s8?.litpol_avg_mw != null) items.push(`LITPOL ${Math.abs(s8.litpol_avg_mw)} MW ${flowWord(s8.litpol_avg_mw)}`);
    if (revenue?.project_irr != null) items.push(`PROJECT IRR ${(revenue.project_irr * 100).toFixed(1)}%`);
    if (revenue?.equity_irr != null) items.push(`EQUITY IRR ${(revenue.equity_irr * 100).toFixed(1)}%`);
    if (revenue?.min_dscr != null) items.push(`DSCR ${revenue.min_dscr.toFixed(2)}×`);
    if (read?.capture && 'shape_swing' in (read.capture as Record<string, unknown>)) {
      const sw = (read.capture as Record<string, unknown>).shape_swing as number;
      if (sw != null) items.push(`SHAPE SWING €${fmt(sw)}/MWh`);
    }
    if (revenue?.capex_eur_kwh != null) items.push(`CAPEX €${revenue.capex_eur_kwh}/kWh`);
    if (fleet?.eff_demand_mw != null) items.push(`EFFECTIVE DEMAND ${fmt(fleet.eff_demand_mw)} MW`);
    items.push('9 SIGNALS LIVE');
    return items;
  }, [read, s8, revenue, fleet]);

  const isDark = theme === 'dark';
  const glass = isDark ? 'rgba(7,7,10,0.55)' : 'rgba(245,242,237,0.6)';
  const borderGlass = isDark ? 'rgba(232,226,217,0.08)' : 'rgba(26,26,31,0.08)';

  return (
    <section style={{
      position: 'relative',
      width: '100%',
      height: 'clamp(480px, 60vh, 720px)',
      overflow: 'hidden',
      background: 'var(--bg-page)',
      // CSS custom properties for glass clusters
      ['--hero-glass' as string]: glass,
      ['--hero-border' as string]: borderGlass,
    }}>

      {/* ═══ LAYER 0 — Map raster ═══ */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(/hero/kkme-interconnect-${theme}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 40%',
        backgroundRepeat: 'no-repeat',
        opacity: isDark ? 0.85 : 0.9,
        transition: 'opacity 150ms ease',
      }} />
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: isDark
          ? 'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 40%, rgba(7,7,10,0.7) 100%)'
          : 'radial-gradient(ellipse 80% 70% at 50% 45%, transparent 40%, rgba(245,242,237,0.6) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ═══ LAYER 1-3 — SVG overlay (cables, particles, rings, dots) ═══ */}
      <svg
        ref={svgRef}
        viewBox="0 0 1024 1332"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      >
        {/* Glow filter */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {CABLES.map(c => (
            <path key={c.id} id={`path-${c.id}`} d={c.d} />
          ))}
        </defs>

        {/* Particles */}
        {CABLES.map(cable => {
          const mw = s8?.[cable.field] as number | null | undefined;
          const color = flowColor(mw);
          return Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`p-${cable.id}-${i}`}
              data-cable={cable.id}
              r={2.5 + (i % 2) * 1}
              fill={color}
              opacity={0.9}
              filter="url(#glow)"
            />
          ));
        })}

        {/* Country revenue rings */}
        {COUNTRY_RINGS.map(c => {
          const cData = countries?.[c.key];
          const progress = cData ? cData.weighted_mw / maxWeighted : 0;
          const offset = RING_C * (1 - progress);
          return (
            <g key={c.key}>
              <circle cx={c.cx} cy={c.cy} r={RING_R}
                fill="none" stroke="var(--text-ghost)" strokeWidth="1" />
              <circle cx={c.cx} cy={c.cy} r={RING_R}
                fill="none" stroke="var(--teal)" strokeWidth="1.5"
                strokeOpacity="0.7"
                strokeDasharray={RING_C}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${c.cx} ${c.cy})`}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
              />
              <text x={c.cx} y={c.cy + 4}
                textAnchor="middle" fill="var(--text-muted)"
                fontSize="11" fontFamily="var(--font-mono)">
                {cData ? `${Math.round(cData.operational_mw)}` : ''}
              </text>
            </g>
          );
        })}

        {/* Project dots */}
        {PROJECT_DOTS.map((dot, i) => (
          <circle key={i} cx={dot.cx} cy={dot.cy} r="4"
            fill="var(--teal)" opacity="0.6" filter="url(#glow)">
            <title>{dot.label}</title>
          </circle>
        ))}
      </svg>

      {/* ═══ CLUSTER A — Wordmark (top-left) ═══ */}
      <div style={{
        position: 'absolute', top: 32, left: 32, zIndex: 10,
        padding: '20px',
        background: 'var(--hero-glass)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--hero-border)',
        maxWidth: '360px',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '48px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          margin: 0,
        }}>KKME</h1>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          marginTop: '8px',
          lineHeight: 1.4,
        }}>
          Baltic flexibility market, live
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: '8px',
        }}>
          9 SIGNALS · 4H UPDATES · ENTSO-E · LITGRID · AST · ELERING
        </p>
      </div>

      {/* ═══ CLUSTER B — Hero live rate (top-right) ═══ */}
      <div style={{
        position: 'absolute', top: 32, right: 32, zIndex: 10,
        padding: '20px',
        background: 'var(--hero-glass)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--hero-border)',
        textAlign: 'right',
        minWidth: '200px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          50 MW · 4H · {lr?.as_of ? new Date(lr.as_of).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : ''}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '72px',
          fontWeight: 500,
          color: lr?.today_total_daily != null ? 'var(--text-primary)' : 'var(--text-ghost)',
          lineHeight: 1,
          marginTop: '4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          €{lr?.today_total_daily != null ? fmt(lr.today_total_daily) : '···'}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: '4px',
        }}>
          /MW/DAY
        </div>

        {lr?.delta_pct != null && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: lr.delta_pct < 0 ? 'var(--rose)' : 'var(--teal)',
            marginTop: '8px',
          }}>
            {lr.delta_pct < 0 ? '↓' : '↑'} {Math.abs(lr.delta_pct)}% vs base €{fmt(lr.base_daily)}
          </div>
        )}

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '18px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          marginTop: '8px',
        }}>
          €{lr?.annualised != null ? `${fmt(Math.round(lr.annualised / 1000))}k` : '···'}<span style={{
            fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px',
          }}>/MW/YR</span>
        </div>

        {captureHistory.length > 3 && (
          <div style={{ marginTop: '8px' }}>
            <Sparkline data={captureHistory} width={140} height={24} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: '2px',
            }}>
              30d capture trend
            </div>
          </div>
        )}
      </div>

      {/* ═══ CLUSTER C — Interconnector flows (bottom-left) ═══ */}
      <div style={{
        position: 'absolute', bottom: 48, left: 32, zIndex: 10,
        padding: '16px 20px',
        background: 'var(--hero-glass)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--hero-border)',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '8px',
        }}>
          INTERCONNECTORS · LIVE FLOW
        </div>

        {[
          { label: 'NORDBALT', mw: s8?.nordbalt_avg_mw },
          { label: 'LITPOL', mw: s8?.litpol_avg_mw },
          ...(s8?.ltlv_avg_mw != null ? [{ label: 'LT↔LV', mw: s8.ltlv_avg_mw }] : []),
        ].map(row => (
          <div key={row.label} style={{
            display: 'grid',
            gridTemplateColumns: '20px 80px 70px 80px',
            gap: '0 4px',
            alignItems: 'baseline',
            fontFamily: 'var(--font-mono)',
            padding: '2px 0',
          }}>
            <span style={{ fontSize: '14px', color: flowColor(row.mw) }}>
              {flowArrow(row.mw)}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {row.label}
            </span>
            <span style={{
              fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums', textAlign: 'right',
            }}>
              {row.mw != null ? `${Math.abs(row.mw)}` : '—'}
            </span>
            <span style={{
              fontSize: '10px', color: flowColor(row.mw),
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginLeft: '4px',
            }}>
              {row.mw != null ? flowWord(row.mw) : ''}
              {row.mw != null && <span style={{ color: 'var(--text-muted)', marginLeft: '2px' }}>MW</span>}
            </span>
          </div>
        ))}
      </div>

      {/* ═══ CLUSTER D — Fleet breakdown (bottom-right) ═══ */}
      <div style={{
        position: 'absolute', bottom: 48, right: 32, zIndex: 10,
        padding: '16px 20px',
        background: 'var(--hero-glass)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--hero-border)',
        minWidth: '280px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '8px',
        }}>
          BALTIC FLEET · OPERATIONAL
        </div>

        {/* Stacked bar */}
        {countries && totalOp > 0 && (() => {
          const order = ['EE', 'LT', 'LV'] as const;
          const opacities = [0.5, 0.85, 0.35];
          return (
            <>
              <div style={{ display: 'flex', gap: '1px', height: '8px', marginBottom: '4px' }}>
                {order.map((k, i) => {
                  const c = countries[k];
                  if (!c) return null;
                  const pct = (c.operational_mw / totalOp) * 100;
                  return (
                    <div key={k} style={{
                      width: `${pct}%`,
                      background: 'var(--teal)',
                      opacity: opacities[i],
                    }} />
                  );
                })}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)', fontSize: '11px',
              }}>
                {order.map(k => {
                  const c = countries[k];
                  if (!c) return null;
                  return (
                    <div key={k} style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {k} {Math.round(c.operational_mw)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '4px', fontSize: '10px' }}>
                        {Math.round((c.operational_mw / totalOp) * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 500,
          color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
          marginTop: '8px',
        }}>
          {fmt(opMw)} MW<span style={{
            fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '4px',
          }}>OPERATIONAL</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '12px',
          color: 'var(--text-secondary)', marginTop: '2px',
        }}>
          + {fmt(pipeMw)} MW pipeline
        </div>

        <div style={{
          display: 'flex', gap: '12px', marginTop: '8px',
          fontFamily: 'var(--font-mono)', fontSize: '12px',
        }}>
          <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            S/D {sd != null ? sd.toFixed(2) : '—'}×
          </span>
          {fleet?.phase && (
            <span style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--hero-border)',
              padding: '0 6px',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: '18px',
            }}>{fleet.phase}</span>
          )}
          {fleet?.cpi != null && (
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              CPI {fleet.cpi.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* ═══ CLUSTER F — Reference asset pill (bottom-center) ═══ */}
      {revenue?.project_irr != null && (
        <div style={{
          position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10,
          padding: '6px 16px',
          background: 'var(--hero-glass)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid var(--hero-border)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}>
          50 MW · 4H · {revenue.cod_year} COD · IRR {(revenue.project_irr * 100).toFixed(1)}%
          {revenue.ebitda_y1 != null && ` · EBITDA Y1 €${(revenue.ebitda_y1 / 1e6).toFixed(1)}M`}
        </div>
      )}

      {/* ═══ CLUSTER E — Scrolling ticker ═══ */}
      <Ticker items={tickerItems} />

      {/* Ticker animation */}
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
