// Per-service price formation — 36.E1 (FCR) + 36.E2 (aFRR).
//
// BEHIND ITS OWN SEAM. Nothing here is wired into the projection path. `/revenue` is byte-identical
// at every commit of this batch, asserted by the 54/54 regression gate. Wiring is 36.E6, after the
// continuity gate and operator sign-off, and it will replace `reservePrice()` — NOT `cpiCurve()`.
// That distinction is a Pause A correction and it matters: `cpiCurve` is disclosure-only (three
// call sites, all `cpi_*_at_cod`, no cash path — assumptions-register B-034.4-C, re-verified at
// code level this phase). The function that actually forms reserve capacity prices in the
// projection is `reservePrice(sd_ratio, base_price)` at workers/fetch-s1.js:3166, read at four
// sites in `computeTradingMix`.
//
// ── The model, and why it has this shape rather than a decay curve ─────────────────────────────
//
// The arc's skeleton was `clearing = max(endogenous floor, tightness-driven scarcity term)`. What
// the German data actually supports is narrower and, once measured, more useful:
//
//   MEASURED (87 months, DE FCR capacity vs DE day-ahead arbitrage opportunity): the capacity
//   price tracks the arbitrage opportunity at r = 0.837 in logs. German FCR's nominal price rose
//   7.29 -> 18.46 EUR/MW/h between 2020 and 2026 — and its RATIO to the arbitrage opportunity fell
//   over the same span. Both statements are true and they are about different quantities. The
//   nominal rise is the arbitrage opportunity rising (3.46 -> 18.35 EUR/MW/h); the ratio is what
//   decayed. E0's headline "German FCR has not decayed, it has roughly doubled" is right about the
//   price and would be misleading as an input to a forecast, because a forecast that carries the
//   nominal level forward carries a crisis-era energy price forward with it.
//
// So price formation is expressed on the ONE quantity that is common to every market and that our
// own engine already computes for its own asset:
//
//     clearing(t) = max( floor(t), k(t) x arbitrage_opportunity(t) )
//
//   * `arbitrage_opportunity` is the gross day-ahead spread value of a MW, from ./arbitrage.mjs —
//     one implementation, shared with the E0 summary table (rule #4).
//   * `floor` is ENDOGENOUS: the net value the marginal MW gives up by committing to reserve.
//     NOT the gross arbitrage opportunity minus cycling cost — that formula is the arc's, and the
//     data falsifies it (see `endogenousFloor`). A reserve commitment forgoes the SoC headroom it
//     reserves, not the whole MW's arbitrage, so the floor carries a measured DISPLACEMENT
//     fraction. Computed, not assumed, and the correction was found by a reproduction test failing
//     rather than by reasoning about it.
//   * `k` is the scarcity multiple. It is calibrated as a LEVEL per market/product/regime and a
//     CONVERGENCE RATE toward the mature-market level — not as a function of S/D, because no
//     public German battery-fleet series exists in the evidence base to regress against. That
//     limitation is stated wherever k appears rather than papered over with a fitted S/D curve
//     whose independent variable we do not hold.
//
// ── What is NOT here, deliberately ────────────────────────────────────────────────────────────
//
// NO PICASSO BREAK PARAMETER. The prompt anticipated transferring a break magnitude from the
// capacity evidence. Measured instead: it must not be applied at all. Every Baltic accession is
// past (MARI 2024-10-10; PICASSO Litgrid 2025-03-05, Elering + AST 2025-04-11) and every day of
// our own Baltic clearing series begins 2025-10-01, so the break is already inside the base level
// the model calibrates on. Applying a forward compression would double-count it. See
// `calibrate-price-formation.mjs` for the counts that establish this.

import { RTE_BOL, rteCurveFor, sohYr } from '../../../workers/fetch-s1.js';

// ── The marginal cycling cost ─────────────────────────────────────────────────────────────────

