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
  bumpVersion, computeVersion, versionMatchesContent, registerContentHash,
  validateChangelog, valueDiff, DECIDED_BY,
} from '../register.mjs';
import {
  reconcile, internalChecks, portfolioChecks, externalChecks, EXTERNAL_BANDS,
} from '../reconcile.mjs';

type Any = Record<string, any>;

const kv = loadFixtureKV();
const register = loadRegister() as Any;

/**
 * A synthetic register carrying a version block that describes its own content.
 * Every register must be versioned (36.B6), so a bare row-set is not a valid
 * register and the schema tests must build a real one rather than exempting
 * themselves from the invariant they are meant to be checking.
 */
const versioned = (rows: Any[], changelog: Any[] = []) =>
  bumpVersion({ rows, changelog } as Any, { date: '2026-07-29' }) as Any;
const ctxPromise = bindingContext({ kv });
const reportPromise = reconcile(kv) as Promise<Any>;

describe('assumptions register — schema', () => {
  it('validates: no missing keys, no duplicate ids, every row sourced', () => {
    expect(validateRegister(register)).toEqual([]);
  });

  it('covers every category the deliverable contract names', () => {
    const counts = categoryCounts(register) as Any;
    // A CONTENT PIN, updated deliberately in 36.E1 (+18 `price-formation` rows) and again in
    // 38.8 (+4 `cost`, +1 `technical` for the route-to-market and BRP cost stack). Nothing
    // existing moved either time, which is what makes both additions rather than rewrites. The
    // pin exists so rows cannot appear without a reviewer seeing them, so updating it is the
    // point of the pin, not a way round it.
    //
    // 38.8's five: service_fee_pct, power_market_charge_eur_mwh,
    // balancing_capacity_fee_eur_mwh, integration_fee_eur (cost);
    // standby_load_pct_of_nameplate_mw (technical).
    expect(counts).toEqual({
      technical: 8, market: 11, saturation: 4, cost: 11, capex: 8, project: 3, 'scenario-driver': 7,
      'price-formation': 18,
    });
    expect(register.rows).toHaveLength(70);
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
    const problems = validateRegister(versioned(bad.rows)).join('\n');
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
    expect(validateRegister(versioned([live, dead]))).toEqual([]);
    expect(isSuperseded(dead)).toBe(true);
    expect(isSuperseded(live)).toBe(false);
  });

  it('rejects an unbound row that has not declared itself superseded', () => {
    const problems = validateRegister(versioned([{ ...live, engine_binding: null }])).join('\n');
    expect(problems).toMatch(/unbound and not declared superseded/);
  });

  it('rejects a superseded row that points nowhere, at itself, or carries a binding', () => {
    const p = (row: Any) => validateRegister(versioned([live, row])).join('\n');
    expect(p({ ...dead, superseded_by: undefined })).toMatch(/must name the row that replaced it/);
    expect(p({ ...dead, superseded_by: 'y_dead' })).toMatch(/points at itself/);
    expect(p({ ...dead, superseded_by: 'y_nothing' })).toMatch(/is not a row in this register/);
    expect(p({ ...dead, engine_binding: 'driver:trading_realisation' }))
      .toMatch(/must not carry an engine_binding/);
    expect(p({ ...dead, superseded_on: 'last summer' })).toMatch(/superseded_on as YYYY-MM-DD/);
    expect(p({ ...dead, override: 0.9 })).toMatch(/cannot carry an override/);
  });

  it('rejects supersession metadata on a live row', () => {
    expect(validateRegister(versioned([{ ...live, superseded_by: 'x' }])).join('\n'))
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

  it('runs the seven contracted checks, the all-years extension, and the demand-side four', async () => {
    // 1-7 are the contracted bank; 8 extends the bridge identities across all
    // twenty years; 9-12 are Phase 36.D. The bridge checks prove the deliverable
    // is internally consistent — which a deliverable built on a wrong
    // denominator would also be. 9-12 tie the denominator to the TSOs' own
    // published tables, which is the part a reader can actually go and check.
    const report = await reportPromise;
    const ids = [...new Set(report.internal.map((c: Any) => c.id))] as string[];
    expect(ids).toHaveLength(12);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(ids.some((id) => id.startsWith(`internal_${n}_`)), `internal_${n}`).toBe(true);
    }
  });

  it('the demand-side checks are live, not vacuous', async () => {
    // internal_9 walks engine.years[].demand_mw. If the engine ever stops
    // publishing that field the loop would find nothing to compare and the
    // check would pass by having asserted nothing — the failure mode that makes
    // a green harness worse than no harness.
    const report = await reportPromise;
    const nine = report.internal.filter((c: Any) => c.id === 'internal_9_demand_ties_to_module');
    expect(nine.length).toBeGreaterThan(0);
    for (const c of nine) expect(c.status).toBe('pass');
    const ten = report.internal.find((c: Any) => c.id === 'internal_10_demand_base_year_ties_to_752');
    expect(ten.actual).toBe(752);
    const twelve = report.internal.find((c: Any) => c.id === 'internal_12_absorption_applied');
    expect(twelve.actual).toBeGreaterThan(0);
    expect(twelve.actual).toBe(twelve.expected);
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

  it('Central and the reference asset are FAIL-level, with every breach declared', async () => {
    const report = await reportPromise;
    const strict = report.external.filter(
      (c: Any) => c.subject.endsWith('/central') || c.subject.startsWith('reference/'));
    expect(strict.length).toBeGreaterThan(0);
    for (const c of strict) expect(c.status, `${c.subject} ${c.id}`).not.toBe('warn');
    // No UNDECLARED breach. A breach may survive only by carrying an
    // `expected_deviation` reason in code, with its band untouched — the 36.B1-N
    // rule. Silence is still a failure.
    const undeclared = strict.filter(
      (c: Any) => c.status === 'fail' && !c.expected_deviation);
    expect(undeclared, JSON.stringify(undeclared.slice(0, 3), null, 2)).toEqual([]);
  });

  it('the one declared deviation is the 36.B5 cycling metric, and its band was not moved', async () => {
    const report = await reportPromise;
    const declared = report.external.filter((c: Any) => c.expected_deviation);
    expect(declared.length).toBeGreaterThan(0);
    for (const c of declared) {
      expect(c.id).toBe('external_3_cycles_yr');
      // The band is the sourced one, unchanged. Re-fitting it to pass would be
      // the failure this whole mechanism exists to make impossible.
      expect(c.band).toEqual([EXTERNAL_BANDS.cycles_yr.lo, EXTERNAL_BANDS.cycles_yr.hi]);
      expect(c.actual).toBeLessThan(EXTERNAL_BANDS.cycles_yr.lo);
      expect(c.expected_deviation).toMatch(/36\.B5/);
    }
    expect(report.summary.expected_deviations).toHaveLength(declared.length);
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
    // External fails are permitted ONLY where declared; the count is asserted
    // equal to the number of declared deviations, so an undeclared one shows up
    // here as well as in the check above.
    expect(report.summary.external.fail).toBe(report.external.filter(
      (c: Any) => c.expected_deviation && c.status === 'fail').length);
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

// ── Phase 36.B6 — versioning + changelog governance ────────────────────────
//
// The claim being enforced: no register value can move without a dated, sourced,
// attributed changelog entry, and the version a delivered report quotes is the
// content that report ran on. Both halves are tested in both directions — a
// governance check that cannot fail governs nothing.

describe('register versioning', () => {
  it('the shipped register carries a version that describes its own content', () => {
    expect(register.version.id).toMatch(/^r\d+\.[0-9a-f]{8}$/);
    expect(versionMatchesContent(register)).toBe(true);
    expect(computeVersion(register).id).toBe(register.version.id);
    expect(register.version.changelog_entries).toBe(register.changelog.length);
  });

  it('hashes the model inputs — value and override — and nothing else', () => {
    const move = (patch: Any) => registerContentHash({
      ...register, rows: register.rows.map((r: Any) => (r.id === register.rows[0].id ? { ...r, ...patch } : r)),
    } as Any);
    const base = registerContentHash(register);
    expect(move({ value: register.rows[0].value + 1 })).not.toBe(base);
    expect(move({ override: 0.5 })).not.toBe(base);
    // Prose is not an input: editing a label or a note must not present itself
    // as the model having changed.
    expect(move({ label: 'renamed', note: 'reworded', source: `${register.rows[0].source} (expanded)` })).toBe(base);
  });

  it('excludes superseded rows, because provenance is not an input', () => {
    const live = { ...register.rows[0], id: 'z_live' };
    const dead = {
      ...register.rows[0], id: 'z_dead', basis: 'superseded', engine_binding: null,
      superseded_by: 'z_live', superseded_on: '2026-07-28', override: null,
    };
    expect(registerContentHash({ rows: [live, dead] } as Any))
      .toBe(registerContentHash({ rows: [live] } as Any));
  });

  it('is stable under row REORDERING but not under a value change', () => {
    const reversed = { ...register, rows: [...register.rows].reverse() };
    expect(registerContentHash(reversed as Any)).toBe(registerContentHash(register));
  });

  it('fails validation when a value moves without a bump — the central gate', () => {
    const tampered = {
      ...register,
      rows: register.rows.map((r: Any) => (r.id === 'wacc' ? { ...r, value: r.value + 1 } : r)),
    };
    const problems = validateRegister(tampered as Any).join('\n');
    expect(problems).toMatch(/does not describe this register's content/);
    expect(problems).toMatch(/without a version bump/);
  });

  it('advances the sequence only when the content changes', () => {
    // Dated AFTER the shipped changelog's last entry: bumpVersion appends, and the changelog is
    // asserted chronological, so a synthetic bump has to sit in the future of the real ones.
    // 36.E1's rows landed 2026-08-02 and moved this fixture's date with them.
    const restamped = bumpVersion(register, { date: '2026-08-03' }) as Any;
    expect(restamped.version.seq).toBe(register.version.seq);
    expect(restamped.version.id).toBe(register.version.id);
    expect(restamped.changelog).toHaveLength(register.changelog.length);

    const moved = {
      ...register,
      rows: register.rows.map((r: Any) => (r.id === 'wacc' ? { ...r, value: 9 } : r)),
    };
    const bumped = bumpVersion(moved as Any, {
      moved: valueDiff(register, moved as Any),
      reason: 'Operator raised the discount rate after a financing conversation.',
      source: 'operator decision, 2026-08-03',
      decided_by: 'operator', phase: '37', date: '2026-08-03',
    }) as Any;
    expect(bumped.version.seq).toBe(register.version.seq + 1);
    expect(bumped.changelog).toHaveLength(register.changelog.length + 1);
    expect(bumped.changelog.at(-1)).toMatchObject({
      id: 'wacc', old: register.rows.find((r: Any) => r.id === 'wacc').value, new: 9,
      decided_by: 'operator', register_version: bumped.version.id,
    });
    expect(validateRegister(bumped)).toEqual([]);
  });

  it('refuses a bump that moves a value with no attributable reason', () => {
    const moved = {
      ...register,
      rows: register.rows.map((r: Any) => (r.id === 'wacc' ? { ...r, value: 9 } : r)),
    };
    const diff = valueDiff(register, moved as Any);
    expect(diff).toEqual([{ id: 'wacc', old: register.rows.find((r: Any) => r.id === 'wacc').value, new: 9 }]);
    expect(() => bumpVersion(moved as Any, { moved: diff })).toThrow(/needs reason, source, decided_by/);
    expect(() => bumpVersion(moved as Any, {
      moved: diff, reason: 'because', source: 'somewhere', decided_by: 'nobody', phase: '37',
    })).toThrow(/decided_by/);
  });

  it('sees an override change as a change, since an override IS the effective value', () => {
    const overridden = {
      ...register,
      rows: register.rows.map((r: Any) => (r.id === 'wacc' ? { ...r, override: 0.1 } : r)),
    };
    expect(valueDiff(register, overridden as Any)).toEqual([
      { id: 'wacc', old: null, new: 0.1, override: true },
    ]);
  });
});

describe('assumption changelog', () => {
  it('every shipped entry is dated, sourced, reasoned and attributed', () => {
    expect(validateChangelog(register)).toEqual([]);
    for (const e of register.changelog as Any[]) {
      expect(e.date, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(DECIDED_BY), e.id).toContain(e.decided_by);
      expect(e.reason.length, e.id).toBeGreaterThanOrEqual(40);
      expect(e, e.id).toHaveProperty('old');
      expect(e, e.id).toHaveProperty('new');
      expect(e, e.id).toHaveProperty('register_version');
    }
  });

  it('is chronological, so the history reads in the order it happened', () => {
    const dates = (register.changelog as Any[]).map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    // Entries 0 and 2 are on different dates, so swapping them is a genuine
    // ordering violation rather than a same-day reshuffle.
    expect(validateChangelog({
      changelog: [{ ...register.changelog[2] }, { ...register.changelog[0] }],
    } as Any).join('\n')).toMatch(/chronological/);
  });

  it('rejects an entry that changed nothing, cites nothing, or hides who decided', () => {
    const good = register.changelog[2];
    const bad = (patch: Any) => validateChangelog({ changelog: [{ ...good, ...patch }] } as Any).join('\n');
    expect(bad({ old: null, new: null })).toMatch(/moved nothing and recorded nothing/);
    expect(bad({ source: 'n/a' })).toMatch(/cite the evidence/);
    expect(bad({ reason: 'because' })).toMatch(/reason must say why/);
    expect(bad({ decided_by: undefined })).toMatch(/decided_by/);
    expect(bad({ date: '28 July' })).toMatch(/YYYY-MM-DD/);
    expect(bad({ register_version: 'v2' })).toMatch(/r<seq>\.<8 hex>/);
  });

  // The three cutovers this arc produced are the register's founding history.
  // Each must carry not just the value change but the evidence a lender's
  // advisor would ask for — the window, the sample, and what it cost.
  it('the measured cutovers carry their full evidence trail', () => {
    const byId = (id: string, date: string): Any => {
      const entry = (register.changelog as Any[]).find((e) => e.id === id && e.date === date);
      expect(entry, `${id} @ ${date} must be in the changelog`).toBeTruthy();
      return entry as Any;
    };

    const trd = byId('driver_trading_realisation', '2026-07-28');
    expect(trd.old).toBe(0.85);
    expect(trd.new).toBe(0.7234);
    expect(trd.decided_by).toBe('operator');
    expect(trd.evidence.measurement.days_traded).toBe(349);
    expect(trd.evidence.measurement.monthly_band).toMatchObject({ low: 0.6535, high: 0.8155 });
    expect(trd.evidence.leakage_checks).toHaveLength(3);
    expect(trd.evidence.client_impact_frozen_fixture.npv_pct).toBe(-16.05);
    expect(trd.evidence.limitation).toMatch(/ONE market year/);

    const uplift = byId('dispatch_15min_uplift', '2026-07-28');
    expect(uplift.old).toBe(0.14);
    expect(uplift.new).toBe(0.0885);
    expect(uplift.evidence.measurement.window).toMatch(/273 complete PT15M days/);
    expect(uplift.evidence.reach.revenue_route).toMatch(/54\/54/);

    const cycles = byId('cycles_efc_yr', '2026-07-28');
    expect(cycles.old).toBe(678);
    expect(cycles.new).toBe(498);
    expect(cycles.decided_by).toBe('derived');
    expect(cycles.evidence.corroboration).toHaveLength(3);
    expect(cycles.evidence.declared_breach).toMatchObject({ band: [550, 720], actual: 498 });
  });

  it('records the two measurements that were NOT adopted, so the gap is on the record', () => {
    const measured = (register.changelog as Any[]).filter((e) => e.decided_by === 'measurement');
    expect(measured.length).toBeGreaterThanOrEqual(2);
    for (const e of measured) expect(e.reason).toMatch(/measured/i);
  });
});
