// Phase 7.7a (7.7.10) — sensitivity tornado from /revenue.matrix.
//
// Convert the worker's 3×3 CAPEX × COD-year IRR matrix into a tornado: a
// horizontal bar per pivot dimension showing the IRR delta vs the base
// (mid-CAPEX, mid-COD) case in percentage points. Sorted by absolute
// magnitude so the largest single-axis swing reads from the top.
//
// Sign convention: lower CAPEX → higher IRR → positive delta. Earlier COD
// also produces positive delta in the current Baltic supply stack (less
// fleet S/D compression by the time the asset commissions).

export type CapexBucket = 'low' | 'mid' | 'high';

// Wider `capex: string` accepted at the boundary so callers can pass the
// untyped worker payload without casting; we narrow internally via the
// equality checks against BASE_CAPEX / 'low' / 'high'.
export interface MatrixRow {
  capex?: CapexBucket | string;
  cod?: number;
  project_irr?: number | null;
  equity_irr?: number | null;
  min_dscr?: number | null;
  capex_kwh?: number;
}

export interface TornadoBar {
  /** Display label; e.g. "CAPEX low" or "COD 2027". */
  label: string;
  /** Pivot dimension; one of 'capex' | 'cod' | 'scenario'. */
  dimension: 'capex' | 'cod' | 'scenario';
  /** IRR delta vs base case, in percentage points (e.g. +5.4, -2.1). */
  deltaPp: number;
  /** Absolute IRR for this pivot (decimal, e.g. 0.2738). */
  absoluteIrr: number;
}

const BASE_COD = 2028;
const BASE_CAPEX: CapexBucket = 'mid';

/**
 * Find the base-case row in the matrix. Falls back to the first row if no
 * mid-CAPEX/2028-COD cell is present (worker drift safety).
 */
export function findBaseCase(matrix: ReadonlyArray<MatrixRow>): MatrixRow | null {
  if (!matrix.length) return null;
  return matrix.find(r => r.capex === BASE_CAPEX && r.cod === BASE_COD) ?? matrix[0] ?? null;
}

/**
 * Build the tornado bars from the 9-cell matrix plus optional scenario data.
 * Each pivot axis contributes 0–2 bars (one per off-base case); the base
 * itself is excluded (its delta is zero by construction).
 *
 * Bars are sorted by absolute deltaPp descending so the biggest swing reads
 * from the top.
 */
export function buildTornadoBars(
  matrix: ReadonlyArray<MatrixRow>,
  scenarios?: { conservative?: { project_irr?: number | null }; stress?: { project_irr?: number | null } },
): TornadoBar[] {
  const base = findBaseCase(matrix);
  if (!base || base.project_irr == null) return [];
  const baseIrr = base.project_irr;

  const out: TornadoBar[] = [];

  // CAPEX axis: low + high vs mid (at base COD).
  for (const cap of ['low', 'high'] as const) {
    const cell = matrix.find(r => r.capex === cap && r.cod === BASE_COD);
    if (!cell || cell.project_irr == null) continue;
    out.push({
      label: `CAPEX ${cap}`,
      dimension: 'capex',
      deltaPp: (cell.project_irr - baseIrr) * 100,
      absoluteIrr: cell.project_irr,
    });
  }

  // COD axis: 2027 + 2029 vs 2028 (at base CAPEX).
  for (const cod of [2027, 2029] as const) {
    const cell = matrix.find(r => r.cod === cod && r.capex === BASE_CAPEX);
    if (!cell || cell.project_irr == null) continue;
    out.push({
      label: `COD ${cod}`,
      dimension: 'cod',
      deltaPp: (cell.project_irr - baseIrr) * 100,
      absoluteIrr: cell.project_irr,
    });
  }

  // Scenario axis: conservative + stress vs base.
  if (scenarios?.conservative?.project_irr != null) {
    out.push({
      label: 'Conservative',
      dimension: 'scenario',
      deltaPp: (scenarios.conservative.project_irr - baseIrr) * 100,
      absoluteIrr: scenarios.conservative.project_irr,
    });
  }
  if (scenarios?.stress?.project_irr != null) {
    out.push({
      label: 'Stress',
      dimension: 'scenario',
      deltaPp: (scenarios.stress.project_irr - baseIrr) * 100,
      absoluteIrr: scenarios.stress.project_irr,
    });
  }

  out.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
  return out;
}

/**
 * Compute the symmetric x-axis range for the tornado plot. Returns the
 * absolute maximum across all bars, padded ~10%, so positive and negative
 * lobes are visually balanced around zero.
 */
export function tornadoAxisExtent(bars: ReadonlyArray<TornadoBar>): number {
  if (!bars.length) return 5;
  const maxAbs = Math.max(...bars.map(b => Math.abs(b.deltaPp)));
  return maxAbs * 1.1;
}
