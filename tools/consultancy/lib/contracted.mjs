/**
 * Contracted-revenue overlay — Phase 36.B4
 *
 * A 100 %-merchant case answers "what could this earn". Every financing
 * conversation asks the other question: "what floors the coverage". This module
 * puts a contracted floor on a share of the asset and reports what it does to
 * the revenue path, to the bridge, and — the part that actually matters to a
 * lender — to the left tail of the distribution.
 *
 * ── The contract ──────────────────────────────────────────────────────────
 *
 *   { floor_eur_mw_yr, contracted_pct_of_mw, term_years, counterparty_note }
 *
 * `contracted_pct_of_mw` of nameplate sits under the contract for `term_years`
 * operating years from COD. The remaining MW, and every year after the term, is
 * merchant.
 *
 * ── Two cases, and the difference between them ────────────────────────────
 *
 *   BLENDED    the contracted share earns max(merchant, floor). The floor is an
 *              option the asset holds: downside protected, upside retained.
 *              This is the "floor" structure.
 *
 *   FLOOR_ONLY the contracted share earns the floor and nothing else, in every
 *              year of the term. This is the full-toll structure, and it is the
 *              downside case the arc asks for: what the asset is worth if the
 *              contracted MW never out-earns its floor.
 *
 * FLOOR_ONLY is NOT simply BLENDED with the upside removed for reporting — it
 * is a genuinely lower revenue path whenever merchant beats the floor, which is
 * why it is computed rather than derived.
 *
 * ── What the floor is measured against ────────────────────────────────────
 *
 * NET market revenue — the engine's `rev_gross`, which is already net of
 * charging cost because the engine prices arbitrage on a captured spread. That
 * is what the asset actually keeps from the market, and therefore the honest
 * thing to compare a €/MW/yr floor against. Comparing against the bridge's
 * grossed-up top line would let charging cost count towards clearing the floor,
 * which would make the floor bind less often than it should.
 *
 * ── Conservative treatments, stated ───────────────────────────────────────
 *
 * 1. The floor is NOMINAL. It does not escalate, while opex does. In real terms
 *    the protection thins every year of the term — that is the conservative
 *    direction and it is how most term sheets are actually written.
 * 2. The cost stack applies to floor revenue exactly as it applies to merchant
 *    revenue. In a true toll the offtaker takes the trading rights and the
 *    optimiser fee on that share goes away, so this UNDERSTATES the toll case's
 *    EBITDA by `optimiser_pct × floor revenue`. The overlay reports that figure
 *    (`toll_fee_understatement_eur`) rather than assuming its way out of it.
 * 3. A partial first operating year pro-rates the floor entitlement by
 *    operational months. Without it a 7-month year would be measured against a
 *    12-month floor and the floor would appear to bind when it does not.
 */

export const CONTRACT_MODES = ['blended', 'floor_only'];

/** The contracted levels the arc asks to be reported at. */
export const STANDARD_LEVELS = [0, 0.30, 0.50];

export class ContractError extends Error {}

/**
 * Validate and normalise a contract config. Deliberately strict: a silently
 * defaulted term or share would produce a plausible number nobody can check.
 */
export function normaliseContract(contract = {}) {
  const {
    floor_eur_mw_yr = 0,
    contracted_pct_of_mw = 0,
    term_years = 0,
    counterparty_note = null,
  } = contract;

  if (!(floor_eur_mw_yr >= 0)) {
    throw new ContractError(`floor_eur_mw_yr must be >= 0, got ${floor_eur_mw_yr}`);
  }
  if (!(contracted_pct_of_mw >= 0 && contracted_pct_of_mw <= 1)) {
    throw new ContractError(
      `contracted_pct_of_mw is a FRACTION of nameplate in [0, 1], got ${contracted_pct_of_mw}`
    );
  }
  if (!Number.isInteger(term_years) || term_years < 0) {
    throw new ContractError(`term_years must be a non-negative integer, got ${term_years}`);
  }
  const active = contracted_pct_of_mw > 0 && term_years > 0 && floor_eur_mw_yr > 0;
  if (active && !counterparty_note) {
    throw new ContractError(
      'a live contract must name its counterparty basis — an unattributed floor in a ' +
      'client deliverable is exactly what discipline rule #3 forbids'
    );
  }
  return { floor_eur_mw_yr, contracted_pct_of_mw, term_years, counterparty_note, active };
}

