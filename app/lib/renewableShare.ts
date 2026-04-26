// Renewable mix computation + anomaly detection.
//
// Audit flagged a 61% solar-of-load reading as implausibly high. Live
// trace today (2026-04-26 14:00 UTC) confirms 1482 MW solar / 2395 MW
// load = 62% — but it's a real-but-exceptional reading: solar at 53%
// of installed (2800 MW Baltic) on a sunny shoulder-season midday with
// unusually low load (2395 MW vs ~3500 MW typical). Aggregation is
// simple division; not an artifact.
//
// Module exposes the computation as a pure function so it can be specced,
// plus a small anomaly detector so the card can footnote exceptional
// hours instead of silently presenting them as a steady-state reading.

export interface RenewableMixInputs {
  windMw: number;
  solarMw: number;
  loadMw: number;
  windAvg7dMw?: number;
  solarAvg7dMw?: number;
  loadAvg7dMw?: number;
}

export interface RenewableMixResult {
  windPct: number;
  solarPct: number;
  thermalPct: number;
  renewableMw: number;
  renewablePct: number;
  thermalMw: number;
  /** True when any per-source share exceeds 100% — indicates an upstream bug. */
  invalid: boolean;
  /** Set when today's solar share is materially above 7D average (>= 50% relative uplift). */
  solarAnomaly: 'normal' | 'elevated' | 'exceptional';
}

const ELEVATED_RATIO = 1.5;   // today >= 1.5x 7d → elevated
const EXCEPTIONAL_RATIO = 1.9; // today >= 1.9x 7d → exceptional

export function computeRenewableMix(inp: RenewableMixInputs): RenewableMixResult {
  const wind = Math.max(0, inp.windMw);
  const solar = Math.max(0, inp.solarMw);
  const load = inp.loadMw > 0 ? inp.loadMw : 0;

  const windPct = load > 0 ? (wind / load) * 100 : 0;
  const solarPct = load > 0 ? (solar / load) * 100 : 0;
  const renewableMw = wind + solar;
  const renewablePct = load > 0 ? (renewableMw / load) * 100 : 0;
  const thermalMw = Math.max(0, load - renewableMw);
  const thermalPct = load > 0 ? (thermalMw / load) * 100 : 0;

  // A valid hour cannot have any single source exceed total load.
  const invalid = windPct > 100 || solarPct > 100;

  // Solar anomaly: requires both 7d avg inputs.
  let solarAnomaly: 'normal' | 'elevated' | 'exceptional' = 'normal';
  if (
    inp.solarAvg7dMw != null &&
    inp.loadAvg7dMw != null &&
    inp.solarAvg7dMw > 0 &&
    inp.loadAvg7dMw > 0
  ) {
    const avgShare = (inp.solarAvg7dMw / inp.loadAvg7dMw) * 100;
    if (avgShare > 0) {
      const ratio = solarPct / avgShare;
      if (ratio >= EXCEPTIONAL_RATIO) solarAnomaly = 'exceptional';
      else if (ratio >= ELEVATED_RATIO) solarAnomaly = 'elevated';
    }
  }

  return {
    windPct,
    solarPct,
    thermalPct,
    renewableMw,
    renewablePct,
    thermalMw,
    invalid,
    solarAnomaly,
  };
}

export function solarAnomalyFootnote(
  result: RenewableMixResult,
  todaySolarMw: number,
  avg7dSolarMw?: number,
): string | null {
  if (result.solarAnomaly === 'normal') return null;
  if (avg7dSolarMw == null || avg7dSolarMw <= 0) return null;
  const xMul = (todaySolarMw / avg7dSolarMw).toFixed(1);
  return result.solarAnomaly === 'exceptional'
    ? `Today's solar share is exceptional — ${xMul}× the 7-day average. Sunny midday + low shoulder-season load.`
    : `Today's solar share is elevated — ${xMul}× the 7-day average.`;
}
