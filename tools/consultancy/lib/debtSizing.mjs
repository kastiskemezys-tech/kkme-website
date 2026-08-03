/**
 * Sculpted debt sizing — Phase 39
 *
 * The engine sizes debt backwards. It fixes gearing at 55 %, builds a level
 * annuity, and reports the DSCR that falls out (`workers/fetch-s1.js:2352-2359`).
 * At the reference configuration that number is 0.95 and never crosses 1.00.
 *
 * No lender writes a facility that way. **Debt is sized FROM cash flows to a
 * target DSCR, and gearing is the output.** This module does that, and does it
 * with sculpted amortisation — scheduled principal in year t is
 * `CFADS_t / DSCR_target − interest_t` — because the asset's CFADS profile
 * DECLINES (3.96 M → 2.68 M over the debt life at the reference config) while a
 * level annuity is flat. A flat charge against a declining profile is
 * guaranteed to breach in the late years; that is the whole of the 0.95.
 *
 * ── The circularity, and why it is not ignored ─────────────────────────────
 *
 * CFADS is `EBITDA − cash tax − maintenance capex`, and cash tax is computed
 * after an interest deduction (`fetch-s1.js:2565-2573`). So CFADS depends on the
 * interest path, the interest path depends on the debt balance, and the debt
 * balance is what we are solving for. The system is circular and is solved as a
 * fixed point, not assumed away.
 *
 * At the reference configuration the circularity happens to be INERT: straight-
 * line depreciation on gross capex (€3.28 M/yr) already exceeds EBITDA through
 * the debt life, so taxable income is floored at zero with or without the
 * interest deduction and cash tax is 0 in every debt year. A solver that
 * ignored the circularity would therefore agree exactly at the reference config
 * and diverge silently elsewhere — under a contracted floor, which lifts EBITDA
 * above the depreciation shield, it stops being inert. That is a B4-class trap
 * (a self-made defect the phase's own reference case cannot see), so the
 * circularity is solved everywhere and `tax_circularity_binds` is REPORTED per
 * config rather than asserted either way.
 *
 * ── Solution method ────────────────────────────────────────────────────────
 *
 * Outer bisection on debt quantum D; inner fixed point on the interest path.
 * Bisection rather than the closed-form PV of the sculpted service, because the
 * closed form silently violates the non-negative-principal invariant when CFADS
 * is uneven, and because it cannot carry the tax circularity. The closed form is
 * kept as an INDEPENDENT cross-check in the tests (it is exact in the no-tax
 * case), never as the implementation.
 *
 * Residual balance after the final debt year is monotonically increasing in D —
 * more debt means more interest, less principal for the same sculpted service,
 * and a larger residual — which is what makes the bisection well-posed.
 */

export class DebtSizingError extends Error {}

/** Convergence controls. Tight enough that EUR-level rounding is never the binding error. */
const INTEREST_TOL_EUR = 0.01;
const INTEREST_MAX_ITER = 200;
// Sub-cent, not sub-euro: the bisection's own tolerance was showing through as
// a ~3 cent residual on the tax-coupled golden case, i.e. the solver's precision
// was being set by this constant rather than by the arithmetic. Bisection is
// cheap (~55 iterations to reach this from a €50 M bracket), so there is no
// reason to leave slack that a full-repayment assertion then has to tolerate.
const BISECT_TOL_EUR = 1e-6;
const BISECT_MAX_ITER = 200;

/**
 * Build the sculpted schedule for a GIVEN debt quantum.
 *
 * `cfadsFn(interestByYear)` returns the full CFADS vector (index 0 = year 1) for
 * an assumed interest path, so the caller owns the tax arithmetic and this
 * module never restates it (discipline rule #4). Callers with no tax coupling
 * pass a function that ignores its argument.
 *
 * Years 1..grace are interest-only. Years grace+1..tenor amortise on the sculpt.
 * `tenor` is the TOTAL legal tenor of the facility, grace included — that is the
 * quantity lenders quote (Société Générale's "7-year to 10-year legal tenor").
 */
