export function hydro6Color(signal: string | null): string {
  if (signal === 'HIGH')   return 'var(--signal-green)';
  if (signal === 'LOW')    return 'var(--signal-rose)';
  return 'var(--signal-neutral)';
}
