/**
 * Phase 34.6 — Excel deliverable generator.
 *
 * Reads the runner outputs in `tools/consultancy/output/` and emits an 8-tab
 * workbook. Every number is read from a runner JSON at generation time; nothing
 * is hand-entered and nothing is cached between runs. Regenerating after an
 * engine change therefore cannot leave a stale figure behind — which is the
 * whole point of running this as the last step before delivery.
 *
 * Library: exceljs. Chosen after a spike proved it does all four things the
 * scenario selector needs — list data-validation, INDEX/MATCH formulas that
 * survive a round-trip, cell styling (widths, number formats, fills, strike),
 * and sheet protection with individually unlocked cells. See DECISIONS.md 34.6-A.
 *
 * Usage:
 *   node tools/consultancy/generate-xlsx.mjs
 *   node tools/consultancy/generate-xlsx.mjs --out custom-name.xlsx
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { HERE, OUTPUT_DIR } from './engine.mjs';

export const XLSX_NAME = 'Prosperus_BESS_Model_v0.5.xlsx';

// ── Brand ──────────────────────────────────────────────────────────────────
// The Baltic-birch palette from the client-approved deliverable template, so
// the workbook and the summary document read as one artefact.
const C = {
  birch: 'FFEAE3D2',
  birchDark: 'FFDDD5BF',
  tobacco: 'FF3A2E20',
  amber: 'FFC8801C',
  amberGlaze: 'FFF3E2CA',
  sea: 'FF2C6E8C',
  seaGlaze: 'FFDCE7EC',
  rust: 'FF8B2E19',
  rustGlaze: 'FFF0DAD5',
  moss: 'FF4A5D36',
  white: 'FFFFFFFF',
};

const MONEY = '#,##0';
const MONEY_D = '#,##0.00';
const PCT2 = '0.0%';
const NUM2 = '#,##0.00';
const NUM3 = '#,##0.000';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const TABS = [
  'Cover', 'Assumptions', 'Bridge Y1', '20-yr CF',
  'Scenarios', 'Sensitivity', 'Reconciliation', 'Glossary',
];

// ── Input loading ──────────────────────────────────────────────────────────

const readJSON = (path) => {
  if (!existsSync(path)) {
    throw new Error(
      `missing input ${path} — run the runners first ` +
      `(run-project / run-portfolio / run-scenarios / run-sensitivity / reconcile)`
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
};

/**
 * Load every runner output the workbook is built from, and refuse to build on
 * inputs that disagree about which engine produced them or that were computed
 * against an unverified KV snapshot. A deliverable assembled from a mixed run
 * would tie out internally and still be wrong.
 */
export function loadInputs({ outputDir = OUTPUT_DIR, here = HERE } = {}) {
  const out = (f) => readJSON(join(outputDir, f));

  const inputs = {
    portfolio: out('portfolio.json'),
    projects: ['bitenai', 'stoniskiai', 'eigirdziai'].map((id) => out(`${id}.json`)),
    scenarios: {
      summary: out('scenario-summary.json'),
      downside: out('scenario-downside.json'),
      central: out('scenario-central.json'),
      upside: out('scenario-upside.json'),
    },
    sensitivity: out('sensitivity.json'),
    reconciliation: out('reconciliation-report.json'),
    register: readJSON(join(here, 'assumptions-register.json')),
    notes: readJSON(join(here, 'deliverable-notes.json')),
  };

  const versioned = [
    ['portfolio', inputs.portfolio],
    ...inputs.projects.map((p) => [p.config.project_id, p]),
    ['scenario-summary', inputs.scenarios.summary],
    ['sensitivity', inputs.sensitivity],
    ['reconciliation', inputs.reconciliation],
  ];
  const versions = new Set(versioned.map(([, v]) => v.engine_version));
  if (versions.size !== 1) {
    throw new Error(
      `inputs disagree on engine_version (${[...versions].join(', ')}) — regenerate all runners`
    );
  }
  const unverified = versioned.filter(([, v]) => v.kv_verified === false).map(([k]) => k);
  if (unverified.length) {
    throw new Error(
      `inputs computed against an UNVERIFIED KV snapshot (${unverified.join(', ')}) — ` +
      `do not deliver; re-run the runners online`
    );
  }
  if (inputs.register.rows.length !== inputs.notes.register_count) {
    throw new Error(
      `register has ${inputs.register.rows.length} rows but deliverable-notes says ` +
      `${inputs.notes.register_count} — one of them is stale`
    );
  }
  return inputs;
}

// ── Sheet helpers ──────────────────────────────────────────────────────────

/** Section heading: amber rule above a small-caps label. */
function heading(ws, text, { width } = {}) {
  const row = ws.addRow([text]);
  row.font = { bold: true, size: 12, color: { argb: C.tobacco } };
  row.getCell(1).fill = fill(C.amberGlaze);
  if (width) {
    ws.mergeCells(row.number, 1, row.number, width);
    ws.getCell(row.number, 1).fill = fill(C.amberGlaze);
    for (let c = 1; c <= width; c += 1) ws.getCell(row.number, c).fill = fill(C.amberGlaze);
  }
  return row;
}

/** Wrapped prose paragraph spanning `width` columns. */
function note(ws, text, { width = 6, italic = true, height } = {}) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, width);
  const cell = ws.getCell(row.number, 1);
  cell.alignment = { wrapText: true, vertical: 'top' };
  cell.font = { italic, size: 9.5, color: { argb: C.tobacco } };
  row.height = height ?? Math.max(14, Math.ceil(text.length / (width * 16)) * 13);
  return row;
}

function headerRow(ws, values, { bg = C.tobacco, fg = C.white } = {}) {
  const row = ws.addRow(values);
  row.font = { bold: true, size: 10, color: { argb: fg } };
  row.alignment = { wrapText: true, vertical: 'bottom' };
  for (let c = 1; c <= values.length; c += 1) ws.getCell(row.number, c).fill = fill(bg);
  return row;
}

const blank = (ws, n = 1) => { for (let i = 0; i < n; i += 1) ws.addRow([]); };

