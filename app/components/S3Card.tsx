'use client';

import React, { useState } from 'react';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import { SourceFooter, DetailsDrawer } from '@/app/components/primitives';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BreakdownItem {
  range_kwh?: number[];
  range_kw?: number[];
  mid_kwh?: number;
  mid_kw?: number;
  label: string;
  scope: string;
}

interface CostProfile {
  capex_range_kwh: number[];
  capex_range_kw: number[];
  breakdown: Record<string, BreakdownItem>;
  reference_mid_kwh: number;
  notes: string;
}

interface CostDriver {
  driver: string;
  direction: string;
  symbol: string;
  magnitude: string;
  component: string;
  detail: string;
}

interface Transaction {
  project: string;
  country: string;
  mw: number;
  mwh: number;
  eur_kwh_approx: number;
  scope: string;
  year: number;
  integrator: string | null;
  cost_driver: string;
}

interface Player { name: string; hq: string; positioning: string; }

interface S3Signal {
  timestamp?: string | null;
  lithium_eur_t?: number | null;
  lithium_trend?: string | null;
  cell_eur_kwh?: number | null;
  china_system_eur_kwh?: number | null;
  europe_system_eur_kwh?: number | null;
  ref_source?: string | null;
  ref_date?: string | null;
  euribor_3m?: number | null;
  euribor_nominal_3m?: number | null;
  euribor_real_3m?: number | null;
  hicp_yoy?: number | null;
  euribor_trend?: string | null;
  signal?: string | null;
  interpretation?: string | null;
  source?: string | null;
  unavailable?: boolean;
  cost_profiles?: Record<string, CostProfile>;
  cost_drivers?: CostDriver[];
  uncertainty?: { range_pct: string; primary_driver: string; note: string };
  trend?: { direction: string; twelve_month: string; note: string };
  lcos_reference?: { range_eur_mwh: number[]; assumptions: Record<string, unknown>; note: string };
  technology?: Record<string, unknown>;
  transactions?: Transaction[];
  key_players?: Record<string, Player[]>;
  grid_scope_classes?: { id: string; label: string; description: string; adder_kwh: number[] }[];
  data_freshness?: Record<string, { last_update: string; cadence: string; status: string }>;
  confidence?: { level: string; observed_share: number; benchmark_share: number; modeled_share: number };
}

type Duration = '2h' | '4h';
type GridScope = 'light' | 'heavy';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dirColor(symbol: string): string {
  if (symbol === '\u2193' || symbol === '↓') return 'var(--teal)';
  if (symbol === '\u2191' || symbol === '↑') return 'var(--amber)';
  return 'var(--text-secondary)';
}

function trendArrow(direction: string): { symbol: string; color: string } {
  if (direction === 'easing') return { symbol: '↘', color: 'var(--teal)' };
  if (direction === 'rising') return { symbol: '↗', color: 'var(--rose)' };
  return { symbol: '→', color: 'var(--text-secondary)' };
}

function magDots(mag: string): string {
  if (mag === 'strong') return '●●●';
  if (mag === 'moderate') return '●●';
  return '●';
}

