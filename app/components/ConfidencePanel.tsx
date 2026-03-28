'use client';

const CONFIDENCE_ROWS = [
  { metric: 'Installed base',          filled: 5, level: 'high',   source: 'official · Litgrid + AST + Evecon' },
  { metric: 'Permit-backed pipeline',  filled: 5, level: 'high',   source: 'official · VERT register' },
  { metric: 'TSO reserved/protocol',   filled: 4, level: 'high',   source: 'official · Litgrid cycle data' },
  { metric: 'Capacity prices',         filled: 2, level: 'low',    source: 'proxy · no BTD clearing data' },
  { metric: 'Node-level headroom',     filled: 3, level: 'medium', source: 'indicative · non-additive caveat' },
  { metric: 'Revenue model',           filled: 2, level: 'low',    source: 'modeled · proxy inputs + assumptions' },
  { metric: 'EE/LV pipeline',          filled: 2, level: 'low',    source: 'partial · scraper coverage gaps' },
];

function Dots({ filled }: { filled: number }) {
  return (
    <span style={{ letterSpacing: '2px' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < filled ? 'var(--teal)' : 'var(--text-ghost)' }}>
          {i < filled ? '●' : '○'}
        </span>
      ))}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: 'var(--teal)',
    medium: 'var(--amber)',
    low: 'var(--rose)',
  };
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.5625rem',
      color: colors[level] || 'var(--text-muted)',
      border: `1px solid ${colors[level] || 'var(--border-card)'}`,
      padding: '0px 4px',
      borderRadius: '2px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {level}
    </span>
  );
}

export function ConfidencePanel() {
  return (
    <div style={{ width: '100%' }}>
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        color: 'var(--text-tertiary)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: '14px',
        fontWeight: 500,
      }}>
        Data confidence
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {CONFIDENCE_ROWS.map(row => (
          <div
            key={row.metric}
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 70px 50px 1fr',
              gap: '8px',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-xs)',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{row.metric}</span>
            <Dots filled={row.filled} />
            <LevelBadge level={row.level} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.625rem' }}>{row.source}</span>
          </div>
        ))}
      </div>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.625rem',
        color: 'var(--text-muted)',
        lineHeight: 1.6,
        marginTop: '16px',
        opacity: 0.7,
      }}>
        Confidence grades reflect data provenance, not prediction accuracy.
        &quot;Low&quot; means the input uses proxies or assumptions — not that the
        output is wrong. Full methodology available on request.
      </p>
    </div>
  );
}
