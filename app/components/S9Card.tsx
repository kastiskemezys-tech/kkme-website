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

interface S7Data { ttf_eur_mwh?: number | null; }

interface S9Signal {
  timestamp?:     string | null;
  signal?:        string | null;
  eua_eur_t?:     number | null;
  eua_trend?:     string | null;
  _stale?:        boolean;
  _age_hours?:    number | null;
}

const CARBON_THRESHOLD = 70;     // €/t — worker HIGH boundary, also the pill anchor
const CARBON_BREAKEVEN = 55;     // €/t — BESS peaker-displacement breakeven
const CARBON_INTENSITY = 0.45;   // tCO₂/MWh — gas-CCGT carbon footprint

// Quantitative threshold reference (used in interpretation prose).
function regimeLabel(price: number | null | undefined): string {
  if (price == null) return '—';
  return `${(price / CARBON_THRESHOLD).toFixed(2)}× / ${CARBON_THRESHOLD} €/t threshold`;
}

// Header dot color: data-derived from the price vs threshold ratio.
function dotColor(price: number | null | undefined): string {
  if (price == null) return 'var(--text-muted)';
  const ratio = price / CARBON_THRESHOLD;
  if (ratio >= 1)   return 'var(--amber-accent-text)';
  if (ratio < 0.43) return 'var(--green)'; // < 30 €/t: carbon premium negligible
  return 'var(--text-muted)';
}

// Data-derived interpretation: ratio vs threshold + computed gas carbon premium.
function carbonInterpretation(price: number | null | undefined): string {
  if (price == null) return '—';
  const ratio = (price / CARBON_THRESHOLD).toFixed(2);
  const premium = Math.round(price * CARBON_INTENSITY);
  return `EUA at ${ratio}× the ${CARBON_THRESHOLD} €/t threshold; carbon premium on gas generation €${premium}/MWh.`;
}

// Data-derived impact: position vs BESS displacement breakeven (~55 €/t).
function carbonImpact(price: number | null | undefined): string {
  if (price == null) return '—';
  const delta = Math.round(price - CARBON_BREAKEVEN);
  const sign = delta >= 0 ? '+' : '';
  return `BESS displacement breakeven ${CARBON_BREAKEVEN} €/t (${sign}${delta} €/t vs spot).`;
}

export function S9Card() {
  const { status, data } = useSignal<S9Signal>(`${WORKER_URL}/s9`, { refreshInterval: REFRESH_COOL });
  const [history, setHistory] = useState<number[]>([]);
  const [ttfPrice, setTtfPrice] = useState<number | null>(null);
  const tt = useChartTooltipState();

  useEffect(() => {
    fetch(`${WORKER_URL}/s9/history`)
      .then(r => r.json())
      .then((h: Array<{ eua_eur_t: number }>) => setHistory(h.map(e => e.eua_eur_t)))
      .catch(() => {});
    // Fetch S7 for combined P_high floor
    fetch(`${WORKER_URL}/s7`)
      .then(r => r.json())
      .then((d: S7Data) => { if (d.ttf_eur_mwh) setTtfPrice(d.ttf_eur_mwh); })
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '40%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '28%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '50%' }} />
      </article>
    );
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Carbon data unavailable</p></article>;
  }

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        EU ETS Carbon
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(data.eua_eur_t), display: 'inline-block' }} />
      </h3>

      {data.eua_eur_t != null && (
        <>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
            {data.eua_eur_t.toFixed(1)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>€/t</span>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>
            EUA carbon price · {regimeLabel(data.eua_eur_t)}
          </p>
        </>
      )}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {carbonInterpretation(data.eua_eur_t)}
      </p>

      <div className="tier3-impact" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--teal-medium-accent-text)', marginBottom: 'var(--space-xs)' }}>
        {carbonImpact(data.eua_eur_t)}
      </div>

      {/* Cross-signal: carbon premium on gas generation */}
      {data.eua_eur_t != null && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: 'var(--space-xs)',
        }}>
          Carbon premium on gas gen: ~€{Math.round(data.eua_eur_t * 0.45)}/MWh (0.45 tCO₂/MWh)
          {ttfPrice != null && ` · Combined P_high floor: ~€${Math.round(ttfPrice * 1.667 + data.eua_eur_t * 0.45)}/MWh (gas + carbon)`}
        </p>
      )}

      {/* Commodity-subtype scale bar (S7 + S9 only — documented variant per phase-31 pick 4). */}
      {data.eua_eur_t != null && (
        <div style={{ position: 'relative', marginBottom: 'var(--space-xs)', cursor: 'default' }}
          onMouseEnter={(e) => tt.show({
            label: 'EUA',
            value: data.eua_eur_t!,
            unit: '€/t',
            secondary: [
              { label: 'Threshold', value: regimeLabel(data.eua_eur_t) },
              ...(data.eua_eur_t! >= 55 ? [{ label: 'BESS', value: 'above breakeven' }] : []),
            ],
          }, e.clientX, e.clientY)}
          onMouseMove={(e) => tt.show({
            label: 'EUA',
            value: data.eua_eur_t!,
            unit: '€/t',
            secondary: [
              { label: 'Threshold', value: regimeLabel(data.eua_eur_t) },
              ...(data.eua_eur_t! >= 55 ? [{ label: 'BESS', value: 'above breakeven' }] : []),
            ],
          }, e.clientX, e.clientY)}
          onMouseLeave={() => tt.hide()}>
          <div style={{
            display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden',
            background: 'var(--bg-elevated)',
          }}>
            <div style={{ flex: 30, background: 'var(--teal-subtle)' }} />
            <div style={{ flex: 25, background: 'var(--amber-subtle)' }} />
            <div style={{ flex: 25, background: 'var(--amber-strong)' }} />
            <div style={{ flex: 20, background: 'var(--rose-strong)' }} />
          </div>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '2px',
            background: 'var(--text-primary)',
            left: `${Math.min(100, Math.max(0, (data.eua_eur_t / 120) * 100))}%`,
            borderRadius: '1px',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>0</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>30</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)', position: 'relative' }}>
              55
              <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>▲</span>
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>80</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)' }}>120</span>
          </div>
        </div>
      )}

      <SourceFooter source="energy-charts.info" updatedAt={formatTimestamp(data.timestamp)} dataClass="observed" />

      <div style={{ marginTop: 'var(--space-xs)' }}>
        <DetailsDrawer label="View carbon detail">
          {history.length > 0 && (
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Recent trend</p>
              <Sparkline values={history} color="var(--series-carbon)" width={200} height={40} />
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>BESS context</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            BESS peaker displacement breakeven: ~55 €/t. Above this, the carbon premium on gas generation strengthens the BESS arbitrage case.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            EU ETS European Allowance price (€/t CO₂). Source: energy-charts.info weekly. Updated every 4h.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: 'var(--space-sm)' }}>
            MODEL INPUT → P_high floor (carbon cost)
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
