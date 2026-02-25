import type { CSSProperties } from 'react';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

const ITEMS = [
  'Offtakers and hyperscalers needing 30–100MW gridable power paths in the Baltics.',
  'Investors seeking Baltic flexibility asset exposure — BESS, hybrid, grid-adjacent.',
  'Route-to-market partners — optimisers and BRPs scaling across LT, LV, EE.',
  'Developers with RTB or near-RTB projects or grid connection reservations.',
];

export function CTASection() {
  return (
    <section
      style={{
        maxWidth: '580px',
        width: '100%',
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          letterSpacing: '0.14em',
          color: 'rgba(232, 226, 217, 0.25)',
          textTransform: 'uppercase' as const,
          marginBottom: '1.25rem',
        }}
      >
        KKME is currently looking for:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ITEMS.map((item) => (
          <p
            key={item}
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
              lineHeight: 1.6,
              color: 'rgba(232, 226, 217, 0.6)',
            }}
          >
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}
