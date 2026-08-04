/**
 * Phase 42 §3 — the calculator's configuration, in the URL.
 *
 * "A calculator whose link does not reproduce its result is not shareable", and
 * this one did not: it had **zero** URL-parameter handling. Measured — the
 * served HTML for `/calculator` and `/calculator?mw=250&mwh=500&cod_year=2031`
 * is byte-identical (md5 9a803b38…), and there is no `useSearchParams` or
 * `URLSearchParams` anywhere under `app/calculator/`.
 *
 * ONE CORRECTION TO THE FILED CLAIM. The Phase 38 audit recorded this as "the
 * site renders the default configuration regardless of URL parameters", which
 * reads as a framework-level problem with a static export. It is not:
 * `RegulatoryFeed` and `RegulatoryFilters` both read `useSearchParams` and work.
 * The calculator simply never implemented it. That matters because the STOP
 * condition for this phase was "if the defect is structural, report it and do
 * not rewrite routing" — it is not structural, so it is fixable here, in one
 * component, without touching routing at all.
 *
 * Design notes, both about not lying to the reader:
 *
 *  · **Only non-default values are written to the URL.** A link carrying every
 *    field including the ones the sender never touched implies they chose them.
 *  · **An out-of-range value is dropped, not clamped.** Clamping would silently
 *    reproduce a DIFFERENT configuration under the same link, which is worse
 *    than ignoring the parameter — the whole point of the link is fidelity.
 */
import { DEFAULT_INPUTS, LIMITS, type InputField } from './calculatorApi';

export type Scenario = 'downside' | 'central' | 'upside';
const SCENARIOS: Scenario[] = ['downside', 'central', 'upside'];

/** URL key per field. Short, stable, and not the internal name — these are public. */
const PARAM: Record<InputField, string> = {
  mw: 'mw',
  mwh: 'mwh',
  cod_year: 'cod',
  capex_eur_kwh: 'capex',
  availability_pct: 'avail',
  cycles_efc_yr: 'cycles',
  warranty_efc_yr: 'warranty',
  operating_months_y1: 'months',
};

const FIELD_BY_PARAM = Object.fromEntries(
  Object.entries(PARAM).map(([f, p]) => [p, f as InputField]),
) as Record<string, InputField>;

/** The limits key for a field, where it differs from the field name. */
const LIMIT_KEY: Partial<Record<InputField, string>> = {};

function inRange(field: InputField, raw: string): boolean {
  const lim = LIMITS[LIMIT_KEY[field] ?? field];
  if (!lim) return true;
  const v = Number(raw);
  if (!Number.isFinite(v)) return false;
  return v >= lim[0] && v <= lim[1];
}

/**
 * Read a configuration out of a query string.
 *
 * Unknown params are ignored; out-of-range values are DROPPED so the field
 * falls back to its default rather than silently becoming a different number.
 * @returns the form patch plus the scenario, and the list of params rejected —
 *          the caller can then say so rather than pretending the link worked.
 */
export function configFromSearch(search: string): {
  form: Partial<Record<InputField, string>>;
  scenario: Scenario | null;
  rejected: string[];
} {
  const out: Partial<Record<InputField, string>> = {};
  const rejected: string[] = [];
  let scenario: Scenario | null = null;

  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, raw] of q.entries()) {
    if (key === 'scenario') {
      if (SCENARIOS.includes(raw as Scenario)) scenario = raw as Scenario;
      else rejected.push(key);
      continue;
    }
    const field = FIELD_BY_PARAM[key];
    if (!field) continue;                    // unknown params are not our business
    const v = raw.trim();
    if (v === '') continue;
    if (!inRange(field, v)) { rejected.push(key); continue; }
    out[field] = v;
  }
  return { form: out, scenario, rejected };
}

/**
 * Write a configuration to a query string — non-default values only.
 *
 * Returns '' when everything is at its default, so a pristine calculator has a
 * clean URL rather than one implying a dozen deliberate choices.
 */
export function searchFromConfig(
  form: Record<InputField, string>,
  scenario: Scenario,
): string {
  const q = new URLSearchParams();
  for (const [field, param] of Object.entries(PARAM) as [InputField, string][]) {
    const v = (form[field] ?? '').trim();
    if (!v) continue;
    if (v === (DEFAULT_INPUTS as Record<string, string>)[field]) continue;
    q.set(param, v);
  }
  if (scenario !== 'central') q.set('scenario', scenario);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The full shareable URL for a configuration. */
export function shareUrl(origin: string, form: Record<InputField, string>, scenario: Scenario): string {
  return `${origin.replace(/\/$/, '')}/calculator${searchFromConfig(form, scenario)}`;
}
