// Phase 34.5 — assumptions register + reconciliation harness.
//
// Two things are being held here.
//
// The BINDING TESTS are what make the register worth having: every row that
// corresponds to a live constant is asserted equal to the value the code
// actually holds, so the register documents the engine and can never quietly
// contradict it. This extends the rteMirror pattern from one constant to the
// whole assumption surface.
//
// The RECONCILIATION SUITE is the credibility spine of the engagement, and it
// stays as a permanent gate: every future engine change has to prove the model
// still ties out, on all three projects and all three scenarios.
//
// Everything runs against the frozen KV fixture, so these measure code rather
// than overnight market movement.

import { describe, it, expect } from 'vitest';
import { loadFixtureKV } from '../regression-reference.mjs';
import {
  loadRegister, validateRegister, checkBindings, bindingContext, syncRegister,
  resolveBinding, readWorkerConstant, effectiveValue, effectiveRegister,
  categoryCounts, CATEGORIES, RegisterBindingError, roundTo,
  isSuperseded, liveRows, supersededRows,
} from '../register.mjs';
import {
  reconcile, internalChecks, portfolioChecks, externalChecks, EXTERNAL_BANDS,
} from '../reconcile.mjs';

type Any = Record<string, any>;

const kv = loadFixtureKV();
const register = loadRegister() as Any;
const ctxPromise = bindingContext({ kv });
const reportPromise = reconcile(kv) as Promise<Any>;

describe('assumptions register — schema', () => {
  it('validates: no missing keys, no duplicate ids, every row sourced', () => {
    expect(validateRegister(register)).toEqual([]);
  });

  it('covers every category the deliverable contract names', () => {
    const counts = categoryCounts(register) as Any;
    expect(counts).toEqual({
      technical: 7, market: 11, saturation: 4, cost: 7, capex: 8, project: 3, 'scenario-driver': 7,
    });
    expect(register.rows).toHaveLength(47);
    for (const row of register.rows) expect(CATEGORIES).toContain(row.category);
  });

  it('every row carries a sensitivity range or an explicit null', () => {
    for (const row of register.rows) {
      expect(row, row.id).toHaveProperty('sensitivity_range');
      if (row.sensitivity_range !== null) {
        expect(Array.isArray(row.sensitivity_range), row.id).toBe(true);
        expect(row.value, row.id).toBeGreaterThanOrEqual(row.sensitivity_range[0]);
        expect(row.value, row.id).toBeLessThanOrEqual(row.sensitivity_range[1]);
      }
    }
  });

  it('rejects a duplicate id, an unsourced row and an out-of-range value', () => {
    const bad = {
      rows: [
        { ...register.rows[0] },
        { ...register.rows[0] },                                   // duplicate id
        { ...register.rows[1], id: 'x1', source: 'n/a' },          // too short to be a source
        { ...register.rows[2], id: 'x2', value: 999, sensitivity_range: [0, 1] },
      ],
    };
    const problems = validateRegister(bad as Any).join('\n');
    expect(problems).toMatch(/duplicate id/);
    expect(problems).toMatch(/must carry a source/);
    expect(problems).toMatch(/outside its range/);
  });
});

