import { describe, it, expect } from 'vitest';
import {
  activationCoveragePct,
  ACTIVATION_COVERAGE_LABEL,
  ACTIVATION_COVERAGE_FORMULA,
  TOTAL_ISPS_PER_DAY,
} from '../activationCoverage';

describe('activationCoveragePct', () => {
  it('returns 0 when no ISPs activated', () => {
    expect(activationCoveragePct(0)).toBe(0);
  });

  it('returns 100 when every 15-min ISP activated', () => {
    expect(activationCoveragePct(TOTAL_ISPS_PER_DAY)).toBe(100);
  });

  it('matches the worker contract: 47/96 → 49.0%', () => {
    // The audit case — 49% activation rate on the Trading card.
    expect(activationCoveragePct(47)).toBe(49);
  });

  it('rounds to one decimal', () => {
    // 20/96 = 20.833…% → 20.8 (one-decimal precision)
    expect(activationCoveragePct(20)).toBe(20.8);
  });

  it('clamps activated count to [0, totalIsps]', () => {
    expect(activationCoveragePct(-5)).toBe(0);
    expect(activationCoveragePct(200)).toBe(100);
  });

  it('returns 0 on non-finite input', () => {
    expect(activationCoveragePct(Number.NaN)).toBe(0);
    expect(activationCoveragePct(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('handles a synthetic 100 MW / 20 MWh / 24h check', () => {
    // The audit prompt's example: 100 MW reserved, 20 MWh activated over 24h.
    // That's the textbook activation-rate calc (activated MWh ÷ MW × hours)
    // = 20 / (100 × 24) = 0.83%. The card metric is *not* that — and the
    // helper would not be the right place to compute it. This test pins the
    // intentional gap: the displayed metric is ISP coverage, not MWh-rate.
    const isps = 8; // synthetic: 8 of 96 ISPs had any upward dispatch
    expect(activationCoveragePct(isps)).toBe(8.3);
  });
});

describe('ACTIVATION_COVERAGE constants', () => {
  it('exports a card label distinct from "activation rate"', () => {
    expect(ACTIVATION_COVERAGE_LABEL.toLowerCase()).not.toBe('activation rate');
    expect(ACTIVATION_COVERAGE_LABEL).toContain('coverage');
  });

  it('formula caption explains the ÷96 denominator', () => {
    expect(ACTIVATION_COVERAGE_FORMULA).toContain('96');
    expect(ACTIVATION_COVERAGE_FORMULA.toLowerCase()).toMatch(/aFRR|mFRR|isp/i);
  });
});
