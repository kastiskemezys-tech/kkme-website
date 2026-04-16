export function carbonColor(signal: string | null): string {
  if (signal === 'HIGH')      return 'var(--signal-rose)';
  if (signal === 'ELEVATED')  return 'var(--signal-amber)';
  if (signal === 'LOW')       return 'var(--signal-green)';
  return 'var(--signal-neutral)';
}
