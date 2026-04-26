'use client';

// Phase 8.3b — RegimeBarometer.
// Five regime zones with a vertical needle marking today's reading.
// P1: color encodes data state, not editorial favorability.
//
//   tight       coral     — extreme tightness in spreads
//   compressed  amber     — narrowing window
//   normal      ink-subtle (text-tertiary) — baseline
//   wide        mint      — expansive opportunity window
//   stress      lavender  — modelled / structural deviation

export type Regime = 'tight' | 'compressed' | 'normal' | 'wide' | 'stress';

export interface RegimeBarometerProps {
  regime: Regime;
  width?: number;
  height?: number;
  showLabel?: boolean;
}

export const REGIME_ORDER: readonly Regime[] = ['tight', 'compressed', 'normal', 'wide', 'stress'];

const REGIME_COLOR: Record<Regime, string> = {
  tight:      'var(--coral)',
  compressed: 'var(--amber)',
  normal:     'var(--text-tertiary)',
  wide:       'var(--mint)',
  stress:     'var(--lavender)',
};

const REGIME_LABEL: Record<Regime, string> = {
  tight:      'tight',
  compressed: 'compressed',
  normal:     'normal',
  wide:       'wide',
  stress:     'stress',
};

export function regimeIndex(regime: Regime): number {
  return REGIME_ORDER.indexOf(regime);
}

export function RegimeBarometer({
  regime,
  width = 120,
  height = 14,
  showLabel = false,
}: RegimeBarometerProps) {
  const zoneWidth = width / REGIME_ORDER.length;
  const idx = regimeIndex(regime);
  const needleX = zoneWidth * idx + zoneWidth / 2;

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <svg
        role="img"
        aria-label={`Regime barometer: ${regime}`}
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        {REGIME_ORDER.map((r, i) => {
          const isActive = i === idx;
          return (
            <rect
              key={r}
              data-zone={r}
              data-active={isActive ? 'true' : 'false'}
              x={i * zoneWidth}
              y={0}
              width={zoneWidth}
              height={height}
              fill={REGIME_COLOR[r]}
              fillOpacity={isActive ? 0.28 : 0.08}
            />
          );
        })}
        <line
          x1={needleX}
          y1={-1}
          x2={needleX}
          y2={height + 1}
          stroke="var(--mint)"
          strokeWidth={1.5}
        />
      </svg>
      {showLabel && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-xs)',
            color: REGIME_COLOR[regime],
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {REGIME_LABEL[regime]}
        </span>
      )}
    </span>
  );
}
