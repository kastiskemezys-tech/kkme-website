'use client';

/**
 * BalticStorageIndexCard — KKME Baltic Storage Index (Phase 29).
 *
 * Renders the monthly per-country per-duration €/MW/month index served by
 * worker `GET /index/baltic` (populated daily by `scripts/vps/baltic_storage_index.py`).
 *
 * Phase 29 launch coverage (operator-confirmed at Pause A, option ε):
 *   LT/{2h,4h}: complete (canonical engine output)
 *   LT/1h, all LV, all EE: null with coverage_status string
 *
 * The card surfaces the gap explicitly per discipline rule #1 (audit-triage)
 * and rule #6 (no-editorial-state-label) — null cells render as a hyphen with
 * a tooltip explaining the coverage_status. No editorial state strings.
 */

import { useEffect, useState } from 'react';
import { Sparkline } from './Sparkline';
import { SourceFooter } from '@/app/components/primitives';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

type Duration = '1h' | '2h' | '4h';
type Country = 'lt' | 'lv' | 'ee';

interface PerDuration {
  '1h': number | null;
  '2h': number | null;
  '4h': number | null;
}

type CoverageStatus = 'complete' | 'pending_phase_29_1' | 'pending_engine_1h_physics';

interface CoveragePerDuration {
  '1h': CoverageStatus;
  '2h': CoverageStatus;
  '4h': CoverageStatus;
}

interface IndexSnapshot {
  month: string;
  lt: PerDuration;
  lv: PerDuration;
  ee: PerDuration;
  coverage: { lt: CoveragePerDuration; lv: CoveragePerDuration; ee: CoveragePerDuration };
  trailing_6_months: Array<{ month: string; lt: PerDuration; lv: PerDuration; ee: PerDuration }>;
  methodology_url: string;
  comparable_clean_horizon_published: boolean;
  computation_window: string;
  engine_version: string;
  last_updated_at: string;
}

const COUNTRY_META: Record<Country, { code: string; flag: string; name: string }> = {
  lt: { code: 'LT', flag: '🇱🇹', name: 'Lithuania' },
  lv: { code: 'LV', flag: '🇱🇻', name: 'Latvia' },
  ee: { code: 'EE', flag: '🇪🇪', name: 'Estonia' },
};

const DURATIONS: Duration[] = ['1h', '2h', '4h'];

const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  complete: 'Computed from engine output for this month.',
  pending_phase_29_1:
    'Coverage pending Phase 29.1 (per-country DA capture extension + 5-product capacity-reservation extraction). See methodology paper.',
  pending_engine_1h_physics:
    'Engine v7.3 does not model sub-2h SOC physics. 1h coverage requires a dedicated engine extension.',
};

function formatEur(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `€${Math.round(v).toLocaleString()}`;
}

function formatMonth(m: string): string {
  // 'YYYY-MM' → 'Mon YYYY'
  const [y, mm] = m.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(mm, 10) - 1;
  return `${months[idx] ?? mm} ${y}`;
}

