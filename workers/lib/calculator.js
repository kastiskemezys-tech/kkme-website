/**
 * BESS Revenue Calculator — Phase 35.1
 *
 * Productises the Phase-34 consultancy engine as a two-tier endpoint:
 *
 *   sample  (no auth)  — Y1 headline + the 8-line bridge, nothing else
 *   full    (bearer)   — the whole per-project consultancy output
 *
 * Nothing here computes revenue. Every number originates in
 * `computeRevenueV7` (workers/fetch-s1.js) or in the consultancy bridge
 * (tools/consultancy/bridge.mjs, imported rather than reimplemented), so
 * discipline rule #4 holds across the productised path exactly as it does
 * across the deliverable path.
 *
 * The two tiers are built by DIFFERENT functions from the same engine result,
 * and the sample builder never receives the full result — see `buildSample`.
 */

import { buildBridge, resolveCosts, resolveCapex } from '../../tools/consultancy/bridge.mjs';
import { buildCashflows, npvOf, moicOf, paybackOf, DEFAULT_WACC } from '../../tools/consultancy/portfolio.mjs';

// ── Copy ───────────────────────────────────────────────────────────────────

/**
 * Every visitor-facing string the calculator can emit. Single source: the page
 * renders these, it does not restate them (rule #4 applied to copy).
 */
export const CALC_COPY = {
  sample_note:
    'Sample output: first-year headline and the 8-line revenue bridge, computed by the same ' +
    'engine that produces KKME\'s commissioned project models. The full analysis is not ' +
    'included in this view.',
  upsell: {
    headline: 'The full analysis adds',
    items: [
      '20-year cash flow',
      '3 market scenarios',
      'sensitivity ranking',
      'reconciliation against public benchmarks',
      'editable Excel model',
    ],
    terms: 'Commissioned per-project by KKME Advisory.',
    contact_email: 'kastytis@kkme.eu',
  },
  rate_limited:
    'Ten sample runs a day is the limit on the public calculator. If you are working through a ' +
    'real project, that is worth a conversation rather than another form — get in touch and the ' +
    'full model comes with it.',
  auth_unconfigured: 'calculator auth not configured',
  auth_failed: 'Incorrect password.',
  auth_expired: 'Session expired — sign in again.',
};

// ── Duration ───────────────────────────────────────────────────────────────

/**
 * The engine is calibrated at exactly TWO durations, verified empirically
 * before this endpoint was designed rather than assumed from the parameter
 * name (12 prompt-premise corrections say check).
 *
 * `dur_h` is a free parameter, but the revenue it produces is a STEP function
 * of it. Sweeping 0.25h → 10h against the frozen KV fixture at 50 MW / mid
 * CAPEX / COD 2028 / base gives three plateaus and nothing in between:
 *
 *   dur_h ≤ 2      net €147 154/MW/yr   (2h calibration, 2h RTE curve)
 *   2 < dur_h < 3  net €157 651/MW/yr   (4h throughput constants, 2h RTE curve)
 *   dur_h ≥ 3      net €158 369/MW/yr   (4h calibration, 4h RTE curve)
 *
 * The cause is that every revenue-side duration branch is discrete —
 * `mwh_per_mw_yr_da_{2h,4h}` and `RTE_BOL.{h2,h4}` — while only CAPEX scales
 * continuously (`gross_capex = capex_kwh × mw × dur_h × 1000`). A 10h battery
 * is therefore modelled as a 4h battery costing 2.5× as much, which is not a
 * 10h battery. The middle band is worse than coarse: it takes throughput from
 * the 4h calibration and the RTE curve from the 2h one, because the two
 * branches disagree on where the boundary is (`dur_h <= 2` vs `dur_h >= 3`).
 * That band is an inconsistency, not an interpolation.
 *
 * So the calculator clamps the duration it hands the engine to the nearest
 * calibration point. The midpoint is 3h, which is also the engine's own RTE
 * branch — clamping therefore removes the mixed band by construction.
 */
export const CALIBRATION_DURATIONS_H = [2, 4];
export const DURATION_CLAMP_MIDPOINT_H = 3;

