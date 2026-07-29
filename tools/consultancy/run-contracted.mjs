/**
 * Contracted-revenue overlay runner — Phase 36.B4
 *
 * Answers the question every financing conversation asks: **what floors the
 * coverage.** It puts a contracted floor on 0 / 30 / 50 % of nameplate, in both
 * the floor structure and the full-toll structure, and reports three things at
 * each level — the client bridge, the revenue path, and what the floor does to
 * the left tail of the 36.B2 distribution.
 *
 *   output/contracted-<project>-<scenario>.json
 *
 * The distribution is not rebuilt here. It comes from `bootstrapPaths()`, the
 * same replayed shape-years the merchant percentiles are built from, so a
 * contracted P90 and a merchant P90 are the same construct measured on the same
 * five paths (rule #4). Without that the comparison would be between two
 * distributions rather than between two contracting levels.
 *
 * Usage:
 *   node tools/consultancy/run-contracted.mjs --offline
 *   node tools/consultancy/run-contracted.mjs --floor 120000 --term 10
 *   node tools/consultancy/run-contracted.mjs --project prosperus/bitenai.json
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadEngine, PROJECTS_DIR, eur } from './engine.mjs';
import { getKV } from './kv-snapshot.mjs';
import { buildBridge, resolveCosts } from './bridge.mjs';
import { bootstrapPaths, PRIMARY_YEARS } from './run-bootstrap.mjs';
import { loadPriceYear } from './backfill-entsoe.mjs';
import { writeRunOutput, priceVintage } from './lib/runs.mjs';
import {
  EXCEEDANCE_LEVELS, buildPercentiles, exceedancePercentile, resolvableBand,
} from './lib/bootstrap.mjs';
import {
  applyContract, normaliseContract, tollFeeUnderstatement, levelKey,
  STANDARD_LEVELS, CONTRACT_MODES,
} from './lib/contracted.mjs';

/** Illustrative term when none is given. Stated as illustrative, never implied. */
export const DEFAULT_TERM_YEARS = 10;

/**
 * Derive an illustrative floor from the model rather than asserting one.
 *
 * The level the merchant case's Y1 net revenue **exceeds in 75 % of shape-year
 * outcomes**, per MW. Two reasons for P75 rather than the lender's P90: it is
 * inside what a five-year sample can actually resolve ([P17, P83] — see
 * `resolvableBand`), and a floor written at an unresolved percentile would be a
 * number derived from the sample minimum wearing a percentile's name.
 *
 * This is a STRUCTURE TEST, not a term sheet. It says what a floor at this level
 * would do; it does not claim anyone would write one.
 */
export function derivedFloor(scaled, mw) {
  const samples = Object.values(scaled).map((r) => r.years[0].rev_gross);
  const p = exceedancePercentile(samples, 0.75);
  if (p.value == null) return null;
  return {
    floor_eur_mw_yr: Math.round(p.value / mw / 1000) * 1000,
    basis: 'P75 of Y1 net market revenue per MW across the shape-year sample',
    resolved: p.resolved,
    raw_eur_mw_yr: p.value / mw,
  };
}

const headlineOf = (bridge) => ({
  gross_y1: bridge.bridge_y1.gross_market_revenues,
  ebitda_y1: bridge.bridge_y1.project_ebitda,
  prefin_cf_y1: bridge.bridge_y1.pre_financing_cf,
  gross_20yr: bridge.bridge_totals.gross_market_revenues,
  ebitda_20yr: bridge.bridge_totals.project_ebitda,
  prefin_cf_20yr: bridge.bridge_totals.pre_financing_cf,
});

/** Lifetime-gross percentiles of a set of contracted paths. */
function pathPercentiles(scaledContracted, levels) {
  const pct = buildPercentiles(scaledContracted, levels);
  return Object.fromEntries(Object.entries(pct.paths).map(([k, v]) => [k, {
    lifetime_eur: v.lifetime_eur, resolved: v.resolved, shape_year: v.shape_year,
  }]));
}

