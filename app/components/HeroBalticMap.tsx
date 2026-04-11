'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { AnimatePresence, motion } from 'motion/react';
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT, CABLE_PATHS, COUNTRY_LABEL_PIXELS, CITY_LABEL_PIXELS, WAYPOINT_START } from '@/lib/map-projection';
import { INTERCONNECTORS, resolveFlow } from '@/lib/baltic-places';
import type { ResolvedFlow } from '@/lib/baltic-places';
import { resolveCollisions, hideCitiesNearProjects } from '@/lib/label-layout';
import type { LabelBox } from '@/lib/label-layout';
import geocodes from '../../public/hero/project-geocodes.json';
import { HERO_EXCLUDED_PROJECT_IDS } from '@/lib/project-overrides';

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
interface S8Data { [k: string]: unknown }
interface S4Data {
  projects?: Array<{ id?: string; name: string; mw: number; status: string; country: string; cod?: string; lat?: number; lng?: number }>;
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

// ═══ Label avoid zones (country label bounding boxes) ════════════════════════

const AVOID_ZONES = Object.entries(COUNTRY_LABEL_PIXELS).map(([, pos]) => ({
  cx: pos.x, cy: pos.y, halfWidth: 60, halfHeight: 20,
}));

function isInAvoidZone(x: number, y: number): boolean {
  return AVOID_ZONES.some(z => Math.abs(x - z.cx) < z.halfWidth && Math.abs(y - z.cy) < z.halfHeight);
}

function findLabelPosition(dotX: number, dotY: number, dotR: number): { x: number; y: number } {
  const offsets = [
    { x: dotR + 16, y: 0 },     // right
    { x: -(dotR + 80), y: 0 },  // left
    { x: 0, y: -(dotR + 16) },  // above
    { x: 0, y: dotR + 16 },     // below
    { x: dotR + 16, y: -16 },   // top-right
    { x: -(dotR + 80), y: -16 },// top-left
    { x: dotR + 16, y: 16 },    // bottom-right
  ];
  for (const off of offsets) {
    const lx = dotX + off.x, ly = dotY + off.y;
    if (!isInAvoidZone(lx, ly)) return { x: lx, y: ly };
  }
  return { x: dotX + dotR + 16, y: dotY }; // fallback
}

// ═══ Component ═══════════════════════════════════════════════════════════════

export function HeroBalticMap() {
  const theme = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const isDark = theme === 'dark';

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

  // Resolve all 6 interconnector flows
  const resolved = useMemo((): ResolvedFlow[] =>
    INTERCONNECTORS.map(spec => resolveFlow(spec, s8)), [s8]);

  // GSAP particles — all 6 cables
  useGSAP(() => {
    if (!svgRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    resolved.forEach(r => {
      if (!CABLE_PATHS[r.id] || r.mw < 5) return;
      const particles = gsap.utils.toArray<SVGCircleElement>(`.particle-${r.id.replace(/[^a-z0-9]/g, '-')}`);
      const duration = Math.max(3, 13 - r.utilization * 10);
      particles.forEach((el, i) => {
        gsap.to(el, {
          motionPath: {
            path: `#cable-${r.id}`, align: `#cable-${r.id}`,
            alignOrigin: [0.5, 0.5],
            start: r.particleDirection === 'forward' ? 0 : 1,
            end:   r.particleDirection === 'forward' ? 1 : 0,
          },
          duration, repeat: -1,
          delay: (i / Math.max(particles.length, 1)) * duration,
          ease: 'none',
        });
      });
    });
  }, { scope: svgRef, dependencies: [resolved] });

  // Debug: log resolved flows for MCP verification
  useEffect(() => {
    if (resolved.length > 0 && resolved.some(r => r.mw > 0)) {
      console.table(resolved.map(r => ({
        id: r.id,
        from: r.fromCountry,
        to: r.toCountry,
        mw: Math.round(r.mw),
        util: (r.utilization * 100).toFixed(0) + '%',
        waypointStart: WAYPOINT_START[
          INTERCONNECTORS.find(s => s.id === r.id)?.waypointCableId ?? ''
        ],
        particleDir: r.particleDirection,
        color: r.arrowColor,
      })));
    }
  }, [resolved]);

  // Derived
  const lr = revenue?.live_rate;
  const countries = fleet?.countries;
  const totalOp = fleet?.baltic_operational_mw ?? 0;

  // Operational project dots
  const projectDots = useMemo((): MappedProject[] => {
    const ops = (s4?.projects ?? []).filter(p =>
      ['operational', 'live', 'commissioned'].includes((p.status ?? '').toLowerCase()));
    return ops.map(p => {
      const id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (HERO_EXCLUDED_PROJECT_IDS.includes(id)) return null;
      // Use source-provided coordinates (e.g. Litgrid Layer 3), fall back to geocode cache
      const geo = (geocodes as Record<string, { resolved?: boolean; lat?: number; lng?: number }>)[id];
      const lat = (typeof p.lat === 'number' && p.lat !== 0) ? p.lat : geo?.lat;
      const lng = (typeof p.lng === 'number' && p.lng !== 0) ? p.lng : geo?.lng;
      if (!lat || !lng) return null;
      const { x, y } = geoToPixel(lat, lng);
      return { id, name: p.name, x, y, r: dotRadius(p.mw), mw: p.mw, cod: p.cod, country: p.country };
    }).filter(Boolean) as MappedProject[];
  }, [s4]);

  // Top 3 by MW for labels — with avoid-zone-aware placement
  const top3 = useMemo(() => {
    const sorted = [...projectDots].sort((a, b) => b.mw - a.mw).slice(0, 3);
    return sorted.map(p => {
      const pos = findLabelPosition(p.x, p.y, p.r);
      return { ...p, labelX: pos.x, labelY: pos.y };
    });
  }, [projectDots]);

  // ═══ Label collision resolution ═════════════════════════════════════════════
  const resolvedLabels = useMemo(() => {
    const CHAR_W = (fontSize: number) => fontSize * 0.6
    const boxes: LabelBox[] = []

    // Country labels baked into the raster (immovable obstacles)
    for (const [label, pos] of Object.entries(COUNTRY_LABEL_PIXELS)) {
      boxes.push({
        id: `baked-${label}`, x: pos.x - 50, y: pos.y - 10,
        width: label.length * CHAR_W(14) + 10, height: 18,
        type: 'country-label-baked', movable: false,
      })
    }

    // Country MW totals
    const countryMwBoxes: LabelBox[] = []
    for (const [label, countryKey] of [['LITHUANIA', 'LT'], ['LATVIA', 'LV'], ['ESTONIA', 'EE']] as const) {
      const pos = COUNTRY_LABEL_PIXELS[label]
      if (!pos) continue
      const mw = countries?.[countryKey]?.operational_mw
      if (!mw) continue
      const text = `${Math.round(mw)} MW`
      countryMwBoxes.push({
        id: `mw-${countryKey}`, x: pos.x - (text.length * CHAR_W(13)) / 2, y: pos.y + 16,
        width: text.length * CHAR_W(13), height: 17,
        type: 'country-mw', movable: true,
      })
    }
    boxes.push(...countryMwBoxes)

    // Project labels (top 3)
    const projectBoxes: LabelBox[] = top3.map(p => {
      const text = `${p.name.split('(')[0].trim().toUpperCase()} · ${p.mw} MW`
      return {
        id: `proj-${p.id}`, x: p.labelX, y: p.labelY - 7,
        width: text.length * CHAR_W(9) + 12, height: 14,
        type: 'project' as const, movable: true,
      }
    })
    boxes.push(...projectBoxes)

    // City labels
    const cityBoxes: LabelBox[] = Object.entries(CITY_LABEL_PIXELS).map(([id, city]) => ({
      id: `city-${id}`,
      x: city.x + 7, y: city.y - 6,
      width: city.name.toUpperCase().length * CHAR_W(10), height: 14,
      type: 'city' as const, movable: true,
    }))

    // Hide cities too close to project dots
    const visibleCities = hideCitiesNearProjects(cityBoxes, projectBoxes, 35)
    boxes.push(...visibleCities)

    const resolved = resolveCollisions(boxes)

    // Extract resolved positions by id
    const posMap: Record<string, { x: number; y: number }> = {}
    for (const b of resolved) posMap[b.id] = { x: b.x, y: b.y }

    // Build city visibility set
    const visibleCityIds = new Set(visibleCities.map(c => c.id))

    return { posMap, visibleCityIds }
  }, [top3, countries])

  // Ticker
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (read?.capture?.gross_4h != null) items.push(`DA CAPTURE €${fmt(read.capture.gross_4h)}/MWh`);
    if (s2?.afrr_up_avg != null) items.push(`AFRR €${s2.afrr_up_avg.toFixed(2)}/MWh`);
    if (s2?.mfrr_up_avg != null) items.push(`MFRR €${s2.mfrr_up_avg.toFixed(1)}/MWh`);
    if (revenue?.project_irr != null) items.push(`PROJECT IRR ${(revenue.project_irr * 100).toFixed(1)}%`);
    if (revenue?.equity_irr != null) items.push(`EQUITY IRR ${(revenue.equity_irr * 100).toFixed(1)}%`);
    if (revenue?.min_dscr != null) items.push(`DSCR ${revenue.min_dscr.toFixed(2)}×`);
    if (revenue?.capex_scenario) items.push(`CAPEX ${revenue.capex_scenario}`);
    if (fleet?.eff_demand_mw != null) items.push(`EFFECTIVE DEMAND ${fmt(fleet.eff_demand_mw)} MW`);
    if (s4?.free_mw != null) items.push(`FREE GRID ${fmt(s4.free_mw)} MW`);
    if (revenue?.cod_year) items.push(`COD ${revenue.cod_year}`);
    items.push('9 SIGNALS LIVE');
    return items;
  }, [read, s2, revenue, fleet, s4]);

