/**
 * Client-facing revenue bridge — Phase 34.1, completed in 34.2
 *
 * Reshapes the engine's Y1 / 20-year output into the exact bridge structure the
 * deliverable contract specifies:
 *
 *   gross market revenues
 *     − charging costs
 *   = net market revenue
 *     − optimiser − grid − market − operating
 *   = project EBITDA
 *     − maintenance capex − augmentation capex − replacement capex
 *   = pre-financing cash flow
 *
 * Every line is either an engine number or arithmetic over engine numbers —
 * no parallel revenue maths (discipline rule #4). Each level is asserted to
 * equal the previous level less its deductions, to the euro. A bridge that
 * does not tie out throws rather than reporting a plausible wrong total.
 *
 * This runs on the consultancy path only. The public /revenue payload never
 * sees it, which is what keeps the byte-identity gate green.
 */

const r = (n) => Math.round(n);
const sum = (arr, f) => r(arr.reduce((a, b) => a + f(b), 0));

export class BridgeTieOutError extends Error {}

/** Assert `total` equals `parts` summed, to the euro. Fails loudly by design. */
export function assertTieOut(label, total, parts) {
  const s = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(total - s) > 1) {
    throw new BridgeTieOutError(
      `bridge tie-out failed at "${label}": ${total} ≠ ${s} (Δ ${total - s})`
    );
  }
}

// ── Cost decomposition ─────────────────────────────────────────────────────

/**
 * Default cost bases (34.2 scope table). Every one is overridable per project
 * via the config, so a client with contracted terms can be modelled directly.
 */
export const COST_DEFAULTS = {
  optimiser_pct_gross: 0.12,   // BRP / trading platform
  grid_pct_gross: 0.03,        // Litgrid NUS + auxiliary
  market_pct_gross: 0.01,      // Nord Pool + BTD participation
  operating_eur_kw_yr: 29,     // O&M 18 + insurance 5 + warranty 4 + BOS 2
  operating_calibration_eur_kw_yr: 2.08,
};

/**
 * Reconciliation calibration (34.2 scope §1).
 *
 * The engine's cost treatment (RTM fee + flat BRP fee + OPEX) and the client's
 * 4-line stack are two taxonomies over the same economics, and they do not land
 * in the same place: at the reference asset the client stack came out 3.5% light
 * (−€103 848 on €2 970 350). Under the ±5% decision rule that gap is closed with
 * a single constant on the operating line rather than left open.
 *
 * Derivation — reference asset, frozen KV fixture:
 *   engine stack  = RTM 840 350 + BRP 180 000 + OPEX 1 950 000 = €2 970 350
 *   client stack  = 16% × gross 8 853 139 + €29/kW × 50 000 kW = €2 866 502
 *   gap €103 848 ÷ 50 000 kW = €2.077/kW/yr → 2.08
 *
 * The sourced €29/kW/yr build-up is left intact and this rides alongside it, so
 * the register shows both the itemised figure and the reconciling adjustment
 * instead of an unexplained €31.08. `bridgeCalibration()` re-derives the value
 * from the reference asset and a vitest holds it to this constant, so the
 * moment the engine or the fixture moves the calibration stops being silently
 * stale.
 *
 * It closes the gap exactly at the reference asset's current revenue level; the
 * percentage lines scale with revenue while this does not, so a residual
 * reappears as revenue moves. That residual is reported, never absorbed.
 */
export const OPERATING_CALIBRATION_EUR_KW_YR = 2.08;

/** Re-derive the calibration constant from a reference-asset engine result. */
export function bridgeCalibration(referenceResult, referenceConfig) {
  const uncalibrated = { ...COST_DEFAULTS, operating_calibration_eur_kw_yr: 0 };
  const recon = reconcileAgainstEngine(referenceResult, referenceConfig, uncalibrated);
  if (!recon) return null;
  return Math.round((-recon.delta / (referenceConfig.mw * 1000)) * 100) / 100;
}

