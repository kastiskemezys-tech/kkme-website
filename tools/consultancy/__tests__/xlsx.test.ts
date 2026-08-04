// Phase 34.6 — Excel deliverable generator.
//
// The test that matters here is the ROUND-TRIP: build the workbook, parse the
// emitted file back with an independent read, and assert that the numbers in
// the cells equal the runner JSONs to the cent. A generator that silently
// dropped, rounded or transposed a figure would still produce a workbook that
// looks right; only reading it back catches that.
//
// The rest pins the structural contract the deliverable is specified against —
// tab set, register row count, scenario table, and that the four features the
// library was chosen for (dropdown, INDEX/MATCH, number formats, unlocked
// override cells) actually survive serialisation.

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { FIXTURE_DIR } from '../regen-fixtures.mjs';
import { loadInputs, buildWorkbook, operationalMwYears } from '../generate-xlsx.mjs';

type Any = Record<string, any>;

const TABS = [
  'Cover', 'Assumptions', 'Bridge Y1', '20-yr CF',
  'Scenarios', 'Sensitivity', 'Reconciliation', 'Glossary',
];

let inp: Any;
let wb: any;

/** Every cell value on a sheet, row-major, with formulas kept as objects. */
function cells(ws: any): any[][] {
  const out: any[][] = [];
  ws.eachRow({ includeEmpty: true }, (row: any) => {
    const vals: any[] = [];
    row.eachCell({ includeEmpty: true }, (c: any) => vals.push(c.value));
    out.push(vals);
  });
  return out;
}

/** Every row whose first cell equals `label`, in sheet order. */
function rowsByLabel(ws: any, label: string): any[] {
  const hits: any[] = [];
  ws.eachRow((row: any) => {
    const v = row.getCell(1).value;
    // Exact match, not trimmed: indented rows are a different (sub-detail) row.
    if (typeof v === 'string' && v === label) hits.push(row);
  });
  return hits;
}

/** Find the single row whose first cell equals `label`. Throws if not unique. */
function rowByLabel(ws: any, label: string): any {
  const hits = rowsByLabel(ws, label);
  if (hits.length !== 1) {
    throw new Error(`expected exactly one row labelled "${label}", found ${hits.length}`);
  }
  return hits[0];
}

const nums = (ws: any) =>
  cells(ws).flat().filter((v) => typeof v === 'number') as number[];

beforeAll(async () => {
  // B-034: the FROZEN fixture, never `output/`. Reading the untracked output
  // directory meant this suite graded whatever the last local build left on
  // disk — green over a ~24 % stale artifact during 36.D. Regenerate the
  // fixture deliberately with `npm run fixtures:regen`.
  inp = loadInputs({ outputDir: FIXTURE_DIR }) as Any;
  const built = await buildWorkbook(inp, { generatedAt: '2026-07-31' });
  // Serialise and re-parse: everything below reads the file, not the in-memory
  // object, so a value that fails to survive xlsx encoding fails the test.
  const dir = mkdtempSync(join(tmpdir(), 'kkme-xlsx-'));
  const path = join(dir, 'roundtrip.xlsx');
  await built.xlsx.writeFile(path);
  wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
}, 60_000);

describe('workbook structure', () => {
  it('has exactly the eight contracted tabs, in order', () => {
    expect(wb.worksheets.map((w: any) => w.name)).toEqual(TABS);
  });

  it('every tab carries content', () => {
    for (const name of TABS) {
      expect(wb.getWorksheet(name).rowCount, `${name} is empty`).toBeGreaterThan(5);
    }
  });
});