const widths = (ws, ...w) => w.forEach((width, i) => { ws.getColumn(i + 1).width = width; });

const eurFmt = (row, from, to, fmt = MONEY) => {
  for (let c = from; c <= to; c += 1) row.getCell(c).numFmt = fmt;
};

const pct = (v, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`);

// ── Tab 1: Cover ───────────────────────────────────────────────────────────

function coverTab(wb, inp, meta) {
  const ws = wb.addWorksheet('Cover', { properties: { tabColor: { argb: C.amber } } });
  widths(ws, 30, 96);
  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const e = inp.notes.engagement;
  const title = ws.addRow([`${e.provider.split(' — ')[0]} · ${e.deliverable}`]);
  title.font = { bold: true, size: 16, color: { argb: C.tobacco } };
  ws.mergeCells(title.number, 1, title.number, 2);
  ws.getCell(title.number, 1).fill = fill(C.birchDark);
  ws.getCell(title.number, 2).fill = fill(C.birchDark);
  title.height = 26;
  blank(ws);

  const rows = [
    ['Client', e.client],
    ['Client contact', e.client_contact],
    ['Version', e.version],
    ['Generated', meta.generatedAt],
    ['Prepared by', e.provider],
    ['Contact', e.provider_contact],
    ['Engine version', `KKME revenue engine ${e.engine_version}`],
    ['Market state captured', inp.portfolio.kv_captured_at ?? inp.portfolio.generated_at],
    ['Portfolio', `${inp.portfolio.portfolio.projects} projects · ${inp.portfolio.portfolio.mw} MW / ${inp.portfolio.portfolio.mwh} MWh · ${inp.portfolio.portfolio.calendar_span}`],
    ['Discount rate', `${(inp.portfolio.portfolio.wacc * 100).toFixed(1)}% WACC`],
  ];
  for (const [k, v] of rows) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10, color: { argb: C.tobacco } };
    r.getCell(2).font = { size: 11 };
  }

  blank(ws);
  heading(ws, 'Scope as locked', { width: 2 });
  note(ws, inp.notes.scope_lock, { width: 2, italic: false, height: 74 });

  blank(ws);
  heading(ws, 'How these numbers are produced', { width: 2 });
  note(ws, inp.notes.figures_basis, { width: 2, italic: false, height: 46 });
  note(ws, inp.notes.reconciliation_note, { width: 2, italic: false, height: 60 });

  blank(ws);
  heading(ws, 'Headline — Central', { width: 2 });
  const p = inp.portfolio.portfolio;
  const h = [
    ['Y1 gross market revenues', inp.portfolio.bridge_y1.gross_market_revenues],
    ['Y1 project EBITDA', inp.portfolio.bridge_y1.project_ebitda],
    ['Y1 pre-financing cash flow', inp.portfolio.bridge_y1.pre_financing_cf],
    ['20-yr pre-financing cash flow', inp.portfolio.bridge_totals.pre_financing_cf],
    [inp.notes.npv_label, p.npv_pre_financing_pre_tax],
  ];
  for (const [k, v] of h) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { size: 10 };
    r.getCell(2).numFmt = `"€"${MONEY}`;
    r.getCell(2).font = { bold: true, size: 11 };
    r.getCell(2).alignment = { horizontal: 'left' };
  }
  const moic = ws.addRow(['MOIC (undiscounted)', p.moic]);
  moic.getCell(2).numFmt = NUM3;
  moic.getCell(2).font = { bold: true, size: 11 };
  moic.getCell(2).alignment = { horizontal: 'left' };
  const pb = ws.addRow(['Payback', `${p.payback_years} years from first CAPEX draw`]);
  pb.getCell(1).font = { size: 10 };

  blank(ws);
  heading(ws, 'Tabs in this workbook', { width: 2 });
  const inventory = [
    ['Cover', 'This page — engagement, scope, headline figures.'],
    ['Assumptions', `All ${inp.notes.register_count} register rows with sources, ranges and an editable override column.`],
    ['Bridge Y1', 'The commissioned 8-line bridge, per project and consolidated, with revenue and cost sub-lines.'],
    ['20-yr CF', 'Year-by-year cash flow to 2048, per project and consolidated, with the CAPEX events.'],
    ['Scenarios', 'Downside / Central / Upside with their six drivers, and a scenario selector.'],
    ['Sensitivity', 'One-at-a-time driver perturbation ranked by 20-year swing.'],
    ['Reconciliation', 'Every internal tie-out and external benchmark check, with status.'],
    ['Glossary', 'Terms as used in this model.'],
  ];
  for (const [k, v] of inventory) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, size: 10, color: { argb: C.sea } };
    r.getCell(2).font = { size: 10 };
  }

  blank(ws);
  note(ws, inp.notes.excluded_items, { width: 2, italic: true });
  return ws;
}

// ── Tab 2: Assumptions ─────────────────────────────────────────────────────

async function assumptionsTab(wb, inp) {
  const ws = wb.addWorksheet('Assumptions', { properties: { tabColor: { argb: C.sea } } });
  widths(ws, 26, 15, 44, 12, 12, 58, 16, 14);

  heading(ws, `Assumptions register — ${inp.register.rows.length} rows`, { width: 8 });
  note(ws, inp.notes.override_mechanism, { width: 8, italic: false, height: 58 });
  note(ws, inp.register._value_basis, { width: 8, height: 44 });
  blank(ws);

  const hdr = headerRow(ws, [
    'id', 'category', 'label', 'value', 'unit', 'source',
    'sensitivity range', 'override (EDITABLE)',
  ]);
  hdr.getCell(8).fill = fill(C.amber);
  ws.views = [{ state: 'frozen', ySplit: hdr.number }];

  const firstDataRow = hdr.number + 1;
  for (const row of inp.register.rows) {
    const range = Array.isArray(row.sensitivity_range)
      ? `${row.sensitivity_range[0]} – ${row.sensitivity_range[1]}`
      : '—';
    const r = ws.addRow([
      row.id, row.category, row.label, row.value, row.unit ?? '', row.source, range,
      row.override ?? null,
    ]);
    r.alignment = { wrapText: true, vertical: 'top' };
    r.font = { size: 9.5 };
    r.getCell(1).font = { size: 9, color: { argb: C.sea } };
    r.getCell(4).numFmt = Number.isInteger(row.value) ? MONEY : NUM3;
    r.getCell(4).font = { bold: true, size: 9.5 };
    // The override cell is the one thing in this workbook the client edits.
    r.getCell(8).protection = { locked: false };
    r.getCell(8).fill = fill(C.amberGlaze);
    r.getCell(8).numFmt = Number.isInteger(row.value) ? MONEY : NUM3;
  }
  const lastDataRow = ws.lastRow.number;

  blank(ws);
  note(ws, inp.register._note, { width: 8, height: 58 });
  note(ws, inp.register._sensitivity_range, { width: 8, height: 30 });

  // Protection is a signal, not a security measure: it keeps the engine-derived
  // columns from being edited by accident while leaving the override column open.
  await ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: true,
    formatRows: true,
    insertRows: false,
    deleteRows: false,
    sort: true,
    autoFilter: true,
  });
  ws.autoFilter = { from: { row: hdr.number, column: 1 }, to: { row: lastDataRow, column: 8 } };
  return ws;
}

// ── Tab 3: Bridge Y1 ───────────────────────────────────────────────────────

/**
 * The Y1 normalisation denominator. Y1 is a staggered year — only some projects
 * are operating, and some of those for part of the year — so dividing by
 * nameplate MW would understate the per-MW figure. The honest denominator is
 * operational MW-years, rebuilt from the contributor list the portfolio runner
 * already emits.
 */
export function operationalMwYears(portfolio) {
  const mwById = Object.fromEntries(portfolio.per_project.map((p) => [p.project_id, p.mw]));
  return portfolio.bridge_y1.contributors.reduce(
    (acc, c) => acc + (mwById[c.project_id] ?? 0) * (c.operational_months / 12),
    0
  );
}

function bridgeTab(wb, inp) {
  const ws = wb.addWorksheet('Bridge Y1', { properties: { tabColor: { argb: C.tobacco } } });
  widths(ws, 40, 16, 16, 16, 18, 20);

  const pf = inp.portfolio;
  const projs = pf.per_project;
  const mwYears = operationalMwYears(pf);

  const y1Year = pf.bridge_y1.cal_year;
  /** A project's bridge row for a given calendar year, or null before its COD. */
  const projYear = (projectId, calYear) => {
    const proj = inp.projects.find((x) => x.config.project_id === projectId);
    return proj.bridge_20yr.find((b) => b.cal_year === calYear) ?? null;
  };
  const monthsIn = (projectId, calYear) => {
    const c = pf.bridge_20yr.find((b) => b.cal_year === calYear)
      ?.contributors.find((x) => x.project_id === projectId);
    return c ? c.operational_months : 0;
  };

  // ── Block A: the consolidated first year, which ties out exactly ─────────
  heading(ws, `Year-1 bridge — calendar ${y1Year}, the portfolio's first operating year`, { width: 6 });
  note(ws, inp.notes.figures_basis, { width: 6, italic: false, height: 30 });
  note(ws,
    `Columns are each project's contribution to calendar ${y1Year}, so the portfolio column is ` +
    `their exact sum. Projects commission on different dates: a project not yet operating in ` +
    `${y1Year} shows nothing here, and one that commissions mid-year contributes only the months ` +
    `it runs. Each project's own first full year is shown in the second block below.`,
    { width: 6, height: 44 });
  blank(ws);

  const colHeader = projs.map((p) => {
    const m = monthsIn(p.project_id, y1Year);
    return `${p.name}\n${p.mw} MW · COD ${p.cod}\n${m ? `${m} of 12 months in ${y1Year}` : `not operating in ${y1Year}`}`;
  });
  headerRow(ws, ['Bridge line', ...colHeader, 'Portfolio', '€k per operational MW-yr']);
  ws.getRow(ws.lastRow.number).height = 44;

  for (const [key, label, kind] of inp.notes.bridge_lines) {
    const values = projs.map((p) => {
      const row = projYear(p.project_id, y1Year);
      return row ? row[key] : null;
    });
    const total = pf.bridge_y1[key];
    const r = ws.addRow([label, ...values, total, total / mwYears / 1000]);
    eurFmt(r, 2, 5);
    r.getCell(6).numFmt = NUM2;
    r.font = { size: 10 };
    if (kind === 'subtotal' || kind === 'total') {
      r.font = { size: 10, bold: true };
      for (let c = 1; c <= 6; c += 1) {
        ws.getCell(r.number, c).fill = fill(kind === 'total' ? C.amberGlaze : C.birchDark);
        ws.getCell(r.number, c).border = { top: { style: 'thin', color: { argb: C.tobacco } } };
      }
    }
    if (kind === 'deduction') r.getCell(1).alignment = { indent: 1 };
  }

  const excl = ws.addRow([inp.notes.excluded_items]);
  ws.mergeCells(excl.number, 1, excl.number, 6);
  ws.getCell(excl.number, 1).font = { strike: true, italic: true, size: 9.5, color: { argb: C.tobacco } };

  blank(ws);
  note(ws,
    `€k per operational MW-yr divides the portfolio column by ${mwYears.toFixed(2)} operational ` +
    `MW-years — nameplate MW weighted by the months each project actually operates in ` +
    `${y1Year}. Dividing by the ${pf.portfolio.mw} MW nameplate would understate it, because ` +
    `only ${pf.bridge_y1.contributors.length} of the ${projs.length} projects are earning at all ` +
    `in ${y1Year} and not all of them for the full year.`,
    { width: 6, height: 44 });
  blank(ws);

  // ── Block B: each project's own first year ──────────────────────────────
  heading(ws, 'Each project\'s own first operating year', { width: 6 });
  note(ws,
    'The same bridge, read per asset rather than per calendar year. These columns are ' +
    'deliberately NOT summed: they fall in different calendar years, so a total across them ' +
    'would not be a year of anything. Use the consolidated block above for portfolio figures ' +
    'and the 20-yr CF tab for the full calendar timeline.',
    { width: 6, height: 44 });
  headerRow(ws, [
    'Bridge line',
    ...projs.map((p) => `${p.name}\nY1 = ${p.bridge_y1.cal_year}\n${p.operational_months_y1} of 12 months`),
    '(not summed)', '',
  ]);
  ws.getRow(ws.lastRow.number).height = 44;
  for (const [key, label, kind] of inp.notes.bridge_lines) {
    const r = ws.addRow([label, ...projs.map((p) => p.bridge_y1[key]), null, null]);
    eurFmt(r, 2, 4);
    r.font = { size: 10, bold: kind === 'subtotal' || kind === 'total' };
    if (kind === 'subtotal' || kind === 'total') {
      for (let c = 1; c <= 4; c += 1) {
        ws.getCell(r.number, c).fill = fill(kind === 'total' ? C.amberGlaze : C.birchDark);
      }
    }
    if (kind === 'deduction') r.getCell(1).alignment = { indent: 1 };
  }
  blank(ws);
  note(ws, inp.notes.partial_year_note, { width: 6, height: 44 });
  blank(ws);

  // ── Revenue sub-lines ────────────────────────────────────────────────────
  heading(ws, 'Revenue detail — the ten contracted lines', { width: 6 });
  note(ws, inp.notes.revenue_lines._note, { width: 6, italic: false, height: 76 });
  blank(ws);

  headerRow(ws, ['Contracted revenue line', 'Engine quantity', 'Formula the engine evaluates', '', '', 'Resolution']);
  for (const [label, quantity, formula, resolution] of inp.notes.revenue_lines.lines) {
    const r = ws.addRow([label, quantity, formula, '', '', resolution]);
    ws.mergeCells(r.number, 3, r.number, 5);
    r.alignment = { wrapText: true, vertical: 'top' };
    r.font = { size: 9 };
    r.getCell(2).font = { size: 9, bold: true, color: { argb: C.sea } };
    r.height = 28;
    if (quantity === '—') {
      for (let c = 1; c <= 6; c += 1) ws.getCell(r.number, c).fill = fill(C.rustGlaze);
    }
  }
  blank(ws);

  // The computed revenue quantities the engine actually emits, on the same
  // calendar-year basis as Block A so the portfolio column is a real sum.
  headerRow(ws, [
    `Engine revenue quantity — calendar ${y1Year}`,
    ...projs.map((p) => p.name), 'Portfolio', 'share of gross',
  ]);
  const engineYear = (projectId) => {
    const proj = inp.projects.find((x) => x.config.project_id === projectId);
    return proj.engine.years.find((y) => y.cal_year === y1Year) ?? null;
  };
  const engineY1 = projs.map((p) => engineYear(p.project_id));
  const quantities = [
    ['Reserve capacity (rev_cap — indicative 65% split)', 'rev_cap'],
    ['Reserve activation (rev_act — indicative 35% split)', 'rev_act'],
    ['Balancing revenue, computed (rev_bal)', 'rev_bal'],
    ['Energy trading / DA arbitrage (rev_trd)', 'rev_trd'],
    ['Engine gross revenue (rev_gross)', 'rev_gross'],
  ];
  const grossTotal = engineY1.reduce((a, y) => a + (y?.rev_gross ?? 0), 0);
  for (const [label, key] of quantities) {
    const vals = engineY1.map((y) => (y ? y[key] : null));
    const total = vals.reduce((a, b) => a + (b ?? 0), 0);
    const r = ws.addRow([label, ...vals, total, grossTotal ? total / grossTotal : 0]);
    eurFmt(r, 2, 5);
    r.getCell(6).numFmt = PCT2;
    r.font = { size: 9.5, bold: key === 'rev_gross' || key === 'rev_bal' };
  }
  blank(ws);
  note(ws, inp.notes.revenue_lines.split_caveat, { width: 6, height: 44 });
  note(ws, inp.notes.revenue_lines.fcr_caveat, { width: 6, height: 44 });
  blank(ws);
  note(ws, `Charging cost — ${pf.bridge_notes?.charging_costs ?? inp.projects[0].bridge_notes.charging_costs}`,
    { width: 6, height: 46 });
  blank(ws);

  // ── Cost sub-lines ───────────────────────────────────────────────────────
  heading(ws, 'Cost detail — the four deduction lines', { width: 6 });
  headerRow(ws, ['Cost line', 'Basis', ...projs.map((p) => `${p.name} ${y1Year}`), `Portfolio ${y1Year}`]);
  const cb = inp.projects[0].cost_basis;
  const basisFor = {
    optimiser: `${(cb.optimiser_pct_gross * 100).toFixed(1)}% of gross market revenues`,
    grid: `${(cb.grid_pct_gross * 100).toFixed(1)}% of gross market revenues`,
    market: `${(cb.market_pct_gross * 100).toFixed(1)}% of gross market revenues`,
    operating: `€${(cb.operating_eur_kw_yr + (cb.operating_calibration_eur_kw_yr ?? 0)).toFixed(2)}/kW/yr, escalating ${(cb.operating_escalation * 100).toFixed(1)}%/yr`,
  };
  for (const [key, label] of inp.notes.cost_lines.map(([k, l]) => [k, l])) {
    const vals = projs.map((p) => {
      const row = projYear(p.project_id, y1Year);
      return row ? row[key] : null;
    });
    const r = ws.addRow([label, basisFor[key], ...vals, pf.bridge_y1[key]]);
    eurFmt(r, 3, 6);
    r.font = { size: 9.5 };
    r.getCell(2).font = { size: 9, italic: true };
  }
  blank(ws);

  // The client's 4-line stack and the engine's own 3-line stack are two readings
  // of the same economics. Reported side by side rather than forced to agree.
  heading(ws, 'Cost stack vs the engine\'s own treatment', { width: 6 });
  headerRow(ws, ['', ...projs.map((p) => p.name), '', '']);
  const recRows = [
    ['Engine stack (RTM + BRP + OPEX), Y1', (r) => r.engine_stack_y1, `"€"${MONEY}`],
    ['Client 4-line stack, Y1', (r) => r.client_stack_y1, `"€"${MONEY}`],
    ['Residual', (r) => r.delta, `"€"${MONEY}`],
    ['Residual as % of the engine stack', (r) => r.delta_pct, PCT2],
  ];
  const recs = projs.map((p) =>
    inp.projects.find((x) => x.config.project_id === p.project_id).cost_basis.reconciliation);
  for (const [label, get, fmt] of recRows) {
    const r = ws.addRow([label, ...recs.map(get)]);
    for (let c = 2; c <= 4; c += 1) r.getCell(c).numFmt = fmt;
    r.font = { size: 9.5, bold: label === 'Residual' };
  }
  note(ws, recs[0].note, { width: 6, height: 90 });
  return ws;
}

