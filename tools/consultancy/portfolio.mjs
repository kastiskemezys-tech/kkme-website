/**
 * Portfolio aggregation — Phase 34.3
 *
 * Rolls per-project bridges up to a consolidated, calendar-year portfolio view
 * with staggered commissioning, then computes NPV and MOIC from one shared
 * cash-flow array.
 *
 * The governing rule is that a portfolio line which is not exactly the sum of
 * the project lines is a bug, not a rounding artefact. Summation is asserted,
 * not merely performed.
 *
 * There is deliberately no portfolio-effect maths here. Three 2-hour BESS in
 * one price zone are ~0.97 correlated; claiming diversification would be
 * inventing a benefit the assets do not have. The correlation is disclosed as
 * data instead.
 */

import { BRIDGE_LINES, assertTieOut } from './bridge.mjs';

const r = (n) => Math.round(n);

export const CORRELATION_NOTE = {
  lt_zone_price_correlation: 0.97,
  spatial_diversification: 'negligible',
  temporal_smoothing: 'staggered COD',
  note:
    'All three assets sit in the Lithuanian price zone and bid into the same DA, ' +
    'intraday and Baltic balancing markets, so their revenue is near-perfectly ' +
    'correlated. No portfolio-effect uplift is modelled and none should be assumed: ' +
    'the only real smoothing is temporal, from staggered commissioning. Consolidated ' +
    'figures are the arithmetic sum of the projects and nothing else.',
};

export const DEFAULT_WACC = 0.08;

/**
 * Consolidate per-project bridges onto a shared calendar-year timeline.
 *
 * Each project contributes from its own first operating year, so the timeline
 * spans the earliest start to the latest end. It is deliberately NOT truncated
 * to 20 calendar years: with staggered COD the last project runs a year past
 * the first, and clipping it would silently break portfolio = Σ projects.
 */
export function consolidate(projects) {
  if (!projects.length) throw new Error('portfolio needs at least one project');

  const allYears = projects.flatMap((p) => p.bridge_20yr.map((b) => b.cal_year));
  const first = Math.min(...allYears);
  const last = Math.max(...allYears);

  const timeline = [];
  for (let cal_year = first; cal_year <= last; cal_year++) {
    const row = { cal_year, contributors: [] };
    for (const line of BRIDGE_LINES) row[line] = 0;

    for (const p of projects) {
      const yearRow = p.bridge_20yr.find((b) => b.cal_year === cal_year);
      if (!yearRow) continue;
      row.contributors.push({
        project_id: p.project_id,
        operating_yr: yearRow.yr,
        operational_months: yearRow.yr === 1 ? p.config.operational_months_y1 : 12,
      });
      for (const line of BRIDGE_LINES) row[line] += yearRow[line];
    }

    for (const line of BRIDGE_LINES) row[line] = r(row[line]);

    // Every consolidated year must satisfy the same identities as a project year.
    assertTieOut(`portfolio ${cal_year} net_market_revenue`, row.net_market_revenue, [
      row.gross_market_revenues, -row.charging_costs,
    ]);
    assertTieOut(`portfolio ${cal_year} project_ebitda`, row.project_ebitda, [
      row.net_market_revenue, -row.optimiser, -row.grid, -row.market, -row.operating,
    ]);
    assertTieOut(`portfolio ${cal_year} pre_financing_cf`, row.pre_financing_cf, [
      row.project_ebitda, -row.maintenance_capex, -row.augmentation_capex, -row.replacement_capex,
    ]);

    timeline.push(row);
  }
  return timeline;
}

/** Assert every consolidated line equals the sum of the project lines. */
export function assertPortfolioIsSum(projects, timeline) {
  for (const line of BRIDGE_LINES) {
    const portfolioTotal = timeline.reduce((s, y) => s + y[line], 0);
    const projectTotal = projects.reduce((s, p) => s + p.bridge_totals[line], 0);
    if (Math.abs(portfolioTotal - projectTotal) > projects.length) {
      throw new Error(
        `portfolio line "${line}" is not the sum of the project lines: ` +
        `${portfolioTotal} vs ${projectTotal} (Δ ${portfolioTotal - projectTotal})`
      );
    }
  }
}

/**
 * Build the cash-flow array NPV and MOIC both read from.
 *
 * `t = 0` is the year the first CAPEX is drawn — one year before the earliest
 * project starts operating, matching the engine's own convention that CAPEX
 * lands at `cod_year` and revenue begins at `cod_year + 1`. Each project's
 * CAPEX lands in its own draw year, so a later project is discounted from
 * further out rather than being penalised at t=0.
 *
 * Cash flows are the bridge's PRE-FINANCING, PRE-TAX line. The contracted
 * 8-line bridge carries no tax row, and debt/interest/DSCR are out of scope for
 * this engagement, so these are not comparable with a post-tax equity NPV.
 * The engine's own post-tax figure is carried alongside for contrast.
 */
