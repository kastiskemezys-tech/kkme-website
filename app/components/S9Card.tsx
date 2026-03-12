'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

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
  if (sig === 'HIGH') return 'High carbon cost is strengthening the case for displacing gas peakers with BESS.';
  if (sig === 'ELEVATED') return 'Above-normal carbon pricing is adding to peaker marginal costs.';
  if (sig === 'LOW') return 'Low carbon price is reducing the emissions premium on gas generation.';
  return 'Carbon price near mid-range — moderate effect on peaker displacement economics.';
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

  useEffect(() => {
    fetch(`${WORKER_URL}/s9/history`)
      .then(r => r.json())
      .then((h: Array<{ eua_eur_t: number }>) => setHistory(h.map(e => e.eua_eur_t)))
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Loading carbon data...</p></article>;
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Carbon data unavailable</p></article>;
  }

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '6px' }}>
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

      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
        {carbonInterpretation(data.signal, data.eua_eur_t)}
      </p>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '12px' }}>
        {carbonImpact(data.signal, data.eua_eur_t)}
      </div>

      <SourceFooter source="energy-charts.info" updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined} dataClass="observed" />

      <div style={{ marginTop: '12px' }}>
        <DetailsDrawer label="View carbon detail">
          {history.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Recent trend</p>
              <Sparkline values={history} color="#c084fc" width={200} height={40} />
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