// ── Tab 4: 20-yr CF ────────────────────────────────────────────────────────

function cashflowTab(wb, inp) {
  const ws = wb.addWorksheet('20-yr CF', { properties: { tabColor: { argb: C.moss } } });
  const pf = inp.portfolio;
  const years = pf.bridge_20yr.map((b) => b.cal_year);
  widths(ws, 42, ...years.map(() => 13));

  heading(ws, `Cash flow by calendar year — ${pf.portfolio.calendar_span}`, { width: years.length + 1 });
  note(ws, inp.notes.capex_note, { width: Math.min(years.length + 1, 10), height: 30 });
  blank(ws);

  const yearHeader = () => {
    const r = headerRow(ws, ['', ...years]);
    for (let c = 2; c <= years.length + 1; c += 1) {
      r.getCell(c).alignment = { horizontal: 'right' };
      r.getCell(c).numFmt = '0'; // a year, not a quantity — no thousands separator
    }
    return r;
  };

  /** One project's (or the portfolio's) block: three rows keyed by calendar year. */
  const block = (label, bridge20, { bold = false } = {}) => {
    const byYear = Object.fromEntries(bridge20.map((b) => [b.cal_year, b]));
    const h = ws.addRow([label]);
    h.font = { bold: true, size: 11, color: { argb: C.tobacco } };
    ws.mergeCells(h.number, 1, h.number, years.length + 1);
    ws.getCell(h.number, 1).fill = fill(C.birchDark);
    for (let c = 1; c <= years.length + 1; c += 1) ws.getCell(h.number, c).fill = fill(C.birchDark);
    yearHeader();

    // Deduction lines carry positive values under a "less:" label, the same
    // convention as the Bridge Y1 tab — one sign convention across the workbook.
    const rows = [
      ['Project EBITDA (operating CF)', (b) => b.project_ebitda, false],
      ['less: maintenance CAPEX', (b) => b.maintenance_capex, false],
      ['less: augmentation CAPEX (Y8)', (b) => b.augmentation_capex, true],
      ['less: replacement CAPEX (Y15)', (b) => b.replacement_capex, true],
      ['Pre-financing cash flow', (b) => b.pre_financing_cf, false],
    ];
    for (const [rowLabel, get, isEvent] of rows) {
      const r = ws.addRow([rowLabel, ...years.map((y) => (byYear[y] ? get(byYear[y]) : null))]);
      eurFmt(r, 2, years.length + 1);
      const isTotal = rowLabel.startsWith('Pre-financing');
      r.font = { size: 9.5, bold: isTotal || bold };
      if (isTotal) {
        for (let c = 1; c <= years.length + 1; c += 1) {
          ws.getCell(r.number, c).border = { top: { style: 'thin', color: { argb: C.tobacco } } };
        }
      }
      if (isEvent) {
        years.forEach((y, i) => {
          const v = byYear[y] ? get(byYear[y]) : 0;
          if (v) ws.getCell(r.number, i + 2).fill = fill(rowLabel.includes('augmentation') ? C.amberGlaze : C.rustGlaze);
        });
      }
    }
    blank(ws);
  };

  for (const p of pf.per_project) {
    const proj = inp.projects.find((x) => x.config.project_id === p.project_id);
    block(`${p.name} — ${p.mw} MW / ${p.mwh} MWh · COD ${p.cod}`, proj.bridge_20yr);
  }
  block(`Portfolio consolidated — ${pf.portfolio.mw} MW / ${pf.portfolio.mwh} MWh`, pf.bridge_20yr, { bold: false });

  // ── Discounting footer ───────────────────────────────────────────────────
  heading(ws, 'Discounted returns', { width: 8 });
  headerRow(ws, ['', ...pf.per_project.map((p) => p.name), 'Portfolio']);
  const footer = [
    ['Gross CAPEX', (p) => p.gross_capex, `"€"${MONEY}`, pf.portfolio.gross_capex],
    ['20-yr pre-financing CF (undiscounted)', (p) => p.bridge_totals.pre_financing_cf, `"€"${MONEY}`, pf.bridge_totals.pre_financing_cf],
    [inp.notes.npv_label, (p) => p.npv_pre_financing_pre_tax, `"€"${MONEY}`, pf.portfolio.npv_pre_financing_pre_tax],
    ['MOIC (undiscounted)', (p) => p.moic, NUM3, pf.portfolio.moic],
    ['Payback (years from first CAPEX draw)', (p) => p.payback_years, '0', pf.portfolio.payback_years],
    ['Engine NPV, post-tax (memo)', (p) => p.engine_npv_post_tax, `"€"${MONEY}`, null],
    ['Engine project IRR (memo)', (p) => p.engine_project_irr, PCT2, null],
  ];
  for (const [label, get, fmt, total] of footer) {
    const r = ws.addRow([label, ...pf.per_project.map(get), total]);
    for (let c = 2; c <= 5; c += 1) r.getCell(c).numFmt = fmt;
    r.font = { size: 9.5, bold: label === inp.notes.npv_label };
  }
  blank(ws);
  note(ws, pf.portfolio.npv_basis, { width: 8, height: 46 });
  note(ws,
    `Correlation — LT zone price correlation ${pf.correlation_note.lt_zone_price_correlation}, ` +
    `spatial diversification ${pf.correlation_note.spatial_diversification}. ${pf.correlation_note.note}`,
    { width: 8, height: 58 });
  note(ws, pf.timeline_note ?? '', { width: 8, height: 44 });
  return ws;
}