describe('Bridge Y1 — round-trip against the runner JSON', () => {
  // The tab carries two blocks. Block A is calendar-year based (each project's
  // contribution to the portfolio's first year) and MUST tie out. Block B is
  // each project's own first year, which falls in different calendar years and
  // deliberately does not sum. Conflating the two was a real defect caught here.
  const blockA = (label: string) => rowsByLabel(wb.getWorksheet('Bridge Y1'), label)[0];
  const blockB = (label: string) => rowsByLabel(wb.getWorksheet('Bridge Y1'), label)[1];

  it('block A carries each project\'s contribution to the portfolio\'s first calendar year', () => {
    const y1 = inp.portfolio.bridge_y1.cal_year;
    for (const [key, label] of inp.notes.bridge_lines) {
      const row = blockA(label);
      inp.portfolio.per_project.forEach((p: Any, i: number) => {
        const proj = inp.projects.find((x: Any) => x.config.project_id === p.project_id);
        const src = proj.bridge_20yr.find((b: Any) => b.cal_year === y1);
        expect(row.getCell(2 + i).value, `${label} · ${p.name}`).toBe(src ? src[key] : null);
      });
      expect(row.getCell(5).value, `${label} · portfolio`).toBe(inp.portfolio.bridge_y1[key]);
    }
  });

  it('block A ties out: the portfolio column is the exact sum of the project columns', () => {
    for (const [, label] of inp.notes.bridge_lines) {
      const row = blockA(label);
      const parts = [2, 3, 4].map((c) => (row.getCell(c).value as number) ?? 0);
      expect(Math.abs(parts.reduce((a, b) => a + b, 0) - (row.getCell(5).value as number)),
        `${label} does not tie out`).toBeLessThanOrEqual(2);
    }
  });

  it('block B carries each project\'s own Y1 and offers no total across it', () => {
    for (const [key, label] of inp.notes.bridge_lines) {
      const row = blockB(label);
      inp.portfolio.per_project.forEach((p: Any, i: number) => {
        expect(row.getCell(2 + i).value, `${label} · ${p.name}`).toBe(p.bridge_y1[key]);
      });
      // No summed column — the years differ, so a total would be meaningless.
      expect(row.getCell(5).value ?? null).toBeNull();
    }
    const codYears = new Set(inp.portfolio.per_project.map((p: Any) => p.bridge_y1.cal_year));
    expect(codYears.size, 'test premise: projects start in different years').toBeGreaterThan(1);
  });

  it('the €k/MW-yr column uses operational MW-years, not nameplate', () => {
    const mwYears = operationalMwYears(inp.portfolio) as number;
    // Y1 is staggered, so the honest denominator is strictly below nameplate.
    expect(mwYears).toBeLessThan(inp.portfolio.portfolio.mw);
    expect(blockA('Project EBITDA').getCell(6).value as number)
      .toBeCloseTo(inp.portfolio.bridge_y1.project_ebitda / mwYears / 1000, 6);
  });

  it('bridge arithmetic holds inside the sheet, not just in the source', () => {
    const v = (label: string, col: number) => (blockA(label).getCell(col).value as number) ?? 0;
    for (const col of [2, 3, 4, 5]) {
      expect(v('Net market revenue', col))
        .toBeCloseTo(v('Gross market revenues', col) - v('less: charging costs', col), 2);
      expect(v('Project EBITDA', col)).toBeCloseTo(
        v('Net market revenue', col) - v('less: optimiser fee', col) - v('less: grid charges', col)
        - v('less: market/exchange fees', col) - v('less: operating costs', col), 2);
      expect(v('Pre-financing cash flow', col)).toBeCloseTo(
        v('Project EBITDA', col) - v('less: maintenance CAPEX', col)
        - v('less: augmentation CAPEX', col) - v('less: replacement CAPEX', col), 2);
    }
  });

  it('states all ten contracted revenue lines and claims no FCR revenue', () => {
    const ws = wb.getWorksheet('Bridge Y1');
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    for (const [label] of inp.notes.revenue_lines.lines) expect(text).toContain(label);
    expect(text).toContain(inp.notes.revenue_lines.fcr_caveat);
    expect(text).toContain(inp.notes.revenue_lines.split_caveat);
  });
});

