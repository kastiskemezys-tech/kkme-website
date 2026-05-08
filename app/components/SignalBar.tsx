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
      value: data.s4?.fleet?.sd_ratio != null
        ? `${data.s4.fleet.sd_ratio.toFixed(2)}×` : '—',
      tooltip: (() => {
        const f = data.s4?.fleet as { baltic_operational_mw?: number; baltic_pipeline_mw?: number; eff_demand_mw?: number; sd_ratio?: number } | undefined;
        if (f?.baltic_operational_mw != null && f?.baltic_pipeline_mw != null && f?.eff_demand_mw != null) {
          return `S/D = (operational + 0.5 × pipeline) / effective demand = (${Math.round(f.baltic_operational_mw)} + 0.5 × ${Math.round(f.baltic_pipeline_mw)}) / ${Math.round(f.eff_demand_mw)} = ${(f.sd_ratio ?? 0).toFixed(2)}×. Pipeline risk-weighted at 50%.`;
        }
        return 'S/D = (operational fleet + 50% pipeline) / effective demand. Pipeline risk-weighted at 50% for permitting / financing risk.';
      })(),
    },
    {
      // Phase 12.11 — match marquee + S2 hero precision (2dp). Header was
      // rounding 7.96 → 8, reading as a different metric from the bottom
      // marquee/S2 hero. Same field, same precision now.
      label: 'aFRR',
      value: data.s2?.afrr_up_avg != null
        ? `${data.s2.afrr_up_avg.toFixed(2)} €/MW/h` : '—',
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
      // Phase 12.11 — inline scope so a same-page reader sees the 822-vs-651
      // composition without needing to hover the tooltip. Mirrors hero block 2.
      scope: 'BESS + pumped hydro',
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
      // Phase 12.11 — header was emitting €/MW without a time qualifier; hero
      // dispatch tile renders €/MW/DAY. Both pull from analysis.totals.per_mw
      // (worker line 8542) which is daily revenue per MW. Unit normalized.
      label: 'DISPATCH',
      value: data.trading?.totals?.per_mw != null
        ? `€${Math.round(data.trading.totals.per_mw)}/MW/DAY` : '—',
    },
  ];

  function scrollTo(label: string) {
    const id = SECTION_MAP[label];
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="kpi-ticker" style={{
      paddingTop: 'var(--space-xs)', paddingRight: 'var(--space-lg)', paddingBottom: 'var(--space-xs)', paddingLeft: 'var(--space-lg)',
      borderBottom: '1px solid var(--bg-elevated)',
      background: 'var(--nav-bg)',
    }}>
      {signals.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => scrollTo(s.label)}
          title={(s as { tooltip?: string }).tooltip}
          className="kpi-tile tap-target-mobile"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
            gap: '2px',
            cursor: 'pointer',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--type-mono-xs)',
            color: 'var(--text-ghost)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            {s.label}
            {(s as { scope?: string }).scope && (
              <span style={{
                marginLeft: 'var(--space-2xs)',
                color: 'var(--text-muted)',
                textTransform: 'none',
                letterSpacing: '0.02em',
                fontSize: 'var(--type-mono-xs)',
              }}>({(s as { scope?: string }).scope})</span>
            )}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--type-label)',
            color: 'var(--text-secondary)',
            transition: 'color 150ms ease',
          }}>{s.value}</span>
        </button>
      ))}
    </div>
  );
}
