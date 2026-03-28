'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S7Data { ttf_eur_mwh?: number | null; }

interface S9Signal {
  timestamp?:     string | null;
  signal?:        string | null;
  eua_eur_t?:     number | null;
  eua_trend?:     string | null;
  interpretation?: string | null;
  _stale?:        boolean;
  _age_hours?:    number | null;
}

function regimeLabel(sig: string | null | undefined): string {
  if (sig === 'HIGH') return 'High';
  if (sig === 'ELEVATED') return 'Elevated';
  if (sig === 'LOW') return 'Low';
  return 'Normal';
}

function regimeSentiment(sig: string | null | undefined): Sentiment {
  if (sig === 'HIGH') return 'caution';
  if (sig === 'ELEVATED') return 'caution';
  if (sig === 'LOW') return 'positive';
  return 'neutral';
}

function carbonInterpretation(sig: string | null | undefined, price: number | null | undefined): string {
  if (sig === 'HIGH') return 'High carbon — strengthening BESS displacement case.';
  if (sig === 'ELEVATED') return 'Above-normal carbon — adding to peaker costs.';
  if (sig === 'LOW') return 'Low carbon — reducing gas emissions premium.';
  return 'Mid-range carbon — moderate peaker displacement effect.';
}

function carbonImpact(sig: string | null | undefined, price: number | null | undefined): string {
  if (price != null && price >= 55) return 'Reference asset: above BESS displacement breakeven (~55 €/t)';
  if (price != null && price < 55) return 'Reference asset: below BESS displacement breakeven (~55 €/t)';
  if (sig === 'HIGH') return 'Reference asset: supportive for peaker displacement';
  if (sig === 'LOW') return 'Reference asset: reducing displacement premium';
  return 'Reference asset: neutral for carbon floor';
}

export function S9Card() {
  const { status, data } = useSignal<S9Signal>(`${WORKER_URL}/s9`);
  const [history, setHistory] = useState<number[]>([]);
  const [showTip, setShowTip] = useState(false);
  const [ttfPrice, setTtfPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${WORKER_URL}/s9/history`)
      .then(r => r.json())
      .then((h: Array<{ eua_eur_t: number }>) => setHistory(h.map(e => e.eua_eur_t)))
      .catch(() => {});
    // Fetch S7 for combined P_high floor
    fetch(`${WORKER_URL}/s7`)
      .then(r => r.json())
      .then((d: S7Data) => { if (d.ttf_eur_mwh) setTtfPrice(d.ttf_eur_mwh); })
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '40%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '28%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '50%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Carbon data unavailable</p></article>;
  }

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
        EU ETS Carbon
      </h3>

      {data.eua_eur_t != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile label="EUA carbon price" value={data.eua_eur_t.toFixed(1)} unit="€/t" size="hero" dataClass="observed" />
            <StatusChip status={regimeLabel(data.signal)} sentiment={regimeSentiment(data.signal)} />
          </div>
        </div>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '4px 0 8px' }}>
        {carbonInterpretation(data.signal, data.eua_eur_t)}
      </p>

      <div className="tier3-impact" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '8px' }}>
        {carbonImpact(data.signal, data.eua_eur_t)}
      </div>

      {/* Cross-signal: carbon premium on gas generation */}
      {data.eua_eur_t != null && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: '8px',
        }}>
          Carbon premium on gas gen: ~€{Math.round(data.eua_eur_t * 0.45)}/MWh (0.45 tCO₂/MWh)
          {ttfPrice != null && ` · Combined P_high floor: ~€${Math.round(ttfPrice * 1.667 + data.eua_eur_t * 0.45)}/MWh (gas + carbon)`}
        </p>
      )}

      {/* Threshold bar with hover tooltip */}
      {data.eua_eur_t != null && (
        <div style={{ position: 'relative', marginBottom: '8px', cursor: 'default' }}
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}>
          <div style={{
            display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden',
            background: 'var(--bg-elevated)',
          }}>
            <div style={{ flex: 30, background: 'var(--teal-subtle)' }} />
            <div style={{ flex: 25, background: 'var(--amber-subtle)' }} />
            <div style={{ flex: 25, background: 'var(--amber-strong)' }} />
            <div style={{ flex: 20, background: 'var(--rose-strong)' }} />
          </div>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '2px',
            background: 'var(--text-primary)',
            left: `${Math.min(100, Math.max(0, (data.eua_eur_t / 120) * 100))}%`,
            borderRadius: '1px',
          }} />
          {showTip && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%',
              transform: 'translateX(-50%)', marginBottom: 6,
              background: 'var(--bg-page)',
              border: '1px solid var(--border-highlight)',
              padding: '4px 10px', whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-primary)', pointerEvents: 'none',
              zIndex: 10,
            }}>
              {data.eua_eur_t.toFixed(1)} €/t · {regimeLabel(data.signal)}
              {data.eua_eur_t >= 55 ? ' · Above BESS breakeven' : ''}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>0</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>30</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)', position: 'relative' }}>
              55
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50)', fontSize: '0.5rem', color: 'var(--text-ghost)' }}>▲</span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>80</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>120</span>
          </div>
        </div>
      )}

      <SourceFooter source="energy-charts.info" updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined} dataClass="observed" />

      <div style={{ marginTop: '8px' }}>
        <DetailsDrawer label="View carbon detail">
          {history.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Recent trend</p>
              <Sparkline values={history} color="var(--series-carbon)" width={200} height={40} />
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>BESS context</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            BESS peaker displacement breakeven: ~55 €/t. Above this, the carbon premium on gas generation strengthens the BESS arbitrage case.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', marginTop: '16px' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            EU ETS European Allowance price (€/t CO₂). Source: energy-charts.info weekly. Updated every 4h.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: '16px' }}>
            MODEL INPUT → P_high floor (carbon cost)
          </div>
        </DetailsDrawer>
      </div>
    </article>
  );
}
