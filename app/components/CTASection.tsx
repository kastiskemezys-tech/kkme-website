import type { CSSProperties } from 'react';

const MONO: CSSProperties  = { fontFamily: 'var(--font-mono)' };
const SERIF: CSSProperties = { fontFamily: 'var(--font-serif)' };

export function CTASection() {
  return (
    <section
      style={{
        maxWidth: '580px',
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* One-liner terminal hook */}
      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          letterSpacing: '0.12em',
          color: 'rgba(232, 226, 217, 0.45)',
          marginBottom: '1.25rem',
        }}
      >
        Baltic RTB / near-RTB dealflow wanted — BESS and hybrids.
        Teaser in → go/no-go + proposed structure out.
      </p>

      {/* Main copy */}
      <p
        style={{
          ...SERIF,
          fontWeight: 300,
          fontSize: 'clamp(1rem, 2.2vw, 1.15rem)',
          lineHeight: 1.75,
          color: 'rgba(232, 226, 217, 0.68)',
          marginBottom: '1.5rem',
        }}
      >
        Looking for investable Baltic energy projects (BESS / hybrids) at RTB
        or near-RTB stage. Send a 1–2 page teaser — I will reply with a
        go/no-go and a proposed deal structure.
      </p>

      {/* Secondary — capital partners */}
      <p
        style={{
          ...SERIF,
          fontWeight: 300,
          fontSize: 'clamp(0.875rem, 1.8vw, 0.975rem)',
          lineHeight: 1.7,
          color: 'rgba(232, 226, 217, 0.4)',
          marginBottom: '1.75rem',
        }}
      >
        Capital partners: if you deploy equity into energy infrastructure and
        want Baltic exposure, contact me.
      </p>

      {/* What to include */}
      <p
        style={{
          ...MONO,
          fontSize: '0.55rem',
          letterSpacing: '0.1em',
          color: 'rgba(232, 226, 217, 0.35)',
          textTransform: 'uppercase',
          marginBottom: '0.65rem',
        }}
      >
        What to include (5 bullets max)
      </p>
      <ul
        style={{
          listStyle: 'disc',
          paddingLeft: '1.2em',
          margin: '0 0 2rem 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}
      >
        {[
          'Location / node',
          'MW / MWh',
          'Stage',
          'Target COD',
          'Ask (sell / JV / funding)',
        ].map((item) => (
          <li
            key={item}
            style={{
              ...SERIF,
              fontWeight: 300,
              fontSize: 'clamp(0.875rem, 1.8vw, 0.975rem)',
              lineHeight: 1.6,
              color: 'rgba(232, 226, 217, 0.5)',
            }}
          >
            {item}
          </li>
        ))}
      </ul>

      {/* Send teaser CTA */}
      <a
        href="mailto:kastytis@kkme.eu?subject=BESS%20project%20teaser"
        style={{
          ...MONO,
          display: 'inline-block',
          fontSize: '0.625rem',
          letterSpacing: '0.1em',
          padding: '0.6rem 1.5rem',
          border: '1px solid rgba(232, 226, 217, 0.2)',
          color: 'rgba(232, 226, 217, 0.6)',
          textDecoration: 'none',
          textTransform: 'uppercase',
          transition: 'border-color 0.15s, color 0.15s',
        }}
      >
        Send teaser
      </a>
    </section>
  );
}
