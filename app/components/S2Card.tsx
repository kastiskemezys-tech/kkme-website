'use client';

import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { ImpactState, Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface FleetEntry {
  id?: string;
  name: string;
  mw: number;
  mwh?: number;
  status: string;
  cod?: number | null;
  country?: string;
  tso?: string;
}

interface FleetCountry {
  operational_mw: number;
  pipeline_mw: number;
  weighted_mw: number;
  entries?: FleetEntry[];
}

interface TrajectoryPoint {
  year: number;
  sd_ratio: number;
  phase: string;
}

interface S2Signal {
  timestamp?: string | null;
  fcr_avg?: number | null;
  afrr_up_avg?: number | null;
  afrr_down_avg?: number | null;
  mfrr_up_avg?: number | null;
  mfrr_down_avg?: number | null;
  pct_up?: number | null;
  pct_down?: number | null;
  imbalance_mean?: number | null;
  imbalance_p90?: number | null;
  pct_above_100?: number | null;
  afrr_annual_per_mw_installed?: number | null;
  mfrr_annual_per_mw_installed?: number | null;
  cvi_afrr_eur_mw_yr?: number | null;
  cvi_mfrr_eur_mw_yr?: number | null;
  stress_index_p90?: number | null;
  fcr_note?: string | null;
  ordered_price?: number | null;
  ordered_mw?: number | null;
  signal?: string | null;
  interpretation?: string | null;
  source?: string | null;
  unavailable?: boolean;
  _stale?: boolean;
  _age_hours?: number | null;
  _serving?: string;
  sd_ratio?: number | null;
  phase?: string | null;
  cpi?: number | null;
  trajectory?: TrajectoryPoint[] | null;
  fleet?: Record<string, FleetCountry> | null;
  baltic_operational_mw?: number | null;
  baltic_pipeline_mw?: number | null;
  eff_demand_mw?: number | null;
}

function sdSentiment(sd: number): Sentiment {
  if (sd < 0.5) return 'positive';
  if (sd < 0.7) return 'caution';
  if (sd < 0.9) return 'caution';
  return 'negative';
}

function sdStatus(sd: number): string {
  if (sd < 0.5) return 'Supportive';
  if (sd < 0.7) return 'Tightening';
  if (sd < 0.9) return 'Competitive';
  return 'Compressed';
}

function sdInterpretation(sd: number): string {
  if (sd < 0.5) return 'Fleet supply covers less than half of balancing demand. Revenue conditions are strongly supportive.';
  if (sd < 0.7) return 'Competition is building but demand still exceeds fleet supply. Revenue support holds, with compression risk ahead.';
  if (sd < 0.9) return 'Battery fleet is approaching system demand. Revenue quality depends on product mix and market access.';
  return 'Fleet supply meets or exceeds demand. Balancing revenues are under compression pressure.';
}

function sdImpact(sd: number): ImpactState {
  if (sd < 0.5) return 'strong_positive';
  if (sd < 0.7) return 'slight_positive';
  if (sd < 0.9) return 'mixed';
  return 'slight_negative';
}

function sdImpactDesc(sd: number): string {
  if (sd < 0.5) return '50MW reference asset: Strong balancing revenue support for both 2H and 4H';
  if (sd < 0.7) return '50MW reference asset: Revenue support holds but 2027+ COD timing increasingly matters';
  if (sd < 0.9) return '50MW reference asset: Revenue mix and market access now determine viability';
  return '50MW reference asset: Compression risk — earlier COD and shorter duration may be more resilient';
}

function trajectoryBarColor(phase: string): string {
  if (phase === 'SCARCITY') return 'rgba(0,180,160,0.75)';
  if (phase === 'COMPRESS') return 'rgba(212,160,60,0.75)';
  return 'rgba(214,88,88,0.75)';
}

function pressureTrend(trajectory: TrajectoryPoint[] | null | undefined, currentSd: number): string {
  if (!trajectory || trajectory.length < 2) return 'Unknown';
  const nextYear = trajectory.find(pt => pt.year > new Date().getFullYear());
  if (!nextYear) return 'Stable';
  if (nextYear.sd_ratio > currentSd + 0.05) return 'Rising';
  if (nextYear.sd_ratio < currentSd - 0.05) return 'Easing';
  return 'Stable';
}

export function S2Card() {
  const { status, data } =
    useSignal<S2Signal>(`${WORKER_URL}/s2`);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Loading balancing market data...
        </p>
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Balancing market data unavailable
        </p>
      </article>
    );
  }

  const sd = data.sd_ratio ?? null;
  const opMw = data.baltic_operational_mw;
  const pipeMw = data.baltic_pipeline_mw;
  const trajectory = data.trajectory ?? null;

  // Collect all fleet entries for the details drawer
  const STATUS_ORDER: Record<string, number> = {
    operational: 0, commissioned: 1, under_construction: 2,
    connection_agreement: 3, application: 4,
  };
  const allEntries: FleetEntry[] = Object.values(data.fleet || {})
    .flatMap((c: unknown) => ((c as FleetCountry)?.entries || []))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return (
    <article style={{ width: '100%' }}>
      {/* HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 500,
          marginBottom: '6px',
        }}>
          Baltic balancing market
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          How much balancing revenue remains as battery competition grows. The key question for storage economics.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Baltic blended · LT-led signal depth
        </p>
      </div>

      {/* HERO METRIC */}
      {sd != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile
              label="Battery competition vs balancing demand"
              value={sd.toFixed(2)}
              unit="×"
              size="hero"
              dataClass="derived"
              sublabel="below 1.0× = demand exceeds fleet supply"
            />
            <StatusChip status={sdStatus(sd)} sentiment={sdSentiment(sd)} />
          </div>
        </div>
      )}

      {/* INTERPRETATION — right after hero */}
      {sd != null && (
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: '12px 0 16px',
        }}>
          {sdInterpretation(sd)}
        </p>
      )}

      {/* FLEET PRESSURE SUMMARY — compact */}
      <div style={{
        display: 'flex',
        gap: '16px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {opMw != null && <span>Operational: {opMw} MW</span>}
        {pipeMw != null && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>Pipeline: {pipeMw} MW</span>
          </>
        )}
        {sd != null && trajectory && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span>Pressure: {pressureTrend(trajectory, sd)}</span>
          </>
        )}
      </div>

      {/* TRAJECTORY CHART — S/D ratio by year */}
      {trajectory && trajectory.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ position: 'relative', height: '160px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            {/* 1.0× threshold line */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${Math.min((1.0 / Math.max(...trajectory.map(pt => pt.sd_ratio), 1.5)) * 100, 100)}%`,
              borderTop: '1px dashed rgba(232,226,217,0.20)',
              zIndex: 1,
            }}>
              <span style={{
                position: 'absolute',
                right: 0,
                top: '-14px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
              }}>1.0×</span>
            </div>
            {trajectory.map(pt => {
              const maxSd = Math.max(...trajectory.map(p => p.sd_ratio), 1.5);
              const heightPct = (pt.sd_ratio / maxSd) * 100;
              return (
                <div key={pt.year} title={`${pt.year}: S/D ${pt.sd_ratio.toFixed(2)}× · ${pt.phase}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-xs)',
                    color: 'var(--text-muted)',
                    marginBottom: '4px',
                  }}>
                    {pt.sd_ratio.toFixed(1)}
                  </span>
                  <div style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    background: trajectoryBarColor(pt.phase),
                    borderRadius: '2px 2px 0 0',
                    minHeight: '4px',
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-xs)',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                  }}>
                    {pt.year}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* IMPACT LINE */}
      {sd != null && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'rgba(0,180,160,0.75)',
          marginBottom: '16px',
        }}>
          {sdImpactDesc(sd)}
        </div>
      )}

      {/* SOURCE FOOTER */}
      <SourceFooter
        source="Baltic balancing references + fleet tracker"
        updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        }) : undefined}
        dataClass="reference estimates"
      />

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer label="Signal detail and methodology">
          {/* Supporting metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '16px',
          }}>
            <MetricTile
              label="aFRR capacity reference"
              value={data.afrr_up_avg != null ? safeNum(data.afrr_up_avg, 0) : '—'}
              unit="€/MW/h"
              size="standard"
              dataClass="proxy"
              sublabel="Baltic proxy, not clearing price"
            />
            <MetricTile
              label="mFRR capacity reference"
              value={data.mfrr_up_avg != null ? safeNum(data.mfrr_up_avg, 0) : '—'}
              unit="€/MW/h"
              size="standard"
              dataClass="proxy"
              sublabel="Baltic proxy, not clearing price"
            />
          </div>

          {/* Fleet composition */}
          {allEntries.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}>
                Baltic BESS fleet ({allEntries.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {allEntries.map((e, i) => (
                  <div
                    key={e.id ?? `${e.name}-${i}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: '0 8px',
                      alignItems: 'baseline',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--font-xs)',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{e.name}</span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{e.mw} MW</span>
                    <span style={{
                      color: (e.status === 'operational' || e.status === 'commissioned') ? 'rgba(0,180,160,0.75)' :
                        e.status === 'under_construction' ? 'var(--amber)' : 'var(--text-muted)',
                      textAlign: 'right',
                      minWidth: '80px',
                    }}>
                      {e.status.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                      {e.cod ? `COD ${e.cod}` : ''}
                      {e.country ? ` · ${e.country}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Price detail */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Price detail
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '12px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>aFRR up</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {safeNum(data.afrr_up_avg, 1)} €/MW/h · CH 2027: €20 · CH 2028: €10
            </span>
            <span style={{ color: 'var(--text-muted)' }}>mFRR up</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {safeNum(data.mfrr_up_avg, 1)} €/MW/h · CH 2027: €20 · CH 2030: €11
            </span>
            {data.fcr_avg != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>FCR</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {safeNum(data.fcr_avg, 1)} €/MW/h · 25 MW total Baltic market
                </span>
              </>
            )}
            {data.stress_index_p90 != null && (data.stress_index_p90 > 0) && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>P90 imbalance spike</span>
                <span style={{ color: 'var(--rose)' }}>{safeNum(data.stress_index_p90, 0)} €/MWh</span>
              </>
            )}
          </div>

          {/* Annual revenue estimates */}
          {(data.afrr_annual_per_mw_installed != null || data.mfrr_annual_per_mw_installed != null) && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-secondary)',
              marginBottom: '12px',
            }}>
              {data.afrr_annual_per_mw_installed != null && (
                <div>aFRR annual estimate: €{Math.round(data.afrr_annual_per_mw_installed / 1000)}k/MW/yr</div>
              )}
              {data.mfrr_annual_per_mw_installed != null && (
                <div>mFRR annual estimate: €{Math.round(data.mfrr_annual_per_mw_installed / 1000)}k/MW/yr</div>
              )}
              <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                Per MW installed · 0.5 MW service (2 MW/MW prequalification) · theoretical max if fully allocated
              </p>
            </div>
          )}

          {/* Methodology */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Methodology
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}>
            Baltic-calibrated proxies from AST Latvia reference data. Not observed clearing prices. Proxy flag applies until BTD measured data.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
