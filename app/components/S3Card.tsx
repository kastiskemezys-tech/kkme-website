'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import { safeNum } from '@/lib/safeNum';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S3Signal {
  timestamp?:             string | null;
  lithium_eur_t?:         number | null;
  lithium_trend?:         string | null;
  cell_eur_kwh?:          number | null;
  china_system_eur_kwh?:  number | null;
  europe_system_eur_kwh?: number | null;
  global_avg_eur_kwh?:    number | null;
  ref_source?:            string | null;
  ref_date?:              string | null;
  euribor_3m?:            number | null;
  euribor_nominal_3m?:    number | null;
  euribor_real_3m?:       number | null;
  hicp_yoy?:              number | null;
  euribor_trend?:         string | null;
  signal?:                string | null;
  interpretation?:        string | null;
  source?:                string | null;
  unavailable?:           boolean;
}

function costSentiment(sig: string | null | undefined): Sentiment {
  if (sig === 'FALLING') return 'positive';
  if (sig === 'RISING') return 'caution';
  return 'neutral';
}

function costLabel(sig: string | null | undefined): string {
  if (sig === 'FALLING') return 'Easing';
  if (sig === 'RISING') return 'Rising';
  return 'Stable';
}

// Static cost direction assessment — update quarterly
const COST_DIRECTIONS: { component: string; dir: string; color: string }[] = [
  { component: 'Battery hardware', dir: '↓ easing', color: 'var(--teal)' },
  { component: 'Electrical / PCS', dir: '→ constrained', color: 'var(--amber)' },
  { component: 'EPC / civil', dir: '→ limited decline', color: 'var(--amber)' },
  { component: 'Grid connection', dir: '↕ project-specific', color: 'var(--rose)' },
];

export function S3Card() {
  const { status, data } = useSignal<S3Signal>(`${WORKER_URL}/s3`);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetch(`${WORKER_URL}/s3/history`)
      .then(r => r.json())
      .then((h: Array<{ equip_eur_kwh: number }>) => setHistory(h.map(e => e.equip_eur_kwh)))
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Loading cost data...</p></article>;
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Cost data unavailable</p></article>;
  }

  const installedCost = data.europe_system_eur_kwh;
  const nominal = data.euribor_nominal_3m ?? data.euribor_3m ?? null;
  const real = data.euribor_real_3m ?? null;
  const hicp = data.hicp_yoy ?? null;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
        Installed BESS cost
      </h3>

      {/* HERO — installed cost reference */}
      {installedCost != null && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <MetricTile label="Installed BESS cost reference" value={`€${installedCost}`} unit="/kWh" size="hero" dataClass="reference" />
            <StatusChip status={costLabel(data.signal)} sentiment={costSentiment(data.signal)} />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
            {data.ref_source ?? 'CH S1 2025'} · equipment + BoP + civil · excl. grid connection
          </p>
        </div>
      )}

      {/* Cost range context */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', margin: '8px 0 12px', lineHeight: 1.6 }}>
        Range: €{data.china_system_eur_kwh ?? 68} equipment-only (China DDP) → €{installedCost ?? 164} installed (EU) → ~€262 turnkey incl. grid
      </div>

      {/* COST DIRECTION — editorial assessment */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Cost direction · editorial assessment · Q1 2026
        </p>
        {COST_DIRECTIONS.map(({ component, dir, color }) => (
          <div key={component} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{component}</span>
            <span style={{ color, opacity: 0.75 }}>{dir}</span>
          </div>
        ))}
      </div>

      {/* Pass-through interpretation */}
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
        Battery hardware pricing suggests downward pressure, but Baltic project evidence indicates grid connection and electrical scope are not declining at the same rate — pass-through to full project CAPEX appears partial.
      </p>

      {/* Cost layer honesty note */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
        Equipment cost ≠ installed BESS ≠ full project CAPEX. Grid connection, substation expansion, and owner costs can add 50–200% to equipment-only benchmarks in Baltic projects.
      </p>

      {/* Impact tag */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '12px' }}>
        Reference asset: CAPEX partially improving — grid scope remains the dominant variable
      </div>

      <SourceFooter
        source={data.source ?? 'tradingeconomics.com + ECB'}
        updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined}
        dataClass="reference"
      />

      <div style={{ marginTop: '12px' }}>
        <DetailsDrawer label="View cost breakdown">
          {/* CAPEX waterfall */}
          {installedCost != null && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Installed cost breakdown</p>
              {[
                { label: 'Equipment DC (cells + containers)', val: installedCost * 0.62, layer: 'equipment only' },
                { label: 'BOS + civil works', val: installedCost * 0.27, layer: 'installed excl. grid' },
                { label: 'HV grid connection (fixed)', val: installedCost * 0.11, layer: 'grid scope dependent' },
              ].map(({ label, val, layer }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>€{val.toFixed(0)}/kWh <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>· {layer}</span></span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-card)', marginTop: '8px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-primary)' }}>
                <span>Total installed (EU)</span>
                <span>€{installedCost}/kWh</span>
              </div>
            </div>
          )}

          {/* Baltic evidence */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Baltic transaction evidence</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
            AST Latvia: ~€480/kWh all-in incl. substation (80MW/160MWh, 2025 contract) · Utilitas: ~€350/kWh (10MW/20MWh, smaller scope) · Scope drives Baltic variance.
          </p>

          {/* Sparkline if available */}
          {history.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Equipment cost trend</p>
              <Sparkline values={history} color="var(--chart-label)" width={200} height={40} />
            </div>
          )}

          {/* Lithium context */}
          {data.lithium_eur_t != null && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Raw input reference</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Li carbonate: €{safeNum(data.lithium_eur_t / 1000, 0)}k/t {data.lithium_trend ?? ''} · raw commodity input, not a project cost
              </p>
            </div>
          )}

          {/* Finance detail */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Financing context</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', marginBottom: '20px' }}>
            {nominal != null && (
              <><span style={{ color: 'var(--text-muted)' }}>Euribor 3M</span><span style={{ color: 'var(--text-secondary)' }}>{safeNum(nominal, 2)}% nominal</span></>
            )}
            {hicp != null && (
              <><span style={{ color: 'var(--text-muted)' }}>HICP YoY</span><span style={{ color: 'var(--text-secondary)' }}>{safeNum(hicp, 1)}%</span></>
            )}
            {real != null && (
              <><span style={{ color: 'var(--text-muted)' }}>Real rate</span><span style={{ color: 'var(--text-secondary)' }}>{safeNum(real, 2)}%</span></>
            )}
          </div>

          {/* Methodology */}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Installed cost: BNEF / Clean Horizon S1 2025 benchmark. Equipment from tradingeconomics.com. Euribor: ECB API. Cost direction is editorial assessment based on public evidence, updated quarterly.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: '16px' }}>
            MODEL INPUT → CAPEX reference · Financing cost
          </div>
        </DetailsDrawer>
      </div>
    </article>
  );
}
