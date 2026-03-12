'use client';

import { useEffect, useState } from 'react';
import { signalColor, type SignalState } from '@/lib/signalColor';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface StripItem {
  label: string;
  value: string;
  state: SignalState;
}

const SECTION_MAP: Record<string, string> = {
  'BESS Capture': 'revenue-drivers',
  'aFRR': 'revenue-drivers',
  'S/D Ratio': 'revenue-drivers',
  'Grid Free': 'build',
};

export function StatusStrip() {
  const [items, setItems] = useState<StripItem[]>([
    { label: 'BESS Capture',   value: '—', state: 'neutral' },
    { label: 'aFRR',          value: '—', state: 'neutral' },
    { label: 'S/D Ratio',     value: '—', state: 'neutral' },
    { label: 'Grid Free',     value: '—', state: 'neutral' },
  ]);

  useEffect(() => {
    Promise.all([
      fetch(`${WORKER_URL}/read`).then(r => r.json()).catch(() => null),
      fetch(`${WORKER_URL}/s2`).then(r => r.json()).catch(() => null),
      fetch(`${WORKER_URL}/s4`).then(r => r.json()).catch(() => null),
    ]).then(([d1, d2, d4]) => {
      const bess   = d1?.bess_net_capture;
      const afrr   = d2?.afrr_up_avg;
      const free   = d4?.free_mw;
      const sdRatio = d2?.sd_ratio;
      const phase   = d2?.phase;

      setItems([
        {
          label: 'BESS Capture',
          value: bess != null ? `${bess.toFixed(1)} €/MWh` : '—',
          state: bess != null ? (bess > 100 ? 'positive' : bess > 40 ? 'warning' : 'neutral') : 'neutral',
        },
        {
          label: 'aFRR',
          value: afrr != null ? `${afrr.toFixed(0)} €/MW/h` : '—',
          state: afrr != null ? (afrr > 40 ? 'positive' : afrr > 10 ? 'neutral' : 'warning') : 'neutral',
        },
        {
          label: 'S/D Ratio',
          value: sdRatio != null ? `${sdRatio.toFixed(2)}× ${phase ?? ''}`.trim() : '—',
          state: phase === 'SCARCITY' ? 'positive' : phase === 'COMPRESS' ? 'warning' : 'neutral',
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
    <div className="status-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px', width: '100%' }}>
      {items.map(({ label, value, state }) => (
        <button
          type="button"
          key={label}
          onClick={() => document.getElementById(SECTION_MAP[label])?.scrollIntoView({ behavior: 'smooth' })}
          style={{
            all: 'unset',
            padding: '8px 10px',
            border: '1px solid var(--border-card)',
            background: 'var(--bg-card)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.58rem',
            color: 'var(--text-tertiary)',
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
        </button>
      ))}
    </div>
  );
}
