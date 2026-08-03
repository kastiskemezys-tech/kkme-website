/**
 * Phase 39 — debt-sizing parameters, and where each one comes from.
 *
 * The prompt's §3 is the load-bearing constraint on this file: target DSCR,
 * tenor and margin ARE the answer, so they cannot be plucked, and the base case
 * must sit at the CONSERVATIVE end of whatever the literature gives. Nothing
 * here is reasoned backwards from the number that makes the asset work.
 *
 * ── The transfer problem, stated up front ──────────────────────────────────
 *
 * The only sources that publish ACTUAL storage DSCR levels with attribution are
 * the Norton Rose Fulbright / projectfinance.law "Cost of Capital" panels, and
 * those are a US bank panel quoting spreads over SOFR. The asset is Baltic and
 * the facility is in euro. Applying a US-panel DSCR to a EUR asset is a
 * TRANSFER, and it is labelled as one on every row it touches rather than
 * allowed to inherit the citation's authority (failure-modes A5, rule #3).
 *
 * European sources (Société Générale CIB, Pexapark) corroborate the STRUCTURE —
 * short mini-perm tenors, gearing well below solar/wind — but publish no DSCR.
 * Where a parameter has no European source it says so in `transfer`.
 *
 * Every European storage source consulted that discusses DSCR does so
 * qualitatively ("tighter DSCRs", "robust DSCR cushions"); none of DNV,
 * Modo Energy's 2025 European financing review, ess-news' BBDF 2025/2026
 * coverage or energy-storage.news' German merchant-BESS piece publishes a
 * number. That absence is itself reported rather than papered over.
 */

/**
 * @typedef {object} Param
 * @property {number|[number,number]} base   value used in the base case
 * @property {[number,number]|null}   range  published range, null if a point
 * @property {string} basis      what the number IS
 * @property {string} source     publication
 * @property {string} url
 * @property {string} date       publication date
 * @property {string} attributed who said it
 * @property {string|null} transfer  the assumption made carrying it here
 */

