// Publication gate configuration
// Determines which metrics can appear publicly based on confidence + inference distance
// See docs/PUBLICATION_GATES.md for full rules

export type GateLevel = 'PUBLIC_OK' | 'PUBLIC_WITH_WARNING' | 'INTERNAL_ONLY';
export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface MetricGate {
  metric: string;
  confidence: ConfidenceGrade;
  inferenceDistance: number;
  coverage: number;
  gate: GateLevel;
}

export function computeGate(confidence: string, infDist: number, coverage: number): GateLevel {
  if (coverage < 0.3) return 'INTERNAL_ONLY';
  if (confidence === 'D' || confidence === 'E') return 'INTERNAL_ONLY';
  if (confidence === 'C' && infDist >= 3) return 'INTERNAL_ONLY';
  if (confidence === 'C' || infDist >= 3) return 'PUBLIC_WITH_WARNING';
  return 'PUBLIC_OK';
}

// Current metric gates — reference for component rendering decisions
// PUBLIC_OK → show as hero metric
// PUBLIC_WITH_WARNING → show with DataClassBadge + caveat
// INTERNAL_ONLY → show only inside detail/drawer panel, never as hero
export const METRIC_GATES: Record<string, MetricGate> = {
  da_spread:        { metric: 'DA Spread',         confidence: 'A', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
  da_prices:        { metric: 'DA Prices',         confidence: 'A', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
  bess_capture:     { metric: 'BESS Capture',      confidence: 'B', inferenceDistance: 2, coverage: 0.9, gate: 'PUBLIC_OK' },
  sd_ratio:         { metric: 'S/D Ratio',         confidence: 'C', inferenceDistance: 3, coverage: 0.6, gate: 'PUBLIC_WITH_WARNING' },
  market_phase:     { metric: 'Market Phase',       confidence: 'C', inferenceDistance: 3, coverage: 0.6, gate: 'PUBLIC_WITH_WARNING' },
  afrr_price:       { metric: 'aFRR Price',        confidence: 'D', inferenceDistance: 4, coverage: 0.3, gate: 'INTERNAL_ONLY' },
  mfrr_price:       { metric: 'mFRR Price',        confidence: 'D', inferenceDistance: 4, coverage: 0.3, gate: 'INTERNAL_ONLY' },
  fcr_price:        { metric: 'FCR Price',         confidence: 'D', inferenceDistance: 3, coverage: 0.2, gate: 'INTERNAL_ONLY' },
  project_irr:      { metric: 'Project IRR',       confidence: 'D', inferenceDistance: 5, coverage: 0.3, gate: 'INTERNAL_ONLY' },
  equity_irr:       { metric: 'Equity IRR',        confidence: 'D', inferenceDistance: 5, coverage: 0.3, gate: 'INTERNAL_ONLY' },
  dscr:             { metric: 'DSCR',              confidence: 'D', inferenceDistance: 5, coverage: 0.3, gate: 'INTERNAL_ONLY' },
  dispatch_revenue: { metric: 'Dispatch Revenue',  confidence: 'C', inferenceDistance: 3, coverage: 0.5, gate: 'PUBLIC_WITH_WARNING' },
  ttf_gas:          { metric: 'TTF Gas',           confidence: 'A', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
  ets_carbon:       { metric: 'ETS Carbon',        confidence: 'A', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
  grid_capacity:    { metric: 'Grid Capacity',     confidence: 'B', inferenceDistance: 1, coverage: 0.8, gate: 'PUBLIC_OK' },
  euribor:          { metric: 'Euribor',           confidence: 'A', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
  fleet_operational:{ metric: 'Operational MW',    confidence: 'B', inferenceDistance: 2, coverage: 0.7, gate: 'PUBLIC_OK' },
  fleet_weighted:   { metric: 'Weighted MW',       confidence: 'C', inferenceDistance: 3, coverage: 0.5, gate: 'PUBLIC_WITH_WARNING' },
  fleet_trajectory: { metric: 'Fleet Trajectory',  confidence: 'C', inferenceDistance: 4, coverage: 0.4, gate: 'INTERNAL_ONLY' },
  interconnectors:  { metric: 'Interconnectors',   confidence: 'A', inferenceDistance: 1, coverage: 0.9, gate: 'PUBLIC_OK' },
  nordic_hydro:     { metric: 'Nordic Hydro',      confidence: 'A', inferenceDistance: 1, coverage: 0.8, gate: 'PUBLIC_OK' },
  ch_benchmark:     { metric: 'CH Benchmark',      confidence: 'B', inferenceDistance: 1, coverage: 1.0, gate: 'PUBLIC_OK' },
};