export function buildSchedule({
  debt, rate, targetDscr, graceYears, tenorYears, cfadsFn,
}) {
  if (!(debt >= 0)) throw new DebtSizingError(`debt must be >= 0, got ${debt}`);
  if (!(tenorYears > graceYears)) {
    throw new DebtSizingError(
      `tenorYears (${tenorYears}) must exceed graceYears (${graceYears}) — ` +
      'a facility with no amortising year never repays'
    );
  }

  // Inner fixed point: the interest path implies CFADS implies the schedule
  // implies the interest path.
  let interest = new Array(tenorYears).fill(0);
  let rows = null;
  let converged = false;
  let iters = 0;

  for (let it = 0; it < INTEREST_MAX_ITER; it++) {
    iters = it + 1;
    const cfads = cfadsFn(interest);
    const next = new Array(tenorYears).fill(0);
    rows = [];
    let bal = debt;

    for (let t = 1; t <= tenorYears; t++) {
      const int_t = bal * rate;
      next[t - 1] = int_t;
      const cfads_t = cfads[t - 1] ?? 0;

      let ds, principal, sculpt_binds;
      if (t <= graceYears) {
        ds = int_t;
        principal = 0;
        sculpt_binds = false;
      } else {
        const available = cfads_t / targetDscr;
        principal = available - int_t;
        // Non-negative principal: a year whose sculpted service cannot even
        // cover interest is NOT quietly turned into a capitalising year. It is
        // recorded, and the outer solve reduces D until it disappears.
        sculpt_binds = principal >= 0;
        if (principal < 0) principal = 0;
        if (principal > bal) principal = bal;      // never overpay the balance
        ds = int_t + principal;
      }

      bal -= principal;
      rows.push({
        yr: t,
        opening_balance: bal + principal,
        interest: int_t,
        principal,
        debt_service: ds,
        closing_balance: bal,
        cfads: cfads_t,
        dscr: ds > 0 ? cfads_t / ds : null,
        interest_only: t <= graceYears,
        sculpt_binds,
      });
    }

    const delta = Math.max(...next.map((v, i) => Math.abs(v - interest[i])));
    interest = next;
    if (delta < INTEREST_TOL_EUR) { converged = true; break; }
  }

  if (!converged) {
    throw new DebtSizingError(
      `interest fixed point did not converge in ${INTEREST_MAX_ITER} iterations ` +
      `at debt ${Math.round(debt)}`
    );
  }

  const residual = rows[rows.length - 1].closing_balance;
  const negative_principal_years = rows.filter((r) => !r.interest_only && !r.sculpt_binds)
    .map((r) => r.yr);

  return { rows, residual, interest_path: interest, iterations: iters, negative_principal_years };
}

/**
 * Solve the maximum debt that a cash-flow profile supports at a target DSCR.
 *
 * Returns the DSCR-implied quantum, the gearing-capped quantum, and which of
 * the two binds — the prompt's point that "DSCR-bound vs gearing-capped is
 * itself information".
 */
