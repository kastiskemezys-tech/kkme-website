import type { CSSProperties } from 'react';

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

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
          marginBottom: '1.5rem',
        }}
      >
        If you have a near-RTB grid path or a 30–100MW firm power requirement in the Baltics:
      </p>

      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
          lineHeight: 1.7,
          color: 'rgba(232, 226, 217, 0.65)',
          marginBottom: '1.5rem',
        }}
      >
        Send node/location, MW/MWh, status, target COD, and counterparty needs. I&apos;ll return a go/no-go and a structure outline.
      </p>

      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)',
          lineHeight: 1.7,
          color: 'rgba(232, 226, 217, 0.35)',
        }}
      >
        Also looking for: investors in Baltic flexibility assets, route-to-market partners (optimisers/BRPs), and developers with RTB reservations.
      </p>
    </section>
  );
}
