'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT } from '@/lib/map-projection';
import { COUNTRY_CENTROIDS } from '@/lib/baltic-places';
import calibration from '../../public/hero/map-calibration.json';
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
  ebitda_y1?: number; min_dscr?: number; capex_eur_kwh?: number;
  capex_scenario?: string; cod_year?: number;
}
interface S8Data {
  nordbalt_avg_mw?: number | null; litpol_avg_mw?: number | null;
  nordbalt_signal?: string | null; litpol_signal?: string | null;
}
interface S4Data {
  projects?: Array<{ id?: string; name: string; mw: number; status: string; country: string }>;
  free_mw?: number;
}
interface ReadData {
  capture?: { gross_4h?: number; shape_swing?: number }; updated_at?: string;
}
interface CaptureData { history?: Array<{ gross_4h?: number }> }
interface S2Data { afrr_up_avg?: number; mfrr_up_avg?: number; fcr_avg?: number }

// ═══ Cable paths from calibration clicks ════════════════════════════════════

const nbSe = calibration.gcps.find(g => g.id === 'nordbalt-se')!;
const nbLt = calibration.gcps.find(g => g.id === 'nordbalt-lt')!;
const nbMidX = (nbSe.px + nbLt.px) / 2;
const nbMidY = (nbSe.py + nbLt.py) / 2 - 30;
const NORDBALT_D = `M ${nbSe.px} ${nbSe.py} Q ${nbMidX} ${nbMidY} ${nbLt.px} ${nbLt.py}`;

