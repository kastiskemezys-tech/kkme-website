/**
 * /calculator — Phase 35.2 component + contract tests.
 *
 * The leak test appears here a second time, at the UI level: rendering a
 * sample-tier response must be incapable of putting full-tier data on the
 * page. The endpoint-level twin lives in workers/__tests__/calculator.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SampleResults, FullResults, BridgeTable } from '../CalculatorResults';
import {
  validateForm, formToInputs, LIMITS, DEFAULT_INPUTS,
  eur, eurExact, pct, irrPct,
  type SampleResult, type FullResult, type InputField,
} from '../calculatorApi';
import { CALC_LIMITS, SAMPLE_ALLOWED_KEYS, FULL_TIER_MARKER_KEYS, CALC_COPY } from '../../../workers/lib/calculator.js';

const HEADLINE = {
  gross_y1: 7_965_332, net_y1: 7_515_698, ebitda_y1: 4_687_245,
  prefin_cf_y1: 4_487_245, ebitda_margin_pct: 58.8,
};

const ECHO = {
  mw: 50, mwh: 100, duration_h: 2, cod_year: 2028, capex_eur_kwh: 164,
  scenario: 'central', availability_pct: null, cycles_efc_yr: null,
  warranty_efc_yr: null, operating_months_y1: 12,
  duration_note: null, cycles_note: null,
};

const UPSELL = {
  headline: 'The full analysis adds',
  items: ['20-year cash flow', '3 market scenarios'],
  terms: 'Commissioned per-project by KKME Advisory.',
  contact_email: 'kastytis@kkme.eu',
};

const SAMPLE: SampleResult = {
  tier: 'sample',
  engine_version: 'v7.3',
  inputs_echo: ECHO,
  headline: HEADLINE,
  bridge_y1: [
    { key: 'gross_market_revenues', label: 'Gross market revenues', sub: false, value: 7_965_332 },
    { key: 'charging_costs', label: 'less charging costs', sub: true, value: 449_634 },
    { key: 'net_market_revenue', label: 'Net market revenue', sub: false, value: 7_515_698 },
    { key: 'optimiser', label: 'less optimiser / BRP', sub: true, value: 955_840 },
    { key: 'grid', label: 'less grid', sub: true, value: 238_960 },
    { key: 'market', label: 'less market participation', sub: true, value: 79_653 },
    { key: 'operating', label: 'less operating', sub: true, value: 1_554_000 },
    { key: 'project_ebitda', label: 'Project EBITDA', sub: false, value: 4_687_245 },
  ],
  sample_note: CALC_COPY.sample_note,
  upsell: UPSELL,
};

const YEAR = {
  yr: 1, cal_year: 2029,
  gross_market_revenues: 7_965_332, charging_costs: 449_634, net_market_revenue: 7_515_698,
  optimiser: 955_840, grid: 238_960, market: 79_653, operating: 1_554_000,
  project_ebitda: 4_687_245,
  maintenance_capex: 200_000, augmentation_capex: 0, replacement_capex: 0,
  pre_financing_cf: 4_487_245,
};

const FULL: FullResult = {
  tier: 'full',
  engine_version: 'v7.3',
  inputs_echo: ECHO,
  headline: HEADLINE,
  returns: {
    wacc: 0.08, npv_pre_financing_pre_tax: 11_735_642, moic: 2.94, payback_years: 5,
    gross_capex: 16_400_000, engine_project_irr: 0.1953, engine_npv_post_tax: 12_442_331,
    basis: 'Pre-financing, pre-tax bridge cash flow discounted at WACC.',
  },
  bridge_y1: SAMPLE.bridge_y1.map((l) => ({ ...l, formula: `basis for ${l.key}` })).concat([
    { key: 'maintenance_capex', label: 'less maintenance capex', sub: true, value: 200_000, formula: 'maint basis' },
    { key: 'augmentation_capex', label: 'less augmentation capex', sub: true, value: 0, formula: 'aug basis' },
    { key: 'replacement_capex', label: 'less replacement capex', sub: true, value: 0, formula: 'repl basis' },
    { key: 'pre_financing_cf', label: 'Pre-financing cash flow', sub: false, value: 4_487_245, formula: 'cf basis' },
  ]),
  bridge_20yr: Array.from({ length: 20 }, (_, i) => ({ ...YEAR, yr: i + 1, cal_year: 2029 + i })),
  bridge_totals: { pre_financing_cf: 80_000_000 },
  capex_schedule: Array.from({ length: 20 }, (_, i) => ({
    yr: i + 1, cal_year: 2029 + i, maintenance: 200_000, augmentation: 0, replacement: 0, total: 200_000,
  })),
  cost_basis: {},
  capex_basis: {},
  cashflows: { t0: 2028, wacc: 0.08, rows: [] },
  scenarios: {
    downside: { label: 'Downside', engine_scenario: 'client_downside', headline: { ...HEADLINE, ebitda_y1: 3_237_794 }, sum_20yr_prefin_cf: 60_000_000, project_irr: 0.11 },
    central: { label: 'Central', engine_scenario: 'base', headline: HEADLINE, sum_20yr_prefin_cf: 80_000_000, project_irr: 0.1953 },
    upside: { label: 'Upside', engine_scenario: 'client_upside', headline: { ...HEADLINE, ebitda_y1: 5_858_905 }, sum_20yr_prefin_cf: 95_000_000, project_irr: 0.24 },
  },
  sensitivity: {
    basis_ebitda_y1: 4_687_245,
    note: 'One at a time.',
    rows: [
      { id: 'cap_price_delta_pct', label: 'Reserve capacity price', central_display: '0%', down_display: '-25%', up_display: '+20%', ebitda_down: 3_900_000, ebitda_up: 5_400_000, delta_down: -787_245, delta_up: 712_755, swing: 1_543_895 },
      { id: 'fleet_realisation_pct', label: 'Pipeline realisation rate', central_display: '50%', down_display: '65%', up_display: '35%', ebitda_down: 4_400_000, ebitda_up: 4_963_012, delta_down: -287_245, delta_up: 275_767, swing: 563_012 },
      { id: 'optimiser_pct_gross', label: 'Optimiser fee', central_display: '12%', down_display: '15%', up_display: '8%', ebitda_down: 4_400_000, ebitda_up: 4_957_573, delta_down: -287_245, delta_up: 270_328, swing: 557_573 },
      { id: 'cpi_floor', label: 'Cannibalisation-index floor', central_display: '0.3', down_display: '0.28', up_display: '0.35', ebitda_down: 4_687_245, ebitda_up: 4_687_245, delta_down: 0, delta_up: 0, swing: 0 },
    ],
  },
  reconciliation: {
    engine_stack_y1: 2_970_350, engine_components: { rtm_fee: 840_350, brp_fee: 180_000, opex: 1_950_000 },
    client_stack_y1: 2_916_453, delta: -53_897, delta_pct: -0.0184,
    within_2pct: true, within_5pct: true, note: 'Two taxonomies over the same economics.',
  },
  warranty: { efcs_per_year: 620, warranty_efc_yr: 730, headroom_efc_yr: 110 },
};

// ── Validation mirror ──────────────────────────────────────────────────────

describe('client-side validation mirrors the endpoint', () => {
  it('every shared limit matches the worker, so a range lives in one place', () => {
    for (const key of Object.keys(LIMITS)) {
      expect(LIMITS[key], key).toEqual((CALC_LIMITS as unknown as Record<string, number[]>)[key]);
    }
  });

  it('accepts the defaults', () => {
    expect(validateForm({ ...DEFAULT_INPUTS })).toEqual([]);
  });

  it.each([
    ['mw', '0'], ['mw', '1001'], ['mwh', '4001'],
    ['cod_year', '2025'], ['cod_year', '2036'],
    ['capex_eur_kwh', '79'], ['capex_eur_kwh', '401'],
  ])('rejects %s = %s', (key, value) => {
    const form = { ...DEFAULT_INPUTS, [key]: value } as Record<InputField, string>;
    expect(validateForm(form).length).toBeGreaterThan(0);
  });

  it('rejects a required field left empty', () => {
    expect(validateForm({ ...DEFAULT_INPUTS, mw: '' } as Record<InputField, string>).join(' '))
      .toContain('required');
  });

  it('rejects an out-of-range duration and names it', () => {
    const form = { ...DEFAULT_INPUTS, mw: '10', mwh: '100' } as Record<InputField, string>;
    expect(validateForm(form).join(' ')).toContain('10h');
  });

  it('leaves optional advanced fields out of the body when blank', () => {
    const body = formToInputs({ ...DEFAULT_INPUTS }, 'central');
    expect(body).not.toHaveProperty('availability_pct');
    expect(body).not.toHaveProperty('cycles_efc_yr');
    expect(body.scenario).toBe('central');
  });

  it('includes advanced fields when filled', () => {
    const form = { ...DEFAULT_INPUTS, availability_pct: '95' } as Record<InputField, string>;
    expect(formToInputs(form, 'downside').availability_pct).toBe(95);
  });
});

// ── Formatting ─────────────────────────────────────────────────────────────

describe('formatting', () => {
  it('never renders a naked NaN', () => {
    for (const f of [eur, eurExact, pct, irrPct]) {
      expect(f(null)).toBe('n/a');
      expect(f(undefined)).toBe('n/a');
      expect(f(NaN)).toBe('n/a');
    }
  });

  it('scales euros by magnitude', () => {
    expect(eur(7_965_332)).toBe('€7.97M');
    expect(eur(45_000)).toBe('€45k');
    expect(eur(320)).toBe('€320');
  });

  it('renders IRR from a decimal', () => {
    expect(irrPct(0.1953)).toBe('19.5%');
  });
});

// ── UI-level leak test ─────────────────────────────────────────────────────

describe('sample tier rendering', () => {
  const html = renderToStaticMarkup(<SampleResults result={SAMPLE} />);

  it('renders the headline figures and the 8 bridge lines', () => {
    expect(html).toContain('€7.97M');
    expect(html).toContain('Project EBITDA');
    expect(html).toContain('Gross market revenues');
    for (const line of SAMPLE.bridge_y1) expect(html).toContain(line.label);
  });

  it('marks the output as a sample and carries the CTA', () => {
    expect(html).toContain('Sample output');
    expect(html).toContain('kastytis@kkme.eu');
    expect(html).toContain('KKME Advisory');
  });

  // The leak test, at the UI level.
  //
  // Asserted on full-tier DATA, not on section words: the CTA deliberately
  // names what the full tier contains ("20-year cash flow", "sensitivity
  // ranking"), so a word-based assertion would fail on the copy that is
  // supposed to be there. What must never appear is a figure only the full
  // tier computes.
  it('renders no figure that only the full tier computes', () => {
    const fullTierOnly = [
      '2.94×',            // MOIC
      '19.5%',            // engine project IRR
      '€11.74M',          // NPV
      '€16.40M',          // gross CAPEX
      'Basis EBITDA Y1',  // sensitivity footer
      'Engine cost stack', // reconciliation
      'Modelled EFC/yr',  // warranty block
      'Show all',         // sensitivity expander
      '2038', '2048',     // 20-yr cash-flow calendar columns
      'Downside', 'Upside', // scenario cards
    ];
    for (const marker of fullTierOnly) {
      expect(html, `sample leaked "${marker}"`).not.toContain(marker);
    }
  });

  it('renders no section heading that belongs to the full tier', () => {
    // Headings are <h2>; the CTA copy is not, so this scopes past the upsell.
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Year 1 — 50 MW / 100 MWh (2h) · COD 2028 · €164/kWh', 'Revenue bridge — year 1']);
  });

  it('renders no per-line formulas — the sample carries no sub-line detail', () => {
    expect(html).not.toContain('basis for');
  });

  it('a sample response object cannot even carry full-tier keys', () => {
    const keys = new Set(Object.keys(SAMPLE));
    expect([...keys].sort()).toEqual([...SAMPLE_ALLOWED_KEYS].sort());
    for (const marker of FULL_TIER_MARKER_KEYS) {
      expect(keys.has(marker), marker).toBe(false);
    }
  });

  it('renders a duration note only when the engine emitted one', () => {
    expect(html).not.toContain('modelled at');
    const withNote = renderToStaticMarkup(
      <SampleResults result={{ ...SAMPLE, inputs_echo: { ...ECHO, duration_note: {
        actual_duration_h: 3, modelled_at_duration_h: 4, calibration_points_h: [2, 4],
        revenue_basis: 'nearest calibration point', capex_basis: 'CAPEX is your figure',
        direction: 'revenue is OVERSTATED',
      } } }} />
    );
    expect(withNote).toContain('modelled at 4h');
    expect(withNote).toContain('OVERSTATED');
  });
});

// ── Full tier rendering ────────────────────────────────────────────────────

describe('full tier rendering', () => {
  const html = renderToStaticMarkup(<FullResults result={FULL} />);

  it('renders every promised section', () => {
    for (const label of ['Returns', 'Revenue bridge', 'Scenarios', 'Sensitivity',
                         '20-year cash flow', 'Reconciliation', 'Cycling']) {
      expect(html, label).toContain(label);
    }
  });

  it('renders the three scenarios', () => {
    for (const label of ['Downside', 'Central', 'Upside']) expect(html).toContain(label);
  });

  it('renders returns figures', () => {
    expect(html).toContain('2.94×');
    expect(html).toContain('19.5%');
    expect(html).toContain('5 yr');
  });

  it('renders all 20 calendar years of the cash flow', () => {
    for (const y of [2029, 2038, 2048]) expect(html).toContain(String(y));
  });

  it('shows the top 3 sensitivity drivers before expansion', () => {
    expect(html).toContain('Reserve capacity price');
    expect(html).toContain('Show all 4');
    expect(html).not.toContain('Cannibalisation-index floor');
  });

  it('surfaces no engine-emitted state label as a chip (rule #6)', () => {
    for (const word of ['TIGHTENING', 'STABLE', 'RISING', 'ELEVATED', 'COMPRESSED', 'Pass', 'Marginal']) {
      expect(html, word).not.toContain(`>${word}<`);
    }
  });
});

// ── Bridge table behaviour ─────────────────────────────────────────────────

describe('BridgeTable', () => {
  it('hides formulas until a line is expanded, even in the full tier', () => {
    const html = renderToStaticMarkup(<BridgeTable lines={FULL.bridge_y1} expandable />);
    expect(html).not.toContain('basis for gross_market_revenues');
    expect(html).toContain('Gross market revenues');
  });

  it('renders deductions with a minus sign and positive magnitudes', () => {
    const html = renderToStaticMarkup(<BridgeTable lines={SAMPLE.bridge_y1} expandable={false} />);
    expect(html).toContain('−€449,634');
    expect(html).toContain('€7,965,332');
  });
});
