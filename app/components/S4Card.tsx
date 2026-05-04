'use client';

import { useState } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import { SignalIntel } from '@/app/components/SignalIntel';
import { AssetDetailPanel, type Asset as DetailAsset } from '@/app/components/AssetDetailPanel';
import type { ImpactState, Sentiment } from '@/app/lib/types';
import { sdFormulaCaption } from '@/app/lib/sdRatio';
import { PIPELINE_TIER_LABELS } from '@/app/lib/pipelineDefinitions';
import { formatTimestamp } from '@/app/lib/freshness';
import { getInstalledMw, type InstalledMwResult } from '@/app/lib/metricRegistry';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S4Pipeline {
  dev_total_mw:       number | null;
  gen_total_mw:       number | null;
  parse_warning:      string | null;
  dev_count_filtered: number | null;
  updated_at:         string | null;
}

interface StorageReference {
  source:           string;
  source_url:       string;
  installed_mw:     number;
  installed_mw_live?: number | null;
  installed_mw_live_as_of?: string | null;
  installed_mw_live_source_url?: string | null;
  installed_mw_as_of?: string | null;
  installed_gen_mw: number;
  installed_mwh:    number;
  note:             string;
  coverage_note?:   string;
}

interface StoragePipeline {
  tso_reserved_mw:       number;
  tso_reserved_mwh:      number;
  source:                string;
  source_url:            string;
  intention_protocols_mw:  number;
  intention_protocols_mwh: number;
  apva_applied_mw:       number;
  apva_applied_mwh:      number;
  apva_budget_eur:       number;
  apva_source_url:       string;
}

interface SourceUrls {
  vert_arcgis:  string;
  litgrid:      string;
  vert_permits: string;
  apva:         string;
  eso_maps:     string;
  litgrid_aei:  string;
}

interface CountryAsset {
  id: string;
  name: string;
  mw: number;
  mwh?: number;
  status: string;
  tech?: string;
  cod?: string;
  note?: string;
  source_url?: string;
}

interface CountryData {
  installed_mw?: number;
  installed_mw_live?: number | null;
  installed_mw_live_as_of?: string | null;
  installed_mw_live_source_url?: string | null;
  installed_mw_as_of?: string | null;
  installed_mw_source_url?: string | null;
  installed_gen_mw?: number;
  installed_mwh?: number;
  under_construction_mw?: number;
  tso_reserved_mw?: number;
  intention_mw?: number;
  apva_applied_mw?: number;
  source?: string;
  source_url?: string;
  coverage_note?: string;
  assets?: CountryAsset[];
}

interface BalticTotal {
  installed_mw?: number;
  under_construction_mw?: number;
}

interface FleetEntry {
  name?: string;
  mw?: number;
  status?: string;
  country?: string;
}

interface FleetCountrySummary {
  operational_mw?: number | null;
  operational_mw_strict?: number | null;
  operational_mw_inclusive?: number | null;
  quarantined_mw?: number | null;
  pipeline_mw?: number | null;
  weighted_mw?: number | null;
  entries?: FleetEntry[];
}

interface FleetData {
  countries?:            Record<string, FleetCountrySummary> | null;
  sd_ratio?:             number | null;
  phase?:                string | null;
  baltic_operational_mw?: number | null;
  baltic_operational_mw_strict?: number | null;
  baltic_quarantined_mw?: number | null;
  baltic_pipeline_mw?:   number | null;
  baltic_weighted_mw?:    number | null;
  eff_demand_mw?:        number | null;
  updated?:              string | null;
}

interface S4Signal {
  timestamp?:         string | null;
  free_mw?:           number | null;
  connected_mw?:      number | null;
  reserved_mw?:       number | null;
  utilisation_pct?:   number | null;
  signal?:            string | null;
  interpretation?:    string | null;
  pipeline?:          S4Pipeline;
  storage_reference?: StorageReference;
  storage_pipeline?:  StoragePipeline;
  storage_by_country?: Record<string, CountryData>;
  baltic_total?:      BalticTotal;
  grid_caveat?:       string;
  source_urls?:       SourceUrls;
  fleet?:             FleetData;
  _stale?:            boolean;
  _age_hours?:        number | null;
}

