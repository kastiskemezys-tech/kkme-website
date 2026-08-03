/**
 * Phase 38.2 (B-058) — `baltic_total.installed_mw` is the sum of its parts, and
 * cannot be overridden back into a second writer.
 *
 * It used to resolve as `getVal('installed_storage_baltic_mw', ltMw + lvMw +
 * eeMw)`, so a stored assertion won over the arithmetic. On 2026-08-03 that
 * assertion held 651 and 484 + 40 + 127 came to 651 — the duplication was
 * invisible because the two writers agreed, which is precisely the shape B12
 * warns about. It would have become visible the moment LV moved to 80: the
 * headline would have kept saying 651 beside three country figures summing to
 * 691, and nothing would have caught it.
 *
 * The test that matters is therefore NOT "does it equal 651 today" — that
 * passed throughout the defect. It is "does it track its parts when they move",
 * which is why every spec below perturbs a country and checks the total
 * followed. Proven failable by inject-then-revert: restoring the `getVal`
 * override with the live assertion present takes the perturbation specs red.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../fetch-s1.js';
import LIVE_BUILDABILITY from './fixtures/s4-buildability-live-2026-08-03.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as Any;
let store: Map<string, string>;

function makeEnv() {
  return {
    KKME_SIGNALS: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
    },
  } as Any;
}

const getS4 = async () => {
  const res = await (worker as Any).fetch(new Request('https://x.kkme.eu/s4'), makeEnv(), ctx);
  return res.json();
};

/** Seed the real production assertion set, optionally with country overrides. */
function seed(overrides: Record<string, number> = {}) {
  const key = JSON.parse(JSON.stringify(LIVE_BUILDABILITY));
  for (const [k, value] of Object.entries(overrides)) {
    key.assertions[k] = { ...(key.assertions[k] ?? {}), value };
  }
  store = new Map();
  store.set('s4', JSON.stringify({ timestamp: '2026-08-03T05:00:00Z', free_mw: 3500 }));
  store.set('s4_buildability', JSON.stringify(key));
}

describe('baltic_total.installed_mw is the sum of the country figures', () => {
  beforeEach(() => seed());

  it('equals LT + LV + EE on the live assertion set', async () => {
    const d = await getS4();
    const { LT, LV, EE } = d.storage_by_country;
    expect(d.baltic_total.installed_mw).toBe(LT.installed_mw + LV.installed_mw + EE.installed_mw);
    expect(d.baltic_total.installed_mw).toBe(651);   // 484 + 40 + 127, today
  });

  it('follows LV when it moves — the case the old override would have failed', async () => {
    // This is 38.2 stage 3a. Under the pre-fix code the stored
    // `installed_storage_baltic_mw = 651` would have won and the headline
    // would have stayed 651 beside three figures summing to 691.
    seed({ installed_storage_lv_mw: 80 });
    const d = await getS4();
    expect(d.storage_by_country.LV.installed_mw).toBe(80);
    expect(d.baltic_total.installed_mw).toBe(691);
  });

  it('follows LT and EE too — the property is arithmetic, not a special case for LV', async () => {
    seed({ installed_storage_lt_mw: 500, installed_storage_ee_mw: 130 });
    const d = await getS4();
    expect(d.baltic_total.installed_mw).toBe(500 + 40 + 130);
  });

  it('a stray installed_storage_baltic_mw assertion can no longer override the sum', async () => {
    // The deleted override, reintroduced by a poster, must be inert. A
    // quantity defined as the sum has one writer.
    seed({ installed_storage_lv_mw: 80, installed_storage_baltic_mw: 651 });
    const d = await getS4();
    expect(d.baltic_total.installed_mw).toBe(691);
  });

  it('holds with no assertions at all, against the worker hardcodes', async () => {
    store = new Map();
    store.set('s4', JSON.stringify({ timestamp: '2026-08-03T05:00:00Z' }));
    const d = await getS4();
    const { LT, LV, EE } = d.storage_by_country;
    expect(d.baltic_total.installed_mw).toBe(LT.installed_mw + LV.installed_mw + EE.installed_mw);
  });
});