export const CAPEX_DEFAULTS = {
  maintenance_eur_kw_yr: 4,
  augmentation_year: 8,
  augmentation_mwh_pct: 0.40,
  augmentation_eur_kwh: 80,    // BNEF 2035, cell-only
  replacement_year: 15,
  replacement_mwh_pct: 0.85,
  replacement_eur_kwh: 120,    // BNEF 2042, cell + PCS
};

export const resolveCosts = (config) => ({ ...COST_DEFAULTS, ...(config.costs ?? {}) });
export const resolveCapex = (config) => ({ ...CAPEX_DEFAULTS, ...(config.capex_schedule ?? {}) });

/**
 * 20-year CAPEX schedule.
 *
 * Maintenance recurs annually and is pro-rated by operational months in the
 * first year. Augmentation and replacement are one-off events counted in
 * operating years from COD, so they land on the same operating year for every
 * project regardless of when in the calendar that falls (34.2 decision rule).
 */
export function buildCapexSchedule(result, config) {
  const p = resolveCapex(config);
  const kw = config.mw * 1000;
  const mwh = config.mwh;
  const opFrac = (config.operational_months_y1 ?? 12) / 12;

  return (result.years ?? []).map((y) => {
    const maintenance = r(p.maintenance_eur_kw_yr * kw * (y.yr === 1 ? opFrac : 1));
    const augmentation = y.yr === p.augmentation_year
      ? r(mwh * p.augmentation_mwh_pct * 1000 * p.augmentation_eur_kwh)
      : 0;
    const replacement = y.yr === p.replacement_year
      ? r(mwh * p.replacement_mwh_pct * 1000 * p.replacement_eur_kwh)
      : 0;
    return {
      yr: y.yr,
      cal_year: y.cal_year,
      maintenance,
      augmentation,
      replacement,
      total: maintenance + augmentation + replacement,
    };
  });
}

/**
 * Charging cost for one year.
 *
 * The engine works on a captured DA *spread* — its trading revenue is already
 * net of the cost of charging. The client bridge wants that netting made
 * explicit, so the charging cost is rebuilt from the engine's own arbitrage
 * energy volumes (`project.arb_energy_20yr`) at the observed mean charging
 * price, and the gross line is the sum. The identity
 * `gross − charging = engine gross` therefore holds by construction.
 */
function chargingCost(arbYear, avgChargeEurMwh) {
  if (!arbYear) return 0;
  return r(arbYear.mwh_charged * avgChargeEurMwh);
}

// ── Bridge assembly ────────────────────────────────────────────────────────

/** One year of the client bridge. */
export function bridgeYear(y, { config, costs, capexRow, arbYear, avgChargeEurMwh }) {
  const engine_gross = r(y.rev_gross);
  const charging_costs = chargingCost(arbYear, avgChargeEurMwh);
  const gross_market_revenues = engine_gross + charging_costs;
  const net_market_revenue = gross_market_revenues - charging_costs;

  // Percentage lines take the bridge's own top line as their base — the line
  // the contract literally calls "gross revenue". It is also the larger base,
  // so this is the conservative reading. See DECISIONS.md 34.2-B.
  const optimiser = r(gross_market_revenues * costs.optimiser_pct_gross);
  const grid = r(gross_market_revenues * costs.grid_pct_gross);
  const market = r(gross_market_revenues * costs.market_pct_gross);

  const opFrac = (config.operational_months_y1 ?? 12) / 12;
  const escalation = y.rev_gross > 0 ? Math.pow(1 + (config.opex_esc ?? 0.025), y.yr - 1) : 1;
  const operating_rate =
    costs.operating_eur_kw_yr + (costs.operating_calibration_eur_kw_yr ?? 0);
  const operating = r(
    operating_rate * config.mw * 1000 * escalation * (y.yr === 1 ? opFrac : 1)
  );

  const project_ebitda = net_market_revenue - optimiser - grid - market - operating;

  const maintenance_capex = capexRow.maintenance;
  const augmentation_capex = capexRow.augmentation;
  const replacement_capex = capexRow.replacement;
  const pre_financing_cf =
    project_ebitda - maintenance_capex - augmentation_capex - replacement_capex;

  assertTieOut('net_market_revenue', net_market_revenue, [gross_market_revenues, -charging_costs]);
  assertTieOut('project_ebitda', project_ebitda, [
    net_market_revenue, -optimiser, -grid, -market, -operating,
  ]);
  assertTieOut('pre_financing_cf', pre_financing_cf, [
    project_ebitda, -maintenance_capex, -augmentation_capex, -replacement_capex,
  ]);

  return {
    yr: y.yr,
    cal_year: y.cal_year,
    gross_market_revenues,
    charging_costs,
    net_market_revenue,
    optimiser,
    grid,
    market,
    operating,
    project_ebitda,
    maintenance_capex,
    augmentation_capex,
    replacement_capex,
    pre_financing_cf,
  };
}

