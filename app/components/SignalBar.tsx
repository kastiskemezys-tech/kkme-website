'use client';
import { useState, useEffect } from 'react';

const BASE = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const SECTION_MAP: Record<string, string> = {
  'BESS CAPTURE': 'revenue-drivers',
  'S/D RATIO': 'revenue-drivers',
  'aFRR': 'revenue-drivers',
  'GRID FREE': 'build',
  'FLEET OP': 'structural',
  'DISPATCH': 'trading',
};

export default function SignalBar() {
  const [data, setData] = useState<{ s1?: any; s2?: any; s4?: any; trading?: any }>({});

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/read`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s4`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/api/trading/signals`).then(r => r.json()).catch(() => ({})),
    ]).then(([s1, s2, s4, trading]) => setData({ s1, s2, s4, trading }));
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
    {
      label: 'DISPATCH',
      value: data.trading?.totals?.per_mw != null
        ? `€${Math.round(data.trading.totals.per_mw)}/MW` : '—',
    },
  ];

  function scrollTo(label: string) {
    const id = SECTION_MAP[label];
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${signals.length}, 1fr)`,
      gap: '16px',
      padding: '8px 32px',
      borderBottom: '1px solid var(--bg-elevated)',
      background: 'var(--overlay-heavy)',
    }}>
      {signals.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => scrollTo(s.label)}
          style={{
            all: 'unset',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            cursor: 'pointer',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.5625rem',
            color: 'var(--text-ghost)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>{s.label}</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6875rem',
            color: 'var(--text-secondary)',
            transition: 'color 150ms ease',
          }}>{s.value}</span>
        </button>
      ))}
    </div>
  );
}
