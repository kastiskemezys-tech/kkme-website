'use client';

import { useState, useEffect } from 'react';
import { useSignal } from '@/lib/useSignal';
import { REFRESH_HOT } from '@/lib/refresh-cadence';
import { SourceFooter, DetailsDrawer } from '@/app/components/primitives';
import { Sparkline } from './Sparkline';
import { CAPTURE_LABELS, vsCanonicalFootnote } from '@/app/lib/captureDefinitions';
import { formatTimestamp } from '@/app/lib/freshness';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

interface S1Signal {
  spread_eur_mwh?: number | null;
  p_high_avg?: number | null;
  p_low_avg?: number | null;
  bess_net_capture?: number | null;
  intraday_capture?: number | null;
  lt_hourly_24?: number[] | null;
  updated_at?: string | null;
}

/**
 * Phase 38.2 (B-056) — the 14D swing sparkline used to read `/s1/history`,
 * whose rows are stamped with the WRITE date. On 2026-08-03 `slice(-14)`
 * resolved to fourteen rows spanning TWO distinct dates, rendered under a
 * "14D daily swing" label: a rule-#2 shape on a live chart.
 *
 * It now reads the same per-market-day array the S1 card's honest 30-day
 * figures sit on — `/s1/capture`.history, which dedupes by market date on
 * write (rule #4, one canonical writer for the swing quantity). The card
 * already fetches that endpoint for the canonical gross, so this is one source
 * fewer, not one more.
 */
interface CaptureHistoryEntry {
  date: string;
  swing?: number | null;
}

function dotColor(capture: number): string {
  if (capture > 150) return 'var(--green)';
  if (capture >= 80) return 'var(--amber-accent-text)';
  return 'var(--rose)';
}

function interpretation(grossCapture: number, netCapture: number | null | undefined): string {
  if (netCapture == null || grossCapture <= 0) {
    return `Gross €${grossCapture.toFixed(0)}/MWh.`;
  }
  const drag = grossCapture - netCapture;
  const dragPct = ((1 - netCapture / grossCapture) * 100).toFixed(0);
  return `Gross €${grossCapture.toFixed(0)}/MWh; net €${netCapture.toFixed(0)}/MWh after RTE losses — €${drag.toFixed(0)}/MWh drag (${dragPct}%).`;
}

