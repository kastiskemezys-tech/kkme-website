#!/usr/bin/env node
// Phase 37.A.1 — the hybrid capacity-basis BAND artifact that 37.D consumes.
//
// WHY A BAND AND NOT A CORRECTION
// -------------------------------
// The first intake run showed that the public fleet's `mw` is the battery rating
// for pure-BESS projects but the SITE grid connection for hybrids, so hybrid
// storage is overstated in the supply base. The magnitude of that overstatement is
// known ONLY from the operator's private BESS-MW column.
//
// That column is operator testimony in the private tier, and private-tier data can
// never be the basis for a published number. The correction is also the flattering
// direction — less real BESS supply → lower sd_ratio → less cannibalisation →
// HIGHER IRR — which is exactly when an unciteable input must not be allowed to
// move a client number.
//
// So 37.D must NOT apply the private correction, however large it is. It inherits
// the BAND below, every bound of which is computed from the PUBLIC fleet alone:
//
//   upper bound  = status quo. Every matched entry's full `mw` counts as BESS.
//                  This is what the supply trajectory does today.
//   lower bound  = every PUBLICLY-IDENTIFIABLE hybrid contributes 0 BESS MW,
//                  because its battery share is publicly unknown.
//
// The truth is inside that band. The band is deliberately wide; the width IS the
// finding. It collapses the moment a public hybrid decomposition source exists —
// see UNBLOCKER below.
//
// Usage: node tools/fleet-intel/build-hybrid-band.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/fleet-intel/data/hybrid-band.json');
const FLEET_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/fleet';

// Public-only hybrid signals: the generation technology named in the entry itself.
// Lithuanian/Latvian/Estonian/English wind and solar tokens.
const WIND = /(^|[\s"„-])(vėj|vej|vēj|tuule|wind)/i;
const SOLAR = /(^|[\s"„-])(saul|saule|päike|paike|solar|solwin|pv)\b/i;

export function publicHybridSignal(entry) {
  const n = String(entry?.name || '');
  const t = String(entry?.type || '');
  const wind = WIND.test(n) || /wind/i.test(t);
  const solar = SOLAR.test(n) || /solar|pv/i.test(t);
  if (!wind && !solar) return null;
  return { wind, solar, basis: 'generation technology named in the public fleet entry' };
}

export function buildBand(entries) {
  const flagged = [];
  let upperMw = 0;
  let flaggedMw = 0;

  for (const e of entries) {
    const mw = typeof e.mw === 'number' ? e.mw : 0;
    upperMw += mw;
    const sig = publicHybridSignal(e);
    if (sig) {
      flagged.push({ id: e.id, name: e.name, country: e.country, mw, status: e.status, signal: sig });
      flaggedMw += mw;
    }
  }

  return {
    // ── what 37.D reads ──────────────────────────────────────────────────────
    band: {
      upper_bess_mw: Math.round(upperMw * 10) / 10,
      lower_bess_mw: Math.round((upperMw - flaggedMw) * 10) / 10,
      width_mw: Math.round(flaggedMw * 10) / 10,
      basis: 'upper = every entry counted at full site MW (status quo); lower = publicly-identifiable hybrids contribute 0 BESS MW',
      derivation: 'PUBLIC FLEET ONLY — no private-tier input of any kind',
    },
    flagged_count: flagged.length,
    total_entries: entries.length,
    flagged,

    // ── the rules that travel with the number ────────────────────────────────
    rules_for_consumers: [
      'DO NOT apply a point correction to hybrid BESS capacity. Carry the band.',
      'The private BESS-MW column must never contribute to a published or client-facing number, in either direction.',
      'Any published sd_ratio / cannibalisation / IRR figure derived from supply must state the band, not a midpoint. A midpoint is a point estimate wearing a range costume.',
      'The band is a FLOOR ON UNCERTAINTY, not a complete accounting: an unknown further subset of entries are hybrids that carry no public generation-technology signal, so the true lower bound sits below lower_bess_mw.',
    ],

    incompleteness: {
      note: 'Hybrid identification here uses only the generation technology named in the public entry. Entries named after a company rather than a technology cannot be classified publicly, and the public fleet carries a usable type field on a small minority of entries.',
      consequence: 'flagged_count UNDERSTATES the hybrid population; the band understates the uncertainty.',
    },

    unblocker: {
      what: 'A PUBLIC hybrid decomposition source — battery MW stated separately from site connection capacity, for hybrid sites.',
      candidates: [
        'VERT permit register (LT) — permits may state storage capacity separately from generation',
        'Litgrid connection queue (LT) — connection capacity vs installed storage',
        'Grid-connection permits / TSO queue documents naming the storage component',
        'Elering connection queue (EE)',
      ],
      effect: 'When one lands, the band collapses to a citable point value and the flag becomes a decomposition. Until then the band is the honest representation.',
      status: 'NOT YET SOURCED — this is the named unblocker for 37.D',
    },

    provenance: {
      generated_by: 'tools/fleet-intel/build-hybrid-band.mjs',
      fleet_source: FLEET_URL,
      phase: '37.A.1',
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await fetch(FLEET_URL);
  const fleet = await res.json();
  const entries = fleet.raw_entries || [];
  const band = buildBand(entries);
  band.provenance.generated_at = new Date().toISOString();
  band.provenance.fleet_updated_at = fleet.updated_at || null;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(band, null, 2));
  console.log(`entries: ${band.total_entries}  flagged hybrids: ${band.flagged_count}`);
  console.log(`BAND  upper ${band.band.upper_bess_mw} MW   lower ${band.band.lower_bess_mw} MW   width ${band.band.width_mw} MW`);
  console.log(`→ ${path.relative(ROOT, OUT)}`);
}
