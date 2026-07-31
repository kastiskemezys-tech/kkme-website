// Normalised cross-market price schema for the 36.E mature-market evidence base.
//
// One row = one price observation for one product, in one market, over one period,
// at the resolution the source actually publishes. Storage never resamples
// (arc §36.E0 §2); analysis resamples explicitly and says so.
//
// `price` is in `currency` at `price_unit`. `price_eur` is the same number converted
// at the period-average ECB rate from `fx.mjs`; for EUR-native rows they are equal and
// `fx_rate` is 1.
//
// `price_basis` exists because "the price" is not one thing across market designs:
//   clearing            — pay-as-clear settlement price published by the operator
//   marginal_accepted   — highest accepted bid price (pay-as-bid: the market signal)
//   vwap_accepted       — mean accepted bid price (pay-as-bid: what a provider actually
//                         earns, and the number a revenue model needs)
//   settlement          — a settled spot/imbalance price
//   vwap_activated      — volume-weighted average price of the balancing energy ACTUALLY
//                         ACTIVATED in one ISP and direction, as settled. This is the
//                         activation price an operating battery is paid. Distinct from
//                         vwap_accepted (a CAPACITY auction's mean accepted bid) and the
//                         opposite of offer_curve_mean: it describes what cleared, not
//                         what was offered. Sparse by construction — an ISP with no
//                         activation has no price, which is not a price of zero.
//   offer_curve_mean    — mean price of the OFFERED merit-order list, accepted or not.
//                         NOT a settled price. German RAM energy exports are of this
//                         kind: they describe the supply curve, not what was activated.
//                         Treating one as an activation price overstates revenue.
// A pay-as-bid market has no clearing price. Reporting one would be a fabrication, so
// DE aFRR/mFRR capacity rows carry vwap_accepted as `price` and the marginal in `extra`.
//
// `price_norm` / `price_norm_unit` exist because published units are not comparable
// across eras within one market, let alone across markets. Germany relabelled aFRR and
// mFRR capacity from `EUR/MW` (per 4 h product) to `(EUR/MW)/h` in December 2021 without
// any market change — a silent 4x. FCR is still published per product period, so its
// daily-product era (2019-07..2020-06) is 24x its own later 4 h era. `price_norm` is
// always EUR/MW/h for capacity and EUR/MWh for energy, computed from `price`,
// `price_unit` and the product duration. Analysis uses `price_norm`; `price` keeps the
// source's own number so the conversion stays auditable.

export const PRODUCTS = /** @type {const} */ ([
  'FCR', 'aFRR', 'mFRR',           // ENTSO-E / DE naming
  'FCR-N', 'FCR-D-up', 'FCR-D-down', // Nordic
  // GB. DC/DM/DR are the response services; -low/-high name the FREQUENCY the product
  // answers, which is the source's own convention and the opposite of the power direction:
  // a low-frequency product injects (up), a high-frequency product absorbs (down). Both are
  // carried, `product` for the service and `direction` for the power, so neither convention
  // has to be remembered.
  'DC-low', 'DC-high', 'DM-low', 'DM-high', 'DR-low', 'DR-high', 'FFR',
  // GB reserve services procured through EAC alongside response — the "where revenue goes
  // after response saturates" evidence. Source codes are P/N prefixed (positive/negative).
  'BR-up', 'BR-down', 'QR-up', 'QR-down', 'SR-up', 'SR-down',
  'spot',                          // wholesale energy (AU/LT arbitrage evidence)
]);

export const MECHANISMS = /** @type {const} */ (['cap', 'energy']);
export const DIRECTIONS = /** @type {const} */ (['up', 'down', 'symmetric']);
export const PRICE_BASES = /** @type {const} */ ([
  'clearing', 'marginal_accepted', 'vwap_accepted', 'settlement', 'vwap_activated', 'offer_curve_mean',
]);

export const NORM_UNITS = /** @type {const} */ (['EUR/MW/h', 'EUR/MWh']);

