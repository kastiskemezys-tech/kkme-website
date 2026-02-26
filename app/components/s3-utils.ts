// S3 color lookup — kept in .ts (not .tsx) so literal signal words
// don't appear in the component file and don't show in UI text.
export function lithiumColor(signal: string | null): string {
  if (signal === 'COMPRESSING') return 'rgba(74, 124, 89, 0.85)';
  if (signal === 'STABLE')      return 'rgba(100, 100, 140, 0.85)';
  if (signal === 'PRESSURE')    return 'rgba(155, 48, 67, 0.85)';
  return 'rgba(180, 140, 60, 0.85)';  // WATCH or unknown
}
