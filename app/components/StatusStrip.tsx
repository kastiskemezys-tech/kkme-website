'use client';

import { useEffect, useState } from 'react';
import { signalColor, regimeToState, type SignalState } from '@/lib/signalColor';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface StripItem {
  label: string;
  value: string;
  state: SignalState;
}

export function StatusStrip() {
  const [items, setItems] = useState<StripItem[]>([
    { label: 'LT↔SE4 Spread', value: '—', state: 'neutral' },
    { label: 'aFRR',          value: '—', state: 'neutral' },
    { label: 'TTF Gas',       value: '—', state: 'neutral' },
    { label: 'Grid Free',     value: '—', state: 'neutral' },
  ]);

  useEffect(() => {
    Promise.all([
      fetch(`${WORKER_URL}/read`).then(r => r.json()).catch(() => null),
      fetch(`${WORKER_URL}/s2`).then(r => r.json()).catch(() => null),
      fetch(`${WORKER_URL}/s7`).then(r => r.json()).catch(() => null),
      fetch(`${WORKER_URL}/s4`).then(r => r.json()).catch(() => null),
    ]).then(([d1, d2, d7, d4]) => {
      const spread = d1?.spread_eur_mwh;
      const afrr   = d2?.afrr_up_avg;
      const ttf    = d7?.ttf_eur_mwh;
      const free   = d4?.free_mw;

      setItems([
        {
          label: 'LT↔SE4 Spread',
          value: spread != null ? `${spread >= 0 ? '+' : ''}${spread.toFixed(1)} €/MWh` : '—',
          state: spread != null ? (spread > 20 ? 'positive' : spread > 5 ? 'warning' : 'neutral') : 'neutral',
        },
        {
          label: 'aFRR',
          value: afrr != null ? `${afrr.toFixed(0)} €/MW/h` : '—',
          state: afrr != null ? (afrr > 40 ? 'positive' : afrr > 10 ? 'neutral' : 'warning') : 'neutral',
        },
        {
          label: 'TTF Gas',
          value: ttf != null ? `${ttf.toFixed(1)} €/MWh` : '—',
          state: regimeToState(d7?.signal),
        },
        {
          label: 'Grid Free',
          value: free != null ? `${(free / 1000).toFixed(1)} GW` : '—',
          state: free != null ? (free > 2000 ? 'positive' : free > 500 ? 'warning' : 'negative') : 'neutral',
        },
      ]);
    });
  }, []);

  return (
    <div className="status-strip" style={{ display: 'flex', gap: '1px', marginBottom: '32px', maxWidth: '440px', width: '100%' }}>
      {items.map(({ label, value, state }) => (
        <div
          key={label}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid rgba(232,226,217,0.08)',
            background: 'rgba(232,226,217,0.02)',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.58rem',
            color: 'rgba(232,226,217,0.40)',
            letterSpacing: '0.06em',
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            {label}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: signalColor(state),
            fontWeight: 500,
          }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
