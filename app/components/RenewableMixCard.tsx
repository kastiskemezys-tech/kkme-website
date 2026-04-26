'use client';

import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import { SourceFooter } from '@/app/components/primitives';
import { computeRenewableMix, solarAnomalyFootnote } from '@/app/lib/renewableShare';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface GenSignal {
  baltic_mw?: number | null;
  avg_7d_mw?: number | null;
  timestamp?: string | null;
}

function dotColor(pct: number): string {
  if (pct > 40) return 'var(--green)';
  if (pct >= 20) return 'var(--amber)';
  return 'var(--text-muted)';
}

function interpretation(pct: number): string {
  if (pct > 50) return 'High renewable penetration — midday surplus likely, charging window open';
  if (pct > 30) return 'Moderate mix — spread capture depends on evening demand ramp';
  return 'Thermal-dominated — flat profile, narrow BESS spreads expected';
}

export function RenewableMixCard() {
  const { status: wStatus, data: wind } = useSignal<GenSignal>(`${WORKER_URL}/s_wind`, { refreshInterval: REFRESH_WARM });
  const { status: sStatus, data: solar } = useSignal<GenSignal>(`${WORKER_URL}/s_solar`, { refreshInterval: REFRESH_WARM });
  const { status: lStatus, data: load } = useSignal<GenSignal>(`${WORKER_URL}/s_load`, { refreshInterval: REFRESH_WARM });

  const loading = wStatus === 'loading' || sStatus === 'loading' || lStatus === 'loading';
  const error = (wStatus === 'error' || sStatus === 'error' || lStatus === 'error') && !wind && !solar && !load;

  if (loading) {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '50%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '35%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '60%' }} />
      </article>
    );
  }
  if (error) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Renewable mix data unavailable</p></article>;
  }

  const windMw = wind?.baltic_mw ?? 0;
  const solarMw = solar?.baltic_mw ?? 0;
  const totalLoad = load?.baltic_mw ?? 1;
  const windAvg = wind?.avg_7d_mw ?? 0;
  const solarAvg = solar?.avg_7d_mw ?? 0;
  const loadAvg = load?.avg_7d_mw ?? 1;

  const mix = computeRenewableMix({
    windMw, solarMw, loadMw: totalLoad,
    windAvg7dMw: windAvg, solarAvg7dMw: solarAvg, loadAvg7dMw: loadAvg,
  });
  const { windPct, solarPct, thermalPct, renewableMw, renewablePct, thermalMw } = mix;
  const solarFootnote = solarAnomalyFootnote(mix, solarMw, solarAvg);

  // 7D comparison
  const avgPct = loadAvg > 0 ? ((windAvg + solarAvg) / loadAvg) * 100 : 0;
  const deltaPp = renewablePct - avgPct;

  const ts = wind?.timestamp || solar?.timestamp || load?.timestamp;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Renewable Mix
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(renewablePct), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {renewablePct.toFixed(0)}%
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>
        {Math.round(renewableMw).toLocaleString()} MW of {Math.round(totalLoad).toLocaleString()} MW load
      </p>

      {/* Stacked bar */}
      <div style={{ width: '100%', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginBottom: '4px' }}>
        <div style={{ flex: windPct, background: 'var(--teal)', transition: 'flex 0.3s ease' }} />
        <div style={{ flex: solarPct, background: 'var(--amber)', transition: 'flex 0.3s ease' }} />
        <div style={{ flex: thermalPct, background: 'var(--text-ghost)', transition: 'flex 0.3s ease' }} />
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-muted)', marginBottom: solarFootnote ? '4px' : '8px' }}>
        Wind {windPct.toFixed(0)}% · Solar {solarPct.toFixed(0)}% · Thermal {thermalPct.toFixed(0)}%
      </p>
      {solarFootnote && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--amber)', marginBottom: '8px', lineHeight: 1.5 }}>
          {solarFootnote}
        </p>
      )}

      {/* vs 7D */}
      {loadAvg > 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: deltaPp >= 0 ? 'var(--teal)' : 'var(--rose)', marginBottom: '6px' }}>
          {deltaPp >= 0 ? '↑' : '↓'} {Math.abs(deltaPp).toFixed(0)}pp vs 7D avg
        </p>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '4px 0 8px' }}>
        {interpretation(renewablePct)}
      </p>

      <SourceFooter source="ENTSO-E" updatedAt={ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined} dataClass="observed" />
    </article>
  );
}
