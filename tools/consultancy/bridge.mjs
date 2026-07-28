/**
 * Client-facing revenue bridge — Phase 34.1 (extended in 34.2)
 *
 * Reshapes the engine's Y1 / 20-year output into the bridge structure the
 * deliverable contract specifies. Pure re-presentation of engine numbers plus
 * arithmetic tie-outs — no parallel revenue maths (discipline rule #4).
 *
 * 34.1 scope: gross → market fees → net → operating costs → EBITDA →
 * maintenance CAPEX → pre-financing cash flow, at Y1 and across 20 years.
 * 34.2 splits the cost lines into the client's four categories and adds the
 * augmentation / replacement CAPEX schedule.
 */

/** Round to whole euro. Bridge tie-outs are asserted on these rounded values. */
const r = (n) => Math.round(n);

export class BridgeTieOutError extends Error {}

/** Assert `total` equals `parts` summed, to the euro. Fails loudly by design. */
export function assertTieOut(label, total, parts) {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (Math.abs(total - sum) > 1) {
    throw new BridgeTieOutError(
      `bridge tie-out failed at "${label}": ${total} ≠ ${sum} (Δ ${total - sum})`
    );
  }
}

/** One year of the bridge, from an engine `years[]` entry. */
export function bridgeYear(y) {
  const gross = r(y.rev_gross);
  const market_fees = r(y.rtm_fee + y.brp_fee);
  const net = r(y.rev_net);
  const operating = r(y.opex);
  const ebitda = r(y.ebitda);
  const maintenance_capex = r(y.maint_capex);
  const pre_financing_cf = ebitda - maintenance_capex;

  assertTieOut('net_market_revenue', net, [gross, -market_fees]);
  assertTieOut('project_ebitda', ebitda, [net, -operating]);
  assertTieOut('pre_financing_cf', pre_financing_cf, [ebitda, -maintenance_capex]);

  return {
    yr: y.yr,
    cal_year: y.cal_year,
    gross_market_revenues: gross,
    market_fees,
    net_market_revenue: net,
    operating_costs: operating,
    project_ebitda: ebitda,
    maintenance_capex,
    pre_financing_cf,
  };
}

/**
 * Build the bridge for a project.
 * @param {object} result computeRevenueV7 output
 * @param {object} config validated project config
 */
export function buildBridge(result, config) {
  const years = result.years ?? [];
  if (!years.length) throw new Error(`engine returned no years for ${config.project_id}`);

  const bridge_20yr = years.map(bridgeYear);
  const bridge_y1 = bridge_20yr[0];

  return {
    bridge_y1,
    bridge_20yr,
    bridge_totals: {
      gross_market_revenues: r(bridge_20yr.reduce((s, b) => s + b.gross_market_revenues, 0)),
      market_fees: r(bridge_20yr.reduce((s, b) => s + b.market_fees, 0)),
      net_market_revenue: r(bridge_20yr.reduce((s, b) => s + b.net_market_revenue, 0)),
      operating_costs: r(bridge_20yr.reduce((s, b) => s + b.operating_costs, 0)),
      project_ebitda: r(bridge_20yr.reduce((s, b) => s + b.project_ebitda, 0)),
      maintenance_capex: r(bridge_20yr.reduce((s, b) => s + b.maintenance_capex, 0)),
      pre_financing_cf: r(bridge_20yr.reduce((s, b) => s + b.pre_financing_cf, 0)),
    },
    bridge_notes: {
      charging_costs:
        'Embedded in the trading line: the engine works on a captured DA *spread* ' +
        '(discharge price less charge price) net of round-trip efficiency, not on ' +
        'gross discharge revenue. Phase 34.2 makes the charging line explicit.',
      market_fees:
        'RTM/exchange fee (% of gross) plus the BRP platform fee. Phase 34.2 splits ' +
        'this into the client\'s optimiser / grid / market categories.',
      capex_lines:
        'Y1 maintenance CAPEX is the engine\'s augmentation reserve (zero until its ' +
        'year-10 event). The explicit maintenance / augmentation / replacement ' +
        'schedule arrives in Phase 34.2.',
    },
  };
}
