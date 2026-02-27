export type SignalState = 'positive' | 'warning' | 'negative' | 'neutral';

export function signalColor(state: SignalState): string {
  switch (state) {
    case 'positive': return 'rgba(86,166,110,0.88)';
    case 'warning':  return 'rgba(204,160,72,0.82)';
    case 'negative': return 'rgba(214,88,88,0.88)';
    default:         return 'rgba(232,226,217,0.72)';
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
