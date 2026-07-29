/**
 * Phase 34.7 — branded client deliverable (HTML → PDF).
 *
 * Takes the client-approved Baltic-birch template and emits the delivered
 * document with every figure computed from the runner outputs.
 *
 * MECHANISM. The template is a structure mockup: its numbers are placeholders
 * typed into prose, not tokens. Anchored find-and-replace over a few hundred
 * scattered figures would leave the worst possible artefact — a document where
 * some numbers are real and some are placeholders, with no way to tell which.
 *
 * So the split is by anchor and the regeneration is by section:
 *
 *   PART 1  everything through <body>            — verbatim (fonts, CSS, print rules)
 *   PART 2  banner → section 10                  — REGENERATED from runner JSON
 *   PART 3  scope divider → EOF                  — verbatim (the v1.0 upsell)
 *
 * Both anchors must appear exactly once or the build throws, so a template
 * edit that moves them fails loudly instead of silently dropping content.
 * Part 2 contains no literal figures at all: every number is a call into the
 * runner outputs, which is what makes `verifyDeliverable()` able to prove the
 * HTML, the Excel and the engine agree.
 *
 * Usage:
 *   node tools/consultancy/generate-deliverable.mjs
 *   node tools/consultancy/generate-deliverable.mjs --verify-only
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, OUTPUT_DIR } from './engine.mjs';
import { recordArtefact } from './lib/runs.mjs';
import { loadInputs, operationalMwYears } from './generate-xlsx.mjs';

export const TEMPLATE_PATH = join(HERE, 'templates/prosperus-deliverable-template.html');
export const HTML_NAME = 'Prosperus_BESS_Model_v0.5.html';

const BODY_ANCHOR = '<body>';
const SCOPE_ANCHOR = '<!-- ══════════ SCOPE DIVIDER ══════════ -->';

// ── Formatting ─────────────────────────────────────────────────────────────

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** €1 234 567 — thin-space grouping, the template's convention. */
const eur0 = (n) => `€${Math.round(n).toLocaleString('en-GB').replace(/,/g, ' ')}`;
/** €12.9 M */
const eurM = (n, dp = 1) => `€${(n / 1e6).toFixed(dp)} M`;
/** 12 947 (thousands, unsigned) */
const k = (n) => Math.round(n / 1000).toLocaleString('en-GB').replace(/,/g, ' ');
const kSigned = (n) => (n < 0 ? `−${k(-n)}` : k(n));
const one = (n) => n.toFixed(1);
const two = (n) => n.toFixed(2);
const pctOf = (num, den, dp = 1) => `${((num / den) * 100).toFixed(dp)} %`;
/** Typographic minus everywhere, so the document never mixes - and −. */
const minus = (s) => String(s).replace(/-/g, '−');
const pctVal = (v, dp = 1) => minus(`${(v * 100).toFixed(dp)} %`);
const signedM = (n, dp = 1) => `${n < 0 ? '−' : '+'}€${Math.abs(n / 1e6).toFixed(dp)} M`;

// Reconciliation units come in three fraction flavours ('fraction',
// 'fraction of gross', 'fraction deviation'); all render as percentages.
const isFraction = (unit) => String(unit).startsWith('fraction');
const bandText = (c) => minus(isFraction(c.unit)
  ? `${(c.band[0] * 100).toFixed(0)}–${(c.band[1] * 100).toFixed(0)} %`
  : c.unit === 'EUR k/MW/yr' ? `€${c.band[0]}–${c.band[1]}k/MW/yr`
    : `${c.band[0]}–${c.band[1]} ${c.unit}`);
const actualText = (c) => (isFraction(c.unit) ? pctVal(c.actual) : minus(`${c.actual}`));

