'use client';

import { useState } from 'react';
import { ChartTooltip, useChartTooltipState } from '@/app/components/primitives';
import type { ChartTooltipData } from '@/app/lib/chartTooltip';

interface Threshold {
  value: number;
  label: string;
  color: string;
}

interface BulletChartProps {
  value: number;
  min?: number;
  max: number;
  thresholds: Threshold[];
  label: string;
  unit: string;
  width?: number;
}

export function BulletChart({
  value,
  min = 0,
  max,
  thresholds,
  label,
  unit,
  width = 200,
}: BulletChartProps) {
  const h = 40;
  const barH = 10;
  const barY = (h - barH) / 2;

  const toX = (v: number) => Math.max(0, Math.min(width, ((v - min) / (max - min)) * width));
  const valueX = toX(value);
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);

  const tt = useChartTooltipState();
  const [hoverHost, setHoverHost] = useState(false);

  const showAt = (data: ChartTooltipData, e: React.MouseEvent) => {
    tt.show(data, e.clientX, e.clientY);
  };

  return (
    <div
      style={{ fontFamily: 'var(--font-mono)', marginBottom: '8px', position: 'relative' }}
      onMouseEnter={() => setHoverHost(true)}
      onMouseLeave={() => { setHoverHost(false); tt.hide(); }}
    >
      <div
        style={{
          fontSize: '0.65rem',
          color: 'var(--chart-label)',
          marginBottom: '3px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--text-primary)' }}>
          {value.toFixed(1)} {unit}
        </span>
      </div>

      <svg
        width={width}
        height={h + 10}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={(e) => {
          if (!hoverHost) return;
          // Re-anchor the tooltip on every move so it tracks the cursor.
          if (tt.state.visible) {
            tt.show(tt.state.data!, e.clientX, e.clientY);
          }
        }}
      >
        {/* Background ranges */}
        {sorted.map((t, i) => {
          const x1 = i === 0 ? 0 : toX(sorted[i - 1].value);
          const x2 = toX(t.value);
          const lower = i === 0 ? min : sorted[i - 1].value;
          return (
            <rect
              key={`range-${i}`}
              x={x1}
              y={barY}
              width={Math.max(0, x2 - x1)}
              height={barH}
              fill={t.color}
              opacity={0.18}
              onMouseEnter={(e) => showAt({
                value: t.value,
                unit,
                label: `${t.label} band`,
                secondary: [{ label: 'Range', value: `${lower}–${t.value}`, unit }],
              }, e)}
            />
          );
        })}
        {/* Final range beyond last threshold */}
        <rect
          x={toX(sorted[sorted.length - 1].value)}
          y={barY}
          width={Math.max(0, width - toX(sorted[sorted.length - 1].value))}
          height={barH}
          fill={sorted[sorted.length - 1].color}
          opacity={0.18}
          onMouseEnter={(e) => showAt({
            value: max,
            unit,
            label: `${sorted[sorted.length - 1].label} band`,
            secondary: [{ label: 'Range', value: `${sorted[sorted.length - 1].value}+`, unit }],
          }, e)}
        />

        {/* Threshold ticks */}
        {sorted.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={toX(t.value)} y1={barY - 2}
              x2={toX(t.value)} y2={barY + barH + 2}
              stroke="var(--chart-tick)"
              strokeWidth="0.5"
            />
            <text
              x={toX(t.value)}
              y={barY + barH + 9}
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Value bar */}
        <rect
          x={0}
          y={barY + 1}
          width={valueX}
          height={barH - 2}
          rx="1"
          fill="var(--chart-bar)"
          onMouseEnter={(e) => showAt({
            value,
            unit,
            label,
          }, e)}
        />

        {/* Current value marker — downward triangle above bar */}
        <polygon
          points={`${valueX},${barY - 2} ${valueX - 4},${barY - 10} ${valueX + 4},${barY - 10}`}
          fill="white"
          opacity={0.85}
        />
      </svg>
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
    </div>
  );
}
