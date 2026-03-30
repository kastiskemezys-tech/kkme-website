'use client';

import React, { useState } from 'react';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import { SourceFooter, DetailsDrawer } from '@/app/components/primitives';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BreakdownItem { range_kwh?: number[]; range_kw?: number[]; mid_kwh?: number; mid_kw?: number; label: string; scope: string; }
interface CostProfile { capex_range_kwh: number[]; capex_range_kw: number[]; breakdown: Record<string, BreakdownItem>; reference_mid_kwh: number; notes: string; }
interface CostDriver { driver: string; direction: string; symbol: string; magnitude: string; component: string; detail: string; }
interface Transaction { project: string; country: string; mw: number; mwh: number; eur_kwh_approx: number; scope: string; year: number; integrator: string | null; cost_driver: string; }
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
  data_freshness?: Record<string, { last_update?: string; cadence?: string; status?: string; confidence?: string }>;
  confidence?: { level: string; observed_share: number; benchmark_share: number; modeled_share: number; degraded_reason?: string };
  market_bands?: { developer_optimized: { range_kwh: number[] }; eu_turnkey_typical: { range_kwh: number[] }; institutional_tso: { range_kwh: number[] }; observed_floor: number; observed_ceiling: number; note: string };
  lead_times?: { hv_equipment_months: number[]; battery_plus_shipping_months: number[]; total_rtb_to_cod_months: number[]; critical_path: string; note: string };
  scale_effect?: { small_under_20mw: string; large_over_80mw: string; note: string };
  price_lag?: { battery_cell_months: number[]; hv_equipment_months: number[]; note: string };
  supplier_spread?: { premium_bankable: string; mainstream: string; aggressive_new_entrant: string; note: string };
  contract_structure?: { turnkey_epc: string; multi_contract: string; note: string };
  policy_flags?: Array<{ name: string; impact: string; status: string; detail: string }>;
  enrichment_annotations?: { enriched_at: string; driver_sentiment: Record<string, { direction: string; magnitude: string; evidence_count: number; summary: string }>; headlines: Array<{ headline: string; source: string }>; review_needed: boolean };
}

type Duration = '2h' | '4h';
type GridScope = 'light' | 'heavy';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', border: '1px solid var(--border-card)', borderRadius: '3px', padding: '2px 6px' }}>
      {children}
    </span>
  );
}

