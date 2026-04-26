// Canonical fleet metric extractors for the /s4 payload.
//
// Two distinct conceptual quantities have collided under "operational" in
// past UI surfaces:
//
//   FLEX FLEET (`flexibility_fleet_mw`): all commissioned, grid-connected
//   flexibility assets — BESS + pumped hydro (e.g. Kruonis 205 MW). Live
//   number, sourced from `_fleet/entries` KV. Currently 822 MW Baltic-wide.
//
//   BESS REGISTRY (`bess_installed_mw`): curated BESS-only national
//   registry, excludes pumped hydro by definition. Currently 651 MW
//   (LT 484 + LV 40 + EE 127). Used by the LT pipeline visualisation
//   because BESS pipeline analysis must not mix in Kruonis (DRR-suppressed
//   for FCR/aFRR until 2028-02).
//
// Same surface MUST NOT show one as "operational MW" and another as
// "operational MW" — that's the audit's #4 reconciliation finding. Pick
// the right one for the context, label it precisely.

export interface FleetCountrySummary {
  operational_mw?: number | null;
  pipeline_mw?: number | null;
  weighted_mw?: number | null;
}

export interface S4FleetBlock {
  baltic_operational_mw?: number | null;
  baltic_pipeline_mw?: number | null;
  baltic_weighted_mw?: number | null;
  eff_demand_mw?: number | null;
  sd_ratio?: number | null;
  countries?: Record<string, FleetCountrySummary> | null;
  updated?: string | null;
}

export interface S4BalticTotal {
  installed_mw?: number | null;
  under_construction_mw?: number | null;
}

export interface S4ForFleet {
  fleet?: S4FleetBlock | null;
  baltic_total?: S4BalticTotal | null;
}

/** Live commissioned flex fleet (BESS + pumped hydro). Headline number. */
export function flexibilityFleetMw(s4: S4ForFleet | null | undefined): number | null {
  return s4?.fleet?.baltic_operational_mw ?? null;
}

/** Per-country flex fleet operational MW; null per country if missing. */
export function flexibilityFleetByCountry(s4: S4ForFleet | null | undefined): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const c = s4?.fleet?.countries;
  if (!c) return out;
  for (const [k, v] of Object.entries(c)) {
    out[k] = v?.operational_mw ?? null;
  }
  return out;
}

/** BESS-only registry total (excludes pumped hydro). Use for BESS pipeline analysis. */
export function bessInstalledMw(s4: S4ForFleet | null | undefined): number | null {
  return s4?.baltic_total?.installed_mw ?? null;
}

/** Under-construction MW from registry (kept distinct from "operational"). */
export function bessUnderConstructionMw(s4: S4ForFleet | null | undefined): number | null {
  return s4?.baltic_total?.under_construction_mw ?? null;
}

/** Returns true if the registry total and live flex fleet diverge — useful for footnote logic. */
export function fleetMetricsDiverge(s4: S4ForFleet | null | undefined): boolean {
  const flex = flexibilityFleetMw(s4);
  const bess = bessInstalledMw(s4);
  if (flex == null || bess == null) return false;
  return Math.abs(flex - bess) > 1; // tolerate sub-MW rounding
}
