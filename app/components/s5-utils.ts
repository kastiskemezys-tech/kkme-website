export function dcColor(signal: string | null): string {
  if (signal === 'OPEN')        return 'var(--signal-green)';
  if (signal === 'TIGHTENING')  return 'var(--signal-amber)';
  if (signal === 'CONSTRAINED') return 'var(--signal-rose)';
  return 'var(--text-muted)';
}
