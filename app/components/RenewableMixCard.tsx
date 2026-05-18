'use client';

import { useSignal } from '@/lib/useSignal';
import { REFRESH_WARM } from '@/lib/refresh-cadence';
import { SourceFooter, DetailsDrawer } from '@/app/components/primitives';
import { computeRenewableMix, solarAnomalyFootnote } from '@/app/lib/renewableShare';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface GenSignal {
  baltic_mw?: number | null;
  avg_7d_mw?: number | null;
  timestamp?: string | null;
}

function dotColor(pct: number): string {
  if (pct > 40) return 'var(--green)';
  if (pct >= 20) return 'var(--amber-accent-text)';
  return 'var(--text-muted)';
}

function interpretation(
  renewablePct: number,
  renewableMw: number,
  totalLoad: number,
  thermalMw: number,
  thermalPct: number,
): string {
  if (renewableMw > totalLoad) {
    const exportMw = Math.round(renewableMw - totalLoad);
    return `Renewables ${renewablePct.toFixed(0)}% of ${Math.round(totalLoad).toLocaleString()} MW load (${Math.round(renewableMw).toLocaleString()} MW) — exceed demand by ${exportMw.toLocaleString()} MW (net export window).`;
  }
  return `Renewables ${renewablePct.toFixed(0)}% of ${Math.round(totalLoad).toLocaleString()} MW load (${Math.round(renewableMw).toLocaleString()} MW); thermal residual ${Math.round(thermalMw).toLocaleString()} MW (${thermalPct.toFixed(0)}%).`;
}

export function RenewableMixCard() {
  const { status: wStatus, data: wind } = useSignal<GenSignal>(`${WORKER_URL}/s_wind`, { refreshInterval: REFRESH_WARM });
  const { status: sStatus, data: solar } = useSignal<GenSignal>(`${WORKER_URL}/s_solar`, { refreshInterval: REFRESH_WARM });
  const { status: lStatus, data: load } = useSignal<GenSignal>(`${WORKER_URL}/s_load`, { refreshInterval: REFRESH_WARM });

  const loading = wStatus === 'loading' || sStatus === 'loading' || lStatus === 'loading';
  const error = (wStatus === 'error' || sStatus === 'error' || lStatus === 'error') && !wind && !solar && !load;

  if (loading) {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '50%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '35%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '60%' }} />
      </article>
    );
  }
  if (error) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Renewable mix data unavailable</p></article>;
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
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        Renewable Mix
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(renewablePct), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {renewablePct.toFixed(0)}%
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>
        {Math.round(renewableMw).toLocaleString()} MW of {Math.round(totalLoad).toLocaleString()} MW load
      </p>

      {/* Stacked bar */}
      <div
        role="img"
        aria-label={`Generation mix stacked bar — wind ${windPct.toFixed(0)}%, solar ${solarPct.toFixed(0)}%, thermal ${thermalPct.toFixed(0)}%`}
        style={{ width: '100%', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginBottom: 'var(--space-2xs)' }}
      >
        <div style={{ flex: windPct, background: 'var(--teal)', transition: 'flex 0.3s ease' }} />
        <div style={{ flex: solarPct, background: 'var(--amber)', transition: 'flex 0.3s ease' }} />
        <div style={{ flex: thermalPct, background: 'var(--text-ghost)', transition: 'flex 0.3s ease' }} />
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-muted)', marginBottom: solarFootnote ? '4px' : '8px' }}>
        Wind {windPct.toFixed(0)}% · Solar {solarPct.toFixed(0)}% · Thermal {thermalPct.toFixed(0)}%
      </p>
      {solarFootnote && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--amber-accent-text)', marginBottom: 'var(--space-xs)', lineHeight: 1.5 }}>
          {solarFootnote}
        </p>
      )}

      {/* vs 7D */}
      {loadAvg > 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: deltaPp >= 0 ? 'var(--teal-accent-text)' : 'var(--rose)', marginBottom: '6px' }}>
          {deltaPp >= 0 ? '↑' : '↓'} {Math.abs(deltaPp).toFixed(0)}pp vs 7D avg
        </p>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {interpretation(renewablePct, renewableMw, totalLoad, thermalMw, thermalPct)}
      </p>

      <SourceFooter source="ENTSO-E" updatedAt={formatTimestamp(ts)} dataClass="observed" />

      <div style={{ marginTop: 'var(--space-xs)' }}>
        <DetailsDrawer label="View renewable mix detail">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Source</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            ENTSO-E Transparency Platform wind, solar, and load actuals for the Baltic synchronous area (LT + LV + EE). Aggregated by the S1 worker (`/s_wind`, `/s_solar`, `/s_load`), with 7-day rolling averages computed server-side.
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Computation</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            renewable_pct = (wind_mw + solar_mw) / load_mw × 100. Thermal residual = load − wind − solar; wind/solar/thermal shares displayed as a stacked bar. Detail in `app/lib/renewableShare.ts`. The 7-day baseline uses the same ENTSO-E feed averaged over the rolling window; Δpp vs 7D contextualizes today against recent generation mix.
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Limitations</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Actuals only — no forecast. ENTSO-E observed-data lag varies by TSO (typically &lt;1h). Solar anomalies (negative or implausibly large values) surface a footnote; the underlying value still renders. Net-export windows (renewables &gt; load) are reported, but cross-border exports themselves are not decomposed here.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