// ── Tab 5: Scenarios (with the selector) ───────────────────────────────────

const SCENARIO_ORDER = ['downside', 'central', 'upside'];
const SCENARIO_LABEL = { downside: 'Downside', central: 'Central', upside: 'Upside' };

const HEADLINE_ROWS = [
  ['Y1 gross market revenues', 'gross_y1', `"€"${MONEY}`],
  ['Y1 project EBITDA', 'ebitda_y1', `"€"${MONEY}`],
  ['Y1 pre-financing cash flow', 'prefin_cf_y1', `"€"${MONEY}`],
  ['20-yr net market revenue', 'sum_20yr_net', `"€"${MONEY}`],
  ['NPV @ 8%', 'npv', `"€"${MONEY}`],
  ['MOIC', 'moic', NUM3],
];

const DRIVER_ROWS = [
  ['Pipeline realisation rate', 'fleet_realisation_pct', '%', 'Share of the announced Baltic BESS pipeline assumed to reach operation — a higher rate means more competing capacity, so it moves revenue inversely.'],
  ['DA spread growth', 'spread_growth_pct_yr', '%/yr', 'Annual widening of the captured day-ahead spread.'],
  ['Availability factor', 'availability_pct', '%', 'Forced-outage and scheduled-maintenance haircut.'],
  ['Trading realisation', 'trading_realisation', '×', 'Share of the theoretical spread an optimiser actually captures.'],
  ['Reserve capacity price delta', 'cap_price_delta_pct', '%', 'Shift applied to observed aFRR/mFRR capacity prices.'],
  ['Cannibalisation index floor', 'cpi_floor', '×', 'Lower bound on the Competition Pressure Index.'],
];

