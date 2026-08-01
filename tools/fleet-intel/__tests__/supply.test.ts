/**
 * Phase 37.D — supply wiring.
 *
 * The headline assertions here are negative ones, and they are the point: the
 * verified fleet contributes 0 MW to published supply, private-only rows appear in
 * no published payload, and the hybrid over-count travels as a band that no
 * consumer can collapse to a point.
 *
 * Every row is SYNTHETIC, and the shapes mirror what the real evidence set looks
 * like — in particular the registry-citation-without-capacity shape, which is what
 * all 36 real public-confirmed rows carry.
 */

import { describe, it, expect } from 'vitest';
import {
  TIER_WEIGHT, hybridBand, verifiedSupplyContribution, privateOnlyRows,
  threeSupplyBases, retiredMwAccounting, assertNoPrivateOnlyInPublished,
} from '../lib/supply.mjs';
import { publishability, citationSpeaksToCapacity } from '../lib/publishability.mjs';

const REGISTRY_ONLY = {
  source_type: 'registry',
  url: 'https://data.gov.lv/dati/lv/dataset/synthetic',
  what_it_confirms: 'entity resolves in the Latvian Uzņēmumu reģistrs, reg. 40200000000, status active',
};
const CAPACITY_CITATION = {
  source_type: 'permit',
  url: 'https://example.org/permit/synthetic',
  what_it_confirms: 'permit states 40 MW / 80 MWh of storage capacity',
};

/** The real evidence set's shape: confirmed company, unstated battery. */
const ROW_ENTITY_ONLY = {
  id: 'fi-lv-synth-1', country: 'LV', spv: 'SIA "Sintētiska"',
  verification_status: 'public-confirmed', citations: [REGISTRY_ONLY],
  site_total_mw: 120, plant_type: 'SUN E with BESS',
  contact: 'nobody@example.invalid', comment: 'ZZKANARY synthetic note',
};
const ROW_PRIVATE_ONLY = {
  id: 'fi-lt-synth-2', country: 'LT', spv: 'UAB "Sintetinis"',
  verification_status: 'private-only', citations: [],
  site_total_mw: 50, bess_mw: 50, plant_type: 'BESS',
  contact: 'nobody@example.invalid', comment: 'ZZKANARY private-only note',
  apva_flag: 'ZZKANARY-APVA-TESTIMONY',
};
const ROW_CAPACITY_CITED = {
  id: 'fi-lt-synth-3', country: 'LT', spv: 'UAB "Cituojama"',
  verification_status: 'public-confirmed', citations: [CAPACITY_CITATION],
  site_total_mw: 40, bess_mw: 40, plant_type: 'BESS',
};
const ROW_CORROBORATED = {
  id: 'fi-ee-synth-4', country: 'EE', spv: 'OÜ "Sünteetiline"',
  verification_status: 'corroborated',
  citations: [{ source_type: 'press', url: 'https://example.org/news', what_it_confirms: 'article states 10 MW battery' }],
  site_total_mw: 10, bess_mw: 10, plant_type: 'BESS',
};

describe('37.D — a tier is not a licence to publish a capacity', () => {
  it('a registry citation confirming only the entity yields no citable capacity', () => {
    const p = publishability(ROW_ENTITY_ONLY);
    expect(p.publishable).toBe(true);          // the company is corroborated
    expect(p.capacity_citable).toBe(false);    // the battery is not
    expect(p.reason).toMatch(/legal entity only/i);
  });

  it('recognises capacity wording in the languages the source stack produces', () => {
    for (const what of [
      'permit states 40 MW of storage',
      'atļauja norāda 40 MW jauda',
      'leidime nurodyta 40 MW galia',
      'dokumentas nurodo 40 megavatų',
    ]) {
      expect(citationSpeaksToCapacity({ what_it_confirms: what }), what).toBe(true);
    }
    expect(citationSpeaksToCapacity({ what_it_confirms: 'entity resolves in the register, status active' })).toBe(false);
  });

  it('a citation with no resolvable URL is a claim, not evidence', () => {
    const row = { ...ROW_CAPACITY_CITED, citations: [{ ...CAPACITY_CITATION, url: 'see the spreadsheet' }] };
    expect(publishability(row).capacity_citable).toBe(false);
  });
});

