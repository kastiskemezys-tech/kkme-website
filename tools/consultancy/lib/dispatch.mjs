/**
 * Chronological hourly dispatch engine — Phase 36.B1
 *
 * Simulates a battery hour by hour through a full calendar year, carrying state
 * continuously, and proves that a revenue stack is *simultaneously* achievable
 * rather than merely available in aggregate. That distinction is the whole
 * point: the shipped `/revenue` engine allocates MW-hours across products by
 * time share, which cannot express the constraint that committing reserve MW
 * also reserves the state of charge needed to deliver on it.
 *
 * ── Policy: conservative greedy, deliberately not an LP ────────────────────
 *
 * A linear-programming co-optimiser would claim more revenue than a real BRP
 * contract delivers, and it cannot be audited line by line. This engine follows
 * a fixed priority order — contracted reserve obligations first, then merchant
 * day-ahead arbitrage on whatever MW and SoC remain — which is both what an
 * operator actually does and something a lender's advisor can read and check.
 * Its conservatism is a feature in front of a credit committee.
 *
 * Every ambiguous call resolves toward LESS claimed revenue:
 *
 *   · Activation energy is taken at its expected value, never optimised against.
 *   · Charge/discharge thresholds are same-day quartiles of the day-ahead curve,
 *     known only after the auction clears — the policy never sees the future.
 *   · When a reserve commitment and its SoC reservation conflict, the committed
 *     MW is cut. The reservation is never relaxed.
 *   · Charging in negative-price hours is credited at €0, not as income.
 *   · The cycle-budget throttle suppresses merchant revenue only. It is a
 *     backstop, not an operating strategy: on the reference asset against real
 *     2024 prices it never engages (221 EFC against a 730 cap). It also has a
 *     second-order effect worth knowing about — reserve commitment needs SoC
 *     headroom, and SoC is maintained by cycling, so throttling merchant cycles
 *     indirectly starves the contracted stack too. Pinned by test; carried to
 *     36.B6's known-limitations list rather than engineered around.
 *
 *     Contracted reserve obligations are never throttled directly — so in the
 *     pathological case
 *     where contracted activation energy alone exceeds the warranty budget, the
 *     cap is breached by contracted operation and `cycles.breached_by_contracted`
 *     says so. Silently curtailing a contracted obligation to protect a warranty
 *     would be modelling a commercial decision the operator has not made.
 *
 * ── What is measured and what is assumed ──────────────────────────────────
 *
 * KNOWN LIMITATION — activation is modelled UP-ONLY. Committed reserve MW is
 * assumed to be called in the up direction, draining SoC and requiring the
 * energy to be bought back on the day-ahead market. Real aFRR is symmetric: a
 * down-activation charges the battery and is generally paid for, which is both
 * an energy benefit and a revenue one. The KV `trading:<date>:raw` archive
 * carries separate `afrr_up` / `afrr_dn` prices, so the asymmetry is visible in
 * the data and simply is not modelled yet.
 *
 * The consequence is material and points one way: with the engine's canonical
 * throughput anchor treated wholly as up-drain, and activation priced at the
 * observed p50 (€13.5/MWh aFRR, €14.5/MWh mFRR — a heavily skewed distribution
 * whose monthly means run several times higher), the activation line comes out
 * NET NEGATIVE once its share of charging cost is attributed to it. That is a
 * conservative artefact of an incomplete model, NOT a finding that activation
 * destroys value, and it must not be reported as one. Closing it — down-
 * activation, and a distribution rather than a p50 — is 36.B3/36.B5 work.
 *
 * Day-ahead prices are real, hourly, and per-year (ENTSO-E A44, committed to
 * `tools/consultancy/data/`). Reserve capacity and activation prices are held
 * flat across the year, because no multi-year sub-daily Baltic reserve-price
 * series exists — Pause A established that BTD is the sole source, that it holds
 * 110 daily points, and that it is currently offline. Phase 36.B3 therefore
 * measures a day-ahead realisation and leaves the reserve realisation assumed,
 * with the boundary stated (operator decision D3). `summary.basis` carries that
 * split into every output file so no downstream reader can lose it.
 *
 * Rule #4: every physical constant — RTE, SOH, reserve shares and their
 * prequalification energy requirements, cycle accounting, activation rates — is
 * imported from `workers/fetch-s1.js`. Nothing here restates engine maths.
 */

