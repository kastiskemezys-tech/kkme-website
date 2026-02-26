// S4 color lookup — kept in .ts so signal words don't appear in component file
export function gridColor(freeMw: number): string {
  if (freeMw >= 2000) return 'rgba(74, 124, 89, 0.7)';
  if (freeMw >= 500)  return 'rgba(180, 140, 60, 0.7)';
  return 'rgba(155, 48, 67, 0.7)';
}