describe('20-yr CF — round-trip', () => {
  it('carries every calendar year in the portfolio span', () => {
    const ws = wb.getWorksheet('20-yr CF');
    const years = inp.portfolio.bridge_20yr.map((b: Any) => b.cal_year);
    const present = new Set(nums(ws));
    for (const y of years) expect(present.has(y), `year ${y} missing`).toBe(true);
  });

  it('portfolio pre-financing CF appears for every year, equal to the runner', () => {
    const ws = wb.getWorksheet('20-yr CF');
    // The last "Pre-financing cash flow" block is the consolidated one.
    const rows: any[] = [];
    ws.eachRow((row: any) => {
      if (row.getCell(1).value === 'Pre-financing cash flow') rows.push(row);
    });
    expect(rows).toHaveLength(inp.portfolio.per_project.length + 1);
    const portfolioRow = rows[rows.length - 1];
    inp.portfolio.bridge_20yr.forEach((b: Any, i: number) => {
      expect(portfolioRow.getCell(2 + i).value, `${b.cal_year}`).toBe(b.pre_financing_cf);
    });
  });

  it('NPV and MOIC match the runner for every project and the portfolio', () => {
    const ws = wb.getWorksheet('20-yr CF');
    const npvRow = rowByLabel(ws, inp.notes.npv_label);
    inp.portfolio.per_project.forEach((p: Any, i: number) => {
      expect(npvRow.getCell(2 + i).value).toBe(p.npv_pre_financing_pre_tax);
    });
    expect(npvRow.getCell(5).value).toBe(inp.portfolio.portfolio.npv_pre_financing_pre_tax);
    expect(rowByLabel(ws, 'MOIC (undiscounted)').getCell(5).value).toBe(inp.portfolio.portfolio.moic);
  });

  it('flags the augmentation and replacement events where the runner puts them', () => {
    const ws = wb.getWorksheet('20-yr CF');
    const augYears = inp.portfolio.bridge_20yr
      .filter((b: Any) => b.augmentation_capex > 0).map((b: Any) => b.cal_year);
    const replYears = inp.portfolio.bridge_20yr
      .filter((b: Any) => b.replacement_capex > 0).map((b: Any) => b.cal_year);
    expect(augYears.length).toBeGreaterThan(0);
    expect(replYears.length).toBeGreaterThan(0);
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain('augmentation CAPEX');
    expect(text).toContain('replacement CAPEX');
    expect(text).toContain(inp.notes.capex_note);
  });
});

describe('Assumptions', () => {
  it(`renders all ${'44'} register rows with their engine-derived values`, () => {
    const ws = wb.getWorksheet('Assumptions');
    const ids = new Map<string, any>();
    ws.eachRow((row: any) => {
      const id = row.getCell(1).value;
      if (typeof id === 'string' && inp.register.rows.some((r: Any) => r.id === id)) {
        ids.set(id, row);
      }
    });
    expect(ids.size).toBe(inp.register.rows.length);
    expect(ids.size).toBe(inp.notes.register_count);
    for (const r of inp.register.rows) {
      const row = ids.get(r.id)!;
      expect(row.getCell(3).value, r.id).toBe(r.label);
      expect(row.getCell(4).value, r.id).toBe(r.value);
      expect(row.getCell(6).value, r.id).toBe(r.source);
    }
  });

  it('leaves the override column unlocked and everything else locked', () => {
    const ws = wb.getWorksheet('Assumptions');
    expect(ws.sheetProtection?.sheet).toBe(true);
    const row = ws.getRow(
      (() => { let n = 0; ws.eachRow((r: any) => { if (r.getCell(1).value === inp.register.rows[0].id) n = r.number; }); return n; })()
    );
    expect(row.getCell(8).protection?.locked).toBe(false);
    expect(row.getCell(4).protection?.locked ?? true).not.toBe(false);
  });

  it('explains that overrides do not recompute inside Excel', () => {
    const ws = wb.getWorksheet('Assumptions');
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain(inp.notes.override_mechanism);
  });
});