import {
  RESERVE_PRODUCTS,
  RTE_BOL,
  rteCurveFor,
  sohYr,
} from '../../../workers/fetch-s1.js';

/** SoC operating window as a fraction of usable (SOH-derated) energy. */
export const SOC_MIN_FRAC = 0.05;
export const SOC_MAX_FRAC = 0.95;

/** Manufacturer base warranty cap — mirrors `warrantyStatusFor` (:1307). */
export const DEFAULT_WARRANTY_EFC_YR = 730;

/** Commitment order: strictest prequalification first. */
export const COMMIT_ORDER = ['fcr', 'afrr', 'mfrr'];

/**
 * Deterministic PRNG (mulberry32). Outage draws must be reproducible — a run
 * registry that cannot reproduce its own availability pattern is not auditable
 * (arc doc 36.B6).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build the availability mask for a year.
 *
 * The scenario's `avail` (0.97 base) is a 3 % haircut. Splitting it into one
 * contiguous planned-maintenance outage plus scattered forced outages matters
 * for a chronological model in a way it does not for an annual one: a
 * multi-day planned outage removes a *block* of price shape, and if that block
 * lands on a high-spread week the revenue loss exceeds the MW-hour share.
 * Modelling it as a block rather than as a flat derate is the conservative and
 * physically honest choice.
 */
export function buildAvailability(hours, avail, seed) {
  const mask = new Array(hours).fill(true);
  const unavailable = Math.round(hours * (1 - avail));
  if (unavailable <= 0) return { mask, planned_hours: 0, forced_hours: 0, planned_start: null };

  const rnd = mulberry32(seed);
  // Half the downtime as one planned block, half scattered as forced outages.
  const plannedLen = Math.floor(unavailable / 2);
  const forcedLen = unavailable - plannedLen;

  // Planned maintenance placed in the low-value season rather than at random:
  // an operator schedules it deliberately. Northern-hemisphere summer trough.
  const plannedStart = Math.floor(hours * (0.45 + rnd() * 0.1));
  for (let i = 0; i < plannedLen; i++) {
    const h = (plannedStart + i) % hours;
    mask[h] = false;
  }

  let placed = 0;
  let guard = 0;
  while (placed < forcedLen && guard < forcedLen * 100) {
    guard++;
    const h = Math.floor(rnd() * hours);
    if (mask[h]) {
      mask[h] = false;
      placed++;
    }
  }

  return {
    mask,
    planned_hours: plannedLen,
    forced_hours: placed,
    planned_start: plannedStart,
  };
}

/** 25th / 75th percentile of a day's prices — the merchant trigger thresholds. */
function dayThresholds(prices, from, to) {
  const day = [];
  for (let h = from; h < to; h++) {
    if (prices[h] != null) day.push(prices[h]);
  }
  if (day.length < 8) return null;
  day.sort((a, b) => a - b);
  return {
    charge: day[Math.floor(day.length * 0.25)],
    discharge: day[Math.floor(day.length * 0.75)],
  };
}

/**
 * Simulate one chronological year.
 *
 * @param {object} o
 * @param {object} o.config      project config (mw, mwh, duration_h, …)
 * @param {number[]} o.prices    hourly day-ahead prices, EUR/MWh, index 0 = Jan 1 00:00 UTC
 * @param {number} o.yearIndex   projection year, 1-based (drives SOH and RTE)
 * @param {object} o.reserve     flat reserve prices / volumes / activation rates
 * @param {object} o.sc          scenario constants from REVENUE_SCENARIOS
 * @param {object} [o.opts]      { drr_active, warranty_efc_yr, poi_export_mw, poi_import_mw, seed, keepHours }
 */
