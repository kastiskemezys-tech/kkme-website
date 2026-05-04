import { describe, it, expect } from 'vitest';
import { METRIC_REGISTRY, getInstalledMw } from '../metricRegistry';

describe('metricRegistry — canonical metric declarations (Phase 12.10)', () => {
  it('declares the four cross-card metrics audit #5 flagged', () => {
    expect(METRIC_REGISTRY.installed_storage_lt_mw).toBeDefined();
    expect(METRIC_REGISTRY.installed_storage_lv_mw).toBeDefined();
    expect(METRIC_REGISTRY.installed_storage_ee_mw).toBeDefined();
    expect(METRIC_REGISTRY.baltic_total_installed_mw).toBeDefined();
    expect(METRIC_REGISTRY.baltic_flexibility_fleet_mw).toBeDefined();
  });

  it('every entry names a worker payload path so CI can grep for raw alternatives', () => {
    for (const [key, descriptor] of Object.entries(METRIC_REGISTRY)) {
      expect(descriptor.workerPath, `${key} missing workerPath`).toMatch(/^s4\./);
      expect(descriptor.label.length, `${key} missing label`).toBeGreaterThan(0);
      expect(descriptor.meaning.length, `${key} missing meaning`).toBeGreaterThan(20);
    }
  });
});

describe('getInstalledMw — _live preferred over hardcode (Phase 12.10)', () => {
  it('returns _live when present and as_of preserved', () => {
    const s4 = {
      storage_by_country: {
        LT: {
          installed_mw: 506,
          installed_mw_live: 504,
          installed_mw_live_as_of: '2026-05-03',
          installed_mw_live_source_url: 'https://transparency.entsoe.eu/...',
          installed_mw_as_of: '2026-04-23',
          installed_mw_source_url: 'https://litgrid.eu/...',
        },
      },
    };
    const r = getInstalledMw(s4, 'LT');
    expect(r.value).toBe(504);
    expect(r.source).toBe('live');
    expect(r.as_of).toBe('2026-05-03');
    expect(r.source_url).toBe('https://transparency.entsoe.eu/...');
  });

  it('falls back to hardcode when _live is null', () => {
    const s4 = {
      storage_by_country: {
        LV: {
          installed_mw: 80,
          installed_mw_live: null,
          installed_mw_as_of: '2025-10',
          installed_mw_source_url: 'https://www.ast.lv/...',
        },
      },
    };
    const r = getInstalledMw(s4, 'LV');
    expect(r.value).toBe(80);
    expect(r.source).toBe('hardcode');
    expect(r.as_of).toBe('2025-10');
  });

  it('returns fallback when both _live and hardcode are missing', () => {
    const r = getInstalledMw({ storage_by_country: { EE: {} } }, 'EE');
    expect(r.value).toBeNull();
    expect(r.source).toBe('fallback');
    expect(r.as_of).toBeNull();
  });

  it('returns fallback when storage_by_country is missing entirely', () => {
    expect(getInstalledMw(null, 'LT').source).toBe('fallback');
    expect(getInstalledMw(undefined, 'LV').source).toBe('fallback');
    expect(getInstalledMw({}, 'EE').source).toBe('fallback');
  });
});
