'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_COOL } from '@/lib/refresh-cadence';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
  ChartTooltip, useChartTooltipState,
} from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import type { Sentiment } from '@/app/lib/types';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S7Signal {
  timestamp?:    string | null;
  signal?:       string | null;
  regime?:       string | null;
  bess_impact?:  string | null;
  ttf_eur_mwh?:  number | null;
  ttf_trend?:    string | null;
  interpretation?: string | null;
  _stale?:       boolean;
  _age_hours?:   number | null;
}

function regimeLabel(r: string | null | undefined): string {
  if (r === 'HIGH') return 'High';
  if (r === 'ELEVATED') return 'Elevated';
  if (r === 'LOW') return 'Low';
  return 'Normal';
}

function regimeSentiment(r: string | null | undefined): Sentiment {
  if (r === 'HIGH') return 'caution';
  if (r === 'ELEVATED') return 'caution';
  if (r === 'LOW') return 'positive';
  return 'neutral';
}

function gasInterpretation(regime: string | null | undefined): string {
  if (regime === 'HIGH') return 'Expensive gas — strengthening BESS arbitrage case.';
  if (regime === 'ELEVATED') return 'Above-normal gas — supporting wider peak spreads.';
  if (regime === 'LOW') return 'Cheap gas — compressing peaker displacement value.';
  return 'Mid-range gas — moderate effect on peak pricing.';
}

function gasImpact(regime: string | null | undefined): string {
  if (regime === 'HIGH') return 'Reference asset: supportive for arbitrage vs gas peakers';
  if (regime === 'ELEVATED') return 'Reference asset: supporting wider peak spreads';
  if (regime === 'LOW') return 'Reference asset: reducing peaker displacement value';
  return 'Reference asset: neutral for spread floor';
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
      <article style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '40%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '30%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '50%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Gas data unavailable</p></article>;
  }

  const regime = data.regime ?? data.signal;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
        TTF Gas Price
      </h3>

      {data.ttf_eur_mwh != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile label="TTF day-ahead" value={data.ttf_eur_mwh.toFixed(1)} unit="€/MWh" size="hero" dataClass="observed" />
            <StatusChip status={regimeLabel(regime)} sentiment={regimeSentiment(regime)} />
          </div>
        </div>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '4px 0 8px' }}>
        {gasInterpretation(regime)}
      </p>

      <div className="tier3-impact" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--teal-medium)', marginBottom: '8px' }}>
        {gasImpact(regime)}
      </div>

      {/* Cross-signal: P_high floor math */}
      {data.ttf_eur_mwh != null && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: '8px',
        }}>
          Gas marginal cost: ~€{Math.round(data.ttf_eur_mwh * 1.667)}/MWh (at ~60% CCGT efficiency) · Sets P_high floor for arbitrage
        </p>
      )}

      {/* Threshold bar with hover tooltip */}
      {data.ttf_eur_mwh != null && (
        <div style={{ position: 'relative', marginBottom: '8px', cursor: 'default' }}
          onMouseEnter={(e) => tt.show({
            label: 'TTF gas',
            value: data.ttf_eur_mwh!,
            unit: '€/MWh',
            secondary: [{ label: 'Regime', value: regimeLabel(regime) }],
          }, e.clientX, e.clientY)}
          onMouseMove={(e) => tt.show({
            label: 'TTF gas',
            value: data.ttf_eur_mwh!,
            unit: '€/MWh',
            secondary: [{ label: 'Regime', value: regimeLabel(regime) }],
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>0</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>15</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>30</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>50</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5625rem', color: 'var(--text-ghost)' }}>80+</span>
          </div>
        </div>
      )}

      <SourceFooter source="energy-charts.info" updatedAt={formatTimestamp(data.timestamp)} dataClass="observed" />

      <div style={{ marginTop: '8px' }}>
        <DetailsDrawer label="View gas detail">
          {history.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Recent trend</p>
              <Sparkline values={history} color="var(--series-gas)" width={200} height={40} />
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Thresholds</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            HIGH &gt;50 €/MWh · ELEVATED &gt;30 · NORMAL 15–30 · LOW &lt;15
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px', marginTop: '16px' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            TTF Dutch Title Transfer Facility — European gas benchmark. Source: energy-charts.info weekly EU gas prices. Updated every 4h.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: '16px' }}>
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
