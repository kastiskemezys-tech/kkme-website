'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { AnimatePresence, motion } from 'motion/react';
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT, CABLE_PATHS, COUNTRY_LABEL_PIXELS, CITY_LABEL_PIXELS } from '@/lib/map-projection';
import { COUNTRY_CENTROIDS } from '@/lib/baltic-places';
import type { CableId } from '@/lib/baltic-places';
import geocodes from '../../public/hero/project-geocodes.json';

gsap.registerPlugin(MotionPathPlugin);

const W = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ═══ Types ═══════════════════════════════════════════════════════════════════

interface FleetCountry { operational_mw: number; pipeline_mw: number; weighted_mw: number }
interface FleetData {
  sd_ratio?: number | null; phase?: string | null; cpi?: number | null;
  baltic_operational_mw?: number | null; baltic_pipeline_mw?: number | null;
  eff_demand_mw?: number | null;
  countries?: Record<string, FleetCountry>;
}
interface LiveRate {
  today_total_daily?: number; base_daily?: number; delta_pct?: number;
  annualised?: number; as_of?: string;
}
interface RevenueData {
  live_rate?: LiveRate; project_irr?: number; equity_irr?: number;
  ebitda_y1?: number; min_dscr?: number; capex_scenario?: string; cod_year?: number;
}
interface S8Data {
  nordbalt_avg_mw?: number | null; litpol_avg_mw?: number | null;
  estlink_avg_mw?: number | null; fennoskan_avg_mw?: number | null;
  [k: string]: unknown;
}
interface S4Data {
  projects?: Array<{ id?: string; name: string; mw: number; status: string; country: string; cod?: string; type?: string }>;
  free_mw?: number;
}
interface S2Data { afrr_up_avg?: number; mfrr_up_avg?: number; fcr_avg?: number }
interface ReadData { capture?: { gross_4h?: number; shape_swing?: number }; updated_at?: string }

interface MappedProject {
  id: string; name: string; x: number; y: number; r: number; mw: number; cod?: string; country: string;
}

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

function fmt(n: number | null | undefined): string {
  if (n == null) return '···';
  return new Intl.NumberFormat('en-GB').format(Math.round(n));
}

const dotRadius = (mw: number) => 3 + Math.sqrt(mw / 10) * 1.2;

function Sparkline({ data, w = 200, h = 30 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 3) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ');
  const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="var(--teal)" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w - 1} cy={lastY} r="2.5" fill="var(--teal)" />
    </svg>
  );
}

// ═══ Cable config ════════════════════════════════════════════════════════════

const CABLE_CONFIG: { id: CableId; label: string; field: string }[] = [
  { id: 'nordbalt', label: 'NORDBALT', field: 'nordbalt_avg_mw' },
  { id: 'litpol', label: 'LITPOL', field: 'litpol_avg_mw' },
  { id: 'estlink', label: 'ESTLINK', field: 'estlink_avg_mw' },
  { id: 'fennoskan', label: 'FENNO-SKAN', field: 'fennoskan_avg_mw' },
];

// ═══ Component ═══════════════════════════════════════════════════════════════

