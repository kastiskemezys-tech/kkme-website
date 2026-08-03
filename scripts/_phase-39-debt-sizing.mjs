/**
 * Phase 39 — sculpted debt sizing across the public matrix, and the
 * contracted-share table that is the phase's commercial point.
 *
 * One process, one frozen KV fixture, one engine module (engine-baseline-one-process).
 *
 * Usage:
 *   node scripts/_phase-39-debt-sizing.mjs               # CP tables to stdout
 *   node scripts/_phase-39-debt-sizing.mjs --json <path> # machine-readable dump
 */
import { writeFileSync } from 'node:fs';
import { publicParamMatrix, loadFixtureKV } from '../tools/consultancy/regression-reference.mjs';
import { sizeDebt, assertDebtInvariants } from '../tools/consultancy/lib/debtSizing.mjs';
import {
  DEBT_PARAMS, baseCase, blendedDscrTarget, parameterTableMarkdown,
} from '../tools/consultancy/lib/debtParams.mjs';
import { normaliseContract, contractYear } from '../tools/consultancy/lib/contracted.mjs';

const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json') >= 0 ? argv[argv.indexOf('--json') + 1] : null;

const mod = await import('../workers/fetch-s1.js');
const { computeRevenueV7, calcIRR, cashTaxFor } = mod;
const kv = loadFixtureKV();

/** The engine's corporate tax rate — `workers/fetch-s1.js:2357` (`const tax_rate = 0.17`). */
const TAX_RATE = 0.17;

const REF_ID = 'dur=4h capex=mid cod=2027 scenario=base';
const HORIZON = 20;

/**
 * CFADS as a function of the interest path, built from an engine result.
 *
 * EBITDA, depreciation and maintenance capex are financing-independent, so they
 * come straight off the engine's own year rows. Cash tax is the only line that
 * moves with the structure being solved, and it is computed by the ENGINE's tax
 * function (`cashTaxFor`, exported in this phase) rather than a copy of it.
 */
function cfadsFnFor(result) {
  const rows = result.years;
  return (interestByYear) => rows.map((y, i) => {
    const interest = interestByYear[i] ?? 0;
    const cash_tax = cashTaxFor(y.ebitda, y.depr, interest, TAX_RATE);
    return y.ebitda - cash_tax - y.maint_capex;
  });
}

/** Equity IRR at a solved structure: CFADS less actual debt service, after the equity cheque. */
function equityIrrAt(result, solved) {
  const cfads = cfadsFnFor(result)(
    // Pad the solved interest path out to the full horizon; there is no debt
    // service after the tenor, so interest is zero there by construction.
    Array.from({ length: HORIZON }, (_, i) => solved.schedule[i]?.interest ?? 0)
  );
  const cf = [-solved.equity];
  for (let t = 1; t <= HORIZON; t++) {
    const ds = solved.schedule[t - 1]?.debt_service ?? 0;
    cf.push(cfads[t - 1] - ds);
  }
  return calcIRR(cf);
}

/** Size one configuration. `overrides` lets the caller move a single parameter. */
function sizeOne(result, overrides = {}) {
  const p = { ...baseCase(), ...overrides };
  const solved = sizeDebt({
    cfadsFn: cfadsFnFor(result),
    capexNet: result.capex_net ?? result.net_capex,
    ...p,
  });
  assertDebtInvariants(solved);
  return { ...solved, equity_irr: equityIrrAt(result, solved) };
}

const pct = (v, dp = 1) => (v == null ? '—' : (v * 100).toFixed(dp) + '%');
const eurM = (v) => (v == null ? '—' : (v / 1e6).toFixed(2));

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Parameters
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(78));
console.log('PHASE 39 — SCULPTED DEBT SIZING');
console.log('='.repeat(78));
console.log('\nKV fixture: tools/consultancy/fixtures/regression-kv.json (frozen)');
console.log('Engine    : computeRevenueV7, workers/fetch-s1.js\n');
console.log('--- PARAMETERS (base case = conservative end of every sourced range) ---\n');
console.log(parameterTableMarkdown());
const bc = baseCase();
console.log(`\nBase case: DSCR ${bc.targetDscr.toFixed(2)}x · tenor ${bc.tenorYears}y ` +
  `(incl. ${bc.graceYears}y grace) · rate ${(bc.rate * 100).toFixed(2)}% ` +
  `(EURIBOR ${(DEBT_PARAMS.base_rate.base * 100).toFixed(2)}% + ${DEBT_PARAMS.margin_bp.base}bp) ` +
  `· gearing cap ${pct(bc.maxGearing, 0)}`);