/** @type {Record<string, Param>} */
export const DEBT_PARAMS = {
  dscr_merchant: {
    base: 2.00,
    range: [1.20, 2.00],
    basis:
      'Minimum DSCR a lender sizes MERCHANT storage debt to. Base case takes the ' +
      'merchant end (2.00x), which is the conservative end of the published spread ' +
      'between merchant and contracted storage.',
    source: 'Norton Rose Fulbright / projectfinance.law, "Cost of Capital: 2025 Outlook"',
    url: 'https://www.projectfinance.law/publications/2025/january/cost-of-capital-2025-outlook/',
    date: '2025-01-24',
    attributed: 'Beth Waters, Managing Director, MUFG: "Merchant storage 2.0 times debt service."',
    is_transfer: true,
    transfer:
      'US bank panel, spreads quoted over SOFR. Carried to a EUR Baltic asset as a ' +
      'COVERAGE LEVEL only. Corroborated independently by NREL ATB, which cites ' +
      'Norton Rose Fulbright at a P50 DSCR of 2.0 for battery storage.',
  },

  dscr_contracted: {
    base: 1.20,
    range: [1.15, 1.20],
    basis:
      'Minimum DSCR for CONTRACTED storage — no P-factor applies to storage. Base ' +
      'case takes 1.20x, the conservative (higher) end of the published 1.15-1.20 band.',
    source:
      'Norton Rose Fulbright / projectfinance.law, "Cost of Capital" 2025 and 2026 Outlooks ' +
      '(the same figure in both years)',
    url: 'https://www.projectfinance.law/publications/cost-of-capital-2026-outlook',
    date: '2026-01-29',
    attributed:
      'Beth Waters, MUFG: "Storage -- where there is no P factor -- is 1.15 to 1.20 times ' +
      'debt service." (2026); "Storage coverage is 1.15 to 1.20." (2025)',
    is_transfer: true,
    transfer: 'Same US-panel transfer as dscr_merchant.',
  },

  tenor_years: {
    base: 7,
    range: [7, 10],
    basis:
      'TOTAL legal tenor of the facility, grace period included. Base case takes 7 ' +
      'years, the short (conservative) end. The constraint is physical, not ' +
      'financial: tenor is bounded by the battery supplier warranty.',
    source: 'Société Générale Corporate & Investment Banking, "BESS - Emerging Asset to Essential Infrastructure"',
    url: 'https://wholesale.banking.societegenerale.com/en/news-insights/all-news-insights/news-details/news/bess-emerging-asset-to-essential-infrastructure/',
    date: '2025-06-24',
    attributed:
      'Nathalie Lemarcis and Michael De Witte, Energy Finance & Advisory, SG CIB: ' +
      '"7-year to 10-year legal tenor hard mini-perms with an underlying notional tenor ' +
      'being constrained by the underlying warranty duration".',
    is_transfer: false,
    transfer:
      'None material — European bank, European market. The same source notes longer ' +
      'tenors are reachable with "a higher proportion and longer dated offtake/floor or ' +
      'tolling agreements", which is the mechanism this phase quantifies in the ' +
      'contracted-share table.',
  },

  margin_bp: {
    base: 350,
    range: [275, 350],
    basis:
      'All-in credit margin over the base rate for a MERCHANT battery asset. Base ' +
      'case takes 350bp, the wide (conservative) end.',
    source: 'Norton Rose Fulbright / projectfinance.law, "Cost of Capital: 2025 Outlook"',
    url: 'https://www.projectfinance.law/publications/2025/january/cost-of-capital-2025-outlook/',
    date: '2025-01-24',
    attributed:
      'Ralph Cho, Co-CEO, Apterra Infrastructure Capital: "For merchant battery assets, ' +
      'you are looking at 275 to 350" bp. Beth Waters (MUFG) separately: batteries carry ' +
      '"about a 25 basis-point premium on margins during operations over other ' +
      'renewables financings".',
    is_transfer: true,
    transfer:
      'US bank panel. Quoted over SOFR; applied here over 3M EURIBOR. A credit margin is not a ' +
      'risk-free-rate quote, so the level transfers more cleanly than the base rate ' +
      'does, but this is still a transfer and is NOT a Baltic quote. Note the engine\'s ' +
      'existing fixed-gearing diagnostic uses 250bp (fetch-s1.js:1636), i.e. BELOW the ' +
      'sourced merchant range — the diagnostic is left untouched, and the solver uses ' +
      'the sourced number.',
  },

  gearing_cap: {
    base: 0.60,
    range: [0.40, 0.60],
    basis:
      'Maximum gearing a lender applies INDEPENDENTLY of DSCR. Base case takes 60%, ' +
      'the top of the published European BESS range, deliberately: a tighter cap would ' +
      'bind first at most configurations and hide the DSCR result, which is the thing ' +
      'being measured. The 40% end is reported as a sensitivity.',
    source: 'Pexapark, "The BESS Brief - Part 2: BESS Financing"',
    url: 'https://pexapark.com/blog/prmc-the-bess-brief-part-2-bess-financing/',
    date: '2025-07-15',
    attributed:
      'Pexapark: "most deals today fall within the 40-60% range, rarely matching the ' +
      '80-85% leverage seen in mature solar and wind."',
    is_transfer: false,
    transfer: 'None — European market commentary on European BESS deals.',
  },

  merchant_share_cap: {
    base: [0.25, 0.40],
    range: [0.25, 0.40],
    basis:
      'The maximum MERCHANT revenue share lenders will underwrite at all. Not a model ' +
      'input — it is the constraint that makes the contracted-share table a financing ' +
      'question rather than a pricing preference. Reported, not applied, because ' +
      'applying it would simply declare the 0%-contracted column unfinanceable by ' +
      'assumption instead of showing what its cash flows support.',
    source: 'Norton Rose Fulbright / projectfinance.law, "Cost of Capital: 2026 Outlook"',
    url: 'https://www.projectfinance.law/publications/cost-of-capital-2026-outlook',
    date: '2026-01-29',
    attributed:
      'Ralph Cho, Apterra/Apollo: "For solar, wind and batteries, I would limit the ' +
      'merchant revenue to a maximum of 25% to 30%." Beth Waters, MUFG: "I am definitely ' +
      'not going over 40% merchant."',
    is_transfer: true,
    transfer: 'US panel; European lenders in the same period are described as more ' +
      'merchant-tolerant in mature markets (Germany), so this is likely a TIGHT bound ' +
      'for the Baltics rather than a loose one. Direction stated, not quantified.',
  },

  base_rate: {
    base: 0.026,
    range: null,
    basis: '3-month EURIBOR, nominal. The engine\'s own live value, not a new assumption.',
    source: 'ECB via the engine KV snapshot (`kv.euribor.euribor_nominal_3m`)',
    url: 'https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html',
    date: '2026-07-28',
    attributed: 'Frozen regression fixture `tools/consultancy/fixtures/regression-kv.json`.',
    is_transfer: false,
    transfer: null,
  },
};

/**
 * DSCR target for a partially-contracted asset.
 *
 * NOT SOURCED — this is a modelling choice and is labelled as one. No consulted
 * source publishes a blending rule between the merchant and contracted DSCR
 * levels; they publish the two endpoints. A revenue-weighted linear blend is the
 * conventional treatment and it reproduces both published endpoints exactly at
 * 0% and 100% contracted, which is the most that can be claimed for it.
 *
 * This is precisely the E1/E2 `dur_req_h` precedent the prompt warns about:
 * sitting next to two well-sourced parameters must not make this one look
 * sourced. It is banded in the CP table and flagged UNSOURCED.
 */
export function blendedDscrTarget(contractedShare, {
  merchant = DEBT_PARAMS.dscr_merchant.base,
  contracted = DEBT_PARAMS.dscr_contracted.base,
} = {}) {
  if (!(contractedShare >= 0 && contractedShare <= 1)) {
    throw new Error(`contractedShare must be a fraction in [0, 1], got ${contractedShare}`);
  }
  return contracted * contractedShare + merchant * (1 - contractedShare);
}

