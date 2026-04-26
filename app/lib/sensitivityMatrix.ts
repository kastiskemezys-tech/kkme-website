// Sensitivity matrix cell lookup, extracted as a pure helper so the
// CAPEX -> IRR ordering can be regression-asserted in Vitest.
//
// Audit complaint: "EUR120, EUR164, EUR262 CAPEX cases all yielding 8.6%
// IRR." Investigation in 7.6.7 found the live worker payload IS responding
// to CAPEX (live mid-CAPEX 2027 = 8.81%, low = 14.29%, high = 2.09%) but
// (a) the matrix didn't honour the user's scenario toggle (worker fix
// shipped), and (b) reading the mid-CAPEX row across COD years gives
// "8.8 / 8.6 / 8.6" — flat by 0.2 pp because COD year has small effect
// in mid-CAPEX. The audit observed (b) but described it as a CAPEX
// non-responsiveness.
//
// Spec asserts the strong invariant: for any single COD year, lower
// CAPEX produces strictly higher IRR. If a future regression collapses
// the matrix or mis-binds rows, this trips.

export interface MatrixCell {
  cod: number;
  capex_kwh: number;
  project_irr: number | null;
  equity_irr?: number | null;
  min_dscr?: number;
  net_mw_yr?: number;
  bankability?: string;
}

export function findMatrixCell(
  matrix: ReadonlyArray<MatrixCell>,
  capexKwh: number,
  cod: number,
): MatrixCell | undefined {
  return matrix.find(m => m.capex_kwh === capexKwh && m.cod === cod);
}

/** True if, for every COD year, IRR strictly decreases as CAPEX increases. */
export function capexIrrOrderingValid(matrix: ReadonlyArray<MatrixCell>): boolean {
  const cods = Array.from(new Set(matrix.map(m => m.cod))).sort();
  for (const cod of cods) {
    const row = matrix
      .filter(m => m.cod === cod)
      .sort((a, b) => a.capex_kwh - b.capex_kwh);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1].project_irr;
      const cur = row[i].project_irr;
      if (prev == null || cur == null) continue;
      if (cur >= prev) return false; // higher CAPEX should yield lower IRR
    }
  }
  return true;
}

/** Number of distinct IRR values across the whole matrix; should be > 1 for any non-degenerate scenario. */
export function distinctIrrCount(matrix: ReadonlyArray<MatrixCell>): number {
  const set = new Set<number>();
  for (const m of matrix) {
    if (m.project_irr != null) set.add(Math.round(m.project_irr * 1000));
  }
  return set.size;
}
