import { describe, it, expect } from 'vitest';
import {
  computeOperationalMwStrict,
  computeOperationalMwInclusive,
  computeQuarantinedMw,
  type FleetEntry,
} from '../fleetMw';

describe('fleetMw — quarantine soft-enforcement (Phase 12.10)', () => {
  const entries: FleetEntry[] = [
    { mw: 100, status: 'operational', _quarantine: false }, // commercial BESS, verified
    { mw: 200, status: 'operational', _quarantine: true }, // Kruonis PSP — flagged
    { mw: 50, status: 'under_construction', _quarantine: false }, // pipeline
    { mw: 30, status: 'commissioned', _quarantine: false }, // synonym for operational
    { mw: 26.5, status: 'operational', _quarantine: true }, // EE Eesti Energia BESS
    { mw: null, status: 'operational' }, // missing MW — treated as 0
  ];

  it('strict excludes _quarantine === true entries', () => {
    expect(computeOperationalMwStrict(entries)).toBe(130); // 100 + 30
  });

  it('inclusive matches the legacy worker total (counts quarantined)', () => {
    expect(computeOperationalMwInclusive(entries)).toBe(356.5); // 100 + 200 + 30 + 26.5
  });

  it('quarantined_mw is the disclosure companion (operational AND quarantined)', () => {
    expect(computeQuarantinedMw(entries)).toBe(226.5); // 200 + 26.5
  });

  it('strict + quarantined === inclusive (no double counting)', () => {
    const strict = computeOperationalMwStrict(entries);
    const quarantined = computeQuarantinedMw(entries);
    const inclusive = computeOperationalMwInclusive(entries);
    expect(strict + quarantined).toBeCloseTo(inclusive, 5);
  });

  it('returns 0 for empty / null / undefined input', () => {
    expect(computeOperationalMwStrict([])).toBe(0);
    expect(computeOperationalMwStrict(null)).toBe(0);
    expect(computeOperationalMwStrict(undefined)).toBe(0);
    expect(computeQuarantinedMw([])).toBe(0);
    expect(computeOperationalMwInclusive(null)).toBe(0);
  });

  it('treats missing _quarantine as not-quarantined (default safe)', () => {
    const unflagged: FleetEntry[] = [{ mw: 100, status: 'operational' }];
    expect(computeOperationalMwStrict(unflagged)).toBe(100);
    expect(computeQuarantinedMw(unflagged)).toBe(0);
  });

  it('non-operational statuses are excluded from all three counts', () => {
    const pipeline: FleetEntry[] = [
      { mw: 100, status: 'under_construction', _quarantine: false },
      { mw: 50, status: 'application', _quarantine: true },
    ];
    expect(computeOperationalMwStrict(pipeline)).toBe(0);
    expect(computeOperationalMwInclusive(pipeline)).toBe(0);
    expect(computeQuarantinedMw(pipeline)).toBe(0);
  });

  it('reproduces the live Baltic snapshot — soft enforcement deltas (audit #5 baseline)', () => {
    // Baseline pulled live during Pause A (2026-05-04):
    //   LT: 596 inclusive, 391 strict, 205 quarantined (Kruonis PSP)
    //   EE: 126.5 inclusive, 0 strict, 126.5 quarantined (Hertz 1 + Eesti Energia BESS)
    //   LV: 99 inclusive, 80 strict, 19 quarantined (Utilitas Targale + AJ Power)
    const lt: FleetEntry[] = [
      { mw: 391, status: 'operational', _quarantine: false }, // commercial BESS portfolio
      { mw: 205, status: 'operational', _quarantine: true }, // Kruonis PSP
    ];
    const ee: FleetEntry[] = [
      { mw: 100, status: 'operational', _quarantine: true }, // BSP Hertz 1
      { mw: 26.5, status: 'operational', _quarantine: true }, // Eesti Energia BESS
    ];
    const lv: FleetEntry[] = [
      { mw: 80, status: 'operational', _quarantine: false }, // AST Rēzekne + Tume
      { mw: 10, status: 'operational', _quarantine: true }, // Utilitas Targale
      { mw: 9, status: 'operational', _quarantine: true }, // AJ Power portfolio
    ];

    expect(computeOperationalMwInclusive(lt)).toBe(596);
    expect(computeOperationalMwStrict(lt)).toBe(391);
    expect(computeQuarantinedMw(lt)).toBe(205);

    expect(computeOperationalMwInclusive(ee)).toBe(126.5);
    expect(computeOperationalMwStrict(ee)).toBe(0);
    expect(computeQuarantinedMw(ee)).toBe(126.5);

    expect(computeOperationalMwInclusive(lv)).toBe(99);
    expect(computeOperationalMwStrict(lv)).toBe(80);
    expect(computeQuarantinedMw(lv)).toBe(19);

    // Baltic total
    const balticInclusive =
      computeOperationalMwInclusive(lt) +
      computeOperationalMwInclusive(ee) +
      computeOperationalMwInclusive(lv);
    const balticStrict =
      computeOperationalMwStrict(lt) +
      computeOperationalMwStrict(ee) +
      computeOperationalMwStrict(lv);
    const balticQuarantined =
      computeQuarantinedMw(lt) + computeQuarantinedMw(ee) + computeQuarantinedMw(lv);
    expect(balticInclusive).toBe(821.5); // matches live `fleet.baltic_operational_mw` 822 (rounded)
    expect(balticStrict).toBe(471);
    expect(balticQuarantined).toBe(350.5);
  });
});
