// Freshness chip thresholds (F5-lite.2).
// Centralised so Phase 11 can template the pattern site-wide. Both S1Card and
// S2Card import from here. The contract: `LIVE` only ever appears when data is
// less than 1h old; older payloads must show STALE / OUTDATED instead. A
// "LIVE" label on a 28h-old number is the audit's single most cited
// credibility break.
//
// Phase 7.6.16 — Timestamp normalisation:
//   `formatTimestamp` is the canonical site-wide formatter for all human-readable
//   data timestamps (SourceFooter, hero readouts, etc.). Rule: ≤24h → relative
//   ("3h ago", "45m ago"); >24h → absolute UTC ISO8601 with timezone
//   ("2026-04-25 14:30 UTC"). N-7 in upgrade-plan.md.

export type FreshnessLabel = 'LIVE' | 'RECENT' | 'TODAY' | 'STALE' | 'OUTDATED';

export interface FreshnessState {
  label: FreshnessLabel;
  /** Short human age, e.g. "3m ago", "5h ago", "2d ago". */
  age: string;
  /** Hours since `updatedAt`. Useful for callers that gate behaviour on age. */
  hoursStale: number;
  /** Token name that resolves through `var(--…)` for the chip color. */
  colorToken: string;
  /** Absolute UTC timestamp without seconds, suitable for a `title` tooltip. */
  absolute: string;
}

function parseTs(input: string | number | Date | null | undefined): number | null {
  if (input == null) return null;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

function formatAbsoluteUTC(ms: number): string {
  // YYYY-MM-DD HH:mm UTC — no seconds, explicit timezone (per N-7 in upgrade-plan).
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${hh}:${mm} UTC`;
}

function formatAge(hoursStale: number): string {
  if (hoursStale < 1 / 60) return 'just now';
  if (hoursStale < 1) return `${Math.round(hoursStale * 60)}m ago`;
  if (hoursStale < 48) return `${Math.round(hoursStale)}h ago`;
  return `${Math.round(hoursStale / 24)}d ago`;
}

/**
 * Canonical site-wide timestamp formatter (Phase 7.6.16, N-7).
 *
 *  ≤24h → relative ("just now", "12m ago", "3h ago", "24h ago")
 *  >24h → absolute UTC ISO8601 ("2026-04-25 14:30 UTC")
 *  null/unparseable → "—"
 *
 * Boundary: exactly 24h reads as "24h ago" — relative wins to keep the
 * morning-after refresh continuous. The next minute crosses into absolute.
 *
 * `now` is exposed for unit tests; production callers omit it.
 */
export function formatTimestamp(
  updatedAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const ts = parseTs(updatedAt);
  if (ts == null) return '—';
  const hoursStale = Math.max(0, (now - ts) / 3_600_000);
  if (hoursStale <= 24) return formatAge(hoursStale);
  return formatAbsoluteUTC(ts);
}

export function freshnessLabel(updatedAt: string | number | Date | null | undefined): FreshnessState {
  const ts = parseTs(updatedAt);
  if (ts == null) {
    return {
      label: 'OUTDATED',
      age: '—',
      hoursStale: Infinity,
      colorToken: '--rose',
      absolute: '—',
    };
  }
  const hoursStale = Math.max(0, (Date.now() - ts) / 3_600_000);
  const absolute = formatAbsoluteUTC(ts);
  const age = formatAge(hoursStale);

  let label: FreshnessLabel;
  let colorToken: string;
  if (hoursStale < 1) { label = 'LIVE'; colorToken = '--teal'; }
  else if (hoursStale < 6) { label = 'RECENT'; colorToken = '--text-secondary'; }
  else if (hoursStale < 24) { label = 'TODAY'; colorToken = '--text-tertiary'; }
  else if (hoursStale < 72) { label = 'STALE'; colorToken = '--amber'; }
  else { label = 'OUTDATED'; colorToken = '--rose'; }

  return { label, age, hoursStale, colorToken, absolute };
}