/**
 * What one MWh of discharged arbitrage energy costs the battery that produces it.
 *
 * THIS IS THE ONE GENUINELY NEW QUANTITY IN THIS BATCH, and it is new because the engine does not
 * have it. Pause A looked for it and found the INGREDIENTS but not the number: `sohYr` and
 * `rteCurveFor` give the physics, `warranty_efc_yr` gives the throughput budget, and
 * `lcos_eur_mwh` (workers/fetch-s1.js:2510) gives a LEVELISED cost including capex recovery over
 * the whole project — which is not a marginal cost and must not be used as one. So this composes
 * the existing primitives rather than restating any of them; it introduces no physical constant of
 * its own, and every input either comes from the engine's exports or is passed in by the caller
 * from the project config.
 *
 * Two components, both marginal:
 *   * DEGRADATION — capex amortised over the warranted throughput. The MWh that a cycle consumes
 *     out of the warranty budget is a MWh the asset cannot sell later, so its cost is the capex it
 *     carries.
 *   * RTE LOSS — a round trip returns less than it takes in, so delivering 1 MWh requires buying
 *     1/RTE MWh. The loss is charged at the price the charging actually happens at.
 *
 * NOT included: fixed O&M (does not vary with the cycle), capital cost of time (levelised, not
 * marginal), and augmentation (a decision, not a per-cycle cost).
 *
 * @param {object} o
 * @param {number} o.capex_eur_kwh        project capex, EUR/kWh of nameplate energy
 * @param {number} o.duration_h           hours at rated power
 * @param {number} o.warranty_efc_yr      warranted equivalent full cycles per year
 * @param {number} o.warranty_life_yr     years the warranty covers
 * @param {number} o.charge_price_eur_mwh price the charging energy is bought at
 * @param {number} [o.year_index]         1-based project year, for SOH and RTE ageing
 * @param {number} [o.rte]                override; default is the engine's own duration+age curve
 */
export function marginalCyclingCost({
  capex_eur_kwh, duration_h, warranty_efc_yr, warranty_life_yr,
  charge_price_eur_mwh, year_index = 1, rte,
}) {
  for (const [k, v] of Object.entries({ capex_eur_kwh, duration_h, warranty_efc_yr, warranty_life_yr, charge_price_eur_mwh })) {
    if (!Number.isFinite(v)) throw new Error(`marginalCyclingCost: ${k} must be a finite number, got ${v}`);
  }
  if (!(duration_h > 0) || !(warranty_efc_yr > 0) || !(warranty_life_yr > 0)) {
    throw new Error('marginalCyclingCost: duration_h, warranty_efc_yr and warranty_life_yr must be positive');
  }

  // Engine physics, imported not restated (rule #4).
  const curve = rteCurveFor(duration_h, Math.max(year_index, 18));
  const rteYr = rte ?? curve[Math.min(year_index - 1, curve.length - 1)] ?? RTE_BOL.h2;
  const soh = sohYr(year_index, 1.0);

  // Warranted throughput per MWh of nameplate, over the whole warranty. One EFC is one nameplate
  // energy through the battery, so the budget in MWh-of-nameplate is simply EFC x years.
  const warranted_efc_total = warranty_efc_yr * warranty_life_yr;
  // Capex per MWh of nameplate energy. EUR/kWh x 1000 = EUR/MWh.
  const capex_eur_per_mwh_nameplate = capex_eur_kwh * 1000;
  const degradation_eur_mwh = capex_eur_per_mwh_nameplate / warranted_efc_total;

  // Round-trip loss, charged at the charging price. SOH derates delivered energy per cycle but not
  // the cost per delivered MWh, so it does not enter here — it enters the per-MW/h conversion.
  const rte_loss_eur_mwh = charge_price_eur_mwh * (1 / rteYr - 1);

  const total_eur_mwh = degradation_eur_mwh + rte_loss_eur_mwh;

  // Availability-equivalent, so it is directly subtractable from the arbitrage proxy: one cycle a
  // day of `duration_h` MWh per MW of nameplate, SOH-derated, spread over 24 h. Same convention as
  // ./arbitrage.mjs, deliberately — a floor computed on a different convention from the opportunity
  // it is a floor on is not a floor.
  const eur_mw_h = (total_eur_mwh * duration_h * soh) / 24;

  return {
    degradation_eur_mwh, rte_loss_eur_mwh, total_eur_mwh, eur_mw_h,
    inputs: { rte: rteYr, soh, warranted_efc_total, year_index },
  };
}

