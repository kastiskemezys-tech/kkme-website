'use client';

/**
 * /calculator — result rendering, both tiers.
 *
 * Phase 35.2. Split from Calculator.tsx so the form/state shell and the
 * (much larger) presentation stay separately readable.
 *
 * Design discipline: existing tokens only, tabular numerals on every figure,
 * no engine-emitted state strings surfaced as chips (rule #6) — the only chips
 * here are quantitative, and the scenario names are the client's own contract
 * labels, not engine status.
 */

import { useState } from 'react';
import {
  eur, eurExact, pct, irrPct,
  type BridgeLine, type FullResult, type SampleResult, type Headline,
  type SensitivityRow, type Upsell, type DurationNote,
} from './calculatorApi';

// Single-column grids declare an explicit minmax(0, 1fr) track. An implicit
// grid track is sized min-width:auto, so a wide child — the 20-year cash-flow
// table — stretches the whole page instead of scrolling inside its own
// overflow-x container. Caught by the 35.2 build gate, not by any unit test.
const GRID_COL = { gridTemplateColumns: 'minmax(0, 1fr)' } as const;

const mono = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } as const;

const labelStyle = {
  ...mono,
  fontSize: 'var(--font-xs)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
};

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-card)',
  padding: 'var(--space-md)',
};

// ── Shared pieces ──────────────────────────────────────────────────────────

export function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <h2 style={{ ...labelStyle, margin: 0 }}>{children}</h2>
      {note && (
        <p style={{
          fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
          color: 'var(--text-tertiary)', margin: 'var(--space-2xs) 0 0', maxWidth: '62ch',
        }}>{note}</p>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...labelStyle, fontSize: '10px', marginBottom: 'var(--space-2xs)' }}>{label}</div>
      <div style={{ ...mono, fontSize: 'var(--font-lg)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function HeadlineRow({ headline }: { headline: Headline }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 'var(--space-md)',
      ...cardStyle,
    }}>
      <KpiTile label="Gross revenue Y1" value={eur(headline.gross_y1)} />
      <KpiTile label="Net market revenue" value={eur(headline.net_y1)} />
      <KpiTile label="EBITDA Y1" value={eur(headline.ebitda_y1)} sub={pct(headline.ebitda_margin_pct)} />
      <KpiTile label="Pre-financing CF Y1" value={eur(headline.prefin_cf_y1)} />
    </div>
  );
}

/** The 8-line bridge. `expandable` reveals the per-line basis in the full tier. */
export function BridgeTable({ lines, expandable }: { lines: BridgeLine[]; expandable: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '380px' }}>
        <tbody>
          {lines.map((line) => {
            const isOpen = open === line.key;
            const canOpen = expandable && !!line.formula;
            return (
              <tr key={line.key}>
                <td colSpan={2} style={{ padding: 0 }}>
                  <div
                    onClick={canOpen ? () => setOpen(isOpen ? null : line.key) : undefined}
                    role={canOpen ? 'button' : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    onKeyDown={canOpen ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : line.key); }
                    } : undefined}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      gap: 'var(--space-sm)',
                      padding: 'var(--space-xs) var(--space-md)',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: line.sub ? 'transparent' : 'var(--bg-elevated)',
                      cursor: canOpen ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{
                      fontFamily: line.sub ? 'var(--font-serif)' : 'var(--font-mono)',
                      fontSize: line.sub ? 'var(--font-sm)' : 'var(--font-xs)',
                      letterSpacing: line.sub ? 'normal' : '0.08em',
                      textTransform: line.sub ? 'none' : 'uppercase',
                      color: line.sub ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      paddingLeft: line.sub ? 'var(--space-sm)' : 0,
                    }}>
                      {line.label}
                      {canOpen && (
                        <span style={{ color: 'var(--text-faint)', marginLeft: 'var(--space-2xs)' }}>
                          {isOpen ? '−' : '+'}
                        </span>
                      )}
                    </span>
                    <span style={{
                      ...mono,
                      fontSize: line.sub ? 'var(--font-sm)' : 'var(--font-base)',
                      color: line.sub ? 'var(--text-secondary)' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                    }}>
                      {line.sub && line.value > 0 ? '−' : ''}{eurExact(Math.abs(line.value))}
                    </span>
                  </div>
                  {isOpen && line.formula && (
                    <div style={{
                      padding: 'var(--space-xs) var(--space-md)',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'var(--bg-card-highlight)',
                      fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
                      color: 'var(--text-tertiary)', maxWidth: '72ch',
                    }}>
                      {line.formula}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DurationNoteBlock({ note }: { note: DurationNote }) {
  return (
    <div style={{
      ...cardStyle,
      borderLeft: '2px solid var(--accent-amber)',
      fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
      color: 'var(--text-tertiary)', maxWidth: '72ch',
    }}>
      <div style={{ ...labelStyle, marginBottom: 'var(--space-2xs)' }}>
        Duration {note.actual_duration_h}h → modelled at {note.modelled_at_duration_h}h
      </div>
      <p style={{ margin: '0 0 var(--space-2xs)' }}>{note.revenue_basis}</p>
      <p style={{ margin: '0 0 var(--space-2xs)' }}>{note.capex_basis}</p>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{note.direction}</p>
    </div>
  );
}

// ── Sample tier ────────────────────────────────────────────────────────────

export function SampleBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2xs)',
      border: '1px solid var(--border-highlight)',
      padding: 'var(--space-2xs) var(--space-xs)',
      ...labelStyle,
      color: 'var(--text-secondary)',
    }}>
      <span aria-hidden style={{
        width: '6px', height: '6px', background: 'var(--text-faint)', display: 'inline-block',
      }} />
      Sample output
    </div>
  );
}

