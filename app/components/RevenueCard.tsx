'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  MetricTile, StatusChip, SourceFooter, DetailsDrawer, ImpactLine,
} from '@/app/components/primitives';
import { CopyButton } from './CopyButton';
import { copyToClipboard, formatTable } from '@/app/lib/copyUtils';
import type { ImpactState } from '@/app/lib/types';

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

// ── types ───────────────────────────────────────────────────────────────────

interface TrajPoint { year: number; sd_ratio: number; phase: string; cpi: number; }

interface MarketRow {
  country: string; flag: string;
  irr_pct: number | null; net_annual_per_mw: number | null;
  capex_per_mw: number | null; note: string; is_live: boolean;
}

interface RevenueData {
  project_irr:      number | null;
  equity_irr:       number | null;
  min_dscr:         number | null;
  bankability:      string | null;
  gross_revenue_y1: number | null;
  net_revenue_y1:   number | null;
  capacity_y1:      number | null;
  activation_y1:    number | null;
  arbitrage_y1:     number | null;
  rtm_fees_y1:      number | null;
  opex_y1:          number | null;
  ebitda_y1:        number | null;
  net_mw_yr:        number | null;
  cod_year:         number | null;
  sd_ratio:         number | null;
  phase:            string | null;
  cpi_at_cod:       number | null;
  fleet_trajectory: TrajPoint[] | null;
  prices_source:    string | null;
  model_version:    string | null;
  updated_at:       string | null;
  eu_ranking:       MarketRow[];
  irr_2h: number | null;
  irr_4h: number | null;
}

interface S2Data {
  sd_ratio:   number | null;
  phase:      string | null;
  trajectory: TrajPoint[] | null;
}

type Duration = '2h' | '4h';
type Case = 'base' | 'high';
type CodYear = '2027' | '2028' | '2029';

// ── helpers ─────────────────────────────────────────────────────────────────

function irrPct(v: number | null | undefined): number | null {
  if (v == null || !isFinite(v)) return null;
  return Math.round(v * 1000) / 10;
}

function fmtPct(v: number | null, d = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(d)}%`;
}

function fmtKPerMw(n: number | null | undefined, mw = 50): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${Math.round(n / mw / 1000)}k`;
}

function fmtEuro(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `€${n.toLocaleString('en-GB')}`;
}

function irrColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v > 12) return 'var(--teal)';
  if (v > 8)  return 'var(--amber)';
  return 'var(--rose)';
}

function hurdleStatus(irr: number | null, dscr: number | null): { label: string; sentiment: 'positive' | 'caution' | 'negative' } {
  if (irr != null && irr > 12 && dscr != null && dscr >= 1.20)
    return { label: 'Above model hurdle', sentiment: 'positive' };
  if (irr != null && irr > 8 && dscr != null && dscr >= 1.0)
    return { label: 'Near model hurdle', sentiment: 'caution' };
  return { label: 'Below model hurdle', sentiment: 'negative' };
}

function impactFromIrr(irr: number | null): { impact: ImpactState; desc: string } {
  if (irr != null && irr > 12) return {
    impact: 'slight_positive',
    desc: 'Reference asset: Returns above model hurdles at current assumptions',
  };
  if (irr != null && irr > 8) return {
    impact: 'mixed',
    desc: 'Reference asset: Near hurdle — COD timing and CAPEX level are the dominant variables',
  };
  return {
    impact: 'slight_negative',
    desc: 'Reference asset: Below hurdle — viability requires different timing or cost assumptions',
  };
}

// ── pill selector ───────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        letterSpacing: '0.05em',
        padding: '3px 10px',
        border: `1px solid ${active ? 'rgba(0,180,160,0.40)' : 'var(--border-card)'}`,
        background: active ? 'var(--teal-bg)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        borderRadius: '2px',
      }}
    >{label}</button>
  );
}

// ── share view button ────────────────────────────────────────────────────

function ShareViewButton() {
  const [label, setLabel] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleShare = async () => {
    const ok = await copyToClipboard(window.location.href);
    setLabel(ok ? 'copied' : 'failed');
    setTimeout(() => setLabel('idle'), 1500);
  };

  const text = label === 'copied' ? 'Link copied' : label === 'failed' ? 'Copy failed' : 'Share this view';
  const color = label === 'copied' ? 'var(--teal)' : label === 'failed' ? 'var(--rose)' : undefined;

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        all: 'unset',
        display: 'inline-flex',
        alignItems: 'flex-end',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: color ?? 'var(--text-ghost)',
        cursor: 'pointer',
        padding: '4px 0',
        transition: 'color 150ms ease',
        minHeight: '28px',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (label === 'idle') e.currentTarget.style.color = 'var(--text-muted)'; }}
      onMouseLeave={e => { if (label === 'idle') e.currentTarget.style.color = 'var(--text-ghost)'; }}
    >
      {text}
    </button>
  );
}