// The one legitimate reason a row may carry no binding, and the fence around it.
// A superseded row records what the model USED to hold; it is not an input, so
// it has nothing to bind to. That is the ONLY exemption, and it costs the row a
// pointer to its replacement and the date it was replaced.
describe('assumptions register — the bound-or-superseded dichotomy', () => {
  const live = { ...register.rows[0], id: 'y_live' };
  const dead = {
    ...register.rows[0], id: 'y_dead', basis: 'superseded', engine_binding: null,
    superseded_by: 'y_live', superseded_on: '2026-07-28', override: null,
  };

  it('accepts a well-formed superseded row', () => {
    expect(validateRegister({ rows: [live, dead] } as Any)).toEqual([]);
    expect(isSuperseded(dead)).toBe(true);
    expect(isSuperseded(live)).toBe(false);
  });

  it('rejects an unbound row that has not declared itself superseded', () => {
    const problems = validateRegister({ rows: [{ ...live, engine_binding: null }] } as Any).join('\n');
    expect(problems).toMatch(/unbound and not declared superseded/);
  });

  it('rejects a superseded row that points nowhere, at itself, or carries a binding', () => {
    const p = (row: Any) => validateRegister({ rows: [live, row] } as Any).join('\n');
    expect(p({ ...dead, superseded_by: undefined })).toMatch(/must name the row that replaced it/);
    expect(p({ ...dead, superseded_by: 'y_dead' })).toMatch(/points at itself/);
    expect(p({ ...dead, superseded_by: 'y_nothing' })).toMatch(/is not a row in this register/);
    expect(p({ ...dead, engine_binding: 'driver:trading_realisation' }))
      .toMatch(/must not carry an engine_binding/);
    expect(p({ ...dead, superseded_on: 'last summer' })).toMatch(/superseded_on as YYYY-MM-DD/);
    expect(p({ ...dead, override: 0.9 })).toMatch(/cannot carry an override/);
  });

  it('rejects supersession metadata on a live row', () => {
    expect(validateRegister({ rows: [{ ...live, superseded_by: 'x' }] } as Any).join('\n'))
      .toMatch(/must not carry supersession metadata/);
  });

  it('keeps superseded rows out of the effective inputs — they are provenance', () => {
    const eff = effectiveRegister({ rows: [live, dead] } as Any) as Any;
    expect(Object.keys(eff)).toEqual(['y_live']);
    expect(liveRows({ rows: [live, dead] } as Any)).toHaveLength(1);
    expect(supersededRows({ rows: [live, dead] } as Any)).toHaveLength(1);
  });

  it('leaves superseded rows untouched when syncing from the code', async () => {
    const ctx = await ctxPromise;
    const synced = syncRegister({ rows: [dead] } as Any, ctx) as Any;
    expect(synced.rows[0]).toEqual(dead);
  });
});

describe('assumptions register — bindings to live code', () => {
  it('every live row is bound — nothing floats free of the model', async () => {
    const bound = register.rows.filter((r: Any) => r.engine_binding);
    expect(bound).toHaveLength(liveRows(register).length);
    // And the only rows without one have said, in the file, why.
    for (const r of supersededRows(register) as Any[]) {
      expect(r.superseded_by, r.id).toBeTruthy();
      expect(r.superseded_on, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every bound value equals the value the code currently holds', async () => {
    const ctx = await ctxPromise;
    const { checked, drift } = checkBindings(register, ctx) as Any;
    expect(checked).toBe(liveRows(register).length);
    expect(drift, JSON.stringify(drift, null, 2)).toEqual([]);
  });

  // One named test per row, so a drifted binding names itself in the failure.
  for (const row of liveRows(register) as Any[]) {
    it(`${row.id} ties to ${row.engine_binding}`, async () => {
      const ctx = await ctxPromise;
      expect(roundTo(resolveBinding(row.engine_binding, ctx))).toBe(roundTo(row.value));
    });
  }

  // And one per superseded row, so provenance cannot rot either: the pointer
  // must resolve to a LIVE row, and the value must actually have moved.
  for (const row of supersededRows(register) as Any[]) {
    it(`${row.id} points at a live row it no longer equals`, () => {
      const target = register.rows.find((r: Any) => r.id === row.superseded_by);
      expect(target, row.superseded_by).toBeTruthy();
      expect(isSuperseded(target)).toBe(false);
      expect(roundTo(target.value)).not.toBe(roundTo(row.value));
    });
  }

  it('syncing is a no-op when the register is already in step', async () => {
    const ctx = await ctxPromise;
    const synced = syncRegister(register, ctx) as Any;
    expect(synced.rows.map((r: Any) => r.value)).toEqual(register.rows.map((r: Any) => r.value));
  });

  it('detects drift rather than silently syncing it away', async () => {
    const ctx = await ctxPromise;
    const tampered = {
      ...register,
      rows: register.rows.map((r: Any) =>
        r.id === 'rte_bol_2h' ? { ...r, value: 79 } : r),
    };
    const { drift } = checkBindings(tampered as Any, ctx) as Any;
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ id: 'rte_bol_2h', register: 79, live: 82 });
  });

  it('a worker constant that has moved fails loudly, not silently', () => {
    expect(() => readWorkerConstant('RTE_BOL.h2', '// the constant is gone\n'))
      .toThrow(RegisterBindingError);
    expect(() => resolveBinding('nosuchns:whatever', {} as Any)).toThrow(RegisterBindingError);
    expect(() => resolveBinding('driver:not_a_driver', {} as Any)).toThrow(RegisterBindingError);
  });

  it('binds RTE to the constant, not to the display literal that would not move', () => {
    // assumptions_panel.rte.decay_pp_per_yr is hardcoded 0.20 in the worker and
    // would report 0.20 whatever RTE_DECAY_PP_PER_YEAR became (DECISIONS 34.4-G).
    const row = register.rows.find((r: Any) => r.id === 'rte_decay_pp_yr');
    expect(row.engine_binding).toBe('worker:RTE_DECAY_PP_PER_YEAR');
  });
});

