import { describe, it, expect } from 'vitest';
import { computeRenewableMix, solarAnomalyFootnote } from '../renewableShare';

describe('renewable mix computation', () => {
  it('audit case: 1482 MW solar / 2395 MW load = 62% (real, not artifact)', () => {
    const r = computeRenewableMix({ windMw: 1471, solarMw: 1482, loadMw: 2395 });
    expect(Math.round(r.solarPct)).toBe(62);
    expect(r.invalid).toBe(false);
  });

  it('per-source shares never exceed 100% (regression guard)', () => {
    // Many ENTSO-E hours, many random combinations
    for (let i = 0; i < 100; i++) {
      const load = 1000 + Math.random() * 4000;
      const wind = Math.random() * load * 0.9;
      const solar = Math.random() * load * 0.9;
      const r = computeRenewableMix({ windMw: wind, solarMw: solar, loadMw: load });
      expect(r.windPct).toBeLessThanOrEqual(100);
      expect(r.solarPct).toBeLessThanOrEqual(100);
    }
  });

  it('flags invalid when any single source exceeds load (upstream bug)', () => {
    const r = computeRenewableMix({ windMw: 100, solarMw: 4000, loadMw: 2000 });
    expect(r.invalid).toBe(true);
  });

  it('thermal MW + renewable MW never exceeds load', () => {
    const r = computeRenewableMix({ windMw: 800, solarMw: 1500, loadMw: 2400 });
    expect(r.renewableMw + r.thermalMw).toBeLessThanOrEqual(2400 + 0.01);
  });

  it('thermal clamps at 0 when renewable exceeds load (curtailment hour)', () => {
    const r = computeRenewableMix({ windMw: 1500, solarMw: 1500, loadMw: 2400 });
    expect(r.thermalMw).toBe(0);
  });

  it('solar anomaly: today/7d ratio drives label', () => {
    // Audit live trace: 1482 today vs 771 7d-avg = 1.92x → exceptional
    const r = computeRenewableMix({
      windMw: 1471,
      solarMw: 1482,
      loadMw: 2395,
      solarAvg7dMw: 771,
      loadAvg7dMw: 3000,
    });
    expect(r.solarAnomaly).toBe('exceptional');
  });

  it('solar anomaly stays normal when today is near 7d average', () => {
    const r = computeRenewableMix({
      windMw: 800,
      solarMw: 800,
      loadMw: 3000,
      solarAvg7dMw: 750,
      loadAvg7dMw: 3000,
    });
    expect(r.solarAnomaly).toBe('normal');
  });

  it('footnote text describes the multiple over 7d when anomalous', () => {
    const r = computeRenewableMix({
      windMw: 1471,
      solarMw: 1482,
      loadMw: 2395,
      solarAvg7dMw: 771,
      loadAvg7dMw: 3000,
    });
    const note = solarAnomalyFootnote(r, 1482, 771);
    expect(note).not.toBeNull();
    expect(note).toMatch(/exceptional/);
    expect(note).toMatch(/1\.9×/);
  });

  it('footnote returns null when anomaly is normal', () => {
    const r = { ...computeRenewableMix({ windMw: 800, solarMw: 800, loadMw: 3000 }) };
    expect(solarAnomalyFootnote(r, 800, 750)).toBeNull();
  });
});
