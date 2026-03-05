'use client';
import { useState, useEffect } from 'react';

const BASE = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

const SECTION_MAP: Record<string, string> = {
  'BESS CAPTURE': 'signals',
  'S/D RATIO':    'signals',
  'aFRR PRICE':   'signals',
  'GRID FREE':    'build',
  'FLEET OP':     'signals',
};

function phaseColor(phase: string | null | undefined): string {
  if (phase === 'SCARCITY') return 'rgba(74,222,128,0.90)';
  if (phase === 'COMPRESS') return 'rgba(212,160,60,0.88)';
  if (phase === 'MATURE')   return 'rgba(232,226,217,0.50)';
  return 'rgba(232,226,217,0.45)';
}

export default function MarketSnapshot() {
  const [s1, setS1] = useState<Record<string, unknown>>({});
  const [s2, setS2] = useState<Record<string, unknown>>({});
  const [s4, setS4] = useState<Record<string, unknown>>({});

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/read`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s4`).then(r => r.json()).catch(() => ({})),
    ]).then(([d1, d2, d4]) => { setS1(d1); setS2(d2); setS4(d4); });
  }, []);

  const bess = s1?.bess_net_capture as number | null | undefined;
  const afrr = s2?.afrr_up_avg as number | null | undefined;
  const sd   = s2?.sd_ratio as number | null | undefined;
  const phase = s2?.phase as string | null | undefined;
  const freeMw = s4?.free_mw as number | null | undefined;
  const opMw  = s2?.baltic_operational_mw as number | null | undefined;
  const pipeMw = s2?.baltic_pipeline_mw as number | null | undefined;

  const cells = [
    {
      label: 'BESS CAPTURE',
      value: bess != null ? `${bess.toFixed(0)} €/MWh` : '—',
      sub: bess != null ? (bess > 100 ? '↑ strong' : bess > 40 ? '→ moderate' : '↓ weak') : '',
      color: bess != null ? (bess > 100 ? 'rgba(74,222,128,0.9)' : bess > 40 ? 'rgba(245,158,11,0.85)' : 'rgba(232,226,217,0.5)') : 'rgba(232,226,217,0.5)',
    },
    {
      label: 'S/D RATIO',
      value: sd != null ? `${sd.toFixed(2)}×` : '—',
      sub: phase || '',
      color: phaseColor(phase),
    },
    {
      label: 'aFRR PRICE',
      value: afrr != null ? `${Math.round(afrr)} €/MW/h` : '—',
      sub: afrr != null ? (afrr > 40 ? '↑ above target' : afrr > 20 ? '→ near target' : '↓ below target') : '',
      color: afrr != null ? (afrr > 40 ? 'rgba(74,222,128,0.9)' : afrr > 20 ? 'rgba(245,158,11,0.85)' : 'rgba(232,226,217,0.5)') : 'rgba(232,226,217,0.5)',
    },
    {
      label: 'GRID FREE',
      value: freeMw != null ? `${(freeMw / 1000).toFixed(1)} GW` : '—',
      sub: freeMw != null ? (freeMw > 2000 ? '↑ open' : freeMw > 500 ? '→ tightening' : '↓ scarce') : '',
      color: freeMw != null ? (freeMw > 2000 ? 'rgba(74,222,128,0.9)' : freeMw > 500 ? 'rgba(245,158,11,0.85)' : 'rgba(239,68,68,0.8)') : 'rgba(232,226,217,0.5)',
    },
    {
      label: 'FLEET OP',
      value: opMw != null ? `${opMw} MW` : '—',
      sub: pipeMw != null ? `+${pipeMw} MW pipeline` : '',
      color: 'rgba(232,226,217,0.7)',
    },
  ];

  return (
    <div>
      <div style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: '0.5625rem',
        color: 'var(--teal)',
        letterSpacing: '0.10em',
        marginBottom: '8px',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{
          display: 'inline-block',
          width: '6px', height: '6px',
          borderRadius: '50%',
          background: 'var(--teal)',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        MARKET STATE: BUILDABLE
      </div>
      <div className="market-snapshot">
        {cells.map(c => (
          <div
            key={c.label}
            className="market-snapshot-cell"
            onClick={() => document.getElementById(SECTION_MAP[c.label] || 'signals')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ cursor: 'pointer' }}
          >
            <span style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: '0.5625rem',
              color: 'rgba(232,226,217,0.25)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}>{c.label}</span>
            <span style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: '1rem',
              fontWeight: 500,
              color: c.color,
              lineHeight: 1.2,
            }}>{c.value}</span>
            <span style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: '0.5625rem',
              color: 'rgba(232,226,217,0.35)',
            }}>{c.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