export function simulateYear({ config, prices, yearIndex, reserve, sc, opts = {} }) {
  const hours = prices.length;
  const mw = config.mw;
  const dur_h = config.duration_h ?? config.mwh / config.mw;
  const nameplateMwh = config.mwh;

  const drrActive = opts.drr_active !== false;
  const warrantyCap = opts.warranty_efc_yr ?? config.warranty_efc_yr ?? DEFAULT_WARRANTY_EFC_YR;
  const poiExport = opts.poi_export_mw ?? config.grid_allowance_mw ?? mw;
  const poiImport = opts.poi_import_mw ?? config.grid_allowance_mw ?? mw;
  const keepHours = opts.keepHours !== false;
  const enforceReserveEnergy = opts.enforce_reserve_energy !== false;
  // Annual anchors are per YEAR. A run over a window shorter than a year must
  // still pro-rate against a year, never against the window.
  const hoursPerYear = opts.hours_per_year ?? (hours >= 8000 ? hours : 8760);

  // ── Year-dependent physics, imported not restated (rule #4) ──────────────
  // total_cd drives the SOH curve blend; it is the cycle depth per day the
  // throughput accounting implies for this asset.
  const cdTotal = opts.total_cd ?? 1.0;
  const soh = sohYr(yearIndex, cdTotal);
  const rteCurve = rteCurveFor(dur_h, Math.max(yearIndex + 1, 18), opts.rte_decay);
  const rte = rteCurve[Math.min(yearIndex - 1, rteCurve.length - 1)] ?? RTE_BOL.h2;

  const usableMwh = nameplateMwh * soh;
  const socMin = usableMwh * SOC_MIN_FRAC;
  const socMax = usableMwh * SOC_MAX_FRAC;

  const seed = hashSeed(`${config.project_id ?? 'asset'}:${yearIndex}:${opts.seed ?? 0}`);
  const avail = buildAvailability(hours, sc.avail, seed);

  // ── Accumulators ─────────────────────────────────────────────────────────
  let soc = usableMwh * 0.5;
  const socStart = soc;
  let energyIn = 0;        // MWh drawn from grid (charging)
  let energyOut = 0;       // MWh delivered to grid (merchant discharge)
  let energyAct = 0;       // MWh delivered as activation energy
  let efcUsed = 0;
  let revCapacity = 0, revActivation = 0, revArbitrage = 0, costCharging = 0;
  const revByProduct = { fcr: 0, afrr: 0, mfrr: 0 };
  const mwhByProduct = { fcr: 0, afrr: 0, mfrr: 0, da: 0 };
  let committedMwH = { fcr: 0, afrr: 0, mfrr: 0 };
  let chargeHours = 0, dischargeHours = 0, negChargeHours = 0, throttledHours = 0;
  let unavailableHours = 0;
  const violations = [];
  const rows = keepHours ? [] : null;

  let thresholds = null;

  for (let h = 0; h < hours; h++) {
    if (h % 24 === 0) thresholds = dayThresholds(prices, h, Math.min(h + 24, hours));

    const price = prices[h];
    const available = avail.mask[h];

    // ── Step 0: availability ───────────────────────────────────────────────
    if (!available || price == null) {
      unavailableHours += available ? 0 : 1;
      if (keepHours) {
        rows.push({ h, price, available, soc, action: 'unavailable', mw_fcr: 0, mw_afrr: 0, mw_mfrr: 0, rev: 0 });
      }
      continue;
    }

    // ── Step 1: reserve commitment, with energy reservation ────────────────
    const committed = { fcr: 0, afrr: 0, mfrr: 0 };
    let needUp = 0;
    let needDown = 0;
    let mwLeft = mw;
    let hourCapRev = 0;

    for (const p of COMMIT_ORDER) {
      if (p === 'fcr' && drrActive) continue; // DRR derogation: no FCR until 2028
      const spec = RESERVE_PRODUCTS[p];
      const ceiling = Math.min(
        mw * spec.share,
        reserve.avail_mw?.[p] ?? Infinity,
        mwLeft
      );
      if (!(ceiling > 0)) continue;

      // Committed MW implies SoC headroom in BOTH directions: enough energy to
      // deliver an up-activation, and enough empty capacity to absorb a
      // down-activation, for the product's prequalification duration.
      //
      // `enforce_reserve_energy: false` disables exactly this constraint and
      // nothing else. Running the same year both ways isolates what the
      // simultaneity requirement costs — which is the one quantity the
      // time-allocation model structurally cannot express, and therefore the
      // phase's headline measurement. It is a measurement mode, never a
      // delivery mode: no client number is ever produced with it off.
      const perMw = enforceReserveEnergy ? spec.dur_req_h : 0;
      const roomUp = Math.max(0, soc - socMin - needUp);
      const roomDown = Math.max(0, socMax - soc - needDown);
      const mwByUp = perMw > 0 ? roomUp / perMw : Infinity;
      const mwByDown = perMw > 0 ? roomDown / perMw : Infinity;

      // The reservation is never relaxed — the commitment is cut instead.
      const mwP = Math.max(0, Math.min(ceiling, mwByUp, mwByDown));
      if (!(mwP > 0)) continue;

      committed[p] = mwP;
      needUp += mwP * perMw;
      needDown += mwP * perMw;
      mwLeft -= mwP;

      const capPriceP = reserve.cap_price?.[p] ?? 0;
      const acc = reserve.acceptance?.[p] ?? 1;
      const r = mwP * capPriceP * acc;
      hourCapRev += r;
      revByProduct[p] += r;
      committedMwH[p] += mwP;
    }

    revCapacity += hourCapRev;

    // ── Step 2: expected activation energy ─────────────────────────────────
    //
    // Energy comes from the engine's canonical throughput anchors
    // (`mwh_per_mw_yr_*`), NOT from `act_rate_*`. The two are different
    // calibrations and conflating them is a real trap: `act_rate` is a revenue
    // coefficient in `computeTradingMix`, while `mwh_per_mw_yr_*` is the energy
    // quantity `computeThroughputBreakdown` uses to derive cycles. Driving SoC
    // drain from the revenue coefficient overstated activation energy roughly
    // 4.6× on the first run of this engine and inverted the charge/discharge
    // balance. Energy is an energy question (rule #4).
    //
    // MWh per MW per year, applied pro rata to the MW actually committed this
    // hour, is dimensionally exact and introduces no new assumption.
    let hourActRev = 0;
    let actEnergy = 0;
    for (const p of ['fcr', 'afrr', 'mfrr']) {
      const mwP = committed[p];
      if (!(mwP > 0)) continue;
      const mwhPerMwYr = reserve.mwh_per_mw_yr?.[p] ?? 0;
      // Divided by hours in a YEAR, not by the length of the array being
      // simulated. Dividing by `hours` silently inflated activation energy on
      // every sub-year run — a 90-day window got a full year's energy spread
      // over 2 160 hours, 4× too much. Phase 36.B3 replays day by day, so this
      // would have corrupted the backtest with no visible symptom.
      const e = (mwhPerMwYr * mwP) / hoursPerYear;
      if (!(e > 0)) continue;
      actEnergy += e;
      const actPriceP = reserve.act_price?.[p] ?? 0;
      const r = e * actPriceP;
      hourActRev += r;
      revByProduct[p] += r;
      mwhByProduct[p] += e;
    }

    // Activation draws SoC. If the step-1 reservation was correctly sized this
    // cannot breach the floor; the clamp is a guard, and any use of it is a
    // recorded violation rather than a silent correction.
    if (soc - actEnergy < socMin - 1e-9) {
      violations.push({ hour: h, kind: 'activation_below_soc_min', soc, actEnergy });
      actEnergy = Math.max(0, soc - socMin);
    }
    soc -= actEnergy;
    energyAct += actEnergy;
    revActivation += hourActRev;

    // ── Step 4 (governor, evaluated before merchant action) ────────────────
    // Project the current cycling pace to a full year. If it would breach the
    // warranty cap, suppress merchant cycling — never the contracted stack.
    // Contracted activation has already been booked above and is not reversible
    // here; that asymmetry is deliberate and is reported, not hidden.
    const paceEfc = efcUsed / (h + 1) * hours;
    const throttled = efcUsed >= warrantyCap || paceEfc > warrantyCap;
    if (throttled) throttledHours++;

    // ── Step 3: residual day-ahead arbitrage ───────────────────────────────
    const mwFree = Math.max(0, mwLeft);
    const headroomUp = Math.max(0, soc - socMin - needUp);
    const headroomDown = Math.max(0, socMax - soc - needDown);

    let action = 'hold';
    let hourArbRev = 0;
    let eIn = 0;
    let eOut = 0;

    if (!throttled && thresholds && mwFree > 0) {
      // Only buy energy the day's own price shape can sell at a profit. Round
      // trip: 1 MWh bought yields `rte` MWh sellable, so the trip clears when
      // `discharge_threshold × rte > price`. This uses same-day, post-auction
      // information only — exactly what a real BRP holds — and adds no
      // foresight. Without it the policy charged in the cheap quartile
      // unconditionally and booked losses on days whose spread never covered
      // the round-trip loss, which is not conservatism but a modelling error.
      const roundTripClears = thresholds.discharge * rte > price;

      if (price <= thresholds.charge && headroomDown > 0 && roundTripClears) {
        // Charge. RTE loss is charged once, on the charge leg.
        eIn = Math.min(mwFree, poiImport, headroomDown / rte);
        if (eIn > 0) {
          soc += eIn * rte;
          // Negative prices are conservatively credited at €0, not as income.
          const paid = Math.max(0, price) * eIn;
          costCharging += paid;
          hourArbRev = -paid;
          energyIn += eIn;
          chargeHours++;
          if (price < 0) negChargeHours++;
          action = 'charge';
        }
      } else if (price >= thresholds.discharge && headroomUp > 0 && price > 0) {
        // Never discharge below €0.
        eOut = Math.min(mwFree, poiExport, headroomUp);
        if (eOut > 0) {
          soc -= eOut;
          hourArbRev = eOut * price;
          energyOut += eOut;
          mwhByProduct.da += eOut;
          dischargeHours++;
          action = 'discharge';
        }
      }
    }
    revArbitrage += hourArbRev;

    // ── Step 4 (accounting): equivalent full cycles ────────────────────────
    // One EFC = one full charge + discharge of usable energy. Throughput in
    // both directions is halved so a round trip counts once.
    efcUsed += (eIn * rte + eOut + actEnergy) / (2 * Math.max(usableMwh, 1e-9));

    // ── Step 5: invariants ─────────────────────────────────────────────────
    if (soc < socMin - 1e-6 || soc > socMax + 1e-6) {
      violations.push({ hour: h, kind: 'soc_out_of_bounds', soc, socMin, socMax });
    }
    const totalCommitted = committed.fcr + committed.afrr + committed.mfrr;
    if (totalCommitted + mwFree > mw + 1e-6) {
      violations.push({ hour: h, kind: 'power_over_nameplate', totalCommitted, mwFree, mw });
    }
    if (eIn > poiImport + 1e-6 || eOut > poiExport + 1e-6) {
      violations.push({ hour: h, kind: 'poi_limit_exceeded', eIn, eOut, poiImport, poiExport });
    }

    if (keepHours) {
      rows.push({
        h,
        price,
        available: true,
        soc,
        soc_pct: usableMwh > 0 ? soc / usableMwh : 0,
        action,
        throttled,
        mw_fcr: committed.fcr,
        mw_afrr: committed.afrr,
        mw_mfrr: committed.mfrr,
        mwh_charge: eIn,
        mwh_discharge: eOut,
        mwh_activation: actEnergy,
        rev_capacity: hourCapRev,
        rev_activation: hourActRev,
        rev_arbitrage: hourArbRev,
        efc_used: efcUsed,
      });
    }
  }

  // ── Energy balance ───────────────────────────────────────────────────────
  // Exact identity: everything charged in, after round-trip losses, either left
  // the battery or is still sitting in it.
  const balanceLhs = energyIn * rte;
  const balanceRhs = energyOut + energyAct + (soc - socStart);
  const balanceError = balanceLhs - balanceRhs;

  const grossRevenue = revCapacity + revActivation + revArbitrage;

  // ── Charging-cost attribution ────────────────────────────────────────────
  // Stored energy leaves the battery two ways: sold on the day-ahead market, or
  // delivered as activation energy. Both were paid for on the same charge legs,
  // so booking the entire charging cost against arbitrage understates the
  // arbitrage line and overstates activation. The raw lines are kept — this is
  // an additional view, not a restatement — but the allocated one is what a
  // bridge should use, because it makes each line independently interpretable.
  const deliveredMwh = energyOut + energyAct;
  const costPerDeliveredMwh = deliveredMwh > 0 ? costCharging / deliveredMwh : 0;
  const costToArbitrage = energyOut * costPerDeliveredMwh;
  const costToActivation = energyAct * costPerDeliveredMwh;
  const dischargeIncome = revArbitrage + costCharging; // revArbitrage is already net of all charging

  return {
    meta: {
      project_id: config.project_id ?? null,
      year_index: yearIndex,
      hours,
      mw,
      mwh_nameplate: nameplateMwh,
      dur_h,
      soh,
      usable_mwh: usableMwh,
      rte,
      soc_window_mwh: [socMin, socMax],
      warranty_efc_yr: warrantyCap,
      drr_active: drrActive,
      enforce_reserve_energy: enforceReserveEnergy,
      poi_export_mw: poiExport,
      poi_import_mw: poiImport,
      availability: {
        target: sc.avail,
        realised: (hours - unavailableHours) / hours,
        planned_hours: avail.planned_hours,
        forced_hours: avail.forced_hours,
        planned_start_hour: avail.planned_start,
      },
    },
    basis: {
      day_ahead: 'measured — ENTSO-E A44 hourly, this calendar year',
      reserve_prices: 'assumed — held flat; no multi-year sub-daily Baltic reserve series exists (Pause A §1.5)',
      activation_energy: 'canonical throughput anchors (mwh_per_mw_yr_*), expected value, not stochastic',
      activation_direction:
        'UP-ONLY — down-activation is not modelled. Conservative: it drains SoC and buys energy back, ' +
        'while the paid, SoC-filling down direction is omitted. The negative attributed activation line ' +
        'is an artefact of this, not a finding. See 36.B3/36.B5.',
      activation_price:
        'observed p50 of a heavily skewed distribution — monthly means run several times higher',
      note: 'Operator decision D3: day-ahead realisation is measurable, reserve realisation is not.',
    },
    revenue: {
      capacity: revCapacity,
      activation: revActivation,
      arbitrage: revArbitrage,
      gross: grossRevenue,
      charging_cost: costCharging,
      by_product: revByProduct,
      per_mw_yr: grossRevenue / mw,
      // Same total, split so each line carries its own share of the energy it
      // consumed. `gross` is unchanged by construction.
      attributed: {
        capacity: revCapacity,
        activation_net: revActivation - costToActivation,
        arbitrage_net: dischargeIncome - costToArbitrage,
        discharge_income: dischargeIncome,
        cost_to_activation: costToActivation,
        cost_to_arbitrage: costToArbitrage,
        cost_per_delivered_mwh: costPerDeliveredMwh,
        check_sums_to_gross:
          revCapacity + (revActivation - costToActivation) + (dischargeIncome - costToArbitrage),
      },
    },
    energy: {
      charged_mwh: energyIn,
      discharged_mwh: energyOut,
      activation_mwh: energyAct,
      throughput_by_product_mwh: mwhByProduct,
      soc_start_mwh: socStart,
      soc_end_mwh: soc,
      balance_lhs: balanceLhs,
      balance_rhs: balanceRhs,
      balance_error_mwh: balanceError,
      balance_error_rel: balanceLhs > 0 ? Math.abs(balanceError) / balanceLhs : 0,
    },
    cycles: {
      efc_used: efcUsed,
      efc_merchant: (energyIn * rte + energyOut) / (2 * Math.max(usableMwh, 1e-9)),
      efc_contracted: energyAct / (2 * Math.max(usableMwh, 1e-9)),
      warranty_cap: warrantyCap,
      headroom_efc: warrantyCap - efcUsed,
      throttled_hours: throttledHours,
      // True only when contracted activation alone overruns the budget — the
      // one case the throttle cannot prevent, surfaced rather than clamped.
      breached_by_contracted:
        efcUsed > warrantyCap && energyAct / (2 * Math.max(usableMwh, 1e-9)) > warrantyCap,
    },
    commitment: {
      avg_mw_fcr: committedMwH.fcr / hours,
      avg_mw_afrr: committedMwH.afrr / hours,
      avg_mw_mfrr: committedMwH.mfrr / hours,
      avg_mw_total: (committedMwH.fcr + committedMwH.afrr + committedMwH.mfrr) / hours,
      avg_reserve_share: (committedMwH.fcr + committedMwH.afrr + committedMwH.mfrr) / hours / mw,
    },
    activity: {
      charge_hours: chargeHours,
      discharge_hours: dischargeHours,
      negative_price_charge_hours: negChargeHours,
      unavailable_hours: unavailableHours,
    },
    violations,
    hours_detail: rows,
  };
}