export function UpsellCard({ upsell }: { upsell: Upsell }) {
  return (
    <div style={{ ...cardStyle, borderTop: '3px solid var(--accent-purple)' }}>
      <div style={{ ...labelStyle, marginBottom: 'var(--space-xs)' }}>{upsell.headline}</div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 0 var(--space-sm)',
        display: 'grid', gap: 'var(--space-2xs)',
      }}>
        {upsell.items.map((item) => (
          <li key={item} style={{
            fontFamily: 'var(--font-serif)', fontSize: 'var(--font-base)',
            color: 'var(--text-secondary)',
          }}>
            <span aria-hidden style={{ color: 'var(--text-faint)', marginRight: 'var(--space-xs)' }}>—</span>
            {item}
          </li>
        ))}
      </ul>
      <p style={{
        fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
        color: 'var(--text-tertiary)', margin: '0 0 var(--space-sm)',
      }}>
        {upsell.terms}
      </p>
      <ContactLink upsell={upsell} />
    </div>
  );
}

export function ContactLink({ upsell, echo }: { upsell: Upsell; echo?: string }) {
  const subject = encodeURIComponent('BESS Revenue Calculator — full analysis enquiry');
  const body = encodeURIComponent(
    echo
      ? `Configuration from the calculator:\n\n${echo}\n\n`
      : ''
  );
  return (
    <a
      href={`mailto:${upsell.contact_email}?subject=${subject}${body ? `&body=${body}` : ''}`}
      style={{
        ...mono, fontSize: 'var(--font-sm)',
        color: 'var(--text-primary)',
        borderBottom: '1px solid var(--border-highlight)',
        textDecoration: 'none', paddingBottom: '2px',
      }}
    >
      {upsell.contact_email}
    </a>
  );
}

export function SampleResults({ result }: { result: SampleResult }) {
  const e = result.inputs_echo;
  const echo =
    `${e.mw} MW / ${e.mwh} MWh (${e.duration_h}h) · COD ${e.cod_year} · €${e.capex_eur_kwh}/kWh`;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-md)', ...GRID_COL }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <SectionTitle>Year 1 — {echo}</SectionTitle>
        <SampleBadge />
      </div>

      <HeadlineRow headline={result.headline} />
      {e.duration_note && <DurationNoteBlock note={e.duration_note} />}
      {e.cycles_note && (
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)', margin: 0, maxWidth: '72ch' }}>
          {e.cycles_note}
        </p>
      )}

      <div style={{ minWidth: 0 }}>
        <SectionTitle>Revenue bridge — year 1</SectionTitle>
        <BridgeTable lines={result.bridge_y1} expandable={false} />
      </div>

      <p style={{
        fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)',
        color: 'var(--text-muted)', margin: 0, maxWidth: '72ch',
      }}>
        {result.sample_note}
      </p>

      <UpsellCard upsell={result.upsell} />
    </div>
  );
}

// ── Full tier ──────────────────────────────────────────────────────────────

