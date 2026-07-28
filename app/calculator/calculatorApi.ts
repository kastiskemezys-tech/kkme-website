/**
 * /calculator — client types and transport for the BESS Revenue Calculator.
 *
 * Phase 35.2. Every string a visitor reads about what the full tier contains,
 * and every validation limit, originates in the worker (workers/lib/calculator.js)
 * and arrives in the response. This file does not restate them — the one
 * exception is the client-side validation mirror, which exists to avoid a
 * round-trip and is asserted against the endpoint's own limits in vitest.
 */

const WORKER_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev';

export const TOKEN_STORAGE_KEY = 'kkme_calc_token';

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface CalcInputs {
  mw: number;
  mwh: number;
  cod_year: number;
  capex_eur_kwh: number;
  availability_pct?: number | null;
  cycles_efc_yr?: number | null;
  warranty_efc_yr?: number | null;
  operating_months_y1?: number | null;
  scenario?: 'downside' | 'central' | 'upside';
}

export const DEFAULT_INPUTS = {
  mw: '50',
  mwh: '100',
  cod_year: '2028',
  capex_eur_kwh: '164',
  availability_pct: '',
  cycles_efc_yr: '',
  warranty_efc_yr: '',
  operating_months_y1: '',
} as const;

export type InputField = keyof typeof DEFAULT_INPUTS;

/**
 * Client-side mirror of the endpoint's ranges (workers/lib/calculator.js
 * CALC_LIMITS). Kept in sync by a vitest that reads the worker module, so a
 * limit can only change in one place.
 */
export const LIMITS: Record<string, [number, number]> = {
  mw: [1, 1000],
  mwh: [1, 4000],
  duration_h: [0.5, 8],
  cod_year: [2026, 2035],
  capex_eur_kwh: [80, 400],
  availability_pct: [80, 100],
  cycles_efc_yr: [50, 2000],
  warranty_efc_yr: [100, 2000],
  operating_months_y1: [1, 12],
};

const LABELS: Record<string, string> = {
  mw: 'Power (MW)',
  mwh: 'Energy (MWh)',
  cod_year: 'COD year',
  capex_eur_kwh: 'CAPEX (€/kWh)',
  availability_pct: 'Availability (%)',
  cycles_efc_yr: 'Cycles (EFC/yr)',
  warranty_efc_yr: 'Warranty cap (EFC/yr)',
  operating_months_y1: 'Operating months in year 1',
};

const REQUIRED: InputField[] = ['mw', 'mwh', 'cod_year', 'capex_eur_kwh'];

/**
 * Validate the form the same way the endpoint does, so an obviously-wrong
 * figure is caught before a network round-trip. The endpoint remains the
 * authority — this never lets through what it would reject.
 */
export function validateForm(form: Record<InputField, string>): string[] {
  const errors: string[] = [];
  const parsed: Record<string, number | null> = {};

  for (const key of Object.keys(LABELS) as InputField[]) {
    const raw = (form[key] ?? '').trim();
    if (!raw) {
      if (REQUIRED.includes(key)) errors.push(`${LABELS[key]} is required.`);
      parsed[key] = null;
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      errors.push(`${LABELS[key]} must be a number.`);
      parsed[key] = null;
      continue;
    }
    if ((key === 'cod_year' || key === 'operating_months_y1') && !Number.isInteger(v)) {
      errors.push(`${LABELS[key]} must be a whole number.`);
      continue;
    }
    const [lo, hi] = LIMITS[key];
    if (v < lo || v > hi) {
      errors.push(`${LABELS[key]} must be between ${lo} and ${hi} — got ${v}.`);
      continue;
    }
    parsed[key] = v;
  }

  if (parsed.mw && parsed.mwh) {
    const dur = parsed.mwh / parsed.mw;
    const [lo, hi] = LIMITS.duration_h;
    if (dur < lo || dur > hi) {
      errors.push(
        `Duration (MWh ÷ MW) must be between ${lo}h and ${hi}h — ` +
        `${parsed.mwh} MWh over ${parsed.mw} MW is ${Math.round(dur * 100) / 100}h.`
      );
    }
  }

  return errors;
}

export function formToInputs(
  form: Record<InputField, string>,
  scenario: 'downside' | 'central' | 'upside',
): CalcInputs {
  const n = (k: InputField) => {
    const raw = (form[k] ?? '').trim();
    return raw === '' ? null : Number(raw);
  };
  const body: CalcInputs = {
    mw: n('mw') as number,
    mwh: n('mwh') as number,
    cod_year: n('cod_year') as number,
    capex_eur_kwh: n('capex_eur_kwh') as number,
    scenario,
  };
  for (const k of ['availability_pct', 'cycles_efc_yr', 'warranty_efc_yr', 'operating_months_y1'] as const) {
    const v = n(k);
    if (v !== null) body[k] = v;
  }
  return body;
}

// ── Response shapes ────────────────────────────────────────────────────────

export interface Headline {
  gross_y1: number;
  net_y1: number;
  ebitda_y1: number;
  prefin_cf_y1: number;
  ebitda_margin_pct: number | null;
}