/**
 * Resolve the geometry actually handed to the engine.
 *
 * CAPEX is compensated so the user's real energy capacity still drives cost:
 * the engine derives `gross_capex` from `capex_kwh × mw × dur_h`, so feeding
 * the clamped duration alone would quote a 3h project at 4h CAPEX. Scaling the
 * rate by `actual_mwh / engine_mwh` lands `gross_capex` on the user's true
 * €/kWh × their true MWh. Revenue is the calibration point's; cost is theirs.
 *
 * The bias direction is stated rather than buried: clamping UP (a 3h asset
 * priced on the 4h revenue calibration) overstates revenue, clamping DOWN
 * understates it. Exact 2h and 4h inputs — which is every Prosperus config and
 * the public reference asset — clamp to themselves and carry no note at all.
 */
export function resolveDuration(mw, mwh, capex_eur_kwh) {
  const actual_h = mwh / mw;
  const engine_h = actual_h < DURATION_CLAMP_MIDPOINT_H ? 2 : 4;
  const engine_mwh = mw * engine_h;
  const clamped = engine_h !== actual_h;

  return {
    actual_h: Math.round(actual_h * 1e6) / 1e6,
    engine_h,
    engine_mwh,
    // Compensating rate: engine_capex = rate × engine_mwh × 1000 = true CAPEX.
    engine_capex_eur_kwh: clamped ? capex_eur_kwh * (mwh / engine_mwh) : capex_eur_kwh,
    clamped,
    duration_note: !clamped ? null : {
      actual_duration_h: Math.round(actual_h * 100) / 100,
      modelled_at_duration_h: engine_h,
      calibration_points_h: CALIBRATION_DURATIONS_H,
      revenue_basis:
        `Revenue is computed at the engine's ${engine_h}h calibration point, the nearest of the ` +
        `two durations the engine is calibrated for (${CALIBRATION_DURATIONS_H.join('h and ')}h). ` +
        'Between them the engine does not interpolate — its throughput and round-trip-efficiency ' +
        'constants are selected discretely — so a duration in between is reported at a calibration ' +
        'point rather than at a number the engine cannot actually produce.',
      capex_basis:
        `CAPEX is your figure: €${capex_eur_kwh}/kWh × ${mwh} MWh. It is not clamped.`,
      direction: engine_h > actual_h
        ? `Modelled above the actual duration, so revenue is OVERSTATED for a ${Math.round(actual_h * 100) / 100}h asset.`
        : `Modelled below the actual duration, so revenue is UNDERSTATED for a ${Math.round(actual_h * 100) / 100}h asset.`,
    },
  };
}

// ── Validation ─────────────────────────────────────────────────────────────

