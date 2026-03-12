'use client';

interface SourceFooterProps {
  source: string
  updatedAt?: string
  dataClass?: string
  methodologyLink?: string
}

export function SourceFooter({ source, updatedAt, dataClass, methodologyLink }: SourceFooterProps) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-sm)',
      color: 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexWrap: 'wrap',
    }}>
      <span>Source: {source}</span>
      {updatedAt && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>Updated {updatedAt}</span>
        </>
      )}
      {dataClass && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{dataClass}</span>
        </>
      )}
      {methodologyLink && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <a
            href={methodologyLink}
            style={{
              color: 'var(--teal)',
              textDecoration: 'none',
            }}
          >
            ↗ Methodology
          </a>
        </>
      )}
    </div>
  );
}
