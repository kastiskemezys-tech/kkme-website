import type { CSSProperties } from 'react';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;

interface TechRow {
  name: string;
  conviction: number; // 1–5
  note: string;
}

const ROWS: TechRow[] = [
  { name: 'BESS (Li-Ion)',       conviction: 5, note: 'Core product. LFP cost curve still falling.' },
  { name: 'Grid-scale solar',    conviction: 4, note: 'Feed-in for BESS co-location plays.' },
  { name: 'DC infrastructure',   conviction: 4, note: 'Power demand creates grid arbitrage.' },
  { name: 'Green hydrogen',      conviction: 2, note: 'Watching. Not yet bankable in Baltics.' },
];

function ConvictionDots({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: i < level ? 'rgba(123, 94, 167, 0.8)' : text(0.12),
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export function TechTracker() {
  const MONO: CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <section style={{ maxWidth: '640px', width: '100%' }}>
      <p
        style={{
          ...MONO,
          fontSize: '0.625rem',
          letterSpacing: '0.18em',
          color: text(0.3),
          textTransform: 'uppercase',
          marginBottom: '2rem',
        }}
      >
        Technology Thesis
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {ROWS.map((row, i) => (
          <div
            key={row.name}
            style={{
              paddingTop: i > 0 ? '2rem' : 0,
              borderTop: i > 0 ? `1px solid ${text(0.06)}` : 'none',
              marginTop: i > 0 ? '-2rem' : 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '0.2rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 400,
                  fontSize: '1.1rem',
                  color: text(0.85),
                  letterSpacing: '0.01em',
                }}
              >
                {row.name}
              </span>
              <ConvictionDots level={row.conviction} />
            </div>

            <p
              style={{
                ...MONO,
                fontSize: '0.575rem',
                color: text(0.3),
                letterSpacing: '0.04em',
                marginTop: '0.2rem',
              }}
            >
              {row.note}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
