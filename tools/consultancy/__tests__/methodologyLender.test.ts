// Phase 36.B6 — the lender-grade methodology document.
//
// A methodology document is a display surface, and discipline rule #2 applies to
// it exactly as it applies to a card label: it must not assert a value it did
// not compute. The document quotes engine constants, register state and
// measured results by hand — prose cannot be generated — so these tests bind the
// quoted figures to their sources. If a constant moves and the document does
// not, the suite fails and names the sentence that went stale.
//
// Only figures with a live source are bound. Historical measurements (a
// backtest window, a client-impact delta measured at a past commit) are
// deliberately NOT bound: they are records of what was observed on a date, and
// re-cutting them against a later engine would destroy their meaning.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../engine.mjs';
import { loadRegister, liveRows } from '../register.mjs';
import { METHODOLOGY_LENDER_PATH, buildAnnexHtml } from '../generate-pdf.mjs';
import {
  RESERVE_PRODUCTS, RTE_BOL, TRADING_REALISATION, RYSTAD_15MIN_UPLIFT_DECIMAL,
} from '../../../workers/fetch-s1.js';

type Any = Record<string, any>;

const doc = readFileSync(METHODOLOGY_LENDER_PATH, 'utf8');
const register = loadRegister() as Any;

describe('the document exists and is structured as specified', () => {
  it('lives where the render pipeline looks for it', () => {
    expect(METHODOLOGY_LENDER_PATH).toBe(join(REPO_ROOT, 'docs/methodology-lender.md'));
    expect(doc.length).toBeGreaterThan(20_000);
  });

  it('carries all eleven specified sections, in order', () => {
    const headings = [...doc.matchAll(/^## (\d\d) · (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  });

  it('leads section 09 with the limitation that matters most, not the easiest one', () => {
    const limitations = doc.slice(doc.indexOf('## 09 ·'), doc.indexOf('## 10 ·'));
    const first = limitations.match(/^### 9\.1 (.+)$/m);
    expect(first?.[1]).toMatch(/[Rr]eserve realisation is assumed/);
    // Every numbered limitation is present; the list is not a stub.
    const items = [...limitations.matchAll(/^### 9\.\d+ /gm)];
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it('renders through the shared annex wrapper without throwing', () => {
    const html = buildAnnexHtml({
      generatedAt: '2026-07-29', engineVersion: 'v7.3', runId: 'delivery-abcdef123456',
      sourcePath: METHODOLOGY_LENDER_PATH, title: 'T', lede: 'L',
    }) as string;
    expect(html).toContain('delivery-abcdef123456');
    expect(html).toContain('<h1');
    expect(html).toContain('<table>');   // the tables must survive the markdown render
    expect(html).toContain('<pre>');     // and so must the dispatch pseudocode
  });
});

describe('quoted engine constants tie to the code', () => {
  it('the trading-realisation ladder is the shipped one', () => {
    const t = TRADING_REALISATION as Any;
    expect(doc).toContain(
      `**Central ${t.base} / conservative ${t.conservative} / stress ${t.stress}**`
    );
  });

  it('the Downside/Upside anchors are the shipped client-scenario values', () => {
    const t = TRADING_REALISATION as Any;
    expect(doc).toContain(`${t.client_downside} (2025-09) and ${t.client_upside} (2026-05)`);
  });

  it('the measured sub-hourly uplift is the value the worker now holds', () => {
    expect(doc).toContain(`| weighted uplift | **${RYSTAD_15MIN_UPLIFT_DECIMAL}** |`);
  });

  it('the reserve prequalification durations are the engine\'s own', () => {
    const p = RESERVE_PRODUCTS as Any;
    expect(doc).toContain(
      `(FCR ${p.fcr.dur_req_h} h, aFRR ${p.afrr.dur_req_h.toFixed(1)} h, mFRR ${p.mfrr.dur_req_h} h)`
    );
    // And the worked example the text gives for aFRR must match that duration.
    expect(doc).toContain(
      `Committing 1 MW of aFRR reserves ${p.afrr.dur_req_h.toFixed(1)} MWh of SoC headroom in each direction`
    );
  });

  it('the duration anchors named as the calibration points are the ones the engine has', () => {
    expect(Object.keys(RTE_BOL)).toEqual(['h2', 'h4']);
    expect(doc).toContain('calibrated at exactly two durations, 2 h and 4 h');
  });
});

describe('quoted register state ties to the register', () => {
  it('names the register version in force', () => {
    expect(doc).toContain(register.version.id);
  });

  it('states the row count the register actually has', () => {
    expect(doc).toContain(`${register.rows.length} rows`);
  });

  it('the category table sums to the register\'s live + superseded total', () => {
    const table = doc.slice(doc.indexOf('| Category | Rows |'), doc.indexOf('Binding namespaces:'));
    const counts = [...table.matchAll(/^\| \w[\w-]* \| (\d+) \|/gm)].map((m) => Number(m[1]));
    // Eight from 36.E1: `price-formation` joined the seven original categories.
    expect(counts).toHaveLength(8);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(register.rows.length);
  });

  it('the closed decided_by vocabulary in §10.2 is the one the code enforces', () => {
    for (const key of ['operator', 'measurement', 'derived', 'governance']) {
      expect(doc).toContain(`| \`${key}\` |`);
    }
  });
});

describe('the reconciliation status is reported at full size', () => {
  it('enumerates every non-passing external check rather than summarising them away', () => {
    const s = doc.slice(doc.indexOf('### 7.3'), doc.indexOf('### 7.4'));
    expect(s).toMatch(/49 pass, 7 warn, 4 fail/);
    // Both distinct findings are named and neither is buried.
    expect(s).toMatch(/external_3_cycles_yr/);
    expect(s).toMatch(/external_1_project_irr/);
    expect(s).toMatch(/declared/);
  });

  it('keeps the cycling benchmark band at its sourced value', () => {
    const row = liveRows(register).find((r: Any) => r.id === 'cycles_efc_yr') as Any;
    expect(row.benchmark_band).toEqual([550, 720]);
    expect(row.sensitivity_range).toBeNull();
    expect(doc).toContain('**[550, 720] EFC/yr**');
    expect(doc).toContain(`comes in at **${row.value}**`);
  });
});

describe('the honesty constraints survive into the document', () => {
  it('says the P90 is unresolved wherever it reports one', () => {
    // Every table that carries a P90 from the five-year sample must mark it.
    expect(doc).toMatch(/P90 is \*\*not resolved\*\*|`resolved: false`/);
    expect(doc).toContain('P17–P83');
  });

  it('states that the measured correction increased dependence on the unmeasured component', () => {
    expect(doc).toContain('made the model more dependent on the component that has not been measured');
  });

  it('reports the simultaneity measurement as a range, not a point', () => {
    expect(doc).toContain('75.2 %–85.5 %');
    expect(doc).toContain('year-dependent');
  });

  // Market-state-dependent euro figures are NOT bound to the runner outputs:
  // binding them would make this suite a market-movement detector rather than a
  // code gate (the 34.5-C reasoning). What IS gated is that they carry their
  // as-at stamp and say plainly that they move — so a reader can never mistake
  // a projection for a measurement.
  it('stamps the market state behind every figure that moves with it', () => {
    expect(doc).toMatch(/\*\*as at the market state captured \d{4}-\d{2}-\d{2}\*\*/);
    expect(doc).toContain('**These figures move; the measured parameters do not.**');
    expect(doc).toMatch(/floor €[\d\s]+\/MW\/yr/);
    expect(doc).toMatch(/on the market state captured \d{4}-\d{2}-\d{2}/);
  });

  it('does not claim the degradation loop converges in two passes', () => {
    expect(doc).toContain('Convergence takes **three**');
    expect(doc).not.toMatch(/converges in (two|2) passes(?!.*does not)/);
  });
});

// ── §08B — per-service price formation (36.E1 + 36.E2) ──────────────────────────────────────
//
// The section quotes measured numbers. Prose that quotes a measurement can outlive it (rule #2),
// so the load-bearing figures are asserted against the calibration artifact rather than trusted to
// stay in step. What is checked is the NUMBER, not the wording around it.

describe('§08B ties to the price-formation calibration', () => {
  const cal = JSON.parse(
    readFileSync(join(REPO_ROOT, 'tools/consultancy/data/price-formation-calibration.json'), 'utf8'),
  ) as Any;
  const sec = doc.slice(doc.indexOf('## 08B ·'), doc.indexOf('## 09 ·'));

  it('exists, and says out loud that nothing is wired', () => {
    expect(sec.length).toBeGreaterThan(4000);
    expect(sec).toMatch(/[Nn]othing in this section is wired into the projection path/);
    expect(sec).toMatch(/does \*\*not\*\* replace `cpiCurve\(\)`/);
  });

  it('quotes the FCR arbitrage correlation the calibration measured', () => {
    expect(sec).toContain(String(cal.parameters.de_k.fcr.correlation_price_vs_arb.logs));
    expect(sec).toContain(String(cal.parameters.de_k.mfrr_up.correlation_price_vs_arb.logs));
  });

  it('quotes the accession counts, so the non-application is evidenced not asserted', () => {
    const a = cal.parameters.accession_constraint.quarter_hour_counts;
    expect(sec).toContain(a['AT|aFRR'].post.toLocaleString('en-US'));
    expect(sec).toContain(a['DE|aFRR'].post.toLocaleString('en-US'));
    expect(sec).toContain(String(a['AT|mFRR'].pre));
    expect(sec).toMatch(/explicit non-application/i);
  });

  it('quotes the per-direction activation measurements', () => {
    const d = cal.parameters.afrr_activation_de.per_direction;
    expect(sec).toContain(d.up.p50.toFixed(2));
    expect(sec).toContain(d.down.p50.toFixed(2));
    expect(sec).toContain(cal.parameters.afrr_activation_de.total_isp_in_window.toLocaleString('en-US'));
  });

  it('quotes the convergence rates and their t-statistics', () => {
    for (const svc of ['fcr', 'afrr_up', 'afrr_down']) {
      expect(sec, svc).toContain(cal.parameters.convergence[svc].lambda_per_yr.toFixed(3));
    }
  });

  it('quotes the direction-split band at both ends', () => {
    const b = cal.parameters.baltic_direction_split_sensitivity;
    for (const mode of ['de_shape', 'even']) {
      expect(sec, mode).toContain(Math.round(b.band[mode].down_revenue_eur_mw_yr).toLocaleString('en-US'));
    }
  });

  it('reports the reproduction MISS rather than only the passes', () => {
    expect(sec).toMatch(/MISS/);
    expect(sec).toMatch(/tolerance was not relaxed/i);
  });

  it('states the limitations the section does not yet support', () => {
    expect(sec).toMatch(/mFRR is not modelled here/);
    expect(sec).toMatch(/Baltic window is 10 months/);
  });
});
