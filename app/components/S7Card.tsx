'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_COOL } from '@/lib/refresh-cadence';
import {
  SourceFooter, DetailsDrawer,
  ChartTooltip, useChartTooltipState,
} from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S7Signal {
  timestamp?:    string | null;
  signal?:       string | null;
  regime?:       string | null;
  bess_impact?:  string | null;
  ttf_eur_mwh?:  number | null;
  ttf_trend?:    string | null;
  _stale?:       boolean;
  _age_hours?:   number | null;
}

const GAS_THRESHOLD = 50; // €/MWh — BESS-arbitrage reference (worker HIGH boundary)
const CCGT_HEAT_RATE = 1.667; // ~60% CCGT efficiency → €/MWh_e per €/MWh_th

// Quantitative threshold reference (used in interpretation prose).
function regimeLabel(price: number | null | undefined): string {
  if (price == null) return '—';
  return `${(price / GAS_THRESHOLD).toFixed(2)}× / ${GAS_THRESHOLD} €/MWh threshold`;
}

// Header dot color: data-derived from the price vs threshold ratio.
function dotColor(price: number | null | undefined): string {
  if (price == null) return 'var(--text-muted)';
  const ratio = price / GAS_THRESHOLD;
  if (ratio >= 1)   return 'var(--amber-accent-text)';   // at or above arbitrage-support threshold
  if (ratio < 0.3)  return 'var(--green)';   // peaker margin compressed
  return 'var(--text-muted)';
}

// Data-derived interpretation: ratio vs threshold + computed peaker marginal cost.
function gasInterpretation(price: number | null | undefined): string {
  if (price == null) return '—';
  const ratio = (price / GAS_THRESHOLD).toFixed(2);
  const peaker = Math.round(price * CCGT_HEAT_RATE);
  return `Gas at ${ratio}× the ${GAS_THRESHOLD} €/MWh threshold; gas peaker marginal cost €${peaker}/MWh.`;
}

// Data-derived impact: P_high gas-only floor in absolute €/MWh.
function gasImpact(price: number | null | undefined): string {
  if (price == null) return '—';
  const peaker = Math.round(price * CCGT_HEAT_RATE);
  return `P_high floor (gas only): €${peaker}/MWh — combine with EUA carbon for full peaker displacement floor.`;
}

export function S7Card() {
  const { status, data } = useSignal<S7Signal>(`${WORKER_URL}/s7`, { refreshInterval: REFRESH_COOL });
  const [history, setHistory] = useState<number[]>([]);
  const tt = useChartTooltipState();

  useEffect(() => {
    fetch(`${WORKER_URL}/s7/history`)
      .then(r => r.json())
      .then((h: Array<{ ttf_eur_mwh: number }>) => setHistory(h.map(e => e.ttf_eur_mwh)))
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '40%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '30%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '50%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Gas data unavailable</p></article>;
  }

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        TTF Gas Price
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(data.ttf_eur_mwh), display: 'inline-block' }} />
      </h3>

      {data.ttf_eur_mwh != null && (
        <>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
            {data.ttf_eur_mwh.toFixed(1)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>€/MWh</span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
            TTF day-ahead · {regimeLabel(data.ttf_eur_mwh)}
          </p>
        </>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {gasInterpretation(data.ttf_eur_mwh)}
      </p>

      <div className="tier3-impact" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--teal-medium-accent-text)', marginBottom: 'var(--space-xs)' }}>
        {gasImpact(data.ttf_eur_mwh)}
      </div>

      {/* Cross-signal: P_high floor math */}
      {data.ttf_eur_mwh != null && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: 'var(--space-xs)',
        }}>
          Gas marginal cost: ~€{Math.round(data.ttf_eur_mwh * 1.667)}/MWh (at ~60% CCGT efficiency) · Sets P_high floor for arbitrage
        </p>
      )}

      {/* Commodity-subtype scale bar (S7 + S9 only — documented variant per phase-31 pick 4). */}
      {data.ttf_eur_mwh != null && (
        <div style={{ position: 'relative', marginBottom: 'var(--space-xs)', cursor: 'default' }}
          onMouseEnter={(e) => tt.show({
            label: 'TTF gas',
            value: data.ttf_eur_mwh!,
            unit: '€/MWh',
            secondary: [{ label: 'Threshold', value: regimeLabel(data.ttf_eur_mwh) }],
          }, e.clientX, e.clientY)}
          onMouseMove={(e) => tt.show({
            label: 'TTF gas',
            value: data.ttf_eur_mwh!,
            unit: '€/MWh',
            secondary: [{ label: 'Threshold', value: regimeLabel(data.ttf_eur_mwh) }],
          }, e.clientX, e.clientY)}
          onMouseLeave={() => tt.hide()}>
          <div style={{
            display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden',
            background: 'var(--bg-elevated)',
          }}>
            <div style={{ flex: 15, background: 'var(--teal-subtle)' }} />
            <div style={{ flex: 15, background: 'var(--amber-subtle)' }} />
            <div style={{ flex: 20, background: 'var(--amber-strong)' }} />
            <div style={{ flex: 50, background: 'var(--rose-strong)' }} />
          </div>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '2px',
            background: 'var(--text-primary)',
            left: `${Math.min(100, Math.max(0, (data.ttf_eur_mwh / 80) * 100))}%`,
            borderRadius: '1px',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>0</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>15</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>30</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>50</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>80+</span>
          </div>
        </div>
      )}

      <SourceFooter source="energy-charts.info" updatedAt={formatTimestamp(data.timestamp)} dataClass="observed" />

      <div style={{ marginTop: 'var(--space-xs)' }}>
        <DetailsDrawer label="View gas detail">
          {history.length > 0 && (
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Recent trend</p>
              <Sparkline values={history} color="var(--series-gas)" width={200} height={40} />
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Thresholds</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            HIGH &gt;50 €/MWh · ELEVATED &gt;30 · NORMAL 15–30 · LOW &lt;15
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            TTF Dutch Title Transfer Facility — European gas benchmark. Source: energy-charts.info weekly EU gas prices. Updated every 4h.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: 'var(--space-sm)' }}>
            MODEL INPUT → P_high floor (gas marginal cost)
          </div>
        </DetailsDrawer>
      </div>
      <ChartTooltip
        visible={tt.state.visible}
        x={tt.state.x}
        y={tt.state.y}
        value={tt.state.data?.value ?? 0}
        unit={tt.state.data?.unit ?? ''}
        date={tt.state.data?.date}
        time={tt.state.data?.time}
        label={tt.state.data?.label}
        secondary={tt.state.data?.secondary}
        source={tt.state.data?.source}
      />
    </article>
  );
}