export function buildCashflows(projects, { wacc = DEFAULT_WACC } = {}) {
  const drawYears = projects.map((p) => p.config.first_operating_year - 1);
  const t0 = Math.min(...drawYears);
  const opYears = projects.flatMap((p) => p.bridge_20yr.map((b) => b.cal_year));
  const last = Math.max(...opYears);

  const rows = [];
  for (let cal_year = t0; cal_year <= last; cal_year++) {
    const capex_outflow = r(
      projects
        .filter((p) => p.config.first_operating_year - 1 === cal_year)
        .reduce((s, p) => s + p.gross_capex, 0)
    );
    const operating_cf = r(
      projects.reduce((s, p) => {
        const row = p.bridge_20yr.find((b) => b.cal_year === cal_year);
        return s + (row ? row.pre_financing_cf : 0);
      }, 0)
    );
    rows.push({
      cal_year,
      t: cal_year - t0,
      capex_outflow,
      operating_cf,
      net_cf: operating_cf - capex_outflow,
    });
  }
  return { t0, wacc, rows };
}

export function npvOf(cashflows) {
  return r(
    cashflows.rows.reduce((s, x) => s + x.net_cf / Math.pow(1 + cashflows.wacc, x.t), 0)
  );
}

/** Total operating cash returned per euro of CAPEX. Same array as the NPV. */
export function moicOf(cashflows) {
  const capex = cashflows.rows.reduce((s, x) => s + x.capex_outflow, 0);
  if (!capex) return null;
  const operating = cashflows.rows.reduce((s, x) => s + x.operating_cf, 0);
  return Math.round((operating / capex) * 1000) / 1000;
}

/** Simple payback in years from t0, on undiscounted net cash flow. */
export function paybackOf(cashflows) {
  let cumul = 0;
  for (const x of cashflows.rows) {
    cumul += x.net_cf;
    if (cumul >= 0) return x.t;
  }
  return null;
}

/**
 * Build the full portfolio roll-up.
 * @param {Array} projects entries of { project_id, config, bridge_*, engine }
 */
export function buildPortfolio(projects, { wacc = DEFAULT_WACC } = {}) {
  const timeline = consolidate(projects);
  assertPortfolioIsSum(projects, timeline);

  const cashflows = buildCashflows(projects, { wacc });
  const bridge_totals = Object.fromEntries(
    BRIDGE_LINES.map((line) => [line, r(timeline.reduce((s, y) => s + y[line], 0))])
  );

  // Portfolio "Y1" is the first calendar year of operation, not any project's
  // operating year 1 — with staggered COD they are different things.
  const bridge_y1 = timeline[0];

  const per_project = projects.map((p) => {
    const cf = buildCashflows([p], { wacc });
    return {
      project_id: p.project_id,
      name: p.config.name,
      mw: p.config.mw,
      mwh: p.config.mwh,
      cod: p.config.cod,
      first_operating_year: p.config.first_operating_year,
      operational_months_y1: p.config.operational_months_y1,
      gross_capex: p.gross_capex,
      bridge_y1: p.bridge_y1,
      bridge_totals: p.bridge_totals,
      npv_pre_financing_pre_tax: npvOf(cf),
      moic: moicOf(cf),
      payback_years: paybackOf(cf),
      engine_npv_post_tax: p.engine_npv_post_tax,
      engine_project_irr: p.engine_project_irr,
    };
  });

  return {
    portfolio: {
      projects: projects.length,
      mw: projects.reduce((s, p) => s + p.config.mw, 0),
      mwh: projects.reduce((s, p) => s + p.config.mwh, 0),
      gross_capex: r(projects.reduce((s, p) => s + p.gross_capex, 0)),
      calendar_span: `${timeline[0].cal_year}–${timeline[timeline.length - 1].cal_year}`,
      calendar_years: timeline.length,
      wacc,
      npv_pre_financing_pre_tax: npvOf(cashflows),
      moic: moicOf(cashflows),
      payback_years: paybackOf(cashflows),
      npv_basis:
        'Pre-financing, pre-tax bridge cash flow discounted at WACC from the first ' +
        'CAPEX draw year. The contracted 8-line bridge carries no tax row and debt / ' +
        'interest / DSCR are out of scope, so this is not comparable with a post-tax ' +
        'equity NPV. Each project\'s post-tax engine NPV is carried alongside.',
    },
    bridge_y1,
    bridge_20yr: timeline,
    bridge_totals,
    cashflows,
    per_project,
    correlation_note: CORRELATION_NOTE,
    timeline_note:
      'Calendar-year timeline. Each project contributes from its own first operating ' +
      'year, so the span runs past 20 years when commissioning is staggered — ' +
      'truncating it would break portfolio = Σ projects. Per-project internals stay on ' +
      'operating years; operating year N of a project falls in calendar year ' +
      'first_operating_year + N − 1.',
  };
}
