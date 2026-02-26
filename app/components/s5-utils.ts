export function dcColor(signal: string | null): string {
  if (signal === 'OPEN')        return 'rgba(74, 124, 89, 0.9)';
  if (signal === 'TIGHTENING')  return 'rgba(180, 140, 60, 0.85)';
  if (signal === 'CONSTRAINED') return 'rgba(155, 48, 67, 0.85)';
  return 'rgba(232, 226, 217, 0.35)';
}