export const CALC_LIMITS = {
  mw: [1, 1000],
  mwh: [1, 4000],
  duration_h: [0.5, 8],
  cod_year: [2026, 2035],
  capex_eur_kwh: [80, 400],
  availability_pct: [80, 100],
  cycles_efc_yr: [50, 2000],
  warranty_efc_yr: [100, 2000],
  operating_months_y1: [1, 12],
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function range(errors, label, value, key, { integer = false } = {}) {
  const [lo, hi] = CALC_LIMITS[key];
  const v = num(value);
  if (v === null) {
    errors.push(`${label} is required and must be a number.`);
    return null;
  }
  if (integer && !Number.isInteger(v)) {
    errors.push(`${label} must be a whole number.`);
    return null;
  }
  if (v < lo || v > hi) {
    errors.push(`${label} must be between ${lo} and ${hi} — got ${v}.`);
    return null;
  }
  return v;
}

function optRange(errors, label, value, key, { integer = false } = {}) {
  if (value === undefined || value === null) return null;
  return range(errors, label, value, key, { integer });
}

/**
 * Validate a /calculate body. Returns `{ ok, errors, inputs }`.
 * Messages state the actual limit and the actual value — a validation error a
 * visitor cannot act on is just a wall.
 */
export function validateCalcInput(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }

  const mw = range(errors, 'Power (MW)', body.mw, 'mw');
  const mwh = range(errors, 'Energy (MWh)', body.mwh, 'mwh');
  const cod_year = range(errors, 'COD year', body.cod_year, 'cod_year', { integer: true });
  const capex_eur_kwh = range(errors, 'CAPEX (€/kWh)', body.capex_eur_kwh, 'capex_eur_kwh');

  if (mw !== null && mwh !== null) {
    const dur = mwh / mw;
    const [lo, hi] = CALC_LIMITS.duration_h;
    if (dur < lo || dur > hi) {
      errors.push(
        `Duration (MWh ÷ MW) must be between ${lo}h and ${hi}h — ${mwh} MWh over ${mw} MW is ` +
        `${Math.round(dur * 100) / 100}h.`
      );
    }
  }

  const availability_pct = optRange(errors, 'Availability (%)', body.availability_pct, 'availability_pct');
  const cycles_efc_yr = optRange(errors, 'Cycles (EFC/yr)', body.cycles_efc_yr, 'cycles_efc_yr');
  const warranty_efc_yr = optRange(errors, 'Warranty cap (EFC/yr)', body.warranty_efc_yr, 'warranty_efc_yr');
  const operating_months_y1 = optRange(
    errors, 'Operating months in year 1', body.operating_months_y1, 'operating_months_y1', { integer: true }
  );

  const scenario = body.scenario ?? 'central';
  if (!Object.prototype.hasOwnProperty.call(CLIENT_SCENARIO_KEYS, scenario)) {
    errors.push(`Scenario must be one of ${Object.keys(CLIENT_SCENARIO_KEYS).join(', ')} — got "${scenario}".`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    inputs: {
      mw, mwh, cod_year, capex_eur_kwh,
      availability_pct, cycles_efc_yr, warranty_efc_yr, operating_months_y1,
      scenario,
    },
  };
}

// ── Scenarios ──────────────────────────────────────────────────────────────

/** Client-facing case → the engine scenario name ported in 35.1. */
export const CLIENT_SCENARIO_KEYS = {
  downside: 'client_downside',
  central: 'base',
  upside: 'client_upside',
};

/**
 * One-at-a-time sensitivity probes (34.4 §3), as engine-native values.
 * `reach: 'engine'` drivers go through `params.driver_overrides`;
 * `reach: 'cost'` lands on the bridge cost stack and never touches the engine.
 */
export const SENSITIVITY_PROBES = [
  { id: 'fleet_realisation_pct', label: 'Pipeline realisation rate', unit: '%',
    reach: 'engine', key: 'fleet_realisation', central: 0.50, down: 0.65, up: 0.35,
    display: (v) => `${Math.round(v * 100)}%` },
  { id: 'spread_growth_pct_yr', label: 'DA spread growth', unit: '%/yr',
    reach: 'engine', key: 'spread_growth', central: 0.02, down: -0.01, up: 0.035,
    display: (v) => `${Math.round(v * 1000) / 10}%/yr` },
  { id: 'availability_pct', label: 'Availability factor', unit: '%',
    reach: 'engine', key: 'avail', central: 0.97, down: 0.95, up: 0.98,
    display: (v) => `${Math.round(v * 1000) / 10}%` },
  { id: 'trading_realisation', label: 'Trading realisation', unit: '×',
    reach: 'engine', key: 'trd_real', central: 0.85, down: 0.78, up: 0.88,
    display: (v) => `${v}×` },
  { id: 'cap_price_delta_pct', label: 'Reserve capacity price', unit: '%',
    reach: 'engine', key: 'cap_price_mult', central: 1.0, down: 0.75, up: 1.20,
    display: (v) => `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
  { id: 'cpi_floor', label: 'Cannibalisation-index floor', unit: '×',
    reach: 'engine', key: 'cpi_floor', central: 0.30, down: 0.28, up: 0.35,
    display: (v) => `${v}` },
  { id: 'rte_decay_pp_yr', label: 'RTE decay', unit: 'pp/yr',
    reach: 'engine', key: 'rte_decay', central: 0.0020, down: 0.0030, up: 0.0010,
    display: (v) => `${Math.round(v * 10000) / 100}pp/yr` },
  { id: 'optimiser_pct_gross', label: 'Optimiser fee', unit: '% of gross',
    reach: 'cost', key: 'optimiser_pct_gross', central: 0.12, down: 0.15, up: 0.08,
    display: (v) => `${Math.round(v * 1000) / 10}%` },
];

// ── Project config ─────────────────────────────────────────────────────────

/**
 * Build the pair of configs a run needs.
 *
 * `engine` carries the CLAMPED geometry and the compensating CAPEX rate — it is
 * what `computeRevenueV7` is parameterised with. `bridge` carries the user's
 * ACTUAL geometry, because the consultancy bridge sizes augmentation and
 * replacement CAPEX off real MWh. See `resolveDuration` for why the two differ.
 */
export function buildConfigs(inputs) {
  const dur = resolveDuration(inputs.mw, inputs.mwh, inputs.capex_eur_kwh);
  const first_operating_year = inputs.cod_year + 1;
  const operational_months_y1 = inputs.operating_months_y1 ?? 12;

  const shared = {
    project_id: 'calculator',
    name: 'Calculator project',
    mw: inputs.mw,
    cod: `${inputs.cod_year}-12`,
    cod_year: inputs.cod_year,
    first_operating_year,
    operational_months_y1,
    warranty_efc_yr: inputs.warranty_efc_yr ?? inputs.cycles_efc_yr ?? null,
  };

  return {
    duration: dur,
    engine: {
      ...shared,
      mwh: dur.engine_mwh,
      duration_h: dur.engine_h,
      capex_eur_kwh: dur.engine_capex_eur_kwh,
    },
    bridge: {
      ...shared,
      mwh: inputs.mwh,
      duration_h: dur.actual_h,
      capex_eur_kwh: inputs.capex_eur_kwh,
    },
  };
}

/** Engine params for one scenario of one run. */
export function engineParams(configs, inputs, scenarioKey, driver_overrides = null) {
  const overrides = { ...(driver_overrides || {}) };
  if (inputs.availability_pct != null && overrides.avail == null) {
    overrides.avail = inputs.availability_pct / 100;
  }
  const rte_decay = overrides.rte_decay;
  delete overrides.rte_decay;

  return {
    mw: configs.engine.mw,
    dur_h: configs.engine.duration_h,
    capex_kwh: configs.engine.capex_eur_kwh,
    cod_year: configs.engine.cod_year,
    scenario: scenarioKey,
    grant_pct: 0,
    project_config: configs.engine,
    ...(Object.keys(overrides).length ? { driver_overrides: overrides } : {}),
    ...(rte_decay != null ? { rte_decay } : {}),
  };
}

// ── Tier assembly ──────────────────────────────────────────────────────────

/** Round to euros; the bridge already does, this guards derived ratios. */
const r0 = (n) => (n == null ? null : Math.round(n));

/**
 * The 8 contract lines, in order, with the sign convention the client bridge
 * uses. `sub` marks a deduction so the UI can indent without knowing the
 * contract.
 */
export const BRIDGE_DISPLAY_LINES = [
  { key: 'gross_market_revenues', label: 'Gross market revenues', sub: false },
  { key: 'charging_costs', label: 'less charging costs', sub: true },
  { key: 'net_market_revenue', label: 'Net market revenue', sub: false },
  { key: 'optimiser', label: 'less optimiser / BRP', sub: true },
  { key: 'grid', label: 'less grid', sub: true },
  { key: 'market', label: 'less market participation', sub: true },
  { key: 'operating', label: 'less operating', sub: true },
  { key: 'project_ebitda', label: 'Project EBITDA', sub: false },
  { key: 'maintenance_capex', label: 'less maintenance capex', sub: true },
  { key: 'augmentation_capex', label: 'less augmentation capex', sub: true },
  { key: 'replacement_capex', label: 'less replacement capex', sub: true },
  { key: 'pre_financing_cf', label: 'Pre-financing cash flow', sub: false },
];

/**
 * The 8 summary lines the SAMPLE tier shows. The contract's bridge as the
 * client sees it, with no sub-line detail and no formulas.
 */
export const SAMPLE_BRIDGE_LINES = [
  'gross_market_revenues', 'charging_costs', 'net_market_revenue',
  'optimiser', 'grid', 'market', 'operating', 'project_ebitda',
];

function headlineOf(bridge_y1) {
  const gross = bridge_y1.gross_market_revenues;
  return {
    gross_y1: r0(gross),
    net_y1: r0(bridge_y1.net_market_revenue),
    ebitda_y1: r0(bridge_y1.project_ebitda),
    prefin_cf_y1: r0(bridge_y1.pre_financing_cf),
    ebitda_margin_pct: gross > 0 ? Math.round((bridge_y1.project_ebitda / gross) * 1000) / 10 : null,
  };
}

function inputsEcho(inputs, configs) {
  return {
    mw: inputs.mw,
    mwh: inputs.mwh,
    duration_h: configs.duration.actual_h,
    cod_year: inputs.cod_year,
    capex_eur_kwh: inputs.capex_eur_kwh,
    availability_pct: inputs.availability_pct,
    cycles_efc_yr: inputs.cycles_efc_yr,
    warranty_efc_yr: inputs.warranty_efc_yr,
    operating_months_y1: inputs.operating_months_y1 ?? 12,
    scenario: inputs.scenario,
    duration_note: configs.duration.duration_note,
    // Stated because the engine derives cycling from product throughput; a
    // supplied EFC figure is a comparison reference, not an engine input.
    cycles_note: inputs.cycles_efc_yr != null
      ? 'Cycles are derived by the engine from per-product throughput, not taken as an input. ' +
        'The figure you entered is carried as the warranty reference for the headroom line.'
      : null,
  };
}

/**
 * SAMPLE tier.
 *
 * Takes the already-narrowed pieces, NOT the engine result — the full object is
 * not in scope here, so there is nothing for a future edit to leak by accident.
 * The leak test asserts the built object against SAMPLE_ALLOWED_KEYS.
 */
export function buildSample({ headline, bridge_y1, inputs_echo, engine_version }) {
  const bridge = SAMPLE_BRIDGE_LINES.map((key) => {
    const line = BRIDGE_DISPLAY_LINES.find((l) => l.key === key);
    return { key, label: line.label, sub: line.sub, value: r0(bridge_y1[key]) };
  });

  return {
    tier: 'sample',
    engine_version,
    inputs_echo,
    headline,
    bridge_y1: bridge,
    sample_note: CALC_COPY.sample_note,
    upsell: CALC_COPY.upsell,
  };
}

/** Exactly the top-level keys a sample response may carry. Enforced by test. */
export const SAMPLE_ALLOWED_KEYS = [
  'tier', 'engine_version', 'inputs_echo', 'headline', 'bridge_y1', 'sample_note', 'upsell',
];

/**
 * Keys that would mean full-tier data has reached the sample tier. Checked
 * recursively at every depth by the leak test — a sample response must be
 * incapable of carrying these, not merely observed not to.
 */
export const FULL_TIER_MARKER_KEYS = [
  'bridge_20yr', 'bridge_totals', 'capex_schedule', 'sensitivity', 'scenarios',
  'reconciliation', 'cashflows', 'npv_pre_financing_pre_tax', 'moic', 'years',
  'engine', 'all_scenarios', 'matrix', 'base_year', 'project_irr', 'equity_irr',
];

/** Per-line basis strings, derived from the resolved constants — never hardcoded. */
function bridgeFormulas(costs, capex, config) {
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  return {
    gross_market_revenues:
      'Engine gross market revenue plus the charging cost rebuilt below — the engine prices ' +
      'arbitrage on a captured spread, so its own gross line is already net of charging.',
    charging_costs: 'Charged MWh (engine) × observed mean charging price (engine).',
    net_market_revenue: 'Gross market revenues − charging costs. Returns the engine gross exactly.',
    optimiser: `${pct(costs.optimiser_pct_gross)} of gross market revenues.`,
    grid: `${pct(costs.grid_pct_gross)} of gross market revenues.`,
    market: `${pct(costs.market_pct_gross)} of gross market revenues.`,
    operating:
      `€${costs.operating_eur_kw_yr}/kW/yr + €${costs.operating_calibration_eur_kw_yr}/kW/yr ` +
      `reconciliation calibration, × ${config.mw * 1000} kW, escalating at ` +
      `${pct(config.opex_esc ?? 0.025)}/yr` +
      ((config.operational_months_y1 ?? 12) < 12
        ? `, pro-rated to ${config.operational_months_y1}/12 in year 1.`
        : '.'),
    project_ebitda: 'Net market revenue − optimiser − grid − market − operating.',
    maintenance_capex: `€${capex.maintenance_eur_kw_yr}/kW/yr × ${config.mw * 1000} kW, annually.`,
    augmentation_capex:
      `Operating year ${capex.augmentation_year}: ${pct(capex.augmentation_mwh_pct)} of ` +
      `${config.mwh} MWh × €${capex.augmentation_eur_kwh}/kWh.`,
    replacement_capex:
      `Operating year ${capex.replacement_year}: ${pct(capex.replacement_mwh_pct)} of ` +
      `${config.mwh} MWh × €${capex.replacement_eur_kwh}/kWh.`,
    pre_financing_cf:
      'Project EBITDA − maintenance − augmentation − replacement capex. Pre-financing, pre-tax; ' +
      'debt, interest and DSCR are out of scope for this model.',
  };
}

/**
 * FULL tier. Assembles from the same per-project compute path the consultancy
 * runners use — `buildBridge` is imported, not reimplemented.
 */
export function buildFull({ result, bridge, config, scenarios, sensitivity, inputs_echo, engine_version }) {
  const costs = resolveCosts(config);
  const capex = resolveCapex(config);
  const cf = buildCashflows(
    [{ config, bridge_20yr: bridge.bridge_20yr, gross_capex: result.gross_capex }],
    { wacc: DEFAULT_WACC }
  );
  const formulas = bridgeFormulas(costs, capex, config);

  return {
    tier: 'full',
    engine_version,
    inputs_echo,
    headline: headlineOf(bridge.bridge_y1),
    returns: {
      wacc: DEFAULT_WACC,
      npv_pre_financing_pre_tax: npvOf(cf),
      moic: moicOf(cf),
      payback_years: paybackOf(cf),
      gross_capex: result.gross_capex,
      engine_project_irr: result.project_irr,
      engine_npv_post_tax: result.npv_at_wacc,
      basis:
        'Pre-financing, pre-tax bridge cash flow discounted at WACC from the CAPEX draw year. ' +
        'Not comparable with a post-tax equity NPV; the engine\'s post-tax figure sits alongside.',
    },
    bridge_y1: BRIDGE_DISPLAY_LINES.map((l) => ({
      key: l.key,
      label: l.label,
      sub: l.sub,
      value: r0(bridge.bridge_y1[l.key]),
      formula: formulas[l.key],
    })),
    bridge_20yr: bridge.bridge_20yr,
    bridge_totals: bridge.bridge_totals,
    capex_schedule: bridge.capex_schedule,
    cost_basis: bridge.cost_basis,
    capex_basis: bridge.capex_basis,
    bridge_notes: bridge.bridge_notes,
    cashflows: cf,
    scenarios,
    sensitivity,
    reconciliation: bridge.cost_basis?.reconciliation ?? null,
    warranty: {
      efcs_per_year: result.project?.total_efcs_yr ?? result.total_efcs_yr ?? null,
      warranty_efc_yr: config.warranty_efc_yr ?? null,
      headroom_efc_yr: result.project?.warranty_headroom_efc_yr ?? null,
    },
  };
}

// ── Auth ───────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** Length-independent, value-independent comparison. */
export function timingSafeEqual(a, b) {
  const ab = enc.encode(String(a));
  const bb = enc.encode(String(b));
  // Fold the length difference in rather than returning early on it.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const CALC_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Token = `<expiry-ms>.<HMAC-SHA256("calc:<expiry-ms>", CALC_SECRET)>`.
 *
 * No user store and no session store: there is one operator. The expiry is
 * inside the signed message, so it cannot be extended by editing the token.
 */
export async function signCalcToken(secret, expiresAt) {
  return `${expiresAt}.${await hmacHex(secret, `calc:${expiresAt}`)}`;
}

export async function verifyCalcToken(secret, token, now = Date.now()) {
  if (!secret) return { ok: false, reason: 'unconfigured' };
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'malformed' };
  const idx = token.indexOf('.');
  const expiresAt = Number(token.slice(0, idx));
  const sig = token.slice(idx + 1);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: 'malformed' };
  // Signature first, so an expired-vs-forged token is not distinguishable by
  // the order of the checks.
  const expected = await hmacHex(secret, `calc:${expiresAt}`);
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' };
  if (expiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true, expiresAt };
}

/** Bearer token from an Authorization header, or null. */
export function bearerToken(request) {
  const h = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

// ── Rate limit ─────────────────────────────────────────────────────────────

export const SAMPLE_RATE_LIMIT_PER_DAY = 10;

export function rateLimitKey(ip, now = new Date()) {
  return `calc_rate:${ip}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Per-IP, per-UTC-day counter for the sample tier. Full tier is not limited.
 *
 * KV is eventually consistent, so a burst across colos can overshoot slightly.
 * That is the right trade here: this exists to stop casual scraping, and a
 * strongly-consistent counter would mean a Durable Object for a lead-gen form.
 */
export async function checkSampleRateLimit(kvNamespace, ip, now = new Date()) {
  if (!kvNamespace || !ip) return { allowed: true, count: 0, limit: SAMPLE_RATE_LIMIT_PER_DAY };
  const key = rateLimitKey(ip, now);
  let count = 0;
  try {
    count = parseInt((await kvNamespace.get(key)) || '0', 10) || 0;
  } catch {
    return { allowed: true, count: 0, limit: SAMPLE_RATE_LIMIT_PER_DAY, degraded: true };
  }
  if (count >= SAMPLE_RATE_LIMIT_PER_DAY) {
    return { allowed: false, count, limit: SAMPLE_RATE_LIMIT_PER_DAY };
  }
  try {
    await kvNamespace.put(key, String(count + 1), { expirationTtl: 86400 });
  } catch { /* counting is best-effort; never fail a run on it */ }
  return { allowed: true, count: count + 1, limit: SAMPLE_RATE_LIMIT_PER_DAY };
}

// ── Run ────────────────────────────────────────────────────────────────────

/**
 * Run the engine for one scenario and build its bridge.
 * `compute` is `computeRevenueV7`, injected so this module never imports the
 * worker and the worker keeps one engine home.
 */
export function runOne(compute, kv, configs, inputs, scenarioKey, driver_overrides = null, costOverrides = null) {
  const params = engineParams(configs, inputs, scenarioKey, driver_overrides);
  const result = compute(params, kv);
  const bridgeConfig = costOverrides
    ? { ...configs.bridge, costs: { ...(configs.bridge.costs ?? {}), ...costOverrides } }
    : configs.bridge;
  return { result, bridge: buildBridge(result, bridgeConfig), config: bridgeConfig };
}

/** The three client cases, as the deliverable presents them. */
export function runScenarios(compute, kv, configs, inputs) {
  const out = {};
  for (const [caseName, scenarioKey] of Object.entries(CLIENT_SCENARIO_KEYS)) {
    const { result, bridge } = runOne(compute, kv, configs, inputs, scenarioKey);
    out[caseName] = {
      label: caseName[0].toUpperCase() + caseName.slice(1),
      engine_scenario: scenarioKey,
      headline: headlineOf(bridge.bridge_y1),
      sum_20yr_prefin_cf: bridge.bridge_totals.pre_financing_cf,
      project_irr: result.project_irr,
    };
  }
  return out;
}

/**
 * One-at-a-time sensitivity, ranked by absolute Y1 EBITDA swing.
 *
 * Every probe is the engine's own arithmetic under one changed constant — no
 * elasticity is assumed, and a driver that moves nothing is reported as moving
 * nothing rather than being dropped from the table (two of them genuinely do
 * not move: batch-2's finding, restated by measurement here).
 */
export function runSensitivity(compute, kv, configs, inputs, baselineEbitda) {
  const rows = SENSITIVITY_PROBES.map((p) => {
    const at = (v) => {
      const { bridge } = p.reach === 'cost'
        ? runOne(compute, kv, configs, inputs, CLIENT_SCENARIO_KEYS[inputs.scenario], null, { [p.key]: v })
        : runOne(compute, kv, configs, inputs, CLIENT_SCENARIO_KEYS[inputs.scenario], { [p.key]: v });
      return bridge.bridge_y1.project_ebitda;
    };
    const down = at(p.down);
    const up = at(p.up);
    return {
      id: p.id,
      label: p.label,
      central_display: p.display(p.central),
      down_display: p.display(p.down),
      up_display: p.display(p.up),
      ebitda_down: r0(down),
      ebitda_up: r0(up),
      delta_down: r0(down - baselineEbitda),
      delta_up: r0(up - baselineEbitda),
      swing: r0(Math.abs(up - down)),
    };
  });
  rows.sort((a, b) => b.swing - a.swing);
  return {
    basis_ebitda_y1: r0(baselineEbitda),
    note:
      'Each driver moved to its Downside and Upside value one at a time, everything else held at ' +
      'the run scenario. Ranked by the spread between the two. A zero swing is a measured result, ' +
      'not an omission.',
    rows,
  };
}

export { headlineOf, inputsEcho };