function ScenarioCard({ s, highlight }: { s: { label: string; headline: Headline; sum_20yr_prefin_cf: number; project_irr: number | null }; highlight: boolean }) {
  return (
    <div style={{
      ...cardStyle,
      borderTop: `3px solid ${highlight ? 'var(--accent-purple)' : 'var(--border-card)'}`,
    }}>
      <div style={{ ...labelStyle, marginBottom: 'var(--space-xs)' }}>{s.label}</div>
      <div style={{ ...mono, fontSize: 'var(--font-lg)', color: 'var(--text-primary)' }}>
        {eur(s.headline.ebitda_y1)}
      </div>
      <div style={{ ...labelStyle, fontSize: '10px', marginTop: '2px' }}>EBITDA Y1</div>
      <div style={{ display: 'grid', gap: 'var(--space-2xs)', marginTop: 'var(--space-sm)', ...GRID_COL }}>
        <Row k="Gross Y1" v={eur(s.headline.gross_y1)} />
        <Row k="Margin" v={pct(s.headline.ebitda_margin_pct)} />
        <Row k="20-yr pre-fin CF" v={eur(s.sum_20yr_prefin_cf)} />
        <Row k="Engine project IRR" v={irrPct(s.project_irr)} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)' }}>{k}</span>
      <span style={{ ...mono, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );
}

function SensitivityTable({ rows, basis }: { rows: SensitivityRow[]; basis: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 3);
  const max = Math.max(...rows.map((r) => r.swing), 1);
  return (
    <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
        <thead>
          <tr>
            {['Driver', 'Down', 'Up', 'Δ EBITDA Y1', ''].map((h, i) => (
              <th key={h + i} style={{
                ...labelStyle, fontSize: '10px', textAlign: i >= 1 && i <= 3 ? 'right' : 'left',
                padding: 'var(--space-xs) var(--space-md)',
                borderBottom: '1px solid var(--border-card)', fontWeight: 400,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td style={{
                padding: 'var(--space-xs) var(--space-md)', borderBottom: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-serif)', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)',
              }}>
                {r.label}
                <span style={{ ...mono, fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'var(--space-xs)' }}>
                  {r.central_display}
                </span>
              </td>
              <td style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textAlign: 'right', padding: 'var(--space-xs) var(--space-md)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                {r.down_display}
              </td>
              <td style={{ ...mono, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textAlign: 'right', padding: 'var(--space-xs) var(--space-md)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                {r.up_display}
              </td>
              <td style={{ ...mono, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', textAlign: 'right', padding: 'var(--space-xs) var(--space-md)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                {r.swing === 0 ? '0' : `±${eur(r.swing / 2)}`}
              </td>
              <td style={{ padding: 'var(--space-xs) var(--space-md)', borderBottom: '1px solid var(--border-subtle)', width: '25%', minWidth: '80px' }}>
                <div aria-hidden style={{ height: '4px', background: 'var(--bg-card-highlight)' }}>
                  <div style={{
                    height: '100%', width: `${(r.swing / max) * 100}%`,
                    background: r.swing === 0 ? 'var(--text-ghost)' : 'var(--accent-purple)',
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: 'var(--space-xs) var(--space-md)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: '10px', color: 'var(--text-muted)' }}>
          Basis EBITDA Y1 {eurExact(basis)}
        </span>
        {rows.length > 3 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{
              ...labelStyle, background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, color: 'var(--text-secondary)',
            }}
          >
            {showAll ? 'Show top 3' : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function CashflowTable({ result }: { result: FullResult }) {
  const years = result.bridge_20yr;
  return (
    <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...labelStyle, fontSize: '10px', textAlign: 'left', padding: 'var(--space-xs) var(--space-sm)', borderBottom: '1px solid var(--border-card)', position: 'sticky', left: 0, background: 'var(--bg-page)', fontWeight: 400 }}>
              Year
            </th>
            {years.map((y) => (
              <th key={y.yr} style={{ ...mono, fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', padding: 'var(--space-xs) var(--space-sm)', borderBottom: '1px solid var(--border-card)', fontWeight: 400 }}>
                {y.cal_year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([
            ['Gross', 'gross_market_revenues'],
            ['EBITDA', 'project_ebitda'],
            ['Capex', 'maintenance_capex'],
            ['Pre-fin CF', 'pre_financing_cf'],
          ] as const).map(([label, key]) => (
            <tr key={key}>
              <td style={{ ...labelStyle, fontSize: '10px', padding: 'var(--space-xs) var(--space-sm)', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', left: 0, background: 'var(--bg-page)', whiteSpace: 'nowrap' }}>
                {label}
              </td>
              {years.map((y) => {
                const v = key === 'maintenance_capex'
                  ? y.maintenance_capex + y.augmentation_capex + y.replacement_capex
                  : y[key];
                return (
                  <td key={y.yr} style={{ ...mono, fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'right', padding: 'var(--space-xs) var(--space-sm)', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                    {eur(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FullResults({ result }: { result: FullResult }) {
  const e = result.inputs_echo;
  const r = result.returns;
  const recon = result.reconciliation;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)', ...GRID_COL }}>
      <div style={{ minWidth: 0 }}>
        <SectionTitle>
          {e.mw} MW / {e.mwh} MWh ({e.duration_h}h) · COD {e.cod_year} · €{e.capex_eur_kwh}/kWh · {e.scenario}
        </SectionTitle>
        <HeadlineRow headline={result.headline} />
      </div>

      {e.duration_note && <DurationNoteBlock note={e.duration_note} />}

      <div style={{ minWidth: 0 }}>
        <SectionTitle note={r.basis}>Returns</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-md)', ...cardStyle }}>
          <KpiTile label={`NPV @ ${(r.wacc * 100).toFixed(0)}%`} value={eur(r.npv_pre_financing_pre_tax)} />
          <KpiTile label="MOIC" value={r.moic != null ? `${r.moic.toFixed(2)}×` : 'n/a'} />
          <KpiTile label="Payback" value={r.payback_years != null ? `${r.payback_years} yr` : 'n/a'} />
          <KpiTile label="Gross CAPEX" value={eur(r.gross_capex)} />
          <KpiTile label="Engine project IRR" value={irrPct(r.engine_project_irr)} sub="post-tax, geared" />
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <SectionTitle note="Each line expands to the basis it was computed from.">
          Revenue bridge — year 1
        </SectionTitle>
        <BridgeTable lines={result.bridge_y1} expandable />
      </div>

      <div style={{ minWidth: 0 }}>
        <SectionTitle>Scenarios</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-sm)' }}>
          {(['downside', 'central', 'upside'] as const).map((k) => (
            <ScenarioCard key={k} s={result.scenarios[k]} highlight={k === e.scenario} />
          ))}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <SectionTitle note={result.sensitivity.note}>Sensitivity</SectionTitle>
        <SensitivityTable rows={result.sensitivity.rows} basis={result.sensitivity.basis_ebitda_y1} />
      </div>

      <div style={{ minWidth: 0 }}>
        <SectionTitle>20-year cash flow</SectionTitle>
        <CashflowTable result={result} />
      </div>

      {recon && (
        <div style={{ minWidth: 0 }}>
          <SectionTitle note={recon.note}>Reconciliation</SectionTitle>
          <div style={{ ...cardStyle, display: 'grid', gap: 'var(--space-2xs)', maxWidth: '48ch', ...GRID_COL }}>
            <Row k="Engine cost stack Y1" v={eurExact(recon.engine_stack_y1)} />
            <Row k="Client 4-line stack Y1" v={eurExact(recon.client_stack_y1)} />
            <Row k="Delta" v={`${eurExact(recon.delta)} (${recon.delta_pct != null ? (recon.delta_pct * 100).toFixed(2) : 'n/a'}%)`} />
            <div style={{ marginTop: 'var(--space-2xs)', ...mono, fontSize: '10px', color: 'var(--text-muted)' }}>
              {recon.within_2pct ? 'Within ±2%' : recon.within_5pct ? 'Within ±5%' : 'Outside ±5%'}
            </div>
          </div>
        </div>
      )}

      {result.warranty.warranty_efc_yr != null && (
        <div style={{ minWidth: 0 }}>
          <SectionTitle>Cycling</SectionTitle>
          <div style={{ ...cardStyle, display: 'grid', gap: 'var(--space-2xs)', maxWidth: '48ch', ...GRID_COL }}>
            <Row k="Modelled EFC/yr" v={result.warranty.efcs_per_year != null ? Math.round(result.warranty.efcs_per_year).toLocaleString('en-US') : 'n/a'} />
            <Row k="Warranty cap" v={result.warranty.warranty_efc_yr.toLocaleString('en-US')} />
            <Row k="Headroom" v={result.warranty.headroom_efc_yr != null ? result.warranty.headroom_efc_yr.toLocaleString('en-US') : 'n/a'} />
          </div>
        </div>
      )}
    </div>
  );
}