export function SpreadCaptureCard() {
  const { status, data } = useSignal<S1Signal>(`${WORKER_URL}/read`, { refreshInterval: REFRESH_HOT });
  const [history, setHistory] = useState<Array<{ date: string; swing: number }>>([]);
  // Canonical DA capture (gross_4h) for the vs-canonical footnote — never derive it locally
  const [canonicalGross4h, setCanonicalGross4h] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${WORKER_URL}/s1/capture`)
      .then(r => r.json())
      .then((c: { gross_4h?: number | null; history?: CaptureHistoryEntry[] }) => {
        if (c?.gross_4h != null) setCanonicalGross4h(c.gross_4h);
        // Dedupe defensively even though the writer already does: the label
        // this feeds counts days, and a day counted twice is the whole bug.
        const byDate = new Map<string, number>();
        for (const e of c?.history ?? []) {
          if (e?.date && e.swing != null && isFinite(e.swing)) byDate.set(e.date, e.swing);
        }
        const rows = [...byDate.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-14)
          .map(([date, swing]) => ({ date, swing }));
        setHistory(rows);
      })
      .catch(() => {});
  }, []);

  if (status === 'loading') {
    return (
      <article style={{ padding: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: '0.875rem', width: '45%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '1.5rem', width: '35%', marginBottom: 'var(--space-xs)' }} />
        <div className="skeleton" style={{ height: '0.625rem', width: '55%' }} />
      </article>
    );
  }
  if (status === 'error' || !data || !data.updated_at) {
    return <article style={{ padding: 'var(--space-md)' }}><p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Spread capture data unavailable</p></article>;
  }

  // Hero = GROSS peak−trough range (matches "raw daily envelope" label + Buy/Sell sub-row).
  // Net (after RTE charge leg) disclosed below.
  const grossCapture = data.intraday_capture ?? 0;
  const netCapture = data.bess_net_capture;
  const pHigh = data.p_high_avg ?? 0;
  const pLow = data.p_low_avg ?? 0;
  const crossBorder = data.spread_eur_mwh ?? 0;
  // Worker emits 24-entry hourly downsample (averaged across 15-min sub-bars when present).
  const todayCurve = data.lt_hourly_24 ?? [];

  const label = CAPTURE_LABELS.da_peak_trough_range;
  const canonicalNote = vsCanonicalFootnote('da_peak_trough_range', canonicalGross4h);

  return (
    <article style={{ width: '100%' }}>
      <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-body-md)', color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        {label.short}
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor(grossCapture), display: 'inline-block' }} />
      </h3>

      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 1.75rem)', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.02em', marginBottom: '2px' }}>
        {'\u20AC'}{grossCapture.toFixed(0)}/MWh
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2xs)' }}>
        {label.detail} · Buy {'\u20AC'}{pLow.toFixed(0)} · Sell {'\u20AC'}{pHigh.toFixed(0)}
      </p>
      {netCapture != null && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)', marginBottom: 'var(--space-2xs)', lineHeight: 1.4 }}>
          Net after RTE charge leg: {'€'}{netCapture.toFixed(0)}/MWh
        </p>
      )}
      {canonicalNote && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)', marginBottom: 'var(--space-xs)', lineHeight: 1.4 }}>
          {canonicalNote}
        </p>
      )}

      {/* Today's price curve */}
      {todayCurve.length >= 2 && (() => {
        const validHourly = todayCurve.filter((v): v is number => typeof v === 'number' && isFinite(v));
        const hMin = validHourly.length ? Math.min(...validHourly) : 0;
        const hMax = validHourly.length ? Math.max(...validHourly) : 0;
        return (
          <div style={{ marginBottom: '6px' }}>
            <div
              role="img"
              aria-label={`LT day-ahead 24h price curve, ${validHourly.length} hours; range €${hMin.toFixed(0)} to €${hMax.toFixed(0)} per MWh`}
            >
              <Sparkline values={todayCurve} color="var(--teal)" height={32} />
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)', marginTop: '2px' }}>
              Today&apos;s LT price curve (24h)
            </p>
          </div>
        );
      })()}

      {/* Cross-border spread */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
        Cross-border: {crossBorder >= 0 ? '+' : ''}{'\u20AC'}{crossBorder.toFixed(1)}/MWh LT–SE4
      </p>

      {/* Daily-swing sparkline. Phase 38.2 — the label is COMPUTED from the
          series, never the window asked for: it read "14D daily swing" over
          two distinct dates for as long as the array was row-stamped. */}
      {history.length >= 2 && (() => {
        const vals = history.map(h => h.swing);
        const sMin = Math.min(...vals);
        const sMax = Math.max(...vals);
        const sLast = vals[vals.length - 1];
        const days = history.length;
        return (
          <div style={{ marginBottom: '6px' }}>
            <div
              role="img"
              aria-label={`Daily swing history, ${days} market ${days === 1 ? 'day' : 'days'} from ${history[0].date} to ${history[days - 1].date}; range €${sMin.toFixed(0)} to €${sMax.toFixed(0)} per MWh; latest €${sLast.toFixed(0)} per MWh`}
            >
              <Sparkline values={vals} color="var(--amber)" height={20} />
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mono-xs)', color: 'var(--text-ghost)', marginTop: '2px' }}>
              {days}D daily swing
            </p>
          </div>
        );
      })()}

      <p className="tier3-interp" style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 'var(--space-2xs)', marginRight: 0, marginBottom: 'var(--space-xs)', marginLeft: 0 }}>
        {interpretation(grossCapture, netCapture)}
      </p>

      <SourceFooter source="Nord Pool" updatedAt={formatTimestamp(data.updated_at)} dataClass="observed" />

      <div style={{ marginTop: 'var(--space-xs)' }}>
        <DetailsDrawer label="View spread capture detail">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)' }}>Source</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Nord Pool day-ahead hourly prices for the LT zone, ingested by the S1 worker (`/read`). The daily-swing sparkline and the canonical 4h gross capture both come from `/s1/capture` — one row per market day, so the day count in the label is the number of distinct days plotted rather than the number of rows stored (Phase 38.2). Today&apos;s 24h LT price curve is the worker&apos;s `lt_hourly_24` downsample (averaged across 15-min sub-bars where present).
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Computation</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Hero: gross_peak_trough_range = p_high_avg − p_low_avg (the raw DA envelope). Net: bess_net_capture deducts the regulated tariff RTE charge leg from the gross figure. Buy / Sell rows show the worker&apos;s averaged trough/peak prices used in the gross calculation. Cross-border: spread_eur_mwh = LT − SE4 average daily spread (sign matters; positive = LT premium).
          </p>

          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>Limitations</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Day-ahead only — intraday opportunities are not captured here. The gross peak-trough range overstates achievable capture for BESS because it ignores cycle constraints and tariff drag (which the net figure corrects for). RTE charges are tariff-current; future tariff revisions will shift the gross-to-net gap.
          </p>
        </DetailsDrawer>
      </div>
    </article>
  );
}
