'use client';

import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface SolarSignal {
  timestamp?: string | null;
  baltic_mw?: number | null;
  avg_7d_mw?: number | null;
  trend_7d?: string | null;
  baltic_installed_mw?: number | null;
  baltic_share_pct?: number | null;
  lt_mw?: number | null;
  ee_mw?: number | null;
  lv_mw?: number | null;
  is_night?: boolean | null;
  signal?: string | null;
  interpretation?: string | null;
  source?: string | null;
  data_class?: string | null;
  coverage_countries?: string[] | null;
}

function solarLabel(t: string | null | undefined, isNight: boolean | null | undefined): string {
  if (isNight) return 'Night';
  if (t === 'above_baseline') return 'Above 7D avg';
  if (t === 'below_baseline') return 'Below 7D avg';
  if (t === 'stable') return 'Near 7D avg';
  return 'Unknown';
}

function solarSentiment(t: string | null | undefined, isNight: boolean | null | undefined): Sentiment {
  if (isNight) return 'neutral';
  if (t === 'above_baseline') return 'positive';
  if (t === 'below_baseline') return 'caution';
  return 'neutral';
}

function solarInterpretation(trend: string | null | undefined, isNight: boolean | null | undefined, mw: number | null | undefined): string {
  if (isNight) return 'Solar generation offline — nighttime across Baltic region.';
  if (mw != null && mw < 50) return 'Solar remains a minor current Baltic driver — limited midday price suppression.';
  if (trend === 'above_baseline') return 'Elevated solar is compressing midday prices — supportive for low-cost charging windows.';
  if (trend === 'below_baseline') return 'Below-average solar is reducing midday price dips — narrower charging windows.';
  return 'Solar generation near recent baseline — typical midday price conditions.';
}

function solarImpact(trend: string | null | undefined, isNight: boolean | null | undefined, mw: number | null | undefined): string {
  if (isNight) return 'Reference asset: no solar charging window';
  if (mw != null && mw < 50) return 'Reference asset: minimal solar price effect';
  if (trend === 'above_baseline') return 'Reference asset: supportive for midday charging';
  if (trend === 'below_baseline') return 'Reference asset: reducing midday charging window';
  return 'Reference asset: neutral for charging';
}

export function SolarCard() {
  const { status, data } = useSignal<SolarSignal>(`${WORKER_URL}/s_solar`);

  if (status === 'loading') {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Loading solar data...</p></article>;
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Solar data unavailable</p></article>;
  }

  const mw = data.baltic_mw;
  const avg = data.avg_7d_mw;
  const trend = data.trend_7d;
  const isNight = data.is_night;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '6px' }}>
        Baltic solar generation
      </h3>

      {mw != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile label="Current Baltic solar output" value={mw.toLocaleString()} unit="MW" size="hero" dataClass="observed" />
            <StatusChip status={solarLabel(trend, isNight)} sentiment={solarSentiment(trend, isNight)} />
          </div>
        </div>
      )}

      {avg != null && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
          7D avg: {avg.toLocaleString()} MW
        </p>
      )}

      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
        {solarInterpretation(trend, isNight, mw)}
      </p>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '12px' }}>
        {solarImpact(trend, isNight, mw)}
      </div>

      <SourceFooter source="energy-charts.info" updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined} dataClass="observed" />

      <div style={{ marginTop: '12px' }}>
        <DetailsDrawer label="View country breakdown">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Per-country generation</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', marginBottom: '16px' }}>
            {(['LT', 'EE', 'LV'] as const).map(c => {
              const v = c === 'LT' ? data.lt_mw : c === 'EE' ? data.ee_mw : data.lv_mw;
              return (
                <div key={c}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>{c}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{v != null ? `${v} MW` : '—'}</div>
                </div>
              );
            })}
          </div>
          {data.coverage_countries && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', opacity: 0.7 }}>
              Coverage: {data.coverage_countries.join(', ')} · Installed capacity references (~2026)
            </p>
          )}
        </DetailsDrawer>
      </div>
    </article>
  );
}
