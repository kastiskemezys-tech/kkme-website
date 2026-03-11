'use client';

import type { DataClass } from '@/app/lib/types';
import { DataClassBadge } from './DataClassBadge';

interface MetricTileProps {
  value: string | number
  unit?: string
  label: string
  sublabel?: string
  size?: 'hero' | 'standard' | 'compact'
  dataClass?: DataClass
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

export function MetricTile({ value, unit, label, sublabel, size = 'standard', dataClass }: MetricTileProps) {
  const valueStyle = SIZE_STYLES[size];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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

      {sublabel && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-sm)',
          color: 'var(--text-muted)',
        }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}
