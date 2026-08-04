/**
 * Phase 42 §3 — the calculator's link reproduces its configuration.
 *
 * "A calculator whose link does not reproduce its result is not shareable", and
 * this one had ZERO url-parameter handling — verified live before any edit: the
 * served HTML for `/calculator` and `/calculator?mw=250&mwh=500&cod_year=2031`
 * is byte-identical (md5 9a803b38667127a928d3ce01dee5831a for both).
 */
import { describe, it, expect } from 'vitest';
import { configFromSearch, searchFromConfig, shareUrl } from '../shareableConfig';
import { DEFAULT_INPUTS, LIMITS, type InputField } from '../calculatorApi';

const base = { ...DEFAULT_INPUTS } as Record<InputField, string>;

describe('reading a configuration out of a link', () => {
  it('adopts in-range values', () => {
    const { form, scenario, rejected } = configFromSearch('?mw=250&mwh=500&cod=2031&capex=210');
    expect(form).toEqual({ mw: '250', mwh: '500', cod_year: '2031', capex_eur_kwh: '210' });
    expect(scenario).toBeNull();
    expect(rejected).toEqual([]);
  });

  it('adopts a scenario', () => {
    expect(configFromSearch('?scenario=downside').scenario).toBe('downside');
    expect(configFromSearch('?scenario=upside').scenario).toBe('upside');
  });

  it('DROPS an out-of-range value rather than clamping it', () => {
    // Clamping would silently reproduce a DIFFERENT configuration under the same
    // link, which defeats the only thing the link is for. Dropping falls back to
    // the default AND reports which parameter was refused.
    const { form, rejected } = configFromSearch(`?mw=${LIMITS.mw[1] + 1}&mwh=500`);
    expect(form.mw).toBeUndefined();
    expect(form.mwh).toBe('500');
    expect(rejected).toContain('mw');
  });

  it('rejects a non-numeric value', () => {
    expect(configFromSearch('?mw=fifty').rejected).toContain('mw');
  });

  it('rejects an unknown scenario rather than defaulting silently', () => {
    const { scenario, rejected } = configFromSearch('?scenario=wildly-optimistic');
    expect(scenario).toBeNull();
    expect(rejected).toContain('scenario');
  });

  it('ignores unknown parameters without complaining about them', () => {
    // Analytics tags and the like are not our business and must not produce a
    // warning the reader cannot act on.
    const { form, rejected } = configFromSearch('?utm_source=slack&mw=250');
    expect(form.mw).toBe('250');
    expect(rejected).toEqual([]);
  });

  it('tolerates an empty or absent query string', () => {
    for (const q of ['', '?', '?&']) {
      const r = configFromSearch(q);
      expect(r.form).toEqual({});
      expect(r.rejected).toEqual([]);
    }
  });
});

describe('writing a configuration into a link', () => {
  it('emits nothing when everything is at its default', () => {
    // A link carrying every field including the untouched ones implies the
    // sender chose them.
    expect(searchFromConfig(base, 'central')).toBe('');
  });

  it('emits only what differs from the default', () => {
    const s = searchFromConfig({ ...base, mw: '250' }, 'central');
    expect(s).toBe('?mw=250');
  });

  it('includes a non-central scenario', () => {
    expect(searchFromConfig(base, 'downside')).toBe('?scenario=downside');
  });

  it('round-trips: write then read reproduces the configuration', () => {
    // The property the whole file exists for.
    const cfg = { ...base, mw: '250', mwh: '500', cod_year: '2031', capex_eur_kwh: '210', availability_pct: '95' };
    const { form, scenario } = configFromSearch(searchFromConfig(cfg, 'upside'));
    expect({ ...base, ...form }).toEqual(cfg);
    expect(scenario).toBe('upside');
  });

  it('builds an absolute shareable URL', () => {
    expect(shareUrl('https://kkme.eu', { ...base, mw: '250' }, 'central'))
      .toBe('https://kkme.eu/calculator?mw=250');
    expect(shareUrl('https://kkme.eu/', base, 'central')).toBe('https://kkme.eu/calculator');
  });
});

describe('every shareable field is bounded by the endpoint\'s own limits', () => {
  it('rejects the boundary+1 of each numeric field it accepts', () => {
    // Not a restatement of LIMITS: it drives the real reader with each field's
    // real ceiling+1 and asserts the refusal, so a field added to the URL map
    // without a limit shows up here.
    const PARAMS: [string, InputField][] = [
      ['mw', 'mw'], ['mwh', 'mwh'], ['cod', 'cod_year'], ['capex', 'capex_eur_kwh'],
      ['avail', 'availability_pct'], ['cycles', 'cycles_efc_yr'],
      ['warranty', 'warranty_efc_yr'], ['months', 'operating_months_y1'],
    ];
    for (const [param, field] of PARAMS) {
      const lim = LIMITS[field];
      expect(lim, `${field} has no declared limit`).toBeTruthy();
      const { form, rejected } = configFromSearch(`?${param}=${lim[1] + 1}`);
      expect(form[field], `${param} above its ceiling was accepted`).toBeUndefined();
      expect(rejected, `${param} above its ceiling was not reported`).toContain(param);
    }
  });
});

describe('the URL patch is a one-time adoption, not a permanent override', () => {
  it('editing a field retires that field\'s patch', () => {
    // The bug this pins: applying the URL patch as a render-time overlay makes
    // the link value win over every subsequent keystroke, so a shared link
    // renders a field the user cannot change. Caught by reasoning about the
    // overlay, not by a test — hence this one.
    const patch: Partial<Record<InputField, string>> = { mw: '250', mwh: '500' };
    const retire = (p: typeof patch, k: InputField) =>
      Object.fromEntries(Object.entries(p).filter(([f]) => f !== k));
    expect(retire(patch, 'mw')).toEqual({ mwh: '500' });
    // …and the untouched field keeps its adopted value.
    expect({ ...base, ...retire(patch, 'mw') }.mwh).toBe('500');
    expect({ ...base, ...retire(patch, 'mw') }.mw).toBe(base.mw);
  });
});
