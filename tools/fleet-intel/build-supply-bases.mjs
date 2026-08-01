#!/usr/bin/env node
// Phase 37.D — the three-supply-bases artifact.
//
// Arc §37.D.2: "three supply bases now: KKME-verified bottom-up · Litgrid top-down
// · pre-37 baseline. The comparison itself becomes a client-conversation artifact:
// 'the TSO projects X; our verified bottom-up sees Y'."
//
// A note on what this run actually found, because it changes the shape of the
// artifact: Y is ZERO. Not "small" — zero. All 36 public-confirmed rows in the 37.A
// evidence set carry exactly one citation each, all from the Latvian Uzņēmumu
// reģistrs bulk register, all confirming that a legal entity exists and is active.
// None states a capacity. The rows' only power figure (site_total_mw) and only
// technology figure (plant_type) come from the operator's private workbook.
//
// So the honest client artifact is not "the TSO projects X, we see Y". It is "the
// TSO projects X; we can cite the existence of N companies and the capacity of
// none of them, and here is exactly why". That is a more useful thing to hand a
// client than a number we would have to withdraw.
//
// The builder REFUSES to write if any private-only row's data reaches the output.
//
// Usage: node tools/fleet-intel/build-supply-bases.mjs [--offline]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  threeSupplyBases, verifiedSupplyContribution, retiredMwAccounting,
  assertNoPrivateOnlyInPublished, privateOnlyRows, TIER_WEIGHT,
} from './lib/supply.mjs';
import { LITGRID_LT_BESS_MW, LITGRID_LT_BESS_META } from '../../workers/lib/demand-forecast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/fleet-intel/data/supply-bases.json');
const PRIVATE_IN = path.join(ROOT, 'docs/_private/fleet-intel/intake-latest.json');
const FLEET_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/fleet';
const FLEET_CACHE = path.join(ROOT, '.cache/s4-fleet-supply-bases.json');

const litgridMwForYear = (y) => LITGRID_LT_BESS_MW[y] ?? null;

async function loadFleet(offline) {
  if (offline && fs.existsSync(FLEET_CACHE)) {
    return { ...JSON.parse(fs.readFileSync(FLEET_CACHE, 'utf8')), _offline: true };
  }
  const res = await fetch(FLEET_URL);
  if (!res.ok) throw new Error(`fleet fetch failed: HTTP ${res.status}`);
  const fleet = await res.json();
  fs.mkdirSync(path.dirname(FLEET_CACHE), { recursive: true });
  fs.writeFileSync(FLEET_CACHE, JSON.stringify(fleet));
  return fleet;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const fleet = await loadFleet(offline);
  const entries = fleet.raw_entries || [];

  // The private intake is optional: this builder must run in a clone that has no
  // private tier at all, and produce the same public artifact minus the bottom-up
  // basis. A builder that only works on the operator's laptop is not reviewable.
  let privateRows = [];
  if (fs.existsSync(PRIVATE_IN)) {
    privateRows = JSON.parse(fs.readFileSync(PRIVATE_IN, 'utf8')).rows || [];
  } else {
    console.warn('[supply-bases] no private intake present — bottom-up basis will report 0 rows considered');
  }

  const transitions = []; // fleet_lifecycle:transitions is empty; see the handover
  const bases = threeSupplyBases({ fleetEntries: entries, privateRows, litgridMwForYear });
  const verified = verifiedSupplyContribution(privateRows);
  const retired = retiredMwAccounting({ fleetEntries: entries, transitions });

  // Why each row failed to contribute, as counts only. Never per-row detail: the
  // reasons are keyed to rows that are private, and a "which rows failed" listing
  // is a private-row listing with extra steps.
  const reasonTally = {};
  for (const e of verified.excluded) reasonTally[e.reason] = (reasonTally[e.reason] || 0) + 1;

  const tierTally = {};
  for (const r of privateRows) tierTally[r.verification_status] = (tierTally[r.verification_status] || 0) + 1;

  const artifact = {
    _note:
      'Phase 37.D. Three supply bases side by side, plus the hybrid band that applies ' +
      'to all three. PUBLIC-SAFE: aggregate counts only. No project, SPV, contact, ' +
      'comment or APVA value appears, and the builder refuses to write if one does.',
    generated_at: new Date().toISOString(),
    ...bases,
    verified_contribution: {
      mw: verified.mw,
      rows_considered: privateRows.length,
      rows_contributing: verified.included.length,
      rows_excluded: verified.excluded_count,
      exclusion_reasons: reasonTally,
      tier_tally: tierTally,
      tier_weights: TIER_WEIGHT,
      finding:
        verified.mw === 0
          ? 'The citable contribution to published supply is 0 MW. Every row in the ' +
            'evidence set is either private-only, or public-confirmed by a citation that ' +
            'establishes a legal entity without stating a capacity. A registry entry ' +
            'proves a company exists; it does not prove a battery exists or how large ' +
            'it is. Publishing the rows\' site totals would mean publishing private ' +
            'testimony behind a registry citation.'
          : null,
    },
    retired_mw_accounting: retired,
    litgrid_meta: LITGRID_LT_BESS_META,
    unblocker: {
      what:
        'A public source stating BATTERY capacity for these projects — a permit register ' +
        'entry, a TSO connection-queue record, or a regulator decision naming MW.',
      effect:
        'Each one converts a row from entity-confirmed to capacity-citable and lets it ' +
        'enter published supply at its tier weight. Until then the bottom-up basis is ' +
        'a count of companies, not a quantity of storage.',
      status: 'NOT YET SOURCED',
    },
    provenance: {
      generated_by: 'tools/fleet-intel/build-supply-bases.mjs',
      phase: '37.D',
      fleet_source: FLEET_URL,
      fleet_updated_at: fleet.updated_at ?? null,
      fleet_offline_cache: Boolean(fleet._offline),
      private_intake_present: privateRows.length > 0,
    },
  };

  // The gate. Runs against the artifact ABOUT to be written, not after.
  const leaks = assertNoPrivateOnlyInPublished(artifact, privateRows);
  if (leaks.length) {
    console.error('FATAL: private-only data in the supply-bases artifact:', leaks.slice(0, 10));
    process.exit(1);
  }
  const barred = privateOnlyRows(privateRows).length;
  console.log(`leak check: 0 private-only values in the artifact (${barred} of ${privateRows.length} rows are barred from published numbers)`);

  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n');
  console.log(`supply bases → ${path.relative(ROOT, OUT)}`);
  console.log(`  pre-37 baseline        : ${artifact.bases.pre_37_baseline.baltic_mw} MW`);
  console.log(`  KKME-verified bottom-up: +${artifact.bases.kkme_verified_bottom_up.added_mw} MW (${verified.included.length}/${privateRows.length} rows contribute)`);
  console.log(`  Litgrid L TrSc (LT)    : ${JSON.stringify(artifact.bases.litgrid_l_trsc.by_year)}`);
  console.log(`  hybrid band            : ${artifact.hybrid_band.lower_mw} – ${artifact.hybrid_band.upper_mw} MW (width ${artifact.hybrid_band.width_mw})`);
  console.log(`  retired-MW tie         : ${retired.ok ? 'OK' : 'FAILED'} (${retired.retired_count} retirements, ${retired.retired_mw} MW)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
