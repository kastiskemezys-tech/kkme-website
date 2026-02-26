/**
 * safeNum — safe number formatter. Returns fallback if value is null/undefined/NaN/Infinity.
 * Apply to EVERY number rendered from live data. Never call .toFixed() on raw data directly.
 */
export function safeNum(
  value: number | null | undefined,
  decimals: number,
  fallback = '—',
): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) return fallback;
  return value.toFixed(decimals);
}

export function safeK(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) return fallback;
  return `€${Math.round(value / 1000)}k`;
}

export function safeMw(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) return fallback;
  return `${value.toLocaleString('en-GB')} MW`;
}
