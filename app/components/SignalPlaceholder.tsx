import type { CSSProperties } from 'react';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;
const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

interface SignalPlaceholderProps {
  label: string;
  description: string;
  index: string; // e.g. "S2", "S3"
}

export function SignalPlaceholder({ label, description }: SignalPlaceholderProps) {
  return (
    <article
      style={{
        border: `1px solid ${text(0.1)}`,
        padding: '2rem 2.5rem',
        maxWidth: '440px',
        width: '100%',
      }}
    >
      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          letterSpacing: '0.14em',
          color: text(0.35),
          textTransform: 'uppercase',
          marginBottom: '0.25rem',
        }}
      >
        {label}
      </p>

      <p
        style={{
          ...MONO,
          fontSize: '0.575rem',
          color: text(0.25),
          letterSpacing: '0.04em',
        }}
      >
        {description}
      </p>

      <p
        style={{
          ...MONO,
          fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
          fontWeight: 400,
          color: text(0.08),
          lineHeight: 1,
          letterSpacing: '-0.02em',
          margin: '1.5rem 0 0.75rem 0',
        }}
      >
        —
      </p>

      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          color: text(0.2),
          letterSpacing: '0.1em',
        }}
      >
        Calibrating
      </p>
    </article>
  );
}
