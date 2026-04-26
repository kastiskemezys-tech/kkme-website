'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
import { SourceFooter } from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import { CAPTURE_LABELS, vsCanonicalFootnote } from '@/app/lib/captureDefinitions';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S1Signal {
  spread_eur_mwh?: number | null;
  p_high_avg?: number | null;
  p_low_avg?: number | null;
  bess_net_capture?: number | null;
  intraday_capture?: number | null;
  hourly_lt?: number[] | null;
  updated_at?: string | null;
}

interface HistoryEntry {
  date: string;
  lt_swing: number | null;
  spread_eur: number | null;
}

function dotColor(capture: number): string {
  if (capture > 150) return 'var(--green)';
  if (capture >= 80) return 'var(--amber)';
  return 'var(--rose)';
}

function interpretation(capture: number): string {
  if (capture > 200) return 'Wide envelope — supports 2+ profitable cycles before RTE losses';
  if (capture > 100) return 'Moderate envelope — single-cycle viable at current stack';
  if (capture < 50) return 'Thin envelope — hold or flex to ancillary services';
  return 'Normal envelope — see Signals · S1 for cycle-normalised capture';
}

export function SpreadCaptureCard() {
  const { status, data } = useSignal<S1Signal>(`${WORKER_URL}/read`, { refreshInterval: REFRESH_HOT });
  const [history, setHistory] = useState<number[]>([]);
  // Canonical DA capture (gross_4h) for the vs-canonical footnote — never derive it locally
  const [canonicalGross4h, setCanonicalGross4h] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${WORKER_URL}/s1/history`)
      .then(r => r.json())
      .then((h: HistoryEntry[]) => {
        const vals = h.slice(-14).map(e => e.lt_swing).filter((v): v is number => v != null && isFinite(v));
        setHistory(vals);
      })
      .catch(() => {});
    fetch(`${WORKER_URL}/s1/capture`)
      .then(r => r.json())
      .then((c: { gross_4h?: number | null }) => {
        if (c?.gross_4h != null) setCanonicalGross4h(c.gross_4h);
      })
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '45%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '35%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '55%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Spread capture data unavailable</p></article>;
  }

  const capture = data.bess_net_capture ?? 0;
  const pHigh = data.p_high_avg ?? 0;
  const pLow = data.p_low_avg ?? 0;
  const crossBorder = data.spread_eur_mwh ?? 0;
  const hourly = data.hourly_lt;
  // Use last 24 hours for today's curve
  const todayCurve = hourly && hourly.length >= 24 ? hourly.slice(-24) : (hourly ?? []);

  const label = CAPTURE_LABELS.da_peak_trough_range;
  const canonicalNote = vsCanonicalFootnote('da_peak_trough_range', canonicalGross4h);

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {label.short}
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(capture), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {'\u20AC'}{capture}/MWh
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label.detail} · Buy {'\u20AC'}{pLow.toFixed(0)} · Sell {'\u20AC'}{pHigh.toFixed(0)}
      </p>
      {canonicalNote && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)', marginBottom: '8px', lineHeight: 1.4 }}>
          {canonicalNote}
        </p>
      )}

      {/* Today's price curve */}
      {todayCurve.length >= 2 && (
        <div style={{ marginBottom: '6px' }}>
          <Sparkline values={todayCurve} color="var(--teal)" height={32} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)', marginTop: '2px' }}>
            Today&apos;s LT price curve (24h)
          </p>
        </div>
      )}

      {/* Cross-border spread */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
        Cross-border: {crossBorder >= 0 ? '+' : ''}{'\u20AC'}{crossBorder.toFixed(1)}/MWh LT–SE4
      </p>

      {/* 14D swing history sparkline */}
      {history.length >= 2 && (
        <div style={{ marginBottom: '6px' }}>
          <Sparkline values={history} color="var(--amber)" height={20} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)', marginTop: '2px' }}>
            14D daily swing
          </p>
        </div>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '4px 0 8px' }}>
        {interpretation(capture)}
      </p>

      <SourceFooter source="Nord Pool" updatedAt={formatTimestamp(data.updated_at)} dataClass="observed" />
    </article>
  );
}