/**
 * One operating year of the overlay.
 *
 * `merchant_net` is the whole asset's net market revenue for the year; the
 * contracted share of it is taken pro rata by MW, which is the right split for
 * a revenue floor written on capacity.
 */
export function contractYear({
  merchant_net, mw, yr, operational_months = 12, contract, mode = 'blended',
}) {
  const c = contract;
  const inTerm = c.active && yr >= 1 && yr <= c.term_years;
  const share = inTerm ? c.contracted_pct_of_mw : 0;

  const merchant_contracted_share = merchant_net * share;
  const merchant_free_share = merchant_net * (1 - share);

  // Pro-rate the entitlement, never the comparison: a 7-month year is measured
  // against 7 months of floor.
  const monthFrac = yr === 1 ? Math.min(12, Math.max(0, operational_months)) / 12 : 1;
  const floor_entitlement = inTerm ? c.floor_eur_mw_yr * mw * share * monthFrac : 0;

  const floor_binds = inTerm && floor_entitlement > merchant_contracted_share;

  let contracted_revenue;
  if (!inTerm) contracted_revenue = 0;
  else if (mode === 'floor_only') contracted_revenue = floor_entitlement;
  else contracted_revenue = Math.max(merchant_contracted_share, floor_entitlement);

  const total = merchant_free_share + contracted_revenue;

  return {
    yr,
    in_term: inTerm,
    contracted_share: share,
    merchant_net,
    merchant_contracted_share,
    merchant_free_share,
    floor_entitlement,
    floor_binds,
    contracted_revenue,
    total,
    // Signed: BLENDED can never be negative, FLOOR_ONLY can.
    uplift: total - merchant_net,
  };
}

/**
 * Clone an engine result with the contract applied to its revenue path.
 *
 * The uplift lands on its own line (`rev_contracted`) and is added into
 * `rev_gross`, so `buildBridge` recomputes the whole downstream stack —
 * percentage fees, EBITDA, cash flow — from the contracted revenue without any
 * of that arithmetic being restated here (rule #4). The product lines
 * (`rev_cap` / `rev_act` / `rev_trd`) are left exactly as the engine produced
 * them: contracted revenue is not a market product and mislabelling it as one
 * would corrupt every downstream split.
 */
export function applyContract(result, config, contract, { mode = 'blended' } = {}) {
  const c = normaliseContract(contract);
  if (!CONTRACT_MODES.includes(mode)) throw new ContractError(`unknown contract mode "${mode}"`);

  const out = structuredClone(result);
  const mw = config.mw;
  const operational_months = config.operational_months_y1 ?? 12;
  const schedule = [];

  out.years = out.years.map((y) => {
    const row = contractYear({
      merchant_net: y.rev_gross, mw, yr: y.yr, operational_months, contract: c, mode,
    });
    schedule.push(row);
    return { ...y, rev_contracted: row.uplift, rev_gross: row.total };
  });

  out.contract = {
    mode,
    ...c,
    schedule,
    years_floor_binds: schedule.filter((s) => s.floor_binds).length,
    total_uplift_eur: schedule.reduce((a, s) => a + s.uplift, 0),
    floor_basis:
      'Floor is measured against NET market revenue (engine rev_gross, already net of ' +
      'charging cost). Nominal, not escalated. Pro-rated by operational months in a ' +
      'partial first year.',
  };
  return out;
}

/**
 * What the toll case's EBITDA is understated by, given the conservative
 * treatment in note 2 of the header: in a full toll the offtaker holds the
 * trading rights, so the optimiser fee on the contracted share does not arise.
 */
export function tollFeeUnderstatement(contracted, optimiser_pct_gross) {
  const rows = contracted.contract?.schedule ?? [];
  return rows.reduce((a, s) => a + s.contracted_revenue * optimiser_pct_gross, 0);
}

/**
 * Sweep a set of contracted levels, holding floor and term fixed.
 * `runOne(contract, mode)` is supplied by the caller so this module never
 * decides how a project is run.
 */
export async function sweepLevels({
  levels = STANDARD_LEVELS, floor_eur_mw_yr, term_years, counterparty_note, runOne,
}) {
  const out = {};
  for (const level of levels) {
    const contract = {
      floor_eur_mw_yr, term_years, counterparty_note,
      contracted_pct_of_mw: level,
    };
    out[levelKey(level)] = await runOne(normaliseContract(contract), level);
  }
  return out;
}

export const levelKey = (level) => `pct_${Math.round(level * 100)}`;