function Drawer({ id, title, open, onToggle, children }: { id: string; title: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-card)' }}>
      <div onClick={() => onToggle(id)} style={{ cursor: 'pointer', padding: '10px 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
        {open ? '▾' : '▸'} {title}
      </div>
      {open && <div style={{ paddingBottom: '12px' }}>{children}</div>}
    </div>
  );
}

function BreakdownBar({ label, rangeKwh, midKwh, scope, maxVal, isHV }: { label: string; rangeKwh: number[]; midKwh?: number | null; scope: string; maxVal: number; isHV?: boolean }) {
  const low = rangeKwh[0], high = rangeKwh[1];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
      <div style={{ width: '130px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ width: '85px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-primary)', textAlign: 'right' }}>€{low}–{high}</div>
      <div style={{ flex: 1, position: 'relative', height: '10px' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '3px', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }} />
        <div style={{ position: 'absolute', left: `${(low / maxVal) * 100}%`, width: `${((high - low) / maxVal) * 100}%`, top: '1px', height: '8px', background: isHV ? 'rgba(212,160,60,0.2)' : 'rgba(0,180,160,0.15)', borderRadius: '2px', transition: 'left 0.3s ease, width 0.3s ease' }} />
        {midKwh != null && (
          <div style={{ position: 'absolute', left: `${(midKwh / maxVal) * 100}%`, top: 0, width: '2px', height: '10px', background: isHV ? 'var(--amber)' : 'var(--teal)', borderRadius: '1px', transition: 'left 0.3s ease' }} />
        )}
      </div>
      <div style={{ width: '90px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', textAlign: 'right' }}>{scope}</div>
    </div>
  );
}

// ─── Data integrity helpers ──────────────────────────────────────────────────

const SOURCE_COMPONENT_MAP: Record<string, string> = {
  ecb_euribor: 'lcos', ecb_hicp: 'lcos', lithium_proxy: 'dc_block', fx: 'dc_block',
};

function freshnessLabel(entry?: { last_update?: string; status?: string }): string {
  if (!entry?.last_update) return 'not tracked';
  if (entry.status === 'stale' || entry.status === 'unknown') return 'stale';
  return new Date(entry.last_update).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function isSourceStale(freshness: S3Signal['data_freshness'], source: string): boolean {
  const entry = freshness?.[source];
  return !entry?.last_update || entry.status === 'stale' || entry.status === 'unknown';
}

function isComponentStale(component: string, freshness: S3Signal['data_freshness']): boolean {
  if (!freshness) return false;
  for (const [src, comp] of Object.entries(SOURCE_COMPONENT_MAP)) {
    if (comp === component && isSourceStale(freshness, src)) return true;
  }
  return false;
}

function computeConfidenceLevel(freshness: S3Signal['data_freshness'], baseLevel: string, hasEnrichment: boolean): string {
  if (!freshness) return baseLevel;
  const inputsStale = ['ecb_euribor', 'lithium_proxy', 'fx'].filter(k => isSourceStale(freshness, k)).length;
  const enrichStale = isSourceStale(freshness, 'enrichment');
  if (inputsStale >= 2) return 'degraded';
  if (inputsStale >= 1 && enrichStale) return 'degraded';
  if (enrichStale && !hasEnrichment) return 'drivers degraded';
  if (inputsStale >= 1) return 'inputs degraded';
  return baseLevel;
}

function deriveInterpretation(drivers: CostDriver[]): string | null {
  if (!drivers.length) return null;
  const dirs: Record<string, string> = {};
  const mags: Record<string, string> = {};
  drivers.forEach(d => { dirs[d.component] = d.direction; mags[d.component] = d.magnitude; });

  if (dirs.hv_grid === 'constrained' && dirs.dc_block === 'easing')
    return 'Cost pressure easing, but grid still limits full CAPEX decline.';
  if (dirs.dc_block === 'easing' && dirs.lcos === 'easing')
    return 'Favourable equipment trend — battery and financing both easing.';
  if (dirs.hv_grid === 'constrained')
    return 'Limited near-term improvement expected under grid-heavy scope.';
  if (dirs.dc_block === 'easing')
    return 'Equipment costs declining, installed variance remains high.';
  return null;
}

const DOMINANT_CONTEXT: Record<string, string> = {
  hv_grid: '(scope + substation design)',
  dc_block: '(cell pricing + supply)',
  pcs: '(grid-forming compliance)',
  lcos: '(rate environment)',
};

function dominantDriver(drivers: CostDriver[]): CostDriver | null {
  if (!drivers.length) return null;
  const weight: Record<string, number> = { strong: 3, moderate: 2, weak: 1 };
  return drivers.reduce((best, d) => (weight[d.magnitude] || 0) > (weight[best.magnitude] || 0) ? d : best);
}

function basisTimestamp(d: S3Signal): string | null {
  // Prefer editorial > enrichment > live timestamp
  const candidates = [
    d.data_freshness?.capex_reference?.last_update,
    d.enrichment_annotations?.enriched_at,
    d.timestamp,
  ].filter(Boolean);
  if (!candidates.length) return null;
  const latest = candidates.sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0]!;
  return new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function S3Card() {
  const { status, data } = useSignal<S3Signal>(`${WORKER_URL}/s3`);
  const [duration, setDuration] = useState<Duration>('4h');
  const [gridScope, setGridScope] = useState<GridScope>('heavy');
  const [expandedChip, setExpandedChip] = useState<number | null>(null);
  const [openDrawers, setOpenDrawers] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  const toggleDrawer = (id: string) => setOpenDrawers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (status === 'loading') return <article style={{ padding: '24px' }}><div className="skeleton" style={{ height: '2rem', width: '45%', marginBottom: '10px' }} /><div className="skeleton" style={{ height: '80px', width: '100%' }} /></article>;
  if (status === 'error' || !data) return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Cost data unavailable</p></article>;

  const d = data;
  const profile = d.cost_profiles?.[duration];
  const bd = profile?.breakdown || {};
  const drivers = d.cost_drivers || [];
  const H = duration === '2h' ? 2 : 4;
  const maxBarVal = 120;

  // Compute displayed range (round to clean values)
  const baseRange = profile?.capex_range_kwh || [160, 210];
  const capexRange = gridScope === 'light'
    ? [Math.round((baseRange[0] - 15) / 5) * 5, Math.round((baseRange[1] - 20) / 5) * 5]
    : [Math.round(baseRange[0] / 5) * 5, Math.round(baseRange[1] / 5) * 5];
  const baseKw = profile?.capex_range_kw || [640, 840];
  const kwRange = gridScope === 'light'
    ? [Math.round((baseKw[0] - 60) / 10) * 10, Math.round((baseKw[1] - 80) / 10) * 10]
    : [Math.round(baseKw[0] / 10) * 10, Math.round(baseKw[1] / 10) * 10];

  // Confidence auto-degradation from freshness
  const hasEnrichment = !!d.enrichment_annotations;
  const confLevel = computeConfidenceLevel(d.data_freshness, d.confidence?.level || 'benchmark-heavy', hasEnrichment);

  const chipColor = (dir: string) => dir === 'easing' ? 'var(--teal)' : (dir === 'constrained' || dir === 'increasing') ? 'var(--amber)' : 'var(--text-secondary)';
  const magDots = (m: string) => m === 'weak' ? '●' : m === 'moderate' ? '●●' : '●●●';

  const handleCopy = () => {
    const text = `${duration} BESS (EU turnkey, grid-${gridScope}): €${capexRange[0]}–${capexRange[1]}/kWh · ${d.uncertainty?.range_pct || '±15–30%'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // PCS: only derive €/kWh from €/kW — never show two independent values
  const pcsKwhEquiv = bd.pcs?.mid_kw ? Math.round(bd.pcs.mid_kw / H) : undefined;

  // Interpretation + dominant variance (dynamic, from live drivers)
  const interpretation = deriveInterpretation(drivers);
  const dominant = dominantDriver(drivers);

  // Basis timestamp + data integrity
  const basis = basisTimestamp(d);
  const showIntegrityWarning = confLevel === 'degraded';

  // Dynamic range explanation based on driver state
  const hvMag = drivers.find(dv => dv.component === 'hv_grid')?.magnitude;
  const gridSpread = hvMag === 'strong' ? '±€20–40' : '±€10–25';
  const timingSpread = drivers.some(dv => dv.magnitude === 'strong') ? '±€10' : '±€5–10';

  // Fallback: if no cost_profiles, show old flat number
  if (!profile) {
    return (
      <article style={{ width: '100%' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>Installed BESS cost</h3>
        <div style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.75rem', color: 'var(--text-primary)' }}>€{d.europe_system_eur_kwh ?? 164}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>/kWh</span></div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{d.ref_source ?? 'BNEF Dec 2025'} · installed reference</p>
      </article>
    );
  }

  return (
    <article style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* 1. HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div onClick={openDrawer} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500, cursor: 'pointer', transition: 'color 150ms' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>BESS cost &amp; technology</div>
        {confLevel.includes('degraded') && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: '3px', padding: '1px 6px' }}>{confLevel}</span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '16px' }}>Installed cost reference · scope-adjusted range</div>

      {/* 2. TOGGLES */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex' }}>
          {(['2h', '4h'] as Duration[]).map(v => (
            <button key={v} onClick={() => setDuration(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: duration === v ? 'var(--teal)' : 'var(--text-muted)', borderBottom: duration === v ? '1px solid var(--teal)' : '1px solid transparent', transition: 'color 0.15s, border-color 0.15s' }}>{v}</button>
          ))}
        </div>
        <div style={{ width: '1px', height: '14px', background: 'var(--border-card)' }} />
        <div style={{ display: 'flex' }}>
          {(['Light', 'Heavy'] as const).map(s => {
            const val = s.toLowerCase() as GridScope;
            return <button key={s} onClick={() => setGridScope(val)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: gridScope === val ? 'var(--teal)' : 'var(--text-muted)', borderBottom: gridScope === val ? '1px solid var(--teal)' : '1px solid transparent', transition: 'color 0.15s, border-color 0.15s' }}>{s}</button>;
          })}
        </div>
      </div>

      {/* 3. HERO CAPEX */}
      <div style={{ marginBottom: '2px' }}>
        <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.75rem', color: 'var(--text-primary)', fontWeight: 400, letterSpacing: '-0.02em' }}>€{capexRange[0]}–{capexRange[1]}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', marginLeft: '4px' }}>/kWh</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', border: '1px dashed var(--border-highlight)', borderRadius: '3px', padding: '1px 6px', marginLeft: '8px', letterSpacing: '0.06em' }}>REFERENCE</span>
        <button onClick={handleCopy} title="Copy range" style={{ all: 'unset', cursor: 'pointer', marginLeft: '6px', opacity: copied ? 0.8 : 0.3, transition: 'opacity 0.15s', fontSize: '14px' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={e => (e.currentTarget.style.opacity = copied ? '0.8' : '0.3')}>
          {copied ? '✓' : '📋'}
        </button>
        {d.trend && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: d.trend.direction === 'easing' ? 'var(--teal)' : 'var(--amber)', marginLeft: '12px' }}>{d.trend.direction === 'easing' ? '↘' : d.trend.direction === 'rising' ? '↗' : '→'}</span>}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', marginBottom: '2px' }}>€{kwRange[0]}–{kwRange[1]}/kW @ POI</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '2px' }}>installed · ex-VAT · {duration} LFP · EU turnkey · grid-{gridScope}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '2px' }}>Reference scale: 50–200MW class · Excludes: land · dev margin · financing during construction</div>
      {/* Basis timestamp removed — SourceFooter at bottom of card */}

      {/* RANGE EXPLANATION (dynamic from driver state) */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Range drivers: grid {gridSpread} · supplier ±10–15% · timing {timingSpread}
      </div>

      {/* INTERPRETATION (dynamic, decision-relevant) */}
      {interpretation && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '4px' }}>
          {interpretation}
        </div>
      )}

      {/* DATA INTEGRITY WARNING */}
      {showIntegrityWarning && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--amber)', marginBottom: '4px' }}>
          ⚠ limited data quality — interpretation may be degraded
        </div>
      )}

      {/* 4. MARKET SEGMENTATION BAND */}
      {d.market_bands && (() => {
        const floor = d.market_bands.observed_floor, ceiling = d.market_bands.observed_ceiling, range = ceiling - floor;
        const pct = (v: number) => ((v - floor) / range) * 100;
        // Snap EU turnkey band to hero range for consistency
        const euLow = capexRange[0], euHigh = Math.max(capexRange[1], capexRange[0] + 30);
        return (
          <div style={{ margin: '0 0 12px', padding: '10px 0', borderTop: '1px solid var(--border-card)', borderBottom: '1px solid var(--border-card)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Observed market spread</div>
            <div style={{ position: 'relative', height: '20px', marginBottom: '4px' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '7px', height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px' }} />
              <div style={{ position: 'absolute', left: `${pct(120)}%`, width: `${pct(euLow) - pct(120)}%`, top: '5px', height: '10px', background: 'rgba(0,180,160,0.2)', borderRadius: '2px' }} />
              <div style={{ position: 'absolute', left: `${pct(euLow)}%`, width: `${pct(euHigh) - pct(euLow)}%`, top: '3px', height: '14px', background: 'rgba(0,180,160,0.35)', border: '1px solid var(--teal)', borderRadius: '2px' }} />
              <div style={{ position: 'absolute', left: `${pct(euHigh)}%`, width: `${pct(500) - pct(euHigh)}%`, top: '5px', height: '10px', background: 'rgba(212,160,60,0.12)', borderRadius: '2px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', lineHeight: 1.3 }}>
              <span style={{ color: 'var(--text-muted)' }}>€120–{euLow}<br/>developer</span>
              <span style={{ color: 'var(--teal)', fontWeight: 500 }}>€{euLow}–{euHigh} ←<br/>EU turnkey</span>
              <span style={{ color: 'var(--text-muted)' }}>€{euHigh}–500+<br/>institutional</span>
            </div>
          </div>
        );
      })()}

      {/* OBSERVED SPREAD ANCHOR */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Observed spread: €110–300+/kWh depending on scope, scale, and procurement
      </div>

      {/* 5. UNCERTAINTY + TREND + LEAD TIMES + SCALE */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '14px' }}>
        {d.uncertainty && <div style={{ color: 'var(--text-muted)', marginBottom: '3px' }}>{d.uncertainty.range_pct} · grid scope strongest · supplier ±10–15%</div>}
        {d.trend && (
          <div style={{ marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>12M: </span>
            {d.trend.twelve_month.split(' · ').map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: 'var(--text-ghost)' }}> · </span>}
                <span style={{ color: part.startsWith('↓') ? 'var(--teal)' : part.startsWith('↑') ? 'var(--amber)' : 'var(--text-secondary)' }}>{part}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {d.lead_times && (() => {
          const hvDrv = drivers.find(dv => dv.component === 'hv_grid');
          const batDrv = drivers.find(dv => dv.component === 'dc_block');
          let constraint = '';
          if (hvDrv?.magnitude === 'strong') constraint = ' · constraint: HV equipment — early procurement critical';
          else if (hvDrv?.magnitude === 'moderate') constraint = ' · constraint: grid package — transformer lead time';
          if (batDrv?.magnitude === 'weak' && !constraint) constraint = ' · battery supply not constraining COD';
          return <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Lead time: ~{d.lead_times.total_rtb_to_cod_months[0]} mo RTB→COD · HV {d.lead_times.hv_equipment_months[0]}–{d.lead_times.hv_equipment_months[1]} mo · battery {d.lead_times.battery_plus_shipping_months[0]}–{d.lead_times.battery_plus_shipping_months[1]} mo{constraint}</div>;
        })()}
        {d.scale_effect && <div style={{ color: 'var(--text-muted)' }}>Scale: {d.scale_effect.large_over_80mw} above 80MW · {d.scale_effect.small_under_20mw} below 20MW</div>}
      </div>

      {/* 6. DRIVER CHIPS */}
      {drivers.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
            {drivers.map((drv, i) => {
              const stale = isComponentStale(drv.component, d.data_freshness);
              return (
                <div key={i} onClick={() => setExpandedChip(expandedChip === i ? null : i)} style={{ background: 'var(--bg-elevated)', border: `1px solid ${expandedChip === i ? chipColor(drv.direction) : 'var(--border-card)'}`, borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'border-color 0.2s, opacity 0.2s', opacity: stale ? 0.35 : 1 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: chipColor(drv.direction) }}>{drv.symbol} {drv.driver}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>{magDots(drv.magnitude)}</span>
                </div>
              );
            })}
          </div>
          {expandedChip !== null && drivers[expandedChip] ? (
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5, paddingLeft: '4px' }}>{drivers[expandedChip].detail}</div>
          ) : <div style={{ height: '10px' }} />}
        </>
      )}

      {/* 7. BREAKDOWN BARS */}
      <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '10px', marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Breakdown · mid-case · ranges vary by scope &amp; supplier</div>
        {bd.dc_block && <BreakdownBar label={bd.dc_block.label} rangeKwh={bd.dc_block.range_kwh!} midKwh={bd.dc_block.mid_kwh} scope={bd.dc_block.scope} maxVal={maxBarVal} />}
        {bd.bos_civil && <BreakdownBar label={bd.bos_civil.label} rangeKwh={bd.bos_civil.range_kwh!} midKwh={bd.bos_civil.mid_kwh} scope={bd.bos_civil.scope} maxVal={maxBarVal} />}
        {bd.pcs && (
          <>
            <BreakdownBar label={bd.pcs.label} rangeKwh={[Math.round(bd.pcs.range_kw![0] / H), Math.round(bd.pcs.range_kw![1] / H)]} midKwh={pcsKwhEquiv} scope={bd.pcs.scope} maxVal={maxBarVal} />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', fontStyle: 'italic', color: 'var(--text-muted)', marginLeft: '130px', marginBottom: '6px', marginTop: '-2px' }}>PCS: €{bd.pcs.range_kw![0]}–{bd.pcs.range_kw![1]}/kW · fixed per MW, shown as €/kWh for {duration}</div>
          </>
        )}
        {bd.hv_grid && <BreakdownBar label={bd.hv_grid.label} rangeKwh={bd.hv_grid.range_kwh!} midKwh={null} scope={bd.hv_grid.scope} maxVal={maxBarVal} isHV />}
        {bd.soft_costs && <BreakdownBar label={bd.soft_costs.label} rangeKwh={bd.soft_costs.range_kwh!} midKwh={bd.soft_costs.mid_kwh} scope={bd.soft_costs.scope} maxVal={maxBarVal} />}
      </div>

      {/* 8. LCOS REFERENCE */}
      {d.lcos_reference && (
        <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LCOS (reference)</span>
            <span style={{ fontFamily: 'Unbounded, sans-serif', fontSize: '1.125rem', color: 'var(--text-primary)' }}>€{d.lcos_reference.range_eur_mwh[0]}–{d.lcos_reference.range_eur_mwh[1]}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>/MWh</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
            {(() => { const a = d.lcos_reference.assumptions as Record<string, unknown>; return [
              `${(a.cycles_per_year as number[])?.[0]}–${(a.cycles_per_year as number[])?.[1]} cycles/yr`,
              `${(a.rte_pct as number[])?.[0]}–${(a.rte_pct as number[])?.[1]}% RTE`,
              `${(a.wacc_pct as number[])?.[0]}–${(a.wacc_pct as number[])?.[1]}% WACC`,
              `Augmentation ${a.augmentation}`,
            ]; })().map(p => <Pill key={p}>{p}</Pill>)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Full computation → <a href="#revenue" onClick={e => { e.preventDefault(); document.getElementById('revenue')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ color: 'var(--teal)', textDecoration: 'none' }}>Revenue Engine</a></div>
        </div>
      )}

      {/* 9. CROSS-LINKS */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <span>Grid constraint → <a href="#build" onClick={e => { e.preventDefault(); document.getElementById('build')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ color: 'var(--teal)', textDecoration: 'none' }}>S4</a></span>
        <span>Revenue impact → <a href="#revenue" onClick={e => { e.preventDefault(); document.getElementById('revenue')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ color: 'var(--teal)', textDecoration: 'none' }}>Revenue Engine</a></span>
      </div>

      {/* SOURCE FOOTER */}
      <div style={{ flexGrow: 1 }} />
      <SourceFooter
        source="BNEF · ECB · NREL ATB"
        updatedAt={basis ?? undefined}
        dataClass="reference"
      />

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>

      {/* ENRICHMENT STRIP */}
      {d.enrichment_annotations && d.enrichment_annotations.headlines.length > 0 && (
        <div style={{ padding: '10px 0', borderTop: '1px solid var(--border-card)', marginBottom: '8px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Recent intelligence · automated · {new Date(d.enrichment_annotations.enriched_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
          {d.enrichment_annotations.headlines.map((h, i) => <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>• {h.headline} <span style={{ color: 'var(--text-ghost)' }}>— {h.source}</span></div>)}
          {d.enrichment_annotations.review_needed && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--amber)', marginTop: '6px' }}>⚠ Range review recommended</div>}
        </div>
      )}

      {/* DRAWERS */}

      {/* A: Transactions */}
      {d.transactions && d.transactions.length > 0 && (
        <Drawer id="transactions" title="Baltic transaction evidence" open={openDrawers.has('transactions')} onToggle={toggleDrawer}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--teal)', marginBottom: '8px' }}>Observed references (highest reliability)</div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as unknown as undefined }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', minWidth: '400px' }}>
              <thead><tr style={{ color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px 4px 0', fontWeight: 400 }}>Project</th>
                <th style={{ padding: '4px 6px', fontWeight: 400 }}>Ctry</th>
                <th style={{ padding: '4px 6px', fontWeight: 400 }}>Size</th>
                <th style={{ padding: '4px 6px', fontWeight: 400, textAlign: 'right' }}>€/kWh</th>
                <th style={{ padding: '4px 6px', fontWeight: 400 }}>Year</th>
                <th style={{ padding: '4px 6px', fontWeight: 400 }}>Driver</th>
              </tr></thead>
              <tbody>{d.transactions.map(tx => (
                <tr key={tx.project} style={{ borderTop: '1px solid var(--border-card)' }}>
                  <td style={{ padding: '5px 6px 5px 0', color: 'var(--text-secondary)' }}>{tx.project}</td>
                  <td style={{ padding: '5px 6px', color: 'var(--text-muted)' }}>{tx.country}</td>
                  <td style={{ padding: '5px 6px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{tx.mw}MW/{tx.mwh}MWh</td>
                  <td style={{ padding: '5px 6px', color: 'var(--text-primary)', textAlign: 'right', fontWeight: 500 }}>{tx.eur_kwh_approx}</td>
                  <td style={{ padding: '5px 6px', color: 'var(--text-muted)' }}>{tx.year}</td>
                  <td style={{ padding: '5px 6px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.5625rem' }}>{tx.cost_driver}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--amber)', marginTop: '8px', marginBottom: '6px' }}>⚠ do not average — scope varies widely</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>Scope drives Baltic variance. Grid + substation can add 50–200% vs equipment-only.</div>
        </Drawer>
      )}

      {/* B: Technology */}
      {d.technology && (
        <Drawer id="technology" title="Technology profile · LFP" open={openDrawers.has('technology')} onToggle={toggleDrawer}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '10px' }}>
            {[
              ['Calendar life', `${(d.technology.calendar_life_years as number[])?.[0]}–${(d.technology.calendar_life_years as number[])?.[1]} yr`],
              ['Cycle life', `${(d.technology.cycle_life as number[])?.[0]?.toLocaleString()}–${(d.technology.cycle_life as number[])?.[1]?.toLocaleString()}`],
              ['Round-trip eff.', `${(d.technology.rte_percent as number[])?.[0]}–${(d.technology.rte_percent as number[])?.[1]}%`],
              ['Degradation', `${(d.technology.degradation_annual_pct as number[])?.[0]}–${(d.technology.degradation_annual_pct as number[])?.[1]}%/yr · ${d.technology.degradation_shape || 'non-linear'}`],
              ['End-of-life', `${d.technology.eol_capacity_pct}% SoH`],
              ['Warranty', String(d.technology.warranty_typical || '—')],
              ['Throughput', `${(d.technology.lifetime_throughput_gwh_per_mw as number[])?.[0]}–${(d.technology.lifetime_throughput_gwh_per_mw as number[])?.[1]} GWh/MW`],
              ['Augmentation', String(d.technology.augmentation || '—')],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-card)' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{String(d.technology.degradation_note || '')} LFP dominant for utility-scale. Sodium-ion emerging, unproven at grid scale.</div>
        </Drawer>
      )}

      {/* C: Key players */}
      {d.key_players && (
        <Drawer id="players" title="Key players · watchlist" open={openDrawers.has('players')} onToggle={toggleDrawer}>
          {Object.entries({ 'CELLS / DC BLOCK': d.key_players.cells_dc, 'PCS / INVERTER': d.key_players.pcs, 'INTEGRATORS': d.key_players.integrators, 'HV EQUIPMENT': d.key_players.hv_equipment }).filter(([, v]) => v).map(([group, players]) => (
            <div key={group} style={{ marginBottom: '10px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{group}</div>
              {(players as Player[]).map(p => <div key={p.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '2px' }}><span style={{ color: 'var(--text-secondary)' }}>{p.name}</span><span style={{ color: 'var(--text-muted)' }}> · {p.hq} · {p.positioning}</span></div>)}
            </div>
          ))}
        </Drawer>
      )}

      {/* D: Project variables */}
      <Drawer id="variables" title="Project variables" open={openDrawers.has('variables')} onToggle={toggleDrawer}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
          {[
            { header: 'CONTRACT STRUCTURE', items: d.contract_structure ? [`Turnkey EPC: ${d.contract_structure.turnkey_epc} vs multi-contract. Most Baltic projects use turnkey.`, `Multi-contract: ${d.contract_structure.multi_contract} (lower cost, higher integration risk).`] : [] },
            { header: 'SUPPLIER SPREAD', items: d.supplier_spread ? [`Premium bankable: ${d.supplier_spread.premium_bankable}`, `Mainstream: ${d.supplier_spread.mainstream}`, `Aggressive: ${d.supplier_spread.aggressive_new_entrant}`] : [] },
            { header: 'PRICE LAG', items: d.price_lag ? [`Battery: upstream → turnkey in ${d.price_lag.battery_cell_months[0]}–${d.price_lag.battery_cell_months[1]} months.`, `HV equipment: upstream → project cost in ${d.price_lag.hv_equipment_months[0]}–${d.price_lag.hv_equipment_months[1]} months.`, 'Lithium ↓ today ≠ CAPEX ↓ today.'] : [] },
            { header: 'POLICY', items: (d.policy_flags || []).map(f => `${f.name}: ${f.impact}. ${f.status}.`) },
          ].filter(s => s.items.length > 0).map(({ header, items }) => (
            <div key={header} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{header}</div>
              {items.map((item, i) => <div key={i} style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>{item}</div>)}
            </div>
          ))}
        </div>
      </Drawer>

      {/* E: Raw inputs */}
      <Drawer id="raw" title="Raw inputs" open={openDrawers.has('raw')} onToggle={toggleDrawer}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
          {[
            ['Li carbonate', d.lithium_eur_t != null ? `€${safeNum(d.lithium_eur_t / 1000, 0)}k/t ${d.lithium_trend ?? '→ stable'}` : '—', 'var(--text-primary)', 'proxy, weak pass-through', isSourceStale(d.data_freshness, 'lithium_proxy')],
            ['Euribor 3M', d.euribor_nominal_3m != null ? `${safeNum(d.euribor_nominal_3m, 2)}% nominal` : '—', 'var(--text-primary)', '', isSourceStale(d.data_freshness, 'ecb_euribor')],
            ['HICP YoY', d.hicp_yoy != null ? `${safeNum(d.hicp_yoy, 1)}%` : '—', 'var(--text-primary)', '', false],
            ['Real rate', d.euribor_real_3m != null ? `${safeNum(d.euribor_real_3m, 2)}%` : '—', 'var(--text-primary)', '', false],
            ['China system', `€${d.china_system_eur_kwh ?? 68}/kWh`, 'var(--text-secondary)', 'equipment-only, non-comparable', false],
            ['EU reference', `€${d.europe_system_eur_kwh ?? 164}/kWh (BNEF Dec 2025)`, 'var(--text-secondary)', 'installed benchmark', false],
          ].map(([label, val, color, note, stale]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border-card)', opacity: stale ? 0.35 : 1, transition: 'opacity 0.2s' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{label}{note ? <span style={{ fontSize: '0.5625rem', color: 'var(--text-ghost)', marginLeft: '4px' }}>({note as string})</span> : null}</span>
              <span style={{ color: color as string }}>{val}</span>
            </div>
          ))}
        </div>
      </Drawer>

      {/* F: Methodology */}
      <Drawer id="methodology" title="Methodology & sources" open={openDrawers.has('methodology')} onToggle={toggleDrawer}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.6 }}>
          Installed CAPEX ex-VAT. Includes BOS. Grid scope selectable (light/heavy). Excludes: land, developer margin, financing during construction. Normalisation: €/kWh_DC and €/kW_AC @ POI. Duration-specific.
        </div>
        {/* Confidence by layer */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Confidence by layer</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '10px' }}>
          {[
            ['CAPEX', d.confidence?.level === 'benchmark-heavy' ? 'benchmark-heavy' : confLevel],
            ['Drivers', hasEnrichment ? 'enrichment-based' : 'editorial fallback'],
            ['Inputs', ['ecb_euribor', 'lithium_proxy', 'fx'].some(k => isSourceStale(d.data_freshness, k)) ? 'partially stale' : 'live'],
            ['Transactions', (d.transactions?.length ?? 0) <= 3 ? 'sparse observed' : 'observed'],
          ].map(([label, val]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
            </div>
          ))}
        </div>

        {d.data_freshness && (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Data freshness</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '10px' }}>
              {Object.entries(d.data_freshness).map(([key, f]) => {
                const label = freshnessLabel(f);
                const statusColor = f.status === 'current' ? 'var(--teal)' : f.status === 'structural anchor' ? 'var(--text-muted)' : label === 'not tracked' ? 'var(--text-ghost)' : 'var(--amber)';
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--border-card)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ color: statusColor, fontSize: '0.5625rem' }}>{label} · {f.cadence}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {d.confidence && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>Confidence: observed {Math.round(d.confidence.observed_share * 100)}% · benchmark {Math.round(d.confidence.benchmark_share * 100)}% · modeled {Math.round(d.confidence.modeled_share * 100)}%</div>}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)' }}>BNEF Dec 2025 · NREL ATB 2025 · IEA Grid Supply Chain · ECB Data Portal · tradingeconomics.com · SMM</div>
      </Drawer>

        </DetailsDrawer>
      </div>

      {/* MODEL INPUT FOOTER */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', marginTop: '16px', paddingTop: '8px', borderTop: '1px solid var(--border-card)' }}>MODEL INPUT → CAPEX reference · Financing cost</div>
    </article>
  );
}
