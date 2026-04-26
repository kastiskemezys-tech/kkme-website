import { describe, it, expect } from 'vitest';
import {
  flexibilityFleetMw,
  flexibilityFleetByCountry,
  bessInstalledMw,
  bessUnderConstructionMw,
  fleetMetricsDiverge,
} from '../fleet';

// Audit-shaped payload: live worker /s4 response captured 2026-04-26.
const auditPayload = {
  baltic_total: { installed_mw: 651, under_construction_mw: 616 },
  fleet: {
    baltic_operational_mw: 822,
    baltic_pipeline_mw: 1083,
    baltic_weighted_mw: 1358,
    eff_demand_mw: 752,
    sd_ratio: 1.81,
    countries: {
      LT: { operational_mw: 596, pipeline_mw: 611, weighted_mw: 850.9 },
      LV: { operational_mw: 99,  pipeline_mw: 217, weighted_mw: 151.3 },
      EE: { operational_mw: 126.5, pipeline_mw: 255, weighted_mw: 356 },
    },
  },
};

describe('fleet metric extractors', () => {
  it('flexibility fleet MW = live BESS+PSP operational', () => {
    expect(flexibilityFleetMw(auditPayload)).toBe(822);
  });

  it('BESS-installed MW = registry-only count', () => {
    expect(bessInstalledMw(auditPayload)).toBe(651);
  });

  it('under-construction is its own category, not folded into operational', () => {
    expect(bessUnderConstructionMw(auditPayload)).toBe(616);
  });

  it('flex fleet by country sums to baltic total within rounding', () => {
    const by = flexibilityFleetByCountry(auditPayload);
    const sum = (by.LT ?? 0) + (by.LV ?? 0) + (by.EE ?? 0);
    expect(Math.round(sum)).toBe(822);
  });

  it('flex fleet and BESS-installed are intentionally distinct numbers', () => {
    // The whole point of 7.6.3: they are NOT the same canonical metric.
    // Surfaces must not display them under the same label.
    expect(flexibilityFleetMw(auditPayload)).not.toBe(bessInstalledMw(auditPayload));
    expect(fleetMetricsDiverge(auditPayload)).toBe(true);
  });

  it('returns null cleanly when payload missing', () => {
    expect(flexibilityFleetMw(null)).toBeNull();
    expect(flexibilityFleetMw(undefined)).toBeNull();
    expect(flexibilityFleetMw({})).toBeNull();
    expect(bessInstalledMw({})).toBeNull();
    expect(flexibilityFleetByCountry(null)).toEqual({});
    expect(fleetMetricsDiverge(null)).toBe(false);
  });

  it('does not flag divergence within sub-MW rounding', () => {
    const aligned = {
      baltic_total: { installed_mw: 822 },
      fleet: { baltic_operational_mw: 822.4 },
    };
    expect(fleetMetricsDiverge(aligned)).toBe(false);
  });
});
