// Phase 37.D — wiring the verified fleet into the supply trajectory.
//
// The arc's instruction is "verification tier maps to confidence weighting:
// public-confirmed full STATUS_WEIGHT · corroborated haircut · private-only
// EXCLUDED". Implementing exactly that and stopping there would have been wrong,
// and Pause A is why:
//
//   All 36 public-confirmed rows carry exactly one citation, all from data.gov.lv,
//   all of the form "entity resolves in the Latvian Uzņēmumu reģistrs, reg. NNNN,
//   status active". Their bess_mw sums to 0.0 MW. Their only power figure is
//   site_total_mw (3 583.5 MW) and their only technology figure is plant_type —
//   BOTH of which come from the private workbook, not from the citation.
//
// A registry citation proves a COMPANY exists. It does not prove a battery exists
// or how large it is. Tier alone would therefore have licensed publishing 3 583.5
// MW of private testimony wearing a registry citation, which rule #3 and the arc's
// own privacy architecture both forbid ("a row that only exists in the private
// table stays private-only until a public source corroborates it" — corroborating
// the company is not corroborating the capacity).
//
// So the weighting is a CONJUNCTION: tier decides the haircut, capacity-citability
// decides whether there is anything to haircut. Today the second gate is closed for
// every row, and the verified bottom-up contribution to published supply is 0 MW.
// That is the correct result under our own rules, and it is asserted, not assumed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publishability } from './publishability.mjs';

export const TIERS = Object.freeze({
  PUBLIC_CONFIRMED: 'public-confirmed',
  CORROBORATED: 'corroborated',
  PRIVATE_ONLY: 'private-only',
});

/**
 * Confidence weighting by tier, applied ON TOP of STATUS_WEIGHT.
 *
 * `private-only` is 0 rather than "small": the arc excludes it from published and
 * client-facing numbers outright, and a small non-zero weight is still a published
 * number derived from uncitable data.
 */
export const TIER_WEIGHT = Object.freeze({
  [TIERS.PUBLIC_CONFIRMED]: 1.0,
  [TIERS.CORROBORATED]: 0.6,
  [TIERS.PRIVATE_ONLY]: 0.0,
});

export const HYBRID_BAND_PATH = fileURLToPath(
  new URL('../data/hybrid-band.json', import.meta.url),
);

/**
 * Re-derive the hybrid band FROM THE ARTIFACT, never from the private column.
 *
 * The prompt's constraint in full: "the hybrid over-count is a BAND, never a
 * correction. hybrid-band.json is the input; 37.D re-derives from that artifact and
 * inherits the band — no re-computation from the private BESS-MW column, whatever
 * its magnitude."
 *
 * Direction check, recorded here because it is the reason for the constraint: a
 * hybrid correction moves supply DOWN → sd_ratio down → cannibalisation down →
 * IRR UP. That is the flattering direction, and flattering movements need the
 * strongest evidence available. We do not have it — the artifact says only 24 of
 * 45 known hybrids carry a public technology signal — so it ships as a band whose
 * own lower bound is acknowledged to be an overestimate of the true floor.
 */
export function hybridBand(path = HYBRID_BAND_PATH) {
  const artifact = JSON.parse(readFileSync(path, 'utf8'));
  const b = artifact.band;
  if (!Number.isFinite(b?.lower_bess_mw) || !Number.isFinite(b?.upper_bess_mw)) {
    throw new Error('hybrid-band.json is missing its bounds — refusing to guess');
  }
  if (b.lower_bess_mw > b.upper_bess_mw) {
    throw new Error('hybrid band is inverted — refusing to publish it');
  }
  return {
    lower_mw: b.lower_bess_mw,
    upper_mw: b.upper_bess_mw,
    width_mw: b.width_mw,
    basis: b.basis,
    derivation: b.derivation,
    // Carried through verbatim so no consumer can display the band without it.
    incompleteness: artifact.incompleteness,
    rules_for_consumers: artifact.rules_for_consumers,
    // There is deliberately no midpoint field. "A midpoint is a point estimate
    // wearing a range costume" — the artifact's own rule.
    provenance: artifact.provenance,
  };
}

/**
 * The verified bottom-up contribution to PUBLISHED supply.
 *
 * Returns MW plus the full audit of why each row did or did not contribute, so the
 * zero is legible rather than mysterious.
 */
export function verifiedSupplyContribution(rows) {
  const included = [];
  const excluded = [];
  let mw = 0;

  for (const row of rows ?? []) {
    const tier = row?.verification_status;
    const pub = publishability(row);
    const tierWeight = TIER_WEIGHT[tier] ?? 0;

    // Both gates must open. Tier alone is not enough — see the header.
    if (!pub.capacity_citable || tierWeight === 0) {
      excluded.push({
        id: row?.id,
        tier,
        reason: !pub.capacity_citable
          ? pub.reason
          : 'tier carries zero confidence weight',
      });
      continue;
    }
    // Only a citable capacity figure may be counted, never site_total_mw — the
    // connection capacity of a site is not the rating of its battery.
    const bess = Number.isFinite(row.bess_mw) ? row.bess_mw : 0;
    const contribution = bess * tierWeight;
    mw += contribution;
    included.push({ id: row.id, tier, bess_mw: bess, tier_weight: tierWeight, contribution_mw: contribution });
  }

  return {
    mw: Math.round(mw * 10) / 10,
    included,
    excluded_count: excluded.length,
    excluded,
    basis:
      'Only rows whose citation speaks to CAPACITY contribute. A registry citation ' +
      'confirms a legal entity, not a battery or its size.',
  };
}

