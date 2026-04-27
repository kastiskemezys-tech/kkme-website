'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { AnimatePresence, motion } from 'motion/react';
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT, CABLE_PATHS, COUNTRY_LABEL_PIXELS, CITY_LABEL_PIXELS, WAYPOINT_START } from '@/lib/map-projection';
import { INTERCONNECTORS, resolveFlow } from '@/lib/baltic-places';
import type { ResolvedFlow } from '@/lib/baltic-places';
import { resolveCollisions } from '@/lib/label-layout';
import type { LabelBox } from '@/lib/label-layout';
import geocodes from '../../public/hero/project-geocodes.json';
import { HERO_EXCLUDED_PROJECT_IDS } from '@/lib/project-overrides';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
import { formatTickerItem } from '@/app/lib/ticker';
import { IRR_LABELS } from '@/app/lib/irrLabels';
import { ThemeToggle } from './ThemeToggle';
import { Sparkline as SharedSparkline } from './Sparkline';
import { ChartTooltipPortal, useChartTooltipState } from '@/app/components/primitives';

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
interface GenLoadCountry { generation_mw: number | null; load_mw: number | null; net_mw: number | null; timestamp: string | null; data_age_minutes: number | null }
interface GenLoadData { lt: GenLoadCountry | null; lv: GenLoadCountry | null; ee: GenLoadCountry | null; fetched_at: string }

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