describe('assumptions register — override mechanism', () => {
  it('an override takes precedence and never overwrites the derived value', () => {
    const row = { ...register.rows[0], value: 82, override: 80 };
    expect(effectiveValue(row)).toBe(80);
    expect(row.value).toBe(82);
    expect(effectiveValue({ ...row, override: null })).toBe(82);
  });

  it('ships with every override null — the register is the engine until edited', () => {
    for (const row of register.rows) expect(row.override, row.id).toBeNull();
    const eff = effectiveRegister(register) as Any;
    expect(eff.rte_bol_2h).toBe(82);
    expect(Object.keys(eff)).toHaveLength(liveRows(register).length);
  });

  it('an override of zero is honoured, not treated as absent', () => {
    expect(effectiveValue({ value: 12, override: 0 } as Any)).toBe(0);
  });
});

describe('reconciliation — internal bank', () => {
  it('every internal identity holds on every project and every scenario', async () => {
    const report = await reportPromise;
    const failures = report.internal.filter((c: Any) => c.status !== 'pass');
    expect(failures, JSON.stringify(failures.slice(0, 5), null, 2)).toEqual([]);
  });

  it('runs the seven contracted checks, plus the all-years extension', async () => {
    const report = await reportPromise;
    const ids = [...new Set(report.internal.map((c: Any) => c.id))] as string[];
    expect(ids).toHaveLength(8);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(ids.some((id) => id.startsWith(`internal_${n}_`)), `internal_${n}`).toBe(true);
    }
  });

  it('covers the reference asset, all three projects and all three scenarios', async () => {
    const report = await reportPromise;
    const subjects = [...new Set(report.internal.map((c: Any) => c.subject))] as string[];
    expect(subjects).toContain('reference/central');
    for (const p of ['bitenai', 'stoniskiai', 'eigirdziai']) {
      for (const s of ['downside', 'central', 'upside']) {
        expect(subjects, `${p}/${s}`).toContain(`${p}/${s}`);
      }
    }
    for (const s of ['downside', 'central', 'upside']) expect(subjects).toContain(`portfolio/${s}`);
  });

  it('catches a broken bridge rather than passing it', async () => {
    const report = await reportPromise;
    // Take a real subject and corrupt one line; the identity must break.
    const entry = {
      subject: 'tampered',
      config: { mw: 50, mwh: 100, operational_months_y1: 12, capex_eur_kwh: 164 },
      engine: { years: [{ rev_bal: 1, rev_trd: 1, rev_cap: 1, rev_act: 0, cfads: 0 }], monthly_y1: [], project: { arb_energy_20yr: [] } },
      bridge: {
        bridge_y1: {
          gross_market_revenues: 1000, charging_costs: 100, net_market_revenue: 900,
          optimiser: 0, grid: 0, market: 0, operating: 0, project_ebitda: 123,
          maintenance_capex: 0, augmentation_capex: 0, replacement_capex: 0, pre_financing_cf: 123,
        },
        bridge_20yr: [],
      },
    };
    const checks = internalChecks(entry as Any) as Any[];
    const ebitda = checks.find((c) => c.id.startsWith('internal_3_'));
    expect(ebitda?.status).toBe('fail');
    expect(report.internal.every((c: Any) => c.status === 'pass')).toBe(true);
  });

  it('portfolio = Σ projects is asserted on every line in every year', async () => {
    const report = await reportPromise;
    const rows = report.internal.filter((c: Any) => c.id === 'internal_7_portfolio_is_sum_of_projects');
    expect(rows).toHaveLength(3); // one per scenario
    for (const row of rows) expect(row.status).toBe('pass');
  });
});