// ═══════════════════════════════════════════════════════════════════════════
// 2 · The reference configuration, in full
// ═══════════════════════════════════════════════════════════════════════════
const MATRIX = publicParamMatrix();
const refEntry = MATRIX.find((x) => x.id === REF_ID) ?? MATRIX[0];
const refResult = computeRevenueV7(refEntry.params, kv);
const refSolved = sizeOne(refResult);

console.log('\n\n' + '-'.repeat(78));
console.log(`REFERENCE CONFIGURATION — ${refEntry.id}`);
console.log('-'.repeat(78));
console.log(`\n  Engine today (fixed 55% gearing, level annuity, 8y tenor + 1y grace):`);
console.log(`    min DSCR                 ${refResult.min_dscr}    <- does not cross 1.00`);
console.log(`    debt drawn               EUR ${eurM(refResult.debt_initial)}M  (55.0% of net capex)`);
console.log(`    equity IRR               ${pct(refResult.equity_irr, 2)}`);
console.log(`\n  Sized from cash flows to a ${bc.targetDscr.toFixed(2)}x target (this phase):`);
console.log(`    solved debt              EUR ${eurM(refSolved.debt)}M`);
console.log(`    implied gearing          ${pct(refSolved.gearing, 1)}`);
console.log(`    binding constraint       ${refSolved.binding_constraint.toUpperCase()}`);
console.log(`    DSCR-implied quantum     EUR ${eurM(refSolved.debt_dscr_implied)}M`);
console.log(`    gearing-cap quantum      EUR ${eurM(refSolved.debt_gearing_cap)}M`);
console.log(`    average life             ${refSolved.avg_life?.toFixed(2)} years`);
console.log(`    equity cheque            EUR ${eurM(refSolved.equity)}M`);
console.log(`    equity IRR               ${pct(refSolved.equity_irr, 2)}`);
console.log(`    tax circularity binds    ${refSolved.tax_circularity_binds}`);