function formatMW(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-GB');
}

function pipelineSentiment(installedMw: number, tsoReservedMw: number): Sentiment {
  // Pipeline is large relative to installed — buildability still open but tightening
  if (tsoReservedMw > installedMw * 3) return 'caution';
  return 'positive';
}

function pipelineStatus(installedMw: number, tsoReservedMw: number): string {
  const ratio = tsoReservedMw / Math.max(installedMw, 1);
  if (ratio > 5) return 'High pipeline pressure';
  if (ratio > 3) return 'Pipeline building';
  return `${ratio.toFixed(1)}× pipeline`;
}

function pipelineImpactDesc(installedMw: number, tsoReservedMw: number): string {
  const ratio = tsoReservedMw / Math.max(installedMw, 1);
  if (ratio > 5) return 'Reference asset: high pipeline-to-installed ratio suggests grid queue pressure will intensify — early queue position critical';
  if (ratio > 3) return 'Reference asset: pipeline exceeds installed base by ' + ratio.toFixed(0) + '× — connection timing increasingly matters';
  return `Reference asset: pipeline-to-installed ratio ${ratio.toFixed(1)}×`;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'inherit',
        textDecoration: 'none',
        borderBottom: '1px dotted var(--text-muted)',
        transition: 'color 150ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'inherit')}
    >
      {children} ↗
    </a>
  );
}

type CountryTab = 'LT' | 'LV' | 'EE';

const TAB_LABELS: Record<CountryTab, string> = { LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia' };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    operational: 'var(--teal)',
    under_construction: 'var(--amber)',
    announced: 'var(--text-muted)',
  };
  const labels: Record<string, string> = {
    operational: 'Operational',
    under_construction: 'Construction',
    announced: 'Announced',
    pumped_hydro: 'Hydro',
  };
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
      color: colors[status] || 'var(--text-muted)',
      border: `1px solid ${colors[status] || 'var(--border-card)'}`,
      padding: '1px 5px', borderRadius: '2px',
    }}>
      {labels[status] || status}
    </span>
  );
}

function AssetRow({ asset }: { asset: CountryAsset }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 0', borderBottom: '1px solid var(--border-card)',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
    }}>
      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
        {asset.source_url ? (
          <a href={asset.source_url} target="_blank" rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dotted var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
            {asset.name} ↗
          </a>
        ) : asset.name}
      </span>
      <span style={{ color: 'var(--text-secondary)', minWidth: '50px', textAlign: 'right' }}>
        {asset.mw} MW
      </span>
      {asset.mwh && (
        <span style={{ color: 'var(--text-muted)', minWidth: '55px', textAlign: 'right' }}>
          {asset.mwh} MWh
        </span>
      )}
      <StatusBadge status={asset.tech === 'pumped_hydro' ? 'pumped_hydro' : asset.status} />
    </div>
  );
}