describe('reconciliation — external bank', () => {
  it('runs six benchmark checks, each with its source pinned', async () => {
    const report = await reportPromise;
    const ids = [...new Set(report.external.map((c: Any) => c.id))];
    expect(ids).toHaveLength(6);
    for (const row of report.external) {
      expect(row.source, row.id).toBeTruthy();
      expect(row.band, row.id).toHaveLength(2);
    }
    expect(Object.keys(EXTERNAL_BANDS)).toHaveLength(6);
  });

  it('Central and the reference asset are FAIL-level and currently clean', async () => {
    const report = await reportPromise;
    const strict = report.external.filter(
      (c: Any) => c.subject.endsWith('/central') || c.subject.startsWith('reference/'));
    expect(strict.length).toBeGreaterThan(0);
    for (const c of strict) expect(c.status, `${c.subject} ${c.id}`).not.toBe('warn');
    expect(strict.filter((c: Any) => c.status === 'fail')).toEqual([]);
  });

  it('Downside and Upside are WARN-level — a breach there is information, not error', async () => {
    const report = await reportPromise;
    const loose = report.external.filter(
      (c: Any) => c.subject.endsWith('/downside') || c.subject.endsWith('/upside'));
    expect(loose.filter((c: Any) => c.status === 'fail')).toEqual([]);
    for (const c of loose) {
      expect(['pass', 'warn'], `${c.subject} ${c.id}`).toContain(c.status);
    }
  });

  it('the WARN split is real — an extreme case does leave a central-calibrated band', async () => {
    const report = await reportPromise;
    // Bitenai Upside clears the Clean Horizon IRR ceiling. If this ever stops
    // being true the split is untested, so it is pinned rather than assumed.
    const warns = report.external.filter((c: Any) => c.status === 'warn');
    expect(warns.length).toBeGreaterThan(0);
    for (const w of warns) expect(w.subject).toMatch(/\/(downside|upside)$/);
  });

  it('scores a band breach at the declared severity, not the status quo', () => {
    const entry = {
      subject: 'synthetic/upside',
      config: { mw: 50, capex_eur_kwh: 999, operational_months_y1: 12 },
      engine: {
        project_irr: 0.9, base_year: { annual_totals: { balancing: 100000 } },
        years: [{ rev_bal: 100000 * 50 }], assumptions_panel: { cycles_breakdown: { total_efcs_yr: 5000 } },
      },
      bridge: { bridge_y1: { gross_market_revenues: 100, project_ebitda: 99, net_market_revenue: 100 } },
    };
    const asWarn = externalChecks(entry as Any, 'warn') as Any[];
    const asFail = externalChecks(entry as Any, 'fail') as Any[];
    expect(asWarn.filter((c) => c.status === 'warn').length).toBeGreaterThan(0);
    expect(asWarn.filter((c) => c.status === 'fail')).toEqual([]);
    expect(asFail.filter((c) => c.status === 'fail').length).toBeGreaterThan(0);
  });
});

describe('reconciliation — report shape', () => {
  it('tallies both banks and records the severity split', async () => {
    const report = await reportPromise;
    expect(report.summary.internal.total).toBe(report.internal.length);
    expect(report.summary.external.total).toBe(report.external.length);
    expect(report.summary.internal.fail).toBe(0);
    expect(report.summary.external.fail).toBe(0);
    expect(report.summary.severity_split).toMatch(/warn/i);
  });

  it('every row names its subject, so no number is a bare total', async () => {
    const report = await reportPromise;
    for (const c of [...report.internal, ...report.external]) {
      expect(c.subject, c.id).toBeTruthy();
      expect(['pass', 'warn', 'fail']).toContain(c.status);
    }
  });
});
