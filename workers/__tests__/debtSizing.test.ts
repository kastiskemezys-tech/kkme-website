/**
 * Phase 39 — sculpted debt sizing.
 *
 * The gate the prompt asks for: "sculpting solver tested against a hand-computed
 * golden case, not only against itself (B5)".
 *
 * Golden cases 1 and 2 below are computed BY HAND in the comments — every
 * intermediate line of the amortisation table is written out with the arithmetic
 * that produced it, so the expectation is independent of the implementation
 * rather than a transcription of its output. Golden case 3 verifies the circular
 * (tax-coupled) solve by re-deriving the whole schedule with plain arithmetic
 * inside the test, never calling the module's own scheduler.
 *
 * The closed-form cross-check is included but is explicitly SECONDARY: it shares
 * the sculpting formula with the implementation, so on its own it would be a
 * mirror test blind to any error the two share (B5).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSchedule, sizeDebt, closedFormDebt, assertDebtInvariants, DebtSizingError,
} from '../lib/debtSizing.js';

// A CFADS vector that ignores the interest path — no tax coupling.
const flat = (v: number[]) => () => v;

describe('golden case 1 — flat CFADS, no grace, hand-computed', () => {
  // CFADS = 1000 every year, rate 10 %, target DSCR 1.25, tenor 3, no grace.
  //
  // Sculpted debt service is CFADS / target = 1000 / 1.25 = 800 in every year.
  // The debt is the present value of that service at the debt rate:
  //
  //   800 / 1.10   = 727.2727272727273
  //   800 / 1.21   = 661.1570247933884
  //   800 / 1.331  = 601.0518407212622
  //   D            = 1989.4815927873779
  //
  // Amortisation, computed by hand from that D:
  //   Y1  int = 1989.4815927873779 x 0.10 = 198.94815927873779
  //       prin = 800 - 198.94815927873779 = 601.0518407212622
  //       bal  = 1388.4297520661157
  //   Y2  int = 138.84297520661157
  //       prin = 800 - 138.84297520661157 = 661.1570247933884
  //       bal  = 727.2727272727273
  //   Y3  int = 72.72727272727273
  //       prin = 800 - 72.72727272727273 = 727.2727272727273
  //       bal  = 0
  const D_HAND = 1989.4815927873779;
  const args = {
    cfadsFn: flat([1000, 1000, 1000]),
    rate: 0.10, targetDscr: 1.25, graceYears: 0, tenorYears: 3,
    capexNet: 10_000, maxGearing: 1.0,
  };

  it('solves the hand-computed debt quantum', () => {
    const s = sizeDebt(args);
    expect(s.debt).toBeCloseTo(D_HAND, 0);
    expect(s.binding_constraint).toBe('dscr');
  });

  it('reproduces the hand-computed amortisation table line by line', () => {
    const { rows } = buildSchedule({ debt: D_HAND, ...args });
    expect(rows[0].interest).toBeCloseTo(198.94815927873779, 6);
    expect(rows[0].principal).toBeCloseTo(601.0518407212622, 6);
    expect(rows[0].closing_balance).toBeCloseTo(1388.4297520661157, 6);
    expect(rows[1].interest).toBeCloseTo(138.84297520661157, 6);
    expect(rows[1].principal).toBeCloseTo(661.1570247933884, 6);
    expect(rows[1].closing_balance).toBeCloseTo(727.2727272727273, 6);
    expect(rows[2].interest).toBeCloseTo(72.72727272727273, 6);
    expect(rows[2].principal).toBeCloseTo(727.2727272727273, 6);
    expect(rows[2].closing_balance).toBeCloseTo(0, 6);
  });

  it('holds DSCR exactly at target in every sculpted year', () => {
    const { rows } = buildSchedule({ debt: D_HAND, ...args });
    for (const r of rows) expect(r.dscr).toBeCloseTo(1.25, 9);
  });
});

describe('golden case 2 — declining CFADS with a grace year, hand-computed', () => {
  // This is the shape of the real asset: an interest-only first year, then a
  // DECLINING CFADS profile. It is the case a level annuity gets wrong.
  //
  // CFADS = [500, 1200, 1000, 800], rate 10 %, target 1.25, grace 1, tenor 4.
  // Sculpted years are 2, 3, 4; they discount back to the END of the grace year:
  //
  //   (1200/1.25) / 1.10   = 960 / 1.10  = 872.7272727272727
  //   (1000/1.25) / 1.21   = 800 / 1.21  = 661.1570247933884
  //   ( 800/1.25) / 1.331  = 640 / 1.331 = 480.84147257700977
  //   D                                  = 2014.725770097671
  //
  //   Y1 (interest only) int = 201.4725770097671, prin = 0, bal unchanged
  //        DSCR = 500 / 201.4725770097671 = 2.4817273270 (floats above target)
  //   Y2   int = 201.4725770097671, ds = 960
  //        prin = 758.5274229902329,  bal = 1256.1983471074381
  //   Y3   int = 125.61983471074381, ds = 800
  //        prin = 674.3801652892562,  bal = 581.8181818181819
  //   Y4   int = 58.18181818181819,  ds = 640
  //        prin = 581.8181818181818,  bal = 0
  const D_HAND = 2014.725770097671;
  const args = {
    cfadsFn: flat([500, 1200, 1000, 800]),
    rate: 0.10, targetDscr: 1.25, graceYears: 1, tenorYears: 4,
    capexNet: 10_000, maxGearing: 1.0,
  };

  it('solves the hand-computed debt quantum', () => {
    expect(sizeDebt(args).debt).toBeCloseTo(D_HAND, 0);
  });

  it('reproduces the hand-computed table, grace year included', () => {
    const { rows } = buildSchedule({ debt: D_HAND, ...args });
    expect(rows[0].interest_only).toBe(true);
    expect(rows[0].interest).toBeCloseTo(201.4725770097671, 6);
    expect(rows[0].principal).toBe(0);
    expect(rows[0].dscr).toBeCloseTo(2.4817273270, 8);

    expect(rows[1].principal).toBeCloseTo(758.5274229902329, 6);
    expect(rows[1].closing_balance).toBeCloseTo(1256.1983471074381, 6);
    expect(rows[2].principal).toBeCloseTo(674.3801652892562, 6);
    expect(rows[2].closing_balance).toBeCloseTo(581.8181818181819, 6);
    expect(rows[3].principal).toBeCloseTo(581.8181818181818, 6);
    expect(rows[3].closing_balance).toBeCloseTo(0, 6);
  });

  it('average life is the principal-weighted mean year — hand-computed', () => {
    // (2 x 758.5274229902329 + 3 x 674.3801652892562 + 4 x 581.8181818181818)
    //   / 2014.725770097671
    // = (1517.0548459804658 + 2023.1404958677686 + 2327.2727272727273)
    //   / 2014.725770097671
    // = 5867.468069120962 / 2014.725770097671 = 2.9122911694510740
    const s = sizeDebt(args);
    expect(s.avg_life).toBeCloseTo(2.9122911694, 8);
  });

  it('a level annuity on the same debt breaches where the sculpt does not', () => {
    // The point of sculpting, demonstrated rather than asserted. Level annuity
    // on D over the same 3 amortising years at 10 %:
    //   pmt = D x r / (1 - (1+r)^-3)
    //       = 2014.725770097671 x 0.10 / (1 - 1/1.331)
    //       = 201.4725770097671 / 0.2486851990984225 = 810.1510574018127
    const pmt = D_HAND * 0.10 / (1 - Math.pow(1.10, -3));
    expect(pmt).toBeCloseTo(810.1510574018, 8);
    // Y4 CFADS is 800, so the annuity's Y4 cover is 800/810.1510574 = 0.98747 —
    // a breach — while the sculpt sits at exactly 1.25 by construction.
    expect(800 / pmt).toBeCloseTo(0.9874701671, 8);
    expect(800 / pmt).toBeLessThan(1.0);
    const { rows } = buildSchedule({ debt: D_HAND, ...args });
    expect(rows[3].dscr).toBeCloseTo(1.25, 9);
  });
});

describe('golden case 3 — the tax circularity, re-derived independently', () => {
  // CFADS depends on the interest deduction, so debt depends on itself. Here the
  // depreciation shield is deliberately too small to absorb EBITDA, which is the
  // regime the reference config is NOT in — the one a solver that ignored the
  // circularity would get wrong.
  //
  //   EBITDA 1000 flat, depreciation 200, tax 20 %
  //   cash tax_t = 0.20 x max(0, 1000 - 200 - interest_t)
  //   CFADS_t    = 1000 - cash tax_t
  const TAX = 0.20, EBITDA = 1000, DEPR = 200;
  const cfadsFn = (interest: number[]) =>
    interest.map((i) => EBITDA - TAX * Math.max(0, EBITDA - DEPR - i));

  const args = {
    cfadsFn, rate: 0.10, targetDscr: 1.25, graceYears: 0, tenorYears: 3,
    capexNet: 10_000, maxGearing: 1.0,
  };

  it('reports the circularity as binding', () => {
    expect(sizeDebt(args).tax_circularity_binds).toBe(true);
  });

  it('the solved debt repays exactly, re-derived with plain arithmetic', () => {
    // Independent re-derivation: take ONLY the solver's answer for D, then walk
    // the schedule by hand-equivalent arithmetic written here, not by calling
    // buildSchedule. If the module's scheduler were wrong, this would not close.
    const D = sizeDebt(args).debt;
    let bal = D;
    for (let t = 1; t <= 3; t++) {
      const interest = bal * 0.10;
      const cashTax = TAX * Math.max(0, EBITDA - DEPR - interest);
      const cfads = EBITDA - cashTax;
      const ds = cfads / 1.25;
      const principal = ds - interest;
      expect(principal).toBeGreaterThanOrEqual(0);
      bal -= principal;
    }
    expect(bal).toBeCloseTo(0, 2);
  });

  it('the interest tax shield supports strictly MORE debt than no shield', () => {
    // Deducting interest lowers cash tax, which raises CFADS, which raises the
    // sculpted service, which supports more debt. Direction is a property of the
    // mechanism, so it is a check no calibration can satisfy by accident.
    const withShield = sizeDebt(args).debt;
    const noShield = sizeDebt({
      ...args,
      cfadsFn: () => new Array(3).fill(EBITDA - TAX * Math.max(0, EBITDA - DEPR)),
    }).debt;
    expect(withShield).toBeGreaterThan(noShield);
  });

  it('is inert when depreciation already floors taxable income at zero', () => {
    // The reference-config regime: depreciation exceeds EBITDA, so the interest
    // deduction changes nothing and the circularity does not bind.
    const s = sizeDebt({
      ...args,
      cfadsFn: (i: number[]) => i.map(() => EBITDA - TAX * Math.max(0, EBITDA - 5000)),
    });
    expect(s.tax_circularity_binds).toBe(false);
  });
});

describe('golden case 4 — a collapsed year binds the sculpt, hand-computed', () => {
  // The case that exercises the non-negative-principal invariant, which none of
  // the cases above reach. Added after inject-then-revert showed the invariant
  // could be disabled with the suite staying green (B13).
  //
  // CFADS = [1000, 1000, 50, 1000, 1000], rate 10 %, target 1.25, tenor 5.
  //
  // Year 3 makes 50/1.25 = 40 available for debt service. Principal cannot be
  // negative, so interest in year 3 must be at most 40, so the balance entering
  // year 3 must be at most 40/0.10 = 400. That single constraint sets the debt:
  //
  //   Y1  int = 0.10 D          prin = 800 - 0.10 D    bal = 1.10 D - 800
  //   Y2  int = 0.11 D - 80     prin = 880 - 0.11 D    bal = 1.21 D - 1680
  //   bind: 1.21 D - 1680 = 400  ->  D = 2080 / 1.21 = 1719.0082644628099
  //
  //   Y3  int = 40, available 40, prin = 0            bal = 400  (the sculpt is
  //                                                    exactly, not more than,
  //                                                    able to cover interest)
  //   Y4  int = 40, available 800, prin capped at the balance = 400  bal = 0
  const D_HAND = 2080 / 1.21;                       // 1719.0082644628099
  const CFADS = [1000, 1000, 50, 1000, 1000];
  const args = {
    cfadsFn: flat(CFADS),
    rate: 0.10, targetDscr: 1.25, graceYears: 0, tenorYears: 5,
    capexNet: 1e9, maxGearing: 1.0,
  };

  it('solves the hand-derived quantum the collapsed year implies', () => {
    expect(sizeDebt(args).debt).toBeCloseTo(D_HAND, 4);
    expect(D_HAND).toBeCloseTo(1719.0082644628, 8);
  });

  it('drives the balance entering the collapsed year to exactly 40 / 0.10', () => {
    const s = sizeDebt(args);
    expect(s.schedule[1].closing_balance).toBeCloseTo(400, 4);
    expect(s.schedule[2].interest).toBeCloseTo(40, 4);
    expect(s.schedule[2].principal).toBeCloseTo(0, 4);
  });

  it('never asks a year for principal it cannot pay', () => {
    // This is the assertion injection 3 defeats. It must be about the sculpt,
    // not about the floored principal.
    const s = sizeDebt(args);
    for (const r of s.schedule) {
      if (!r.interest_only) expect(r.sculpt_binds, `year ${r.yr}`).toBe(true);
    }
    expect(assertDebtInvariants(s)).toBe(true);
  });

  it('the closed form over-sizes here — which is why it is not the implementation', () => {
    const cf = closedFormDebt({
      cfads: CFADS, rate: 0.10, targetDscr: 1.25, graceYears: 0, tenorYears: 5,
    });
    expect(cf).toBeCloseTo(2461.6302, 3);
    expect(cf).toBeGreaterThan(D_HAND * 1.4);   // ~43 % too much debt
  });
});

describe('closed-form cross-check (SECONDARY to the hand-computed cases)', () => {
  it('agrees with the bisection where the closed form is exact', () => {
    const cases = [
      { cfads: [1000, 1000, 1000], grace: 0, tenor: 3 },
      { cfads: [500, 1200, 1000, 800], grace: 1, tenor: 4 },
      { cfads: [900, 850, 800, 750, 700, 650], grace: 1, tenor: 6 },
    ];
    for (const c of cases) {
      const solved = sizeDebt({
        cfadsFn: flat(c.cfads), rate: 0.075, targetDscr: 1.4,
        graceYears: c.grace, tenorYears: c.tenor, capexNet: 1e9, maxGearing: 1.0,
      });
      const cf = closedFormDebt({
        cfads: c.cfads, rate: 0.075, targetDscr: 1.4,
        graceYears: c.grace, tenorYears: c.tenor,
      });
      expect(solved.debt).toBeCloseTo(cf, 0);
    }
  });
});

describe('invariants', () => {
  const base = {
    cfadsFn: flat([900, 850, 800, 750, 700, 650, 600]),
    rate: 0.075, targetDscr: 1.4, graceYears: 1, tenorYears: 7,
    capexNet: 5000, maxGearing: 1.0,
  };

  it('full repayment and non-negative principal hold on the solved structure', () => {
    const s = sizeDebt(base);
    expect(assertDebtInvariants(s)).toBe(true);
    expect(s.schedule[s.schedule.length - 1].closing_balance).toBeCloseTo(0, 2);
    for (const r of s.schedule) expect(r.principal).toBeGreaterThanOrEqual(0);
  });

  it('principal repaid equals debt drawn', () => {
    const s = sizeDebt(base);
    const paid = s.schedule.reduce((a: number, r: { principal: number }) => a + r.principal, 0);
    expect(paid).toBeCloseTo(s.debt, 2);
  });

  it('assertDebtInvariants actually fails on a corrupted schedule', () => {
    // Inject-then-revert on the gate itself (B13): a gate never observed going
    // red is not known to be a gate.
    const s = sizeDebt(base);
    const broken = { ...s, schedule: s.schedule.map((r, i) => (i === 2 ? { ...r, principal: -1000 } : r)) };
    expect(() => assertDebtInvariants(broken)).toThrow(DebtSizingError);

    const unpaid = {
      ...s,
      schedule: s.schedule.map((r, i) =>
        (i === s.schedule.length - 1 ? { ...r, closing_balance: 12345 } : r)),
    };
    expect(() => assertDebtInvariants(unpaid)).toThrow(/full-repayment/);
  });

  it('a lower DSCR target supports strictly more debt', () => {
    const tight = sizeDebt({ ...base, targetDscr: 2.0 }).debt;
    const loose = sizeDebt({ ...base, targetDscr: 1.2 }).debt;
    expect(loose).toBeGreaterThan(tight);
  });

  it('a longer tenor supports strictly more debt', () => {
    const short = sizeDebt({ ...base, tenorYears: 5 }).debt;
    const long = sizeDebt({ ...base, tenorYears: 7 }).debt;
    expect(long).toBeGreaterThan(short);
  });

  it('a higher margin supports strictly less debt', () => {
    const cheap = sizeDebt({ ...base, rate: 0.05 }).debt;
    const dear = sizeDebt({ ...base, rate: 0.09 }).debt;
    expect(dear).toBeLessThan(cheap);
  });

  it('reports gearing as the binding constraint when the cap bites first', () => {
    const s = sizeDebt({ ...base, capexNet: 3000, maxGearing: 0.30 });
    expect(s.binding_constraint).toBe('gearing');
    expect(s.gearing).toBeCloseTo(0.30, 6);
    expect(assertDebtInvariants(s)).toBe(true);
  });

  it('reports DSCR as the binding constraint when cash flows bite first', () => {
    const s = sizeDebt({ ...base, capexNet: 1e9, maxGearing: 1.0 });
    expect(s.binding_constraint).toBe('dscr');
  });

  it('rejects a facility with no amortising year', () => {
    expect(() => sizeDebt({ ...base, graceYears: 7, tenorYears: 7 }))
      .toThrow(DebtSizingError);
  });

  it('sizes zero debt against a cash-flow profile that cannot service anything', () => {
    const s = sizeDebt({ ...base, cfadsFn: flat([0, 0, 0, 0, 0, 0, 0]) });
    expect(s.debt).toBeCloseTo(0, 0);
    expect(assertDebtInvariants(s)).toBe(true);
  });
});