/** "a, b and c" */
const list = (xs) => (xs.length < 2 ? String(xs[0] ?? '—')
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const row = (cells) => `<tr>${cells}</tr>`;
const td = (v, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
const tdn = (v) => td(v, 'n r');
const th = (v, cls = '') => `<th${cls ? ` class="${cls}"` : ''}>${v}</th>`;

// ── Section builders ───────────────────────────────────────────────────────

/**
 * Print refinements the template's own CSS cannot carry, because they depend on
 * how many columns the data actually produces. The 20-year cash-flow table is
 * as wide as the portfolio's calendar span; on screen it scrolls inside
 * `.cf-scroll`, but a printed page cannot scroll, so it must be scaled to fit
 * or the last years would be silently clipped off the PDF.
 */
function printOverrides(inp) {
  const cols = inp.portfolio.bridge_20yr.length + 2;
  return `<style>
@page cfpage { size: A4 landscape; margin: 12mm; }
@media print {
  /* The cash-flow table is ${cols} columns wide — one per calendar year the
     portfolio spans. It gets its own landscape page rather than being shrunk
     to illegibility or silently clipped. */
  .cf-section { page: cfpage; break-before: page; break-after: page; }
  .cf-scroll { overflow: visible; }
  .cf-scroll table { min-width: 0 !important; width: 100% !important; font-size: ${cols > 20 ? '7.4' : '9'}px; table-layout: fixed; }
  .cf-scroll th, .cf-scroll td { padding: 4px 3px !important; white-space: nowrap; }
  .cf-scroll td:first-child, .cf-scroll th:first-child { width: 10%; white-space: normal; }
}
</style>`;
}

function banner(inp, meta) {
  const text = inp.notes.delivery_banner.replace('{{DATE}}', meta.generatedAt);
  return `<div class="mockup-banner">
<strong>v0.5 DELIVERABLE · SCOPE-LOCKED</strong> · ${esc(text)}. Coloured sections are the commissioned <strong>v0.5</strong> scope. Greyed sections below the divider are extended scope (+€8–12k / +2 weeks), shown for reference and not part of this delivery. Expandable ▸ rows carry derivation detail — collapsed by default so the page reads at summary level, and hidden in print.
</div>`;
}

function masthead(inp, meta) {
  const e = inp.notes.engagement;
  return `<header class="masthead">
  <div>
    <div class="wordmark">KKME<span class="amber-dot">.</span>
      <span class="sub">Baltic Flexibility Intelligence</span>
    </div>
    <hr class="amber-line">
    <h1>${esc(e.client)} BESS Portfolio<br>Independent Revenue &amp; EBITDA Model</h1>
  </div>
  <div class="doc-meta">
    <strong>Version ${esc(e.version)} · scope-locked</strong><br>
    Prepared for UAB ${esc(e.client)} · generated ${esc(meta.generatedAt)}<br>
    KKME engine ${esc(e.engine_version)} · market state ${esc(meta.kvCaptured)}<br>
    Run ${esc(inp.build.run_id)} · register ${esc(inp.register.version?.id ?? '—')}<br>
    Confidential · UAB KKME · ${esc(e.provider_contact.split(' · ')[1])}
  </div>
</header>`;
}

function statusBar(inp) {
  const rec = inp.reconciliation.summary;
  return `<div class="scenario-bar">
  <span class="label">Scenario</span>
  <div class="selector"><button>Downside</button><button class="active">Central</button><button>Upside</button></div>
  <span class="mono-xs">Central throughout unless a section says otherwise · all three in §06 and in the workbook's selector</span>
  <span style="margin-left:auto" class="mono-xs">Assumptions register · <strong style="color: var(--tobacco)">${inp.register.rows.length} rows editable</strong> · <span class="chip pass">${rec.internal.pass}/${rec.internal.total} INTERNAL</span> <span class="chip ${rec.external.warn ? 'watch' : 'pass'}">${rec.external.pass}/${rec.external.total} EXTERNAL</span></span>
</div>`;
}

// ── 01 Executive summary ───────────────────────────────────────────────────

function execSummary(inp, d) {
  const pf = inp.portfolio;
  const p = pf.portfolio;
  const b1 = pf.bridge_y1;
  const t = pf.bridge_totals;
  const capexTotal = t.maintenance_capex + t.augmentation_capex + t.replacement_capex;
  const firstFull = pf.bridge_20yr.find((b) => b.contributors.length === pf.per_project.length);
  const engine0 = inp.projects[0].engine;
  const efc = engine0.assumptions_panel.cycles_breakdown.total_efcs_yr;
  const warranty = inp.projects[0].config.warranty_efc_yr;

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">01</span>Executive summary<span class="included-tag">Included</span></h2>
      <span class="sub">Central scenario · portfolio ${p.mw} MW / ${p.mwh} MWh · ${p.projects} sites</span>
    </div>
    <p class="lede">Three numbers matter: what the portfolio earns before financing in its first operating year, what it earns across its twenty-year life net of every CAPEX event, and what that lifetime is worth today.</p>
  </div>

  <div class="kpi-row-hero">
    <div class="kpi">
      <span class="label">Pre-financing cash flow · ${b1.cal_year}</span>
      <span class="value">${eurM(b1.pre_financing_cf)}</span>
      <span class="delta pos">EBITDA ${eurM(b1.project_ebitda)} · ${pctOf(b1.project_ebitda, b1.gross_market_revenues)} margin</span>
    </div>
    <div class="kpi">
      <span class="label">20-yr Σ pre-fin CF (net of all CAPEX)</span>
      <span class="value">${eurM(t.pre_financing_cf)}</span>
      <span class="delta">${eurM(t.project_ebitda)} EBITDA · −${eurM(capexTotal)} maintenance + aug + repl</span>
    </div>
    <div class="kpi">
      <span class="label">NPV @ WACC ${pctVal(p.wacc, 0)}</span>
      <span class="value">${eurM(p.npv_pre_financing_pre_tax)}</span>
      <span class="delta pos">MOIC ${two(p.moic)}× on ${eurM(p.gross_capex)} CAPEX · payback ${p.payback_years} yr</span>
    </div>
  </div>
  <div class="kpi-row-sub">
    <div class="kpi quiet">
      <span class="label">Gross revenue ${b1.cal_year}</span>
      <span class="value">${eurM(b1.gross_market_revenues)}</span>
      <span class="delta">€${one(b1.gross_market_revenues / d.mwYears / 1000)}k / operational MW / yr</span>
    </div>
    <div class="kpi quiet">
      <span class="label">First full-portfolio year (${firstFull.cal_year})</span>
      <span class="value">${eurM(firstFull.pre_financing_cf)}</span>
      <span class="delta">all ${p.projects} projects operating · ${p.mw} MW run-rate</span>
    </div>
    <div class="kpi quiet">
      <span class="label">Warranty compliance</span>
      <span class="value">${efc}<span class="unit">EFC/yr</span></span>
      <span class="delta pos">${one(((warranty - efc) / warranty) * 100)} % headroom vs ${warranty} cap</span>
    </div>
  </div>

  <div class="method-note">
    Computed independently from ${esc(inp.notes.engagement.client)}'s model using KKME's calibrated Baltic engine. <strong>EBITDA margin ${pctOf(b1.project_ebitda, b1.gross_market_revenues)}</strong> sits inside the ${d.bands.ebitda_margin} band. Net market revenue <strong>€${one(b1.net_market_revenue / d.mwYears / 1000)}k / MW / yr</strong> sits inside the ${d.bands.net_rev} band. ${b1.cal_year} is a ramp year — ${esc(d.rampSentence)} Debt · interest · DSCR · tax <span class="excluded">excluded per commissioned scope</span>.
  </div>
</section>`;
}

// ── 02 Reconciliation ──────────────────────────────────────────────────────

function reconciliation(inp) {
  const rec = inp.reconciliation;
  const s = rec.summary;

  // One representative row per distinct check id, taken from the Central /
  // reference subject — the view being sold. Every subject is in the drill.
  const distinct = (bank) => {
    const seen = new Map();
    for (const c of bank) if (!seen.has(c.id)) seen.set(c.id, c);
    return [...seen.values()];
  };
  const internalHead = distinct(rec.internal).slice(0, 3);
  const externalHead = distinct(rec.external).slice(0, 3);

  const internalDrill = distinct(rec.internal).map((c) =>
    row(td(esc(c.label), 'dim') + tdn(`${c.unit === 'EUR' ? '€' : ''}${c.delta.toFixed(2)}`)
      + tdn(`<span class="tick">✓</span>`))).join('\n              ');

  const externalDrill = rec.external.filter((c) => c.subject === 'reference/central'
    || (c.status !== 'pass')).map((c) => row(
    td(esc(c.label), 'dim') + td(esc(c.subject), 'dim')
    + tdn(actualText(c)) + tdn(bandText(c))
    + td(`<span class="chip ${c.status === 'pass' ? 'pass' : 'watch'}">${c.status.toUpperCase()}</span>`, 'r')
  )).join('\n              ');

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">02</span>Why trust these numbers<span class="included-tag">Included</span></h2>
      <span class="sub">Internal tie-outs + external benchmarks · run on every regeneration</span>
    </div>
    <p class="lede">${esc(inp.notes.reconciliation_note)}</p>
  </div>

  <div class="two-col">
    <div class="card">
      <h3>Internal — ${s.internal.pass} of ${s.internal.total} assertions pass</h3>
      <table>
        ${internalHead.map((c) => row(td(esc(c.label)) + td(`<span class="tick">✓ €${c.delta.toFixed(2)}</span>`, 'r'))).join('\n        ')}
      </table>
      <details class="drill">
        <summary>${s.distinct_internal_checks} distinct checks × ${s.internal.total / s.distinct_internal_checks | 0}+ subjects · ${s.internal.total} assertions</summary>
        <div class="drill-body">
          <table>
            <thead><tr>${th('Check')}${th('Delta', 'r')}${th('', 'r')}</tr></thead>
            <tbody>
              ${internalDrill}
            </tbody>
          </table>
          <div class="derive">Each check runs against the reference asset and all three projects under all three scenarios — ${s.internal.total} assertions in total, all passing exactly. The euro tolerances exist for integer rounding across rows and are not being consumed.</div>
        </div>
      </details>
    </div>

    <div class="card">
      <h3>External — ${s.external.pass} of ${s.external.total} in band${s.external.warn ? `, ${s.external.warn} flagged` : ''}</h3>
      <table>
        ${externalHead.map((c) => row(td(esc(c.label.replace(/ within.*| vs the.*/, '')))
          + td(`<span class="chip pass">${actualText(c)} IN</span>`, 'r'))).join('\n        ')}
      </table>
      <details class="drill">
        <summary>${s.distinct_external_checks} benchmarks · sources, bands and the flagged row</summary>
        <div class="drill-body">
          <table>
            <thead><tr>${th('Benchmark')}${th('Subject')}${th('KKME', 'r')}${th('Published', 'r')}${th('', 'r')}</tr></thead>
            <tbody>
              ${externalDrill}
            </tbody>
          </table>
          <div class="derive">${esc(inp.notes.upside_warn_note)}<br>${esc(s.severity_split)}</div>
        </div>
      </details>
    </div>
  </div>
  <div class="derive" style="margin-top: 12px;">Reconciliation against ${esc(inp.notes.engagement.client)}'s own model is deferred — the model has not been shared.</div>
</section>`;
}

// ── 03 Bridge ──────────────────────────────────────────────────────────────

function bridge(inp, d) {
  const pf = inp.portfolio;
  const y = pf.bridge_y1.cal_year;
  const projs = pf.per_project;
  const cell = (id, key) => {
    const r = d.projYear(id, y);
    return r ? kSigned(r[key]) : '—';
  };
  const line = (key, label, kind) => {
    const cls = kind === 'total' ? ' class="total"' : kind === 'deduction' ? ' class="deduct"' : '';
    const wrap = (v) => (kind === 'total' ? `<strong>${v}</strong>` : v);
    const sign = kind === 'deduction' ? '−' : '';
    return `<tr${cls}><td>${kind === 'total' ? `<strong>${esc(label)}</strong>` : esc(label)}</td>`
      + projs.map((p) => `<td class="n r">${wrap(sign + cell(p.project_id, key))}</td>`).join('')
      + `<td class="n r">${wrap(sign + k(pf.bridge_y1[key]))}</td>`
      + `<td class="n r">${wrap(sign + one(pf.bridge_y1[key] / d.mwYears / 1000))}</td></tr>`;
  };

  const revDetail = inp.notes.revenue_lines.lines.map(([label, quantity, formula, resolution]) =>
    row(td(`${esc(label)} <span class="badge">${esc(quantity)}</span>`, 'dim')
      + td(esc(formula), 'dim')
      + td(esc(resolution), 'dim r'))).join('\n            ');

  const engY = (id) => {
    const proj = inp.projects.find((x) => x.config.project_id === id);
    return proj.engine.years.find((yy) => yy.cal_year === y) ?? null;
  };
  const engTotal = (key) => projs.reduce((a, p) => a + (engY(p.project_id)?.[key] ?? 0), 0);
  const grossEng = engTotal('rev_gross');
  const quantities = [
    ['Balancing revenue, computed', 'rev_bal'],
    ['— of which reserve capacity (indicative 65 % reporting split)', 'rev_cap'],
    ['— of which reserve activation (indicative 35 % reporting split)', 'rev_act'],
    ['Energy trading · day-ahead arbitrage', 'rev_trd'],
    ['Engine gross revenue', 'rev_gross'],
  ].map(([label, key]) => row(td(esc(label), 'dim') + tdn(k(engTotal(key)))
    + tdn(pctOf(engTotal(key), grossEng)))).join('\n            ');

  const cb = inp.projects[0].cost_basis;
  const costDetail = [
    ['Optimiser (route-to-market / trading platform)', 'optimiser', `${pctVal(cb.optimiser_pct_gross, 0)} × gross`],
    ['Grid charges', 'grid', `${pctVal(cb.grid_pct_gross, 0)} × gross`],
    ['Market participation', 'market', `${pctVal(cb.market_pct_gross, 0)} × gross`],
    ['Operating (O&amp;M + insurance + warranty + BOS)', 'operating',
      `€${two(cb.operating_eur_kw_yr + (cb.operating_calibration_eur_kw_yr ?? 0))}/kW/yr, +${pctVal(cb.operating_escalation, 1)}/yr`],
  ].map(([label, key, basis]) => row(
    td(`${label} <span class="badge">${esc(basis)}</span>`, 'dim')
    + tdn(`−${k(pf.bridge_y1[key])}`)
    + tdn(`−${one(pf.bridge_y1[key] / d.mwYears / 1000)}`))).join('\n            ');

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">03</span>Portfolio bridge<span class="included-tag">Included</span></h2>
      <span class="sub">Calendar ${y} · Central <span class="unit-flag">€ 000s</span></span>
    </div>
    <p class="lede">The commissioned bridge, exactly: gross → charging → net → operating costs → EBITDA → CAPEX → pre-financing cash flow. Columns are each project's contribution to calendar ${y}, so the portfolio column is their exact sum — ${esc(d.rampSentence)}</p>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th style="width: 34%">Line</th>
          ${projs.map((p) => `<th class="r">${esc(p.name)}<br>${p.mw} MW · ${d.monthsIn(p.project_id, y) ? `${d.monthsIn(p.project_id, y)} mo` : 'not yet'}</th>`).join('\n          ')}
          <th class="r">Portfolio</th>
          <th class="r">€k / op MW / yr</th>
        </tr>
      </thead>
      <tbody>
        ${line('gross_market_revenues', '1 · Gross market revenues', 'total')}
        ${line('charging_costs', 'less: Charging costs', 'deduction')}
        ${line('net_market_revenue', '2 · Net market revenue', 'total')}
        ${line('optimiser', 'less: Optimiser fee', 'deduction')}
        ${line('grid', 'less: Grid charges', 'deduction')}
        ${line('market', 'less: Market participation', 'deduction')}
        ${line('operating', 'less: Operating costs', 'deduction')}
        ${line('project_ebitda', '3 · Project EBITDA', 'total')}
        ${line('maintenance_capex', 'less: Maintenance CAPEX', 'deduction')}
        ${line('augmentation_capex', 'less: Augmentation CAPEX', 'deduction')}
        ${line('replacement_capex', 'less: Replacement CAPEX', 'deduction')}
        ${line('pre_financing_cf', '4 · Pre-financing project cash flow', 'total')}
        <tr><td class="excluded">${esc(inp.notes.excluded_items)}</td><td colspan="4" class="excluded r">EXCLUDED per scope</td><td></td></tr>
      </tbody>
    </table>

    <details class="drill">
      <summary>Revenue line detail · the ten contracted lines mapped to what the engine computes</summary>
      <div class="drill-body">
        <div class="derive" style="margin-bottom: 10px;">${esc(inp.notes.revenue_lines._note)}</div>
        <table>
          <thead><tr>${th('Contracted line + engine quantity', '')}${th('Formula the engine evaluates')}${th('Resolution', 'r')}</tr></thead>
          <tbody>
            ${revDetail}
          </tbody>
        </table>
        <div class="derive"><strong>${esc(inp.notes.revenue_lines.fcr_caveat)}</strong></div>
        <div class="derive">${esc(inp.notes.revenue_lines.split_caveat)}</div>
        <table style="margin-top: 14px;">
          <thead><tr>${th(`Engine revenue quantity · calendar ${y}`)}${th('Portfolio €k', 'r')}${th('% gross', 'r')}</tr></thead>
          <tbody>
            ${quantities}
          </tbody>
        </table>
      </div>
    </details>

    <details class="drill">
      <summary>Operating cost detail · 4 lines with rates</summary>
      <div class="drill-body">
        <table>
          <thead><tr>${th('Cost line + basis', '')}${th('Portfolio €k', 'r')}${th('€k / op MW / yr', 'r')}</tr></thead>
          <tbody>
            ${costDetail}
          </tbody>
        </table>
        <div class="derive">${esc(inp.projects[0].cost_basis.reconciliation.note)}</div>
      </div>
    </details>
  </div>
</section>`;
}

// ── 04 Per project ─────────────────────────────────────────────────────────

function perProject(inp) {
  const pf = inp.portfolio;
  const cards = pf.per_project.map((p) => {
    const cfg = inp.projects.find((x) => x.config.project_id === p.project_id).config;
    const headroom = (cfg.grid_allowance_mw ?? p.mw) - p.mw;
    const chip = headroom > 0
      ? `<span class="chip pass">${headroom} MW HEADROOM</span>`
      : `<span class="chip watch">POI-BOUND</span>`;
    return `    <div class="project-card">
      <div class="project-name">${esc(p.name)}</div>
      <div class="project-meta">${p.mw} MW / ${p.mwh} MWh · ${esc(cfg.meta.municipality)}<br>${esc(cfg.meta.spv)} · VERT ${esc(cfg.meta.vert_permit)} · COD ${esc(p.cod)}</div>
      <div class="hero-cf n">${eurM(p.bridge_y1.pre_financing_cf, 2)}</div>
      <div class="hero-cf-label">Pre-fin CF · own Y1 (${p.bridge_y1.cal_year}${p.operational_months_y1 < 12 ? `, ${p.operational_months_y1} mo` : ''})</div>
      <table>
        <tr><td class="dim">20-yr Σ pre-fin CF</td><td class="n r">${eurM(p.bridge_totals.pre_financing_cf)}</td></tr>
        <tr><td class="dim">NPV @ 8 %</td><td class="n r">${eurM(p.npv_pre_financing_pre_tax)}</td></tr>
        <tr><td class="dim">MOIC · IRR</td><td class="n r">${two(p.moic)}× · ${pctVal(p.engine_project_irr)}</td></tr>
        <tr><td class="dim">Grid POI</td><td class="r">${chip}</td></tr>
      </table>
    </div>`;
  }).join('\n\n');

  const sum = pf.per_project.map((p) => p.bridge_totals.pre_financing_cf);
  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">04</span>Per-project view<span class="included-tag">Included</span></h2>
      <span class="sub">Central · public-register siting + VERT permit</span>
    </div>
    <p class="lede">Each asset priced at its own commissioning year against the saturation curve, so a later COD meets a more competitive market. Every project detail here is from the public VERT permit register and the Litgrid connection queue.</p>
  </div>

  <div class="three-col">
${cards}
  </div>
  <div class="derive" style="margin-top: 12px;">Each project's 20-year figure carries its own Y8 augmentation and Y15 replacement CAPEX. ${sum.map((v) => eurM(v)).join(' + ')} = <strong>${eurM(pf.bridge_totals.pre_financing_cf)} portfolio</strong> — ties to the executive summary. ${esc(inp.notes.partial_year_note)}</div>
</section>`;
}

// ── 05 20-year cash flow ───────────────────────────────────────────────────

function cashflow(inp) {
  const pf = inp.portfolio;
  const rows = pf.bridge_20yr;
  const t = pf.bridge_totals;
  const capexRow = (b) => b.augmentation_capex + b.replacement_capex;
  const head = rows.map((b) => `<th class="r">${b.cal_year}</th>`).join('');
  const opRow = rows.map((b) => `<td class="n r">${one(b.project_ebitda / 1e6)}</td>`).join('');
  const cxRow = rows.map((b) => {
    const v = capexRow(b);
    return `<td class="n r">${v ? `−${one(v / 1e6)}` : '—'}</td>`;
  }).join('');
  const netRow = rows.map((b) => {
    const v = b.pre_financing_cf;
    const strong = capexRow(b) > 0;
    const s = `${v < 0 ? '−' : ''}${one(Math.abs(v) / 1e6)}`;
    return `<td class="n r">${strong ? `<strong>${s}</strong>` : s}</td>`;
  }).join('');

  const augYears = rows.filter((b) => b.augmentation_capex > 0).map((b) => b.cal_year);
  const replYears = rows.filter((b) => b.replacement_capex > 0).map((b) => b.cal_year);
  const cap = inp.projects[0].capex_basis;

  return `<section class="cf-section">
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">05</span>20-year cash flow<span class="included-tag">Included</span></h2>
      <span class="sub">Portfolio · Central <span class="unit-flag">€ M</span></span>
    </div>
    <p class="lede">The full calendar trajectory with both CAPEX events visible: augmentation in ${list(augYears)} and replacement in ${list(replYears)}. Per-project year-by-year detail lives in the delivered workbook.</p>
  </div>

  <div class="card cf-scroll">
    <table style="font-size: 12px; min-width: 1180px;">
      <thead>
        <tr><th>Year</th>${head}<th class="r">Σ</th></tr>
      </thead>
      <tbody>
        <tr><td>Project EBITDA</td>${opRow}<td class="n r"><strong>${one(t.project_ebitda / 1e6)}</strong></td></tr>
        <tr class="deduct"><td>Maintenance CAPEX</td>${rows.map((b) => `<td class="n r">${b.maintenance_capex ? `−${one(b.maintenance_capex / 1e6)}` : '—'}</td>`).join('')}<td class="n r">−${one(t.maintenance_capex / 1e6)}</td></tr>
        <tr class="deduct"><td>Aug + repl CAPEX</td>${cxRow}<td class="n r">−${one((t.augmentation_capex + t.replacement_capex) / 1e6)}</td></tr>
        <tr class="total"><td><strong>Net pre-fin CF</strong></td>${netRow}<td class="n r"><strong>${one(t.pre_financing_cf / 1e6)}</strong></td></tr>
      </tbody>
    </table>
    <div class="derive" style="margin-top: 12px;">
      <strong>Ramp</strong> · ${esc(inp.portfolio.timeline_note)}<br>
      <strong>Augmentation</strong> operating year ${cap.augmentation_year}: ${pctVal(cap.augmentation_mwh_pct, 0)} of MWh at €${cap.augmentation_eur_kwh}/kWh · <strong>Replacement</strong> operating year ${cap.replacement_year}: ${pctVal(cap.replacement_mwh_pct, 0)} at €${cap.replacement_eur_kwh}/kWh — landing in different calendar years per project because each counts from its own COD.<br>
      <strong>${esc(inp.notes.npv_label)} = ${eurM(pf.portfolio.npv_pre_financing_pre_tax)} · MOIC ${two(pf.portfolio.moic)}×</strong> (${one(t.pre_financing_cf / 1e6)} ÷ ${one(pf.portfolio.gross_capex / 1e6)}) — both tie to the executive summary.<br>
      ${esc(inp.notes.capex_note)}
    </div>
  </div>
</section>`;
}

// ── 06 Scenarios ───────────────────────────────────────────────────────────

const SCEN = [
  ['downside', 'Downside', 'var(--rust)'],
  ['central', 'Central', 'var(--amber)'],
  ['upside', 'Upside', 'var(--moss)'],
];

const DRIVER_LABELS = [
  ['Fleet realisation (higher = more competition)', 'fleet_realisation_pct', (v) => `${v} %`],
  ['Spread growth', 'spread_growth_pct_yr', (v) => `${v > 0 ? '+' : ''}${v} %/yr`],
  ['Availability', 'availability_pct', (v) => `${v} %`],
  ['Trading realisation', 'trading_realisation', (v) => `${v}`],
  ['Capacity prices vs baseline', 'cap_price_delta_pct', (v) => (v === 0 ? '—' : `${v > 0 ? '+' : ''}${v} %`)],
  ['CPI floor', 'cpi_floor', (v) => `${v}`],
];

function scenarios(inp) {
  const sum = inp.scenarios.summary;
  const central = sum.headlines.central;
  const cards = SCEN.map(([key, label, colour]) => {
    const h = sum.headlines[key];
    const delta = key === 'central'
      ? 'anchor'
      : `<span class="callout-num${h.npv < central.npv ? ' neg' : ''}">${h.npv < central.npv ? '−' : '+'}${Math.abs(((h.npv / central.npv) - 1) * 100).toFixed(0)} % NPV vs Central</span>`;
    return `    <div class="card" style="border-top: 3px solid ${colour};">
      <span class="label">${label}</span>
      <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 500; margin: 10px 0 2px;">${eurM(h.npv)}<span style="font-size: 14px; color: var(--tobacco-3);"> NPV</span></div>
      <span class="mono-xs">Y1 pre-fin CF ${eurM(h.prefin_cf_y1)} · 20-yr net rev ${eurM(h.sum_20yr_net)} · MOIC ${two(h.moic)}× · ${delta}</span>
    </div>`;
  }).join('\n');

  const drivers = DRIVER_LABELS.map(([label, key, fmt]) => row(
    td(esc(label), 'dim') + SCEN.map(([s]) => tdn(minus(fmt(sum.drivers[s][key])))).join('')
  )).join('\n          ');

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">06</span>Scenarios<span class="included-tag">Included</span></h2>
      <span class="sub">Same bridge · explicit driver deltas</span>
    </div>
    <p class="lede">${esc(inp.notes.scenario_selector_label)}</p>
  </div>

  <div class="three-col">
${cards}
  </div>

  <details class="drill" style="margin-top: 16px;">
    <summary>Driver inputs per scenario · 6 assumptions</summary>
    <div class="drill-body">
      <table>
        <thead><tr>${th('Driver')}${SCEN.map(([, l]) => th(l, 'r')).join('')}</tr></thead>
        <tbody>
          ${drivers}
        </tbody>
      </table>
      <div class="derive">Note · fleet realisation runs INVERSE to fortune: Downside assumes MORE of the announced pipeline gets built (more supply competing), so ${sum.drivers.downside.fleet_realisation_pct} % realisation is the pessimistic case for revenue. Monotonicity is asserted — ${esc(sum.monotonicity.rule)} — and holds on every headline.<br>${esc(inp.notes.upside_warn_note)}</div>
    </div>
  </details>
</section>`;
}

// ── 07 Sensitivity ─────────────────────────────────────────────────────────

function sensitivity(inp) {
  const s = inp.sensitivity;
  const ranked = [...s.drivers].sort((a, b) => Math.abs(b.swing_20yr) - Math.abs(a.swing_20yr));
  const top = ranked.slice(0, 3).map((dr) => row(
    td(minus(`${esc(dr.label)} (${dr.down_value} / ${dr.up_value} ${esc(dr.unit)})`))
    + tdn(`<span class="callout-num neg">${signedM(dr.delta_ebitda_down)}</span>`)
    + tdn(`<span class="callout-num">${signedM(dr.delta_ebitda_up)}</span>`)
    + tdn(`<span class="callout-num">${eurM(Math.abs(dr.swing_20yr))}</span>`)
  )).join('\n        ');

  const all = ranked.map((dr) => row(
    td(esc(dr.label), 'dim') + td(minus(`${dr.central}`), 'n c')
    + td(minus(`${dr.down_value} / ${dr.up_value}`), 'n c')
    + tdn(dr.delta_ebitda_down ? signedM(dr.delta_ebitda_down) : '—')
    + tdn(dr.delta_ebitda_up ? signedM(dr.delta_ebitda_up) : '—')
    + tdn(dr.swing_20yr ? eurM(Math.abs(dr.swing_20yr)) : '<span class="chip dim">NO EFFECT</span>')
  )).join('\n            ');

  const dead = ranked.filter((dr) => dr.zero_effect_reason);
  const deadDetail = dead.map((dr) =>
    `<div class="derive"><strong>${esc(dr.label)}</strong> · ${esc(dr.engine_binding)} — ${esc(dr.zero_effect_reason)}</div>`).join('\n        ');

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">07</span>What moves the number<span class="included-tag">Included</span></h2>
      <span class="sub">Single-variable impact from Central · ranked by 20-year swing</span>
    </div>
    <p class="lede">One driver dominates by an order of magnitude. Two move nothing at all, and are reported as zero rather than given an invented elasticity. Full 8-driver table expandable.</p>
  </div>

  <div class="card">
    <table>
      <thead><tr>${th('Driver')}${th('Δ EBITDA Y1 down', 'r')}${th('Δ EBITDA Y1 up', 'r')}${th('20-yr swing', 'r')}</tr></thead>
      <tbody>
        ${top}
      </tbody>
    </table>
    <details class="drill">
      <summary>All ${s.drivers.length} drivers · central values, ranges and both deltas</summary>
      <div class="drill-body">
        <table>
          <thead><tr>${th('Driver')}${th('Central', 'c')}${th('Range', 'c')}${th('Δ Down', 'r')}${th('Δ Up', 'r')}${th('20-yr swing', 'r')}</tr></thead>
          <tbody>
            ${all}
          </tbody>
        </table>
        <div class="derive">${esc(s.basis)}</div>
        <div class="derive">${esc(s.interaction.downside.note)} Downside residual ${eurM(s.interaction.downside.interaction_residual)} (${one(Math.abs(s.interaction.downside.residual_pct_of_scenario_delta))} % of the scenario delta); Upside ${eurM(s.interaction.upside.interaction_residual)} (${one(Math.abs(s.interaction.upside.residual_pct_of_scenario_delta))} %).</div>
      </div>
    </details>
    <div class="method-note">${esc(inp.notes.dead_drivers_note)}</div>
    ${deadDetail}
  </div>
</section>`;
}

// ── 08 Assumptions ─────────────────────────────────────────────────────────

// The ten most load-bearing rows, shown before the drill. Ids are asserted to
// resolve — a renamed register row must break the build, not quietly shrink
// the table (it shipped 7 of 10 once before this check existed).
const HEADLINE_ASSUMPTIONS = [
  'rte_bol_2h', 'cycles_efc_yr', 'afrr_cap_price', 'mfrr_cap_price',
  'driver_fleet_realisation_pct', 'driver_cpi_floor', 'optimiser_pct_gross',
  'capex_eur_kwh', 'augmentation_eur_kwh', 'driver_availability_pct',
];

function assumptions(inp) {
  const rows = inp.register.rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unresolved = HEADLINE_ASSUMPTIONS.filter((id) => !byId.has(id));
  if (unresolved.length) {
    throw new Error(
      `headline assumption ids not in the register: ${unresolved.join(', ')} — ` +
      `the register was renamed and generate-deliverable.mjs must be re-pointed`
    );
  }
  const head = HEADLINE_ASSUMPTIONS.map((id) => byId.get(id));
  const rest = rows.filter((r) => !head.includes(r));

  const fmtVal = (r) => `${r.value}${r.unit ? ` ${esc(r.unit)}` : ''}`;
  const headRows = head.map((r) => row(
    td(esc(r.label)) + tdn(fmtVal(r)) + td(esc(r.source.split(' · ')[0]), 'mono-xs'))).join('\n        ');
  const restRows = rest.map((r) => row(
    td(esc(r.category), 'dim') + td(esc(r.label), 'dim') + tdn(fmtVal(r))
    + td(esc(r.source.split(' · ')[0]), 'mono-xs'))).join('\n            ');

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">08</span>Assumptions register<span class="included-tag">Included</span></h2>
      <span class="sub">${rows.length} rows · editable Excel · every source cited</span>
    </div>
    <p class="lede">Every number in this model traces to one of ${rows.length} assumptions, each with a published source and an override cell in the delivered workbook. ${head.length} of the most load-bearing are shown; the remaining ${rest.length} are expandable, and all ${rows.length} are in the workbook.</p>
  </div>

  <div class="card">
    <table>
      <thead><tr>${th('Assumption')}${th('Value', 'r')}${th('Source')}</tr></thead>
      <tbody>
        ${headRows}
      </tbody>
    </table>
    <details class="drill">
      <summary>Full register · ${rest.length} further rows by category</summary>
      <div class="drill-body">
        <table>
          <thead><tr>${th('Cat')}${th('Assumption')}${th('Value', 'r')}${th('Source')}</tr></thead>
          <tbody>
            ${restRows}
          </tbody>
        </table>
      </div>
    </details>
    <div class="derive" style="margin-top: 10px;">${esc(inp.notes.override_mechanism)}</div>
    <div class="derive">${esc(inp.register._note)}</div>
  </div>
</section>`;
}

// ── 09 Model risk ──────────────────────────────────────────────────────────

function modelRisk(inp) {
  const pf = inp.portfolio;
  const cn = pf.correlation_note;
  const poiBound = pf.per_project.filter((p) => {
    const cfg = inp.projects.find((x) => x.config.project_id === p.project_id).config;
    return (cfg.grid_allowance_mw ?? p.mw) - p.mw <= 0;
  });
  const cap = inp.projects[0].capex_basis;

  const items = [
    inp.notes.dead_drivers_note,
    inp.notes.upside_warn_note,
    inp.notes.partial_year_note,
    inp.notes.capex_note,
    inp.notes.revenue_lines.fcr_caveat,
    inp.notes.revenue_lines.split_caveat,
    `All ${pf.portfolio.projects} projects sit in the LT bidding zone — price correlation ${cn.lt_zone_price_correlation}, spatial diversification ${cn.spatial_diversification}. ${cn.note}`,
    poiBound.length
      ? `${poiBound.map((p) => `${p.name} is POI-bound at ${p.mw} MW`).join('; ')} — no discharge headroom against the grid allowance on record.`
      : 'Every project has grid headroom against its recorded allowance.',
    `Augmentation is a single-point trigger at operating year ${cap.augmentation_year} and replacement at year ${cap.replacement_year}; a probabilistic SOH-driven trigger is extended scope.`,
    `Replacement cost at €${cap.replacement_eur_kwh}/kWh carries the widest band of any assumption — it is a forward cell-plus-PCS price roughly fifteen years out.`,
    `Reconciliation against ${inp.notes.engagement.client}'s own model is deferred: the model has not been shared.`,
  ];

  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">09</span>Model risk<span class="included-tag">Included</span></h2>
      <span class="sub">Honest limits · disclosed upfront, not buried</span>
    </div>
    <p class="lede">Everything below is a known limit of this model, stated where it can be read rather than left for you to find.</p>
  </div>

  <div class="card">
    <table>
      ${items.map((t) => row(td(esc(t), 'dim'))).join('\n      ')}
    </table>
  </div>
</section>`;
}

// ── 10 Scope ───────────────────────────────────────────────────────────────

function scope(inp, d) {
  const rec = inp.reconciliation.summary;
  const delivers = [
    `Portfolio + ${inp.portfolio.portfolio.projects} per-project bridges, all ${inp.notes.bridge_lines.length} commissioned lines`,
    `${inp.portfolio.bridge_20yr.length}-year calendar cash flow (portfolio + per-project in the workbook)`,
    'The ten contracted revenue lines mapped to what the engine computes, with formulas',
    `${SCEN.length} scenarios with driver panels · sensitivity across ${inp.sensitivity.drivers.length} drivers`,
    `Assumptions register (${inp.register.rows.length} rows, editable overrides)`,
    `Reconciliation: ${rec.internal.pass}/${rec.internal.total} internal assertions, ${rec.external.pass}/${rec.external.total} external benchmarks`,
    'Editable Excel with scenario selector · this summary as PDF · methodology annex',
  ];
  return `<section>
  <div class="sh">
    <div class="sh-top">
      <h2><span class="num">10</span>Scope &amp; deliverables<span class="included-tag">Included</span></h2>
      <span class="sub">v0.5 · delivered ${esc(d.generatedAt)}</span>
    </div>
  </div>

  <div class="two-col">
    <div class="card">
      <h3>v0.5 delivers</h3>
      <table>
        ${delivers.map((t) => row(td(`<span class="tick">✓</span> ${esc(t)}`))).join('\n        ')}
      </table>
    </div>
    <div class="card">
      <h3>Excluded / notes</h3>
      <table>
        <tr><td class="excluded">${esc(inp.notes.excluded_items)}</td></tr>
        <tr><td class="dim">DSCR is available on request — the engine computes it natively, at no extra charge.</td></tr>
        <tr><td class="dim">Files delivered: 1 × .xlsx (8 tabs) · 1 × .pdf (this summary) · 1 × methodology annex .pdf</td></tr>
        <tr><td class="dim">${esc(inp.notes.figures_basis)}</td></tr>
      </table>
    </div>
  </div>
  <div class="derive" style="margin-top: 12px;">${esc(inp.notes.scope_lock)}</div>
</section>`;
}

// ── Assembly ───────────────────────────────────────────────────────────────

/** Split the template on its two anchors; throw unless each occurs exactly once. */
export function splitTemplate(html) {
  for (const [name, anchor] of [['body', BODY_ANCHOR], ['scope divider', SCOPE_ANCHOR]]) {
    const n = html.split(anchor).length - 1;
    if (n !== 1) {
      throw new Error(
        `template anchor "${name}" occurs ${n} times, expected exactly 1 — ` +
        `the template changed shape and the generator must be re-pointed`
      );
    }
  }
  const [head, afterBody] = html.split(BODY_ANCHOR);
  const [, tail] = afterBody.split(SCOPE_ANCHOR);
  return { head: head + BODY_ANCHOR, tail: SCOPE_ANCHOR + tail };
}

export function buildDeliverableHtml(inp, { generatedAt } = {}) {
  const meta = {
    generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10),
    kvCaptured: (inp.portfolio.kv_captured_at ?? inp.portfolio.generated_at).slice(0, 10),
  };
  const pf = inp.portfolio;
  const y = pf.bridge_y1.cal_year;
  const contributors = pf.bridge_y1.contributors;
  const partial = contributors.filter((c) => c.operational_months < 12);
  const nameOf = (id) => pf.per_project.find((p) => p.project_id === id).name;

  // Shared derived context. Everything the sections need that isn't a straight
  // field read lives here, computed once, so no section can derive it differently.
  const d = {
    generatedAt: meta.generatedAt,
    mwYears: operationalMwYears(pf),
    projYear: (id, calYear) => inp.projects
      .find((x) => x.config.project_id === id).bridge_20yr
      .find((b) => b.cal_year === calYear) ?? null,
    monthsIn: (id, calYear) => pf.bridge_20yr.find((b) => b.cal_year === calYear)
      ?.contributors.find((x) => x.project_id === id)?.operational_months ?? 0,
    rampSentence:
      `${contributors.length} of ${pf.per_project.length} projects earn in ${y}`
      + (partial.length
        ? ` and ${partial.map((c) => `${nameOf(c.project_id)} for ${c.operational_months} of 12 months`).join(', ')}`
        : '')
      + `, so the ${y} column is ${one((operationalMwYears(pf) / pf.portfolio.mw) * 100)} % of the portfolio's ${pf.portfolio.mw} MW run-rate.`,
    bands: {
      ebitda_margin: bandLabel(inp, 'external_5_ebitda_margin'),
      net_rev: bandLabel(inp, 'external_6_net_rev_k_mw_yr'),
    },
  };

  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const { head, tail } = splitTemplate(template);

  const body = [
    printOverrides(inp),
    banner(inp, meta),
    masthead(inp, meta),
    statusBar(inp),
    execSummary(inp, d),
    reconciliation(inp),
    bridge(inp, d),
    perProject(inp),
    cashflow(inp),
    scenarios(inp),
    sensitivity(inp),
    assumptions(inp),
    modelRisk(inp),
    scope(inp, d),
  ].join('\n\n');

  return `${head}\n\n${body}\n\n${tail}`;
}