export function S4Card() {
  const { status, data } =
    useSignal<S4Signal>(`${WORKER_URL}/s4`, { refreshInterval: REFRESH_WARM });
  const [drawerKey, setDrawerKey] = useState(0);
  const [activeTab, setActiveTab] = useState<CountryTab>('LT');
  const [assetPanel, setAssetPanel] = useState<{ title: string; subtitle?: string; assets: DetailAsset[]; notes?: string[] } | null>(null);
  const openDrawer = () => setDrawerKey(k => k + 1);

  const openCountryAssets = (country: CountryTab, filter?: string) => {
    const cd = sbc[country];
    if (!cd?.assets) return;
    const assets = cd.assets
      .filter((a: CountryAsset) => !filter || a.status === filter)
      .map((a: CountryAsset): DetailAsset => ({
        id: a.id, name: a.name, mw: a.mw, mwh: a.mwh,
        status: a.status, tech: a.tech, cod: a.cod,
        note: a.note, source_url: a.source_url,
      }));
    const label = TAB_LABELS[country];
    const filterLabel = filter ? ` · ${filter.replace(/_/g, ' ')}` : '';
    setAssetPanel({ title: `${label} BESS assets${filterLabel}`, assets });
  };

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '1rem', width: '50%', marginBottom: '10px' }} />
        <div className="skeleton" style={{ height: '2rem', width: '30%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.75rem', width: '55%', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '80px', width: '100%' }} />
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Grid capacity data unavailable
        </p>
      </article>
    );
  }

  const ref = data.storage_reference;
  const pipe = data.storage_pipeline;
  const urls = data.source_urls;
  const sbc = data.storage_by_country || {};
  const bt = data.baltic_total;
  // Phase 12.10 — single canonical lookup per country via getInstalledMw
  // selector. Prefers `_live` (VPS-Python A68 ingest) over hardcode; the
  // returned tier ('live' | 'hardcode' | 'fallback') drives the as-of label.
  const ltLookup = getInstalledMw(data, 'LT');
  const lvLookup = getInstalledMw(data, 'LV');
  const eeLookup = getInstalledMw(data, 'EE');
  const ltMw = ltLookup.value ?? sbc.LT?.installed_mw ?? ref?.installed_mw ?? 484;
  const lvMw = lvLookup.value ?? sbc.LV?.installed_mw ?? 40;
  const eeMw = eeLookup.value ?? sbc.EE?.installed_mw ?? 127;
  const balticInstalledMw = bt?.installed_mw ?? (ltMw + lvMw + eeMw);
  const balticUcMw = bt?.under_construction_mw ?? 705;
  const installedMw = ltMw; // LT-specific for pipeline bar
  const tsoReservedMw = pipe?.tso_reserved_mw ?? 1395;
  const intentionMw = pipe?.intention_protocols_mw ?? 3700;
  // Phase 12.10 — quarantine disclosure: companion `quarantined_mw` per
  // country surfaces "X MW awaiting TSO confirmation" footers. Defaults to
  // strict view (quarantined excluded from headline operational counts).
  const fleetCountries = data.fleet?.countries ?? {};
  const eeQuarantinedMw = fleetCountries.EE?.quarantined_mw ?? 0;
  const lvQuarantinedMw = fleetCountries.LV?.quarantined_mw ?? 0;
  const ltQuarantinedMw = fleetCountries.LT?.quarantined_mw ?? 0;
  const verifiedLabel = (lookup: InstalledMwResult): string | null => {
    if (!lookup.as_of) return null;
    if (lookup.source === 'live') return `live ${lookup.as_of}`;
    if (lookup.source === 'hardcode') return `verified ${lookup.as_of}`;
    return null;
  };

  // Grid headroom (all-tech, for drawer)
  const free = data.free_mw ?? null;
  const connected = data.connected_mw ?? 0;
  const reserved = data.reserved_mw ?? 0;
  const freeVal = free ?? 0;
  const total = connected + reserved + freeVal;

  // Pipeline bar proportions (log scale for visibility)
  const pipeMax = intentionMw;
  const installedPct = Math.max((installedMw / pipeMax) * 100, 5);
  const reservedPct = Math.max((tsoReservedMw / pipeMax) * 100, 8);
  const intentionPct = 100 - installedPct - reservedPct;

  return (
    <article style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3
          onClick={openDrawer}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9375rem',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '6px',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          Grid access and buildability
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Baltic storage installed base, pipeline pressure, and grid connection buildability.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          BESS buildability ledger · Lithuania · Latvia · Estonia
        </p>
      </div>

      {/* HERO — Baltic installed storage */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <MetricTile
            label="Baltic BESS installed (TSO-tracked)"
            value={formatMW(balticInstalledMw)}
            unit="MW"
            size="hero"
            dataClass="observed"
          />
          {(() => {
            const ps = pipelineStatus(installedMw, tsoReservedMw);
            const sent = pipelineSentiment(installedMw, tsoReservedMw);
            const isDashed = ps.includes('×');
            return isDashed ? (
              <span style={{
                display: 'inline-block',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-secondary)',
                border: '1px dashed var(--border-highlight)',
                padding: '2px 8px',
                letterSpacing: '0.04em',
                lineHeight: 1.4,
              }}>
                {ps}
              </span>
            ) : (
              <StatusChip status={ps} sentiment={sent} />
            );
          })()}
        </div>
        <p
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}
          title={[
            ltLookup.as_of ? `LT ${formatMW(ltMw)} MW (${verifiedLabel(ltLookup) ?? 'unverified'})${ltLookup.source_url ? ` · ${ltLookup.source_url}` : ''}` : null,
            lvLookup.as_of ? `LV ${formatMW(lvMw)} MW (${verifiedLabel(lvLookup) ?? 'unverified'})${lvLookup.source_url ? ` · ${lvLookup.source_url}` : ''}` : null,
            eeLookup.as_of ? `EE ${formatMW(eeMw)} MW (${verifiedLabel(eeLookup) ?? 'unverified'})${eeLookup.source_url ? ` · ${eeLookup.source_url}` : ''}` : null,
            ref?.coverage_note ?? null,
          ].filter(Boolean).join(' · ')}
        >
          LT {formatMW(ltMw)} · LV {formatMW(lvMw)} · EE {formatMW(eeMw)} + {formatMW(sbc.EE?.under_construction_mw ?? 255)} MW construction
        </p>
      </div>

      {/* COUNTRY TABS */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px' }}>
        {(['LT', 'LV', 'EE'] as CountryTab[]).map(c => {
          const tabMw = c === 'LT' ? ltMw : c === 'LV' ? lvMw : eeMw;
          return (
            <button
              key={c}
              onClick={() => setActiveTab(c)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                letterSpacing: '0.06em',
                padding: '5px 12px',
                border: `1px solid ${activeTab === c ? 'var(--border-highlight)' : 'var(--border-card)'}`,
                background: activeTab === c ? 'var(--bg-elevated)' : 'transparent',
                color: activeTab === c ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                borderRadius: '2px',
                transition: 'border-color 150ms, color 150ms',
              }}
            >
              {TAB_LABELS[c]}
              <span style={{ marginLeft: '5px', opacity: 0.5 }}>
                {formatMW(tabMw)}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT — min height to prevent layout shift */}
      <div style={{ minHeight: '180px', marginBottom: '16px' }}>
        {activeTab === 'LT' && (
          <>
            {/* LT — existing pipeline bar + credibility ladder */}

      {/* BESS PIPELINE BAR */}
      <div style={{ margin: '16px 0 20px' }}>
        <div style={{ display: 'flex', height: '40px', gap: '1px', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            flex: installedPct,
            background: 'var(--teal-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-primary)', opacity: 0.9 }}>
              {formatMW(installedMw)}
            </span>
          </div>
          <div style={{
            flex: reservedPct,
            background: 'var(--amber-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-primary)', opacity: 0.9 }}>
              {(tsoReservedMw / 1000).toFixed(1)} GW
            </span>
          </div>
          <div style={{
            flex: intentionPct,
            background: 'var(--amber-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', opacity: 0.8 }}>
              {(intentionMw / 1000).toFixed(1)} GW
            </span>
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          marginTop: '6px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
        }}>
          <span><span style={{ color: 'var(--teal-strong)' }}>■</span> Installed: {formatMW(installedMw)} MW</span>
          <span><span style={{ color: 'var(--amber-strong)' }}>■</span> TSO reserved: {(tsoReservedMw / 1000).toFixed(1)} GW</span>
          <span><span style={{ color: 'var(--amber-subtle)' }}>■</span> Intention protocols: {(intentionMw / 1000).toFixed(1)} GW</span>
        </div>
      </div>

      {/* PIPELINE METRICS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        marginBottom: '16px',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          TSO reserved: {formatMW(tsoReservedMw)} MW / {formatMW(pipe?.tso_reserved_mwh ?? 3204)} MWh
          {pipe?.source_url && (
            <> · <SourceLink href={pipe.source_url}>Litgrid</SourceLink></>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          APVA grant call: ~{formatMW(pipe?.apva_applied_mw ?? 1545)} MW applied (operator estimate, pending APVA refresh)
          {pipe?.apva_source_url && (
            <> · <SourceLink href={pipe.apva_source_url}>APVA</SourceLink></>
          )}
        </div>
      </div>

      {/* PIPELINE CREDIBILITY LADDER */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.8,
        marginBottom: '16px',
        paddingLeft: '2px',
      }}>
        <div><span style={{ color: 'var(--teal)' }}>●</span> Connected / operational: {formatMW(installedMw)} MW</div>
        <div><span style={{ color: 'var(--amber)' }}>●</span> Under construction: ~291 MW</div>
        <div style={{ opacity: 0.7 }}><span style={{ color: 'var(--text-tertiary)' }}>●</span> Grid agreement + tech project: ~700 MW</div>
        <div style={{ opacity: 0.5 }}><span style={{ color: 'var(--text-tertiary)' }}>●</span> Development permit only: ~3,600 MW</div>
        <div style={{ opacity: 0.4 }}><span style={{ color: 'var(--text-tertiary)' }}>●</span> TSO reservation / protocol: {formatMW(tsoReservedMw)} MW</div>
        <div style={{ opacity: 0.35, fontStyle: 'italic' }}><span style={{ color: 'var(--text-tertiary)' }}>○</span> APVA applied: ~{formatMW(pipe?.apva_applied_mw ?? 1545)} MW (operator estimate)</div>
      </div>
          </>
        )}

        {activeTab === 'EE' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => openCountryAssets('EE', 'operational')} style={{ all: 'unset', color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', borderBottom: '1px dotted var(--teal)' }}>
                {formatMW(eeMw)} MW operational ↗
              </button>
              {' · '}
              <button onClick={() => openCountryAssets('EE', 'under_construction')} style={{ all: 'unset', color: 'var(--amber)', cursor: 'pointer', borderBottom: '1px dotted var(--amber)' }}>
                {formatMW(sbc.EE?.under_construction_mw ?? 255)} MW under construction ↗
              </button>
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>
              {sbc.EE?.coverage_note || `${eeMw} MW operational since Feb 2026, ${sbc.EE?.under_construction_mw ?? 255} MW under construction. Estonia BESS market emerging fast.`}
            </p>
            {eeQuarantinedMw > 0 && (
              <p style={{
                fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--amber)',
                lineHeight: 1.5, margin: '0 0 10px', padding: '6px 10px',
                borderLeft: '2px solid var(--amber-subtle)',
              }}>
                EE BESS fleet awaiting TSO confirmation: {formatMW(eeQuarantinedMw)} MW (BSP Hertz 1 + Eesti Energia BESS) flagged operational without Elering operational evidence. Strict count: {formatMW(Math.max(eeMw - eeQuarantinedMw, 0))} MW verified.
              </p>
            )}
            {sbc.EE?.assets?.map((a: CountryAsset) => <AssetRow key={a.id} asset={a} />) || (
              <p style={{ color: 'var(--text-muted)' }}>No asset data available</p>
            )}
          </div>
        )}

        {activeTab === 'LV' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{formatMW(lvMw)} MW operational</span>
              {' · TSO-owned'}
            </div>
            {lvQuarantinedMw > 0 && (
              <p style={{
                fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--amber)',
                lineHeight: 1.5, margin: '4px 0 10px', padding: '6px 10px',
                borderLeft: '2px solid var(--amber-subtle)',
              }}>
                LV commercial BESS awaiting TSO confirmation: {formatMW(lvQuarantinedMw)} MW (Utilitas Targale, AJ Power) flagged operational without AST operational evidence. Headline {formatMW(lvMw)} MW = AST-owned Rēzekne + Tume only.
              </p>
            )}
            {sbc.LV?.assets?.map((a: CountryAsset) => <AssetRow key={a.id} asset={a} />) || (
              <p style={{ color: 'var(--text-muted)' }}>No asset data available</p>
            )}
            {sbc.LV?.coverage_note && (
              <div style={{
                padding: '8px 10px', borderLeft: '2px solid var(--amber-subtle)',
                marginTop: '12px', lineHeight: 1.6,
              }}>
                {sbc.LV.coverage_note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* INTERPRETATION */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
        margin: '0 0 16px',
      }}>
        {installedMw} MW installed against {(tsoReservedMw / 1000).toFixed(1)} GW in TSO reservations and {(intentionMw / 1000).toFixed(1)} GW in intention protocols.
        Not all pipeline MW are equal — the credibility ladder shows how much is confirmed vs speculative.
        Connection timing and substation choice increasingly determine real buildability.
      </p>

      {/* SCHEDULE RISK */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        marginBottom: '12px',
      }}>
        Connection timeline: typically 18–36 months from application to energisation. Transformer and protection equipment lead times can extend this.
      </p>

      {/* POLICY WATCH */}
      <div style={{
        padding: '10px 12px',
        borderLeft: '1px solid var(--amber-subtle)',
        marginBottom: '16px',
      }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          Policy watch · Connection guarantee currently €50/kW (<SourceLink href={urls?.vert_arcgis ?? 'https://atviri-litgrid.hub.arcgis.com/'}>VERT</SourceLink>).
          Operator estimate: a guarantee reduction toward ~€25/kW is plausible from the 2026 VERT methodology cycle (pending decision). If enacted, would lower entry barriers but accelerate queue depletion.
        </p>
      </div>

      {/* IMPACT LINE */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--teal-medium)',
        marginBottom: '16px',
      }}>
        {pipelineImpactDesc(installedMw, tsoReservedMw)}
      </div>

      {/* SIGNAL INTEL */}
      <SignalIntel signalId="S4" />

      {/* FLEET SUMMARY */}
      {data.fleet && data.fleet.sd_ratio != null && (() => {
        const fl = data.fleet!;
        const allEntries: FleetEntry[] = [];
        if (fl.countries) {
          for (const c of Object.values(fl.countries)) {
            if (c.entries) allEntries.push(...c.entries);
          }
        }
        return (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: '8px',
            }}>
              Fleet tracker · {allEntries.length > 0 ? `${allEntries.length} projects` : ''} · {fl.sd_ratio?.toFixed(2)}× S/D
            </div>
            {fl.baltic_weighted_mw != null && fl.eff_demand_mw != null && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.5625rem',
                  color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5,
                }}
                title="Numerator is the credibility-weighted supply: operational ×1.0, under_construction ×0.9, connection_agreement ×0.6, application ×0.3, announced ×0.1. Pumped hydro and TSO BESS excluded (DRR-suppressed for FCR/aFRR until 2028-02)."
              >
                {sdFormulaCaption(fl.baltic_weighted_mw, fl.eff_demand_mw)}
              </div>
            )}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)',
            }}>
              <div title="All commissioned, grid-connected flex assets — BESS + pumped hydro (Kruonis 205 MW). Distinct from BESS-only registry total shown in the LT pipeline bar above.">
                <div style={{ color: 'var(--text-muted)' }}>Flex fleet</div>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fl.baltic_operational_mw ?? '—'} MW</div>
              </div>
              <div title={PIPELINE_TIER_LABELS.flex_pipeline.detail + '. Distinct from LT-only TSO reservations (1.4 GW), intention protocols (3.7 GW), and APVA grant applications (1.5 GW) shown in the LT pipeline detail.'}>
                <div style={{ color: 'var(--text-muted)' }}>{PIPELINE_TIER_LABELS.flex_pipeline.short}</div>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fl.baltic_pipeline_mw ?? '—'} MW</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Demand</div>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fl.eff_demand_mw ?? '—'} MW</div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ flexGrow: 1 }} />

      {/* SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="Litgrid · APVA · VERT.lt ArcGIS · Elering"
          updatedAt={formatTimestamp(data.timestamp)}
          dataClass="observed"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>
          {/* BESS pipeline detail */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            BESS pipeline detail
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Installed (national)</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(installedMw)} MW / {ref?.installed_mwh ?? 719} MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Allowed generation</span>
            <span style={{ color: 'var(--text-secondary)' }}>{ref?.installed_gen_mw ?? 420} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>TSO reserved (storage)</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(tsoReservedMw)} MW / {formatMW(pipe?.tso_reserved_mwh ?? 3204)} MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Intention protocols</span>
            <span style={{ color: 'var(--text-secondary)' }}>{(intentionMw / 1000).toFixed(1)} GW / {((pipe?.intention_protocols_mwh ?? 9000) / 1000).toFixed(0)} GWh</span>
            <span style={{ color: 'var(--text-muted)' }}>APVA applications</span>
            <span
              style={{ color: 'var(--text-secondary)' }}
              title="APVA 2025-10 large-power BESS support call (€44.97M budget per APVIS portal). MW/MWh totals reflect operator estimate from prior APVA briefings; exact paraiškų rezultatai pending publication. Source: https://apvis.apva.lt/paskelbti_kvietimai/dideles-galios-elektros-energijos-kaupimo-irenginiu-irengimas-siekiant-subalansuoti-elektros-energetikos-sistema-2025-10"
            >
              ~{formatMW(pipe?.apva_applied_mw ?? 1545)} MW / ~{formatMW(pipe?.apva_applied_mwh ?? 3232)} MWh (against ~€{((pipe?.apva_budget_eur ?? 45000000) / 1000000).toFixed(0)}M budget · operator estimate)
            </span>
            <span style={{ color: 'var(--text-muted)' }}>Pipeline-to-installed</span>
            <span style={{ color: 'var(--text-secondary)' }}>{(tsoReservedMw / installedMw).toFixed(1)}× (TSO reserved / installed)</span>
          </div>

          {/* Grid headroom — all technologies */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Grid headroom (all technologies, indicative)
          </p>
          <div style={{
            padding: '10px 12px',
            borderLeft: '2px solid var(--amber-subtle)',
            marginBottom: '12px',
          }}>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              marginBottom: '8px',
            }}>
              {data.grid_caveat || 'These figures cover ALL technologies (wind, solar, thermal, storage). Zonal values are non-additive per Litgrid methodology — real connection potential cannot be computed by summing zones.'}
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Connected (all tech)</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(connected)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Reserved (all tech)</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(reserved)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Available (all tech)</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(free)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Utilisation</span>
            <span style={{ color: 'var(--text-secondary)' }}>{data.utilisation_pct != null ? `${safeNum(data.utilisation_pct, 1)}%` : '—'}</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: '20px',
          }}>
            Permit queue: {data.pipeline?.dev_total_mw ? `${(data.pipeline.dev_total_mw / 1000).toFixed(1)} GW` : '—'} development permits (all technologies) against {free != null ? `${(freeVal / 1000).toFixed(1)} GW` : '—'} indicative headroom.
            {data.pipeline?.dev_total_mw && free != null && freeVal > 0 ? ` Oversubscription: ${(data.pipeline.dev_total_mw / freeVal).toFixed(1)}×.` : ''}
          </p>

          {/* Sources */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Sources
          </p>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.8,
            marginBottom: '20px',
          }}>
            <div><SourceLink href={urls?.litgrid ?? 'https://www.litgrid.eu/'}>Litgrid</SourceLink> — installed storage, reservation cycles, intention protocols</div>
            <div><SourceLink href={urls?.vert_arcgis ?? 'https://atviri-litgrid.hub.arcgis.com/'}>VERT.lt ArcGIS</SourceLink> — grid capacity maps (all technologies)</div>
            <div><SourceLink href={urls?.vert_permits ?? '#'}>VERT storage permits</SourceLink> — development permit register</div>
            <div><SourceLink href={urls?.apva ?? 'https://apva.lrv.lt/'}>APVA</SourceLink> — grant call results and applications</div>
            <div><SourceLink href={urls?.eso_maps ?? '#'}>ESO capacity maps</SourceLink> — distribution grid free capacity</div>
            <div><SourceLink href={urls?.litgrid_aei ?? '#'}>Litgrid AEI map</SourceLink> — RES connection map and methodology</div>
          </div>

          {/* Methodology */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '4px',
            opacity: 0.7,
          }}>
            Methodology
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            opacity: 0.6,
          }}>
            Installed storage from Litgrid press releases (observed). TSO reservation and intention protocol totals from Litgrid quarterly reporting (observed). Grid headroom from VERT.lt ArcGIS (observed, all technologies, non-additive). APVA from published grant call summaries (observed). Pipeline-to-installed ratio is derived.
          </p>
        </DetailsDrawer>
      </div>

      {/* ASSET DETAIL PANEL */}
      {assetPanel && (
        <AssetDetailPanel
          isOpen={true}
          onClose={() => setAssetPanel(null)}
          title={assetPanel.title}
          subtitle={assetPanel.subtitle}
          assets={assetPanel.assets}
          notes={assetPanel.notes}
        />
      )}
    </article>
  );
}
