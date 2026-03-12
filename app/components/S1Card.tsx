'use client';

import { useState, useEffect } from 'react';
import type { S1Signal } from '@/lib/signals/s1';
import { useSignal } from '@/lib/useSignal';
import { safeNum } from '@/lib/safeNum';
import { Sparkline } from './Sparkline';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { ImpactState, Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

function spreadSentiment(spread: number): Sentiment {
  if (spread < -5) return 'negative';
  if (spread < 2) return 'neutral';
  if (spread < 10) return 'caution';
  return 'positive';
}

function spreadStatus(spread: number): string {
  if (spread < -5) return 'Inverted';
  if (spread < 2) return 'Weak';
  if (spread < 10) return 'Slightly supportive';
  if (spread < 25) return 'Supportive';
  return 'Strong';
}

function spreadInterpretation(spread: number): string {
  if (spread < 0) return 'Baltic prices are below neighboring markets. Arbitrage is not supportive at current levels.';
  if (spread < 5) return 'Narrow spreads. Arbitrage contributes modestly to storage economics.';
  if (spread < 15) return 'Moderate price separation. Day-ahead arbitrage provides meaningful revenue support.';
  return 'Wide Baltic price separation. Arbitrage is a significant contributor to storage revenues.';
}

function spreadImpact(spread: number): ImpactState {
  if (spread < 0) return 'slight_negative';
  if (spread < 5) return 'mixed';
  if (spread < 15) return 'slight_positive';
  return 'strong_positive';
}

function spreadImpactDesc(spread: number): string {
  if (spread < 0) return 'Reference asset: Arbitrage drag on both 2H and 4H';
  if (spread < 5) return 'Reference asset: Minor arbitrage support for 2H and 4H';
  if (spread < 15) return 'Reference asset: Moderate arbitrage support, stronger for 4H';
  return 'Reference asset: Strong arbitrage upside, especially for 4H duration';
}

export function S1Card() {
  const { status, data } =
    useSignal<S1Signal>(`${WORKER_URL}/read`);
  const [history, setHistory] = useState<number[]>([]);
  const [drawerKey, setDrawerKey] = useState(0);
  const openDrawer = () => setDrawerKey(k => k + 1);

  useEffect(() => {
    fetch(`${WORKER_URL}/s1/history`)
      .then(r => r.json())
      .then((h: Array<{ spread_eur: number }>) => setHistory(h.map(e => e.spread_eur)))
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Loading price separation data...
        </p>
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: '24px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Price separation data unavailable
        </p>
      </article>
    );
  }

  const spread = data.spread_eur_mwh;
  const spreadP50 = data.spread_stats_90d?.p50 ?? null;
  const daysOfData = data.spread_stats_90d?.days_of_data ?? 0;
  const impact = spreadImpact(spread);

  // Compute spread percentile vs 30D history
  let percentileLabel = '';
  if (history.length > 7) {
    const sorted = [...history].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= spread).length;
    const pct = Math.round((rank / sorted.length) * 100);
    const suffix = pct % 100 >= 11 && pct % 100 <= 13 ? 'th'
      : pct % 10 === 1 ? 'st' : pct % 10 === 2 ? 'nd' : pct % 10 === 3 ? 'rd' : 'th';
    percentileLabel = `${pct}${suffix}`;
  }

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
          Baltic price separation
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          How far Baltic day-ahead prices diverge from neighbors. Wider spreads support storage arbitrage.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          Lithuania-led · ENTSO-E day-ahead data
        </p>
      </div>

      {/* HERO METRIC */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <MetricTile
          label="Day-ahead price spread"
          value={`${spread >= 0 ? '+' : ''}${safeNum(spread, 1)}`}
          unit="€/MWh"
          size="hero"
          dataClass="observed"
          sublabel="LT minus SE4 average"
        />
        <StatusChip status={spreadStatus(spread)} sentiment={spreadSentiment(spread)} />
      </div>

      {/* HERO CHART — 30-day spread history */}
      {history.length > 1 && (
        <div style={{ margin: '16px 0', overflow: 'hidden' }}>
          <Sparkline
            values={history}
            p50={spreadP50 ?? undefined}
            color="var(--teal-strong)"
            height={200}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}>
            <span>{daysOfData > 0 ? `${daysOfData} days` : ''}</span>
            <span>today</span>
          </div>
        </div>
      )}

      {/* INTERPRETATION */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginBottom: '8px',
      }}>
        {spreadInterpretation(spread)}
      </p>

      {/* IMPACT LINE */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--teal-strong)',
        marginBottom: '16px',
      }}>
        {spreadImpactDesc(spread)}
      </div>

      {/* SOURCE FOOTER — clickable to open drawer */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source="ENTSO-E A44"
          updatedAt={data.updated_at ? new Date(data.updated_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="observed data"
        />
      </button>

      {/* DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View signal breakdown" defaultOpen={drawerKey > 0}>
          {/* Supporting metrics */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Supporting metrics
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '20px',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {data.bess_net_capture != null ? safeNum(data.bess_net_capture, 1) : '—'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>€/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                Battery arbitrage capture · net of RTE
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                {spreadP50 != null ? `${spreadP50 >= 0 ? '+' : ''}${safeNum(spreadP50, 1)}` : '—'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>€/MWh</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                {daysOfData >= 90 ? '90-day' : daysOfData > 0 ? `${daysOfData}-day` : ''} median spread
              </div>
            </div>
            {percentileLabel && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {percentileLabel}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Spread percentile vs 30 days
                </div>
              </div>
            )}
            {!percentileLabel && data.pct_hours_above_20 != null && (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                  {safeNum(data.pct_hours_above_20, 1)}%
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Hours above 20% spread
                </div>
              </div>
            )}
          </div>

          {/* Price breakdown */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Price breakdown
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '20px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>LT average</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.lt_avg_eur_mwh, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>SE4 average</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.se4_avg_eur_mwh, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Spread</span>
            <span style={{ color: 'var(--text-secondary)' }}>{spread >= 0 ? '+' : ''}{safeNum(spread, 2)} €/MWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Separation</span>
            <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.separation_pct, 1)}% vs SE4</span>
            {data.lt_daily_swing_eur_mwh != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>LT daily swing</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.lt_daily_swing_eur_mwh, 0)} €/MWh</span>
              </>
            )}
            {data.p_high_avg != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>P_high (top-4h)</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.p_high_avg, 1)} €/MWh</span>
              </>
            )}
            {data.p_low_avg != null && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>P_low (bottom-4h)</span>
                <span style={{ color: 'var(--text-secondary)' }}>{safeNum(data.p_low_avg, 1)} €/MWh</span>
              </>
            )}
          </div>

          {data.da_tomorrow?.lt_peak != null && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              marginBottom: '20px',
            }}>
              Tomorrow DA: {safeNum(data.da_tomorrow.lt_peak, 0)} peak · {safeNum(data.da_tomorrow.lt_avg, 0)} avg €/MWh
              {data.da_tomorrow.delivery_date && ` · ${data.da_tomorrow.delivery_date}`}
            </div>
          )}

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
            Day-ahead directional estimate. Realised arbitrage depends on intraday conditions, efficiency, and market access.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
