/**
 * Phase 38.2 — the canonical S/D caption is a RENDERED STRING, and this asserts
 * the rendered string.
 *
 * 36.D shipped one canonical S/D disclosure to replace three divergent ones, it
 * was signed off, and it then never reached a browser on any `/s4`-fed surface.
 * Nothing was broken in the caption: the `/s4` assembler was a hand-maintained
 * 10-field whitelist that copied `baltic_weighted_mw`'s neighbours and not the
 * field itself, so every call site's `!= null` guard went false at once and the
 * surfaces fell back to a generic sentence that looks entirely fine.
 *
 * Every assertion below therefore runs the REAL worker router over a REAL
 * stored fleet payload, and asserts on what comes out the other end as text —
 * either the SSR markup of the component the reader sees, or the exact tooltip
 * string the ticker and the hero set as `title`. A test asserting
 * `payload.fleet.baltic_weighted_mw != null` would have passed on 36.D's dark
 * build and is the thing this file exists not to be (playbook B13).
 *
 * Proven by inject-then-revert against the real mechanism: restoring the
 * 10-field whitelist in `workers/fetch-s1.js` turns the /s4 specs red and
 * leaves the /s4/fleet spec green — which is exactly the asymmetry the audit
 * found in production. See the phase handover for the red/green output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import worker from '../../../workers/fetch-s1.js';
import { SdFormulaLine } from '@/app/components/S4Card';
import { fleetSdCaption, sdCaptionIsConsistent } from '@/app/lib/sdRatio';
import FLEET_FIXTURE from '../../../workers/__tests__/fixtures/s4-fleet-live-2026-08-02.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// The `s4` base object the assembler merges the fleet into. Only the fields the
// GET /s4 path needs to reach the fleet merge; the caption depends on none of
// them.
const S4_BASE = {
  timestamp: '2026-08-02T16:00:57.726Z',
  free_mw: 3500,
  storage_by_country: {},
  baltic_total: { installed_mw: 651 },
};

let store: Map<string, string>;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;

function makeEnv() {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
  } as Any;
}

const get = (path: string) =>
  (worker as Any).fetch(new Request(`https://x.kkme.eu${path}`), makeEnv(), ctx);

beforeEach(() => {
  store = new Map();
  store.set('s4', JSON.stringify(S4_BASE));
  store.set('s4_fleet', JSON.stringify(FLEET_FIXTURE));
});

/** The generic sentence every dark surface fell through to. */
const FALLBACK = 'S/D = credibility-weighted supply / effective Baltic reserve demand.';

describe('the canonical S/D caption survives the /s4 assembler', () => {
  it('S4Card renders the caption line, with the arithmetic the payload publishes', async () => {
    const s4 = await (await get('/s4')).json();

    const html = renderToStaticMarkup(<SdFormulaLine fleet={s4.fleet} />);

    // The line exists at all — before the fix this component rendered null.
    expect(html).toContain('sd-formula-caption');
    // …and it is the canonical net form, not the gross degradation the caption
    // falls back to when `absorption_mw` is the field that goes missing.
    expect(html).toContain('S/D = (weighted supply − contracted-away) / effective demand');
    // The numbers are the payload's own, and they reproduce the published
    // ratio — a caption whose arithmetic disagrees with the headline beside it
    // is the defect 36.D existed to fix.
    expect(html).toContain('(2385 − 200) MW / 752 MW = 2.91×');
    expect(sdCaptionIsConsistent({
      weightedMw: s4.fleet.baltic_weighted_mw,
      effDemandMw: s4.fleet.eff_demand_mw,
      absorptionMw: s4.fleet.absorption_mw,
      publishedSdRatio: s4.fleet.sd_ratio,
    })).toBe(true);
  });

  it('the KPI ticker tooltip is the caption, not the generic sentence', async () => {
    const s4 = await (await get('/s4')).json();

    // Byte-for-byte the expression SignalBar assigns to `title`.
    const caption = fleetSdCaption(s4.fleet);
    const tooltip = caption
      ? `${caption}. Supply is credibility-weighted by project status; contracted-away MW serve Lithuanian reserve products outside this model.`
      : FALLBACK;

    expect(tooltip).not.toBe(FALLBACK);
    expect(tooltip).toContain('(2385 − 200) MW / 752 MW = 2.91×');
  });

  it('the hero tooltip renders from /s4/fleet, which the whitelist never touched', async () => {
    const fleet = await (await get('/s4/fleet')).json();

    const caption = fleetSdCaption(fleet);
    expect(caption).not.toBeNull();
    expect(caption).toContain('(2385 − 200) MW / 752 MW = 2.91×');
  });

  it('the composition tooltip carries a strict count, not a dash', async () => {
    const s4 = await (await get('/s4')).json();
    const f = s4.fleet;

    // Byte-for-byte SignalBar's FLEX FLEET tooltip assembly.
    const parts = [
      f?.baltic_operational_mw != null ? `Inclusive total: ${Math.round(f.baltic_operational_mw)} MW.` : null,
      f?.baltic_operational_mw_strict != null ? `Strict verified (excludes _quarantine): ${Math.round(f.baltic_operational_mw_strict)} MW.` : null,
    ].filter(Boolean);

    expect(parts).toHaveLength(2);
    expect(parts.join(' ')).toContain('Strict verified (excludes _quarantine): 782 MW.');
  });

  it('every aggregate processFleet computes reaches /s4 — the whitelist is gone, not widened', async () => {
    const s4 = await (await get('/s4')).json();

    // The failure mode was omission, so the guard is on the SHAPE of the
    // projection rather than on a list of names some future field can miss.
    const dropped = Object.keys(FLEET_FIXTURE)
      .filter(k => k !== 'raw_entries' && k !== 'demand')
      .filter(k => !(k in s4.fleet));

    expect(dropped).toEqual([]);
    // raw_entries is republished as `projects`, not inside `fleet`.
    expect(s4.fleet).not.toHaveProperty('raw_entries');
    expect(Array.isArray(s4.projects)).toBe(true);
  });
});
