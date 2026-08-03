/**
 * Phase 38.2 stage 2 — the public copy corrections, asserted where they can fail.
 *
 * Two claims were rendered on the live site that the data did not support:
 *
 *   1. "FLEX FLEET 782 MW (BESS + pumped hydro)" and, beneath it,
 *      "= TSO BESS 651 MW + Kruonis flex share 131 MW". The fleet holds zero
 *      pumped-hydro entries and no entry named Kruonis; 131 is `782 − 651`,
 *      the amount by which the project-level tracker exceeds the national
 *      registries, with the name of a 205 MW hydro asset written onto it.
 *   2. RenewableMix and ResidualLoad cited "ENTSO-E" while their payloads say
 *      `source: energy-charts.info`.
 *
 * The first pair is asserted against the DATA: the composition claim is checked
 * against the fleet's own entries, and the replacement line is checked as the
 * string the reader sees, reconstructed from the real payload. The second is
 * asserted against the three payloads' own `source`, captured live and committed
 * as a fixture, and only THEN against the citation string in the card — a text
 * match is allowed as the second assertion beside a data one, never alone (B13).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fleetOverRegistry, coverageRowsCaption } from '@/app/lib/fleetCoverage';
import FLEET_FIXTURE from '../../../workers/__tests__/fixtures/s4-fleet-live-2026-08-02.json';
import SOURCE_FIXTURE from '../../../workers/__tests__/fixtures/generation-source-2026-08-03.json';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The national registry totals as `/s4` publishes them, at the fixture's date. */
const REGISTRY = {
  LT: { installed_mw: 484 },
  LV: { installed_mw: 40 },
  EE: { installed_mw: 127 },
};

describe('the flex-fleet scope label describes the population it labels', () => {
  it('the fleet contains no pumped hydro — so no surface may say it does', () => {
    const entries = (FLEET_FIXTURE as { raw_entries?: Array<Record<string, unknown>> }).raw_entries ?? [];
    expect(entries.length).toBeGreaterThan(0);

    const pumped = entries.filter(e => e.type === 'pumped_hydro');
    const kruonis = entries.filter(e => String(e.name ?? '').toLowerCase().includes('kruon'));

    expect(pumped).toEqual([]);
    expect(kruonis).toEqual([]);

    // Second assertion, on the rendered scope strings. If a future payload
    // DOES carry pumped hydro, the assertion above goes red first and this one
    // becomes the instruction for what to change.
    const hero = read('../HeroBalticMap.tsx');
    const ticker = read('../SignalBar.tsx');
    const s4 = read('../S4Card.tsx');
    for (const src of [hero, ticker, s4]) {
      // A comment may explain what was removed; a rendered string may not claim it.
      const renderedClaims = src
        .split('\n')
        .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
        .filter(l => /BESS \+ pumped hydro/.test(l));
      expect(renderedClaims).toEqual([]);
    }
  });

  it('the residual is published as the coverage gap it is, decomposed per country', () => {
    const cov = fleetOverRegistry(
      (FLEET_FIXTURE as { countries: Record<string, { operational_mw: number }> }).countries,
      REGISTRY,
    );
    expect(cov).not.toBeNull();

    // Same subtraction the fabricated line performed: 782 − 651 = 131.
    expect(Math.round(cov!.fleetMw)).toBe(782);
    expect(cov!.registryMw).toBe(651);
    expect(Math.round(cov!.gapMw)).toBe(131);

    // …and it decomposes, which is what makes the new label checkable and the
    // old one a fabrication: no single asset accounts for it.
    expect(coverageRowsCaption(cov!)).toBe('EE +9 · LT +63 · LV +59');
    const summed = cov!.rows.reduce((s, r) => s + r.gapMw, 0);
    expect(Math.abs(summed - cov!.gapMw)).toBeLessThan(0.01);

    // The exact line the hero renders.
    expect(`= ${cov!.registryMw} MW in national registries · ${Math.round(cov!.gapMw)} MW tracked above them`)
      .toBe('= 651 MW in national registries · 131 MW tracked above them');
  });

  it('refuses to publish a gap it cannot attribute country-for-country', () => {
    // A tracked country with no registry counterpart would otherwise be
    // absorbed silently into the headline residual — the same failure with a
    // different name on it.
    const partial = fleetOverRegistry(
      { LT: { operational_mw: 547 }, LV: { operational_mw: 99 }, PL: { operational_mw: 300 } },
      REGISTRY,
    );
    expect(partial).toBeNull();
  });
});

describe('citations name the source the payload names', () => {
  it('each card cites the string its own payload carries, captured live', () => {
    // Primary evidence: what the three endpoints the two cards read actually
    // said, captured from production and committed beside this test so the
    // claim is checkable rather than asserted.
    const cited = SOURCE_FIXTURE.s_wind.source;
    expect(cited).toBe('energy-charts.info');
    for (const sig of ['s_wind', 's_solar', 's_load'] as const) {
      expect(SOURCE_FIXTURE[sig].source).toBe(cited);
    }

    // Second assertion: the citation the reader sees equals that string, and
    // neither card cites a platform it does not read.
    for (const rel of ['../RenewableMixCard.tsx', '../ResidualLoadCard.tsx']) {
      const src = read(rel);
      expect(src).toContain(`<SourceFooter source="${cited}"`);
      expect(src).not.toContain('<SourceFooter source="ENTSO-E"');
    }
  });
});
