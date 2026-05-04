'use client';
import { useState, useEffect } from 'react';
import { flexibilityFleetMw } from '@/app/lib/fleet';

interface S4FleetExtras {
  baltic_operational_mw?: number | null;
  baltic_operational_mw_strict?: number | null;
  baltic_quarantined_mw?: number | null;
}
interface S4ForSignalBar {
  fleet?: S4FleetExtras | null;
  baltic_total?: { installed_mw?: number | null } | null;
}

const BASE = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const SECTION_MAP: Record<string, string> = {
  'BESS CAPTURE': 'revenue-drivers',
  'S/D RATIO': 'revenue-drivers',
  'aFRR': 'revenue-drivers',
  'GRID FREE': 'build',
  'FLEX FLEET': 'structural',
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
      // Flex fleet = BESS + pumped hydro (Kruonis), live from /s4.fleet.
      // Was reading /s2.baltic_operational_mw which is always null on /s2.
      label: 'FLEX FLEET',
      value: (() => {
        const v = flexibilityFleetMw(data.s4);
        return v != null ? `${Math.round(v)} MW` : '—';
      })(),
      // Phase 12.10 — composition disclosure on hover. Audit #5 flagged
      // "Baltic Fleet 822 MW" as ambiguous because it sums BESS + pumped
      // hydro; readers thought 822 MW was BESS-only.
      tooltip: (() => {
        const s4 = data.s4 as S4ForSignalBar | undefined;
        const flex = s4?.fleet?.baltic_operational_mw;
        const strict = s4?.fleet?.baltic_operational_mw_strict;
        const quar = s4?.fleet?.baltic_quarantined_mw;
        const bess = s4?.baltic_total?.installed_mw;
        const parts = [
          'Baltic flexibility fleet · BESS + pumped hydro (Kruonis 205 MW).',
          flex != null ? `Inclusive total: ${Math.round(flex)} MW.` : null,
          strict != null ? `Strict verified (excludes _quarantine): ${Math.round(strict)} MW.` : null,
          quar != null && quar > 0 ? `${Math.round(quar)} MW awaiting TSO confirmation.` : null,
          bess != null ? `BESS-only registry: ${Math.round(bess)} MW (separate from flex fleet).` : null,
        ].filter(Boolean);
        return parts.join(' ');
      })(),
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
      background: 'var(--nav-bg)',
    }}>
      {signals.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => scrollTo(s.label)}
          title={(s as { tooltip?: string }).tooltip}
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