export async function runContracted({
  config, kv, years = PRIMARY_YEARS, zone = 'LT', scenarioName = 'central',
  levels = STANDARD_LEVELS, floor_eur_mw_yr = null, term_years = DEFAULT_TERM_YEARS,
  counterparty_note = null, exceedance = EXCEEDANCE_LEVELS,
}) {
  const { baseline, scaled } = await bootstrapPaths({ config, kv, years, zone, scenarioName });

  const derived = derivedFloor(scaled, config.mw);
  const floor = floor_eur_mw_yr ?? derived?.floor_eur_mw_yr ?? 0;
  const note = counterparty_note ??
    'ILLUSTRATIVE — no counterparty. Structure test at a model-derived floor level, ' +
    'not a term sheet and not an offer received (discipline rule #3).';

  const costs = resolveCosts(config);
  const merchantBridge = buildBridge(baseline, config);
  const merchantPaths = pathPercentiles(scaled, exceedance);

  const cases = {};
  for (const mode of CONTRACT_MODES) {
    cases[mode] = {};
    for (const level of levels) {
      const contract = normaliseContract({
        floor_eur_mw_yr: floor, contracted_pct_of_mw: level,
        term_years, counterparty_note: note,
      });
      const contracted = applyContract(baseline, config, contract, { mode });
      const bridge = buildBridge(contracted, config);

      const scaledContracted = Object.fromEntries(Object.entries(scaled).map(
        ([y, r]) => [y, applyContract(r, config, contract, { mode })]));

      cases[mode][levelKey(level)] = {
        contracted_pct_of_mw: level,
        headline: headlineOf(bridge),
        contract: {
          years_floor_binds: contracted.contract.years_floor_binds,
          total_uplift_eur: contracted.contract.total_uplift_eur,
          toll_fee_understatement_eur:
            mode === 'floor_only'
              ? tollFeeUnderstatement(contracted, costs.optimiser_pct_gross) : 0,
        },
        percentiles: pathPercentiles(scaledContracted, exceedance),
        // Per shape-year, so the truncation is visible path by path rather than
        // only in the aggregate.
        by_shape_year: Object.fromEntries(Object.entries(scaledContracted).map(
          ([y, r]) => [y, {
            lifetime_gross: r.years.reduce((a, x) => a + x.rev_gross, 0),
            years_floor_binds: r.contract.years_floor_binds,
          }])),
        bridge_20yr: bridge.bridge_20yr,
      };
    }
  }

  // ── Gates ──────────────────────────────────────────────────────────────
  const blended = cases.blended;
  const tail = (lvl, mode = 'blended') => cases[mode][levelKey(lvl)].percentiles;

  const monotone = [];
  for (const key of Object.keys(merchantPaths)) {
    let prev = -Infinity;
    for (const level of levels) {
      const v = tail(level)[key].lifetime_eur;
      if (v + 1e-6 < prev) monotone.push({ level, key, value: v, previous: prev });
      prev = v;
    }
  }

  const zeroIsMerchant = JSON.stringify(blended[levelKey(0)].headline) ===
    JSON.stringify(headlineOf(merchantBridge));

  const gates = {
    zero_pct_is_the_merchant_case: {
      what: '0 % contracted must reproduce the merchant bridge exactly',
      pass: zeroIsMerchant,
      detail: zeroIsMerchant ? 'identical' : 'DIVERGED — the overlay is not an identity at 0 %',
    },
    truncation_monotone: {
      what: 'Every exceedance level is non-decreasing in contracted share (blended)',
      pass: monotone.length === 0,
      violations: monotone,
      detail: monotone.length === 0
        ? 'P50/P75/P90/P99 all rise or hold as contracting increases'
        : `${monotone.length} violations`,
    },
    floor_only_never_beats_blended: {
      what: 'Removing the upside cannot raise revenue',
      pass: levels.every((l) =>
        cases.floor_only[levelKey(l)].headline.gross_20yr <=
        cases.blended[levelKey(l)].headline.gross_20yr + 1e-6),
      detail: 'floor-only ≤ blended at every level',
    },
  };

  return {
    meta: {
      phase: '36.B4',
      project_id: config.project_id,
      scenario: scenarioName,
      zone,
      shape_years: years,
      resolvable_band: resolvableBand(years.length),
      generated_from: 'tools/consultancy/run-contracted.mjs',
    },
    contract_basis: {
      floor_eur_mw_yr: floor,
      floor_derivation: floor_eur_mw_yr != null ? 'operator-supplied' : derived,
      term_years,
      counterparty_note: note,
      structure_note:
        'BLENDED = the contracted share earns max(merchant, floor); downside protected, ' +
        'upside retained. FLOOR_ONLY = the contracted share earns the floor and nothing ' +
        'else; the full-toll structure and the downside case.',
      measured_against:
        'NET market revenue (engine rev_gross, already net of charging cost). Comparing ' +
        'against the grossed-up bridge top line would let charging cost count towards ' +
        'clearing the floor.',
      conservative_treatments: [
        'The floor is NOMINAL — it does not escalate while opex does, so protection thins ' +
        'in real terms across the term.',
        'The 4-line cost stack applies to floor revenue as it does to merchant revenue. In ' +
        'a full toll the offtaker holds the trading rights and the optimiser fee on the ' +
        'contracted share does not arise, so the floor-only EBITDA here is understated by ' +
        'the reported toll_fee_understatement_eur.',
        'A partial first operating year pro-rates the floor entitlement by operational ' +
        'months, so the floor is not measured against a full year it did not have.',
      ],
      distribution_basis:
        'Percentiles come from the same replayed shape-years as 36.B2, with the contract ' +
        'applied to each path — same construct, same sample, so the with/without ' +
        'comparison is a contracting effect and not a method difference. Every caveat on ' +
        'the merchant distribution carries: reserve prices flat (D3), day-ahead spread ' +
        'only, and P90/P99 unresolved at five shape-years.',
    },
    merchant: { headline: headlineOf(merchantBridge), percentiles: merchantPaths },
    cases,
    gates,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };

  const projectArg = arg('project', 'kkme-reference.json');
  const configPath = existsSync(projectArg) ? projectArg : join(PROJECTS_DIR, projectArg);
  const config = loadConfig(configPath);
  const scenarioName = arg('scenario', 'central');
  const floorArg = arg('floor', null);
  const termArg = arg('term', null);

  const snapshot = await getKV({ offline: argv.includes('--offline') });
  const kv = snapshot.kv || snapshot;

  await loadEngine();
  const payload = await runContracted({
    config, kv, scenarioName,
    floor_eur_mw_yr: floorArg == null ? null : Number(floorArg),
    term_years: termArg == null ? DEFAULT_TERM_YEARS : Number(termArg),
  });

  const cb = payload.contract_basis;
  console.log(
    `\n── 36.B4 contracted overlay · ${config.project_id} · ${scenarioName} ──\n` +
    `floor €${cb.floor_eur_mw_yr.toLocaleString('en-US')}/MW/yr · term ${cb.term_years} yr · ` +
    `${typeof cb.floor_derivation === 'object' ? cb.floor_derivation.basis : cb.floor_derivation}\n`
  );

  for (const mode of CONTRACT_MODES) {
    console.log(`${mode.toUpperCase()}`);
    console.log('  contracted   Gross Y1   EBITDA Y1   20-yr EBITDA   binds   uplift 20yr');
    for (const [k, c] of Object.entries(payload.cases[mode])) {
      console.log(
        `  ${(c.contracted_pct_of_mw * 100).toFixed(0).padStart(8)} %` +
        `${eur(c.headline.gross_y1).padStart(11)}${eur(c.headline.ebitda_y1).padStart(12)}` +
        `${eur(c.headline.ebitda_20yr).padStart(15)}${String(c.contract.years_floor_binds).padStart(8)}` +
        `${eur(c.contract.total_uplift_eur).padStart(14)}`
      );
    }
    console.log('');
  }

  console.log('lifetime gross by exceedance level — blended, floor truncating the left tail:');
  const keys = Object.keys(payload.merchant.percentiles);
  console.log('  level        ' + keys.map((k) => k.toUpperCase().padStart(11)).join(''));
  for (const [k, c] of Object.entries(payload.cases.blended)) {
    console.log(
      `  ${(c.contracted_pct_of_mw * 100).toFixed(0).padStart(3)} % contracted` +
      keys.map((key) => eur(c.percentiles[key].lifetime_eur).padStart(11)).join('')
    );
  }
  const unresolved = keys.filter((k) => !payload.merchant.percentiles[k].resolved);
  if (unresolved.length) {
    console.log(`  (${unresolved.join(', ').toUpperCase()} NOT RESOLVED at ${payload.meta.shape_years.length} shape-years — sample minimum)`);
  }

  console.log('\ngates:');
  let failed = 0;
  for (const [name, g] of Object.entries(payload.gates)) {
    if (!g.pass) failed++;
    console.log(`${g.pass ? '✓' : '✗'} ${name}: ${g.detail}`);
  }

  const { path: out } = writeRunOutput(
    `contracted-${config.project_id}-${scenarioName}.json`, payload,
    {
      runner: 'contracted', subject: `${config.project_id}/${scenarioName}`,
      inputs: { config, scenario: scenarioName, contract: payload.meta.contract },
      data_vintage: priceVintage(
        payload.meta.shape_years.map((y) => loadPriceYear(payload.meta.zone, y)),
        { zone: payload.meta.zone }
      ),
    }
  );
  console.log(`\nwrote ${out}`);
  process.exit(failed > 0 ? 1 : 0);
}
