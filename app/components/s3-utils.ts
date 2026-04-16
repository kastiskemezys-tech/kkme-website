// S3 color lookup — kept in .ts (not .tsx) so literal signal words
// don't appear in the component file and don't show in UI text.
export function lithiumColor(signal: string | null): string {
  if (signal === 'COMPRESSING') return 'var(--signal-green)';
  if (signal === 'STABLE')      return 'var(--signal-stable)';
  if (signal === 'PRESSURE')    return 'var(--signal-rose)';
  return 'var(--signal-amber)';  // WATCH or unknown
}
