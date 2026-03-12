'use client';

import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface WindSignal {
  timestamp?: string | null;
  baltic_mw?: number | null;
  avg_7d_mw?: number | null;
  trend_7d?: string | null;
  baltic_installed_mw?: number | null;
  baltic_share_pct?: number | null;
  lt_mw?: number | null;
  ee_mw?: number | null;
  lv_mw?: number | null;
  signal?: string | null;
  interpretation?: string | null;
  source?: string | null;
  data_class?: string | null;
  coverage_countries?: string[] | null;
}

function trendLabel(t: string | null | undefined): string {
  if (t === 'above_baseline') return 'Above 7D avg';
  if (t === 'below_baseline') return 'Below 7D avg';
  if (t === 'stable') return 'Near 7D avg';
  return 'Unknown';
}

function trendSentiment(t: string | null | undefined): Sentiment {
  if (t === 'above_baseline') return 'positive';
  if (t === 'below_baseline') return 'caution';
  return 'neutral';
}

function windInterpretation(trend: string | null | undefined): string {
  if (trend === 'above_baseline') return 'Elevated wind is widening low-price windows — supportive for low-cost charging.';
  if (trend === 'below_baseline') return 'Below-average wind is reducing cheap-hour availability — narrowing charging windows.';
  return 'Wind generation near recent baseline — typical charging conditions.';
}

function windImpact(trend: string | null | undefined): string {
  if (trend === 'above_baseline') return 'Reference asset: supportive for charging spreads';
  if (trend === 'below_baseline') return 'Reference asset: reducing charging opportunity';
  return 'Reference asset: neutral for spreads';
}

export function WindCard() {
  const { status, data } = useSignal<WindSignal>(`${WORKER_URL}/s_wind`);

  if (status === 'loading') {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Loading wind data...</p></article>;
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Wind data unavailable</p></article>;
  }

  const mw = data.baltic_mw;
  const avg = data.avg_7d_mw;
  const trend = data.trend_7d;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '6px' }}>
        Baltic wind generation
      </h3>

      {mw != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile label="Current Baltic wind output" value={mw.toLocaleString()} unit="MW" size="hero" dataClass="observed" />
            <StatusChip status={trendLabel(trend)} sentiment={trendSentiment(trend)} />
          </div>
        </div>
      )}

      {avg != null && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
          7D avg: {avg.toLocaleString()} MW
        </p>
      )}

      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
        {windInterpretation(trend)}
      </p>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '12px' }}>
        {windImpact(trend)}
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
