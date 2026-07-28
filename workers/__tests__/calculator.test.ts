/**
 * Phase 35.1 — BESS Revenue Calculator.
 *
 * Covers: input validation, duration clamping, auth, rate limiting, tier
 * shapes, the sample-tier leak test, the client scenario port's parity with
 * batch-2's overlay, and route-level /revenue byte-identity.
 *
 * The whole suite runs offline against the frozen production KV fixture. A
 * gate that hits the live worker measures data drift, not code change.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import worker, {
  computeRevenueV7,
  REVENUE_SCENARIOS_FOR_TEST,
  cpiCurveForTest,
  cpiCurveScenarioForTest,
  loadEngineKV,
} from '../fetch-s1.js';
import * as CALC from '../lib/calculator.js';
import { loadConfigDir, runProject, PROJECTS_DIR } from '../../tools/consultancy/engine.mjs';
import { loadEngineWithDrivers } from '../../tools/consultancy/scenario-overlay.mjs';
import { loadScenarios } from '../../tools/consultancy/run-scenarios.mjs';

// Engine payloads are deeply dynamic; this matches the established convention
// in tools/consultancy/__tests__.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const REPO = join(__dirname, '../..');
const fixture = JSON.parse(
  readFileSync(join(REPO, 'tools/consultancy/fixtures/regression-kv.json'), 'utf8')
);
const kv = fixture.kv;

/** Raw KV strings, so loadEngineKV's own parsing runs for real in route tests. */
const rawKV: Record<string, string> = {
  s1: JSON.stringify(kv.s1),
  s2: JSON.stringify(kv.s2),
  s3: JSON.stringify(kv.s3),
  s4_fleet: JSON.stringify(kv.fleet),
  euribor: JSON.stringify(kv.euribor),
  s1_capture: JSON.stringify(kv.s1_capture),
  s2_activation: JSON.stringify({
    countries: {
      Lithuania: {
        afrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.lt?.afrr_p50 },
        mfrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.lt?.mfrr_p50 },
        afrr_up: kv.s2_activation_parsed?.lt_monthly_afrr ?? {},
        mfrr_up: kv.s2_activation_parsed?.lt_monthly_mfrr ?? {},
      },
      Latvia: {
        afrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.lv?.afrr_p50 },
        mfrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.lv?.mfrr_p50 },
      },
      Estonia: {
        afrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.ee?.afrr_p50 },
        mfrr_recent_3m: { avg_p50: kv.s2_activation_parsed?.ee?.mfrr_p50 },
      },
    },
    compression_trajectory: kv.s2_activation_parsed?.compression ?? null,
  }),
};

const SECRET = 'test-calculator-password';

// `noSecret` rather than `secret: undefined`: a destructuring default fires on
// undefined, so passing it would silently restore the secret.
function makeEnv({ secret = SECRET, noSecret = false, store = new Map<string, string>() } = {}) {
  return {
    env: {
      KKME_SIGNALS: {
        get: async (k: string) => (k in rawKV ? rawKV[k] : store.get(k) ?? null),
        put: async (k: string, v: string) => { store.set(k, v); },
      },
      ...(noSecret ? {} : { CALC_SECRET: secret }),
    } as Any,
    store,
  };
}
const ctx = { waitUntil: () => {} } as Any;

