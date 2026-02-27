export function gasColor(signal: string | null): string {
  if (signal === 'HIGH')      return 'rgba(155, 48, 67, 0.85)';
  if (signal === 'ELEVATED')  return 'rgba(180, 140, 60, 0.85)';
  if (signal === 'LOW')       return 'rgba(74, 124, 89, 0.9)';
  return 'rgba(232, 226, 217, 0.7)';
}