/**
 * The endogenous floor: what committing a MW to reserve actually costs its owner.
 *
 * THE ARC'S FORMULA IS FALSIFIED AS WRITTEN, and this is the correction. The arc specifies the
 * floor as "the arbitrage opportunity cost of the marginal MW" — i.e. the GROSS arbitrage value,
 * net of cycling. Every market in the evidence base clears reserve capacity far below that. E0
 * measured floors at 0.09 to 1.80 times the contemporaneous arbitrage opportunity, a nine-fold
 * spread, and six of its eight measurable products sit below 0.5. The E1/E2 reproduction test
 * failed against the gross formula before it was corrected: Baltic aFRR down modelled at 17.85
 * EUR/MW/h against 10.04 measured, because a gross floor bound the price at the full arbitrage
 * value and the market plainly does not.
 *
 * The mechanism is the one 36.B1 measured and then never priced: committing a MW to reserve does
 * NOT forgo that MW's whole arbitrage. It forgoes the SoC HEADROOM the commitment reserves, and
 * the battery keeps arbitraging around it — that simultaneity is exactly what the chronological
 * dispatch engine exists to demonstrate. So the opportunity cost is a FRACTION of the gross
 * arbitrage value, and the fraction is a property of the product (how much headroom, for how long)
 * and of the market design.
 *
 * `displacement` is that fraction. It is REQUIRED and has no default on purpose: an implicit 1.0
 * is precisely the wrong answer this correction exists to remove, and a silent default would let
 * it back in. It is measured per market and product — see the calibration file's
 * `floor_displacement` block for the value, the window and the statistic each one came from.
 *
 * Clamped at zero, because a negative opportunity cost would mean the battery pays to arbitrage;
 * at that point reserve is free to supply and the floor is zero, not negative.
 */
export function endogenousFloor({ arb_eur_mw_h, cycling_eur_mw_h, displacement }) {
  if (!Number.isFinite(displacement)) {
    throw new Error('endogenousFloor: `displacement` is required — the fraction of the gross arbitrage opportunity a reserve commitment actually forgoes. There is no safe default; 1.0 is the falsified gross-floor assumption this parameter exists to replace.');
  }
  if (!(displacement > 0 && displacement <= 2)) {
    throw new Error(`endogenousFloor: displacement ${displacement} is outside the measured range. E0 measured 0.09..1.83 across eight products; above 1 means the market pays more for availability than for the energy itself, which Sweden's hydro-set FCR-N does, so the ceiling is generous rather than tight.`);
  }
  return Math.max(0, displacement * arb_eur_mw_h - cycling_eur_mw_h);
}

// ── E1 — FCR ──────────────────────────────────────────────────────────────────────────────────

/**
 * FCR capacity clearing price.
 *
 * Symmetric primary reserve: capacity-only, activation energy negligible by construction (a
 * frequency-proportional +/- response nets to roughly nothing over any settlement period). The
 * only price to form is the capacity price.
 *
 * `symmetric_premium` is the measured excess of FCR's scarcity multiple over aFRR's in the SAME
 * market and the SAME months — the market's own price for holding headroom in both directions at
 * once. It is a measurement, not a modelled adder.
 *
 * FCR IS A ROUNDING ERROR AND MUST STAY ONE. Baltic FCR procurement is 28 MW against mFRR's 604.
 * The calibration reports the FCR revenue share and the E1 test asserts it stays under 1 %; if it
 * ever does not, that is a defect to investigate rather than a result to keep.
 */
export function fcrClearing({ arb_eur_mw_h, cycling_eur_mw_h, k, displacement, symmetric_premium = 1 }) {
  const floor = endogenousFloor({ arb_eur_mw_h, cycling_eur_mw_h, displacement });
  const scarcity = k * symmetric_premium * arb_eur_mw_h;
  return { clearing: Math.max(floor, scarcity), floor, scarcity, binding: scarcity >= floor ? 'scarcity' : 'floor' };
}

// ── E2 — aFRR capacity ────────────────────────────────────────────────────────────────────────

/**
 * aFRR capacity clearing price, per direction.
 *
 * Up and down are separate products with separate clearing and — measured — separate levels: in
 * the Baltics the down multiple is roughly a third of the up multiple, in Germany the two are
 * within 10 % of each other. Modelling them symmetrically would be modelling Germany's market
 * structure and calling it the Baltics'.
 */
export function afrrCapacityClearing({ arb_eur_mw_h, cycling_eur_mw_h, k, displacement }) {
  const floor = endogenousFloor({ arb_eur_mw_h, cycling_eur_mw_h, displacement });
  const scarcity = k * arb_eur_mw_h;
  return { clearing: Math.max(floor, scarcity), floor, scarcity, binding: scarcity >= floor ? 'scarcity' : 'floor' };
}