const post = (env: Any, path: string, body: Any, headers: Record<string, string> = {}) =>
  (worker as Any).fetch(
    new Request(`https://x.kkme.eu${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7', ...headers },
    }),
    env, ctx
  );

const VALID = { mw: 50, mwh: 100, cod_year: 2028, capex_eur_kwh: 164 };

// ── Validation ─────────────────────────────────────────────────────────────

describe('input validation', () => {
  it('accepts the reference configuration', () => {
    const v = CALC.validateCalcInput(VALID);
    expect(v.ok).toBe(true);
    expect(v.inputs!.scenario).toBe('central');
  });

  it.each([
    ['mw below range', { ...VALID, mw: 0 }],
    ['mw above range', { ...VALID, mw: 1001 }],
    ['mwh above range', { ...VALID, mwh: 4001 }],
    ['cod before range', { ...VALID, cod_year: 2025 }],
    ['cod after range', { ...VALID, cod_year: 2036 }],
    ['capex below range', { ...VALID, capex_eur_kwh: 79 }],
    ['capex above range', { ...VALID, capex_eur_kwh: 401 }],
    ['non-integer cod', { ...VALID, cod_year: 2028.5 }],
    ['missing mw', { mwh: 100, cod_year: 2028, capex_eur_kwh: 164 }],
    ['unknown scenario', { ...VALID, scenario: 'moon' }],
  ])('rejects %s', (_label, body) => {
    const v = CALC.validateCalcInput(body as Any);
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('rejects durations outside 0.5h–8h, naming the computed duration', () => {
    const tooLong = CALC.validateCalcInput({ ...VALID, mw: 10, mwh: 100 }); // 10h
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errors.join(' ')).toContain('10h');

    const tooShort = CALC.validateCalcInput({ ...VALID, mw: 100, mwh: 25 }); // 0.25h
    expect(tooShort.ok).toBe(false);
    expect(tooShort.errors.join(' ')).toContain('0.25h');
  });

  it('error messages carry the limit and the offending value', () => {
    const v = CALC.validateCalcInput({ ...VALID, capex_eur_kwh: 500 });
    expect(v.errors.join(' ')).toContain('80');
    expect(v.errors.join(' ')).toContain('400');
    expect(v.errors.join(' ')).toContain('500');
  });

  it('reports every problem at once rather than one at a time', () => {
    const v = CALC.validateCalcInput({ mw: 0, mwh: 9999, cod_year: 2050, capex_eur_kwh: 5 });
    expect(v.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Duration ───────────────────────────────────────────────────────────────

describe('duration clamping', () => {
  it('is calibrated at exactly 2h and 4h', () => {
    expect(CALC.CALIBRATION_DURATIONS_H).toEqual([2, 4]);
  });

  it('leaves the calibration points untouched and emits no note', () => {
    for (const [mw, mwh, h] of [[50, 100, 2], [50, 200, 4]] as const) {
      const d = CALC.resolveDuration(mw, mwh, 164);
      expect(d.clamped).toBe(false);
      expect(d.engine_h).toBe(h);
      expect(d.duration_note).toBeNull();
      expect(d.engine_capex_eur_kwh).toBe(164);
    }
  });

  it('clamps to the nearest calibration point across the midpoint', () => {
    expect(CALC.resolveDuration(50, 145, 164).engine_h).toBe(2);  // 2.9h
    expect(CALC.resolveDuration(50, 150, 164).engine_h).toBe(4);  // 3.0h
    expect(CALC.resolveDuration(50, 25, 164).engine_h).toBe(2);   // 0.5h
    expect(CALC.resolveDuration(50, 400, 164).engine_h).toBe(4);  // 8h
  });

  it('compensates CAPEX so the engine prices the USER\'s energy capacity', () => {
    const d = CALC.resolveDuration(50, 150, 164); // 3h → modelled at 4h
    // engine gross capex = rate × mw × engine_h × 1000 must equal the true cost
    const engineCapex = d.engine_capex_eur_kwh * 50 * d.engine_h * 1000;
    expect(Math.round(engineCapex)).toBe(164 * 150 * 1000);
  });

  it('states the direction of the bias rather than burying it', () => {
    expect(CALC.resolveDuration(50, 150, 164).duration_note!.direction).toContain('OVERSTATED');
    expect(CALC.resolveDuration(50, 130, 164).duration_note!.direction).toContain('UNDERSTATED');
  });

  it('the engine really is a step function of duration — the premise for clamping', () => {
    const at = (dur_h: number) =>
      (computeRevenueV7 as Any)({ mw: 50, dur_h, capex_kwh: 164, cod_year: 2028, scenario: 'base' }, kv).net_mw_yr;
    // Flat below 2h, flat at/above 3h, and a discontinuity at each boundary.
    expect(at(1)).toBe(at(2));
    expect(at(4)).toBe(at(8));
    expect(at(2)).not.toBe(at(2.5));
    expect(at(2.5)).not.toBe(at(3));
  });
});

// ── Auth ───────────────────────────────────────────────────────────────────

describe('calculator auth', () => {
  it('issues a 30-day token for the right password', async () => {
    const { env } = makeEnv();
    const res = await post(env, '/calculator/login', { password: SECRET });
    expect(res.status).toBe(200);
    const body = await res.json();
    const days = (body.expires - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    expect(await CALC.verifyCalcToken(SECRET, body.token)).toMatchObject({ ok: true });
  });

  it('rejects the wrong password with 401', async () => {
    const { env } = makeEnv();
    const res = await post(env, '/calculator/login', { password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns 503 when CALC_SECRET is unset — the pre-deploy state', async () => {
    const { env } = makeEnv({ noSecret: true });
    const res = await post(env, '/calculator/login', { password: SECRET });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(CALC.CALC_COPY.auth_unconfigured);
  });

  it('sample tier still works with no secret configured', async () => {
    const { env } = makeEnv({ noSecret: true });
    const res = await post(env, '/calculate', VALID);
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('sample');
  });

  it('rejects an expired token', async () => {
    const expired = await CALC.signCalcToken(SECRET, Date.now() - 1000);
    expect(await CALC.verifyCalcToken(SECRET, expired)).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('rejects a token signed with a different secret', async () => {
    const other = await CALC.signCalcToken('some-other-secret', Date.now() + 100000);
    expect(await CALC.verifyCalcToken(SECRET, other)).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a token whose expiry has been edited', async () => {
    const t = await CALC.signCalcToken(SECRET, Date.now() + 1000);
    const tampered = `${Date.now() + 999999999}.${t.split('.')[1]}`;
    expect(await CALC.verifyCalcToken(SECRET, tampered)).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it.each(['', 'garbage', 'no-dot', '123.', '.abc'])('rejects malformed token %p', async (t) => {
    expect((await CALC.verifyCalcToken(SECRET, t)).ok).toBe(false);
  });

  it('never verifies when the secret is unset', async () => {
    const t = await CALC.signCalcToken(SECRET, Date.now() + 100000);
    expect(await CALC.verifyCalcToken(undefined as Any, t)).toMatchObject({ ok: false, reason: 'unconfigured' });
  });

  it('an invalid token degrades to the sample tier rather than erroring', async () => {
    const { env } = makeEnv();
    const res = await post(env, '/calculate', VALID, { Authorization: 'Bearer stale.token' });
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('sample');
  });

  it('timingSafeEqual compares by value, including on length mismatch', () => {
    expect(CALC.timingSafeEqual('abc', 'abc')).toBe(true);
    expect(CALC.timingSafeEqual('abc', 'abd')).toBe(false);
    expect(CALC.timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(CALC.timingSafeEqual('', '')).toBe(true);
  });
});

// ── Rate limit ─────────────────────────────────────────────────────────────

describe('sample rate limit', () => {
  it('allows 10 sample runs a day then 429s with the upsell attached', async () => {
    const { env } = makeEnv();
    for (let i = 0; i < CALC.SAMPLE_RATE_LIMIT_PER_DAY; i++) {
      expect((await post(env, '/calculate', VALID)).status).toBe(200);
    }
    const res = await post(env, '/calculate', VALID);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe(CALC.CALC_COPY.rate_limited);
    expect(body.upsell).toBeTruthy();
  });

  it('does not limit the full tier', async () => {
    const { env } = makeEnv();
    const token = (await (await post(env, '/calculator/login', { password: SECRET })).json()).token;
    for (let i = 0; i < CALC.SAMPLE_RATE_LIMIT_PER_DAY + 3; i++) await post(env, '/calculate', VALID);
    const res = await post(env, '/calculate', VALID, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect((await res.json()).tier).toBe('full');
  });

  it('keys per IP and per UTC day', () => {
    const d = new Date('2026-07-28T23:59:59Z');
    expect(CALC.rateLimitKey('1.2.3.4', d)).toBe('calc_rate:1.2.3.4:2026-07-28');
    expect(CALC.rateLimitKey('5.6.7.8', d)).not.toBe(CALC.rateLimitKey('1.2.3.4', d));
  });
});

// ── Tier shapes + the leak test ────────────────────────────────────────────

/** Every key at every depth of a value. */
function allKeys(value: Any, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  }
  return out;
}

describe('tier shapes', () => {
  let sample: Any, full: Any;

  beforeAll(async () => {
    const { env } = makeEnv();
    sample = await (await post(env, '/calculate', VALID)).json();
    const token = (await (await post(env, '/calculator/login', { password: SECRET })).json()).token;
    full = await (await post(env, '/calculate', VALID, { Authorization: `Bearer ${token}` })).json();
  });

  it('sample carries exactly its allowed top-level keys — no more, no fewer', () => {
    expect(Object.keys(sample).sort()).toEqual([...CALC.SAMPLE_ALLOWED_KEYS].sort());
  });

  it('sample shows the 8 summary bridge lines and no sub-line detail', () => {
    expect(sample.bridge_y1).toHaveLength(8);
    expect(sample.bridge_y1.map((l: Any) => l.key)).toEqual(CALC.SAMPLE_BRIDGE_LINES);
    for (const line of sample.bridge_y1) expect(line.formula).toBeUndefined();
  });

  it('sample carries the 5 headline numbers', () => {
    expect(Object.keys(sample.headline).sort()).toEqual(
      ['ebitda_margin_pct', 'ebitda_y1', 'gross_y1', 'net_y1', 'prefin_cf_y1']
    );
    expect(sample.headline.ebitda_y1).toBeGreaterThan(0);
  });

  // ── LEAK TEST — the sample response must be INCAPABLE of full-tier data ──
  it('no full-tier marker key appears at ANY depth of a sample response', () => {
    const keys = allKeys(sample);
    for (const marker of CALC.FULL_TIER_MARKER_KEYS) {
      expect(keys.has(marker), `sample leaked "${marker}"`).toBe(false);
    }
  });

  it('a sample response contains no 20-element series anywhere', () => {
    const walk = (v: Any): void => {
      if (Array.isArray(v)) { expect(v.length).toBeLessThan(20); v.forEach(walk); }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(sample);
  });

  it('the sample builder cannot leak: it never receives the engine result', () => {
    // Passing a full engine result under an unexpected key must not widen the
    // output — buildSample reads only the four fields it is given.
    const built = CALC.buildSample({
      headline: { gross_y1: 1, net_y1: 1, ebitda_y1: 1, prefin_cf_y1: 1, ebitda_margin_pct: 1 },
      bridge_y1: { gross_market_revenues: 1, charging_costs: 0, net_market_revenue: 1,
        optimiser: 0, grid: 0, market: 0, operating: 0, project_ebitda: 1,
        bridge_20yr: 'SHOULD NOT APPEAR', years: 'SHOULD NOT APPEAR' } as Any,
      inputs_echo: {} as Any,
      engine_version: 'v7.3',
    });
    expect(Object.keys(built).sort()).toEqual([...CALC.SAMPLE_ALLOWED_KEYS].sort());
    expect(JSON.stringify(built)).not.toContain('SHOULD NOT APPEAR');
  });

  it('full carries the sections the tier promises', () => {
    for (const k of ['bridge_20yr', 'capex_schedule', 'scenarios', 'sensitivity',
                     'reconciliation', 'returns', 'cashflows', 'bridge_totals']) {
      expect(full[k], k).toBeTruthy();
    }
    expect(full.tier).toBe('full');
    expect(full.bridge_20yr).toHaveLength(20);
    expect(full.capex_schedule).toHaveLength(20);
    expect(full.bridge_y1).toHaveLength(CALC.BRIDGE_DISPLAY_LINES.length);
    for (const line of full.bridge_y1) expect(typeof line.formula).toBe('string');
  });

  it('full carries all three client scenarios, ordered downside < central < upside', () => {
    expect(Object.keys(full.scenarios).sort()).toEqual(['central', 'downside', 'upside']);
    const e = (k: string) => full.scenarios[k].headline.ebitda_y1;
    expect(e('downside')).toBeLessThan(e('central'));
    expect(e('central')).toBeLessThan(e('upside'));
  });

  it('full sensitivity ranks every declared driver by swing', () => {
    expect(full.sensitivity.rows).toHaveLength(CALC.SENSITIVITY_PROBES.length);
    const swings = full.sensitivity.rows.map((r: Any) => r.swing);
    expect([...swings].sort((a, b) => b - a)).toEqual(swings);
  });

  it('the two documented zero-effect drivers measure as zero, and are still listed', () => {
    const zero = full.sensitivity.rows.filter((r: Any) => r.swing === 0).map((r: Any) => r.id);
    expect(zero).toContain('spread_growth_pct_yr');
    expect(zero).toContain('cpi_floor');
  });

  it('both tiers agree on the headline — one engine run, two renderings', () => {
    expect(full.headline).toEqual(sample.headline);
  });

  it('the Y1 bridge ties out on the contract identities', () => {
    const b = Object.fromEntries(full.bridge_y1.map((l: Any) => [l.key, l.value]));
    expect(b.net_market_revenue).toBe(b.gross_market_revenues - b.charging_costs);
    expect(b.project_ebitda).toBe(
      b.net_market_revenue - b.optimiser - b.grid - b.market - b.operating
    );
    expect(b.pre_financing_cf).toBe(
      b.project_ebitda - b.maintenance_capex - b.augmentation_capex - b.replacement_capex
    );
  });
});

// ── Client scenario port ───────────────────────────────────────────────────

describe('client scenario port', () => {
  const configs = loadConfigDir(join(PROJECTS_DIR, 'prosperus'));
  const scenarios = loadScenarios();
  const strip = (v: Any) =>
    JSON.stringify(v, (k, val) => (k === 'timestamp' || k === 'updated_at' || k === 'scenario' ? undefined : val));

  it('Central IS the engine base case — asserted, not assumed', () => {
    expect(CALC.CLIENT_SCENARIO_KEYS.central).toBe('base');
    for (const [id, def] of Object.entries(scenarios.scenarios.central.drivers) as Any) {
      expect(scenarios.scenarios.central.drivers[id], id).toBe(def);
    }
  });

  // The batch-2 finding, closed: the worker must reproduce the overlay exactly.
  it.each([
    ['downside', 'client_downside'],
    ['upside', 'client_upside'],
    ['central', 'base'],
  ])('%s parity — worker-native equals the batch-2 overlay for all 3 projects', async (caseName, workerScenario) => {
    const overlayEngine = await loadEngineWithDrivers(
      (scenarios as Any).scenarios[caseName].drivers
    );
    for (const cfg of configs) {
      const viaOverlay = await runProject(cfg, kv, { engine: overlayEngine, scenario: 'base' });
      const viaWorker = await runProject(cfg, kv, { scenario: workerScenario });
      expect(strip(viaWorker), `${caseName}/${(cfg as Any).project_id}`).toBe(strip(viaOverlay));
    }
  });

  it('cpiCurveScenario at the built-in floor is the original curve', () => {
    for (let sd = 0; sd <= 4; sd += 0.05) {
      expect(cpiCurveScenarioForTest(sd, 0.30), `sd=${sd}`).toBe(cpiCurveForTest(sd));
    }
  });

  it('a different floor is an exact substitution, not a re-floor', () => {
    // Above the built-in: re-flooring would coincide, so pick a point where the
    // built-in binds and check the sub-0.30 floor actually shows through.
    const sdBinding = 2.5; // 0.40 − 1.5×0.08 = 0.28 < 0.30
    expect(cpiCurveForTest(sdBinding)).toBe(0.30);
    expect(cpiCurveScenarioForTest(sdBinding, 0.28)).toBeCloseTo(0.28, 10);
    expect(cpiCurveScenarioForTest(1.0, 0.35)).toBe(0.40);
  });

  it('the ported sets carry the locked client values', () => {
    const S = REVENUE_SCENARIOS_FOR_TEST as Any;
    expect(S.client_downside.avail).toBe(0.95);
    expect(S.client_downside.trd_real).toBe(0.78);
    expect(S.client_upside.avail).toBe(0.98);
    expect(S.client_upside.trd_real).toBe(0.88);
    // Everything they do not deliberately change is still base's.
    for (const k of ['opex_per_kw_yr', 'brp_fee_yr', 'debt_margin_bp', 'mwh_per_mw_yr_da_2h']) {
      expect(S.client_downside[k], k).toBe(S.base[k]);
      expect(S.client_upside[k], k).toBe(S.base[k]);
    }
  });
});

// ── Shared KV source ───────────────────────────────────────────────────────

describe('loadEngineKV', () => {
  it('is the single place the engine\'s KV dependencies are named', async () => {
    const asked: string[] = [];
    const env = { KKME_SIGNALS: { get: async (k: string) => { asked.push(k); return rawKV[k] ?? null; } } } as Any;
    await loadEngineKV(env);
    expect(asked.sort()).toEqual(
      ['euribor', 's1', 's1_capture', 's2', 's2_activation', 's2_btd_history', 's3', 's4_fleet', 'trading:metrics']
    );
  });

  it('assembles the shape the engine reads', async () => {
    const env = { KKME_SIGNALS: { get: async (k: string) => rawKV[k] ?? null } } as Any;
    const built = await loadEngineKV(env);
    expect(Object.keys(built).sort()).toEqual(
      ['capacity_monthly', 'dispatch_metrics', 'euribor', 'fleet', 's1', 's1_capture',
       's2', 's2_activation_parsed', 's3'].sort()
    );
    expect(built.s2_activation_parsed?.lt?.afrr_p50).toBe(kv.s2_activation_parsed?.lt?.afrr_p50);
  });

  it('/calculate and /revenue therefore cannot drift apart on their inputs', async () => {
    // Both routes go through the loader; neither re-lists engine KV keys of
    // its own. If a future edit inlines a key list back into either route,
    // this count moves and the drift shows up here rather than in production.
    const src = readFileSync(join(REPO, 'workers/fetch-s1.js'), 'utf8');
    expect(src.split('await loadEngineKV(env)').length - 1).toBe(2);
  });
});

// ── Public-route regression ────────────────────────────────────────────────

describe('/revenue is unaffected', () => {
  it('the new routes did not displace it', async () => {
    const { env } = makeEnv();
    const res = await (worker as Any).fetch(
      new Request('https://x.kkme.eu/revenue?dur=2h&capex=mid&cod=2028&scenario=base'), env, ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project_irr).toBeTypeOf('number');
    expect(body.all_scenarios).toBeTruthy();
    expect(body.matrix).toHaveLength(9);
  });

  it('carries no calculator or client-scenario keys into the public payload', async () => {
    const { env } = makeEnv();
    const body = await (await (worker as Any).fetch(
      new Request('https://x.kkme.eu/revenue?dur=4h'), env, ctx
    )).json();
    const keys = allKeys(body);
    for (const k of ['client_downside', 'client_upside', 'tier', 'upsell', 'sample_note']) {
      expect(keys.has(k), k).toBe(false);
    }
    expect(Object.keys(body.all_scenarios).sort()).toEqual(['base', 'conservative', 'stress']);
  });
});