function colorTrendLine(line: string): React.ReactElement {
  const parts = line.split(' · ');
  return (
    <span>
      {parts.map((p, i) => {
        const color = p.startsWith('↓') ? 'var(--teal)' : p.startsWith('↑') ? 'var(--amber)' : 'var(--text-secondary)';
        return (
          <span key={i}>
            {i > 0 && <span style={{ color: 'var(--text-ghost)' }}> · </span>}
            <span style={{ color }}>{p}</span>
          </span>
        );
      })}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function S3Card() {
  const { status, data } = useSignal<S3Signal>(`${WORKER_URL}/s3`);
  const [duration, setDuration] = useState<Duration>('4h');
  const [gridScope, setGridScope] = useState<GridScope>('heavy');
  const [expandedChip, setExpandedChip] = useState<number | null>(null);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '1rem', width: '45%', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '2rem', width: '35%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '80px', width: '100%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Cost data unavailable</p></article>;
  }

  const profile = data.cost_profiles?.[duration];
  const drivers = data.cost_drivers || [];
  const trendData = data.trend;
  const uncertaintyData = data.uncertainty;
  const lcosData = data.lcos_reference;
  const confLevel = data.confidence?.level || 'benchmark-heavy';

  // Compute displayed CAPEX range based on scope toggle
  const baseRange = profile?.capex_range_kwh || [160, 210];
  const scopeShift = gridScope === 'light' ? [-10, -20] : [0, 0];
  const displayRange = [baseRange[0] + scopeShift[0], baseRange[1] + scopeShift[1]];
  const kwRange = profile?.capex_range_kw || [displayRange[0] * parseInt(duration), displayRange[1] * parseInt(duration)];
  const trendArrowData = trendData ? trendArrow(trendData.direction) : null;

  // Breakdown bar scale
  const breakdown = profile?.breakdown || {};
  const breakdownEntries = Object.entries(breakdown);
  const durationH = parseInt(duration);
  const maxKwh = Math.max(...breakdownEntries.map(([, b]) => {
    if (b.range_kwh) return b.range_kwh[1];
    if (b.range_kw) return b.range_kw[1] / durationH;
    return 0;
  }), 1);

  return (
    <article style={{ width: '100%' }}>
      {/* 1. HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <h3 style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)',
          letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, margin: 0,
        }}>
          BESS cost &amp; technology
        </h3>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)', border: '1px solid var(--border-card)',
          padding: '1px 6px', borderRadius: '2px',
        }}>
          {confLevel}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Installed cost reference · scope-adjusted range
      </p>

      {/* 2. TOGGLES */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['2h', '4h'] as Duration[]).map(d => (
            <button key={d} onClick={() => setDuration(d)} style={{
              all: 'unset', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              padding: '3px 8px', cursor: 'pointer',
              color: duration === d ? 'var(--teal)' : 'var(--text-muted)',
              borderBottom: duration === d ? '1px solid var(--teal)' : '1px solid transparent',
              transition: 'color 150ms, border-color 150ms',
            }}>
              {d}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['light', 'heavy'] as GridScope[]).map(s => (
            <button key={s} onClick={() => setGridScope(s)} style={{
              all: 'unset', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              padding: '3px 8px', cursor: 'pointer', textTransform: 'capitalize',
              color: gridScope === s ? 'var(--teal)' : 'var(--text-muted)',
              borderBottom: gridScope === s ? '1px solid var(--teal)' : '1px solid transparent',
              transition: 'color 150ms, border-color 150ms',
            }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 3. HERO — CAPEX RANGE */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.75rem', color: 'var(--text-primary)', fontWeight: 400 }}>
            €{displayRange[0]}–{displayRange[1]}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>/kWh</span>
          {trendArrowData && (
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.25rem', color: trendArrowData.color }}>{trendArrowData.symbol}</span>
          )}
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', margin: '2px 0' }}>
          €{kwRange[0]}–{kwRange[1]} /kW @ POI
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
          installed · ex-VAT · {duration} LFP · grid-{gridScope}
        </p>
      </div>

      {/* 4. UNCERTAINTY + TREND */}
      {uncertaintyData && trendData && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', lineHeight: 1.6, marginBottom: '20px' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            {uncertaintyData.range_pct} · {uncertaintyData.primary_driver}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            12M: {colorTrendLine(trendData.twelve_month)}
          </div>
        </div>
      )}

      {/* 5. DRIVER CHIPS */}
      {drivers.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {drivers.filter(d => d.magnitude !== 'weak' || d.direction !== 'stable').map((d, i) => (
              <button
                key={i}
                onClick={() => setExpandedChip(expandedChip === i ? null : i)}
                style={{
                  all: 'unset', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-card)',
                  borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
                  transition: 'border-color 150ms',
                  borderColor: expandedChip === i ? 'var(--border-highlight)' : undefined,
                }}
              >
                <span style={{ color: dirColor(d.symbol) }}>{d.symbol} {d.driver}</span>
                <span style={{ color: 'var(--text-muted)' }}> · {magDots(d.magnitude)}</span>
              </button>
            ))}
          </div>
          {expandedChip !== null && drivers[expandedChip] && (
            <p style={{
              fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5,
              marginTop: '8px', paddingLeft: '4px',
            }}>
              {drivers[expandedChip].detail}
            </p>
          )}
        </div>
      )}

      {/* 6. BREAKDOWN BARS */}
      {breakdownEntries.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            borderTop: '1px solid var(--border-card)', paddingTop: '10px', marginBottom: '8px',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Breakdown · mid-case · ranges vary by scope &amp; supplier
          </div>
          {breakdownEntries.map(([key, b]) => {
            const isKw = !!b.range_kw && !b.range_kwh;
            const rangeRaw = b.range_kwh || (b.range_kw ? [b.range_kw[0] / durationH, b.range_kw[1] / durationH] : [0, 0]);
            const midRaw = b.mid_kwh ?? (b.mid_kw ? b.mid_kw / durationH : undefined);
            const barLow = (rangeRaw[0] / maxKwh) * 100;
            const barHigh = (rangeRaw[1] / maxKwh) * 100;
            const barMid = midRaw ? (midRaw / maxKwh) * 100 : undefined;
            const isHv = key === 'hv_grid';
            const barColor = isHv ? 'var(--amber)' : 'var(--teal)';
            const rangeLabel = isKw
              ? `~€${b.range_kw![0]}–${b.range_kw![1]}/kW`
              : `~€${b.range_kwh![0]}–${b.range_kwh![1]}/kWh`;

            return (
              <div key={key} style={{ marginBottom: '6px' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '140px 90px 1fr auto',
                  gap: '4px 8px', alignItems: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
                }}>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.label}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.625rem' }}>{rangeLabel}</span>
                  <div style={{ position: 'relative', height: '10px', background: 'rgba(232,226,217,0.03)', borderRadius: '2px', overflow: 'hidden' }}>
                    {/* Range band */}
                    <div style={{
                      position: 'absolute', left: `${barLow}%`, width: `${barHigh - barLow}%`,
                      height: '100%', background: barColor, opacity: 0.15, borderRadius: '2px',
                      transition: 'left 300ms ease, width 300ms ease',
                    }} />
                    {/* Mid marker */}
                    {barMid !== undefined && (
                      <div style={{
                        position: 'absolute', left: `${barMid}%`, width: '2px', height: '100%',
                        background: barColor, borderRadius: '1px',
                        transition: 'left 300ms ease',
                      }} />
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.5625rem', whiteSpace: 'nowrap' }}>
                    {b.scope === 'grid-scope-dependent' ? 'grid-scope' : b.scope.replace('equipment-only', 'equip').replace('installed excl. grid', 'installed').replace('installed', 'installed')}
                  </span>
                </div>
                {isKw && (
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '1px', paddingLeft: '140px' }}>
                    fixed per MW — cost per kWh scales with duration
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 7. LCOS REFERENCE */}
      {lcosData && (
        <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              LCOS (reference)
            </span>
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1rem', color: 'var(--text-primary)' }}>
              €{lcosData.range_eur_mwh[0]}–{lcosData.range_eur_mwh[1]}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>/MWh delivered</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
            {['300–365 cycles/yr', '85–88% RTE', '6–9% WACC', 'aug Y8–12'].map(pill => (
              <span key={pill} style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)',
                border: '1px solid var(--border-card)', padding: '2px 6px', borderRadius: '3px',
              }}>
                {pill}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            Full computation →{' '}
            <a href="#revenue" style={{ color: 'var(--teal)', textDecoration: 'none' }}
              onClick={e => { e.preventDefault(); document.getElementById('revenue')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Revenue Engine
            </a>
          </p>
        </div>
      )}

      {/* 8. MODEL INPUT FOOTER */}
      <SourceFooter
        source={data.source ?? 'tradingeconomics.com + ECB'}
        updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined}
        dataClass="reference"
      />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: '8px' }}>
        MODEL INPUT → CAPEX reference · Financing cost
      </div>

      {/* ═══ DRAWERS ═══ */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>

        {/* Drawer A: Baltic transactions */}
        {data.transactions && data.transactions.length > 0 && (
          <DetailsDrawer label="Baltic transaction evidence">
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', borderCollapse: 'collapse', width: '100%', minWidth: '400px' }}>
                <thead>
                  <tr style={{ color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.5625rem' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 400 }}>Project</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>Ctry</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>MW/MWh</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>€/kWh</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>Scope</th>
                    <th style={{ textAlign: 'left', padding: '4px 0 4px 8px', fontWeight: 400 }}>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map(t => (
                    <tr key={t.project} style={{ borderBottom: '1px solid rgba(232,226,217,0.03)' }}>
                      <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-secondary)' }}>{t.project}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{t.country}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', textAlign: 'right' }}>{t.mw}/{t.mwh}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-primary)', textAlign: 'right' }}>{t.eur_kwh_approx}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{t.scope}</td>
                      <td style={{ padding: '5px 0 5px 8px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.cost_driver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.5 }}>
              Scope drives Baltic variance. Grid + substation can add 50–200% vs equipment-only. Do not average across transactions.
            </p>
          </DetailsDrawer>
        )}

        {/* Drawer B: Technology profile */}
        {data.technology && (
          <DetailsDrawer label="Technology profile · LFP">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '12px' }}>
              {[
                ['Calendar life', `${(data.technology as Record<string, unknown>).calendar_life_years ? `${(data.technology.calendar_life_years as number[])[0]}–${(data.technology.calendar_life_years as number[])[1]} yr` : '—'}`],
                ['Cycle life', `${(data.technology.cycle_life as number[])?.[0]?.toLocaleString()}–${(data.technology.cycle_life as number[])?.[1]?.toLocaleString()}`],
                ['Round-trip eff.', `${(data.technology.rte_percent as number[])?.[0]}–${(data.technology.rte_percent as number[])?.[1]}%`],
                ['Degradation', `${(data.technology.degradation_annual_pct as number[])?.[0]}–${(data.technology.degradation_annual_pct as number[])?.[1]}% /yr`],
                ['End-of-life', `${data.technology.eol_capacity_pct}% SoH`],
                ['Warranty', String(data.technology.warranty_typical)],
                ['Augmentation', String(data.technology.augmentation)],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'contents' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {String(data.technology.throughput_note || '')}
            </p>
          </DetailsDrawer>
        )}

        {/* Drawer C: Key players */}
        {data.key_players && (
          <DetailsDrawer label="Key players · watchlist">
            {Object.entries(data.key_players).map(([group, players]) => (
              <div key={group} style={{ marginBottom: '12px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  {group.replace(/_/g, ' / ')}
                </p>
                {(players as Player[]).map(p => (
                  <div key={p.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}> · {p.hq} · {p.positioning}</span>
                  </div>
                ))}
              </div>
            ))}
          </DetailsDrawer>
        )}

        {/* Drawer D: Raw inputs */}
        <DetailsDrawer label="Raw inputs">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '12px' }}>
            {data.lithium_eur_t != null && (
              <><span style={{ color: 'var(--text-tertiary)' }}>Li carbonate</span><span style={{ color: 'var(--text-primary)' }}>€{safeNum(data.lithium_eur_t / 1000, 0)}k/t {data.lithium_trend ?? ''}</span></>
            )}
            {data.euribor_nominal_3m != null && (
              <><span style={{ color: 'var(--text-tertiary)' }}>Euribor 3M</span><span style={{ color: 'var(--text-primary)' }}>{safeNum(data.euribor_nominal_3m, 2)}% nominal</span></>
            )}
            {data.hicp_yoy != null && (
              <><span style={{ color: 'var(--text-tertiary)' }}>HICP YoY</span><span style={{ color: 'var(--text-primary)' }}>{safeNum(data.hicp_yoy, 1)}%</span></>
            )}
            {data.euribor_real_3m != null && (
              <><span style={{ color: 'var(--text-tertiary)' }}>Real rate</span><span style={{ color: 'var(--text-primary)' }}>{safeNum(data.euribor_real_3m, 2)}%</span></>
            )}
            <span style={{ color: 'var(--text-tertiary)' }}>China system</span>
            <span style={{ color: 'var(--text-primary)' }}>~€{data.china_system_eur_kwh ?? 68}/kWh (equipment-only, DDP)</span>
            <span style={{ color: 'var(--text-tertiary)' }}>EU reference</span>
            <span style={{ color: 'var(--text-primary)' }}>~€{data.europe_system_eur_kwh ?? 164}/kWh (installed, BNEF Dec 2025)</span>
          </div>
        </DetailsDrawer>

        {/* Drawer E: Methodology */}
        <DetailsDrawer label="Methodology & sources">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            Scope definition
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '12px' }}>
            Installed CAPEX ex-VAT. Includes BOS. Grid scope selectable (light/heavy).
            Excludes: land, developer margin, financing during construction.
            Normalisation: €/kWh_DC and €/kW_AC @ POI. Duration-specific.
          </p>

          {data.data_freshness && (
            <>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Data freshness
              </p>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '12px' }}>
                {Object.entries(data.data_freshness).map(([key, v]) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '120px 80px 140px auto', gap: '4px', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{v.last_update}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{v.cadence}</span>
                    <span style={{ color: v.status === 'current' ? 'var(--teal)' : 'var(--text-muted)' }}>{v.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.confidence && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Observed: {Math.round(data.confidence.observed_share * 100)}% · Benchmark: {Math.round(data.confidence.benchmark_share * 100)}% · Modeled: {Math.round(data.confidence.modeled_share * 100)}%
            </p>
          )}

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            BNEF Dec 2025 · NREL ATB 2025 · IEA Grid Supply Chain · ECB Data Portal · tradingeconomics.com · SMM
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