function scenariosTab(wb, inp) {
  const ws = wb.addWorksheet('Scenarios', { properties: { tabColor: { argb: C.amber } } });
  widths(ws, 42, 18, 18, 18, 6, 62);

  const sum = inp.scenarios.summary;
  heading(ws, 'Scenarios — portfolio consolidated', { width: 4 });
  note(ws, sum.central_invariant
    ? `Central is the same run as the base portfolio (${sum.central_invariant.status} match on ${sum.central_invariant.compared_fields}). Monotonicity check: ${sum.monotonicity.status} — ${sum.monotonicity.rule}.`
    : '', { width: 6, height: 30 });
  blank(ws);

  // Headline table — this block is also the lookup source for the selector.
  const hdr = headerRow(ws, ['', ...SCENARIO_ORDER.map((s) => SCENARIO_LABEL[s]), '', 'Note']);
  const headlineFirstRow = hdr.number + 1;
  for (const [label, key, fmt] of HEADLINE_ROWS) {
    const r = ws.addRow([label, ...SCENARIO_ORDER.map((s) => sum.headlines[s][key])]);
    for (let c = 2; c <= 4; c += 1) r.getCell(c).numFmt = fmt;
    r.font = { size: 10, bold: key === 'npv' };
    if (key === 'npv') {
      for (let c = 1; c <= 4; c += 1) ws.getCell(r.number, c).fill = fill(C.amberGlaze);
      ws.getCell(r.number, 6).value = inp.notes.npv_label;
      ws.getCell(r.number, 6).font = { size: 9, italic: true };
      ws.getCell(r.number, 6).alignment = { wrapText: true, vertical: 'top' };
    }
  }
  const headlineLastRow = ws.lastRow.number;
  blank(ws);

  // Driver table.
  heading(ws, 'The six locked scenario drivers', { width: 4 });
  headerRow(ws, ['Driver', ...SCENARIO_ORDER.map((s) => SCENARIO_LABEL[s]), '', 'What it is']);
  for (const [label, key, unit, desc] of DRIVER_ROWS) {
    const r = ws.addRow([
      `${label} (${unit})`,
      ...SCENARIO_ORDER.map((s) => sum.drivers[s][key]),
      '', desc,
    ]);
    for (let c = 2; c <= 4; c += 1) r.getCell(c).numFmt = NUM2;
    r.font = { size: 9.5 };
    r.getCell(6).font = { size: 9, italic: true };
    r.getCell(6).alignment = { wrapText: true, vertical: 'top' };
    r.height = 24;
  }
  blank(ws);

  // ── Selector ─────────────────────────────────────────────────────────────
  heading(ws, 'Scenario selector', { width: 4 });
  note(ws, inp.notes.scenario_selector_label, { width: 6, italic: false, height: 44 });

  const selRow = ws.addRow(['Selected scenario →', SCENARIO_LABEL.central]);
  const selCell = ws.getCell(selRow.number, 2);
  selCell.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`"${SCENARIO_ORDER.map((s) => SCENARIO_LABEL[s]).join(',')}"`],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Pick a scenario',
    error: 'Choose Downside, Central or Upside.',
  };
  selCell.fill = fill(C.amber);
  selCell.font = { bold: true, size: 12, color: { argb: C.white } };
  selCell.protection = { locked: false };
  selRow.getCell(1).font = { bold: true, size: 11 };
  const selAddr = `$B$${selRow.number}`;
  const labelRange = `$B$${hdr.number}:$D$${hdr.number}`;
  blank(ws);

  for (let i = 0; i < HEADLINE_ROWS.length; i += 1) {
    const [label, , fmt] = HEADLINE_ROWS[i];
    const srcRow = headlineFirstRow + i;
    const r = ws.addRow([label]);
    const cell = ws.getCell(r.number, 2);
    cell.value = {
      formula: `INDEX($B$${srcRow}:$D$${srcRow},MATCH(${selAddr},${labelRange},0))`,
    };
    cell.numFmt = fmt;
    cell.font = { bold: true, size: 12 };
    cell.fill = fill(C.amberGlaze);
    r.getCell(1).font = { size: 10, bold: true };
  }
  blank(ws);
  note(ws,
    `The selector reads across the headline block above (rows ${headlineFirstRow}–${headlineLastRow}) ` +
    `with INDEX/MATCH. Changing it re-displays a different pre-computed engine run; it does not ` +
    `re-run the model. Editing an assumption on the Assumptions tab has no effect here either — ` +
    `overrides are applied by re-running the KKME engine.`,
    { width: 6, height: 44 });
  blank(ws);

  // Per-project detail under each scenario.
  heading(ws, 'Per project, by scenario', { width: 6 });
  headerRow(ws, ['Project · metric', ...SCENARIO_ORDER.map((s) => SCENARIO_LABEL[s]), '', '']);
  const metrics = [
    ['Y1 project EBITDA', (p) => p.bridge_y1.project_ebitda, `"€"${MONEY}`],
    ['NPV @ 8% (pre-financing, pre-tax)', (p) => p.npv_pre_financing_pre_tax, `"€"${MONEY}`],
    ['MOIC', (p) => p.moic, NUM3],
    ['Engine project IRR', (p) => p.engine_project_irr, PCT2],
  ];
  for (const proj of inp.scenarios.central.per_project) {
    const nameRow = ws.addRow([proj.name]);
    nameRow.font = { bold: true, size: 10, color: { argb: C.sea } };
    for (const [label, get, fmt] of metrics) {
      const vals = SCENARIO_ORDER.map((s) => {
        const match = inp.scenarios[s].per_project.find((x) => x.project_id === proj.project_id);
        return match ? get(match) : null;
      });
      const r = ws.addRow([`    ${label}`, ...vals]);
      for (let c = 2; c <= 4; c += 1) r.getCell(c).numFmt = fmt;
      r.font = { size: 9.5 };
    }
  }
  blank(ws);
  note(ws, inp.notes.upside_warn_note, { width: 6, height: 30 });
  return ws;
}

