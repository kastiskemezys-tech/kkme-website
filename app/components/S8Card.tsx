'use client';

import { useSignal } from '@/lib/useSignal';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer,
} from '@/app/components/primitives';
import { BalticMap } from './BalticMap';
import type { Sentiment } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S8Signal {
  timestamp?:        string | null;
  signal?:           string | null;
  nordbalt_avg_mw?:  number | null;
  litpol_avg_mw?:    number | null;
  nordbalt_signal?:  string | null;
  litpol_signal?:    string | null;
  interpretation?:   string | null;
  _stale?:           boolean;
  _age_hours?:       number | null;
}

function regimeLabel(sig: string | null | undefined): string {
  if (sig === 'EXPORTING') return 'Net exporter';
  if (sig === 'IMPORTING') return 'Net importer';
  return 'Balanced';
}

function regimeSentiment(sig: string | null | undefined): Sentiment {
  if (sig === 'IMPORTING') return 'caution';
  if (sig === 'EXPORTING') return 'positive';
  return 'neutral';
}

function flowInterpretation(
  dominantSig: string | null | undefined,
  nbSig: string | null | undefined,
  lpSig: string | null | undefined,
): string {
  if (dominantSig === 'IMPORTING') {
    return 'Import-supported conditions are limiting local Baltic dislocation — cross-border supply is smoothing prices.';
  }
  if (dominantSig === 'EXPORTING') {
    return 'Cross-border support is weaker with Lithuania exporting — Baltic prices are more locally set.';
  }
  return 'Balanced flows are reducing directional pressure from neighboring markets.';
}

function flowImpact(dominantSig: string | null | undefined): string {
  if (dominantSig === 'IMPORTING') return 'Reference asset: limiting local price volatility';
  if (dominantSig === 'EXPORTING') return 'Reference asset: supportive for local spread capture';
  return 'Reference asset: neutral for spread direction';
}

function mwLabel(mw: number | null | undefined): string {
  if (mw == null) return '—';
  const sign = mw >= 0 ? '+' : '';
  return `${sign}${mw.toLocaleString('en-GB')} MW`;
}

function dirLabel(sig: string | null | undefined): string {
  if (sig === 'EXPORTING') return 'EXPORT';
  if (sig === 'IMPORTING') return 'IMPORT';
  return 'BALANCED';
}

function dirColor(sig: string | null | undefined): string {
  if (sig === 'EXPORTING') return 'rgba(45,212,168,0.85)';
  if (sig === 'IMPORTING') return 'rgba(245,158,11,0.85)';
  return 'var(--text-muted)';
}

export function S8Card() {
  const { status, data } = useSignal<S8Signal>(`${WORKER_URL}/s8`);

  if (status === 'loading') {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Loading interconnector data...</p></article>;
  }
  if (status === 'error' || !data) {
    return <article style={{ padding: '24px' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Interconnector data unavailable</p></article>;
  }

  const nbSig = data.nordbalt_signal ?? null;
  const lpSig = data.litpol_signal ?? null;
  const nbMw = Math.abs(data.nordbalt_avg_mw ?? 0);
  const lpMw = Math.abs(data.litpol_avg_mw ?? 0);
  const dominantSig = nbMw >= lpMw ? nbSig : lpSig;

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '6px' }}>
        Interconnectors
      </h3>

      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: dirColor(dominantSig), lineHeight: 1, letterSpacing: '0.02em', margin: 0 }}>
              {regimeLabel(dominantSig)}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
              LT cross-border balance
            </p>
          </div>
          <StatusChip status={dirLabel(dominantSig)} sentiment={regimeSentiment(dominantSig)} />
        </div>
      </div>

      {/* Compact corridor summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: '12px', marginTop: '8px' }}>
        {([
          ['NordBalt → SE4', data.nordbalt_avg_mw, nbSig],
          ['LitPol → PL', data.litpol_avg_mw, lpSig],
        ] as [string, number | null | undefined, string | null | undefined][]).map(([label, mw, sig]) => (
          <div key={label} style={{ fontFamily: 'var(--font-mono)' }}>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 'var(--font-sm)', color: dirColor(sig) }}>{mwLabel(mw)}</div>
          </div>
        ))}
      </div>

      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
        {flowInterpretation(dominantSig, nbSig, lpSig)}
      </p>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'rgba(0,180,160,0.65)', marginBottom: '12px' }}>
        {flowImpact(dominantSig)}
      </div>

      <SourceFooter source="ENTSO-E Transparency" updatedAt={data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : undefined} dataClass="observed" />

      <div style={{ marginTop: '12px' }}>
        <DetailsDrawer label="View flow map and detail">
          <div style={{ maxHeight: '200px', overflow: 'hidden', marginBottom: '16px' }}>
            <BalticMap
              nordbalt_mw={data.nordbalt_avg_mw}
              nordbalt_dir={data.nordbalt_signal}
              litpol_mw={data.litpol_avg_mw}
              litpol_dir={data.litpol_signal}
              compact
            />
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Methodology</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Net physical flows from ENTSO-E A11 document type. NordBalt (LT↔SE4) and LitPol (LT↔PL). Positive = LT exporting. Updated every 4h.
          </p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-ghost)', letterSpacing: '0.06em', marginTop: '16px' }}>
            MODEL INPUT → Interconnector spread drag
          </div>
        </DetailsDrawer>
      </div>
    </article>
  );
}
