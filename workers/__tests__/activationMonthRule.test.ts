/**
 * Phase 53 — the canonical activation-month rule, the clamp disclosure, and the
 * admission rule on `POST /s2/activation`.
 *
 * Origin, all three in one phase and all three the same shape — a value that
 * asserts something it did not compute:
 *
 *   · `computeBaseYear` read 66.90 / 38.71 / 33.33 €/MW/h from the market-formation
 *     window at face value while `deriveCompression`, one function away, called
 *     those same months "post-sync anomaly normalisation" and discounted them.
 *     One question answered twice (rule #4).
 *   · `compression_rate_observed` published 0.15 — the CLAMP CEILING — under a
 *     name asserting observation. Measured 2026-08-06, the frozen series and a
 *     fresh one both imply ~100 %/yr and both printed 0.15 (rule #2).
 *   · `POST /s2/activation` wrote its body verbatim behind a single
 *     `body.countries` truthiness check, which is how the published trajectory
 *     came to rest on a payload of unestablished provenance.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIVATION_MONTH_RULE,
  activationMonthEligible,
  eligibleActivationMonths,
  deriveCompression,
  admitActivationPayload,
} from '../fetch-s1.js';

const ISPS = 30 * 96;
const month = (count: number, p50 = 10) => ({ avg: p50, p50, p90: p50 * 2, count });

describe('the eligibility rule is computed, not a month list', () => {
  it('rejects the month that is 99.2 % absent — the one that anchored initial_p50', () => {
    // 2025-09 carried 24 priced ISPs and a p50 of 66.90, and deriveCompression
    // used that p50 as the baseline for the whole compression calculation.
    const v = activationMonthEligible('2025-09', month(24, 66.9));
    expect(v.eligible).toBe(false);
    expect(v.coverage).toBeCloseTo(24 / ISPS, 6);
    expect(v.reasons[0]).toMatch(/coverage 0\.8% < 20% minimum/);
  });

  it('admits a fully observed month', () => {
    expect(activationMonthEligible('2026-07', month(2880)).eligible).toBe(true);
  });

  it('admits the loosest month in the observed record, so the threshold is not tuned to a result', () => {
    // 2025-11 sits at 635/2880 = 22.0 %, the lowest of any month that is not the
    // 1.1 % outlier. The COVERAGE threshold has to clear it or it is fitting —
    // pinned coverage-only, because 2025-11 is separately outside the signed
    // regime and that would mask what this test is about.
    expect(activationMonthEligible('2025-11', month(635), { ...ACTIVATION_MONTH_RULE, regime_start: null }).eligible).toBe(true);
  });

  it('rejects the CURRENT partial month — the trailing-edge case that froze April at 1.18', () => {
    // The frozen payload was stored on 2026-04-20, so its April covered 20 days
    // (count 1346) and reported p50 1.18 against a full April's 2.83. The same
    // shape recurs every month; the rule catches it without a date.
    const v = activationMonthEligible('2026-08', month(480));
    expect(v.eligible).toBe(false);
    expect(v.reasons[0]).toMatch(/16\.7% < 20%/);
  });

  it('reports "cannot be computed" distinctly from "checked and passed" (B12)', () => {
    const v = activationMonthEligible('2026-07', { p50: 5 } as never);
    expect(v.eligible).toBe(false);
    expect(v.coverage).toBeNull();
    expect(v.reasons[0]).toMatch(/coverage cannot be computed/);
  });

  it('applies a declared regime boundary when one is set, and none when it is not', () => {
    const base = { ...ACTIVATION_MONTH_RULE, regime_start: null };
    expect(activationMonthEligible('2025-10', month(2283), base).eligible).toBe(true);
    const gated = { ...ACTIVATION_MONTH_RULE, regime_start: '2026-03' };
    const v = activationMonthEligible('2025-10', month(2283), gated);
    expect(v.eligible).toBe(false);
    expect(v.reasons).toContain('before declared regime start 2026-03');
  });

  it('partitions a real-shaped map and names every exclusion with its reason', () => {
    // Coverage-only, pinned explicitly: this asserts the partitioning
    // mechanism, which must not move when the operator moves the regime
    // boundary. A mechanism test inheriting a policy constant would break on
    // every policy change and, worse, could start passing for the wrong reason.
    const { eligible, excluded } = eligibleActivationMonths({
      '2025-09': month(24, 66.9),
      '2025-10': month(2283, 38.71),
      '2026-07': month(2880, 5),
    }, { ...ACTIVATION_MONTH_RULE, regime_start: null });
    expect(eligible).toEqual(['2025-10', '2026-07']);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].month).toBe('2025-09');
    expect(excluded[0].reasons).toHaveLength(1);
  });
});

describe('deriveCompression reports the clamp as a clamp', () => {
  const kvWith = (p50s: number[], months: string[], counts: number[]) => ({
    s2_activation_parsed: {
      compression: { afrr_lt_p50: p50s, months },
      lt_monthly_afrr: Object.fromEntries(months.map((m, i) => [m, month(counts[i], p50s[i])])),
    },
  });

  it('names the ceiling instead of publishing it as a measurement', () => {
    // In-regime months with one under-covered month and a steep recent decline,
    // so BOTH properties are exercised: the rule bites, and the result clamps.
    const r = deriveCompression(kvWith(
      [40, 30, 25, 20, 10, 5],
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
      [2880, 2880, 2880, 2880, 2880, 480],
    ) as never);
    expect(r.rate).toBe(0.15);
    expect(r.rate_clamped_at).toBe('max');
    expect(r.rate_measured).toBeGreaterThan(0.15);
    expect(r.note).toMatch(/CLAMPED to the ceiling/);
    // and it dropped the 16.7 %-coverage current month rather than using it
    expect(r.eligibility_rule_applied).toBe(true);
    expect(r.months_excluded.map((e: { month: string }) => e.month)).toEqual(['2026-08']);
  });

  it('does not report a substituted floor as a measurement', () => {
    // A flat/rising recent window yields forward_rate 0; 0.03 is an assumed
    // structural floor standing in for it. `rate_measured` must say 0, not 0.03.
    const r = deriveCompression(kvWith(
      [6.3, 2.74, 4.53, 9.99, 5],
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      [1678, 2256, 2837, 2776, 2880],
    ) as never);
    expect(r.rate).toBe(0.03);
    expect(r.rate_measured).toBe(0);
    expect(r.rate_floor_substituted).toBe(true);
    expect(r.rate_clamped_at).toBeNull();
    expect(r.note).toMatch(/assumed structural floor/);
    expect(r.note).not.toMatch(/CLAMPED/);
  });

  it('tracks the value: an un-clamped, un-substituted rate reports as neither', () => {
    // The verdict clause must follow the number beside it, not merely exist.
    // Note how gentle this decline has to be — see the next test for why.
    const r = deriveCompression(kvWith(
      [10, 9.95, 9.9, 9.87, 9.83],
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      [2880, 2880, 2880, 2880, 2880],
    ) as never);
    expect(r.rate_clamped_at).toBeNull();
    expect(r.rate_floor_substituted).toBe(false);
    // `rate` is unrounded because it is arithmetic; `rate_measured` is 3 dp
    // because it is disclosure. Equal to the emitted precision when no bound bit.
    expect(r.rate).toBeCloseTo(r.rate_measured, 3);
    expect(r.note).toMatch(/measured/);
    expect(r.note).not.toMatch(/CLAMPED|substituted/);
  });

  it('pins how easily the ceiling binds — it is the normal case, not an edge case', () => {
    // 1 - (1-m)^12 = 0.15  =>  m = 1.35 %/month, i.e. a 2.67 % fall across the
    // two-month recent span. Anything steeper publishes 0.15 regardless of the
    // data, which is why BOTH the frozen and the fresh series printed 0.15.
    // Written as a test so the bound cannot be widened without this going red.
    const gentle = deriveCompression(kvWith(
      [10, 10, 10, 10, 9.74],   // -2.6 % over the span: just inside
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      [2880, 2880, 2880, 2880, 2880],
    ) as never);
    expect(gentle.rate_clamped_at).toBeNull();

    const steeper = deriveCompression(kvWith(
      [10, 10, 10, 10, 9.7],    // -3.0 % over the span: already at the ceiling
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      [2880, 2880, 2880, 2880, 2880],
    ) as never);
    expect(steeper.rate_clamped_at).toBe('max');
    expect(steeper.rate).toBe(0.15);
  });

  it('says so when coverage is unknowable rather than passing silently', () => {
    const r = deriveCompression({
      s2_activation_parsed: {
        compression: { afrr_lt_p50: [10, 9, 8, 7], months: ['a', 'b', 'c', 'd'] },
      },
    } as never);
    expect(r.eligibility_basis).toMatch(/lt_monthly_afrr absent/);
    expect(r.months_excluded).toEqual([]);
  });

  it('keeps the full window rather than collapsing to the fleet fallback', () => {
    // Filtering to fewer than 4 points would hand the answer to a different
    // source silently. It must not.
    const r = deriveCompression(kvWith(
      [66.9, 38.71, 0.32, 12, 16.68],
      ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01'],
      [24, 24, 24, 24, 2425],   // almost everything ineligible
    ) as never);
    expect(r.source).toBe('derived_from_s2_activation');
    expect(r.data_points).toBe(5);
  });
});

describe('POST /s2/activation admission rule', () => {
  const good = () => ({
    countries: {
      Lithuania: {
        afrr_recent_3m: { avg_p50: 6.7 },
        afrr_up: { '2026-06': month(2776, 9.99), '2026-07': month(2880, 5) },
      },
    },
    compression_trajectory: { months: ['2026-06', '2026-07'], afrr_lt_p50: [9.99, 5] },
  });

  it('admits a well-formed payload', () => {
    expect(admitActivationPayload(good(), null).ok).toBe(true);
  });

  it('refuses what the old route accepted — a body with countries and nothing else', () => {
    // This is exactly what the pre-Phase-53 check passed.
    const v = admitActivationPayload({ countries: {} }, null);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Lithuania required/);
  });

  it('refuses parallel arrays of different lengths', () => {
    const b: Record<string, never> = good() as never;
    b.compression_trajectory.afrr_lt_p50 = [9.99];
    const v = admitActivationPayload(b, null);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(422);
    expect(v.detail).toMatch(/months=2 afrr_lt_p50=1/);
  });

  it('refuses a non-finite value in the series', () => {
    const b: Record<string, never> = good() as never;
    b.compression_trajectory.afrr_lt_p50 = [9.99, null];
    expect(admitActivationPayload(b, null).ok).toBe(false);
  });

  it('refuses a payload missing the monthly map the base year joins on', () => {
    const b: Record<string, never> = good() as never;
    delete b.countries.Lithuania.afrr_up;
    expect(admitActivationPayload(b, null).reason).toMatch(/afrr_up monthly map required/);
  });

  it('refuses a narrowing against a wider stored series, and takes it when acknowledged', () => {
    const stored = JSON.stringify({ compression_trajectory: { months: ['a', 'b', 'c', 'd', 'e'] } });
    const v = admitActivationPayload(good(), stored);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
    expect(v.detail).toMatch(/incoming=2 stored=5/);
    expect(admitActivationPayload({ ...good(), acknowledge_narrowing: true }, stored).ok).toBe(true);
  });

  it('does not let an unreadable stored value block a good write', () => {
    expect(admitActivationPayload(good(), '{corrupt').ok).toBe(true);
  });
});

describe('the guard that declines to apply the rule says so', () => {
  const kvWith = (p50s: number[], months: string[], counts: number[]) => ({
    s2_activation_parsed: {
      compression: { afrr_lt_p50: p50s, months },
      lt_monthly_afrr: Object.fromEntries(months.map((m, i) => [m, month(counts[i], p50s[i])])),
    },
  });

  it('does not claim an exclusion it did not make', () => {
    // The frozen production window under the signed regime boundary: only
    // 2026-03 and 2026-04 survive, which is fewer than a trajectory needs, so
    // the full series is used. The payload must not then report the excluded
    // months as excluded — that is rule #2 inside the fix for rule #2.
    const r = deriveCompression(kvWith(
      [66.9, 38.71, 0.32, 12, 16.68, 33.33, 6.12, 1.18],
      ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'],
      [24, 2283, 635, 681, 2425, 1719, 1735, 1346],
    ) as never);
    expect(r.eligibility_rule_applied).toBe(false);
    expect(r.months_excluded).toEqual([]);
    expect(r.data_points).toBe(8);
    expect(r.eligibility_basis).toMatch(/NOT APPLIED/);
    expect(r.eligibility_basis).toMatch(/computeBaseYear excludes them/);
  });

  it('reports applied=true and the real list when the rule does bite', () => {
    const r = deriveCompression(kvWith(
      [6.3, 2.74, 4.53, 9.99, 5, 5],
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
      [1678, 2256, 2837, 2776, 2880, 480],
    ) as never);
    expect(r.eligibility_rule_applied).toBe(true);
    expect(r.months_excluded.map((e: { month: string }) => e.month)).toEqual(['2026-08']);
    expect(r.data_points).toBe(5);
  });
});