// ── Tab 6: Sensitivity ─────────────────────────────────────────────────────

function sensitivityTab(wb, inp) {
  const ws = wb.addWorksheet('Sensitivity', { properties: { tabColor: { argb: C.sea } } });
  widths(ws, 34, 11, 11, 11, 16, 16, 16, 16, 60);

  const s = inp.sensitivity;
  heading(ws, 'Sensitivity — one driver at a time from Central', { width: 8 });
  note(ws, s.basis, { width: 9, italic: false, height: 44 });
  blank(ws);

  headerRow(ws, [
    'Driver', 'Central', 'Down', 'Up',
    'Δ EBITDA Y1 (down)', 'Δ EBITDA Y1 (up)', 'Δ NPV (down)', 'Δ NPV (up)',
    '20-yr EBITDA swing',
  ]);

  // Already emitted sorted by |20-yr swing|; sort again so the tab cannot drift
  // if the runner's ordering ever changes.
  const rows = [...s.drivers].sort((a, b) => Math.abs(b.swing_20yr) - Math.abs(a.swing_20yr));
  rows.forEach((d, i) => {
    const r = ws.addRow([
      `${d.label} (${d.unit})`, d.central, d.down_value, d.up_value,
      d.delta_ebitda_down, d.delta_ebitda_up, d.delta_npv_down, d.delta_npv_up, d.swing_20yr,
    ]);
    for (let c = 2; c <= 4; c += 1) r.getCell(c).numFmt = NUM2;
    eurFmt(r, 5, 9);
    r.font = { size: 9.5, bold: i < 3 };
    if (i < 3) {
      for (let c = 1; c <= 9; c += 1) ws.getCell(r.number, c).fill = fill(C.amberGlaze);
    }
    if (d.swing_20yr === 0) {
      for (let c = 1; c <= 9; c += 1) ws.getCell(r.number, c).fill = fill(C.birchDark);
      r.font = { size: 9.5, italic: true };
    }
  });
  blank(ws);
  note(ws, 'Top three by 20-year swing are highlighted. Rows shaded grey moved nothing.', { width: 9 });
  note(ws, inp.notes.dead_drivers_note, { width: 9, italic: false, height: 58 });
  blank(ws);

  heading(ws, 'Why two drivers move nothing', { width: 9 });
  for (const d of rows.filter((x) => x.zero_effect_reason)) {
    const r = ws.addRow([`${d.label} — ${d.engine_binding}`]);
    r.font = { bold: true, size: 9.5 };
    ws.mergeCells(r.number, 1, r.number, 9);
    note(ws, d.zero_effect_reason, { width: 9, italic: false, height: 76 });
  }
  blank(ws);

  heading(ws, 'Single-variable deltas do not sum to the scenario delta', { width: 9 });
  headerRow(ws, ['', 'Scenario Δ EBITDA Y1', 'Σ single-variable Δ', 'Interaction residual', '% of scenario Δ', '', '', '', '']);
  for (const key of ['downside', 'upside']) {
    const it = s.interaction[key];
    const r = ws.addRow([
      SCENARIO_LABEL[key], it.scenario_delta_ebitda_y1, it.sum_of_single_variable_deltas,
      it.interaction_residual, it.residual_pct_of_scenario_delta / 100,
    ]);
    eurFmt(r, 2, 4);
    r.getCell(5).numFmt = PCT2;
    r.font = { size: 9.5 };
  }
  note(ws, s.interaction.downside.note, { width: 9, italic: false, height: 58 });
  blank(ws);
  note(ws, `Sign sanity: ${s.sign_sanity.status} — ${s.sign_sanity.rule}.`, { width: 9, height: 26 });
  return ws;
}

