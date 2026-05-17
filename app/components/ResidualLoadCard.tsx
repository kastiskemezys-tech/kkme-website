'use client';

import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import { SourceFooter } from '@/app/components/primitives';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface GenSignal {
  baltic_mw?: number | null;
  avg_7d_mw?: number | null;
  lt_mw?: number | null;
  ee_mw?: number | null;
  lv_mw?: number | null;
  timestamp?: string | null;
}

function dotColor(residual: number, avg: number): string {
  if (avg <= 0) return 'var(--text-muted)';
  if (residual < avg * 0.8) return 'var(--green)';
  if (residual > avg * 1.2) return 'var(--rose)';
  return 'var(--amber)';
}

function interpretation(residualMw: number, totalLoad: number): string {
  if (totalLoad <= 0) return 'Demand data unavailable';
  if (residualMw < 0) {
    return `Renewables exceed load by ${Math.abs(Math.round(residualMw)).toLocaleString()} MW (net export window).`;
  }
  const residualPct = (residualMw / totalLoad) * 100;
  return `Thermal + imports cover ${Math.round(residualMw).toLocaleString()} MW (${residualPct.toFixed(0)}% of demand); renewables displace ${Math.round(totalLoad - residualMw).toLocaleString()} MW.`;
}

export function ResidualLoadCard() {
  const { status: wStatus, data: wind } = useSignal<GenSignal>(`${WORKER_URL}/s_wind`, { refreshInterval: REFRESH_WARM });
  const { status: sStatus, data: solar } = useSignal<GenSignal>(`${WORKER_URL}/s_solar`, { refreshInterval: REFRESH_WARM });
  const { status: lStatus, data: load } = useSignal<GenSignal>(`${WORKER_URL}/s_load`, { refreshInterval: REFRESH_WARM });

  const loading = wStatus === 'loading' || sStatus === 'loading' || lStatus === 'loading';
  const error = (wStatus === 'error' || sStatus === 'error' || lStatus === 'error') && !wind && !solar && !load;

  if (loading) {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '45%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '35%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '55%' }} />
      </article>
    );
  }
  if (error) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Residual load data unavailable</p></article>;
  }

  const windMw = wind?.baltic_mw ?? 0;
  const solarMw = solar?.baltic_mw ?? 0;
  const totalLoad = load?.baltic_mw ?? 0;
  const residualMw = totalLoad - windMw - solarMw;
  const residualPct = totalLoad > 0 ? (residualMw / totalLoad) * 100 : 0;

  // 7D comparison
  const residual7d = (load?.avg_7d_mw ?? 0) - (wind?.avg_7d_mw ?? 0) - (solar?.avg_7d_mw ?? 0);
  const deltaMw = residualMw - residual7d;

  // Per-country residuals
  const ltRes = (load?.lt_mw ?? 0) - (wind?.lt_mw ?? 0) - (solar?.lt_mw ?? 0);
  const lvRes = (load?.lv_mw ?? 0) - (wind?.lv_mw ?? 0) - (solar?.lv_mw ?? 0);
  const eeRes = (load?.ee_mw ?? 0) - (wind?.ee_mw ?? 0) - (solar?.ee_mw ?? 0);

  const ts = load?.timestamp || wind?.timestamp || solar?.timestamp;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        Residual Load
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(residualMw, residual7d), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {Math.round(residualMw).toLocaleString()} MW
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
        {residualPct.toFixed(0)}% of total load
      </p>

      {/* Per-country */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2xs)', fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', marginBottom: 'var(--space-xs)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>LT </span>
          <span style={{ color: 'var(--text-secondary)' }}>{Math.round(ltRes)} MW</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>LV </span>
          <span style={{ color: 'var(--text-secondary)' }}>{Math.round(lvRes)} MW</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>EE </span>
          <span style={{ color: 'var(--text-secondary)' }}>{Math.round(eeRes)} MW</span>
        </div>
      </div>

      {/* vs 7D */}
      {residual7d > 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: deltaMw > 0 ? 'var(--rose)' : 'var(--teal)', marginBottom: '6px' }}>
          {deltaMw > 0 ? '↑' : '↓'} {Math.abs(Math.round(deltaMw)).toLocaleString()} MW vs 7D avg
        </p>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {interpretation(residualMw, totalLoad)}
      </p>

      <SourceFooter source="ENTSO-E" updatedAt={formatTimestamp(ts)} dataClass="observed" />
    </article>
  );
}
