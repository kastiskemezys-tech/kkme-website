'use client';

// Phase 8.3b — DistributionTick.
// 1px hairline rule with a tick marking where `today` sits across [min, max].
// Faint p25/p50/p75/p90 markers. Pure SVG, no external deps.
// P1: color encodes data state — today = mint, distribution = ink-subtle.
//
// Phase 7.7e — per-percentile + today hover wired through ChartTooltip.

import { ChartTooltip, useChartTooltipState } from './ChartTooltip';

export interface DistributionTickProps {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  max: number;
  today: number;
  width?: number;
  height?: number;
  ariaLabel?: string;
}

export function distributionScale(value: number, min: number, max: number, width: number): number {
  const range = max - min;
  if (range <= 0) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / range) * width;
}

export function DistributionTick({
  min,
  p25,
  p50,
  p75,
  p90,
  max,
  today,
  width = 80,
  height = 12,
  ariaLabel,
}: DistributionTickProps) {
  const baselineY = height / 2;
  const x = (v: number) => distributionScale(v, min, max, width);
  const todayX = x(today);
  const p25X = x(p25);
  const p50X = x(p50);
  const p75X = x(p75);
  const p90X = x(p90);
  const small = Math.max(2, Math.round(height * 0.25));   // p25/p75/p90 tick half-height
  const medium = Math.max(3, Math.round(height * 0.4));    // p50 tick half-height
  const fullTop = 0;
  const fullBottom = height;
  const tt = useChartTooltipState();

  const showTip = (label: string, value: number, secondary?: { label: string; value: number | string; unit?: string }[]) =>
    (e: React.MouseEvent) => tt.show({ label, value, unit: '', secondary }, e.clientX, e.clientY);

  return (
    <span
      style={{ display: 'inline-block', lineHeight: 0 }}
      onMouseLeave={() => tt.hide()}
    >
      <svg
        role="img"
        aria-label={
          ariaLabel ??
          `Distribution tick: today ${today} on a scale of ${min} to ${max}; P50 ${p50}, P90 ${p90}`
        }
        width={width}
        height={height}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="var(--text-muted)"
          strokeWidth={1}
        />
        <line x1={p25X} y1={baselineY - small} x2={p25X} y2={baselineY + small} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={p50X} y1={baselineY - medium} x2={p50X} y2={baselineY + medium} stroke="var(--text-tertiary)" strokeWidth={1.5} />
        <line x1={p75X} y1={baselineY - small} x2={p75X} y2={baselineY + small} stroke="var(--text-muted)" strokeWidth={1} />
        <line x1={p90X} y1={baselineY - small} x2={p90X} y2={baselineY + small} stroke="var(--text-muted)" strokeWidth={1} />
        <line
          x1={todayX}
          y1={fullTop}
          x2={todayX}
          y2={fullBottom}
          stroke="var(--mint)"
          strokeWidth={1.5}
        />
        {/* Invisible hover targets for each tick */}
        <rect x={todayX - 5} y={0} width={10} height={height} fill="transparent"
          onMouseEnter={showTip('Today', today, [{ label: 'Range', value: `${min}–${max}` }])}
          onMouseMove={showTip('Today', today, [{ label: 'Range', value: `${min}–${max}` }])} />
        <rect x={p25X - 4} y={baselineY - small} width={8} height={small * 2} fill="transparent"
          onMouseEnter={showTip('P25', p25)} onMouseMove={showTip('P25', p25)} />
        <rect x={p50X - 4} y={baselineY - medium} width={8} height={medium * 2} fill="transparent"
          onMouseEnter={showTip('P50', p50)} onMouseMove={showTip('P50', p50)} />
        <rect x={p75X - 4} y={baselineY - small} width={8} height={small * 2} fill="transparent"
          onMouseEnter={showTip('P75', p75)} onMouseMove={showTip('P75', p75)} />
        <rect x={p90X - 4} y={baselineY - small} width={8} height={small * 2} fill="transparent"
          onMouseEnter={showTip('P90', p90)} onMouseMove={showTip('P90', p90)} />
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
    </span>
  );
}