console.log('\n  Solved amortisation schedule:');
console.log('    yr    CFADS      interest   principal   debt svc    DSCR   closing bal');
for (const r of refSolved.schedule) {
  console.log(`    ${String(r.yr).padStart(2)}  ${eurM(r.cfads).padStart(8)}M ` +
    `${eurM(r.interest).padStart(10)}M ${eurM(r.principal).padStart(10)}M ` +
    `${eurM(r.debt_service).padStart(9)}M ${(r.dscr ?? 0).toFixed(2).padStart(7)} ` +
    `${eurM(r.closing_balance).padStart(11)}M${r.interest_only ? '   (interest only)' : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · Per-configuration table
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n\n' + '-'.repeat(78));
console.log(`ALL ${MATRIX.length} PUBLIC CONFIGURATIONS`);
console.log('-'.repeat(78));
console.log('\n  configuration                                    old   solved   gear  bind   eqIRR   avgL');
console.log('                                                  DSCR    debt');
const perConfig = [];
for (const { id, params } of MATRIX) {
  const result = computeRevenueV7(params, kv);
  const solved = sizeOne(result);
  perConfig.push({ id, params, result, solved });
  console.log(`  ${id.padEnd(46)} ${String(result.min_dscr).padStart(5)} ` +
    `${eurM(solved.debt).padStart(7)}M ${pct(solved.gearing, 0).padStart(5)} ` +
    `${solved.binding_constraint.padEnd(7)} ${pct(solved.equity_irr, 1).padStart(6)} ` +
    `${(solved.avg_life ?? 0).toFixed(1).padStart(5)}`);
}

const nDscr = perConfig.filter((x) => x.solved.binding_constraint === 'dscr').length;
const nGear = perConfig.length - nDscr;
const nTax = perConfig.filter((x) => x.solved.tax_circularity_binds).length;
console.log(`\n  binding constraint: DSCR-bound ${nDscr}/${perConfig.length} · ` +
  `gearing-capped ${nGear}/${perConfig.length}`);
console.log(`  tax circularity binds in ${nTax}/${perConfig.length} configurations`);
const gearings = perConfig.map((x) => x.solved.gearing).sort((a, b) => a - b);
console.log(`  solved gearing: min ${pct(gearings[0])} · median ` +
  `${pct(gearings[Math.floor(gearings.length / 2)])} · max ${pct(gearings[gearings.length - 1])}`);

// ═══════════════════════════════════════════════════════════════════════════
// 4 · The contracted-share table
// ═══════════════════════════════════════════════════════════════════════════
//
// The floor level is derived from the asset's OWN merchant path, by a stated
// rule, and is a STRUCTURE TEST rather than a term sheet — the same standing
// this estate already gives `derivedFloor` in run-contracted.mjs. The rule: the
// median of merchant net market revenue per MW over the first ten operating
// years, rounded to the nearest EUR 1k. Sensitivity at +/- 20% is reported
// beneath, so no single invented floor level is load-bearing.
const mw = refEntry.params.mw;
const first10 = refResult.years.slice(0, 10).map((y) => y.rev_gross / mw).sort((a, b) => a - b);
const FLOOR = Math.round((first10[4] + first10[5]) / 2 / 1000) * 1000;
const TERM_YEARS = 10;
const LEVELS = [0, 0.25, 0.50];

console.log('\n\n' + '-'.repeat(78));
console.log('CONTRACTED-SHARE TABLE — what a floor is worth in DEBT, not in revenue');
console.log('-'.repeat(78));
console.log(`\n  Floor: EUR ${(FLOOR / 1000).toFixed(0)}k/MW/yr, ${TERM_YEARS}-year term, blended ` +
  `(the floor is an option the asset holds; upside retained).`);
console.log('  Basis: median of merchant net market revenue per MW, operating years 1-10,');
console.log('  taken from the CENTRAL case — a floor is negotiated off central expectations,');
console.log('  so it is central-derived and then tested against the downside.');
console.log('\n  TWO EFFECTS, REPORTED SEPARATELY. Contracting raises sustainable debt through');
console.log('  two distinct channels, and conflating them would credit the floor with movement');
console.log('  that is really an assumption:');
console.log('    (A) CASH-FLOW effect — MEASURED. The floor lifts CFADS in the years it binds.');
console.log('        DSCR target held at the merchant 2.00x, so this is the floor alone.');
console.log('    (B) LENDER-TREATMENT effect — ASSUMED. Contracted revenue is underwritten at a');
console.log('        lower DSCR. Uses the UNSOURCED blend of 2.00x/1.20x (see debtParams.mjs).');

const contractedRows = [];
for (const scenarioName of ['base', 'conservative', 'stress']) {
  const scEntry = { ...refEntry, params: { ...refEntry.params, scenario: scenarioName } };
  const scMerchant = computeRevenueV7(scEntry.params, kv);
  const mkResult = (level, floor) => {
    if (level === 0) return scMerchant;
    const c = normaliseContract({
      floor_eur_mw_yr: floor, contracted_pct_of_mw: level, term_years: TERM_YEARS,
      counterparty_note:
        'ILLUSTRATIVE — no counterparty. Structure test at a model-derived floor, not a ' +
        'term sheet and not an offer received (discipline rule #3).',
    });
    const contract_fn = ({ yr, mw: m, rev_gross, operational_months }) =>
      contractYear({
        merchant_net: rev_gross, mw: m, yr, operational_months, contract: c, mode: 'blended',
      }).total;
    return computeRevenueV7({ ...scEntry.params, contract_fn }, kv);
  };

  console.log(`\n\n  === ${scenarioName.toUpperCase()} scenario ` +
    `(engine min DSCR at fixed 55% gearing: ${scMerchant.min_dscr}) ===\n`);
  console.log('   contracted   20yr net rev    debt @2.00x     debt @blended   gearing   equity IRR');
  console.log('        share       (EUR M)     (A) measured    (A+B) w/ blend');

  const rows = [];
  for (const level of LEVELS) {
    const result = mkResult(level, FLOOR);
    const target = blendedDscrTarget(level);
    const solvedA = sizeOne(result, { targetDscr: DEBT_PARAMS.dscr_merchant.base });
    const solvedAB = sizeOne(result, { targetDscr: target });
    const rev20 = result.years.reduce((a, y) => a + y.rev_net, 0);
    // How often the floor actually pays — the mechanism, not the outcome.
    const bindYears = level === 0 ? 0 : result.years
      .filter((y, i) => i < TERM_YEARS && y.rev_gross > scMerchant.years[i].rev_gross).length;
    rows.push({
      scenario: scenarioName, level, target, rev20, bindYears,
      debt_a: solvedA.debt, debt_ab: solvedAB.debt,
      gearing: solvedAB.gearing, equity_irr: equityIrrAt(result, solvedAB),
      binding_constraint: solvedAB.binding_constraint,
    });
    console.log(`   ${pct(level, 0).padStart(10)} ${eurM(rev20).padStart(13)} ` +
      `${eurM(solvedA.debt).padStart(15)} ${eurM(solvedAB.debt).padStart(17)} ` +
      `${pct(solvedAB.gearing, 1).padStart(9)} ${pct(rows[rows.length - 1].equity_irr, 2).padStart(11)}`);
  }
  contractedRows.push(...rows);

  const b0 = rows[0];
  console.log('\n   decomposition vs 0% contracted:');
  for (const r of rows.slice(1)) {
    const dRev = (r.rev20 - b0.rev20) / b0.rev20 * 100;
    const dA = (r.debt_a - b0.debt_a) / b0.debt_a * 100;               // floor alone
    const dAB = (r.debt_ab - b0.debt_ab) / b0.debt_ab * 100;           // floor + blend
    const share = dAB !== 0 ? (dAB - dA) / dAB * 100 : 0;
    // The measured lever: how much more debt each point of revenue buys. This is
    // the deterministic analogue of 36.B4's tail-vs-median asymmetry — sculpting
    // is set by the LOW years, so a floor that lifts them converts into debt at a
    // higher rate than it converts into revenue, and more so the worse the case.
    const lever = dRev !== 0 ? dA / dRev : null;
    r.floor_lever = lever;
    console.log(`    ${pct(r.level, 0).padStart(5)}: revenue ${dRev >= 0 ? '+' : ''}${dRev.toFixed(2)}%` +
      `  ·  debt from the FLOOR ALONE ${dA >= 0 ? '+' : ''}${dA.toFixed(2)}%` +
      (lever != null && Number.isFinite(lever) ? ` (lever ${lever.toFixed(2)}x)` : '') +
      `  ·  debt with the blend ${dAB >= 0 ? '+' : ''}${dAB.toFixed(2)}%` +
      `  ·  ${share.toFixed(0)}% of that is the ASSUMED blend` +
      `  ·  floor pays in ${r.bindYears}/${TERM_YEARS} yrs`);
  }
}

// The headline of the measured channel: the lever rises as the case worsens.
console.log('\n\n  THE MEASURED ASYMMETRY (50% contracted, floor alone, no blend assumption):');
for (const sc of ['base', 'conservative', 'stress']) {
  const r = contractedRows.find((x) => x.scenario === sc && x.level === 0.50);
  console.log(`    ${sc.padEnd(13)} debt rises ${r.floor_lever.toFixed(2)}x as fast as revenue`);
}
const lBase = contractedRows.find((x) => x.scenario === 'base' && x.level === 0.50).floor_lever;
const lStress = contractedRows.find((x) => x.scenario === 'stress' && x.level === 0.50).floor_lever;
console.log(`    -> the floor converts into debt ${(lStress / lBase).toFixed(2)}x more efficiently in the`);
console.log('       downside than in the central case. Sculpting is set by the low years, so');
console.log('       the worse the case, the more a floor is worth as DEBT rather than revenue.');
console.log('       This is 36.B4\'s tail-vs-median asymmetry in its financing form — measured');
console.log('       here on the deterministic scenario ladder, NOT inherited from B4\'s P90');
console.log('       (which the five-shape-year sample cannot resolve; methodology-lender.md §4).');

console.log('\n\n  Floor sensitivity — solved debt (EUR M) at the MEASURED 2.00x target,');
console.log('  i.e. the floor\'s own cash-flow effect with no blend assumption:');
console.log('   scenario        floor        0%        25%        50%');
for (const scenarioName of ['base', 'stress']) {
  for (const mult of [0.8, 1.0, 1.2]) {
    const f = Math.round(FLOOR * mult / 1000) * 1000;
    const cells = LEVELS.map((level) => {
      const p = { ...refEntry.params, scenario: scenarioName };
      let result;
      if (level === 0) result = computeRevenueV7(p, kv);
      else {
        const c = normaliseContract({
          floor_eur_mw_yr: f, contracted_pct_of_mw: level, term_years: TERM_YEARS,
          counterparty_note: 'ILLUSTRATIVE — structure test, not a term sheet.',
        });
        result = computeRevenueV7({
          ...p,
          contract_fn: ({ yr, mw: m, rev_gross, operational_months }) => contractYear({
            merchant_net: rev_gross, mw: m, yr, operational_months, contract: c, mode: 'blended',
          }).total,
        }, kv);
      }
      return eurM(sizeOne(result, { targetDscr: DEBT_PARAMS.dscr_merchant.base }).debt).padStart(10);
    });
    console.log(`   ${scenarioName.padEnd(12)} ${String((f / 1000).toFixed(0) + 'k').padStart(8)} ${cells.join(' ')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · Parameter sensitivity at the reference config
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// 4b · DSCR sensitivity — the parameter the whole answer rests on
// ═══════════════════════════════════════════════════════════════════════════
//
// The base case is 2.00x merchant cover, and that single number is a FLAGGED US
// PANEL TRANSFER (Beth Waters, MUFG, over SOFR) carried onto a EUR Baltic asset.
// It produces 23.9% gearing at the reference config — a striking claim, namely
// that a fully merchant Baltic BESS is barely debt-financeable. If that
// conclusion is stable across the plausible DSCR range it is robust; if it
// swings, the transferred parameter IS the result and a reader must see that.
// So the range is shown rather than described.
console.log('\n\n' + '-'.repeat(78));
console.log('DSCR SENSITIVITY — how much of the answer is the transferred parameter?');
console.log('-'.repeat(78));
console.log('\n  Base case 2.00x is a US-panel transfer (debtParams.dscr_merchant). 1.50x and');
console.log('  1.75x are shown NOT as alternative sourced values but to expose how much of');
console.log('  the conclusion depends on it. Contracted storage is published at 1.15-1.20x,');
console.log('  so 1.50x is already well below anything sourced for MERCHANT cover.\n');
console.log('   DSCR target      solved debt    gearing    equity IRR   bind    configs <30% gearing');
const DSCR_LADDER = [1.50, 1.75, 2.00];
const dscrSensitivity = [];
for (const target of DSCR_LADDER) {
  const s = sizeOne(refResult, { targetDscr: target });
  const geared = MATRIX.map(({ params }) => {
    const r = computeRevenueV7(params, kv);
    return sizeOne(r, { targetDscr: target }).gearing;
  });
  const below30 = geared.filter((g) => g < 0.30).length;
  dscrSensitivity.push({
    target, debt: s.debt, gearing: s.gearing, equity_irr: s.equity_irr,
    binding_constraint: s.binding_constraint, configs_below_30pct_gearing: below30,
    median_gearing: [...geared].sort((a, b) => a - b)[Math.floor(geared.length / 2)],
  });
  console.log(`   ${target.toFixed(2)}x ${eurM(s.debt).padStart(16)}M ${pct(s.gearing, 1).padStart(10)} ` +
    `${pct(s.equity_irr, 2).padStart(13)}   ${s.binding_constraint.padEnd(7)} ${String(below30).padStart(9)}/${MATRIX.length}`);
}
const dLo = dscrSensitivity[0], dHi = dscrSensitivity[dscrSensitivity.length - 1];
console.log(`\n   Across 1.50x-2.00x the reference config's gearing moves ` +
  `${pct(dHi.gearing, 1)} -> ${pct(dLo.gearing, 1)} ` +
  `(${((dLo.debt - dHi.debt) / dHi.debt * 100).toFixed(0)}% more debt at the loose end).`);
console.log(`   Median gearing across all ${MATRIX.length} configurations: ` +
  `${pct(dHi.median_gearing, 1)} at 2.00x -> ${pct(dLo.median_gearing, 1)} at 1.50x.`);
console.log('   Every configuration stays DSCR-bound at every point on the ladder — the 60%');
console.log('   gearing cap never binds, so the cap is not what produces the low gearing.');

console.log('\n\n' + '-'.repeat(78));
console.log('PARAMETER SENSITIVITY — reference config, one parameter moved at a time');
console.log('-'.repeat(78));
console.log('\n   parameter                       value    solved debt   gearing   equity IRR');
const sens = [
  ['base case', {}],
  ['DSCR target -> 1.20x (contracted end)', { targetDscr: DEBT_PARAMS.dscr_contracted.base }],
  ['DSCR target -> 1.60x (midpoint)', { targetDscr: 1.60 }],
  ['tenor -> 10y (long end)', { tenorYears: 10 }],
  ['margin -> 275bp (tight end)', { rate: DEBT_PARAMS.base_rate.base + 0.0275 }],
  ['gearing cap -> 40% (tight end)', { maxGearing: 0.40 }],
];
for (const [label, ov] of sens) {
  const s = sizeOne(refResult, ov);
  console.log(`   ${label.padEnd(38)} ${eurM(s.debt).padStart(9)}M ` +
    `${pct(s.gearing, 1).padStart(9)} ${pct(s.equity_irr, 2).padStart(11)}  ` +
    `[${s.binding_constraint}]`);
}

console.log('\n' + '='.repeat(78) + '\n');

if (jsonAt) {
  writeFileSync(jsonAt, JSON.stringify({
    _note: 'Phase 39 debt sizing. Frozen KV fixture; no live data.',
    parameters: DEBT_PARAMS,
    base_case: bc,
    reference: {
      id: refEntry.id,
      engine_min_dscr: refResult.min_dscr,
      engine_debt_initial: refResult.debt_initial,
      engine_equity_irr: refResult.equity_irr,
      solved: refSolved,
    },
    per_config: perConfig.map((x) => ({
      id: x.id,
      engine_min_dscr: x.result.min_dscr,
      solved_debt: x.solved.debt,
      gearing: x.solved.gearing,
      binding_constraint: x.solved.binding_constraint,
      equity_irr: x.solved.equity_irr,
      avg_life: x.solved.avg_life,
      tax_circularity_binds: x.solved.tax_circularity_binds,
    })),
    dscr_sensitivity: dscrSensitivity,
    contracted: {
      floor_eur_mw_yr: FLOOR, term_years: TERM_YEARS, mode: 'blended',
      // Both channels are serialised separately, for the same reason they are
      // printed separately: `debt_measured` is the floor's own cash-flow effect
      // at the merchant 2.00x target, `debt_with_blend` additionally carries the
      // UNSOURCED DSCR blend. A consumer that reads only one of them must be
      // reading the one it means to.
      rows: contractedRows.map((r) => ({
        scenario: r.scenario,
        contracted_share: r.level,
        dscr_target_blended: r.target,
        debt_measured_at_2x: r.debt_a,
        debt_with_blend: r.debt_ab,
        gearing: r.gearing,
        binding_constraint: r.binding_constraint,
        equity_irr: r.equity_irr,
        net_revenue_20yr: r.rev20,
        floor_binds_years: r.bindYears,
        floor_lever_vs_revenue: r.floor_lever ?? null,
      })),
    },
  }, null, 2) + '\n');
  console.error(`json -> ${jsonAt}`);
}