// ── Tab 7: Reconciliation ──────────────────────────────────────────────────

const STATUS_FILL = { pass: C.seaGlaze, warn: C.amberGlaze, fail: C.rustGlaze };

function reconciliationTab(wb, inp) {
  const ws = wb.addWorksheet('Reconciliation', { properties: { tabColor: { argb: C.moss } } });
  widths(ws, 42, 22, 16, 16, 12, 11, 10, 56);

  const rec = inp.reconciliation;
  heading(ws, 'Reconciliation harness', { width: 8 });
  note(ws, inp.notes.reconciliation_note, { width: 8, italic: false, height: 58 });
  blank(ws);

  const sm = ws.addRow([
    'Internal tie-outs',
    `${rec.summary.internal.pass} / ${rec.summary.internal.total} pass`,
    `${rec.summary.internal.warn} warn`, `${rec.summary.internal.fail} fail`,
    `${rec.summary.distinct_internal_checks} distinct checks`,
  ]);
  sm.font = { bold: true, size: 10 };
  const sx = ws.addRow([
    'External benchmarks',
    `${rec.summary.external.pass} / ${rec.summary.external.total} pass`,
    `${rec.summary.external.warn} warn`, `${rec.summary.external.fail} fail`,
    `${rec.summary.distinct_external_checks} distinct checks`,
  ]);
  sx.font = { bold: true, size: 10 };
  note(ws, rec.summary.severity_split, { width: 8, height: 44 });
  blank(ws);

  heading(ws, `Internal — ${rec.internal.length} checks`, { width: 8 });
  headerRow(ws, ['Check', 'Subject', 'Actual', 'Expected', 'Delta', 'Tolerance', 'Status', 'Note']);
  for (const r0 of rec.internal) {
    const r = ws.addRow([
      r0.label, r0.subject, r0.actual, r0.expected, r0.delta, r0.tolerance,
      r0.status.toUpperCase(), r0.note ?? '',
    ]);
    for (let c = 3; c <= 6; c += 1) r.getCell(c).numFmt = r0.unit === 'EUR' ? MONEY : NUM3;
    r.font = { size: 9 };
    r.alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(r.number, 7).fill = fill(STATUS_FILL[r0.status] ?? C.birchDark);
    ws.getCell(r.number, 7).font = { size: 9, bold: true };
  }
  blank(ws);

  heading(ws, `External — ${rec.external.length} checks`, { width: 8 });
  headerRow(ws, ['Check', 'Subject', 'Actual', 'Band low', 'Band high', 'Unit', 'Status', 'Source']);
  for (const r0 of rec.external) {
    const fmt = r0.unit === 'EUR' ? MONEY : NUM3;
    const r = ws.addRow([
      r0.label, r0.subject, r0.actual, r0.band?.[0], r0.band?.[1], r0.unit,
      r0.status.toUpperCase(), r0.source,
    ]);
    for (let c = 3; c <= 5; c += 1) r.getCell(c).numFmt = fmt;
    r.font = { size: 9 };
    r.alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(r.number, 7).fill = fill(STATUS_FILL[r0.status] ?? C.birchDark);
    ws.getCell(r.number, 7).font = { size: 9, bold: true };
    if (r0.status !== 'pass') {
      ws.getCell(r.number, 1).font = { size: 9, bold: true };
      ws.getCell(r.number, 8).value = `${r0.source} — ${r0.severity_basis}`;
    }
  }
  blank(ws);
  note(ws, inp.notes.upside_warn_note, { width: 8, italic: false, height: 30 });
  return ws;
}

