export function flowColor(signal: string | null): string {
  if (signal === 'EXPORTING') return 'rgba(74, 124, 89, 0.9)';
  if (signal === 'IMPORTING') return 'rgba(180, 140, 60, 0.85)';
  return 'rgba(232, 226, 217, 0.7)';
}

export function flowSignalColor(sig: string | null): string {
  if (sig === 'EXPORT')   return 'rgba(74, 124, 89, 0.9)';
  if (sig === 'IMPORT')   return 'rgba(180, 140, 60, 0.85)';
  if (sig === 'BALANCED') return 'rgba(232, 226, 217, 0.5)';
  return 'rgba(232, 226, 217, 0.3)';
}
