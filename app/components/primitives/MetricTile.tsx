'use client';

import type { DataClass } from '@/app/lib/types';
import { DataClassBadge } from './DataClassBadge';

export interface MetricTileFan {
  p10: number;
  p50: number;
  p90: number;
}

interface MetricTileProps {
  value: string | number
  unit?: string
  label: string
  sublabel?: string
  size?: 'hero' | 'standard' | 'compact'
  dataClass?: DataClass
  /** P10/P50/P90 confidence band rendered as a hairline fan beneath the value (N-5). */
  fan?: MetricTileFan
  /** Sample size N badge ("n=720"); rendered bottom-right (N-4). */
  sampleSize?: number
  /** Methodology version stamp ("v7"); rendered as superscript on the label (N-6). */
  methodVersion?: string
}

const SIZE_STYLES = {
  hero: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(1.5rem, 3vw, 2rem)',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  standard: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1.25rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  compact: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1rem',
    fontWeight: 400,
    color: 'var(--text-primary)',
  },
} as const;

const FAN_WIDTH_BY_SIZE: Record<NonNullable<MetricTileProps['size']>, number> = {
  hero: 96,
  standard: 64,
  compact: 48,
};

function formatN(n: number): string {
  if (n >= 1000) return `n=${Math.round(n / 100) / 10}k`;
  return `n=${Math.round(n)}`;
}

function FanBand({ fan, width }: { fan: MetricTileFan; width: number }) {
  // p50 splits the band — left half spans p10..p50, right half p50..p90.
  // Renders a 4px hairline band with a tick at p50 (thicker) and faint p10/p90 caps.
  // Read order: low → high. Color is muted-mint per P1 (data state, not opinion).
  const range = fan.p90 - fan.p10;
  const safe = range > 0 ? range : 1;
  const p50Pos = ((fan.p50 - fan.p10) / safe) * width;
  return (
    <svg
      role="img"
      aria-label={`Confidence band P10 ${fan.p10} to P90 ${fan.p90}, P50 ${fan.p50}`}
      width={width}
      height={6}
      style={{ display: 'block', marginTop: 2, opacity: 0.85 }}
    >
      <line x1={0} y1={3} x2={width} y2={3} stroke="var(--text-muted)" strokeWidth={1} />
      <line x1={0} y1={1} x2={0} y2={5} stroke="var(--text-muted)" strokeWidth={1} />
      <line x1={width} y1={1} x2={width} y2={5} stroke="var(--text-muted)" strokeWidth={1} />
      <line x1={p50Pos} y1={0} x2={p50Pos} y2={6} stroke="var(--mint)" strokeWidth={1.5} />
    </svg>
  );
}

export function MetricTile({
  value,
  unit,
  label,
  sublabel,
  size = 'standard',
  dataClass,
  fan,
  sampleSize,
  methodVersion,
}: MetricTileProps) {
  const valueStyle = SIZE_STYLES[size];
  const showCorner = sampleSize != null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        position: showCorner ? 'relative' : undefined,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '6px',
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-tertiary)',
        }}>
          {label}
        </span>
        {methodVersion && (
          <sup
            data-testid="metric-method-version"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.55rem',
              color: 'var(--lavender)',
              letterSpacing: '0.04em',
              top: '-0.4em',
            }}
            title={`Methodology version ${methodVersion}`}
          >
            {methodVersion}
          </sup>
        )}
        {dataClass && <DataClassBadge dataClass={dataClass} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={valueStyle}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-sm)',
            color: 'var(--text-tertiary)',
          }}>
            {unit}
          </span>
        )}
      </div>

      {fan && <FanBand fan={fan} width={FAN_WIDTH_BY_SIZE[size]} />}

      {sublabel && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
        }}>
          {sublabel}
        </span>
      )}

      {showCorner && (
        <span
          data-testid="metric-sample-size"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {formatN(sampleSize!)}
        </span>
      )}
    </div>
  );
}
