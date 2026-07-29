// Phase 36.D — the canonical demand module.
//
// These tests exist for three different reasons and it is worth keeping them
// separate in one's head:
//
//   1. Structural — the module is internally consistent and validates.
//   2. Fidelity to the sources — every published number ties to a document
//      table, and the two documents agree where they overlap.
//   3. Traps — the derivation cannot silently smear a legal cliff, the
//      fast-response identity cannot be refactored away, and the total-measures
//      series cannot become demand.
//
// (3) is the set that would not be missed by a passing build, which is exactly
// why it is written down.

import { describe, it, expect } from 'vitest';
import {
  COMPONENTS,
  SOURCES,
  EXCLUDED_READINGS,
  VERSION,
  DOCUMENT_DISCREPANCIES,
  EXTRAPOLATION_POLICY,
  addressableDemandMw,
  absorptionMw,
  productDemandMw,
  productDemandMap,
  componentMwAt,
  componentCagr,
  publishedYears,
  demandRow,
  validateDemandForecast,
} from '../lib/demand-forecast.js';

// Typed rather than `any`: the shape below IS the module's contract, so
// writing it down here means a change to the data shape fails at compile time
// as well as at assertion time.
interface Series { [year: number]: number }
interface Component {
  id: string;
  basis: string;
  treatment: string;
  treatment_reason: string;
  interpolation: string;
  backfill: string;
  series: Series;
  series_mwh?: Series;
  country_split_mw?: { EE: Series; LV: Series; LT: Series };
}
interface Source { id: string; url: string; archived_copy: string; sha256: string }
interface ExcludedReading { id: string; series: Series; do_not_use: boolean; reason: string }
interface Discrepancy { printed: number; components_sum: number; delta: number }

const comps = COMPONENTS as unknown as Component[];
const sources = SOURCES as unknown as Source[];
const excluded = EXCLUDED_READINGS as unknown as ExcludedReading[];
const discrepancies = DOCUMENT_DISCREPANCIES as unknown as Discrepancy[];
const byId = (id: string) => comps.find((c) => c.id === id)!;