describe('37.D — verified supply contribution', () => {
  it('the current evidence shape contributes ZERO — the batch headline', () => {
    const v = verifiedSupplyContribution([ROW_ENTITY_ONLY, ROW_PRIVATE_ONLY]);
    expect(v.mw).toBe(0);
    expect(v.included).toEqual([]);
    expect(v.excluded_count).toBe(2);
    // and the zero is legible, not mysterious
    expect(v.excluded.map((e) => e.reason).join(' ')).toMatch(/legal entity only|no public source/i);
  });

  it('never counts site_total_mw — a connection capacity is not a battery rating', () => {
    // ROW_ENTITY_ONLY has 120 MW of site total and no bess_mw. If site_total ever
    // leaked into the sum this would be 120, not 0.
    expect(verifiedSupplyContribution([ROW_ENTITY_ONLY]).mw).toBe(0);
  });

  it('counts a capacity-cited row at full tier weight', () => {
    const v = verifiedSupplyContribution([ROW_CAPACITY_CITED]);
    expect(v.mw).toBe(40);
    expect(v.included[0].tier_weight).toBe(TIER_WEIGHT['public-confirmed']);
  });

  it('haircuts a corroborated row rather than excluding it', () => {
    const v = verifiedSupplyContribution([ROW_CORROBORATED]);
    expect(v.mw).toBe(6);                                   // 10 × 0.6
    expect(TIER_WEIGHT['corroborated']).toBeLessThan(TIER_WEIGHT['public-confirmed']);
  });

  it('weights private-only at exactly zero, not merely "small"', () => {
    expect(TIER_WEIGHT['private-only']).toBe(0);
    expect(verifiedSupplyContribution([ROW_PRIVATE_ONLY]).mw).toBe(0);
  });
});

describe('37.D — private-only rows reach no published payload', () => {
  const ROWS = [ROW_ENTITY_ONLY, ROW_PRIVATE_ONLY, ROW_CAPACITY_CITED];

  it('identifies every row barred from published numbers', () => {
    const barred = privateOnlyRows(ROWS).map((r) => r.id);
    expect(barred).toContain('fi-lt-synth-2');   // private-only
    expect(barred).toContain('fi-lv-synth-1');   // public-confirmed but entity-only
    expect(barred).not.toContain('fi-lt-synth-3');
  });

  it('the three-basis payload carries no barred row and no private field', () => {
    const payload = threeSupplyBases({
      fleetEntries: [{ id: 'a', mw: 100 }, { id: 'b', mw: 50 }],
      privateRows: ROWS,
      litgridMwForYear: (y) => ({ 2028: 1260, 2030: 2115, 2033: 2428, 2035: 2652 })[y] ?? null,
    });
    // vacuity guard: the payload must actually be a payload
    expect(JSON.stringify(payload).length).toBeGreaterThan(400);
    expect(payload.bases.pre_37_baseline.baltic_mw).toBe(150);

    expect(assertNoPrivateOnlyInPublished(payload, ROWS)).toEqual([]);
    const text = JSON.stringify(payload);
    expect(text).not.toContain('nobody@example.invalid');
    expect(text).not.toContain('ZZKANARY');
    expect(text).not.toContain('apva_flag');
  });

  it('the assertion is FAILABLE — it catches a barred row planted in a payload', () => {
    const leaky = { note: 'supply', rows: [{ spv: ROW_PRIVATE_ONLY.spv, comment: ROW_PRIVATE_ONLY.comment }] };
    const hits = assertNoPrivateOnlyInPublished(leaky, ROWS);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(' ')).toMatch(/fi-lt-synth-2/);
  });

  it('the verified basis reports zero AND says why, rather than omitting it', () => {
    const payload = threeSupplyBases({ fleetEntries: [{ id: 'a', mw: 100 }], privateRows: ROWS.slice(0, 2) });
    expect(payload.bases.kkme_verified_bottom_up.added_mw).toBe(0);
    expect(payload.bases.kkme_verified_bottom_up.note).toMatch(/nothing citable to add/i);
  });
});