export function HeroBalticMap() {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);

  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [read, setRead] = useState<ReadData | null>(null);
  const [s8, setS8] = useState<S8Data | null>(null);
  const [s4, setS4] = useState<S4Data | null>(null);
  const [s2, setS2] = useState<S2Data | null>(null);
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [hoveredProject, setHoveredProject] = useState<MappedProject | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${W}/s4/fleet`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/revenue?dur=4h`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/read`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s8`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s4`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s1/capture`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s2`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([fl, rv, rd, i, s4d, cap, s2d]) => {
      setFleet(fl); setRevenue(rv); setRead(rd); setS8(i); setS4(s4d); setS2(s2d);
      if (cap?.history) {
        setSparkData(cap.history.map((h: { gross_4h?: number }) => h.gross_4h).filter((v: unknown): v is number => v != null));
      }
    });
  }, []);

  // GSAP particles — all 4 cables
  useGSAP(() => {
    if (!svgRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    CABLE_CONFIG.forEach(cable => {
      const mw = (s8?.[cable.field] as number) ?? 0;
      const absMw = Math.abs(mw);
      if (absMw < 5 || !CABLE_PATHS[cable.id]) return;
      const dur = Math.max(4, 12 - Math.min(absMw / 60, 8));
      const rev = mw < 0;
      gsap.utils.toArray<SVGCircleElement>(`.particle-${cable.id}`).forEach((el, i) => {
        gsap.to(el, {
          motionPath: {
            path: `#path-${cable.id}`, align: `#path-${cable.id}`,
            alignOrigin: [0.5, 0.5], start: rev ? 1 : 0, end: rev ? 0 : 1,
          },
          duration: dur, repeat: -1, delay: i * 0.9, ease: 'none',
        });
      });
    });
  }, { scope: svgRef, dependencies: [s8] });

  // Derived
  const lr = revenue?.live_rate;
  const countries = fleet?.countries;
  const totalOp = fleet?.baltic_operational_mw ?? 0;
  const isDark = theme === 'dark';

  // Operational project dots
  const projectDots = useMemo((): MappedProject[] => {
    const ops = (s4?.projects ?? []).filter(p =>
      ['operational', 'live', 'commissioned'].includes((p.status ?? '').toLowerCase()));
    return ops.map(p => {
      const id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const geo = (geocodes as Record<string, { resolved?: boolean; lat?: number; lng?: number }>)[id];
      if (!geo?.resolved || !geo.lat || !geo.lng) return null;
      const { x, y } = geoToPixel(geo.lat, geo.lng);
      return { id, name: p.name, x, y, r: dotRadius(p.mw), mw: p.mw, cod: p.cod, country: p.country };
    }).filter(Boolean) as MappedProject[];
  }, [s4]);

  // Top 3 by MW for labels
  const top3 = useMemo(() => {
    const sorted = [...projectDots].sort((a, b) => b.mw - a.mw).slice(0, 3);
    // Collision stacking: if two labels within 40px vertically, offset
    const labels = sorted.map((p, i) => {
      let labelY = p.y;
      let labelX = p.x + 20;
      for (let j = 0; j < i; j++) {
        const prev = sorted[j];
        if (Math.abs(prev.y - p.y) < 40 && Math.abs(prev.x - p.x) < 100) {
          labelY = sorted[j].y + (j + 1) * 16;
          labelX = sorted[j].x + 20;
        }
      }
      return { ...p, labelX, labelY };
    });
    return labels;
  }, [projectDots]);

  // Ticker
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (read?.capture?.gross_4h != null) items.push(`DA CAPTURE \u20AC${fmt(read.capture.gross_4h)}/MWh`);
    if (s2?.afrr_up_avg != null) items.push(`AFRR \u20AC${s2.afrr_up_avg.toFixed(2)}/MWh`);
    if (s2?.mfrr_up_avg != null) items.push(`MFRR \u20AC${s2.mfrr_up_avg.toFixed(1)}/MWh`);
    if (revenue?.project_irr != null) items.push(`PROJECT IRR ${(revenue.project_irr * 100).toFixed(1)}%`);
    if (revenue?.equity_irr != null) items.push(`EQUITY IRR ${(revenue.equity_irr * 100).toFixed(1)}%`);
    if (revenue?.min_dscr != null) items.push(`DSCR ${revenue.min_dscr.toFixed(2)}\u00d7`);
    if (revenue?.capex_scenario) items.push(`CAPEX ${revenue.capex_scenario}`);
    if (fleet?.eff_demand_mw != null) items.push(`EFFECTIVE DEMAND ${fmt(fleet.eff_demand_mw)} MW`);
    if (s4?.free_mw != null) items.push(`FREE GRID ${fmt(s4.free_mw)} MW`);
    if (revenue?.cod_year) items.push(`COD ${revenue.cod_year}`);
    items.push('9 SIGNALS LIVE');
    return items;
  }, [read, s2, revenue, fleet, s4]);

  const tickerText = tickerItems.join(' \u00b7 ');

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr 320px',
      gridTemplateRows: '1fr 40px',
      minHeight: '720px',
      maxHeight: '900px',
      background: 'var(--bg-page)',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ═══ LEFT COLUMN ═══ */}
      <div style={{
        padding: '32px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', zIndex: 2,
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '56px', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1, margin: 0,
        }}>KKME</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
          Baltic flexibility market, live
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '8px', lineHeight: 1.6,
        }}>
          9 SIGNALS · 4H UPDATES · ENTSO-E · LITGRID · AST · ELERING
        </p>

        <div style={{ height: '40px' }} />

        {/* Interconnector flows — all 4 cables */}
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
          }}>
            INTERCONNECTORS · LIVE FLOW
          </div>
          {CABLE_CONFIG.map(cable => {
            const mw = s8?.[cable.field] as number | null | undefined;
            const isImport = (mw ?? 0) < 0;
            const color = mw == null ? 'var(--text-muted)' : isImport ? 'var(--rose)' : 'var(--teal)';
            return (
              <div key={cable.id} style={{
                display: 'grid', gridTemplateColumns: '24px 100px 70px auto',
                alignItems: 'baseline', fontFamily: 'var(--font-mono)', padding: '4px 0',
              }}>
                <span style={{ fontSize: '16px', color }}>{mw == null ? '\u00b7' : isImport ? '\u2199' : '\u2197'}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{cable.label}</span>
                <span style={{
                  fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                }}>
                  {mw != null ? Math.abs(mw) : '\u00b7'}
                  {mw != null && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>MW</span>}
                </span>
                <span style={{
                  fontSize: '10px', color, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginLeft: '8px',
                }}>
                  {mw != null ? (isImport ? 'IMPORTING' : Math.abs(mw) < 10 ? 'BALANCED' : 'EXPORTING') : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ CENTER — MAP ═══ */}
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden',
      }}>
        <div style={{
          position: 'relative',
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          maxHeight: '820px', height: '100%',
        }}>
          <img
            src={`/hero/kkme-interconnect-${theme}.png`}
            width={MAP_WIDTH} height={MAP_HEIGHT}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            alt="Baltic interconnect map"
          />

          {/* SVG overlay */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* Cable motion paths */}
            <defs>
              {CABLE_CONFIG.map(c => (
                CABLE_PATHS[c.id] ? <path key={c.id} id={`path-${c.id}`} d={CABLE_PATHS[c.id]} fill="none" stroke="none" /> : null
              ))}
            </defs>

            {/* City labels */}
            {Object.values(CITY_LABEL_PIXELS).map(city => (
              <g key={city.name}>
                <circle cx={city.x} cy={city.y} r="1.5"
                  fill={isDark ? 'rgba(232,226,217,0.35)' : 'rgba(26,26,31,0.35)'} />
                <text x={city.x + 6} y={city.y + 3}
                  fontFamily="DM Mono, monospace" fontSize="9"
                  fill={isDark ? 'rgba(232,226,217,0.4)' : 'rgba(26,26,31,0.45)'}
                  letterSpacing="0.05em"
                  style={{ textShadow: isDark ? '0 0 3px rgba(0,0,0,0.9)' : '0 0 3px rgba(255,255,255,0.9)' }}
                >
                  {city.name.toUpperCase()}
                </text>
              </g>
            ))}

            {/* Country MW totals under country labels */}
            {Object.entries(COUNTRY_LABEL_PIXELS).map(([country, pos]) => {
              const key = country.slice(0, 2) as 'LT' | 'LV' | 'EE';
              const mw = countries?.[key]?.operational_mw;
              if (!mw) return null;
              return (
                <text key={country} x={pos.x} y={pos.y + 22}
                  fontFamily="DM Mono, monospace" fontSize="11"
                  fill="var(--teal)" textAnchor="start"
                  style={{ textShadow: isDark ? '0 0 3px rgba(0,0,0,0.9)' : '0 0 3px rgba(255,255,255,0.9)' }}
                >
                  {Math.round(mw)} MW
                </text>
              );
            })}

            {/* Project dots — hollow rings */}
            {projectDots.map(p => (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r={p.r + 3}
                  fill={isDark ? 'rgba(94,234,212,0.1)' : 'transparent'} />
                <circle cx={p.x} cy={p.y} r={p.r}
                  fill="none"
                  stroke={isDark ? 'rgba(94,234,212,0.85)' : 'rgba(13,79,78,0.85)'}
                  strokeWidth="1.5" />
                <circle cx={p.x} cy={p.y} r="1"
                  fill={isDark ? 'rgba(94,234,212,0.9)' : 'rgba(13,79,78,0.9)'} />
              </g>
            ))}

            {/* Top 3 project label connector lines */}
            {top3.map(p => (
              <line key={`line-${p.id}`}
                x1={p.x + p.r + 2} y1={p.y}
                x2={p.labelX - 2} y2={p.labelY}
                stroke={isDark ? 'rgba(232,226,217,0.2)' : 'rgba(26,26,31,0.2)'}
                strokeWidth="1"
              />
            ))}

            {/* Particles — all 4 cables */}
            {CABLE_CONFIG.map(cable => {
              const mw = (s8?.[cable.field] as number) ?? 0;
              const isImport = mw < 0;
              const color = isImport ? 'var(--amber)' : 'var(--teal)';
              if (!CABLE_PATHS[cable.id]) return null;
              return [0, 1, 2, 3, 4].map(i => (
                <circle key={`${cable.id}-${i}`}
                  className={`particle-${cable.id}`}
                  r="3" fill={color} opacity="0.9" />
              ));
            })}
          </svg>

          {/* Top 3 project labels (HTML overlay) */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {top3.map(p => (
              <div key={`label-${p.id}`} style={{
                position: 'absolute',
                left: `${(p.labelX / MAP_WIDTH) * 100}%`,
                top: `${(p.labelY / MAP_HEIGHT) * 100}%`,
                transform: 'translateY(-50%)',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                padding: '2px 6px',
                background: isDark ? 'rgba(7,7,10,0.5)' : 'rgba(245,242,237,0.6)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}>
                {p.name.split('(')[0].trim().toUpperCase()} · {p.mw} MW
              </div>
            ))}
          </div>

          {/* Hover targets (HTML) */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {projectDots.map(p => (
              <div key={`hover-${p.id}`} style={{
                position: 'absolute',
                left: `${(p.x / MAP_WIDTH) * 100}%`,
                top: `${(p.y / MAP_HEIGHT) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: `${(p.r + 8) * 2}px`,
                height: `${(p.r + 8) * 2}px`,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
                onMouseEnter={() => setHoveredProject(p)}
                onMouseLeave={() => setHoveredProject(null)}
              />
            ))}
          </div>

          {/* Tooltip */}
          <AnimatePresence>
            {hoveredProject && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  left: `${(hoveredProject.x / MAP_WIDTH) * 100}%`,
                  top: `${(hoveredProject.y / MAP_HEIGHT) * 100}%`,
                  transform: 'translate(16px, -50%)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  padding: '8px 12px',
                  background: isDark ? 'rgba(7,7,10,0.85)' : 'rgba(245,242,237,0.9)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: `1px solid ${isDark ? 'rgba(232,226,217,0.1)' : 'rgba(26,26,31,0.1)'}`,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              >
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>
                  {hoveredProject.name.toUpperCase()}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {hoveredProject.mw} MW · {hoveredProject.country}
                  {hoveredProject.cod ? ` · COD ${hoveredProject.cod}` : ''}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ═══ RIGHT COLUMN ═══ */}
      <div style={{
        padding: '32px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', zIndex: 2,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          50 MW · 4H · {lr?.as_of ? new Date(lr.as_of).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) + ' UTC' : ''}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '80px', fontWeight: 500,
          color: lr?.today_total_daily != null ? 'var(--text-primary)' : 'var(--text-ghost)',
          lineHeight: 1, marginTop: '4px', fontVariantNumeric: 'tabular-nums',
        }}>
          \u20AC{fmt(lr?.today_total_daily)}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>/MW/DAY</div>
        {lr?.delta_pct != null && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px',
            color: lr.delta_pct < 0 ? 'var(--rose)' : 'var(--teal)',
            marginTop: '8px', fontVariantNumeric: 'tabular-nums',
          }}>
            {lr.delta_pct < 0 ? '\u2193' : '\u2191'} {Math.abs(lr.delta_pct)}% vs base \u20AC{fmt(lr.base_daily)}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 500,
          color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '8px',
        }}>
          \u20AC{lr?.annualised != null ? `${fmt(Math.round(lr.annualised / 1000))}k` : '···'}
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>/MW/YR</span>
        </div>
        {sparkData.length > 3 && (
          <div style={{ marginTop: '12px' }}>
            <Sparkline data={sparkData} />
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px',
            }}>30D CAPTURE TREND</div>
          </div>
        )}

        <div style={{ height: '32px' }} />

        {/* Fleet */}
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px',
          }}>BALTIC FLEET · OPERATIONAL</div>
          {countries && totalOp > 0 && (() => {
            const order = ['EE', 'LT', 'LV'] as const;
            const opacities = [0.5, 0.85, 0.35];
            return (
              <>
                <div style={{ display: 'flex', gap: '1px', height: '10px', marginBottom: '4px', maxWidth: '280px' }}>
                  {order.map((k, i) => {
                    const c = countries[k];
                    if (!c) return null;
                    return <div key={k} style={{ width: `${(c.operational_mw / totalOp) * 100}%`, background: 'var(--teal)', opacity: opacities[i] }} />;
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '280px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  {order.map(k => {
                    const c = countries[k];
                    if (!c) return null;
                    return (
                      <span key={k} style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {k} {Math.round(c.operational_mw)}
                        <span style={{ color: 'var(--text-muted)', marginLeft: '3px', fontSize: '10px' }}>
                          {Math.round((c.operational_mw / totalOp) * 100)}%
                        </span>
                      </span>
                    );
                  })}
                </div>
              </>
            );
          })()}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 500,
            color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '8px',
          }}>
            {fmt(totalOp)} MW
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '4px' }}>OPERATIONAL</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            + {fmt(fleet?.baltic_pipeline_mw)} MW pipeline
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              S/D {fleet?.sd_ratio != null ? fleet.sd_ratio.toFixed(2) : '—'}\u00d7
            </span>
            {fleet?.phase && (
              <span style={{
                color: 'var(--text-secondary)', border: '1px solid var(--border-card)',
                padding: '0 6px', fontSize: '10px', textTransform: 'uppercase',
                letterSpacing: '0.06em', lineHeight: '18px',
              }}>{fleet.phase}</span>
            )}
            {fleet?.cpi != null && (
              <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>CPI {fleet.cpi.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ═══ TICKER ═══ */}
      <div style={{
        gridColumn: '1 / -1', overflow: 'hidden', display: 'flex', alignItems: 'center',
        background: isDark ? 'rgba(7,7,10,0.8)' : 'rgba(245,242,237,0.8)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--border-card)', zIndex: 10,
      }}>
        <div style={{
          whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11px',
          color: 'var(--text-muted)', letterSpacing: '0.04em',
          animation: 'tickerScroll 60s linear infinite',
        }}>
          {tickerText} \u00b7 {tickerText} \u00b7{' '}
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .particle-nordbalt, .particle-litpol, .particle-estlink, .particle-fennoskan { display: none; }
          [style*="tickerScroll"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
