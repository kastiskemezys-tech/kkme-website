'use client';
import { useState, useEffect } from 'react';

const BASE = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

export default function SignalBar() {
  const [data, setData] = useState<{ s1?: any; s2?: any; s4?: any }>({});

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/read`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s4`).then(r => r.json()).catch(() => ({})),
    ]).then(([s1, s2, s4]) => setData({ s1, s2, s4 }));
  }, []);

  const signals = [
    {
      label: 'BESS CAPTURE',
      value: data.s1?.bess_net_capture != null
        ? `${data.s1.bess_net_capture.toFixed(0)} €/MWh` : '—',
    },
    {
      label: 'S/D RATIO',
      value: data.s2?.sd_ratio != null
        ? `${data.s2.sd_ratio.toFixed(2)}×` : '—',
    },
    {
      label: 'aFRR',
      value: data.s2?.afrr_up_avg != null
        ? `${Math.round(data.s2.afrr_up_avg)} €/MW/h` : '—',
    },
    {
      label: 'GRID FREE',
      value: data.s4?.free_mw != null
        ? `${(data.s4.free_mw / 1000).toFixed(1)} GW` : '—',
    },
    {
      label: 'FLEET OP',
      value: data.s2?.baltic_operational_mw != null
        ? `${data.s2.baltic_operational_mw} MW` : '—',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${signals.length}, 1fr)`,
      gap: '16px',
      padding: '8px 32px',
      borderBottom: '1px solid rgba(232,226,217,0.04)',
      background: 'rgba(7,7,10,0.95)',
    }}>
      {signals.map(s => (
        <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: '0.5625rem',
            color: 'rgba(232,226,217,0.18)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>{s.label}</span>
          <span style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: '0.6875rem',
            color: 'var(--text-secondary)',
          }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}
