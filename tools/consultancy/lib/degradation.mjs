/**
 * Degradation loop closure — Phase 36.B5
 *
 * The hourly engine has an open loop in it. `simulateYear` takes `total_cd` —
 * a cycling rate, assumed up front from the throughput anchors — and uses it to
 * pick the SOH curve, which sets `usableMwh`, which is the energy the dispatch
 * is allowed to move. The dispatch then REALISES a cycling rate of its own, and
 * nothing ever compares the two. If the realised rate is materially below the
 * assumed one, the battery has been aged faster than its own dispatch justifies
 * — a conservative open loop, but an open loop, and bankability test #5 asks
 * whether the model's branches are consistent or merely conservative.
 *
 * Closing it is a fixed-point iteration:
 *
 *     cd₀ (assumed)  →  dispatch  →  realised EFC/365  =  cd₁
 *     cd₁            →  dispatch  →  realised EFC/365  =  cd₂   …
 *
 * ── Why it converges ─────────────────────────────────────────────────────
 *
 * The map is a contraction over the realistic range. A lower cd picks a
 * shallower SOH decline, which RAISES `usableMwh`; EFC is throughput divided by
 * usable energy, so the same physical dispatch counts as FEWER equivalent full
 * cycles, pushing cd lower again — but the larger usable window also lets the
 * dispatch move slightly more energy, pushing back up. The second effect is
 * bounded by price shape and by the reserve commitment, so the net map has a
 * derivative well under 1 and successive differences shrink geometrically.
 *
 * That is the argument. It is not the evidence: `closeDegradationLoop` reports
 * every pass, the residual after each, and whether the tolerance was actually
 * met, so the convergence claim is measured on the run rather than asserted
 * here. A run that fails to converge returns `converged: false` with its
 * residual rather than silently returning the last iterate.
 *
 * ── What the loop does NOT do ────────────────────────────────────────────
 *
 * It does not re-price anything. Prices, reserve volumes and the policy are held
 * fixed across passes, so the only thing moving between them is the SOH-scaled
 * energy window. That isolation is what makes the residual attributable.
 */

/** Default convergence tolerance, in cycles/day. 0.001 c/d ≈ 0.37 EFC/yr. */
export const DEFAULT_TOLERANCE_CD = 1e-3;

/** The arc's claim: two passes is enough for realistic parameters. */
export const ARC_PASSES = 2;

export class DegradationLoopError extends Error {}

/**
 * Iterate dispatch ↔ SOH to a fixed point in cycles/day.
 *
 * @param {object} o
 * @param {(cd: number) => {realised_cd: number, [k: string]: any}} o.run
 *        Runs the dispatch at an assumed cycling rate and returns what it
 *        realised. Supplied by the caller so this module never decides how an
 *        asset is dispatched (rule #4).
 * @param {number} o.cd0            The throughput-derived starting assumption.
 * @param {number} [o.tolerance]    Convergence tolerance in cycles/day.
 * @param {number} [o.maxPasses]    Hard stop. Default 8.
 * @param {number} [o.damping]      Optional relaxation in (0, 1]; 1 = none.
 */
export function closeDegradationLoop({
  run, cd0, tolerance = DEFAULT_TOLERANCE_CD, maxPasses = 8, damping = 1,
}) {
  if (!(cd0 > 0)) throw new DegradationLoopError(`cd0 must be positive, got ${cd0}`);
  if (!(damping > 0 && damping <= 1)) {
    throw new DegradationLoopError(`damping must be in (0, 1], got ${damping}`);
  }

  const passes = [];
  let cdIn = cd0;
  let converged = false;

  for (let n = 1; n <= maxPasses; n++) {
    const result = run(cdIn);
    const realised = result.realised_cd;
    if (!Number.isFinite(realised)) {
      throw new DegradationLoopError(`pass ${n}: dispatch returned a non-finite cycling rate`);
    }
    const cdOut = cdIn + damping * (realised - cdIn);
    const delta = cdOut - cdIn;

    passes.push({
      pass: n,
      cd_in: cdIn,
      realised_cd: realised,
      cd_out: cdOut,
      delta,
      abs_delta: Math.abs(delta),
      rel_delta: cdIn > 0 ? Math.abs(delta) / cdIn : null,
      result,
    });

    if (Math.abs(delta) <= tolerance) { converged = true; cdIn = cdOut; break; }
    cdIn = cdOut;
  }

  const last = passes[passes.length - 1];
  // The residual the ARC's two-pass claim actually leaves on the table, whether
  // or not the loop was allowed to run further. This is the number the
  // methodology has to state.
  const atArcPasses = passes[Math.min(ARC_PASSES, passes.length) - 1];

  return {
    converged,
    tolerance,
    damping,
    cd0,
    cd_final: cdIn,
    n_passes: passes.length,
    residual_cd: last.abs_delta,
    residual_rel: last.rel_delta,
    // Contraction ratio between successive passes — < 1 is the evidence the map
    // is a contraction; reported rather than assumed.
    contraction: passes.length >= 2 && passes[passes.length - 2].abs_delta > 0
      ? last.abs_delta / passes[passes.length - 2].abs_delta : null,
    two_pass: {
      passes: ARC_PASSES,
      cd: atArcPasses.cd_out,
      residual_cd: atArcPasses.abs_delta,
      residual_rel: atArcPasses.rel_delta,
      within_tolerance: atArcPasses.abs_delta <= tolerance,
      // What stopping at two passes costs, against the converged answer.
      gap_to_converged_cd: Math.abs(atArcPasses.cd_out - cdIn),
      gap_to_converged_rel: cdIn > 0 ? Math.abs(atArcPasses.cd_out - cdIn) / cdIn : null,
    },
    passes: passes.map(({ result, ...rest }) => rest),
    trace: passes,
  };
}

/**
 * Mean realised cycling rate across a projection horizon.
 *
 * SOH falls year on year, so a single year's realised EFC is not the asset's
 * cycling rate — the fixed point has to be taken on the horizon the SOH curve
 * is actually indexed over.
 */
export function meanRealisedCd(perYear) {
  const vals = perYear.map((y) => y.cycles.efc_used / 365).filter(Number.isFinite);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