/**
 * Convergence of a young market's scarcity multiple toward a mature market's.
 *
 * Exponential toward the mature LEVEL, never below it — the mature market is where the Baltics are
 * going, not a floor they undershoot. `lambda_per_yr` is measured from the mature market's own
 * within-regime trend; `k_mature` from its regime level. Both carry their n and t-statistic in the
 * calibration file, and where a rate is not statistically supported the calibration says so and
 * names what was used instead.
 */
export function convergeK({ k_now, k_mature, lambda_per_yr, years_elapsed }) {
  if (years_elapsed < 0) throw new Error('convergeK: years_elapsed must not be negative');
  return k_mature + (k_now - k_mature) * Math.exp(-lambda_per_yr * years_elapsed);
}

// ── E2 — aFRR activation, per direction ───────────────────────────────────────────────────────

/**
 * Activation revenue for one MW of committed aFRR over one year, per direction.
 *
 * WHAT THE CURRENT ENGINE GETS WRONG, and what this fixes. `computeTradingMix` prices activation as
 * `reservePrice(sd x 1.15, R_act_base)` — a capacity-shaped EUR/MW/h with a steeper S/D curve. That
 * is not what activation is. Activation is energy: a quantity of MWh, called some fraction of the
 * time, settled at an energy price. And the hourly dispatch engine models it UP-ONLY (36.B1's
 * stated limitation), which means the down direction — where the battery is PAID to take energy it
 * needed anyway — is missing from both.
 *
 * DOWN-ACTIVATION IS NOT A MIRROR OF UP. Measured on Germany's settled series over 144 288
 * quarter-hours: down activates as often as up (0.79 vs 0.78 of ISPs) but its price distribution is
 * different in kind — median EUR 47.00/MWh against up's EUR 130.48, and NEGATIVE 22.1 % of the
 * time. A negative down price means the battery is paid to charge. Its value is therefore not the
 * price itself but what the charge would otherwise have cost: `da_charge_price - down_price` per
 * MWh, which is positive whenever the down price sits below the day-ahead, and larger than the
 * price itself whenever the down price is negative.
 *
 * @param {object} o
 * @param {number} o.committed_mw
 * @param {number} o.activation_rate      fraction of ISPs in which this direction is activated
 * @param {number} o.energy_per_mw_per_activated_h  MWh delivered per MW per activated hour
 * @param {number} o.price_eur_mwh        settled activation price for the direction
 * @param {number} [o.da_charge_price_eur_mwh]  required for `down`: what the energy would have cost
 * @param {'up'|'down'} o.direction
 * @param {number} [o.hours_per_year]
 */
export function afrrActivationRevenue({
  committed_mw, activation_rate, energy_per_mw_per_activated_h, price_eur_mwh,
  da_charge_price_eur_mwh, direction, hours_per_year = 8760,
}) {
  if (direction !== 'up' && direction !== 'down') throw new Error(`afrrActivationRevenue: direction must be 'up' or 'down', got ${direction}`);
  if (!(activation_rate >= 0 && activation_rate <= 1)) {
    throw new Error(`afrrActivationRevenue: activation_rate must be a fraction in [0,1], got ${activation_rate}. A "rate" above 1 is a count over the wrong denominator, not a busy market.`);
  }
  const activated_h = hours_per_year * activation_rate;
  const energy_mwh = committed_mw * energy_per_mw_per_activated_h * activated_h;

  if (direction === 'up') {
    // Delivered energy, paid at the activation price. The energy has to be bought back later; that
    // cost belongs to the arbitrage line and to the SoC constraint, not here — attributing it twice
    // is how 36.B1 produced a net-negative activation line.
    return { energy_mwh, revenue: energy_mwh * price_eur_mwh, unit_value_eur_mwh: price_eur_mwh, direction };
  }

  if (!Number.isFinite(da_charge_price_eur_mwh)) {
    throw new Error('afrrActivationRevenue: down-activation needs da_charge_price_eur_mwh — its value is the charging cost it avoids, which is undefined without the price it is avoiding.');
  }
  // Absorbed energy. Value = what the same MWh would have cost on the day-ahead, less what taking
  // it via down-activation costs. Signed on purpose: a down price above the day-ahead is a real
  // cost and the model must be able to say so.
  const unit = da_charge_price_eur_mwh - price_eur_mwh;
  return { energy_mwh, revenue: energy_mwh * unit, unit_value_eur_mwh: unit, direction };
}