export interface BridgeLine {
  key: string;
  label: string;
  sub: boolean;
  value: number;
  formula?: string;
}

export interface DurationNote {
  actual_duration_h: number;
  modelled_at_duration_h: number;
  calibration_points_h: number[];
  revenue_basis: string;
  capex_basis: string;
  direction: string;
}

export interface InputsEcho {
  mw: number; mwh: number; duration_h: number; cod_year: number;
  capex_eur_kwh: number; scenario: string;
  availability_pct: number | null; cycles_efc_yr: number | null;
  warranty_efc_yr: number | null; operating_months_y1: number;
  duration_note: DurationNote | null;
  cycles_note: string | null;
}

export interface Upsell {
  headline: string;
  items: string[];
  terms: string;
  contact_email: string;
}

export interface SampleResult {
  tier: 'sample';
  engine_version: string;
  inputs_echo: InputsEcho;
  headline: Headline;
  bridge_y1: BridgeLine[];
  sample_note: string;
  upsell: Upsell;
}

export interface BridgeYear {
  yr: number; cal_year: number;
  gross_market_revenues: number; charging_costs: number; net_market_revenue: number;
  optimiser: number; grid: number; market: number; operating: number;
  project_ebitda: number;
  maintenance_capex: number; augmentation_capex: number; replacement_capex: number;
  pre_financing_cf: number;
}

export interface ScenarioSummary {
  label: string;
  engine_scenario: string;
  headline: Headline;
  sum_20yr_prefin_cf: number;
  project_irr: number | null;
}

export interface SensitivityRow {
  id: string; label: string;
  central_display: string; down_display: string; up_display: string;
  ebitda_down: number; ebitda_up: number;
  delta_down: number; delta_up: number; swing: number;
}

export interface FullResult {
  tier: 'full';
  engine_version: string;
  inputs_echo: InputsEcho;
  headline: Headline;
  returns: {
    wacc: number;
    npv_pre_financing_pre_tax: number;
    moic: number | null;
    payback_years: number | null;
    gross_capex: number;
    engine_project_irr: number | null;
    engine_npv_post_tax: number | null;
    basis: string;
  };
  bridge_y1: BridgeLine[];
  bridge_20yr: BridgeYear[];
  bridge_totals: Record<string, number>;
  capex_schedule: { yr: number; cal_year: number; maintenance: number; augmentation: number; replacement: number; total: number }[];
  cost_basis: Record<string, unknown> & { reconciliation?: Reconciliation | null };
  capex_basis: Record<string, number>;
  cashflows: { t0: number; wacc: number; rows: { cal_year: number; t: number; capex_outflow: number; operating_cf: number; net_cf: number }[] };
  scenarios: Record<'downside' | 'central' | 'upside', ScenarioSummary>;
  sensitivity: { basis_ebitda_y1: number; note: string; rows: SensitivityRow[] };
  reconciliation: Reconciliation | null;
  warranty: { efcs_per_year: number | null; warranty_efc_yr: number | null; headroom_efc_yr: number | null };
}

export interface Reconciliation {
  engine_stack_y1: number;
  engine_components: { rtm_fee: number; brp_fee: number; opex: number };
  client_stack_y1: number;
  delta: number;
  delta_pct: number | null;
  within_2pct: boolean;
  within_5pct: boolean;
  note: string;
}

export type CalcResult = SampleResult | FullResult;

export interface CalcError {
  kind: 'validation' | 'rate_limit' | 'server';
  messages: string[];
  upsell?: Upsell;
}

// ── Transport ──────────────────────────────────────────────────────────────

export async function postCalculate(
  inputs: CalcInputs,
  token: string | null,
): Promise<{ ok: true; result: CalcResult } | { ok: false; error: CalcError }> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(inputs),
    });
  } catch {
    return {
      ok: false,
      error: { kind: 'server', messages: ['Could not reach the engine. Check your connection and try again.'] },
    };
  }

  let body: Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: { kind: 'server', messages: [`Unexpected response from the engine (HTTP ${res.status}).`] } };
  }

  if (res.ok) return { ok: true, result: body as unknown as CalcResult };

  if (res.status === 429) {
    return {
      ok: false,
      error: {
        kind: 'rate_limit',
        messages: [String(body.error ?? 'Daily limit reached.')],
        upsell: body.upsell as Upsell | undefined,
      },
    };
  }
  const errs = Array.isArray(body.errors)
    ? (body.errors as string[])
    : [String(body.error ?? `The engine returned HTTP ${res.status}.`)];
  return { ok: false, error: { kind: res.status === 400 ? 'validation' : 'server', messages: errs } };
}

export async function postLogin(
  password: string,
): Promise<{ ok: true; token: string; expires: number } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/calculator/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, message: 'Could not reach the engine.' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.token) return { ok: true, token: body.token, expires: body.expires };
  return { ok: false, message: String(body.error ?? `Sign-in failed (HTTP ${res.status}).`) };
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `€${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `€${Math.round(n / 1e3).toLocaleString('en-US')}k`;
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export function eurExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return `€${Math.round(n).toLocaleString('en-US')}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return `${n.toFixed(digits)}%`;
}

export function irrPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}
