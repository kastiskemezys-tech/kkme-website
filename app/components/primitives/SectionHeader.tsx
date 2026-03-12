'use client';

interface SectionHeaderProps {
  title: string
  subtitle?: string
  metadata?: {
    region?: string
    freshness?: string
    methodology?: string
  }
}

export function SectionHeader({ title, subtitle, metadata }: SectionHeaderProps) {
  return (
    <div style={{ marginBottom: '48px' }}>
      <h2 style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-sm)',
        color: 'var(--text-secondary)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: subtitle ? '12px' : '0',
        fontWeight: 500,
      }}>
        {title}
      </h2>

      {subtitle && (
        <p style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          maxWidth: '600px',
          margin: 0,
        }}>
          {subtitle}
        </p>
      )}

      {metadata && (
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: '10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
        }}>
          {metadata.region && <span>{metadata.region}</span>}
          {metadata.region && metadata.freshness && <span style={{ opacity: 0.5 }}>·</span>}
          {metadata.freshness && <span>{metadata.freshness}</span>}
          {metadata.methodology && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ color: 'var(--text-muted)' }}>{metadata.methodology}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