describe('37.D — the hybrid over-count is a band, never a correction', () => {
  const band = hybridBand();

  it('re-derives from the artifact, inheriting its exact bounds', () => {
    expect(band.lower_mw).toBe(11975.7);
    expect(band.upper_mw).toBe(16020.4);
    expect(band.width_mw).toBe(4044.7);
  });

  it('is derived from the public fleet alone — no private input in either direction', () => {
    expect(band.derivation).toMatch(/PUBLIC FLEET ONLY/i);
    expect(JSON.stringify(band)).not.toMatch(/private[_-]?(bess|column)/i);
  });

  it('exposes no midpoint — a midpoint is a point estimate wearing a range costume', () => {
    expect(Object.keys(band)).not.toContain('midpoint_mw');
    expect(Object.keys(band)).not.toContain('central_mw');
    const mid = (band.lower_mw + band.upper_mw) / 2;
    expect(JSON.stringify(band)).not.toContain(String(mid));
  });

  it('carries its own incompleteness so no consumer can display it bare', () => {
    expect(band.incompleteness.consequence).toMatch(/understates/i);
    expect(band.rules_for_consumers.join(' ')).toMatch(/DO NOT apply a point correction/i);
  });

  it('the upper bound is the status quo, so adopting the band moves no published number', () => {
    // The live public fleet sums to exactly upper_mw (verified at Pause A against
    // /s4/fleet). Publishing the band as a range around the existing point therefore
    // leaves the point untouched; only the stated uncertainty is new.
    expect(band.basis).toMatch(/every entry counted at full site MW \(status quo\)/i);
  });

  it('refuses an inverted band rather than publishing it', () => {
    expect(() => hybridBand('/nonexistent/hybrid-band.json')).toThrow();
  });
});

describe('37.D — retired-MW accounting ties', () => {
  const fleet = [{ id: 'p1', mw: 30 }, { id: 'p2', mw: 20 }];

  it('ties retired MW to fleet entries when every retirement is cited', () => {
    const r = retiredMwAccounting({
      fleetEntries: fleet,
      transitions: [{ id: 'p1', type: 'retired', evidence: [{ url: 'https://example.org/liquidation' }] }],
    });
    expect(r.ok).toBe(true);
    expect(r.retired_mw).toBe(30);
  });

  it('refuses to subtract an uncited retirement', () => {
    const r = retiredMwAccounting({
      fleetEntries: fleet,
      transitions: [{ id: 'p1', type: 'retired', evidence: [] }],
    });
    expect(r.ok).toBe(false);
    expect(r.uncited_ids).toEqual(['p1']);
    expect(r.retired_mw).toBe(0);
  });

  it('refuses to subtract a retirement that matches no fleet entry', () => {
    const r = retiredMwAccounting({
      fleetEntries: fleet,
      transitions: [{ id: 'ghost', type: 'retired', evidence: [{ url: 'https://example.org/x' }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.unmatched_ids).toEqual(['ghost']);
  });

  it('the batch-1 near-miss shape: a mass retirement cannot pass uncited', () => {
    // 486 509 entities marked terminated by an untrimmed truthiness check. Every
    // other gate stayed green; this one does not.
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, type: 'retired', evidence: [] }));
    const r = retiredMwAccounting({ fleetEntries: fleet, transitions: many });
    expect(r.ok).toBe(false);
    expect(r.retired_mw).toBe(0);
  });
});
