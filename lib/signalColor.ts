export type SignalState = 'positive' | 'warning' | 'negative' | 'neutral';

export function signalColor(state: SignalState): string {
  switch (state) {
    case 'positive': return 'var(--signal-positive)';
    case 'warning':  return 'var(--signal-warning)';
    case 'negative': return 'var(--signal-negative)';
    default:         return 'var(--signal-neutral)';
  }
}

/** Map regime/signal strings to a SignalState. */
export function regimeToState(regime: string | null | undefined): SignalState {
  const r = regime?.toUpperCase() ?? '';
  if (['HIGH', 'ACT', 'TIGHT', 'LOW_HYDRO', 'SATURATED', 'CONSTRAINED'].includes(r))
    return 'negative';
  if (['ELEVATED', 'WATCH', 'TIGHTENING', 'IMPORTING', 'SHALLOW'].includes(r))
    return 'warning';
  if (['NORMAL', 'CALM', 'OPEN', 'AVAILABLE', 'HIGH_HYDRO', 'EXPORTING',
       'DEEP', 'EARLY', 'COMPRESSING'].includes(r))
    return 'positive';
  return 'neutral';
}
