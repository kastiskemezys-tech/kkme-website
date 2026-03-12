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

interface S4Signal {
  timestamp?:      string | null;
  free_mw?:        number | null;
  connected_mw?:   number | null;
  reserved_mw?:    number | null;
  utilisation_pct?: number | null;
  signal?:         string | null;
  interpretation?: string | null;
  pipeline?:       S4Pipeline;
  _stale?:         boolean;
  _age_hours?:     number | null;
}

function computeFreePct(free: number, connected: number, reserved: number): number {
  const total = connected + reserved + free;
  if (total <= 0) return 0;
  return (free / total) * 100;
}

function freeSentiment(pct: number): Sentiment {
  if (pct > 40) return 'positive';
  if (pct > 15) return 'caution';
  return 'negative';
}

function freeStatus(pct: number): string {
  if (pct > 40) return 'Headroom visible';
  if (pct > 25) return 'Access tightening';
  if (pct > 15) return 'Tightening';
  return 'Constrained';
}

function freeInterpretation(pct: number): string {
  if (pct > 40) return 'Public headroom remains visible at national level, though connection scope, substation requirements, and equipment lead times still determine real buildability at each node.';
  if (pct > 25) return 'Headline capacity remains, but reservation pressure is reducing practical access. Queue position and connection complexity increasingly matter — not just available MW.';
  if (pct > 15) return 'Available headroom is narrowing. Queue position, connection scope, and substation requirements increasingly determine real buildability — not just headline MW.';
  return 'Grid access is becoming a material constraint. Later entrants face higher connection complexity, longer timelines, and elevated substation reinforcement scope.';
}

function freeImpact(pct: number): ImpactState {
  if (pct > 40) return 'slight_positive';
  if (pct > 25) return 'mixed';
  if (pct > 15) return 'slight_negative';
  return 'strong_negative';
}

function freeImpactDesc(pct: number): string {
  if (pct > 40) return 'Reference asset: node-specific access still matters despite headline headroom';
  if (pct > 25) return 'Reference asset: queue timing and substation choice matter more than headline capacity';
  if (pct > 15) return 'Reference asset: early queue position increasingly matters — later entrants face higher connection complexity';
  return 'Reference asset: elevated grid-access risk — connection scope and reinforcement costs rising for new entrants';
}

function formatMW(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-GB');
}

function formatHeroMW(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1);
  return n.toString();
}

function heroUnit(n: number | null | undefined): string {
  if (n == null) return '';
  return n >= 1000 ? 'GW' : 'MW';
}

function reservedPressure(reserved: number, total: number): string {
  if (total <= 0) return 'Unknown';
  const pct = (reserved / total) * 100;
  if (pct > 50) return 'High';
  if (pct > 30) return 'Moderate';
  return 'Low';
}

