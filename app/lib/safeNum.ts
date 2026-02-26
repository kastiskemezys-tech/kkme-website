/**
 * safeNum — safe number formatters. Returns fallback for null/undefined/NaN/Infinity.
 * Apply to EVERY number rendered from live data. Never call .toFixed() on raw data directly.
 */
export function safeNum(
  val: unknown,
  decimals = 1,
  unit = '',
): string {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return '—';
  const formatted = n.toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** €/MWh with 1 decimal */
export const fEurMwh = (v: unknown): string => safeNum(v, 1, '€/MWh');

/** €/MW/h with 1 decimal */
export const fEurMwhCap = (v: unknown): string => safeNum(v, 1, '€/MW/h');

/** MW with 0 decimals */
export const fMW = (v: unknown): string => safeNum(v, 0, 'MW');

/** €Xk/MW/yr rounded */
export const fKEurYr = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n) || !isFinite(n)) return '—';
  return `€${Math.round(n / 1000)}k/MW/yr`;
};

/** €Xk rounded (no /yr suffix) */
export const fK = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n) || !isFinite(n)) return '—';
  return `€${Math.round(n / 1000)}k`;
};

/** Percentage with 1 decimal */
export const fPct = (v: unknown): string => safeNum(v, 1, '%');

/** HH:MM from ISO string */
export function formatHHMM(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().slice(11, 16);
  } catch {
    return '—';
  }
}

/** Legacy helpers — kept for existing code */
export function safeK(value: number | null | undefined, fallback = '—'): string {
  return fK(value) === '—' ? fallback : fK(value);
}

export function safeMw(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) return fallback;
  return `${value.toLocaleString('en-GB')} MW`;
}
