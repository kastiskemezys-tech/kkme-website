import { describe, it, expect } from 'vitest';
import {
  findMatrixCell,
  capexIrrOrderingValid,
  distinctIrrCount,
  type MatrixCell,
} from '../sensitivityMatrix';

// Live worker /revenue?dur=4h matrix snapshot, captured 2026-04-26.
const liveMatrix4h: MatrixCell[] = [
  { cod: 2027, capex_kwh: 120, project_irr: 0.1429 },
  { cod: 2027, capex_kwh: 164, project_irr: 0.0881 },
  { cod: 2027, capex_kwh: 262, project_irr: 0.0209 },
  { cod: 2028, capex_kwh: 120, project_irr: 0.1401 },
  { cod: 2028, capex_kwh: 164, project_irr: 0.0865 },
  { cod: 2028, capex_kwh: 262, project_irr: 0.0200 },
  { cod: 2029, capex_kwh: 120, project_irr: 0.1387 },
  { cod: 2029, capex_kwh: 164, project_irr: 0.0858 },
  { cod: 2029, capex_kwh: 262, project_irr: 0.0199 },
];

describe('CAPEX-IRR sensitivity matrix', () => {
  it('cell lookup: each (capex, cod) returns the right entry', () => {
    expect(findMatrixCell(liveMatrix4h, 120, 2027)?.project_irr).toBeCloseTo(0.1429, 4);
    expect(findMatrixCell(liveMatrix4h, 164, 2027)?.project_irr).toBeCloseTo(0.0881, 4);
    expect(findMatrixCell(liveMatrix4h, 262, 2027)?.project_irr).toBeCloseTo(0.0209, 4);
  });

  it('within each COD year, lower CAPEX strictly yields higher IRR (regression for 7.6.7)', () => {
    expect(capexIrrOrderingValid(liveMatrix4h)).toBe(true);
  });

  it('audit case: 120 / 164 / 262 in 2027 column are distinct, ordered IRRs', () => {
    const r120 = findMatrixCell(liveMatrix4h, 120, 2027)!.project_irr!;
    const r164 = findMatrixCell(liveMatrix4h, 164, 2027)!.project_irr!;
    const r262 = findMatrixCell(liveMatrix4h, 262, 2027)!.project_irr!;
    expect(r120).toBeGreaterThan(r164);
    expect(r164).toBeGreaterThan(r262);
    // None of them should round to the same display value (the audit symptom)
    const display = (irr: number) => (irr * 100).toFixed(1);
    expect(display(r120)).not.toBe(display(r164));
    expect(display(r164)).not.toBe(display(r262));
  });

  it('matrix has at least 6 distinct IRR values (would be 1 if model collapsed)', () => {
    expect(distinctIrrCount(liveMatrix4h)).toBeGreaterThanOrEqual(6);
  });

  it('detects collapsed matrix as invalid (future regression guard)', () => {
    const collapsed: MatrixCell[] = [
      { cod: 2027, capex_kwh: 120, project_irr: 0.086 },
      { cod: 2027, capex_kwh: 164, project_irr: 0.086 },
      { cod: 2027, capex_kwh: 262, project_irr: 0.086 },
    ];
    expect(capexIrrOrderingValid(collapsed)).toBe(false);
    expect(distinctIrrCount(collapsed)).toBe(1);
  });

  it('detects inverted ordering as invalid', () => {
    const inverted: MatrixCell[] = [
      { cod: 2027, capex_kwh: 120, project_irr: 0.05 }, // lower CAPEX, lower IRR (wrong)
      { cod: 2027, capex_kwh: 164, project_irr: 0.10 },
      { cod: 2027, capex_kwh: 262, project_irr: 0.15 },
    ];
    expect(capexIrrOrderingValid(inverted)).toBe(false);
  });
});
