import type { CSSProperties } from 'react';

interface SectionDividerProps {
  label: string;
  sub?: string;
}

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

export function SectionDivider({ label, sub }: SectionDividerProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '900px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        position: 'relative',
        marginBottom: '-1rem',
      }}
    >
      {/* Ambient radial glow behind the accent bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: '160px',
          height: '48px',
          background: 'radial-gradient(ellipse at left center, rgba(123,94,167,0.14), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Accent left-bar */}
      <div
        style={{
          width: '3px',
          height: '22px',
          background: 'rgba(123, 94, 167, 0.65)',
          flexShrink: 0,
          position: 'relative',
        }}
      />

      {/* Label */}
      <span
        style={{
          ...MONO,
          fontSize: '0.72rem',
          letterSpacing: '0.2em',
          color: 'rgba(232, 226, 217, 0.60)',
          textTransform: 'uppercase',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      {/* Hairline */}
      <div
        style={{
          flex: 1,
          height: '1px',
          background: 'rgba(232, 226, 217, 0.06)',
        }}
      />

      {/* Optional sub-label */}
      {sub && (
        <span
          style={{
            ...MONO,
            fontSize: '0.58rem',
            letterSpacing: '0.10em',
            color: 'rgba(232, 226, 217, 0.28)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