  const tickerText = tickerItems.join(' · ');

  function arrowColorVar(c: 'rose' | 'teal' | 'neutral'): string {
    if (c === 'rose') return 'var(--rose)';
    if (c === 'teal') return 'var(--teal)';
    return 'var(--text-tertiary)';
  }

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(260px, 300px) minmax(540px, 620px) minmax(260px, 300px)',
      gridTemplateRows: '1fr 40px',
      minHeight: '720px',
      maxHeight: '900px',
      gap: '36px',
      padding: '48px',
      background: 'var(--hero-bg)',
      overflow: 'hidden',
      position: 'relative',
      maxWidth: '1440px',
      margin: '0 auto',
      width: '100%',
    }}>

      {/* ═══ LEFT COLUMN ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, gridColumn: 1, gridRow: 1 }}>
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

        {/* Interconnector flows — 6 cables, arrow notation */}
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
          }}>INTERCONNECTORS · LIVE FLOW</div>

          {resolved.map(r => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: '100px 70px 60px',
              alignItems: 'baseline', fontFamily: 'var(--font-mono)', padding: '3px 0',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {r.displayName}
              </span>
              <span style={{ fontSize: '11px', color: arrowColorVar(r.arrowColor) }}>
                {r.fromCountry} → {r.toCountry}
              </span>
              <span style={{
                fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums', textAlign: 'right',
              }}>
                {r.mw > 0 ? r.mw : '·'}
                {r.mw > 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>MW</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CENTER — MAP ═══ */}
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden', gridColumn: 2, gridRow: 1,
      }}>
        <div style={{
          position: 'relative',
          height: '100%',
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          maxWidth: '100%',
          margin: '0 auto',
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
              {Object.entries(CABLE_PATHS).map(([id, d]) =>
                d ? <path key={id} id={`cable-${id}`} d={d} fill="none" stroke="none" /> : null
              )}
            </defs>

            {/* City labels with halo stroke — collision-resolved */}
            <g data-layer="cities">
              {Object.entries(CITY_LABEL_PIXELS).map(([id, city]) => {
                if (!resolvedLabels.visibleCityIds.has(`city-${id}`)) return null
                const pos = resolvedLabels.posMap[`city-${id}`]
                const textX = pos ? pos.x : city.x + 7
                const textY = pos ? pos.y + 10 : city.y + 4
                return (
                  <g key={city.name}>
                    <circle cx={city.x} cy={city.y} r="2"
                      fill="var(--text-secondary)" opacity="0.8" />
                    <text x={textX} y={textY}
                      fontFamily="DM Mono, monospace" fontSize="10"
                      fontWeight="500"
                      fill="var(--text-secondary)"
                      letterSpacing="0.04em"
                      style={{
                        paintOrder: 'stroke fill',
                        stroke: 'var(--theme-bg, #0a0a0a)',
                        strokeWidth: '3px',
                        strokeLinejoin: 'round' as const,
                        strokeOpacity: 0.9,
                      }}
                    >{city.name.toUpperCase()}</text>
                  </g>
                )
              })}
            </g>

            {/* Country MW totals — collision-resolved */}
            <g data-layer="country-totals">
              {([
                ['LITHUANIA', 'LT'],
                ['LATVIA', 'LV'],
                ['ESTONIA', 'EE'],
              ] as const).map(([label, countryKey]) => {
                const pos = COUNTRY_LABEL_PIXELS[label];
                if (!pos) return null;
                const mw = countries?.[countryKey]?.operational_mw;
                if (!mw) return null;
                const resolved = resolvedLabels.posMap[`mw-${countryKey}`];
                const textX = resolved ? resolved.x + ((`${Math.round(mw)} MW`).length * 13 * 0.6) / 2 : pos.x;
                const textY = resolved ? resolved.y + 13 : pos.y + 26;
                return (
                  <text key={label} x={textX} y={textY}
                    fontFamily="DM Mono, monospace" fontSize="13"
                    fontWeight="500"
                    fill="var(--accent-teal, var(--teal))"
                    textAnchor="middle" letterSpacing="0.03em"
                    style={{
                      paintOrder: 'stroke fill',
                      stroke: 'var(--theme-bg, #0a0a0a)',
                      strokeWidth: '4px',
                      strokeLinejoin: 'round' as const,
                      strokeOpacity: 0.95,
                    }}
                  >{Math.round(mw)} MW</text>
                );
              })}
            </g>

            {/* Project dots — hollow rings */}
            {projectDots.map(p => (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r={p.r + 3}
                  fill="var(--project-dot-halo, rgba(45,212,191,0.08))" />
                <circle cx={p.x} cy={p.y} r={p.r}
                  fill="none"
                  stroke="var(--project-dot-fill, var(--teal))"
                  strokeWidth="1.5" />
                <circle cx={p.x} cy={p.y} r="1"
                  fill="var(--project-dot-fill, var(--teal))" />
              </g>
            ))}

            {/* Top 3 label connector lines */}
            {top3.map(p => (
              <line key={`line-${p.id}`}
                x1={p.x} y1={p.y}
                x2={p.labelX} y2={p.labelY}
                stroke={isDark ? 'rgba(232,226,217,0.15)' : 'rgba(26,26,31,0.15)'}
                strokeWidth="1" />
            ))}

            {/* Particles — all 6 cables */}
            {resolved.map(r => {
              if (!CABLE_PATHS[r.id] || r.mw < 5) return null;
              const particleCount = Math.max(3, Math.min(8, Math.round(r.mw / 80)));
              const color = arrowColorVar(r.arrowColor);
              const cls = `particle-${r.id.replace(/[^a-z0-9]/g, '-')}`;
              return Array.from({ length: particleCount }).map((_, i) => (
                <circle key={`${r.id}-${i}`} className={cls}
                  r="2.5" fill={color} opacity="0.7" />
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
                fontFamily: 'var(--font-mono)', fontSize: '9px',
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '0.05em', whiteSpace: 'nowrap',
                padding: '2px 6px',
                background: isDark ? 'rgba(7,7,10,0.5)' : 'rgba(245,242,237,0.6)',
                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              }}>
                {p.name.split('(')[0].trim().toUpperCase()} · {p.mw} MW
              </div>
            ))}
          </div>

          {/* Hover targets */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {projectDots.map(p => (
              <div key={`hover-${p.id}`} style={{
                position: 'absolute',
                left: `${(p.x / MAP_WIDTH) * 100}%`,
                top: `${(p.y / MAP_HEIGHT) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: `${(p.r + 8) * 2}px`, height: `${(p.r + 8) * 2}px`,
                pointerEvents: 'auto', cursor: 'pointer',
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
                  fontFamily: 'var(--font-mono)', fontSize: '10px',
                  padding: '8px 12px',
                  background: isDark ? 'rgba(7,7,10,0.85)' : 'rgba(245,242,237,0.9)',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  border: `1px solid ${isDark ? 'rgba(232,226,217,0.1)' : 'rgba(26,26,31,0.1)'}`,
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20,
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
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, gridColumn: 3, gridRow: 1 }}>
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
          {'€'}{fmt(lr?.today_total_daily)}
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
            {lr.delta_pct < 0 ? '↓' : '↑'} {Math.abs(lr.delta_pct)}% vs base {'€'}{fmt(lr.base_daily)}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 500,
          color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '8px',
        }}>
          {'€'}{lr?.annualised != null ? `${fmt(Math.round(lr.annualised / 1000))}k` : '···'}
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', textTransform: 'uppercase' }}>
            + {fmt(fleet?.baltic_pipeline_mw)} MW PIPELINE
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              S/D {fleet?.sd_ratio != null ? fleet.sd_ratio.toFixed(2) : '—'}{'×'}
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

      {/* ═══ TICKER — seamless loop ═══ */}
      <div style={{
        gridColumn: '1 / -1', overflow: 'hidden', display: 'flex', alignItems: 'center',
        background: isDark ? 'rgba(7,7,10,0.8)' : 'rgba(245,242,237,0.8)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--border-card)', zIndex: 10,
      }}>
        <div style={{
          display: 'flex', whiteSpace: 'nowrap',
          animation: 'tickerScroll 60s linear infinite',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            color: 'var(--text-muted)', letterSpacing: '0.04em',
            paddingRight: '24px',
          }}>{tickerText}</span>
          <span aria-hidden="true" style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            color: 'var(--text-muted)', letterSpacing: '0.04em',
            paddingRight: '24px',
          }}>{tickerText}</span>
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="particle-"] { display: none; }
          [style*="tickerScroll"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