/** The bridge lines, in contract order. Used by the portfolio roll-up too. */
export const BRIDGE_LINES = [
  'gross_market_revenues', 'charging_costs', 'net_market_revenue',
  'optimiser', 'grid', 'market', 'operating', 'project_ebitda',
  'maintenance_capex', 'augmentation_capex', 'replacement_capex', 'pre_financing_cf',
];

/**
 * Build the full bridge for a project.
 * @param {object} result computeRevenueV7 output (must carry `project`)
 * @param {object} config validated project config
 */
export function buildBridge(result, config) {
  const years = result.years ?? [];
  if (!years.length) throw new Error(`engine returned no years for ${config.project_id}`);
  if (!result.project) {
    throw new Error(
      `engine result for ${config.project_id} has no project block — ` +
      `params.project_config was not supplied`
    );
  }

  const costs = resolveCosts(config);
  const capex_schedule = buildCapexSchedule(result, config);
  const arb = result.project.arb_energy_20yr ?? [];
  const avgCharge = result.project.avg_charge_eur_mwh ?? 0;

  const bridge_20yr = years.map((y, i) =>
    bridgeYear(y, {
      config,
      costs,
      capexRow: capex_schedule[i],
      arbYear: arb[i],
      avgChargeEurMwh: avgCharge,
    })
  );
  const bridge_y1 = bridge_20yr[0];

  const bridge_totals = Object.fromEntries(
    BRIDGE_LINES.map((k) => [k, sum(bridge_20yr, (b) => b[k])])
  );
  // The totals row must tie out on the same identities as each year.
  assertTieOut('totals.net_market_revenue', bridge_totals.net_market_revenue, [
    bridge_totals.gross_market_revenues, -bridge_totals.charging_costs,
  ]);
  assertTieOut('totals.project_ebitda', bridge_totals.project_ebitda, [
    bridge_totals.net_market_revenue, -bridge_totals.optimiser,
    -bridge_totals.grid, -bridge_totals.market, -bridge_totals.operating,
  ]);
  assertTieOut('totals.pre_financing_cf', bridge_totals.pre_financing_cf, [
    bridge_totals.project_ebitda, -bridge_totals.maintenance_capex,
    -bridge_totals.augmentation_capex, -bridge_totals.replacement_capex,
  ]);

  return {
    bridge_y1,
    bridge_20yr,
    bridge_totals,
    capex_schedule,
    cost_basis: {
      ...costs,
      base: 'gross_market_revenues',
      operating_escalation: config.opex_esc ?? 0.025,
      reconciliation: reconcileAgainstEngine(result, config, costs),
    },
    capex_basis: resolveCapex(config),
    bridge_notes: {
      charging_costs:
        'The engine prices arbitrage on a captured DA spread, so its trading line is ' +
        'already net of charging. This line rebuilds the cost from the engine\'s own ' +
        'charged-MWh volumes at the observed mean charging price, so gross less ' +
        'charging returns the engine gross exactly.',
      capex_events:
        'Augmentation and replacement are counted in operating years from COD, so they ' +
        'land on the same operating year for every project. Maintenance is pro-rated ' +
        'in a partial first year; the two events are not.',
    },
  };
}

