'use client';

import { useState, useEffect } from 'react';
import { MetricTile, StatusChip, DetailsDrawer } from '@/app/components/primitives';
import type { Sentiment } from '@/app/lib/types';

const BASE = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

function phaseToSentiment(phase: string | null | undefined): Sentiment {
  if (phase === 'SCARCITY') return 'positive';
  if (phase === 'COMPRESS') return 'caution';
  if (phase === 'MATURE') return 'negative';
  return 'neutral';
}

function phaseToLabel(phase: string | null | undefined): string {
  if (phase === 'SCARCITY') return 'Supportive';
  if (phase === 'COMPRESS') return 'Tightening';
  if (phase === 'MATURE') return 'Compressed';
  return 'Loading';
}

function interpretationText(sd: number | null | undefined): string {
  if (sd == null) return 'Waiting for balancing market data.';
  if (sd < 0.5) return 'Battery supply covers less than half of estimated balancing demand. Revenue conditions are strongly supportive.';
  if (sd < 0.7) return 'Competition is growing but has not yet matched demand. Storage revenues are supported, though new fleet is narrowing headroom.';
  if (sd < 0.9) return 'Battery fleet is approaching system demand levels. Returns depend increasingly on timing, duration choice, and market access.';
  return 'Fleet supply is near or above estimated demand. Revenue compression is underway — later entrants face materially weaker economics.';
}

function impactDescription(sd: number | null | undefined): string {
  if (sd == null) return 'Insufficient data for assessment';
  if (sd < 0.5) return 'Reference asset: Strong support across configurations';
  if (sd < 0.7) return 'Reference asset: Supportive, but COD timing increasingly critical';
  if (sd < 0.9) return 'Reference asset: Mixed — duration and market access determine viability';
  return 'Reference asset: Revenue compression risk for new entrants';
}

function formatFreshnessFooter(updatedAt: string | null | undefined): string {
  if (!updatedAt) return 'Public sources · observed + derived';
  try {
    const updated = new Date(updatedAt);
    const hoursAgo = Math.round((Date.now() - updated.getTime()) / 3600000);
    if (hoursAgo < 6) {
      return `Public sources · observed + derived · updated ${hoursAgo}h ago`;
    }
    return `Public sources · observed + derived · last refresh ${hoursAgo}h ago`;
  } catch {
    return 'Public sources · observed + derived';
  }
}