describe('module validation', () => {
  it('validates', () => {
    expect(validateDemandForecast()).toBe(true);
  });

  it('every component names a declared source and a reason for its treatment', () => {
    for (const c of comps) {
      expect(sources.some((src) => src.id === c.basis), `${c.id} basis`).toBe(true);
      expect(c.treatment_reason, `${c.id} reason`).toBeTruthy();
      expect(c.treatment_reason.length, `${c.id} reason is not a placeholder`).toBeGreaterThan(40);
    }
  });

  it('every source carries an archived copy and a checksum', () => {
    for (const s of sources) {
      expect(s.archived_copy, `${s.id}`).toMatch(/^tools\/consultancy\/data\/sources\//);
      expect(s.sha256, `${s.id}`).toMatch(/^[0-9a-f]{64}$/);
      expect(s.url, `${s.id}`).toMatch(/^https:\/\//);
    }
  });
});

describe('fidelity to the published tables', () => {
  // Litgrid, Lankstumo poreikių ataskaita 2026, table 48 p.152 (= table 1 p.10).
  const FNA_TOTAL = { 2028: 973, 2030: 1044, 2033: 869, 2035: 1023 };

  it('the LT components sum to the document total in every published year', () => {
    for (const [y, want] of Object.entries(FNA_TOTAL)) {
      const got: number = comps
        .filter((c) => c.basis === 'litgrid-fna-2026')
        .reduce((acc, c) => acc + c.series[Number(y)], 0);
      expect(got, `FNA total ${y}`).toBe(want);
    }
  });

  it('the Baltic 2026 row reproduces the engine constant it replaces', () => {
    // 604 + 120 + 28 = 752. The number the engine shipped for months, now with
    // the document behind it and nine more years alongside it.
    expect(addressableDemandMw(2026)).toBe(752);
    expect(productDemandMw('mfrr', 2026)).toBe(604);
    expect(productDemandMw('afrr', 2026)).toBe(120);
    expect(productDemandMw('fcr', 2026)).toBe(28);
  });

  it('the Baltic series runs to 922 MW in 2035', () => {
    expect(addressableDemandMw(2035)).toBe(922);
  });

  it('FCR cross-validates across two independently authored documents', () => {
    // The Baltic FCR forecast's LT sub-series vs the Lithuanian FNA's own FCR
    // row. Different authors, different documents, same numbers.
    const ltRow = byId('fcr').country_split_mw!.LT;
    for (const y of [2028, 2030, 2033, 2035]) {
      expect(byId('fna_fcr').series[y], `FCR ${y}`).toBe(ltRow[y]);
    }
  });

  it('the FCR country split sums to the Baltic total in every year', () => {
    const { EE, LV, LT } = byId('fcr').country_split_mw!;
    for (let y = 2026; y <= 2035; y++) {
      expect(EE[y] + LV[y] + LT[y], `FCR split ${y}`).toBe(byId('fcr').series[y]);
    }
  });

  it('records the document\'s own 2028 MWh slip instead of adopting either number', () => {
    const d = discrepancies[0];
    expect(d.printed).toBe(1519);
    expect(d.components_sum).toBe(1510);
    // And the components really do sum to 1510, so the record is not just a note.
    const sum = ['short_term', 'fna_fcr', 'izdr', 'gagap', 'lt_pl']
      .reduce((s, id) => s + (byId(id).series_mwh?.[2028] ?? 0), 0);
    expect(sum).toBe(1510);
  });
});

describe('interpolation', () => {
  it('reproduces every published year exactly, in every component', () => {
    for (const c of comps) {
      for (const y of publishedYears(c as unknown as { series: Series })) {
        expect(componentMwAt(c.id, y), `${c.id}@${y}`).toBe(c.series[y]);
      }
    }
  });

  it('IZDR hits exactly 0 at the document\'s year, and is never smeared toward it', () => {
    // The reservation is a legal instrument: in force, then not. A linear
    // interpolation would invent 133 MW in 2031 and 67 MW in 2032 — a taper
    // that no document describes and no law provides for.
    expect(componentMwAt('izdr', 2030)).toBe(200);
    expect(componentMwAt('izdr', 2031)).toBe(200);
    expect(componentMwAt('izdr', 2032)).toBe(200);
    expect(componentMwAt('izdr', 2033)).toBe(0);
    expect(componentMwAt('izdr', 2034)).toBe(0);
  });

  it('LT-PL ends with Harmony Link rather than ramping down to it', () => {
    expect(componentMwAt('lt_pl', 2032)).toBe(146);
    expect(componentMwAt('lt_pl', 2033)).toBe(0);
  });

  it('interpolates continuous components linearly, per component', () => {
    // Short-term system needs 429 (2028) → 484 (2030): midpoint 456.5.
    expect(componentMwAt('short_term', 2029)).toBeCloseTo(456.5, 6);
    // DSO 30 → 42: midpoint 36.
    expect(componentMwAt('dso', 2029)).toBeCloseTo(36, 6);
  });

  it('never interpolates a total — the sum of parts is the total', () => {
    for (let y = 2028; y <= 2035; y++) {
      const parts = comps
        .filter((c) => c.treatment === 'absorption')
        .reduce((s, c) => s + componentMwAt(c.id, y), 0);
      expect(absorptionMw(y), `absorption ${y}`).toBeCloseTo(parts, 6);
    }
  });
});

describe('backfill before the first published year', () => {
  it('carries IZDR back — Energy Cells has been contracted since 2022', () => {
    expect(componentMwAt('izdr', 2026)).toBe(200);
    expect(componentMwAt('izdr', 2027)).toBe(200);
  });

  it('does NOT invent GAGAP or LT-PL volumes before they are procurable', () => {
    // GAGAP's procurement rules (VERT O3-731) date from 2026-06-15 and no
    // volume is contracted; the LT-PL service is explicitly undecided.
    // Backfilling either would assert contracts that do not exist.
    expect(componentMwAt('gagap', 2026)).toBe(0);
    expect(componentMwAt('gagap', 2027)).toBe(0);
    expect(componentMwAt('lt_pl', 2026)).toBe(0);
    expect(absorptionMw(2026)).toBe(200);
  });

  it('steps to the full absorption once the services are procured', () => {
    expect(absorptionMw(2028)).toBe(500);
    expect(absorptionMw(2033)).toBe(354);
  });
});

describe('extrapolation beyond 2035', () => {
  it('is component-trend, at each component\'s own published rate', () => {
    expect(EXTRAPOLATION_POLICY.mode).toBe('component-trend');
    const g = componentCagr(byId('mfrr_up'))!;
    expect(g).toBeCloseTo(Math.pow(754 / 604, 1 / 9) - 1, 12);
    expect(componentMwAt('mfrr_up', 2036)).toBeCloseTo(754 * (1 + g), 6);
  });

  it('holds flat where a rate would be meaningless rather than inventing one', () => {
    // aFRR is flat in the source by construction; GAGAP's last two published
    // values are equal; IZDR and LT-PL end at zero.
    expect(componentMwAt('afrr_up', 2048)).toBe(120);
    expect(componentMwAt('gagap', 2048)).toBe(354);
    expect(componentMwAt('izdr', 2048)).toBe(0);
    expect(componentMwAt('lt_pl', 2048)).toBe(0);
  });

  it('grows monotonically and stays finite to the end of the projection', () => {
    let prev = 0;
    for (let y = 2026; y <= 2048; y++) {
      const d = addressableDemandMw(y);
      expect(Number.isFinite(d), `${y}`).toBe(true);
      expect(d, `${y} vs ${y - 1}`).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('the fast-response identity (CP-1 decision 8)', () => {
  // IZDR + GAGAP is a flat 354 MW in every year Litgrid analyses (table 20,
  // p.127). At 2033 the legal reservation lapses: Energy Cells' 200 MW returns
  // to the merchant pool AND market-procured GAGAP rises by exactly 200 MW.
  // Supply +200, absorption +200 — net zero.
  //
  // This is only expressible while the two remain separate components. The test
  // exists so that a future simplification which merges them into one
  // "fast response" row fails loudly instead of quietly breaking the
  // cancellation.
  it('holds at every year in range, not only the published ones', () => {
    for (let y = 2028; y <= 2035; y++) {
      expect(componentMwAt('izdr', y) + componentMwAt('gagap', y), `${y}`).toBeCloseTo(354, 9);
    }
  });

  it('the 2033 transition nets to zero', () => {
    const izdrReleased = componentMwAt('izdr', 2032) - componentMwAt('izdr', 2033);
    const gagapAdded = componentMwAt('gagap', 2033) - componentMwAt('gagap', 2032);
    expect(izdrReleased).toBe(200);
    expect(gagapAdded).toBe(200);
    expect(izdrReleased - gagapAdded).toBe(0);
  });

  it('IZDR and GAGAP must share an interpolation mode or the identity breaks between years', () => {
    expect(byId('izdr').interpolation).toBe(byId('gagap').interpolation);
  });
});

describe('the do-not-use reading', () => {
  it('the total-flexible-measures series is recorded, and is not a component', () => {
    const e = excluded[0];
    expect(e.series[2028]).toBe(4364);
    expect(e.series[2035]).toBe(7131);
    expect(e.do_not_use).toBe(true);
    expect(comps.some((c) => c.id === e.id)).toBe(false);
  });

  it('never leaks into demand — the two series are an order of magnitude apart', () => {
    // If anyone ever wires the wrong column in, this is the assertion that
    // catches it: addressable demand at 2035 is 922 MW, not 7 131 MW.
    expect(addressableDemandMw(2035)).toBeLessThan(1500);
    for (let y = 2026; y <= 2048; y++) expect(addressableDemandMw(y)).toBeLessThan(2000);
  });
});

describe('call-site safety', () => {
  it('throws on an unknown component or product rather than returning a default', () => {
    expect(() => componentMwAt('nope', 2030)).toThrow(/unknown component/);
    expect(() => productDemandMw('nope' as never, 2030)).toThrow(/unknown product/);
  });

  it('throws on a non-integer year rather than interpolating a fraction of one', () => {
    expect(() => componentMwAt('fcr', 2030.5)).toThrow(/integer/);
  });

  it('demandRow is the shape the register and the harness read', () => {
    const r = demandRow(2030);
    expect(r).toEqual({
      year: 2030,
      addressable_mw: 840,
      absorption_mw: 500,
      products: { fcr: 36, afrr: 120, mfrr: 684 },
    });
    expect(productDemandMap(2030)).toEqual(r.products);
  });

  it('is versioned and declares its scope', () => {
    expect(VERSION.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(VERSION.scope).toBe('baltic-auction-derived');
    expect(VERSION.adopted_by).toBe('phase-36.D');
  });
});
