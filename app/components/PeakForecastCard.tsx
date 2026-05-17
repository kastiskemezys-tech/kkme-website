'use client';

import { useSignal } from '@/lib/useSignal';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
import { SourceFooter } from '@/app/components/primitives';
import { formatTomorrowLine } from '@/app/lib/peakForecast';
import { formatHourEET } from '@/app/lib/hourLabels';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S1Signal {
  lt_daily_swing_eur_mwh?: number | null;
  lt_peak_hour_utc?: number | null;
  lt_peak_price?: number | null;
  lt_trough_hour_utc?: number | null;
  lt_trough_price?: number | null;
  da_tomorrow?: {
    lt_peak?: number | null;
    lt_trough?: number | null;
    lt_avg?: number | null;
    se4_avg?: number | null;
    spread_pct?: number | null;
    delivery_date?: string | null;
  } | null;
  swing_stats_90d?: {
    p25?: number | null;
    p50?: number | null;
    p75?: number | null;
    p90?: number | null;
  } | null;
  updated_at?: string | null;
}

function dotColor(swing: number, stats: S1Signal['swing_stats_90d']): string {
  if (!stats?.p50) return 'var(--text-muted)';
  if (swing > (stats.p90 ?? Infinity)) return 'var(--green)';
  if (swing > (stats.p50 ?? 0)) return 'var(--amber)';
  return 'var(--text-muted)';
}

function interpretation(swing: number, stats: S1Signal['swing_stats_90d']): string {
  if (!stats?.p50 || !stats?.p90) return `Swing €${swing.toFixed(0)}/MWh`;
  const ratioMedian = (swing / stats.p50).toFixed(2);
  const ratioP90 = (swing / stats.p90).toFixed(2);
  return `Swing €${swing.toFixed(0)}/MWh · ${ratioMedian}× the 90D median (€${stats.p50.toFixed(0)}), ${ratioP90}× the P90 (€${stats.p90.toFixed(0)}).`;
}

export function PeakForecastCard() {
  const { status, data } = useSignal<S1Signal>(`${WORKER_URL}/read`, { refreshInterval: REFRESH_HOT });

  if (status === 'loading') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '45%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '40%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '55%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Peak forecast data unavailable</p></article>;
  }

  const swing = data.lt_daily_swing_eur_mwh ?? 0;
  const stats = data.swing_stats_90d;
  const peakHour = data.lt_peak_hour_utc;
  const peakPrice = data.lt_peak_price;
  const troughHour = data.lt_trough_hour_utc;
  const troughPrice = data.lt_trough_price;
  const hasPt = peakHour != null && peakPrice != null && troughHour != null && troughPrice != null;
  const tomorrow = data.da_tomorrow;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        Peak Forecast
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(swing, stats), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {'\u20AC'}{swing.toFixed(0)}/MWh
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
        Today&apos;s DA swing{hasPt ? ` · Peak ${formatHourEET(peakHour!, data.updated_at)} · Trough ${formatHourEET(troughHour!, data.updated_at)}` : ''}
      </p>

      {/* Peak/trough detail */}
      {hasPt && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: 'var(--space-xs)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div>
            <span style={{ color: 'var(--rose)' }}>▲ Peak</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{formatHourEET(peakHour!, data.updated_at)}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>{'\u20AC'}{peakPrice!.toFixed(1)}/MWh</span>
          </div>
          <div>
            <span style={{ color: 'var(--teal)' }}>▼ Trough</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{formatHourEET(troughHour!, data.updated_at)}</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>{'\u20AC'}{troughPrice!.toFixed(1)}/MWh</span>
          </div>
        </div>
      )}

      {/* Tomorrow preview — intraday range (peak−trough) and cross-zone separation are two distinct quantities; show both with correct labels */}
      {tomorrow?.lt_peak != null && tomorrow?.lt_trough != null && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
          {formatTomorrowLine({
            lt_peak: tomorrow.lt_peak,
            lt_trough: tomorrow.lt_trough,
            lt_avg: tomorrow.lt_avg,
            se4_avg: tomorrow.se4_avg,
            spread_pct: tomorrow.spread_pct,
          })}
        </p>
      )}

      {/* vs 90D context */}
      {stats?.p50 != null && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: swing > (stats.p50 ?? 0) ? 'var(--teal)' : 'var(--text-muted)', marginBottom: '6px' }}>
          90D median {'\u20AC'}{stats.p50.toFixed(0)} · P90 {'\u20AC'}{stats.p90?.toFixed(0)}
        </p>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {interpretation(swing, stats)}
      </p>

      <SourceFooter source="Nord Pool via ENTSO-E" updatedAt={formatTimestamp(data.updated_at)} dataClass="observed" />
    </article>
  );
}
