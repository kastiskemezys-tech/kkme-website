'use client';

import { useState } from 'react';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { ImpactState, Sentiment } from '@/app/lib/types';

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
  installed_gen_mw: number;
  installed_mwh:    number;
  note:             string;
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
  grid_caveat?:       string;
  source_urls?:       SourceUrls;
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
  if (tsoReservedMw > installedMw * 5) return 'High pipeline pressure';
  if (tsoReservedMw > installedMw * 3) return 'Pipeline building';
  return 'Early stage';
}

function pipelineImpactDesc(installedMw: number, tsoReservedMw: number): string {
  const ratio = tsoReservedMw / Math.max(installedMw, 1);
  if (ratio > 5) return 'Reference asset: high pipeline-to-installed ratio suggests grid queue pressure will intensify — early queue position critical';
  if (ratio > 3) return 'Reference asset: pipeline exceeds installed base by ' + ratio.toFixed(0) + '× — connection timing increasingly matters';
  return 'Reference asset: pipeline manageable relative to installed base — grid access currently favourable';
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

export function S4Card() {
  const { status, data } =
    useSignal<S4Signal>(`${WORKER_URL}/s4`);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

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
  const installedMw = ref?.installed_mw ?? 484;
  const tsoReservedMw = pipe?.tso_reserved_mw ?? 1395;
  const intentionMw = pipe?.intention_protocols_mw ?? 3700;

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
    <article style={{ width: '100%' }}>
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
          Lithuanian storage installed base, TSO pipeline, and grid connection pressure.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          BESS pipeline · Lithuania
        </p>
      </div>

      {/* HERO — installed storage */}
      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <MetricTile
            label="Installed storage"
            value={formatMW(installedMw)}
            unit="MW"
            size="hero"
            dataClass="observed"
          />
          <StatusChip
            status={pipelineStatus(installedMw, tsoReservedMw)}
            sentiment={pipelineSentiment(installedMw, tsoReservedMw)}
          />
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
          {ref?.installed_gen_mw ?? 420} MW allowed generation · {ref?.installed_mwh ?? 719} MWh · {ref ? (
            <SourceLink href={ref.source_url}>{ref.source}</SourceLink>
          ) : 'Litgrid 2026-03-23'}
        </p>
      </div>

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
          APVA grant call: {formatMW(pipe?.apva_applied_mw ?? 1545)} MW applied
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
        <div style={{ opacity: 0.35, fontStyle: 'italic' }}><span style={{ color: 'var(--text-tertiary)' }}>○</span> APVA applied: {formatMW(pipe?.apva_applied_mw ?? 1545)} MW</div>
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
          Proposed reduction to €25/kW under discussion. If enacted, may lower entry barriers but accelerate queue depletion.
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

      {/* SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="Litgrid · APVA · VERT.lt ArcGIS"
          updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
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
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(pipe?.apva_applied_mw ?? 1545)} MW / {formatMW(pipe?.apva_applied_mwh ?? 3232)} MWh (against €{((pipe?.apva_budget_eur ?? 45000000) / 1000000).toFixed(0)}M budget)</span>
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
    </article>
  );
}