function formatPower(mw: number | null | undefined): string {
  if (mw == null || isNaN(mw)) return '';
  if (Math.abs(mw) >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

const dotRadius = (mw: number) => 3 + Math.sqrt(mw / 10) * 1.2;

// Phase 7.7e — replaced inline Sparkline definition with shared component import
// (top of file). The shared Sparkline carries the unified ChartTooltip primitive
// so the 30D capture trend mini-chart now hovers consistently with every other
// chart on the site.

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
  const [genLoad, setGenLoad] = useState<GenLoadData | null>(null);
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [hoveredProject, setHoveredProject] = useState<MappedProject | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cableTip = useChartTooltipState();

  const fetchAll = useCallback(() => {
    return Promise.all([
      fetch(`${W}/s4/fleet`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/revenue?dur=4h`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/read`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s8`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s4`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s1/capture`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/s2`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${W}/genload`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([fl, rv, rd, i, s4d, cap, s2d, gl]) => {
      setFleet(fl); setRevenue(rv); setRead(rd); setS8(i); setS4(s4d); setS2(s2d); setGenLoad(gl);
      if (cap?.history) {
        setSparkData(cap.history.map((h: { gross_4h?: number }) => h.gross_4h).filter((v: unknown): v is number => v != null));
      }
    });
  }, []);

  // Initial mount fetch
  useEffect(() => {
    fetchAll().then(() => setIsLoaded(true));
  }, [fetchAll]);

  // Auto-refresh every 5 minutes (background — keeps existing data on failure)
  useEffect(() => {
    const id = setInterval(() => {
      setIsRefreshing(true);
      fetchAll().finally(() => setIsRefreshing(false));
    }, REFRESH_HOT);
    return () => clearInterval(id);
  }, [fetchAll]);

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

    // Country gen/load labels (2 lines: 15px gen + 12px load = ~36px tall)
    const countryMwBoxes: LabelBox[] = []
    for (const [label, countryKey] of [['LITHUANIA', 'lt'], ['LATVIA', 'lv'], ['ESTONIA', 'ee']] as const) {
      const pos = COUNTRY_LABEL_PIXELS[label]
      if (!pos) continue
      const genText = `${formatPower(genLoad?.[countryKey]?.generation_mw)} gen`
      const boxWidth = Math.max(genText.length * CHAR_W(15), 90)
      countryMwBoxes.push({
        id: `mw-${countryKey.toUpperCase()}`, x: pos.x - boxWidth / 2, y: pos.y + 14,
        width: boxWidth, height: 36,
        type: 'country-mw', movable: true,
      })
    }
    boxes.push(...countryMwBoxes)

    // City labels — render all, no project-proximity hiding
    const cityBoxes: LabelBox[] = Object.entries(CITY_LABEL_PIXELS).map(([id, city]) => ({
      id: `city-${id}`,
      x: city.x + 7, y: city.y - 6,
      width: city.name.toUpperCase().length * CHAR_W(10), height: 14,
      type: 'city' as const, movable: true,
    }))
    boxes.push(...cityBoxes)

    const resolved = resolveCollisions(boxes)

    // Extract resolved positions by id
    const posMap: Record<string, { x: number; y: number }> = {}
    for (const b of resolved) posMap[b.id] = { x: b.x, y: b.y }

    return { posMap }
  }, [countries, genLoad])

  // Ticker
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (read?.capture?.gross_4h != null) items.push(formatTickerItem('da_capture', 'DA CAPTURE', read.capture.gross_4h, 0));
    if (s2?.afrr_up_avg != null) items.push(formatTickerItem('afrr', 'AFRR', s2.afrr_up_avg, 2));
    if (s2?.mfrr_up_avg != null) items.push(formatTickerItem('mfrr', 'MFRR', s2.mfrr_up_avg, 1));
    if (revenue?.project_irr != null) items.push(`${IRR_LABELS.unlevered.short.toUpperCase()} ${(revenue.project_irr * 100).toFixed(1)}%`);
    if (revenue?.equity_irr != null) items.push(`${IRR_LABELS.equity.short.toUpperCase()} ${(revenue.equity_irr * 100).toFixed(1)}%`);
    if (revenue?.min_dscr != null) items.push(`DSCR ${revenue.min_dscr.toFixed(2)}×`);
    if (revenue?.capex_scenario) items.push(`CAPEX ${revenue.capex_scenario}`);
    if (fleet?.eff_demand_mw != null) items.push(`EFFECTIVE DEMAND ${fmt(fleet.eff_demand_mw)} MW`);
    if (s4?.free_mw != null) items.push(`FREE GRID ${fmt(s4.free_mw)} MW`);
    if (revenue?.cod_year) items.push(`COD ${revenue.cod_year}`);
    return items;
  }, [read, s2, revenue, fleet, s4]);

  const tickerText = tickerItems.join(' · ');

  function arrowColorVar(c: 'rose' | 'teal' | 'neutral'): string {
    if (c === 'rose') return 'var(--rose)';
    if (c === 'teal') return 'var(--teal)';
    return 'var(--text-tertiary)';
  }

  return (
    <section className="hero-section" style={{
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

      {/* ═══ THEME TOGGLE — top right ═══ */}
      <div style={{
        position: 'absolute', top: '12px', right: '12px', zIndex: 20,
      }}>
        <ThemeToggle variant="hero" />
      </div>

      {/* ═══ LEFT COLUMN ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 2, gridColumn: 1, gridRow: 1 }}>
        <h1 style={{ margin: 0, lineHeight: 1 }}>
          <img src="/design-assets/Logo/kkme-white.png" alt="KKME" height={48} width={228} className="logo-dark" />
          <img src="/design-assets/Logo/kkme-black.png" alt="KKME" height={48} width={228} className="logo-light" />
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
          Baltic flexibility market, live
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '8px', lineHeight: 1.6,
        }}>
          LIVE · ENTSO-E · LITGRID · AST · ELERING
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
          {/* Map base — designed SVG layers for both dark and light themes */}
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img
              src={isDark ? "/design-assets/Map/Layers/background-black.svg" : "/design-assets/Map/Layers/background-light.svg"}
              alt="Baltic map background"
              width={MAP_WIDTH} height={MAP_HEIGHT}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <img
              src={isDark ? "/design-assets/Map/Layers/countries.svg" : "/design-assets/Map/Layers/countries-light.svg"}
              alt=""
              width={MAP_WIDTH} height={MAP_HEIGHT}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

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

            {/* Visible cable strokes — sole cable visual (raster layer removed) */}
            <g data-layer="cable-strokes">
              {Object.entries(CABLE_PATHS).map(([id, d]) =>
                d ? <path key={`stroke-${id}`} d={d}
                      fill="none"
                      stroke="var(--cable-stroke, var(--teal))"
                      strokeWidth="2.5"
                      strokeOpacity="0.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    /> : null
              )}
            </g>

            {/* Phase 7.7e — invisible wide-stroke hit targets for cable hover.
              * Each cable surfaces a unified ChartTooltip with name, MW, freshness. */}
            <g data-layer="cable-hover-targets" style={{ pointerEvents: 'auto' }}>
              {Object.entries(CABLE_PATHS).map(([id, d]) => {
                if (!d) return null;
                const flow = resolved.find(r => r.id === id);
                if (!flow) return null;
                const freshnessRecord = (s8 as unknown as { freshness?: Record<string, string | null> } | null)?.freshness;
                const freshness = freshnessRecord?.[id];
                const showTip = (e: React.MouseEvent) => cableTip.show({
                  label: flow.displayName,
                  value: flow.mw,
                  unit: 'MW',
                  secondary: [
                    { label: 'Direction', value: `${flow.fromCountry} → ${flow.toCountry}` },
                    ...(typeof flow.utilization === 'number' ? [{ label: 'Utilisation', value: flow.utilization * 100, unit: '%' }] : []),
                    ...(freshness ? [{ label: 'Freshness', value: freshness }] : []),
                  ],
                  source: 'energy-charts.info',
                }, e.clientX, e.clientY);
                return (
                  <path
                    key={`hit-${id}`}
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    strokeLinecap="round"
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={showTip}
                    onMouseMove={showTip}
                    onMouseLeave={() => cableTip.hide()}
                  />
                );
              })}
            </g>

            {/* City labels with halo stroke — collision-resolved */}
            <g data-layer="cities">
              {Object.entries(CITY_LABEL_PIXELS).map(([id, city]) => {
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

            {/* Country name labels — positioned from designed country-labels.svg */}
            <g data-layer="country-names">
              {([
                ['FINLAND',   676, 195],
                ['SWEDEN',    127, 401],
                ['ESTONIA',   745, 459],
                ['LATVIA',    775, 701],
                ['LITHUANIA', 638, 903],
                ['POLAND',    304, 1114],
              ] as const).map(([name, x, y]) => (
                <text key={name} x={x} y={y}
                  fontFamily="var(--font-display)"
                  fontSize="18"
                  fontWeight="700"
                  fill="var(--text-secondary)"
                  opacity="0.6"
                  letterSpacing="0.15em"
                  style={{
                    paintOrder: 'stroke fill',
                    stroke: 'var(--theme-bg, #0a0a0a)',
                    strokeWidth: '4px',
                    strokeLinejoin: 'round' as const,
                    strokeOpacity: 0.95,
                  }}
                >{name}</text>
              ))}
            </g>

            {/* Country gen/load — collision-resolved 2-line stack */}
            <g data-layer="country-totals">
              {([
                ['LITHUANIA', 'lt'],
                ['LATVIA', 'lv'],
                ['ESTONIA', 'ee'],
              ] as const).map(([label, countryKey]) => {
                const pos = COUNTRY_LABEL_PIXELS[label];
                if (!pos) return null;
                const gl = genLoad?.[countryKey];
                const resolved = resolvedLabels.posMap[`mw-${countryKey.toUpperCase()}`];
                const centerX = resolved ? resolved.x + 45 : pos.x;
                const baseY = resolved ? resolved.y + 15 : pos.y + 24;
                const genStr = formatPower(gl?.generation_mw);
                const loadStr = formatPower(gl?.load_mw);
                if (!genStr && !loadStr) return null;
                return (
                  <g key={label}>
                    {genStr && <text x={centerX} y={baseY}
                      fontFamily="DM Mono, monospace" fontSize="15"
                      fontWeight="500"
                      fill="var(--accent-teal, var(--teal))"
                      textAnchor="middle" letterSpacing="0.02em"
                      style={{
                        paintOrder: 'stroke fill',
                        stroke: 'var(--theme-bg, #0a0a0a)',
                        strokeWidth: '4px',
                        strokeLinejoin: 'round' as const,
                        strokeOpacity: 0.95,
                      }}
                    >{genStr} gen</text>}
                    {loadStr && <text x={centerX} y={baseY + 18}
                      fontFamily="DM Mono, monospace" fontSize="12"
                      fill="var(--text-secondary)"
                      textAnchor="middle" letterSpacing="0.02em"
                      style={{
                        paintOrder: 'stroke fill',
                        stroke: 'var(--theme-bg, #0a0a0a)',
                        strokeWidth: '3px',
                        strokeLinejoin: 'round' as const,
                      }}
                    >{loadStr} load</text>}
                  </g>
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

            {/* Particles — all 6 cables. Unified color via --cable-particle
                token so dark/light themes can tune contrast against the raster. */}
            {resolved.map(r => {
              if (!CABLE_PATHS[r.id] || r.mw < 5) return null;
              const particleCount = Math.max(3, Math.min(8, Math.round(r.mw / 80)));
              const cls = `particle-${r.id.replace(/[^a-z0-9]/g, '-')}`;
              return Array.from({ length: particleCount }).flatMap((_, i) => [
                <circle key={`${r.id}-glow-${i}`} className={cls}
                  r="6" fill="var(--cable-particle)" opacity="0.15" />,
                <circle key={`${r.id}-core-${i}`} className={cls}
                  r="3" fill="var(--cable-particle)" opacity="0.9" />,
              ]);
            })}
          </svg>

          {/* Hover targets — TODO: Phase 3 mobile tap-to-reveal for project tooltips */}
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
                  borderRadius: '6px',
                  background: 'var(--map-bg)',
                  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid var(--border-card)',
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
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', zIndex: 2, gridColumn: 3, gridRow: 1 }}>

        {/* Block 1 — Revenue headline */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <div
              className={(!isLoaded || isRefreshing) ? 'pulse-dot' : 'static-dot'}
              aria-hidden="true"
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--teal)', flexShrink: 0,
              }}
            />
            <span>50 MW · 4H · {lr?.as_of ? new Date(lr.as_of).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            }) + ' UTC' : ''}</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '72px', fontWeight: 500,
            color: lr?.today_total_daily != null ? 'var(--text-primary)' : 'var(--text-ghost)',
            lineHeight: 1, marginTop: '4px', fontVariantNumeric: 'tabular-nums',
          }}>
            {'€'}{fmt(lr?.today_total_daily)}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>/MW/DAY</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
            {lr?.delta_pct != null && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '12px',
                color: lr.delta_pct < 0 ? 'var(--rose)' : 'var(--teal)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {lr.delta_pct < 0 ? '↓' : '↑'} {Math.abs(lr.delta_pct)}% vs base
              </span>
            )}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 500,
              color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
            }}>
              {'€'}{lr?.annualised != null ? `${fmt(Math.round(lr.annualised / 1000))}k` : '···'}
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '3px' }}>/MW/YR</span>
            </span>
          </div>
          {sparkData.length > 3 && (
            <div style={{ marginTop: '10px' }}>
              <SharedSparkline values={sparkData} width={200} height={30} unit="€/MW/day" rangeUnit="€/MW/day" />
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px',
              }}>30D CAPTURE TREND</div>
            </div>
          )}
          {revenue?.project_irr != null && (
            <div
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--amber-strong)',
                marginTop: '6px', fontVariantNumeric: 'tabular-nums',
              }}
              title={IRR_LABELS.unlevered.long + ' — ' + IRR_LABELS.unlevered.detail}
            >
              {(revenue.project_irr * 100).toFixed(1)}% {IRR_LABELS.unlevered.short}
            </div>
          )}
        </div>

        {/* Block 2 — Fleet composition */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px',
          }}>BALTIC FLEET</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 500,
            color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(totalOp)} MW
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '4px' }}>OPERATIONAL</span>
          </div>
          {countries && totalOp > 0 && (() => {
            const order = ['EE', 'LT', 'LV'] as const;
            const opacities = [0.5, 0.85, 0.35];
            return (
              <>
                <div style={{ display: 'flex', gap: '1px', height: '8px', marginTop: '6px', marginBottom: '4px', borderRadius: '4px', overflow: 'hidden' }}>
                  {order.map((k, i) => {
                    const c = countries[k];
                    if (!c) return null;
                    return <div key={k} style={{ width: `${(c.operational_mw / totalOp) * 100}%`, background: 'var(--teal)', opacity: opacities[i] }} />;
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', textTransform: 'uppercase' }}>
            + {fmt(fleet?.baltic_pipeline_mw)} MW PIPELINE
          </div>
        </div>

        {/* Block 3 — Key ratios */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px',
        }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>S/D</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
              {fleet?.sd_ratio != null ? fleet.sd_ratio.toFixed(2) : '—'}{'×'}
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CPI</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
              {fleet?.cpi != null ? fleet.cpi.toFixed(2) : '—'}
            </div>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>PHASE</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--text-primary)', textTransform: 'uppercase', marginTop: '2px' }}>
              {fleet?.phase ?? '—'}
            </div>
          </div>
        </div>

      </div>

      {/* ═══ TICKER — seamless loop ═══ */}
      <div style={{
        gridColumn: '1 / -1', overflow: 'hidden', display: 'flex', alignItems: 'center',
        borderRadius: '6px',
        background: 'var(--overlay-heavy)',
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
      <ChartTooltipPortal tt={cableTip} />
    </section>
  );
}