/** "published 45–70 % (Clean Horizon …)" — band text read from the report, not retyped. */
function bandLabel(inp, id) {
  const c = inp.reconciliation.external.find((x) => x.id === id);
  if (!c) throw new Error(`external check ${id} missing from the reconciliation report`);
  return `published ${bandText(c)} (${esc(c.source.split(',')[0].split(' — ')[0])})`;
}

// ── Consistency gate ───────────────────────────────────────────────────────

/**
 * Prove the emitted HTML says what the engine computed — and that no mockup
 * placeholder survived. Every assertion reads the runner JSON and searches the
 * HTML for the rendered form, so the two cannot drift apart silently.
 */
export function verifyDeliverable(html, inp) {
  const failures = [];
  // Every string the engine legitimately produced this run. The placeholder
  // blocklist below is checked against it: a mockup placeholder that happens to
  // equal a real computed value is a coincidence, not a stale number, and the
  // gate must not fail on it. (It happened — the mockup's €12.9 M gross Y1 is
  // also, on some market states, the computed one.)
  const produced = new Set();
  const must = (needle, why) => {
    produced.add(needle);
    if (!html.includes(needle)) failures.push(`missing ${why}: ${needle}`);
  };
  const mustNot = (needle, why) => {
    if (html.includes(needle)) failures.push(`stale ${why}: ${needle}`);
  };

  const pf = inp.portfolio;
  const p = pf.portfolio;
  const t = pf.bridge_totals;
  const b1 = pf.bridge_y1;

  // Headline figures, in the exact rendered form.
  must(eurM(p.npv_pre_financing_pre_tax), 'portfolio NPV');
  must(eurM(t.pre_financing_cf), '20-yr pre-financing CF');
  must(eurM(b1.pre_financing_cf), 'Y1 pre-financing CF');
  must(eurM(b1.project_ebitda), 'Y1 EBITDA');
  must(eurM(p.gross_capex), 'gross CAPEX');
  must(eurM(b1.gross_market_revenues), 'Y1 gross market revenues');
  must(eurM(t.project_ebitda), '20-yr EBITDA');
  must(`${two(p.moic)}×`, 'portfolio MOIC');
  must(`${p.mw} MW / ${p.mwh} MWh`, 'portfolio size');

  // Every bridge line, per project and portfolio, in thousands.
  for (const [key] of inp.notes.bridge_lines) {
    must(k(b1[key]), `portfolio bridge line ${key}`);
  }
  for (const proj of pf.per_project) {
    must(eurM(proj.bridge_totals.pre_financing_cf), `${proj.project_id} 20-yr CF`);
    must(eurM(proj.npv_pre_financing_pre_tax), `${proj.project_id} NPV`);
    must(eurM(proj.bridge_y1.pre_financing_cf, 2), `${proj.project_id} Y1 CF`);
  }

  // Every scenario headline.
  for (const [key] of SCEN) {
    const h = inp.scenarios.summary.headlines[key];
    must(eurM(h.npv), `${key} NPV`);
    must(eurM(h.prefin_cf_y1), `${key} Y1 pre-fin CF`);
  }

  // Every calendar year of the cash flow, and both CAPEX events.
  for (const b of pf.bridge_20yr) must(`<th class="r">${b.cal_year}</th>`, `CF year ${b.cal_year}`);

  // Reconciliation counts, as computed.
  const rec = inp.reconciliation.summary;
  must(`${rec.internal.pass} of ${rec.internal.total}`, 'internal check count');
  must(`${rec.external.pass} of ${rec.external.total}`, 'external check count');

  // Register count — the "39 rows" of the mockup must be gone everywhere.
  must(`${inp.register.rows.length} rows`, 'register row count');
  mustNot('39 rows', 'mockup register count');
  mustNot('39 assumptions', 'mockup register count');

  // Sensitivity: every driver named, both zero-effect drivers disclosed.
  // Phase 36.D — the driver LABEL was asserted but none of its rendered NUMBERS
  // were, which left the placeholder scan a blind spot: any computed figure the
  // gate did not explicitly assert could collide with a mockup string and fail
  // the build as a false positive. It did — a 20-year swing landed on €23.7 M
  // when the demand basis moved, and the gate could not tell that from leftover
  // mockup text. Asserting the numbers closes the hole by SHARPENING the gate
  // rather than by shortening the placeholder list.
  for (const dr of inp.sensitivity.drivers) {
    must(esc(dr.label), `sensitivity driver ${dr.driver}`);
    if (dr.swing_20yr) must(eurM(Math.abs(dr.swing_20yr)), `sensitivity swing for ${dr.driver}`);
    if (dr.delta_ebitda_down) must(signedM(dr.delta_ebitda_down), `sensitivity down-delta for ${dr.driver}`);
    if (dr.delta_ebitda_up) must(signedM(dr.delta_ebitda_up), `sensitivity up-delta for ${dr.driver}`);
  }
  for (const dr of inp.sensitivity.drivers.filter((x) => x.zero_effect_reason)) {
    must(esc(dr.zero_effect_reason), `zero-effect reason for ${dr.driver}`);
  }

  // The four operator-decided notes must appear verbatim.
  for (const key of ['dead_drivers_note', 'upside_warn_note', 'partial_year_note', 'capex_note']) {
    must(esc(inp.notes[key]), `deliverable note ${key}`);
  }

  // No mockup placeholder may survive. These are the mockup's headline figures;
  // if any is still present the regeneration missed a section.
  const MOCKUP_PLACEHOLDERS = [
    '€64.2', '€204.8', '€12.9 M', '€23.7', '5.1×', '56.5 %', '€193k',
    '23 728', '20 803', '13 439', '12 947', '9 104', '4 920', '9 704',
    'STRUCTURE MOCKUP', 'Placeholder numbers scaled from',
  ];
  for (const ph of MOCKUP_PLACEHOLDERS) {
    // The escape is "this run genuinely computed that value", and it used to be
    // an EXACT match against `produced`. But the placeholders are written as
    // prefixes ('€23.7') while the rendered figures carry their unit
    // ('€23.7 M'), so the escape could never fire for the numeric ones — every
    // legitimate collision was an unconditional build failure waiting for the
    // day some figure landed on a mockup number. Phase 36.D was that day.
    // Containment is the correct test, and it does not loosen the gate: a
    // placeholder like 'STRUCTURE MOCKUP' is not a substring of any computed
    // figure.
    if ([...produced].some((v) => typeof v === 'string' && v.includes(ph))) continue;
    mustNot(ph, 'mockup placeholder');
  }

  // Provenance (36.B6): the delivered document must name the run that produced
  // it. A report whose figures cannot be traced back to a registry entry is
  // exactly the artefact the registry exists to make impossible.
  must(esc(inp.build.run_id), 'run registry id');

  // The extended-scope block must survive untouched — it is the v1.0 upsell.
  must('EXTENDED SCOPE — NOT IN v0.5', 'extended-scope stamp');
  must('Boundary · v0.5 → v1.0', 'scope divider');

  return failures;
}