export function BalticStorageIndexCard() {
  const [data, setData] = useState<IndexSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    fetch(`${WORKER_URL}/index/baltic`, { signal: controller.signal })
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setStatus('pending');
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<IndexSnapshot>;
      })
      .then((d) => {
        if (cancelled || !d) return;
        if (typeof d.month !== 'string' || !d.lt) {
          setStatus('pending');
          return;
        }
        setData(d);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        // AbortError on 6s timeout = pending state, not error.
        if (err?.name === 'AbortError') setStatus('pending');
        else setStatus('error');
      })
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '40%', marginBottom: '12px' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '30%', marginBottom: 'var(--space-md)' }} />
        <div className="skeleton" style={{ height: '0.875rem', width: '90%' }} />
      </article>
    );
  }

  if (status === 'pending') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <h3 style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: '6px',
        }}>
          KKME Baltic Storage Index
        </h3>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Awaiting first daily snapshot from VPS aggregate script. Check back after the next cron cycle.
        </p>
      </article>
    );
  }

  if (status === 'error' || !data) {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Index data unavailable.
        </p>
      </article>
    );
  }

  // Trailing-6-month sparkline values for LT/2h and LT/4h (the two complete series).
  const sparkLt2h = data.trailing_6_months
    .map((m) => m.lt['2h'])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const sparkLt4h = data.trailing_6_months
    .map((m) => m.lt['4h'])
    .filter((v): v is number => v != null && Number.isFinite(v));
  const sparkLabels2h = data.trailing_6_months
    .filter((m) => m.lt['2h'] != null)
    .map((m) => formatMonth(m.month));
  const sparkLabels4h = data.trailing_6_months
    .filter((m) => m.lt['4h'] != null)
    .map((m) => formatMonth(m.month));

  return (
    <article style={{ padding: 'var(--space-md)' }}>
      <h3 style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
        marginBottom: '6px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        KKME Baltic Storage Index
        <span style={{
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'none',
          fontWeight: 400,
        }}>
          {formatMonth(data.month)} · €/MW/month
        </span>
      </h3>

      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        margin: '0 0 24px',
        maxWidth: '560px',
      }}>
        Monthly per-country per-duration revenue benchmark, computed from primary-source ingestion. Comparable in framing to Clean Horizon&apos;s Storage Index for Baltic markets; values diverge per the methodology paper.
      </p>

      {/* Phase 18 — editorial hero (LT 2h primary) */}
      {data.lt['2h'] != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <span style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(56px, 7vw, 88px)',
            fontWeight: 200,
            letterSpacing: '-0.025em',
            lineHeight: 0.95,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            €{Math.round(data.lt['2h']).toLocaleString()}
            <sup style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 13,
              marginLeft: 6,
              color: 'var(--text-secondary)',
              verticalAlign: 'super',
            }}>1</sup>
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            /MW · MO &nbsp;·&nbsp; LT 2h
          </span>
        </div>
      )}

      {/* 3 countries × 3 durations grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto repeat(3, 1fr)',
        gap: '0',
        margin: '0 0 24px',
        border: '1px solid var(--border-card)',
        borderRadius: 4,
      }}>
        {/* Header row */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-card)' }} />
        {DURATIONS.map((d) => (
          <div
            key={`h-${d}`}
            style={{
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderBottom: '1px solid var(--border-card)',
              borderLeft: '1px solid var(--border-card)',
              textAlign: 'right',
            }}
          >
            {d}
          </div>
        ))}

        {/* Country rows */}
        {(['lt', 'lv', 'ee'] as const).map((country, rowIdx) => (
          <Row
            key={country}
            country={country}
            values={data[country]}
            coverage={data.coverage[country]}
            isLast={rowIdx === 2}
          />
        ))}
      </div>

      {/* Trailing 6-month sparklines for LT/2h + LT/4h */}
      {(sparkLt2h.length >= 2 || sparkLt4h.length >= 2) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {sparkLt2h.length >= 2 && (
            <SparkRow
              label="LT · 2h · trailing 6 mo"
              values={sparkLt2h}
              labels={sparkLabels2h}
            />
          )}
          {sparkLt4h.length >= 2 && (
            <SparkRow
              label="LT · 4h · trailing 6 mo"
              values={sparkLt4h}
              labels={sparkLabels4h}
            />
          )}
        </div>
      )}

      {/* Phase 18 — footnotes; Phase 12.11 — explicit pending-coverage footnote */}
      <div className="card-footnotes">
        <div>
          <span className="card-footnotes__anchor">1</span>
          LT 2h composite: DA capture + balancing capacity reservation, daily VPS aggregate; {formatMonth(data.month)} computation. <a href="/methodology#kkme-baltic-storage-index">methodology</a>.
        </div>
        <div>
          <span className="card-footnotes__anchor">2</span>
          Coverage pending Phase 29.1 — engine extension queued (per-country DA capture + 5-product capacity-reservation extraction). LT 1h additionally requires sub-2h SOC physics not modeled by engine v7.3.
        </div>
      </div>

      <SourceFooter
        source="KKME engine v7.3 · BTD · ENTSO-E A44"
        sourceUrl="https://kkme.eu/methodology#kkme-baltic-storage-index"
        updatedAt={data.last_updated_at ? new Date(data.last_updated_at).toISOString().slice(0, 10) : undefined}
        methodologyLink="/methodology#kkme-baltic-storage-index"
      />
    </article>
  );
}

function Row({
  country,
  values,
  coverage,
  isLast,
}: {
  country: Country;
  values: PerDuration;
  coverage: CoveragePerDuration;
  isLast: boolean;
}) {
  const meta = COUNTRY_META[country];
  return (
    <>
      <div
        style={{
          padding: '12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          borderBottom: isLast ? 'none' : '1px solid var(--border-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
        }}
      >
        <span style={{ fontSize: '0.95rem' }}>{meta.flag}</span>
        <span>{meta.code}</span>
      </div>
      {DURATIONS.map((d) => {
        const v = values[d];
        const cs = coverage[d];
        const isComplete = cs === 'complete';
        // Phase 12.11 — pending cells get an inline sup² anchor so the gap is
        // visible without requiring a hover (mirrors LT 2h sup¹ pattern). The
        // cursor:help tooltip is kept as the rich-disclosure layer.
        return (
          <div
            key={`${country}-${d}`}
            title={COVERAGE_LABEL[cs]}
            style={{
              padding: '12px',
              fontFamily: isComplete ? 'var(--font-display)' : 'var(--font-mono)',
              fontSize: isComplete ? '1.125rem' : 'var(--font-sm)',
              fontWeight: isComplete ? 500 : 400,
              color: isComplete ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: isLast ? 'none' : '1px solid var(--border-card)',
              borderLeft: '1px solid var(--border-card)',
              textAlign: 'right',
              cursor: 'help',
            }}
          >
            {formatEur(v)}
            {!isComplete && (
              <sup style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: 11,
                marginLeft: 3,
                color: 'var(--text-secondary)',
                verticalAlign: 'super',
              }}>2</sup>
            )}
          </div>
        );
      })}
    </>
  );
}

function SparkRow({ label, values, labels }: { label: string; values: number[]; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        letterSpacing: '0.04em',
        minWidth: '160px',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Sparkline
          values={values}
          labels={labels}
          height={24}
          showRange
          rangeUnit="€"
          rangeDecimals={0}
          unit="€/MW/mo"
        />
      </div>
    </div>
  );
}
