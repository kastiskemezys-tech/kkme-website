export function hydro6Color(signal: string | null): string {
  if (signal === 'HIGH')   return 'rgba(74, 124, 89, 0.9)';
  if (signal === 'LOW')    return 'rgba(155, 48, 67, 0.85)';
  return 'var(--signal-neutral)';
}