export function S4Card() {
  const { status, data } =
    useSignal<S4Signal>(`${WORKER_URL}/s4`);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Loading grid capacity data...
        </p>
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

  const free = data.free_mw ?? null;
  const connected = data.connected_mw ?? 0;
  const reserved = data.reserved_mw ?? 0;
  const freeVal = free ?? 0;
  const total = connected + reserved + freeVal;
  const freePct = computeFreePct(freeVal, connected, reserved);

  // Bar segment widths
  const connPct = total > 0 ? (connected / total) * 100 : 0;
  const resPct = total > 0 ? (reserved / total) * 100 : 0;
  const availPct = total > 0 ? (freeVal / total) * 100 : 0;

  return (
    <article style={{ width: '100%' }}>
      {/* HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3
          onClick={openDrawer}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 500,
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
          Whether new Lithuanian storage projects can still connect. Public capacity, reservation pressure, and policy signals.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Lithuania public grid snapshot
        </p>
      </div>

      {/* HERO METRIC */}
      {free != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile
              label="Indicative available capacity"
              value={formatHeroMW(free)}
              unit={heroUnit(free)}
              size="hero"
              dataClass="observed"
            />
            <StatusChip status={freeStatus(freePct)} sentiment={freeSentiment(freePct)} />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
            Litgrid public grid snapshot · does not reflect connection scope, substation requirements, or queue position
          </p>
        </div>
      )}

      {/* STACKED HORIZONTAL BAR */}
      {total > 0 && (
        <div style={{ margin: '16px 0 20px' }}>
          <div style={{ display: 'flex', height: '40px', gap: '1px', borderRadius: '2px', overflow: 'hidden' }}>
            {connPct > 0 && (
              <div style={{ flex: connPct, background: 'var(--rose-strong)' }} />
            )}
            {resPct > 0 && (
              <div style={{ flex: resPct, background: 'var(--amber-strong)' }} />
            )}
            {availPct > 0 && (
              <div style={{ flex: availPct, background: 'var(--teal-medium)' }} />
            )}
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
            <span>Connected: {formatMW(connected)} MW</span>
            <span>Reserved: {formatMW(reserved)} MW</span>
            <span>Available: {formatMW(free)} MW</span>
          </div>
        </div>
      )}

      {/* INTERPRETATION */}
      {free != null && (
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          margin: '0 0 16px',
        }}>
          {freeInterpretation(freePct)}
        </p>
      )}

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

      {/* POLICY WATCH — secondary context */}
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
          Policy watch · Connection guarantee currently €50/kW (VERT). Proposed reduction to €25/kW under discussion. If enacted, may lower entry barriers but accelerate queue depletion.
        </p>
      </div>

      {/* IMPACT LINE */}
      {free != null && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--teal-medium)',
          marginBottom: '16px',
        }}>
          {freeImpactDesc(freePct)}
        </div>
      )}

      {/* SOURCE FOOTER — clickable to open drawer */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="VERT.lt ArcGIS · Litgrid"
          updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="observed"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View grid detail" defaultOpen={drawerKey > 0}>
          {/* Capacity breakdown */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Capacity breakdown
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Connected</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(connected)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Reserved</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(reserved)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Available</span>
            <span style={{ color: 'var(--text-secondary)' }}>{formatMW(free)} MW</span>
            <span style={{ color: 'var(--text-muted)' }}>Utilisation</span>
            <span style={{ color: 'var(--text-secondary)' }}>{data.utilisation_pct != null ? `${safeNum(data.utilisation_pct, 1)}%` : '—'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Free share</span>
            <span style={{ color: 'var(--text-secondary)' }}>{free != null ? `${safeNum(freePct, 1)}%` : '—'}</span>
          </div>

          {/* Permits */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Permits
          </p>
          {data.pipeline && !data.pipeline.parse_warning && data.pipeline.dev_total_mw != null ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '5px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              marginBottom: '20px',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>Development permits</span>
              <span style={{ color: 'var(--text-secondary)' }}>{(data.pipeline.dev_total_mw / 1000).toFixed(1)} GW</span>
              {data.pipeline.gen_total_mw != null && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Generation permits</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{(data.pipeline.gen_total_mw / 1000).toFixed(1)} GW</span>
                </>
              )}
              <span style={{ color: 'var(--text-muted)' }}>Source</span>
              <span style={{ color: 'var(--text-muted)' }}>VERT.lt storage permits, BESS filtered</span>
            </div>
          ) : (
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              marginBottom: '20px',
            }}>
              Permit data temporarily unavailable
            </p>
          )}

          {/* Buildability assessment */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Buildability assessment
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '8px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Reserved pressure</span>
            <span style={{ color: 'var(--text-secondary)' }}>{reservedPressure(reserved, total)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Buildability outlook</span>
            <span style={{ color: 'var(--text-secondary)' }}>{freeStatus(freePct)}</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            Current buildability view based on public capacity snapshot. Node-specific access, queue position, and reinforcement scope are not captured in this aggregate view.
          </p>

          {/* Methodology — footer-level */}
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
            Public grid capacity from VERT.lt ArcGIS (Litgrid data). Reservation data is a point-in-time snapshot — not all reserved capacity converts to built projects. This is a national pressure indicator, not a node-level buildability assessment.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
