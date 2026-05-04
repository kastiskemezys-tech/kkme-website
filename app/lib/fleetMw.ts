// Quarantine-aware fleet MW arithmetic — mirrors the worker's processFleet
// helpers so the same logic is testable from the frontend.
//
// Phase 12.10 finding: the worker's _quarantine flag was set on
// contradiction-detected entries (Hertz 1, Eesti Energia BESS, Kruonis PSP,
// Utilitas Targale, AJ Power) but the entries were still counted in
// operational_mw — making the flag decorative.
//
// Soft-enforcement contract (operator decision at Pause A):
//   - operational_mw_inclusive: legacy total, includes quarantined entries
//   - operational_mw_strict: excludes _quarantine === true entries
//   - quarantined_mw: companion field for "+N MW unverified" disclosure
//
// Frontend cards default to strict; can render the inclusive number with
// an addendum chip ("+126.5 MW awaiting TSO confirmation") when context
// calls for both.

export interface FleetEntry {
  mw?: number | null;
  status?: string | null;
  _quarantine?: boolean | null;
}

const OPERATIONAL_STATUSES = new Set(['operational', 'commissioned']);

function isOperational(e: FleetEntry): boolean {
  if (!e.status) return false;
  return OPERATIONAL_STATUSES.has(e.status);
}

function mw(e: FleetEntry): number {
  const v = Number(e.mw);
  return Number.isFinite(v) ? v : 0;
}

/** Operational MW excluding _quarantine entries. */
export function computeOperationalMwStrict(entries: FleetEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries
    .filter((e) => isOperational(e) && !e._quarantine)
    .reduce((s, e) => s + mw(e), 0);
}

/** Operational MW including _quarantine entries (legacy semantics). */
export function computeOperationalMwInclusive(entries: FleetEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries.filter(isOperational).reduce((s, e) => s + mw(e), 0);
}

/** Sum of MW that is operational AND _quarantine — the disclosure number. */
export function computeQuarantinedMw(entries: FleetEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries
    .filter((e) => isOperational(e) && e._quarantine === true)
    .reduce((s, e) => s + mw(e), 0);
}
