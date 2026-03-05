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

function getNarrativeText(phase: string | null | undefined): string {
  if (phase === 'SCARCITY') return 'Window open — pipeline saturation accelerates from 2027. Early movers capture full stack.';
  if (phase === 'COMPRESS') return 'Market compressing — revenue assumptions require revalidation against current fleet data.';
  if (phase === 'MATURE')   return 'Market maturing — differentiated assets and grid proximity determine outperformance.';
  return 'Nine signals. Four-hour updates. One market thesis.';
}

function getNextUpdate(): number {
  const now = new Date();
  const hours = now.getUTCHours();
  const nextSlot = (Math.floor(hours / 4) + 1) * 4;
  const next = new Date(now);
  if (nextSlot >= 24) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
  } else {
    next.setUTCHours(nextSlot, 0, 0, 0);
  }
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function MarketSnapshot() {
  const [s1, setS1] = useState<Record<string, unknown>>({});
  const [s2, setS2] = useState<Record<string, unknown>>({});
  const [s4, setS4] = useState<Record<string, unknown>>({});
  const [timeToUpdate, setTimeToUpdate] = useState<number>(0);
  const [visitDelta, setVisitDelta] = useState<{ sd: number; capture: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/read`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s4`).then(r => r.json()).catch(() => ({})),
    ]).then(([d1, d2, d4]) => { setS1(d1); setS2(d2); setS4(d4); });
  }, []);

  // Countdown timer
  useEffect(() => {
    setTimeToUpdate(getNextUpdate());
    const id = setInterval(() => setTimeToUpdate(getNextUpdate()), 60000);
    return () => clearInterval(id);
  }, []);

  const bess = s1?.bess_net_capture as number | null | undefined;
  const afrr = s2?.afrr_up_avg as number | null | undefined;
  const sd   = s2?.sd_ratio as number | null | undefined;
  const phase = s2?.phase as string | null | undefined;
  const freeMw = s4?.free_mw as number | null | undefined;
  const opMw  = s2?.baltic_operational_mw as number | null | undefined;
  const pipeMw = s2?.baltic_pipeline_mw as number | null | undefined;

  // Visit delta from localStorage
  useEffect(() => {
    if (sd == null && bess == null) return;
    const key = 'kkme_last_visit';
    const now = Date.now();
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const prev = JSON.parse(stored) as { sd: number; capture: number; ts: number };
        const ageH = (now - prev.ts) / 3600000;
        if (ageH > 1 && sd != null && bess != null) {
          setVisitDelta({ sd: sd - prev.sd, capture: bess - prev.capture });
        }
      }
      localStorage.setItem(key, JSON.stringify({ sd: sd ?? 0, capture: bess ?? 0, ts: now }));
    } catch {}
  }, [sd, bess]);

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
        flexWrap: 'wrap',
      }}>
        <span style={{
          display: 'inline-block',
          width: '6px', height: '6px',
          borderRadius: '50%',
          background: 'var(--teal)',
          animation: 'pulse 2s ease-in-out infinite',
          flexShrink: 0,
        }} />
        MARKET STATE: BUILDABLE
        {visitDelta && (Math.abs(visitDelta.sd) > 0.01 || Math.abs(visitDelta.capture) > 5) && (
          <span style={{ color: 'rgba(232,226,217,0.35)', marginLeft: '6px' }}>
            · S/D {visitDelta.sd >= 0 ? '+' : ''}{visitDelta.sd.toFixed(2)} since last visit
          </span>
        )}
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
              fontSize: '1.125rem',
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

      {/* Narrative tension */}
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: '0.9375rem',
        fontStyle: 'italic',
        color: 'rgba(232,226,217,0.55)',
        lineHeight: 1.6,
        marginBottom: '4px',
        marginTop: '12px',
      }}>
        {getNarrativeText(phase)}
      </p>

      {/* Countdown to next update */}
      {timeToUpdate > 0 && (
        <p style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: '0.5625rem',
          color: 'rgba(232,226,217,0.22)',
          letterSpacing: '0.08em',
        }}>
          Next update in {formatCountdown(timeToUpdate)}
        </p>
      )}
    </div>
  );
}
