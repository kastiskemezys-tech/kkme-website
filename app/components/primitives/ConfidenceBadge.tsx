'use client';

interface ConfidenceBadgeProps {
  level: 'high' | 'medium' | 'low'
  reason?: string
}

const LEVEL_COLORS: Record<string, string> = {
  high: 'var(--teal-accent-text)',
  medium: 'var(--amber-accent-text)',
  low: 'var(--rose)',
};

export function ConfidenceBadge({ level, reason }: ConfidenceBadgeProps) {
  const color = LEVEL_COLORS[level];

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color,
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 'var(--space-2xs)',
      }}
      title={reason}
    >
      <span style={{ textTransform: 'capitalize' }}>{level}</span>
      {reason && (
        <span style={{ color: 'var(--text-muted)' }}>— {reason}</span>
      )}
    </span>
  );
}