export function HeroMarketNow() {
  const [s1, setS1] = useState<Record<string, unknown>>({});
  const [s2, setS2] = useState<Record<string, unknown>>({});
  const [s4, setS4] = useState<Record<string, unknown>>({});
  const [visitDelta, setVisitDelta] = useState<{ sd: number; capture: number } | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/read`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s2`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE}/s4`).then(r => r.json()).catch(() => ({})),
    ]).then(([d1, d2, d4]) => { setS1(d1); setS2(d2); setS4(d4); });
  }, []);

  const bess = s1?.bess_net_capture as number | null | undefined;
  const afrr = s2?.afrr_up_avg as number | null | undefined;
  const sd = s2?.sd_ratio as number | null | undefined;
  const phase = s2?.phase as string | null | undefined;
  const freeMw = s4?.free_mw as number | null | undefined;
  const opMw = s2?.baltic_operational_mw as number | null | undefined;
  const pipeMw = s2?.baltic_pipeline_mw as number | null | undefined;
  const updatedAt = s2?.updated_at as string | null | undefined;

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
    } catch { /* localStorage unavailable */ }
  }, [sd, bess]);

  return (
    <header className="hero-grid" style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '48px',
      alignItems: 'start',
      padding: '48px 0 32px',
    }}>

      {/* LEFT COLUMN — Value Prop */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          color: 'var(--text-primary)',
          letterSpacing: '0.15em',
          fontWeight: 300,
        }}>KKME</h1>

        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(1.125rem, 2.4vw, 1.375rem)',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          maxWidth: '440px',
        }}>
          What is the Baltic flexibility market doing right now — and what does a 50MW storage asset earn?
        </p>

        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
        }}>
          Nine signals · four-hour updates · ENTSO-E, Litgrid, Baltic TSO data
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <a
            href="#revenue-drivers"
            onClick={(e) => { e.preventDefault(); document.querySelector('#revenue-drivers')?.scrollIntoView({ behavior: 'smooth' }); }}
            style={{
              display: 'inline-block',
              padding: '10px 28px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              letterSpacing: '0.06em',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-card)',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-highlight)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-card)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >See the signals ↓</a>
        </div>
      </div>


      {/* RIGHT COLUMN — Market Now Card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-highlight)',
        padding: '20px',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              onClick={() => setDrawerKey(k => k + 1)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >Market Now</span>
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--teal)',
              animation: 'pulse 2s ease-in-out infinite',
              flexShrink: 0,
            }} />
          </div>
          {phase && <StatusChip status={phaseToLabel(phase)} sentiment={phaseToSentiment(phase)} />}
        </div>

        {/* S/D Ratio hero metric */}
        <div style={{ marginBottom: '12px' }}>
          <MetricTile
            label="Supply / demand balance"
            value={sd != null ? sd.toFixed(2) : '—'}
            unit="×"
            size="hero"
            dataClass="derived"
          />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            marginTop: '4px',
            display: 'block',
          }}>
            Below 1.0× means battery supply has not yet matched system balancing demand
          </span>
          {visitDelta && Math.abs(visitDelta.sd) > 0.01 && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-sm)',
              color: 'var(--text-muted)',
              marginTop: '4px',
              display: 'block',
            }}>
              {visitDelta.sd >= 0 ? '+' : ''}{visitDelta.sd.toFixed(2)} since last visit
            </span>
          )}
        </div>

        {/* 2×2 supporting metrics — values and labels only, sublabels moved to drawer */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '12px',
        }}>
          <MetricTile
            label="Day-ahead arbitrage capture"
            value={bess != null ? bess.toFixed(0) : '—'}
            unit="€/MWh"
            size="standard"
            dataClass="derived"
          />
          <MetricTile
            label="Balancing capacity reference"
            value={afrr != null ? Math.round(afrr).toString() : '—'}
            unit="€/MW/h"
            size="standard"
            dataClass="proxy"
          />
          <MetricTile
            label="Indicative grid capacity"
            value={freeMw != null ? (freeMw / 1000).toFixed(1) : '—'}
            unit="GW"
            size="standard"
            dataClass="observed"
          />
          <MetricTile
            label="Operational BESS fleet"
            value={opMw != null ? opMw.toString() : '—'}
            unit="MW"
            size="standard"
            dataClass="observed"
            sublabel={pipeMw != null ? `+${pipeMw} MW pipeline` : undefined}
          />
        </div>

        {/* Interpretation */}
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          marginBottom: '8px',
        }}>
          {interpretationText(sd)}
        </p>

        {/* Reference asset impact */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--teal-strong)',
          marginBottom: '12px',
        }}>
          {impactDescription(sd)}
        </div>

        {/* Freshness footer — clickable to open drawer */}
        <span
          onClick={() => setDrawerKey(k => k + 1)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'block',
          }}
        >
          {formatFreshnessFooter(updatedAt)}
        </span>

        {/* Details drawer */}
        <div style={{ marginTop: '12px' }}>
          <DetailsDrawer
            key={drawerKey}
            label="View market detail"
            defaultOpen={drawerKey > 0}
          >
            {/* Metric definitions */}
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              Metric definitions
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '6px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              marginBottom: '24px',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>S/D balance</span>
              <span style={{ color: 'var(--text-muted)' }}>Battery fleet supply divided by estimated balancing demand. Below 1.0× = demand exceeds supply.</span>
              <span style={{ color: 'var(--text-muted)' }}>Arbitrage capture</span>
              <span style={{ color: 'var(--text-muted)' }}>Top-4h minus bottom-4h day-ahead spread, net of round-trip efficiency. Derived from ENTSO-E A44.</span>
              <span style={{ color: 'var(--text-muted)' }}>Capacity reference</span>
              <span style={{ color: 'var(--text-muted)' }}>Estimated aFRR capacity price. Baltic-calibrated proxy from AST Latvia data, not observed clearing.</span>
              <span style={{ color: 'var(--text-muted)' }}>Grid capacity</span>
              <span style={{ color: 'var(--text-muted)' }}>Publicly listed available capacity on the Lithuanian transmission grid. Snapshot from Litgrid data.</span>
              <span style={{ color: 'var(--text-muted)' }}>BESS fleet</span>
              <span style={{ color: 'var(--text-muted)' }}>Operational battery storage across the Baltics. Pipeline includes projects with connection agreements or under construction.</span>
            </div>

            {/* Data sources and methodology */}
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              Data sources and methodology
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '6px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              marginBottom: '12px',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>Price data</span>
              <span style={{ color: 'var(--text-muted)' }}>ENTSO-E A44 day-ahead prices (LT, SE4, PL). Updated every 4 hours.</span>
              <span style={{ color: 'var(--text-muted)' }}>Balancing data</span>
              <span style={{ color: 'var(--text-muted)' }}>Baltic TSO balancing market references via BTD. Updated every 4 hours.</span>
              <span style={{ color: 'var(--text-muted)' }}>Grid data</span>
              <span style={{ color: 'var(--text-muted)' }}>Litgrid FeatureServer via VERT.lt ArcGIS. Monthly refresh.</span>
              <span style={{ color: 'var(--text-muted)' }}>Fleet data</span>
              <span style={{ color: 'var(--text-muted)' }}>Aggregated from public TSO connection registers and project announcements.</span>
            </div>
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}>
              S/D ratio uses effective demand of 1,190 MW (1,700 MW total adjusted for 0.70 multi-product stacking). Fleet weighted by status: operational 1.0, construction 0.7, agreement 0.4, application 0.15. &quot;Derived&quot; means computed from observed inputs using documented methodology.
            </p>
          </DetailsDrawer>
        </div>
      </div>
    </header>
  );
}
