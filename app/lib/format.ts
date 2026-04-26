// Phase 8.3c — formatNumber + a11y twin (N-2: unit clarity).
//
// Number rendering is the renderer-level enforcement of N-2: every quantitative
// value carries a unit, and the unit picks the precision rule. Renderers reach
// for `formatNumber()` instead of inline `.toFixed(...)`. Cards that rolled
// their own conversions in 7.6 will migrate during Phase 10.

export type NumberKind =
  | 'capacity_mw'         // MW: no decimals <100, 1 decimal otherwise
  | 'capacity_gw'         // GW: 2 decimals
  | 'price_eur_mwh'       // €/MWh: 1 decimal
  | 'price_eur_mw_h'      // €/MW/h: 2 decimals (capacity payment rate, ≠ €/MWh)
  | 'price_eur_mw_day'    // €/MW/day: integer
  | 'price_eur_mw_yr'     // €/MW/yr: nearest 1k, formatted '€114k'
  | 'percent'             // %: 1 decimal
  | 'percent_pp'          // pp: 1 decimal with +/- prefix
  | 'irr'                 // IRR — input is decimal, output is % with 1 decimal
  | 'multiple'            // MOIC: 2 decimals with × suffix
  | 'ratio'               // DSCR etc.: 2 decimals with × suffix
  | 'cycles_per_yr'       // cycles: integer with cyc/yr suffix
  | 'count'               // counts: integer with thousands separator
  | 'ssh_pct';            // capacity factor: integer %

const NA = 'n/a';

function isNumeric(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fmtThousands(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Render a numeric value with its unit, per N-2.
 * `null` / `undefined` / non-finite return `n/a` so cards never render a
 * naked number with no context.
 */
export function formatNumber(
  value: number | null | undefined,
  kind: NumberKind,
): string {
  if (!isNumeric(value)) return NA;
  switch (kind) {
    case 'capacity_mw': {
      const abs = Math.abs(value);
      const digits = abs < 100 ? 0 : 1;
      return `${fmtThousands(value, digits)} MW`;
    }
    case 'capacity_gw':
      return `${value.toFixed(2)} GW`;
    case 'price_eur_mwh':
      return `${value.toFixed(1)} €/MWh`;
    case 'price_eur_mw_h':
      return `${value.toFixed(2)} €/MW/h`;
    case 'price_eur_mw_day':
      return `${fmtThousands(Math.round(value), 0)} €/MW/day`;
    case 'price_eur_mw_yr': {
      // Nearest 1k, e.g. 114321 → "€114k"; negatives prefix sign.
      const k = Math.round(value / 1000);
      return `€${k}k`;
    }
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'percent_pp': {
      const sign = value > 0 ? '+' : value < 0 ? '−' : '';
      const mag = Math.abs(value).toFixed(1);
      return `${sign}${mag} pp`;
    }
    case 'irr':
      return `${(value * 100).toFixed(1)}%`;
    case 'multiple':
      return `${value.toFixed(2)}×`;
    case 'ratio':
      return `${value.toFixed(2)}×`;
    case 'cycles_per_yr':
      return `${fmtThousands(Math.round(value), 0)} cyc/yr`;
    case 'count':
      return fmtThousands(Math.round(value), 0);
    case 'ssh_pct':
      return `${Math.round(value)}%`;
  }
}

const A11Y_NA = 'not available';

/**
 * Screen-reader-friendly twin to `formatNumber`. Returns the digits in
 * speakable form with the unit phrased verbosely, since synthesised speech
 * mangles compact unit symbols (e.g. "€/MWh" → "E slash M W H").
 *
 * Cards pair this with the visual via:
 *   <span aria-hidden="true">{formatNumber(v, k)}</span>
 *   <span className="sr-only">{formatNumberA11y(v, k)}</span>
 */
export function formatNumberA11y(
  value: number | null | undefined,
  kind: NumberKind,
): string {
  if (!isNumeric(value)) return A11Y_NA;
  switch (kind) {
    case 'capacity_mw': {
      const abs = Math.abs(value);
      const digits = abs < 100 ? 0 : 1;
      const noun = abs === 1 ? 'megawatt' : 'megawatts';
      return `${value.toFixed(digits)} ${noun}`;
    }
    case 'capacity_gw':
      return `${value.toFixed(2)} gigawatts`;
    case 'price_eur_mwh':
      return `${value.toFixed(1)} euros per megawatt-hour`;
    case 'price_eur_mw_h':
      return `${value.toFixed(2)} euros per megawatt per hour`;
    case 'price_eur_mw_day':
      return `${Math.round(value)} euros per megawatt per day`;
    case 'price_eur_mw_yr': {
      const k = Math.round(value / 1000);
      return `${k} thousand euros per megawatt per year`;
    }
    case 'percent':
      return `${value.toFixed(1)} percent`;
    case 'percent_pp': {
      const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
      if (dir === 'flat') return `0.0 percentage points`;
      return `${dir} ${Math.abs(value).toFixed(1)} percentage points`;
    }
    case 'irr':
      return `${(value * 100).toFixed(1)} percent IRR`;
    case 'multiple':
      return `${value.toFixed(2)} times multiple`;
    case 'ratio':
      return `${value.toFixed(2)} times ratio`;
    case 'cycles_per_yr':
      return `${Math.round(value)} cycles per year`;
    case 'count':
      return `${Math.round(value)}`;
    case 'ssh_pct':
      return `${Math.round(value)} percent capacity factor`;
  }
}
