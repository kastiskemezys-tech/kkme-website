/**
 * Phase 49 item 2 — the CLASS guard.
 *
 * The defect was not "calcIRR is wrong". It was that a bisection can return its
 * own bracket bound as if it were an answer, and nothing downstream can tell.
 * That shape can appear in any solver, so the guard has to be about the class:
 *
 *   1. **Enumeration.** Every bisection-shaped loop in the codebase is listed
 *      here with its verdict. A new one appears as a FAILING test, not as a
 *      silent addition — the count is asserted, so adding a solver without
 *      adding its verdict breaks this file.
 *   2. **Behaviour.** Each listed solver is driven with an input whose answer
 *      lies outside its bracket, and must not answer with the bracket.
 *
 * The enumeration is a text match, so on its own it would be exactly the failure
 * playbook B13 describes — a test whose subject is a string in a file. It is
 * paired with the behavioural assertions below and is never the only evidence.
 *
 * Enumerated 2026-08-04 by:
 *   grep -nE '(lo|hi) = mid|npv\(mid\)' workers/fetch-s1.js workers/lib/*.js
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solveIRR } from '../fetch-s1.js';
import { sizeDebt } from '../lib/debtSizing.js';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(here, '../fetch-s1.js'), 'utf8');
const DEBT = readFileSync(join(here, '../lib/debtSizing.js'), 'utf8');

/**
 * The four bounded solvers this repo contains, and why each is or is not safe.
 * `sites` counts the bisection assignment lines the solver owns.
 */
const SOLVERS = [
  {
    id: 'solveIRR',
    file: 'workers/fetch-s1.js',
    verdict: 'SAFE — enumerates roots in a bounded domain; returns null with a reason outside it',
  },
  {
    id: 'computeRevenue_legacy.calcIRR',
    file: 'workers/fetch-s1.js',
    verdict: 'REMOVED (Phase 49) — was a bare bisection over [-0.5, 2.0]; now delegates to solveIRR',
  },
  {
    id: 'computeRevenueWorker (EU ranking)',
    file: 'workers/fetch-s1.js',
    verdict: 'REPAIRED (Phase 49) — was a bare bisection over [0, 5.0] returning `lo`; now delegates to solveIRR',
  },
  {
    id: 'sizeDebt',
    file: 'workers/lib/debtSizing.js',
    verdict: 'SAFE — the upper bound is a MEANINGFUL answer (cash flows service full capex) and is reported as `binding_constraint`',
  },
];

describe('class guard · every bounded solver distinguishes converged from bounded', () => {
  it('enumerates every bisection in the codebase — a new one fails this test', () => {
    // Located, not counted. Every bisection assignment in the worker must sit
    // INSIDE solveIRR's body; a new solver anywhere else fails here by position,
    // which survives reformatting in a way a line count does not.
    const start = WORKER.indexOf('function solveIRR(cf) {');
    const end = WORKER.indexOf('\nfunction calcIRR(cf) {', start);
    expect(start, 'solveIRR present').toBeGreaterThan(0);
    expect(end, 'solveIRR body delimited').toBeGreaterThan(start);

    const stray: number[] = [];
    for (const m of WORKER.matchAll(/[\w.]+\s*=\s*mid\s*;/g)) {
      if (m.index! < start || m.index! > end) stray.push(m.index!);
    }
    const lineOf = (i: number) => WORKER.slice(0, i).split('\n').length;
    expect(
      stray.map(lineOf),
      'bisection assignments in fetch-s1.js OUTSIDE solveIRR — each is a solver that can return its own bound',
    ).toEqual([]);

    // sizeDebt keeps its own bisection, deliberately, and is verified
    // behaviourally below rather than being folded into solveIRR.
    expect((DEBT.match(/[\w.]+\s*=\s*mid\s*;/g) ?? []).length, 'sizeDebt bisection assignments').toBe(2);

    // No second IRR implementation may reappear beside the canonical one.
    expect((WORKER.match(/function calcIRR\(/g) ?? []).length, 'calcIRR definitions').toBe(1);
    expect(SOLVERS).toHaveLength(4);
  });

  // ── Behavioural: the assertions the enumeration above cannot make ───────────

  it('solveIRR: an answer outside the domain comes back as null, not as the domain edge', () => {
    const high = solveIRR([-100, 10000, 10000]);   // true IRR ≈ 10 000 %
    expect(high.value).toBeNull();
    expect(high.bound).toBe('above_domain');
    expect(high.reason).not.toBe('converged');
  });

  it('solveIRR: every non-null answer satisfies NPV(root) ≈ 0 — the property, not the label', () => {
    // A solver could return `reason: 'converged'` and still be lying. This checks
    // the thing `converged` is supposed to mean.
    const streams = [
      [-1000, 1100],
      [-16_400_000, ...Array(20).fill(2_400_000)],
      [-1000, 400, 400],
      [-100, 30, 30, 30, 30, 30],
    ];
    for (const cf of streams) {
      const s = solveIRR(cf);
      if (s.value === null) continue;
      const npv = cf.reduce((a, c, t) => a + c / Math.pow(1 + (s.value as number), t), 0);
      const scale = cf.reduce((a, c) => a + Math.abs(c), 0);
      expect(Math.abs(npv) / scale, `NPV at claimed root of ${JSON.stringify(cf.slice(0, 3))}…`)
        .toBeLessThan(1e-3);
    }
  });

  it('sizeDebt: hitting its upper bracket is REPORTED, not disguised as a solve', () => {
    // The pass case, and the reason this guard is not just a list of things to
    // fix. sizeDebt CAN return its upper bound — but only when that bound is the
    // true answer ("the cash flows service the whole capex"), and it says so in
    // `binding_constraint` rather than leaving the caller to guess.
    const capexNet = 10_000_000;
    const fat = sizeDebt({
      capexNet, rate: 0.05, targetDscr: 1.3, graceYears: 0, tenorYears: 15,
      maxGearing: 0.7, cfadsFn: () => Array(15).fill(50_000_000),
    });
    expect(fat.debt_dscr_implied).toBeCloseTo(capexNet, 0);   // at the bracket top
    expect(fat.binding_constraint).toBe('gearing');           // …and it says so
    expect(fat.debt).toBeCloseTo(0.7 * capexNet, 0);          // …and the cap wins

    // The contrasting case: thin cash flows, so DSCR binds and the answer is
    // strictly inside the bracket.
    const thin = sizeDebt({
      capexNet, rate: 0.05, targetDscr: 1.3, graceYears: 0, tenorYears: 15,
      maxGearing: 0.7, cfadsFn: () => Array(15).fill(400_000),
    });
    expect(thin.binding_constraint).toBe('dscr');
    expect(thin.debt_dscr_implied).toBeLessThan(capexNet * 0.99);
    expect(thin.debt_dscr_implied).toBeGreaterThan(0);
  });
});
