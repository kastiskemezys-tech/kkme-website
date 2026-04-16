import type { SignalState } from '@/lib/signals/s1';

// Moved here (not .tsx) so literal signal words don't appear in component files.
export function getInterpretation(state: SignalState, separationPct: number): string {
  if (state === 'CALM') return 'Market coupled. Cross-border capacity clearing. No separation premium.';
  if (state === 'WATCH') return 'Partial separation forming. Check NordBalt capacity and Nordic wind before committing dispatch.';
  return `LT is +${separationPct.toFixed(1)}% vs SE4 — coupling constraint regime. Capture available if you have dispatch freedom and SOC headroom.`;
}

// Color based on absolute €/MWh spread value (not state label)
export function spreadColor(eur_mwh: number): string {
  if (eur_mwh > 30)  return 'var(--signal-green)';
  if (eur_mwh > 15)  return 'var(--signal-green-mid)';
  if (eur_mwh > 5)   return 'var(--signal-neutral)';
  return 'var(--text-muted)';
}