const lpLt = calibration.gcps.find(g => g.id === 'litpol-lt')!;
const lpPl = calibration.gcps.find(g => g.id === 'litpol-pl')!;
const lpMidX = (lpLt.px + lpPl.px) / 2 - 10;
const lpMidY = (lpLt.py + lpPl.py) / 2;
const LITPOL_D = `M ${lpLt.px} ${lpLt.py} Q ${lpMidX} ${lpMidY} ${lpPl.px} ${lpPl.py}`;

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
        setSparkData((cap as CaptureData).history!
          .map(h => h.gross_4h).filter((v): v is number => v != null));
      }
    });
  }, []);

  // GSAP particles
  useGSAP(() => {
    if (!svgRef.current) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cables = [
      { cls: 'particle-nordbalt', path: '#nordbalt-path', mw: s8?.nordbalt_avg_mw },
      { cls: 'particle-litpol', path: '#litpol-path', mw: s8?.litpol_avg_mw },
    ];

    cables.forEach(({ cls, path, mw }) => {
      const absMw = Math.abs(mw ?? 0);
      if (absMw < 5) return;
      const dur = Math.max(4, 8 - Math.min(absMw / 80, 4));
      const rev = (mw ?? 0) < 0;
      gsap.utils.toArray<SVGCircleElement>(`.${cls}`).forEach((el, i) => {
        gsap.to(el, {
          motionPath: {
            path, align: path, alignOrigin: [0.5, 0.5],
            start: rev ? 1 : 0, end: rev ? 0 : 1,
          },
          duration: dur, repeat: -1, delay: i * 0.8, ease: 'none',
        });
      });
    });
  }, { scope: svgRef, dependencies: [s8] });

  // Derived
  const lr = revenue?.live_rate;
  const countries = fleet?.countries;
  const totalOp = fleet?.baltic_operational_mw ?? 0;

  // Operational project dots from geocode cache
  const projectDots = useMemo(() => {
    const ops = (s4?.projects ?? []).filter(p =>
      ['operational', 'live', 'commissioned'].includes((p.status ?? '').toLowerCase())
    );
    return ops.map(p => {
      const id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const geo = (geocodes as Record<string, { resolved: boolean; lat?: number; lng?: number }>)[id];
      if (!geo?.resolved || !geo.lat || !geo.lng) return null;
      const { x, y } = geoToPixel(geo.lat, geo.lng);
      const r = 2.5 + Math.sqrt(p.mw / 10);
      return { id, name: p.name, x, y, r, mw: p.mw };
    }).filter(Boolean) as { id: string; name: string; x: number; y: number; r: number; mw: number }[];
  }, [s4]);

  // Ticker content
  const tickerItems = useMemo(() => {
    const items: string[] = [];
    if (read?.capture?.gross_4h != null) items.push(`DA CAPTURE €${fmt(read.capture.gross_4h)}/MWh`);
    if (s2?.afrr_up_avg != null) items.push(`AFRR €${s2.afrr_up_avg.toFixed(2)}/MWh`);
    if (s2?.mfrr_up_avg != null) items.push(`MFRR €${s2.mfrr_up_avg.toFixed(1)}/MWh`);
    if (s2?.fcr_avg != null) items.push(`FCR €${s2.fcr_avg.toFixed(2)}/MWh`);
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
  const isDark = theme === 'dark';

  const RING_R = 50;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr 320px',
      gridTemplateRows: '1fr 40px',
      minHeight: '720px',
      maxHeight: '900px',
      gap: '0',
      background: 'var(--bg-page)',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* ═══ LEFT COLUMN ═══ */}
      <div style={{
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0',
        zIndex: 2,
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '56px',
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
          lineHeight: 1.6,
        }}>
          9 SIGNALS · 4H UPDATES · ENTSO-E · LITGRID · AST · ELERING
        </p>

        <div style={{ height: '40px' }} />

        {/* Interconnector flows */}
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '12px',
          }}>
            INTERCONNECTORS · LIVE FLOW
          </div>

          {[
            { label: 'NORDBALT', mw: s8?.nordbalt_avg_mw, cap: 700 },
            { label: 'LITPOL', mw: s8?.litpol_avg_mw, cap: 500 },
          ].map(row => {
            const mw = row.mw;
            const isImport = (mw ?? 0) < 0;
            const color = mw == null ? 'var(--text-muted)' : isImport ? 'var(--amber)' : 'var(--teal)';
            return (
              <div key={row.label} style={{
                display: 'grid',
                gridTemplateColumns: '24px 90px 80px auto',
                alignItems: 'baseline',
                fontFamily: 'var(--font-mono)',
                padding: '4px 0',
              }}>
                <span style={{ fontSize: '16px', color }}>{mw == null ? '·' : isImport ? '↙' : '↗'}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>{row.label}</span>
                <span style={{
                  fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                }}>
                  {mw != null ? Math.abs(mw) : '—'}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '2px' }}>MW</span>
                </span>
                <span style={{
                  fontSize: '10px', color, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginLeft: '8px',
                }}>
                  {mw != null ? (isImport ? 'IMPORTING' : 'EXPORTING') : ''}
                </span>
              </div>
            );
          })}

          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
            opacity: 0.6,
            marginTop: '12px',
          }}>
            EstLink, Fenno-Skan — infrastructure, untracked
          </p>
        </div>
      </div>

      {/* ═══ CENTER — MAP ═══ */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'relative',
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          maxHeight: '820px',
          height: '100%',
        }}>
          <img
            src={`/hero/kkme-interconnect-${theme}.png`}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            alt="Baltic interconnect map"
          />

          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {/* Invisible motion paths */}
            <defs>
              <path id="nordbalt-path" d={NORDBALT_D} fill="none" stroke="none" />
              <path id="litpol-path" d={LITPOL_D} fill="none" stroke="none" />
            </defs>

            {/* Country rings */}
            {COUNTRY_CENTROIDS.map(c => {
              const { x, y } = geoToPixel(c.lat, c.lng);
              return (
                <circle key={c.id} cx={x} cy={y} r={RING_R}
                  fill="none" stroke="var(--teal)"
                  strokeWidth="1.5" strokeOpacity="0.3"
                  strokeDasharray="2 5"
                />
              );
            })}

            {/* Operational project dots */}
            <g style={{ mixBlendMode: 'screen' }}>
              {projectDots.map(p => (
                <circle key={p.id} cx={p.x} cy={p.y} r={p.r}
                  fill="var(--teal)" opacity="0.85">
                  <title>{p.name} ({p.mw} MW)</title>
                </circle>
              ))}
            </g>

            {/* Particles — NordBalt */}
            <g style={{ mixBlendMode: 'screen' }}>
              {[0, 1, 2, 3, 4].map(i => (
                <circle key={`nb${i}`} className="particle-nordbalt"
                  r="3" fill={s8?.nordbalt_avg_mw != null && s8.nordbalt_avg_mw < 0 ? 'var(--amber)' : 'var(--teal)'}
                  opacity="0.9" />
              ))}
            </g>

            {/* Particles — LitPol */}
            <g style={{ mixBlendMode: 'screen' }}>
              {[0, 1, 2, 3, 4].map(i => (
                <circle key={`lp${i}`} className="particle-litpol"
                  r="3" fill={s8?.litpol_avg_mw != null && s8.litpol_avg_mw < 0 ? 'var(--amber)' : 'var(--teal)'}
                  opacity="0.9" />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* ═══ RIGHT COLUMN ═══ */}
      <div style={{
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0',
        zIndex: 2,
      }}>
        {/* Live rate */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          50 MW · 4H · {lr?.as_of ? new Date(lr.as_of).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) + ' UTC' : ''}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '80px',
          fontWeight: 500,
          color: lr?.today_total_daily != null ? 'var(--text-primary)' : 'var(--text-ghost)',
          lineHeight: 1,
          marginTop: '4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          €{fmt(lr?.today_total_daily)}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          /MW/DAY
        </div>

        {lr?.delta_pct != null && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: lr.delta_pct < 0 ? 'var(--rose)' : 'var(--teal)',
            marginTop: '8px',
            fontVariantNumeric: 'tabular-nums',
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
          €{lr?.annualised != null ? `${fmt(Math.round(lr.annualised / 1000))}k` : '···'}
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
            /MW/YR
          </span>
        </div>

        {sparkData.length > 3 && (
          <div style={{ marginTop: '12px' }}>
            <Sparkline data={sparkData} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: '2px',
            }}>
              30D CAPTURE TREND
            </div>
          </div>
        )}

        <div style={{ height: '32px' }} />

        {/* Fleet */}
        <div>
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

          {countries && totalOp > 0 && (() => {
            const order = ['EE', 'LT', 'LV'] as const;
            const opacities = [0.5, 0.85, 0.35];
            return (
              <>
                <div style={{ display: 'flex', gap: '1px', height: '10px', marginBottom: '4px', maxWidth: '280px' }}>
                  {order.map((k, i) => {
                    const c = countries[k];
                    if (!c) return null;
                    return (
                      <div key={k} style={{
                        width: `${(c.operational_mw / totalOp) * 100}%`,
                        background: 'var(--teal)',
                        opacity: opacities[i],
                      }} />
                    );
                  })}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', maxWidth: '280px',
                  fontFamily: 'var(--font-mono)', fontSize: '11px',
                }}>
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
            <span style={{
              fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: '4px',
            }}>OPERATIONAL</span>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px',
            color: 'var(--text-secondary)', marginTop: '2px',
          }}>
            + {fmt(fleet?.baltic_pipeline_mw)} MW pipeline
          </div>

          <div style={{
            display: 'flex', gap: '12px', marginTop: '8px',
            fontFamily: 'var(--font-mono)', fontSize: '12px',
          }}>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              S/D {fleet?.sd_ratio != null ? fleet.sd_ratio.toFixed(2) : '—'}×
            </span>
            {fleet?.phase && (
              <span style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-card)',
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
      </div>

      {/* ═══ TICKER — spans all 3 columns ═══ */}
      <div style={{
        gridColumn: '1 / -1',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        background: isDark ? 'rgba(7,7,10,0.8)' : 'rgba(245,242,237,0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--border-card)',
        zIndex: 10,
      }}>
        <div style={{
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          animation: 'tickerScroll 60s linear infinite',
        }}>
          {tickerText} · {tickerText} ·{' '}
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .particle-nordbalt, .particle-litpol { display: none; }
        }
      `}</style>
    </section>
  );
}
