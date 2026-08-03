/**
 * Phase 38.2 — the honest decomposition of the flex-fleet total against the
 * national BESS registries.
 *
 * What this replaces. The hero rendered:
 *
 *     const kruonis = Math.max(0, Math.round(flex - bess));   // 782 − 651 = 131
 *     = TSO BESS {651} MW + Kruonis flex share {131} MW
 *
 * The 131 is real arithmetic; the NAME on it was written by hand. Kruonis is a
 * 205 MW pumped-hydro asset that appears in neither population — the fleet
 * tracker holds zero pumped-hydro entries and the registry totals are country
 * figures, not asset lists. The residual is the amount by which the project-level
 * tracker exceeds the TSO-published country totals, and it decomposes exactly:
 * on the 2026-08-03 payload LT +63, LV +59, EE +8.5 = 130.5 → 131. Discipline
 * rule #2 in its purest form: a subtraction with a label asserting what it is.
 *
 * So the quantity survives and the label becomes what the code can prove. The
 * per-country rows are computed here rather than in a template string, which is
 * the same reason `sdFormulaCaption` exists: a disclosure that cannot be checked
 * eventually stops being true and nobody notices.
 *
 * Returns null rather than a partial answer when the two populations cannot be
 * compared country-for-country — a gap that is not attributable is not a gap
 * worth publishing.
 */

export interface CoverageRow {
  code: string;
  /** Project-level fleet-tracker operational MW. */
  fleetMw: number;
  /** TSO-published national registry installed MW. */
  registryMw: number;
  /** fleetMw − registryMw. Signed: a registry ahead of the tracker is a finding. */
  gapMw: number;
}

export interface FleetCoverage {
  registryMw: number;
  fleetMw: number;
  gapMw: number;
  rows: CoverageRow[];
}

interface FleetCountryLike { operational_mw?: number | null }
interface RegistryCountryLike { installed_mw?: number | null }

export function fleetOverRegistry(
  fleetCountries: Record<string, FleetCountryLike> | null | undefined,
  registryByCountry: Record<string, RegistryCountryLike> | null | undefined,
): FleetCoverage | null {
  if (!fleetCountries || !registryByCountry) return null;

  const codes = Object.keys(fleetCountries).sort();
  if (codes.length === 0) return null;

  const rows: CoverageRow[] = [];
  for (const code of codes) {
    const fleetMw = fleetCountries[code]?.operational_mw;
    const registryMw = registryByCountry[code]?.installed_mw;
    // Every tracked country must have a registry counterpart. Otherwise the
    // headline gap would silently absorb a country the registry never covered,
    // which is the fabricated-attribution failure with a different name on it.
    if (fleetMw == null || registryMw == null) return null;
    rows.push({ code, fleetMw, registryMw, gapMw: fleetMw - registryMw });
  }

  const fleetMw = rows.reduce((s, r) => s + r.fleetMw, 0);
  const registryMw = rows.reduce((s, r) => s + r.registryMw, 0);
  return { registryMw, fleetMw, gapMw: fleetMw - registryMw, rows };
}

/** `LT +63 · LV +59 · EE +9` — signed, rounded, in the payload's own country order. */
export function coverageRowsCaption(cov: FleetCoverage): string {
  return cov.rows
    .map(r => `${r.code} ${r.gapMw >= 0 ? '+' : '−'}${Math.abs(Math.round(r.gapMw))}`)
    .join(' · ');
}
