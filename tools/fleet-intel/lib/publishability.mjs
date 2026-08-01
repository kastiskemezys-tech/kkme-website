// Phase 37 — the one place that decides whether a row's facts may reach a
// published or client-facing number.
//
// It lives here, not in the worker, because two consumers need the identical
// answer and a second copy is a second answer waiting to happen (rule #4):
//   - workers/lib/fleetCrm.js — the operator console, which shows the verdict
//   - tools/fleet-intel/lib/supply.mjs — 37.D, which weights supply by it
//
// The distinction it encodes is the whole finding of batch-2's Pause A: a
// verification TIER is not a licence to publish a CAPACITY. All 36 public-confirmed
// rows in the current evidence set carry exactly one registry citation, each of the
// form "entity resolves in the Latvian Uzņēmumu reģistrs, reg. NNNN, status active".
// That confirms a company exists. It says nothing about a battery.

const RESOLVABLE = /^https?:\/\//;

/**
 * Does a citation speak to CAPACITY, as opposed to the existence of the company?
 *
 * Matched on the citation's own `what_it_confirms` wording, in the languages the
 * source stack actually produces: English MW/MWh/capacity, Latvian `jauda`,
 * Lithuanian `galia`, and the shared `megavat-` stem.
 */
export function citationSpeaksToCapacity(citation) {
  const what = String(citation?.what_it_confirms ?? '').toLowerCase();
  return /\b(mw|mwh|capacity|jauda|galia|megavat)/.test(what);
}

/**
 * @returns {{publishable:boolean, capacity_citable:boolean, reason:string}}
 *
 * `publishable` — the row's EXISTENCE is publicly corroborated.
 * `capacity_citable` — its CAPACITY is. Only the second licenses a megawatt.
 */
export function publishability(row) {
  const tier = row?.verification_status;
  if (tier !== 'public-confirmed' && tier !== 'corroborated') {
    return { publishable: false, capacity_citable: false, reason: 'no public source corroborates this row' };
  }
  const citations = Array.isArray(row?.citations) ? row.citations : [];
  const resolvable = citations.filter((c) => c && RESOLVABLE.test(String(c.url ?? '')));
  if (resolvable.length === 0) {
    return { publishable: false, capacity_citable: false, reason: 'no citation with a resolvable URL' };
  }
  const capacity = resolvable.some(citationSpeaksToCapacity);
  return {
    publishable: true,
    capacity_citable: capacity,
    reason: capacity
      ? 'citation speaks to capacity'
      : 'citation confirms the legal entity only — the capacity is not citable',
  };
}
