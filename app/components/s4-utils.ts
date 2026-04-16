// S4 color lookup — kept in .ts so signal words don't appear in component file
export function gridColor(freeMw: number): string {
  if (freeMw >= 2000) return 'var(--signal-green-soft)';
  if (freeMw >= 500)  return 'var(--signal-amber)';
  return 'var(--signal-rose)';
}