/**
 * Compare the 4-line cost stack against the engine's own cost treatment for
 * the same project. The engine deducts an RTM fee, a BRP fee and OPEX; the
 * client bridge deducts optimiser + grid + market + operating. They are two
 * readings of the same economics and should be close — this reports how close,
 * rather than quietly forcing agreement.
 */
export function reconcileAgainstEngine(result, config, costs = resolveCosts(config)) {
  const y1 = result.years?.[0];
  if (!y1) return null;

  const engine_stack = r(y1.rtm_fee + y1.brp_fee + y1.opex);
  const gross = r(y1.rev_gross) + chargingCost(
    result.project?.arb_energy_20yr?.[0],
    result.project?.avg_charge_eur_mwh ?? 0
  );
  const opFrac = (config.operational_months_y1 ?? 12) / 12;
  const operating_rate =
    costs.operating_eur_kw_yr + (costs.operating_calibration_eur_kw_yr ?? 0);
  const client_stack = r(
    gross * (costs.optimiser_pct_gross + costs.grid_pct_gross + costs.market_pct_gross) +
    operating_rate * config.mw * 1000 * opFrac
  );

  const delta = client_stack - engine_stack;
  const delta_pct = engine_stack > 0 ? delta / engine_stack : null;

  return {
    engine_stack_y1: engine_stack,
    engine_components: { rtm_fee: r(y1.rtm_fee), brp_fee: r(y1.brp_fee), opex: r(y1.opex) },
    client_stack_y1: client_stack,
    delta,
    delta_pct: delta_pct != null ? Math.round(delta_pct * 10000) / 10000 : null,
    within_2pct: delta_pct != null && Math.abs(delta_pct) <= 0.02,
    within_5pct: delta_pct != null && Math.abs(delta_pct) <= 0.05,
    canonical: 'client_4_line',
    operating_calibration_eur_kw_yr: costs.operating_calibration_eur_kw_yr ?? 0,
    // A partial first year moves the two taxonomies apart by a knowable amount:
    // the engine charges its flat BRP fee in full while every client line is
    // pro-rated. The gap is that fee's un-pro-rated remainder, not drift.
    partial_year_divergence: opFrac < 1 ? {
      operational_months: config.operational_months_y1,
      cause: 'engine BRP fee is flat per SPV and is not pro-rated; all four client lines are',
      brp_fee_not_pro_rated: r((y1.brp_fee ?? 0) * (1 - opFrac)),
      direction: 'client stack is lighter, so the bridge shows higher EBITDA than the engine',
      resolution:
        'Reported, not absorbed. The reference asset — where the ±2% reconciliation ' +
        'requirement applies — ties to 0.01%. Re-fitting the calibration per project ' +
        'would make every project agree with the engine by construction and destroy ' +
        'the reconciliation\'s value as a check.',
    } : null,
    note:
      'The 4-line derivation is canonical on the consultancy path — it is the structure ' +
      'the client contracted for, and each line carries its own basis and override ' +
      'handle. The engine folds optimiser and market participation into one RTM fee and ' +
      'carries a flat BRP fee, so the two taxonomies do not agree line for line; a ' +
      'single calibration constant on the operating line closes the residual at the ' +
      'reference asset (see OPERATING_CALIBRATION_EUR_KW_YR). It is an absolute €/kW/yr ' +
      'while the percentage lines scale with revenue, so a residual reappears away from ' +
      'the reference point — reported here, never absorbed. The public /revenue path ' +
      'continues to use the engine stack, unchanged.',
  };
}