describe('Scenarios — table and selector', () => {
  it('the headline table equals scenario-summary.json', () => {
    const ws = wb.getWorksheet('Scenarios');
    const sum = inp.scenarios.summary;
    // Each headline label appears twice — once in the source table, once as a
    // selector output row. The first occurrence is the table.
    const checks: [string, string][] = [
      ['Y1 gross market revenues', 'gross_y1'],
      ['Y1 project EBITDA', 'ebitda_y1'],
      ['Y1 pre-financing cash flow', 'prefin_cf_y1'],
      ['20-yr net market revenue', 'sum_20yr_net'],
      ['NPV @ 8%', 'npv'],
      ['MOIC', 'moic'],
    ];
    for (const [label, key] of checks) {
      const rows = rowsByLabel(ws, label);
      expect(rows.length, `${label} should appear in the table and the selector`).toBe(2);
      ['downside', 'central', 'upside'].forEach((s, i) => {
        expect(rows[0].getCell(2 + i).value, `${label} · ${s}`).toBe(sum.headlines[s][key]);
      });
    }
  });

  it('the six drivers equal the locked scenario drivers', () => {
    const ws = wb.getWorksheet('Scenarios');
    const sum = inp.scenarios.summary;
    const driverKeys = [
      ['Pipeline realisation rate (%)', 'fleet_realisation_pct'],
      ['DA spread growth (%/yr)', 'spread_growth_pct_yr'],
      ['Availability factor (%)', 'availability_pct'],
      ['Trading realisation (×)', 'trading_realisation'],
      ['Reserve capacity price delta (%)', 'cap_price_delta_pct'],
      ['Cannibalisation index floor (×)', 'cpi_floor'],
    ];
    for (const [label, key] of driverKeys) {
      const row = rowByLabel(ws, label);
      ['downside', 'central', 'upside'].forEach((s, i) => {
        expect(row.getCell(2 + i).value, `${label} · ${s}`).toBe(sum.drivers[s][key]);
      });
    }
  });

  it('the selector is a real dropdown over the three scenarios', () => {
    const ws = wb.getWorksheet('Scenarios');
    const row = rowByLabel(ws, 'Selected scenario →');
    const dv = row.getCell(2).dataValidation;
    expect(dv?.type).toBe('list');
    expect(dv?.formulae?.[0]).toBe('"Downside,Central,Upside"');
    expect(row.getCell(2).value).toBe('Central');
    expect(row.getCell(2).protection?.locked).toBe(false);
  });

  it('the selector output cells are INDEX/MATCH formulas pointing at the table', () => {
    const ws = wb.getWorksheet('Scenarios');
    const formulas: string[] = [];
    ws.eachRow((row: any) => {
      row.eachCell((c: any) => {
        if (c.value && typeof c.value === 'object' && 'formula' in c.value) {
          formulas.push((c.value as Any).formula);
        }
      });
    });
    expect(formulas).toHaveLength(6);
    for (const f of formulas) {
      expect(f).toMatch(/^INDEX\(\$B\$\d+:\$D\$\d+,MATCH\(\$B\$\d+,\$B\$\d+:\$D\$\d+,0\)\)$/);
    }
    // The MATCH range must be the header row of the headline block, so the
    // dropdown text actually resolves.
    const m = formulas[0].match(/MATCH\(\$B\$\d+,\$B\$(\d+):\$D\$\d+,0\)/)!;
    const headerRow = ws.getRow(Number(m[1]));
    expect([2, 3, 4].map((c) => headerRow.getCell(c).value))
      .toEqual(['Downside', 'Central', 'Upside']);
  });

  it('labels the selector as a chooser over pre-computed runs, not a live model', () => {
    const ws = wb.getWorksheet('Scenarios');
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain(inp.notes.scenario_selector_label);
    expect(text).toContain(inp.notes.upside_warn_note);
  });
});

describe('Sensitivity', () => {
  it('carries all eight drivers, sorted by absolute 20-year swing', () => {
    const ws = wb.getWorksheet('Sensitivity');
    const labels = inp.sensitivity.drivers.map((d: Any) => `${d.label} (${d.unit})`);
    const found: number[] = [];
    ws.eachRow((row: any) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string' && labels.includes(v)) found.push(row.number);
    });
    expect(found).toHaveLength(8);
    const swings = found.map((n) => ws.getRow(n).getCell(9).value as number);
    const sorted = [...swings].sort((a, b) => Math.abs(b) - Math.abs(a));
    expect(swings).toEqual(sorted);
  });

  it('every delta equals the runner value', () => {
    const ws = wb.getWorksheet('Sensitivity');
    for (const d of inp.sensitivity.drivers as Any[]) {
      const row = rowByLabel(ws, `${d.label} (${d.unit})`);
      expect(row.getCell(5).value, d.driver).toBe(d.delta_ebitda_down);
      expect(row.getCell(6).value, d.driver).toBe(d.delta_ebitda_up);
      expect(row.getCell(7).value, d.driver).toBe(d.delta_npv_down);
      expect(row.getCell(8).value, d.driver).toBe(d.delta_npv_up);
      expect(row.getCell(9).value, d.driver).toBe(d.swing_20yr);
    }
  });

  it('keeps the zero-impact drivers and their reasons rather than hiding them', () => {
    const ws = wb.getWorksheet('Sensitivity');
    const dead = (inp.sensitivity.drivers as Any[]).filter((d) => d.swing_20yr === 0);
    expect(dead.length).toBe(2);
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    for (const d of dead) {
      expect(rowByLabel(ws, `${d.label} (${d.unit})`).getCell(9).value).toBe(0);
      expect(text).toContain(d.zero_effect_reason);
    }
    expect(text).toContain(inp.notes.dead_drivers_note);
  });
});