/** Rows that must never touch a published number, with the count for assertions. */
export function privateOnlyRows(rows) {
  return (rows ?? []).filter((r) => !publishability(r).capacity_citable);
}

/**
 * The three supply bases, side by side.
 *
 * Deliberately NOT reconciled to each other. They are three different claims about
 * the same market — a bottom-up count of what we can cite, the TSO's own scenario,
 * and what the platform published before this phase. A tolerance band across them
 * would have to be so wide it asserted nothing (the 36.D precedent).
 */
export function threeSupplyBases({ fleetEntries, privateRows, litgridMwForYear, years = [2028, 2030, 2033, 2035] }) {
  const band = hybridBand();
  const verified = verifiedSupplyContribution(privateRows);
  const publicFleetMw = (fleetEntries ?? []).reduce((s, e) => s + (Number(e.mw) || 0), 0);

  return {
    id: 'supply_basis_three_way',
    label: 'KKME-verified bottom-up · Litgrid L TrSc · pre-37 baseline',
    gated: false,
    bases: {
      pre_37_baseline: {
        label: 'Pre-37 baseline — the public fleet as published',
        baltic_mw: Math.round(publicFleetMw * 10) / 10,
        basis: 'sum of public fleet entry MW, every entry at full site capacity',
      },
      kkme_verified_bottom_up: {
        label: 'KKME-verified bottom-up — 37.A evidence set',
        added_mw: verified.mw,
        baltic_mw: Math.round((publicFleetMw + verified.mw) * 10) / 10,
        rows_considered: (privateRows ?? []).length,
        rows_contributing: verified.included.length,
        basis: verified.basis,
        note:
          verified.mw === 0
            ? 'Zero. No row in the evidence set carries a citation that speaks to capacity, ' +
              'so there is nothing citable to add. This is a finding about the evidence, ' +
              'not about the market.'
            : null,
      },
      litgrid_l_trsc: {
        label: 'Litgrid L TrSc — the TSO\'s own published series (LT only)',
        by_year: Object.fromEntries(years.map((y) => [y, litgridMwForYear ? litgridMwForYear(y) : null])),
        basis: 'as-published, no realisation rate and no haircut of ours',
      },
    },
    hybrid_band: band,
    note:
      'Three claims about the same market, not a target and two measurements. The hybrid ' +
      'band applies to all three: any figure here counts hybrid sites at full connection ' +
      'capacity (the band\'s UPPER bound), because no public source decomposes them.',
  };
}

/**
 * Retired-MW accounting tie.
 *
 * A first-class check rather than a footnote, because batch-1's near-miss was
 * exactly this arithmetic: an untrimmed truthiness test on a whitespace-only field
 * marked all 486 509 Latvian entities terminated, Latvenergo included, while every
 * other gate stayed green. Retirement that does not balance is retirement that is
 * not trustworthy.
 */
export function retiredMwAccounting({ transitions = [], fleetEntries = [] }) {
  const byId = new Map((fleetEntries ?? []).map((e) => [e.id, e]));
  const retired = transitions.filter((t) => t && t.type === 'retired');

  let tiedMw = 0;
  const unmatched = [];
  const uncited = [];
  for (const t of retired) {
    const entry = byId.get(t.id);
    if (!entry) { unmatched.push(t.id); continue; }
    const cited = (t.evidence ?? []).filter((e) => e && /^https?:\/\//.test(String(e.url ?? '')));
    if (cited.length === 0) { uncited.push(t.id); continue; }
    tiedMw += Number(entry.mw) || 0;
  }

  const ok = unmatched.length === 0 && uncited.length === 0;
  return {
    id: 'retired_mw_accounting',
    label: 'Retired MW ties to fleet entries, every retirement cited',
    gated: true,
    ok,
    retired_count: retired.length,
    retired_mw: Math.round(tiedMw * 10) / 10,
    unmatched_ids: unmatched,
    uncited_ids: uncited,
    note: ok
      ? 'Every retirement resolves to a fleet entry and carries a resolvable citation.'
      : 'A retirement that matches no fleet entry, or carries no citation, cannot be ' +
        'subtracted from supply — the MW would vanish from the trajectory with nothing ' +
        'to point at.',
  };
}

/**
 * The assertion every published payload must pass.
 *
 * Returns offending row ids. Used by the payload tests AND by any producer of a
 * public artifact, so the exclusion is enforced where the payload is built rather
 * than only described in a document.
 */
export function assertNoPrivateOnlyInPublished(payload, privateRows) {
  const forbidden = privateOnlyRows(privateRows);
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);
  const hits = [];
  for (const r of forbidden) {
    for (const field of ['id', 'spv', 'contact', 'comment', 'apva_flag', 'raw_power_text']) {
      const v = r?.[field];
      if (typeof v === 'string' && v.trim().length > 5 && text.includes(v.trim())) {
        hits.push(`${r.id}.${field}`);
      }
    }
  }
  return hits;
}