// ── Entry point ────────────────────────────────────────────────────────────

export function generateDeliverable({ outputDir = OUTPUT_DIR, generatedAt } = {}) {
  const inputs = loadInputs({ outputDir });
  const html = buildDeliverableHtml(inputs, { generatedAt });
  const failures = verifyDeliverable(html, inputs);
  if (failures.length) {
    throw new Error(
      `consistency gate FAILED — ${failures.length} problem(s):\n  ` + failures.join('\n  ')
    );
  }
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, HTML_NAME);
  writeFileSync(path, html, 'utf8');
  recordArtefact({ build: inputs.build, artefact: HTML_NAME, path });
  return { path, html, inputs };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const verifyOnly = process.argv.includes('--verify-only');
  if (verifyOnly) {
    const inputs = loadInputs();
    const html = readFileSync(join(OUTPUT_DIR, HTML_NAME), 'utf8');
    const failures = verifyDeliverable(html, inputs);
    console.log(failures.length
      ? `\n  Consistency gate FAILED (${failures.length}):\n    ${failures.join('\n    ')}\n`
      : '\n  Consistency gate: HTML == engine ✓\n');
    process.exit(failures.length ? 1 : 0);
  }
  const { path, html } = generateDeliverable();
  console.log(`\n  Deliverable HTML — consistency gate passed`);
  console.log(`  → ${path} (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)\n`);
}
