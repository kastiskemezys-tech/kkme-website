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
//
// Phase 7.7e — per-zone hover wired through ChartTooltip; the active zone is
// labelled "today" while inactive zones surface their regime label only.

import { ChartTooltip, useChartTooltipState } from './ChartTooltip';

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
  const tt = useChartTooltipState();

  return (
    <span
      onMouseLeave={() => tt.hide()}
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
              onMouseEnter={(e) => tt.show({
                label: REGIME_LABEL[r],
                value: i + 1,
                unit: `of ${REGIME_ORDER.length}`,
                secondary: isActive ? [{ label: 'State', value: 'today' }] : undefined,
              }, e.clientX, e.clientY)}
              onMouseMove={(e) => tt.show({
                label: REGIME_LABEL[r],
                value: i + 1,
                unit: `of ${REGIME_ORDER.length}`,
                secondary: isActive ? [{ label: 'State', value: 'today' }] : undefined,
              }, e.clientX, e.clientY)}
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
      <ChartTooltip
        visible={tt.state.visible}
        x={tt.state.x}
        y={tt.state.y}
        value={tt.state.data?.value ?? 0}
        unit={tt.state.data?.unit ?? ''}
        date={tt.state.data?.date}
        time={tt.state.data?.time}
        label={tt.state.data?.label}
        secondary={tt.state.data?.secondary}
        source={tt.state.data?.source}
      />
    </span>
  );
}