// ── Tab 8: Glossary ────────────────────────────────────────────────────────

function glossaryTab(wb, inp) {
  const ws = wb.addWorksheet('Glossary', { properties: { tabColor: { argb: C.birchDark } } });
  widths(ws, 20, 104);
  heading(ws, 'Glossary', { width: 2 });
  note(ws, inp.notes._glossary_provenance, { width: 2, height: 26 });
  blank(ws);
  headerRow(ws, ['Term', 'Meaning in this model']);
  for (const [term, meaning] of inp.notes.glossary) {
    const r = ws.addRow([term, meaning]);
    r.getCell(1).font = { bold: true, size: 10, color: { argb: C.sea } };
    r.getCell(2).font = { size: 9.5 };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.height = Math.max(15, Math.ceil(meaning.length / 108) * 13);
  }
  return ws;
}

// ── Build ──────────────────────────────────────────────────────────────────

export async function buildWorkbook(inputs, { generatedAt } = {}) {
  const meta = { generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10) };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KKME — kkme.eu';
  wb.company = 'KKME';
  wb.title = `${inputs.notes.engagement.deliverable} ${inputs.notes.engagement.version}`;

  coverTab(wb, inputs, meta);
  await assumptionsTab(wb, inputs);
  bridgeTab(wb, inputs);
  cashflowTab(wb, inputs);
  scenariosTab(wb, inputs);
  sensitivityTab(wb, inputs);
  reconciliationTab(wb, inputs);
  glossaryTab(wb, inputs);

  const names = wb.worksheets.map((w) => w.name);
  if (names.join('|') !== TABS.join('|')) {
    throw new Error(`tab set drifted: got ${names.join(', ')}`);
  }
  return wb;
}

export async function generateXlsx({ outputDir = OUTPUT_DIR, filename = XLSX_NAME, generatedAt } = {}) {
  const inputs = loadInputs({ outputDir });
  const wb = await buildWorkbook(inputs, { generatedAt });
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, filename);
  await wb.xlsx.writeFile(path);
  return { path, inputs };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const outArg = argv.find((a) => a.startsWith('--out='));
  const { path, inputs } = await generateXlsx({
    filename: outArg ? outArg.split('=')[1] : XLSX_NAME,
  });
  const { statSync } = await import('node:fs');
  const kb = (statSync(path).size / 1024).toFixed(1);
  console.log(`\n  Excel deliverable — ${TABS.length} tabs`);
  console.log(`  engine ${inputs.portfolio.engine_version} · register ${inputs.register.rows.length} rows · ` +
    `reconciliation ${inputs.reconciliation.summary.internal.pass}/${inputs.reconciliation.summary.internal.total} internal, ` +
    `${inputs.reconciliation.summary.external.pass}/${inputs.reconciliation.summary.external.total} external`);
  console.log(`  → ${path} (${kb} kB)\n`);
}