// ── main export ─────────────────────────────────────────────────────────────

export function RevenueCard() {
  const [duration, setDuration] = useState<Duration>('2h');
  const [capexCase, setCapexCase] = useState<Case>('base');
  const [cod, setCod] = useState<CodYear>('2028');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [data2h, setData2h] = useState<RevenueData | null>(null);
  const [data4h, setData4h] = useState<RevenueData | null>(null);
  const [s2, setS2] = useState<S2Data | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  // Sensitivity matrix state
  const [matrixData, setMatrixData] = useState<Record<string, number | null>>({});
  const [matrixStatus, setMatrixStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // "Why it moved" state
  const [movedLine, setMovedLine] = useState<string | null>(null);
  const [prevSnapshot, setPrevSnapshot] = useState<{ irr: number | null; dscr: number | null; ebitda: number | null } | null>(null);
  const [lastChanged, setLastChanged] = useState<string | null>(null);

  const capex = capexCase === 'high' ? 'high' : 'mid';

  // URL param persistence — read on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlDur = params.get('dur');
    const urlCase = params.get('case');
    const urlCod = params.get('cod');
    if (urlDur === '4h') setDuration('4h');
    if (urlCase === 'high') setCapexCase('high');
    if (urlCod && ['2027', '2028', '2029'].includes(urlCod)) setCod(urlCod as CodYear);
  }, []);

  // URL param persistence — write on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (duration !== '2h') params.set('dur', duration);
    if (capexCase !== 'base') params.set('case', capexCase);
    if (cod !== '2028') params.set('cod', cod);
    const search = params.toString();
    window.history.replaceState({}, '', search ? `?${search}` : window.location.pathname);
  }, [duration, capexCase, cod]);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const common = { capex, grant: 'none', cod };
      const [rev2h, rev4h, s2r] = await Promise.all([
        fetch(`${WORKER_URL}/revenue?${new URLSearchParams({ mw: '50', mwh: '100', ...common })}`).then(r => r.json()),
        fetch(`${WORKER_URL}/revenue?${new URLSearchParams({ mw: '50', mwh: '200', ...common })}`).then(r => r.json()),
        fetch(`${WORKER_URL}/s2`).then(r => r.json()).catch(() => null),
      ]);
      setData2h(rev2h as RevenueData);
      setData4h(rev4h as RevenueData);
      setS2(s2r as S2Data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [capex, cod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sensitivity matrix — fetch all 6 scenarios for selected duration
  useEffect(() => {
    const mwh = duration === '4h' ? '200' : '100';
    const scenarios = [
      { cod: '2027', capex: 'mid', key: '2027_mid' },
      { cod: '2027', capex: 'high', key: '2027_high' },
      { cod: '2028', capex: 'mid', key: '2028_mid' },
      { cod: '2028', capex: 'high', key: '2028_high' },
      { cod: '2029', capex: 'mid', key: '2029_mid' },
      { cod: '2029', capex: 'high', key: '2029_high' },
    ];
    setMatrixStatus('loading');
    Promise.allSettled(
      scenarios.map(s =>
        fetch(`${WORKER_URL}/revenue?${new URLSearchParams({ mw: '50', mwh, capex: s.capex, grant: 'none', cod: s.cod })}`)
          .then(r => r.json())
          .then(d => ({ key: s.key, irr: irrPct((d as RevenueData).project_irr) }))
      )
    ).then(results => {
      const md: Record<string, number | null> = {};
      let anySuccess = false;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          md[r.value.key] = r.value.irr;
          anySuccess = true;
        } else {
          md[scenarios[i].key] = null;
        }
      });
      setMatrixData(md);
      setMatrixStatus(anySuccess ? 'success' : 'error');
    }).catch(() => setMatrixStatus('error'));
  }, [duration]);

  // "Why it moved" — compute after data arrives
  useEffect(() => {
    if (status !== 'success') return;
    const selected = duration === '4h' ? data4h : data2h;
    if (!selected || !prevSnapshot || !lastChanged) return;

    const newIrr = irrPct(selected.project_irr);
    const newDscr = selected.min_dscr;
    const irrDelta = (newIrr != null && prevSnapshot.irr != null) ? newIrr - prevSnapshot.irr : null;

    // Only show "why it moved" if delta is meaningful (>= 0.5pp IRR)
    const absIrrDelta = irrDelta != null ? Math.abs(irrDelta) : 0;
    let line: string | null = null;

    if (absIrrDelta < 0.5 && lastChanged !== 'duration') {
      // Small changes don't warrant explanation
      setMovedLine(null);
      return;
    }

    if (lastChanged === 'cod' && irrDelta != null && absIrrDelta >= 0.5) {
      const sdStr = selected.sd_ratio != null ? ` (S/D ${selected.sd_ratio.toFixed(2)}×)` : '';
      line = `COD ${cod}${sdStr}. IRR moved ${irrDelta >= 0 ? '+' : ''}${irrDelta.toFixed(1)}pp.`;
    } else if (lastChanged === 'capex' && irrDelta != null && absIrrDelta >= 0.5) {
      if (newDscr != null && prevSnapshot.dscr != null) {
        line = `Higher installed cost compresses debt coverage. DSCR moved from ${prevSnapshot.dscr.toFixed(2)}× to ${newDscr.toFixed(2)}×.`;
      }
    } else if (lastChanged === 'duration' && irrDelta != null) {
      if (absIrrDelta < 0.5) {
        setMovedLine(null);
        return;
      }
      if (irrDelta < 0) {
        line = `4H increases capital intensity faster than it adds energy value at this cost level.`;
      } else {
        line = `4H captures enough additional energy value to offset the higher capital intensity at this cost level.`;
      }
    }
    setMovedLine(line);
  }, [status, data2h, data4h, duration, prevSnapshot, lastChanged, cod]);

  // Capture snapshot before control changes
  function captureAndChange(changed: string, fn: () => void) {
    const selected = duration === '4h' ? data4h : data2h;
    if (selected) {
      setPrevSnapshot({
        irr: irrPct(selected.project_irr),
        dscr: selected.min_dscr,
        ebitda: selected.ebitda_y1,
      });
    }
    setLastChanged(changed);
    fn();
  }

  const openDrawer = () => setDrawerKey(k => k + 1);

  // Selected data for single-duration displays
  const selected = duration === '4h' ? data4h : data2h;
  const selIrr = selected ? irrPct(selected.project_irr) : null;
  const selDscr = selected?.min_dscr ?? null;

  // ── loading / error states ──────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <article style={{ width: '100%' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Computing reference asset returns...
        </p>
      </article>
    );
  }

  if (status === 'error' || !data2h) {
    return (
      <article style={{ width: '100%' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
          Revenue model data unavailable
        </p>
      </article>
    );
  }

  // ── derived values ────────────────────────────────────────────────────

  const irr2h = irrPct(data2h.project_irr);
  const irr4h = data4h ? irrPct(data4h.project_irr) : null;
  const eqIrr2h = irrPct(data2h.equity_irr);
  const eqIrr4h = data4h ? irrPct(data4h.equity_irr) : null;
  const dscr2h = data2h.min_dscr;
  const dscr4h = data4h?.min_dscr ?? null;
  const hurdle2h = hurdleStatus(irr2h, dscr2h);
  const hurdle4h = hurdleStatus(irr4h, dscr4h);

  // Takeaway
  const takeawayBorder = selIrr != null && selIrr > 12
    ? 'var(--teal)' : selIrr != null && selIrr > 8
    ? 'var(--amber)' : 'var(--rose)';
  const irrSpread = (irr2h != null && irr4h != null) ? irr2h - irr4h : null;
  const durationTag = duration === '4h' ? '4H' : '2H';

  const dscrStr = selDscr != null ? `${selDscr.toFixed(2)}×` : '—';
  let takeawayText: string;
  if (selIrr != null && selIrr > 12) {
    if (irrSpread != null && Math.abs(irrSpread) >= 1.5) {
      const leader = irrSpread > 0 ? '2H' : '4H';
      takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, ${dscrStr} DSCR. ${leader} leads by ${Math.abs(irrSpread).toFixed(1)}pp — ${irrSpread > 0 ? 'capital efficiency outweighs the energy uplift at this cost' : 'the energy uplift justifies the capital step-up'}.`;
    } else {
      takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, ${dscrStr} DSCR. Both durations above hurdle at COD ${cod}.`;
    }
  } else if (selIrr != null && selIrr > 8) {
    takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}. Near model hurdle — COD timing is the dominant variable.`;
  } else {
    takeawayText = `${fmtPct(selIrr)} project IRR at ${durationTag}, COD ${cod}. Below hurdle — earlier timing or lower cost changes the outcome.`;
  }

  const { impact, desc: impactDesc } = impactFromIrr(selIrr);

  const ts = selected?.updated_at ?? data2h.updated_at ?? null;

  return (
    <article style={{ width: '100%' }}>
      {/* 1. HEADER */}
      <div style={{ marginBottom: '16px' }}>
        <h3
          onClick={openDrawer}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 500,
            marginBottom: '6px',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          Baltic reference asset returns
        </h3>
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          How timing, duration, and installed cost shape storage economics under current Baltic market conditions.
        </p>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginTop: '4px',
        }}>
          50MW modeled reference · observed + proxy + modeled inputs
        </p>
      </div>

      {/* 2. CENTRAL TAKEAWAY */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        background: 'var(--bg-elevated)',
        padding: '12px',
        borderLeft: `2px solid ${takeawayBorder}`,
        marginBottom: '16px',
        lineHeight: 1.6,
      }}>
        {takeawayText}
      </div>

      {/* 3. CONTROL STRIP */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 20px',
        marginBottom: '16px',
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Duration</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            <Pill label="2H" active={duration === '2h'} onClick={() => captureAndChange('duration', () => setDuration('2h'))} />
            <Pill label="4H" active={duration === '4h'} onClick={() => captureAndChange('duration', () => setDuration('4h'))} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Case</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            <Pill label="Base" active={capexCase === 'base'} onClick={() => captureAndChange('capex', () => setCapexCase('base'))} />
            <Pill label="High CAPEX" active={capexCase === 'high'} onClick={() => captureAndChange('capex', () => setCapexCase('high'))} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>COD</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {(['2027', '2028', '2029'] as const).map(yr => (
              <Pill key={yr} label={yr} active={cod === yr} onClick={() => captureAndChange('cod', () => setCod(yr))} />
            ))}
          </div>
        </div>
        <ShareViewButton />
      </div>

      {/* 4. "WHY IT MOVED" LINE */}
      {movedLine && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-tertiary)',
          marginBottom: '16px',
          lineHeight: 1.5,
        }}>
          {movedLine}
        </p>
      )}

      {/* 5. 2H vs 4H COMPARISON — side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '12px',
      }}>
        {/* 2H card */}
        <div style={{
          padding: '16px',
          border: `1px solid ${duration === '2h' ? 'var(--border-highlight)' : 'var(--border-card)'}`,
          borderLeft: duration === '2h' ? '2px solid var(--teal-subtle)' : undefined,
          background: duration === '2h' ? 'var(--bg-elevated)' : 'transparent',
          opacity: duration === '2h' ? 1 : 0.65,
          transition: 'opacity 150ms ease, border 150ms ease, background 150ms ease',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            50MW / 2H (100 MWh)
          </p>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Project IRR</span>
              {duration === '2h' && irr2h != null && <CopyButton value={fmtPct(irr2h)} label="Copy Project IRR" />}
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500, color: irrColor(irr2h), marginTop: '4px' }}>
              {fmtPct(irr2h)}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EBITDA/MW/yr</span>
                {duration === '2h' && data2h.ebitda_y1 != null && <CopyButton value={fmtEuro(Math.round(data2h.ebitda_y1 / 50))} label="Copy EBITDA/MW/yr" />}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                {data2h.ebitda_y1 != null ? fmtEuro(Math.round(data2h.ebitda_y1 / 50)) : '—'}
              </p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Min DSCR</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: irrColor(dscr2h != null && dscr2h >= 1.20 ? 13 : dscr2h != null && dscr2h >= 1.0 ? 10 : 5), marginTop: '2px' }}>
                {dscr2h != null ? `${dscr2h.toFixed(2)}×` : '—'}
              </p>
            </div>
          </div>
          <StatusChip status={hurdle2h.label} sentiment={hurdle2h.sentiment} />
        </div>

        {/* 4H card */}
        <div style={{
          padding: '16px',
          border: `1px solid ${duration === '4h' ? 'var(--border-highlight)' : 'var(--border-card)'}`,
          borderLeft: duration === '4h' ? '2px solid var(--teal-subtle)' : undefined,
          background: duration === '4h' ? 'var(--bg-elevated)' : 'transparent',
          opacity: duration === '4h' ? 1 : 0.65,
          transition: 'opacity 150ms ease, border 150ms ease, background 150ms ease',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            50MW / 4H (200 MWh)
          </p>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>Project IRR</span>
              {duration === '4h' && irr4h != null && <CopyButton value={fmtPct(irr4h)} label="Copy Project IRR" />}
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500, color: irrColor(irr4h), marginTop: '4px' }}>
              {fmtPct(irr4h)}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>EBITDA/MW/yr</span>
                {duration === '4h' && data4h?.ebitda_y1 != null && <CopyButton value={fmtEuro(Math.round(data4h.ebitda_y1 / 50))} label="Copy EBITDA/MW/yr" />}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                {data4h?.ebitda_y1 != null ? fmtEuro(Math.round(data4h.ebitda_y1 / 50)) : '—'}
              </p>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Min DSCR</span>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: irrColor(dscr4h != null && dscr4h >= 1.20 ? 13 : dscr4h != null && dscr4h >= 1.0 ? 10 : 5), marginTop: '2px' }}>
                {dscr4h != null ? `${dscr4h.toFixed(2)}×` : '—'}
              </p>
            </div>
          </div>
          <StatusChip status={hurdle4h.label} sentiment={hurdle4h.sentiment} />
        </div>
      </div>

      {/* Equity IRR — demoted below both cards */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}>
        Equity IRR: {fmtPct(eqIrr2h)} (2H) · {fmtPct(eqIrr4h)} (4H)
      </p>

      {/* Disclaimer */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
        opacity: 0.7,
        marginBottom: '20px',
      }}>
        Modeled scenario screen — not a lender credit assessment. Real bankability depends on revenue quality, downside coverage, covenant structure, and project-specific due diligence.
      </p>

      {/* 6. REVENUE BREAKDOWN — selected duration */}
      {selected && (() => {
        const waterfallRows = [
          { label: 'Capacity', value: fmtKPerMw(selected.capacity_y1) },
          { label: 'Activation', value: fmtKPerMw(selected.activation_y1) },
          { label: 'Arbitrage', value: fmtKPerMw(selected.arbitrage_y1) },
          { label: 'RTM fees', value: selected.rtm_fees_y1 != null ? `−${fmtKPerMw(selected.rtm_fees_y1)}` : '—' },
          { label: 'Gross revenue', value: fmtKPerMw(selected.gross_revenue_y1) },
          { label: 'OPEX', value: selected.opex_y1 != null ? `−${fmtKPerMw(selected.opex_y1)}` : '—' },
          { label: 'EBITDA', value: fmtKPerMw(selected.ebitda_y1) },
          { label: 'Net / MW', value: selected.net_mw_yr != null ? fmtEuro(selected.net_mw_yr) : '—' },
        ];
        return (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <CopyButton
              variant="text"
              label="Copy revenue breakdown"
              value={formatTable(
                ['Revenue breakdown', `${duration === '4h' ? '4H' : '2H'} · ${capexCase === 'high' ? 'High CAPEX' : 'Base'} · COD ${cod}`],
                waterfallRows.map(r => [r.label, r.value]),
              )}
            />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 20px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '8px',
          }}>
            {([
              { label: 'Capacity', value: fmtKPerMw(selected.capacity_y1), color: 'var(--text-secondary)' },
              { label: 'Activation', value: fmtKPerMw(selected.activation_y1), color: 'var(--text-secondary)' },
              { label: 'Arbitrage', value: fmtKPerMw(selected.arbitrage_y1), color: 'var(--text-secondary)' },
              { label: 'RTM fees', value: selected.rtm_fees_y1 != null ? `−${fmtKPerMw(selected.rtm_fees_y1)}` : '—', color: 'var(--text-muted)' },
              { label: 'Gross revenue', value: fmtKPerMw(selected.gross_revenue_y1), color: 'var(--text-primary)', bold: true, border: true },
              { label: 'OPEX', value: selected.opex_y1 != null ? `−${fmtKPerMw(selected.opex_y1)}` : '—', color: 'var(--rose)' },
              { label: 'EBITDA', value: fmtKPerMw(selected.ebitda_y1), color: 'var(--teal)', bold: true, border: true },
              { label: 'Net / MW', value: selected.net_mw_yr != null ? fmtEuro(selected.net_mw_yr) : '—', color: 'var(--text-secondary)' },
            ] as Array<{ label: string; value: string; color: string; bold?: boolean; border?: boolean }>).map(row => (
              <React.Fragment key={row.label}>
                <span style={{
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.04em',
                  paddingTop: row.border ? '6px' : undefined,
                  borderTop: row.border ? '1px solid var(--border-card)' : undefined,
                }}>{row.label}</span>
                <span style={{
                  color: row.color,
                  fontWeight: row.bold ? 500 : 400,
                  textAlign: 'right',
                  paddingTop: row.border ? '6px' : undefined,
                  borderTop: row.border ? '1px solid var(--border-card)' : undefined,
                }}>{row.value}</span>
              </React.Fragment>
            ))}
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
          }}>
            Per MW · Year 1 · {duration === '4h' ? '50 MW / 200 MWh' : '50 MW / 100 MWh'} · 20-year model
          </p>
        </div>
        );
      })()}

      {/* 6B. IRR SENSITIVITY MATRIX */}
      {matrixStatus === 'error' ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Sensitivity view temporarily unavailable
        </p>
      ) : (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              IRR sensitivity
            </p>
            {matrixStatus === 'success' && (
              <CopyButton
                variant="text"
                label="Copy IRR sensitivity matrix"
                value={formatTable(
                  ['COD', 'Base', 'High CAPEX'],
                  (['2027', '2028', '2029'] as const).map(yr => [
                    yr,
                    fmtPct(matrixData[`${yr}_mid`] ?? null),
                    fmtPct(matrixData[`${yr}_high`] ?? null),
                  ]),
                )}
              />
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Selected duration · Project IRR across COD and installed cost
          </p>
          {matrixStatus === 'loading' || matrixStatus === 'idle' ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', padding: '16px 0' }}>
              Loading sensitivity...
            </div>
          ) : (() => {
            const mxHdr: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', padding: '6px 8px', textAlign: 'center', letterSpacing: '0.06em', fontWeight: 500 };
            const mxRow: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)', padding: '8px', display: 'flex', alignItems: 'center', fontWeight: 500 };
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ padding: '4px 8px' }} />
                  <span style={mxHdr}>BASE</span>
                  <span style={mxHdr}>HIGH CAPEX</span>
                  {(['2027', '2028', '2029'] as const).map(yr => (
                    <React.Fragment key={yr}>
                      <span style={mxRow}>{yr}</span>
                      {(['mid', 'high'] as const).map(cx => {
                        const irr = matrixData[`${yr}_${cx}`] ?? null;
                        const isSelected = yr === cod && cx === capex;
                        const bg = irr != null && irr > 12 ? 'var(--teal-bg)'
                          : irr != null && irr > 8 ? 'var(--amber-bg)'
                          : irr != null ? 'var(--rose-bg)' : 'transparent';
                        return (
                          <div key={cx} style={{
                            textAlign: 'center', padding: '8px', background: bg,
                            border: isSelected ? '2px solid var(--border-highlight)' : '1px solid var(--border-card)',
                          }}>
                            <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '1rem', color: irrColor(irr), fontWeight: 400 }}>
                              {irr != null ? fmtPct(irr) : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                {(() => {
                  const codIrrs = (['2027', '2028', '2029'] as const).map(yr => matrixData[`${yr}_${capex}`]).filter((v): v is number => v != null);
                  const codSpread = codIrrs.length >= 2 ? Math.max(...codIrrs) - Math.min(...codIrrs) : 0;
                  const capexIrrs = (['mid', 'high'] as const).map(cx => matrixData[`${cod}_${cx}`]).filter((v): v is number => v != null);
                  const capexSpread = capexIrrs.length >= 2 ? Math.max(...capexIrrs) - Math.min(...capexIrrs) : 0;
                  const dur = duration === '4h' ? '4H' : '2H';
                  const summary = codSpread > capexSpread + 2
                    ? `For ${dur}, COD timing drives more IRR variance than installed cost at the current step.`
                    : capexSpread > codSpread + 2
                    ? `For ${dur}, installed cost drives more IRR variance than COD timing at the current step.`
                    : `For ${dur}, COD timing and installed cost have comparable impact on Project IRR.`;
                  return <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: '6px' }}>{summary}</p>;
                })()}
              </>
            );
          })()}
        </div>
      )}

      {/* 7. INTERPRETATION — explains WHY the numbers look like this */}
      {selected && (() => {
        // Revenue composition context
        const capShare = (selected.capacity_y1 != null && selected.gross_revenue_y1 != null && selected.gross_revenue_y1 > 0)
          ? Math.round((selected.capacity_y1 / selected.gross_revenue_y1) * 100) : null;
        const arbShare = (selected.arbitrage_y1 != null && selected.gross_revenue_y1 != null && selected.gross_revenue_y1 > 0)
          ? Math.round((selected.arbitrage_y1 / selected.gross_revenue_y1) * 100) : null;

        let interp = '';
        if (selIrr != null && selIrr > 15 && selDscr != null && selDscr > 1.5) {
          interp = `Capacity and activation income make up ${capShare != null ? `~${capShare}%` : 'the majority'} of gross revenue. At COD ${cod}, fleet competition has not yet compressed these prices enough to narrow the margin.`;
        } else if (selIrr != null && selIrr > 12) {
          interp = `Revenue is split between capacity income${capShare != null ? ` (~${capShare}%)` : ''} and arbitrage${arbShare != null ? ` (~${arbShare}%)` : ''}. At COD ${cod}, fleet growth has begun to tighten capacity clearing but has not eliminated the spread.`;
        } else if (selIrr != null && selIrr > 8) {
          interp = `Fleet additions by COD ${cod} compress capacity prices enough that small changes in timing or cost shift the outcome between viable and marginal. Arbitrage alone does not close the gap.`;
        } else {
          interp = `By COD ${cod}, fleet growth drives supply past the compression threshold. Capacity clearing prices fall, and the remaining arbitrage and activation revenue cannot cover the cost structure at this CAPEX level.`;
        }
        return (
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '0.9375rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            margin: '4px 0 16px',
          }}>
            {interp}
          </p>
        );
      })()}

      {/* 8. STACKING DISCLOSURE */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        marginBottom: '16px',
      }}>
        Revenue assumes hierarchical dispatch (FCR → aFRR → mFRR → arbitrage). Realised revenue is typically 65–80% of theoretical maximum. All capacity prices are Baltic-calibrated proxies. Interpret outputs as modeled directional economics.
      </p>

      {/* 9. IMPACT LINE */}
      <div style={{ marginBottom: '16px' }}>
        <ImpactLine impact={impact} description={impactDesc} />
      </div>

      {/* 10. SOURCE FOOTER */}
      <button type="button" onClick={openDrawer} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
        <SourceFooter
          source={`Model v5 · observed + proxy + modeled`}
          updatedAt={ts ? new Date(ts).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
          }) : undefined}
          dataClass="modeled"
        />
      </button>

      {/* 11. DETAILS DRAWER */}
      <div style={{ marginTop: '16px' }}>
        <DetailsDrawer key={drawerKey} label="View model detail and methodology" defaultOpen={drawerKey > 0}>
          {/* MODEL CONFIGURATION */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Model configuration
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '24px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Duration</span>
            <span style={{ color: 'var(--text-secondary)' }}>{duration === '4h' ? '4H (50 MW / 200 MWh)' : '2H (50 MW / 100 MWh)'}</span>
            <span style={{ color: 'var(--text-muted)' }}>Case</span>
            <span style={{ color: 'var(--text-secondary)' }}>{capexCase === 'high' ? 'High CAPEX (€262/kWh)' : 'Base (€164/kWh)'}</span>
            <span style={{ color: 'var(--text-muted)' }}>COD</span>
            <span style={{ color: 'var(--text-secondary)' }}>{cod}</span>
            <span style={{ color: 'var(--text-muted)' }}>Grant</span>
            <span style={{ color: 'var(--text-secondary)' }}>None</span>
          </div>

          {/* REVENUE DETAIL — both durations */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Revenue detail
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '24px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}></span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)' }}>2H</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)' }}>4H</span>
            {([
              { label: 'Capacity', k2: fmtKPerMw(data2h.capacity_y1), k4: fmtKPerMw(data4h?.capacity_y1) },
              { label: 'Activation', k2: fmtKPerMw(data2h.activation_y1), k4: fmtKPerMw(data4h?.activation_y1) },
              { label: 'Arbitrage', k2: fmtKPerMw(data2h.arbitrage_y1), k4: fmtKPerMw(data4h?.arbitrage_y1) },
              { label: 'RTM fees', k2: data2h.rtm_fees_y1 != null ? `−${fmtKPerMw(data2h.rtm_fees_y1)}` : '—', k4: data4h?.rtm_fees_y1 != null ? `−${fmtKPerMw(data4h.rtm_fees_y1)}` : '—' },
              { label: 'Gross', k2: fmtKPerMw(data2h.gross_revenue_y1), k4: fmtKPerMw(data4h?.gross_revenue_y1) },
              { label: 'OPEX', k2: data2h.opex_y1 != null ? `−${fmtKPerMw(data2h.opex_y1)}` : '—', k4: data4h?.opex_y1 != null ? `−${fmtKPerMw(data4h.opex_y1)}` : '—' },
              { label: 'EBITDA', k2: fmtKPerMw(data2h.ebitda_y1), k4: fmtKPerMw(data4h?.ebitda_y1) },
              { label: 'Net/MW/yr', k2: data2h.net_mw_yr != null ? fmtEuro(data2h.net_mw_yr) : '—', k4: data4h?.net_mw_yr != null ? fmtEuro(data4h.net_mw_yr) : '—' },
            ] as Array<{ label: string; k2: string; k4: string }>).map(r => (
              <React.Fragment key={r.label}>
                <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.k2}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{r.k4}</span>
              </React.Fragment>
            ))}
          </div>

          {/* FINANCING ASSUMPTIONS */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Financing assumptions
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '8px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Debt share</span>
            <span style={{ color: 'var(--text-secondary)' }}>55%</span>
            <span style={{ color: 'var(--text-muted)' }}>Interest rate</span>
            <span style={{ color: 'var(--text-secondary)' }}>4.5% all-in (ECB deposit 2.00% + modeled margin)</span>
            <span style={{ color: 'var(--text-muted)' }}>Tenor</span>
            <span style={{ color: 'var(--text-secondary)' }}>8 years</span>
            <span style={{ color: 'var(--text-muted)' }}>Grace period</span>
            <span style={{ color: 'var(--text-secondary)' }}>1 year</span>
            <span style={{ color: 'var(--text-muted)' }}>DSCR basis</span>
            <span style={{ color: 'var(--text-secondary)' }}>Minimum annual CFADS-based</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            DSCR appears stable across COD scenarios because debt is sized to maintain coverage — the debt quantum changes, not the ratio. Financing terms are modeled assumptions, not market quotes.
          </p>

          {/* ASSET LIFE AND AUGMENTATION */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Asset life and augmentation
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '8px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Degradation</span>
            <span style={{ color: 'var(--text-secondary)' }}>2.5%/yr</span>
            <span style={{ color: 'var(--text-muted)' }}>Augmentation</span>
            <span style={{ color: 'var(--text-secondary)' }}>Year 10, €25/kWh</span>
            <span style={{ color: 'var(--text-muted)' }}>Depreciation</span>
            <span style={{ color: 'var(--text-secondary)' }}>10yr on gross CAPEX</span>
            <span style={{ color: 'var(--text-muted)' }}>Tax</span>
            <span style={{ color: 'var(--text-secondary)' }}>17% Lithuanian CIT</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            Physical asset assumptions affect long-term DSCR profile.
          </p>

          {/* REVENUE QUALITY */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Revenue quality
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '8px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Revenue basis</span>
            <span style={{ color: 'var(--text-secondary)' }}>100% merchant-modeled</span>
            <span style={{ color: 'var(--text-muted)' }}>Dispatch</span>
            <span style={{ color: 'var(--text-secondary)' }}>Hierarchical (FCR → aFRR → mFRR → arb)</span>
            <span style={{ color: 'var(--text-muted)' }}>Activation</span>
            <span style={{ color: 'var(--text-secondary)' }}>Endogenous (aFRR 18%, mFRR 10%)</span>
            <span style={{ color: 'var(--text-muted)' }}>Capacity prices</span>
            <span style={{ color: 'var(--text-secondary)' }}>Proxy (AST Latvia calibrated)</span>
            <span style={{ color: 'var(--text-muted)' }}>Curtailment</span>
            <span style={{ color: 'var(--text-secondary)' }}>Not modeled</span>
          </div>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            Proxy flag applies until BTD measured data uploaded.
          </p>

          {/* REVENUE STREAM CONFIDENCE */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Revenue stream confidence
          </p>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            marginBottom: '8px',
          }}>
            {[
              { stream: 'Arbitrage', confidence: 'High', color: 'var(--teal)', reason: 'observable day-ahead spreads' },
              { stream: 'aFRR capacity', confidence: 'Medium', color: 'var(--amber)', reason: 'proxy prices, thin clearing depth' },
              { stream: 'mFRR capacity', confidence: 'Medium', color: 'var(--amber)', reason: 'proxy prices, growing but shallow' },
              { stream: 'FCR', confidence: 'Low', color: 'var(--rose)', reason: 'BBCM transition, no Baltic track record' },
            ].map(({ stream, confidence, color, reason }) => (
              <div key={stream} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{stream}</span>
                <span style={{ color, opacity: 0.75 }}>{confidence} · {reason}</span>
              </div>
            ))}
          </div>
          <p style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '8px',
          }}>
            Arbitrage is the most observable revenue stream — day-ahead prices are public and liquid. Balancing capacity prices remain proxy-based with thin clearing depth. FCR via BBCM has no Baltic operational track record yet.
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: '20px',
          }}>
            Conservative and stress scenarios adjust for confidence gaps in each stream.
          </p>

          {/* DATA CONFIDENCE */}
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '10px',
            fontWeight: 500,
          }}>
            Data confidence
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            marginBottom: '24px',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Arbitrage</span>
            <span style={{ color: 'var(--text-secondary)' }}>Observed/Derived (ENTSO-E A44)</span>
            <span style={{ color: 'var(--text-muted)' }}>Capacity prices</span>
            <span style={{ color: 'var(--text-secondary)' }}>Proxy (Baltic-calibrated, not clearing)</span>
            <span style={{ color: 'var(--text-muted)' }}>Fleet S/D</span>
            <span style={{ color: 'var(--text-secondary)' }}>Derived (manual fleet tracker)</span>
            <span style={{ color: 'var(--text-muted)' }}>CAPEX</span>
            <span style={{ color: 'var(--text-secondary)' }}>Reference (CH S1 2025 benchmarks)</span>
            <span style={{ color: 'var(--text-muted)' }}>Financing</span>
            <span style={{ color: 'var(--text-secondary)' }}>Observed (Euribor) + Modeled (margin)</span>
          </div>

          {/* METHODOLOGY — lowest emphasis, separated by divider */}
          <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '16px' }}>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '4px',
            opacity: 0.7,
          }}>
            Methodology
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            opacity: 0.6,
          }}>
            20-year DCF. Hierarchy dispatch. CPI from fleet S/D trajectory. 17% CIT, 10yr depreciation. CFADS-based DSCR. WACC 8%. Full model: BESS_Financial_Model_Visaginas_50MW v5.
          </p>
          </div>
        </DetailsDrawer>
      </div>
    </article>
  );
}