/** Field order is fixed so committed NDJSON diffs stay readable. */
export const FIELDS = [
  'market', 'area', 'product', 'direction', 'mechanism',
  'period_start', 'period_end', 'resolution',
  'price', 'price_unit', 'currency', 'price_eur', 'fx_rate',
  'price_norm', 'price_norm_unit',
  'volume', 'volume_unit', 'price_basis', 'notes', 'extra',
];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const RESOLUTION = /^P(T?)(\d+)(M|H|D)$/;

/**
 * Validate one row. Returns an array of problems; empty means valid.
 * Deliberately strict about nulls: a missing price must be `null`, never 0 —
 * Svenska kraftnät serves absence as zero and that trap is why this check exists.
 */
export function validateRow(r) {
  const bad = [];
  if (!r.market || typeof r.market !== 'string') bad.push('market');
  if (!PRODUCTS.includes(r.product)) bad.push(`product=${r.product}`);
  if (!MECHANISMS.includes(r.mechanism)) bad.push(`mechanism=${r.mechanism}`);
  if (r.direction !== null && !DIRECTIONS.includes(r.direction)) bad.push(`direction=${r.direction}`);
  if (!ISO.test(r.period_start ?? '')) bad.push(`period_start=${r.period_start}`);
  if (!ISO.test(r.period_end ?? '')) bad.push(`period_end=${r.period_end}`);
  if (!RESOLUTION.test(r.resolution ?? '')) bad.push(`resolution=${r.resolution}`);
  if (r.period_end <= r.period_start) bad.push('period_end<=period_start');
  if (r.price !== null && !Number.isFinite(r.price)) bad.push(`price=${r.price}`);
  if (r.price !== null && !PRICE_BASES.includes(r.price_basis)) bad.push(`price_basis=${r.price_basis}`);
  if (!r.price_unit) bad.push('price_unit');
  if (!r.currency) bad.push('currency');
  if (r.price !== null && r.price_eur === null) bad.push('price set but price_eur null');
  if (r.price !== null && r.price_norm === null) bad.push('price set but price_norm null');
  if (r.price_norm !== null && !NORM_UNITS.includes(r.price_norm_unit)) bad.push(`price_norm_unit=${r.price_norm_unit}`);
  if (r.mechanism === 'cap' && r.price_norm !== null && r.price_norm_unit !== 'EUR/MW/h') bad.push('cap rows normalise to EUR/MW/h');
  if (r.mechanism === 'energy' && r.price_norm !== null && r.price_norm_unit !== 'EUR/MWh') bad.push('energy rows normalise to EUR/MWh');
  if (r.volume !== null && !Number.isFinite(r.volume)) bad.push(`volume=${r.volume}`);
  if (r.volume !== null && !r.volume_unit) bad.push('volume set but volume_unit null');
  return bad;
}

/**
 * Convert a published capacity price to EUR/MW/h.
 * `unit` comes from the source's own header text — never from a hardcoded date, because
 * the relabel date is exactly the kind of fact that gets misremembered (rule #2).
 * Returns null when the unit is unrecognised, so an unknown unit fails a gate rather
 * than silently producing a number that is wrong by the product length.
 */
export function capacityToEurPerMwPerHour(price, unit, durationHours) {
  if (price === null || !Number.isFinite(price)) return null;
  const u = String(unit).replace(/[()\s]/g, '').toUpperCase();
  if (u === 'EUR/MW/H') return price;                                  // already per hour
  if (u === 'EUR/MW') return durationHours > 0 ? price / durationHours : null; // per product period
  return null;
}

/** Normalise a partial row into full field order with explicit nulls. */
export function row(partial) {
  const out = {};
  for (const f of FIELDS) out[f] = partial[f] ?? null;
  return out;
}

export function toNdjson(rows) {
  return rows.map((r) => JSON.stringify(row(r))).join('\n') + '\n';
}