/**
 * The cover ratios published beside the headline.
 *
 * NOT alternative sourced values — 1.50× and 1.75× are below anything published
 * for MERCHANT cover. They ship so a reader can see how much of the gearing
 * figure is the transferred parameter and how much is the asset. Operator
 * condition on the Phase 39 sign-off, 2026-08-03.
 */
export const DSCR_SENSITIVITY_LADDER = Object.freeze([1.50, 1.75, 2.00]);

/**
 * Covenant threshold the fixed-gearing DIAGNOSTIC is read against.
 *
 * Mirrors `app/lib/financialDefinitions.ts:DEFAULT_DSCR_COVENANT`, which the
 * DSCR panel already renders. Declared here so the engine's comparison sentence
 * and the card's covenant marker cannot drift apart, and so the sentence's
 * verdict is computed from a named threshold rather than an inline literal.
 *
 * NOTE this is NOT `dscr_merchant.base` — the covenant is the floor a facility
 * must not breach, the target is what debt is SIZED to. Conflating them would
 * make every configuration read as a breach.
 */
export const DEBT_COVENANT_DSCR = 1.20;

/**
 * REVIEW TRIGGER — operator condition on the Phase 39 sign-off, 2026-08-03.
 *
 * Every cover ratio here is a US bank panel carried onto a EUR Baltic asset. No
 * European or Baltic source consulted in Phase 39 publishes a storage DSCR
 * number at all. **If European or Baltic BESS financing terms become locatable,
 * re-derive from them — do not inherit these.** The transfer is a stopgap for an
 * absent source, not a considered view that US terms are the right ones.
 */
export const REVIEW_TRIGGER = Object.freeze({
  condition: 'European or Baltic BESS financing terms become locatable',
  action: 're-derive the cover ratios from them rather than inheriting the US panel',
  set_by: 'operator sign-off, Phase 39',
  set_on: '2026-08-03',
});

/**
 * The one-line provenance the public surface carries.
 *
 * Rule #2: this asserts WHERE the numbers come from, so it is COMPUTED from the
 * register rather than written as prose that can outlive its premise. Editing a
 * source in `DEBT_PARAMS` rewrites this automatically; it cannot go stale
 * silently.
 */
export function provenanceNote() {
  const d = DEBT_PARAMS.dscr_merchant;
  const t = DEBT_PARAMS.tenor_years;
  const m = DEBT_PARAMS.margin_bp;
  return {
    summary:
      `Cover ratio ${d.base.toFixed(2)}× is a US bank panel figure (${d.source}, ${d.date}), ` +
      `carried onto a euro asset. No European or Baltic source publishes a storage ` +
      `DSCR number. Tenor ${t.base} yr is European (${t.source}, ${t.date}); margin ` +
      `${m.base} bp is US-panel, applied over EURIBOR.`,
    transferred: Object.entries(DEBT_PARAMS)
      .filter(([, p]) => p.is_transfer).map(([k]) => k),
    sources: Object.fromEntries(Object.entries(DEBT_PARAMS)
      .map(([k, p]) => [k, { source: p.source, url: p.url, date: p.date }])),
    review_trigger: REVIEW_TRIGGER,
  };
}

/** The base case: every sourced parameter at its conservative end. */
export function baseCase() {
  return {
    targetDscr: DEBT_PARAMS.dscr_merchant.base,
    tenorYears: DEBT_PARAMS.tenor_years.base,
    graceYears: 1,
    rate: DEBT_PARAMS.base_rate.base + DEBT_PARAMS.margin_bp.base / 10000,
    maxGearing: DEBT_PARAMS.gearing_cap.base,
  };
}

/** Markdown parameter table for the CP. Every row carries its source and date. */
export function parameterTableMarkdown() {
  /** Units differ per row, so each one formats itself rather than sharing a default. */
  const UNIT = {
    dscr_merchant: (v) => `${v.toFixed(2)}×`,
    dscr_contracted: (v) => `${v.toFixed(2)}×`,
    tenor_years: (v) => `${v} yr`,
    margin_bp: (v) => `${v} bp`,
    gearing_cap: (v) => `${(v * 100).toFixed(0)} %`,
    merchant_share_cap: (v) => `${(v * 100).toFixed(0)} %`,
    base_rate: (v) => `${(v * 100).toFixed(2)} %`,
  };
  const rows = Object.entries(DEBT_PARAMS).map(([k, p]) => {
    const u = UNIT[k] ?? String;
    const fmt = (v) => (Array.isArray(v) ? `${u(v[0])}–${u(v[1])}` : u(v));
    const range = p.range ? fmt(p.range) : '—';
    return `| \`${k}\` | **${fmt(p.base)}** | ${range} | ${p.source}, ${p.date} | ${p.is_transfer ? 'yes' : 'no'} |`;
  });
  return [
    '| Parameter | Base (conservative end) | Published range | Source | Transfer? |',
    '|---|---|---|---|---|',
    ...rows,
    '| `dscr_blend` (partial contracting) | weighted | — | **UNSOURCED — modelling choice** | n/a |',
  ].join('\n');
}