export function sizeDebt({
  cfadsFn, rate, targetDscr, graceYears = 1, tenorYears = 7,
  capexNet, maxGearing = 0.60,
}) {
  if (!(rate >= 0)) throw new DebtSizingError(`rate must be >= 0, got ${rate}`);
  if (!(targetDscr > 0)) throw new DebtSizingError(`targetDscr must be > 0, got ${targetDscr}`);
  if (!(capexNet > 0)) throw new DebtSizingError(`capexNet must be > 0, got ${capexNet}`);
  if (!(maxGearing > 0 && maxGearing <= 1)) {
    throw new DebtSizingError(`maxGearing must be in (0, 1], got ${maxGearing}`);
  }

  const sched = (D) => buildSchedule({ debt: D, rate, targetDscr, graceYears, tenorYears, cfadsFn });

  // Upper bracket: full capex. If even that repays, the cash flows are not the
  // binding constraint and the gearing cap is the whole answer.
  let lo = 0;
  let hi = capexNet;
  if (sched(hi).residual <= 0) {
    lo = hi;
  } else {
    for (let i = 0; i < BISECT_MAX_ITER && hi - lo > BISECT_TOL_EUR; i++) {
      const mid = (lo + hi) / 2;
      const s = sched(mid);
      // Feasible iff it fully repays AND never asks for negative principal.
      if (s.residual <= 0 && s.negative_principal_years.length === 0) lo = mid;
      else hi = mid;
    }
  }

  const debt_dscr = lo;
  const debt_gearing_cap = maxGearing * capexNet;
  const debt = Math.min(debt_dscr, debt_gearing_cap);
  const binding = debt_dscr <= debt_gearing_cap ? 'dscr' : 'gearing';

  const final = sched(debt);
  const principalPaid = final.rows.reduce((a, r) => a + r.principal, 0);

  // Average life: principal-weighted mean year. Undefined for a zero facility.
  const avg_life = debt > 0
    ? final.rows.reduce((a, r) => a + r.yr * r.principal, 0) / principalPaid
    : null;

  // Tax circularity is inert iff zeroing the interest deduction leaves CFADS
  // unchanged over the debt life. Measured, not assumed.
  const cfads_with = cfadsFn(final.interest_path);
  const cfads_without = cfadsFn(new Array(tenorYears).fill(0));
  const tax_circularity_binds = cfads_with.slice(0, tenorYears)
    .some((v, i) => Math.abs(v - cfads_without[i]) > 1);

  return {
    debt,
    debt_dscr_implied: debt_dscr,
    debt_gearing_cap,
    binding_constraint: binding,
    gearing: debt / capexNet,
    equity: capexNet - debt,
    capex_net: capexNet,
    target_dscr: targetDscr,
    rate,
    grace_years: graceYears,
    tenor_years: tenorYears,
    avg_life,
    schedule: final.rows,
    residual: final.residual,
    principal_repaid: principalPaid,
    tax_circularity_binds,
    // Grace-year cover is a real lender test and the sculpt does not set it:
    // during interest-only years DSCR floats wherever CFADS puts it.
    min_dscr_scheduled: Math.min(...final.rows.filter((r) => r.debt_service > 0)
      .map((r) => r.dscr)),
  };
}

/**
 * Closed-form present value of the sculpted debt service.
 *
 * EXACT when there is no tax coupling and no invariant binds, and used in the
 * tests as an independent check on the bisection. Deliberately NOT the
 * implementation: it cannot carry the tax circularity and it silently violates
 * the non-negative-principal invariant on an uneven CFADS profile.
 */
export function closedFormDebt({ cfads, rate, targetDscr, graceYears, tenorYears }) {
  let pv = 0;
  for (let t = graceYears + 1; t <= tenorYears; t++) {
    pv += (cfads[t - 1] / targetDscr) / Math.pow(1 + rate, t - graceYears);
  }
  return pv;
}

/**
 * Invariant assertions, run on every solved structure.
 * These are the phase's own gates on its own output (failure-modes B4).
 */
export function assertDebtInvariants(solved, { tolerance = 1.0 } = {}) {
  const errs = [];
  const { schedule, debt } = solved;

  if (schedule.some((r) => r.principal < -tolerance)) {
    errs.push('non-negative-principal invariant violated');
  }
  // The invariant is about the SCULPT, not about the recorded number. A year
  // whose sculpted service cannot cover its own interest has a negative
  // principal that the scheduler then floors to zero — so asserting on the
  // floored value alone can never see it. Caught by inject-then-revert: forcing
  // `sculpt_binds` true left the whole suite green (B13's corollary).
  const unservible = schedule.filter((r) => !r.interest_only && !r.sculpt_binds).map((r) => r.yr);
  if (unservible.length) {
    errs.push(
      `sculpted service does not cover interest in year(s) ${unservible.join(', ')} — ` +
      'the facility capitalises rather than amortises there'
    );
  }
  const closing = schedule[schedule.length - 1].closing_balance;
  if (Math.abs(closing) > tolerance) {
    errs.push(`full-repayment invariant violated: closing balance ${closing.toFixed(2)}`);
  }
  const paid = schedule.reduce((a, r) => a + r.principal, 0);
  if (Math.abs(paid - debt) > tolerance) {
    errs.push(`principal repaid ${paid.toFixed(2)} != debt drawn ${debt.toFixed(2)}`);
  }
  for (const r of schedule) {
    if (r.closing_balance < -tolerance) errs.push(`negative balance in year ${r.yr}`);
    if (r.interest < -tolerance) errs.push(`negative interest in year ${r.yr}`);
  }
  if (solved.gearing < 0 || solved.gearing > 1 + 1e-9) {
    errs.push(`gearing out of range: ${solved.gearing}`);
  }
  if (errs.length) throw new DebtSizingError(errs.join('; '));
  return true;
}
