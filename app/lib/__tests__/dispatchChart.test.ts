import { describe, it, expect } from 'vitest';
import {
  normaliseHourlyDispatch,
  dailyTotalFromHourly,
  dispatchIntegrationOk,
  dailyAvgPerHour,
} from '../dispatchChart';

// Audit-shaped payload: live worker /api/dispatch capture (2026-04-26).
const auditHourly = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  revenue_eur: {
    capacity: 134.25,                 // distributes across 24h roughly equally
    activation: 175 * 50 / 24,        // headline activation €175/MW/day × 50 MW / 24h
    arbitrage: hour === 0 ? -63.28 : (hour === 18 ? 1500 : 10), // sparse
    total: 0,                         // recomputed below
  },
}));
for (const h of auditHourly) {
  h.revenue_eur.total =
    h.revenue_eur.capacity + h.revenue_eur.activation + h.revenue_eur.arbitrage;
}

describe('dispatch chart unit normalisation', () => {
  it('divides absolute € by mw_total so bars are €/MW/h', () => {
    const norm = normaliseHourlyDispatch(
      [{ hour: 0, revenue_eur: { capacity: 1500, activation: 0, arbitrage: 0, total: 1500 } }],
      50,
    );
    expect(norm[0].capacity_eur_per_mw_h).toBe(30);
    expect(norm[0].total_eur_per_mw_h).toBe(30);
  });

  it('sum of normalised hourly bars equals daily €/MW headline within rounding', () => {
    // Synthetic: 24 hours of €600 absolute on a 50 MW asset → 600/50 = €12/MW/h × 24 = €288/MW/day
    const synthetic = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue_eur: { capacity: 0, activation: 0, arbitrage: 0, total: 600 },
    }));
    const norm = normaliseHourlyDispatch(synthetic, 50);
    expect(dailyTotalFromHourly(norm)).toBeCloseTo(288, 1);
  });

  it('integration check passes when bars sum to headline within tolerance', () => {
    const synthetic = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue_eur: { capacity: 0, activation: 0, arbitrage: 0, total: 600 },
    }));
    const norm = normaliseHourlyDispatch(synthetic, 50);
    expect(dispatchIntegrationOk(norm, 288)).toBe(true);
    expect(dispatchIntegrationOk(norm, 999)).toBe(false);
  });

  it('audit case: bars on 50 MW asset sum to ~€292/MW/day headline', () => {
    // Use the live audit case: 24h × €14,621 absolute on 50 MW → 292.42 €/MW/day
    const live = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue_eur: {
        capacity: 0, activation: 0, arbitrage: 0,
        total: 14621.42 / 24,
      },
    }));
    const norm = normaliseHourlyDispatch(live, 50);
    expect(dailyTotalFromHourly(norm)).toBeCloseTo(292.43, 1);
    expect(dispatchIntegrationOk(norm, 292, 1.0)).toBe(true);
  });

  it('daily average per hour = headline / 24', () => {
    expect(dailyAvgPerHour(292)).toBeCloseTo(12.17, 2);
    expect(dailyAvgPerHour(0)).toBe(0);
  });

  it('returns empty array if mw_total is invalid (defensive guard)', () => {
    expect(normaliseHourlyDispatch(auditHourly, 0)).toEqual([]);
    expect(normaliseHourlyDispatch(auditHourly, -10)).toEqual([]);
  });
});
