import type { CSSProperties } from 'react';

const text = (opacity: number) => `rgba(232, 226, 217, ${opacity})`;

interface TechRow {
  name: string;
  conviction: number; // 1–5
  note: string;
}

const ROWS: TechRow[] = [
  {
    name: 'BESS (Li-Ion)',
    conviction: 5,
    note: 'Baltic balancing products opened post-sync — FCR, aFRR, mFRR, PICASSO, MARI. Early years structurally high value before saturation. Geography between cheap Nordic supply and expensive Poland creates repeatable spread. Full system ~€100/kWh delivered. IRR window is pre-2029.',
  },
  {
    name: 'Grid-scale solar',
    conviction: 4,
    note: 'Standalone solar is a price-taker in Baltic conditions. Co-located with storage it becomes a controllable profile. Hybrid only.',
  },
  {
    name: 'DC infrastructure',
    conviction: 4,
    note: 'KKME packages land, grid path, and capital structure. Deal form is firm capacity — availability SLA, not energy PPA. Small equity slice once offtake is signed.',
  },
  {
    name: 'Green hydrogen',
    conviction: 2,
    note: 'Electrolyser economics not there yet. Watching OPEX reliability and stack lifetime data. Conviction moves when industrial offtake becomes contractable at current capex.',
  },
];

function ConvictionDots({ level }: { level: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: i < level ? 'rgba(123, 94, 167, 0.8)' : text(0.12),
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
                marginBottom: '0.5rem',
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
                fontSize: '0.625rem',
                color: text(0.3),
                letterSpacing: '0.03em',
                lineHeight: 1.6,
                maxWidth: '520px',
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
