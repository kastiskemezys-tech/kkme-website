// Phase 34.7 — the branded deliverable and its consistency gate.
//
// The gate is the deliverable's integrity proof: the HTML, the Excel and the
// engine must be incapable of disagreeing. These tests check the gate itself
// works — that it passes on a good build AND that it actually fails when a
// number is tampered with. A gate that cannot fail proves nothing.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadInputs, buildWorkbook, resolveNotes } from '../generate-xlsx.mjs';
import {
  buildDeliverableHtml, verifyDeliverable, splitTemplate, TEMPLATE_PATH,
} from '../generate-deliverable.mjs';
import { brandRoot, buildAnnexHtml } from '../generate-pdf.mjs';

type Any = Record<string, any>;

let inp: Any;
let html: string;

beforeAll(async () => {
  inp = loadInputs() as Any;
  html = buildDeliverableHtml(inp, { generatedAt: '2026-07-31' }) as string;
}, 60_000);

describe('template anchoring', () => {
  it('both anchors occur exactly once, so the split cannot drop content', () => {
    const raw = readFileSync(TEMPLATE_PATH, 'utf8');
    const { head, tail } = splitTemplate(raw) as Any;
    expect(head).toContain('<style>');
    expect(head.endsWith('<body>')).toBe(true);
    expect(tail).toContain('EXTENDED SCOPE — NOT IN v0.5');
    expect(tail.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('throws rather than guessing when an anchor is missing', () => {
    expect(() => splitTemplate('<html><body>no scope divider</body></html>'))
      .toThrow(/scope divider.*occurs 0 times/);
    expect(() => splitTemplate('<body><body>'))
      .toThrow(/body.*occurs 2 times/);
  });

  it('keeps the template CSS and the extended-scope upsell verbatim', () => {
    const raw = readFileSync(TEMPLATE_PATH, 'utf8');
    const { head, tail } = splitTemplate(raw) as Any;
    expect(html.startsWith(head)).toBe(true);
    expect(html.endsWith(tail)).toBe(true);
  });
});

describe('consistency gate — passes on a good build', () => {
  it('reports no failures', () => {
    expect(verifyDeliverable(html, inp)).toEqual([]);
  });

  it('every headline figure appears in the rendered form the engine produced', () => {
    const p = inp.portfolio.portfolio;
    expect(html).toContain(`€${(p.npv_pre_financing_pre_tax / 1e6).toFixed(1)} M`);
    expect(html).toContain(`€${(inp.portfolio.bridge_totals.pre_financing_cf / 1e6).toFixed(1)} M`);
    expect(html).toContain(`${p.moic.toFixed(2)}×`);
    expect(html).toContain(`${p.mw} MW / ${p.mwh} MWh`);
  });

  it('carries every calendar year of the cash flow', () => {
    for (const b of inp.portfolio.bridge_20yr as Any[]) {
      expect(html, `year ${b.cal_year}`).toContain(`<th class="r">${b.cal_year}</th>`);
    }
  });

  it('says 44 rows, never the mockup\'s 39', () => {
    expect(html).toContain(`${inp.register.rows.length} rows`);
    expect(html).not.toContain('39 rows');
    expect(html).not.toContain('39 assumptions');
  });

  it('carries the four operator-decided model-risk notes verbatim', () => {
    for (const key of ['dead_drivers_note', 'upside_warn_note', 'partial_year_note', 'capex_note']) {
      expect(html, key).toContain(inp.notes[key]);
    }
  });

  it('discloses both zero-effect drivers with their reasons', () => {
    const dead = (inp.sensitivity.drivers as Any[]).filter((d) => d.zero_effect_reason);
    expect(dead).toHaveLength(2);
    for (const d of dead) expect(html, d.driver).toContain(d.zero_effect_reason);
  });

  it('claims no FCR revenue anywhere', () => {
    expect(html).toContain(inp.notes.revenue_lines.fcr_caveat);
    expect(html).toContain(inp.notes.revenue_lines.split_caveat);
  });

  it('keeps the mockup banner out and the delivery banner in', () => {
    expect(html).not.toContain('STRUCTURE MOCKUP');
    expect(html).not.toContain('Placeholder numbers scaled from');
    expect(html).toContain('v0.5 DELIVERABLE');
    expect(html).toContain('computed by KKME engine');
  });
});

describe('consistency gate — actually fails when it should', () => {
  // Replace EVERY occurrence: a wrong value comes from one data read rendered
  // in several places, so tampering one copy is not the failure being modelled.
  const tamper = (from: string, to: string) => {
    expect(html.includes(from), `test premise: "${from}" is in the document`).toBe(true);
    return html.split(from).join(to);
  };

  it('catches a changed portfolio NPV', () => {
    const npv = `€${(inp.portfolio.portfolio.npv_pre_financing_pre_tax / 1e6).toFixed(1)} M`;
    const failures = verifyDeliverable(tamper(npv, '€99.9 M'), inp) as string[];
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join('\n')).toContain('portfolio NPV');
  });

  it('catches a changed bridge line', () => {
    const gross = Math.round(inp.portfolio.bridge_y1.gross_market_revenues / 1000)
      .toLocaleString('en-GB').replace(/,/g, ' ');
    const failures = verifyDeliverable(tamper(`>${gross}<`, '>1 234<'), inp) as string[];
    expect(failures.join('\n')).toMatch(/bridge line|gross/);
  });

  it('catches a dropped reconciliation count', () => {
    const s = inp.reconciliation.summary;
    const failures = verifyDeliverable(
      tamper(`${s.internal.pass} of ${s.internal.total}`, '7 of 7'), inp) as string[];
    expect(failures.join('\n')).toContain('internal check count');
  });

  it('catches a dropped model-risk note', () => {
    const failures = verifyDeliverable(
      tamper(inp.notes.dead_drivers_note, 'nothing to see here'), inp) as string[];
    expect(failures.join('\n')).toContain('dead_drivers_note');
  });

  it('catches the extended-scope upsell being lost', () => {
    const failures = verifyDeliverable(
      tamper('EXTENDED SCOPE — NOT IN v0.5', 'gone'), inp) as string[];
    expect(failures.join('\n')).toContain('extended-scope stamp');
  });

  it('catches a surviving mockup placeholder', () => {
    const failures = verifyDeliverable(`${html}\n<p>STRUCTURE MOCKUP</p>`, inp) as string[];
    expect(failures.join('\n')).toContain('STRUCTURE MOCKUP');
  });

  it('does NOT flag a placeholder that equals a genuinely computed value', () => {
    // The mockup's gross Y1 was €12.9 M; on some market states the engine
    // computes the same figure. The gate must not read that as staleness.
    const gross = `€${(inp.portfolio.bridge_y1.gross_market_revenues / 1e6).toFixed(1)} M`;
    if (gross === '€12.9 M') {
      expect(verifyDeliverable(html, inp)).toEqual([]);
    }
    // Either way, every asserted value is exempt from the blocklist by construction.
    expect(verifyDeliverable(html, inp)).toEqual([]);
  });
});

describe('HTML and Excel agree — neither can drift from the engine', () => {
  let wb: any;
  beforeAll(async () => {
    const built = await buildWorkbook(inp, { generatedAt: '2026-07-31' });
    const path = join(mkdtempSync(join(tmpdir(), 'kkme-x-')), 'x.xlsx');
    await built.xlsx.writeFile(path);
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
  }, 60_000);

  const cellValue = (sheet: string, label: string, col: number) => {
    let v: any = null;
    wb.getWorksheet(sheet).eachRow((row: any) => {
      if (row.getCell(1).value === label && v === null) v = row.getCell(col).value;
    });
    return v;
  };

  it('the workbook NPV and the document NPV are the same engine number', () => {
    const fromXlsx = cellValue('20-yr CF', inp.notes.npv_label, 5) as number;
    expect(fromXlsx).toBe(inp.portfolio.portfolio.npv_pre_financing_pre_tax);
    expect(html).toContain(`€${(fromXlsx / 1e6).toFixed(1)} M`);
  });

  it('the workbook Y1 bridge and the document Y1 bridge are the same lines', () => {
    for (const [key, label] of inp.notes.bridge_lines as [string, string][]) {
      const fromXlsx = cellValue('Bridge Y1', label, 5) as number;
      expect(fromXlsx, label).toBe(inp.portfolio.bridge_y1[key]);
      const asK = Math.round(fromXlsx / 1000).toLocaleString('en-GB').replace(/,/g, ' ');
      expect(html, `${label} in HTML`).toContain(asK);
    }
  });

  it('both state the same register row count and the same reconciliation result', () => {
    const s = inp.reconciliation.summary;
    expect(html).toContain(`${inp.register.rows.length} rows`);
    let seen = 0;
    wb.getWorksheet('Assumptions').eachRow((row: any) => {
      if (typeof row.getCell(1).value === 'string'
        && inp.register.rows.some((r: Any) => r.id === row.getCell(1).value)) seen += 1;
    });
    expect(seen).toBe(inp.register.rows.length);
    expect(html).toContain(`${s.internal.pass} of ${s.internal.total}`);
    expect(html).toContain(`${s.external.pass} of ${s.external.total}`);
  });

  it('both use the same wording for the shared client-facing notes', () => {
    const xlsxText: string[] = [];
    for (const name of ['Bridge Y1', 'Sensitivity', '20-yr CF', 'Scenarios']) {
      wb.getWorksheet(name).eachRow((row: any) => {
        row.eachCell((c: any) => { if (typeof c.value === 'string') xlsxText.push(c.value); });
      });
    }
    const joined = xlsxText.join('\n');
    for (const key of ['dead_drivers_note', 'upside_warn_note', 'partial_year_note', 'capex_note']) {
      expect(joined, `${key} in xlsx`).toContain(inp.notes[key]);
      expect(html, `${key} in html`).toContain(inp.notes[key]);
    }
  });
});

describe('operator notes carry derived figures, not literals', () => {
  it('no note reaches a deliverable with an unresolved token', () => {
    for (const key of ['dead_drivers_note', 'upside_warn_note', 'partial_year_note', 'capex_note']) {
      expect(inp.notes[key], key).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('the upside-WARN note states the IRR the harness actually flagged', () => {
    const warn = (inp.reconciliation.external as Any[]).find((c) => c.status === 'warn')!;
    expect(inp.notes.upside_warn_note).toContain(`${(warn.actual * 100).toFixed(1)}%`);
    expect(inp.notes.upside_warn_note)
      .toContain(`${(warn.band[0] * 100).toFixed(0)}–${(warn.band[1] * 100).toFixed(0)}%`);
    const name = inp.projects.find((p: Any) => p.config.project_id === warn.subject.split('/')[0])
      .config.name;
    expect(inp.notes.upside_warn_note).toContain(name);
  });

  it('the partial-year note states the measured spread and names the part-year projects', () => {
    const partial = (inp.projects as Any[])
      .filter((p) => (p.config.operational_months_y1 ?? 12) < 12);
    expect(partial.length).toBeGreaterThan(0);
    for (const p of partial) expect(inp.notes.partial_year_note).toContain(p.config.name);
    const deltas = partial.map((p) => p.bridge_y1.project_ebitda / p.engine.years[0].ebitda - 1);
    expect(inp.notes.partial_year_note)
      .toContain(`${(Math.min(...deltas) * 100).toFixed(1)}–${(Math.max(...deltas) * 100).toFixed(1)}%`);
  });

  it('the dead-drivers note names exactly the drivers that moved nothing', () => {
    const dead = (inp.sensitivity.drivers as Any[]).filter((d) => d.swing_20yr === 0);
    for (const d of dead) expect(inp.notes.dead_drivers_note).toContain(d.label);
    const top = [...(inp.sensitivity.drivers as Any[])]
      .sort((a, b) => Math.abs(b.swing_20yr) - Math.abs(a.swing_20yr))[0];
    expect(inp.notes.dead_drivers_note).toContain(top.label);
    expect(inp.notes.dead_drivers_note)
      .toContain(`€${(Math.abs(top.swing_20yr) / 1e6).toFixed(1)}M`);
  });

  it('throws rather than shipping a token it cannot compute', () => {
    expect(() => resolveNotes(
      { ...inp.notes, upside_warn_note: 'IRR {{NOT_A_REAL_TOKEN}} here' },
      inp as { reconciliation: any; sensitivity: any; projects: any },
    )).toThrow(/unresolved token/);
  });
});

describe('methodology annex', () => {
  it('derives its palette from the template, not a hand-copied lookalike', () => {
    const root = brandRoot() as string;
    expect(root).toContain('--birch');
    expect(root).toContain('--tobacco');
    expect(root).toContain('--amber');
    const annex = buildAnnexHtml({ generatedAt: '2026-07-31', engineVersion: 'v7.3' }) as string;
    expect(annex).toContain(root);
  });

  it('reproduces docs/methodology.md rather than an edited extract', () => {
    const annex = buildAnnexHtml({ generatedAt: '2026-07-31', engineVersion: 'v7.3' }) as string;
    expect(annex).toContain('reproduced in full and unedited');
    // Spot-check that real methodology content made it through the renderer.
    expect(annex).toContain('<h1');
    expect(annex).toContain('<table>');
    expect(annex.length).toBeGreaterThan(20_000);
  });
});
