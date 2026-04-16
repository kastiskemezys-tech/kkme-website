export function flowColor(signal: string | null): string {
  if (signal === 'EXPORTING') return 'var(--signal-green)';
  if (signal === 'IMPORTING') return 'var(--signal-amber)';
  return 'var(--signal-neutral)';
}

export function flowSignalColor(sig: string | null): string {
  if (sig === 'EXPORT')   return 'var(--signal-green)';
  if (sig === 'IMPORT')   return 'var(--signal-amber)';
  if (sig === 'BALANCED') return 'var(--text-tertiary)';
  return 'var(--text-muted)';
}
