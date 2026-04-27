// Phase 12.7 — interconnector merge helpers.
//
// Mirrors the inline copies in workers/fetch-s1.js (safeInterconnector,
// freshnessForInterconnector) so the Vitest suite can pin the merge logic
// without standing up the worker runtime. Keep both in sync.
//
// safe(current, fallback): when this cron's fetch returned null (rate limit,
//   parse error, all-null data array), reuse the prior KV value rather than
//   overwriting with null. Visitors see the last-known cable flow.
//
// freshnessFor(current, fallback): tag each cable as 'live' (this cycle's
//   fetch landed), 'stale' (fell back to prior KV), or null (never had a
//   value). Future card UI can render a "stale" indicator from this.

export function safe(
  current: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  if (current != null) return current;
  if (fallback != null) return fallback;
  return null;
}

export type Freshness = 'live' | 'stale' | null;

export function freshnessFor(
  current: number | null | undefined,
  fallback: number | null | undefined,
): Freshness {
  if (current != null) return 'live';
  if (fallback != null) return 'stale';
  return null;
}