describe('Reconciliation', () => {
  it('renders every internal and external check', () => {
    const ws = wb.getWorksheet('Reconciliation');
    const rec = inp.reconciliation;
    let pass = 0; let warn = 0; let fail = 0; let declared = 0;
    ws.eachRow((row: any) => {
      const s = row.getCell(7).value;
      if (s === 'PASS') pass += 1;
      if (s === 'WARN') warn += 1;
      if (s === 'FAIL') fail += 1;
      if (s === 'DECLARED') declared += 1;
    });
    // A breach declared in code with a stated reason renders as DECLARED, not
    // FAIL: the band is untouched and the miss is shown at full size, but the
    // client sees an explained finding rather than an unexplained failure.
    const withReason = rec.external.filter((c: Any) => c.expected_deviation);
    expect(declared).toBe(withReason.length);
    expect(pass).toBe(rec.summary.internal.pass + rec.summary.external.pass);
    expect(warn + declared).toBe(
      rec.summary.internal.warn + rec.summary.external.warn + rec.summary.external.fail);
    expect(fail).toBe(0);
    expect(pass + warn + fail + declared).toBe(rec.internal.length + rec.external.length);
  });

  it('carries the single WARN with its by-design explanation', () => {
    const ws = wb.getWorksheet('Reconciliation');
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    const warnRow = (inp.reconciliation.external as Any[]).find((r) => r.status === 'warn')!;
    expect(text).toContain(warnRow.severity_basis);
    expect(text).toContain(inp.notes.upside_warn_note);
  });
});

describe('Glossary and Cover', () => {
  it('defines every glossary term', () => {
    const ws = wb.getWorksheet('Glossary');
    const terms = new Set<string>();
    ws.eachRow((row: any) => {
      const t = row.getCell(1).value;
      if (typeof t === 'string') terms.add(t);
    });
    for (const [term] of inp.notes.glossary) expect(terms.has(term), term).toBe(true);
  });

  it('the cover states the engine version, scope lock and headline NPV', () => {
    const ws = wb.getWorksheet('Cover');
    const text = cells(ws).flat().filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain(inp.portfolio.engine_version);
    expect(text).toContain(inp.notes.scope_lock);
    expect(text).toContain(inp.notes.excluded_items);
    expect(rowByLabel(ws, inp.notes.npv_label).getCell(2).value)
      .toBe(inp.portfolio.portfolio.npv_pre_financing_pre_tax);
  });

  it('lists every tab in the file inventory', () => {
    const ws = wb.getWorksheet('Cover');
    const listed = new Set<string>();
    ws.eachRow((row: any) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string' && TABS.includes(v)) listed.add(v);
    });
    expect([...listed].sort()).toEqual([...TABS].sort());
  });
});

describe('number formats survive serialisation', () => {
  it('money cells carry a thousands format and MOIC carries decimals', () => {
    const bridge = wb.getWorksheet('Bridge Y1');
    const row = rowsByLabel(bridge, 'Project EBITDA')[0];
    for (const c of [2, 3, 4, 5]) expect(row.getCell(c).numFmt).toBe('#,##0');
    const cf = wb.getWorksheet('20-yr CF');
    expect(rowByLabel(cf, 'MOIC (undiscounted)').getCell(2).numFmt).toBe('#,##0.000');
    expect(rowByLabel(cf, inp.notes.npv_label).getCell(2).numFmt).toBe('"€"#,##0');
  });

  it('column widths are set (the sheet is readable without resizing)', () => {
    for (const name of TABS) {
      expect(wb.getWorksheet(name).getColumn(1).width, name).toBeGreaterThan(10);
    }
  });
});

describe('input gating', () => {
  it('refuses to build on missing runner outputs rather than emitting a partial workbook', () => {
    const empty = mkdtempSync(join(tmpdir(), 'kkme-xlsx-empty-'));
    expect(() => loadInputs({ outputDir: empty })).toThrow(/missing input/);
    expect(() => loadInputs({ outputDir: empty })).toThrow(/run the runners first/);
  });

  it('the register row count the notes promise is the count actually rendered', () => {
    expect(inp.register.rows.length).toBe(inp.notes.register_count);
  });

  it('the loaded inputs all come from one verified engine run', () => {
    const versions = new Set([
      inp.portfolio.engine_version,
      inp.sensitivity.engine_version,
      inp.reconciliation.engine_version,
      inp.scenarios.summary.engine_version,
      ...inp.projects.map((p: Any) => p.engine_version),
    ]);
    expect(versions.size).toBe(1);
    expect(inp.portfolio.kv_verified).toBe(true);
  });
});
