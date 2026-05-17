'use client';

import { useSignal } from '@/lib/useSignal';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
import { SourceFooter, DetailsDrawer } from '@/app/components/primitives';
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
  if (status === 'error' || !data || !data.updated_at) {
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

      {/* 90D distribution marker bar (P25 / P50 / P90 ticks + today cursor) */}
      {stats?.p25 != null && stats?.p50 != null && stats?.p90 != null && (() => {
        const p25 = stats.p25!;
        const p50 = stats.p50!;
        const p90 = stats.p90!;
        const scaleMin = p25 * 0.7;
        const scaleMax = p90 * 1.15;
        const span = scaleMax - scaleMin;
        const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - scaleMin) / span) * 100))}%`;
        return (
          <div
            role="img"
            aria-label={`Today's swing €${swing.toFixed(0)}/MWh vs 90-day P25 €${p25.toFixed(0)}, P50 €${p50.toFixed(0)}, P90 €${p90.toFixed(0)}`}
            style={{ marginBottom: '6px' }}
          >
            <div style={{ position: 'relative', height: '28px' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '11px', height: '6px', borderRadius: '3px', background: 'var(--bg-elevated)' }} />
              <div style={{ position: 'absolute', left: pos(p25), top: '8px', width: '1px', height: '12px', background: 'var(--text-muted)' }} />
              <div style={{ position: 'absolute', left: pos(p50), top: '6px', width: '1.5px', height: '16px', background: 'var(--mint)' }} />
              <div style={{ position: 'absolute', left: pos(p90), top: '8px', width: '1px', height: '12px', background: 'var(--text-muted)' }} />
              <div style={{ position: 'absolute', left: pos(swing), top: '4px', width: '2px', height: '20px', background: 'var(--text-primary)', borderRadius: '1px' }} />
            </div>
            <div style={{ position: 'relative', height: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>
              <span style={{ position: 'absolute', left: pos(p25), transform: 'translateX(-50%)' }}>P25 {'€'}{p25.toFixed(0)}</span>
              <span style={{ position: 'absolute', left: pos(p50), transform: 'translateX(-50%)' }}>P50 {'€'}{p50.toFixed(0)}</span>
              <span style={{ position: 'absolute', left: pos(p90), transform: 'translateX(-50%)' }}>P90 {'€'}{p90.toFixed(0)}</span>
            </div>
          </div>
        );
      })()}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {interpretation(swing, stats)}
      </p>

      <SourceFooter source="Nord Pool via ENTSO-E" updatedAt={formatTimestamp(data.updated_at)} dataClass="observed" />

      <div style={{ marginTop: 'var(--space-xs)' }}>
        <DetailsDrawer label="View peak forecast detail">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Source</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Nord Pool day-ahead hourly prices for the LT zone, ingested via ENTSO-E. Tomorrow&apos;s DA is published around 12:45 EET and surfaced once available; SE4 cross-zone reference uses the same feed.
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Computation</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            daily_swing = lt_peak_price − lt_trough_price across the 24h DA schedule. Peak/trough hours are reported in EET (Europe/Vilnius). The 90D distribution (P25/P50/P75/P90) is computed by the worker on a rolling window and used as the marker-bar reference; today&apos;s cursor shows where the current swing falls in that distribution.
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Limitations</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Day-ahead only — no intraday or imbalance pricing. Cross-zone separation (LT vs SE4) is a structural reference, not a tradable arbitrage signal. The 90D window can lag genuine regime shifts by 1–2 weeks at its tail.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
