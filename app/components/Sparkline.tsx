'use client';

import { useRef, useEffect, useState } from 'react';
import { drawSparkline } from '@/lib/animations';
import { ChartTooltip, useChartTooltipState } from '@/app/components/primitives';

interface SparklineProps {
  values:  number[];
  labels?: string[];
  /** Optional ISO date strings parallel to `values`; if present, tooltips
   *  surface a formatted date in the headline row instead of the raw label. */
  dates?:  string[];
  /** Tooltip unit suffix (€/MWh, MW, %, …). Falls back to `rangeUnit`. */
  unit?:   string;
  width?:  number;
  height?: number;
  color?:  string;
  p50?:    number;
  /** Show min/max value markers on the left edge */
  showRange?: boolean;
  /** Unit suffix for min/max labels (e.g. "€/MWh") */
  rangeUnit?: string;
  /** Number of decimal places for min/max labels */
  rangeDecimals?: number;
}

export function Sparkline({
  values, labels, dates, unit,
  width, height = 24,
  color = 'var(--teal)', p50,
  showRange = false, rangeUnit = '', rangeDecimals = 1,
}: SparklineProps) {
  const lineRef = useRef<SVGPolylineElement>(null);
  const tt = useChartTooltipState();
  const [hostHover, setHostHover] = useState(false);

  useEffect(() => {
    drawSparkline(lineRef.current);
  }, []); // mount only

  if (!values || values.length < 2) return null;

  const valid = values.filter(v => typeof v === 'number' && isFinite(v));
  if (valid.length < 2) return null;

  const min   = Math.min(...valid);
  const max   = Math.max(...valid);
  const range = max - min || 1;

  const W = width ?? 600;

  const toY = (v: number) =>
    height - ((v - min) / range) * (height - 2) - 1;

  const pts = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * W;
    return { x: parseFloat(x.toFixed(1)), y: parseFloat(toY(v).toFixed(1)) };
  });

  const points = pts.map(p => `${p.x},${p.y}`).join(' ');

  const areaPath = [
    `M${pts[0].x},${height}`,
    ...pts.map(p => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${height}`,
    'Z',
  ].join(' ');

  const lastX  = pts[pts.length - 1].x;
  const lastY  = pts[pts.length - 1].y;
  const p50Y   = p50 !== undefined ? toY(p50) : null;
  const gradId = `sg-${W}-${height}`;

  const marginL = showRange ? 48 : 0;
  const totalW = W + marginL;

  const tooltipUnit = unit ?? rangeUnit;

  return (
    <span
      onMouseEnter={() => setHostHover(true)}
      onMouseLeave={() => { setHostHover(false); tt.hide(); }}
      style={{ display: 'block' }}
    >
      <svg
        width={width ?? '100%'}
        height={height}
        viewBox={`${-marginL} -2 ${totalW} ${height + 4}`}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>

        {p50Y !== null && (
          <line
            x1={0} y1={p50Y} x2={W} y2={p50Y}
            stroke="var(--chart-grid)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
        )}

        <path d={areaPath} fill={`url(#${gradId})`} />

        <polyline
          ref={lineRef}
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.65}
        />
        <circle cx={lastX} cy={lastY} r={2} fill={color} opacity={0.9} />

        {/* Hover zones — portal-mounted ChartTooltip on enter */}
        {pts.map((p, i) => {
          const segW = W / valid.length;
          const v = valid[i];
          const date = dates?.[i];
          const labelText = labels?.[i];
          return (
            <rect
              key={i}
              x={p.x - segW / 2}
              y={0}
              width={segW}
              height={height}
              fill="transparent"
              onMouseEnter={(e) => {
                if (!hostHover && !tt.state.visible) setHostHover(true);
                tt.show({
                  date: date,
                  label: !date ? labelText : undefined,
                  value: v,
                  unit: tooltipUnit,
                }, e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                tt.show({
                  date: date,
                  label: !date ? labelText : undefined,
                  value: v,
                  unit: tooltipUnit,
                }, e.clientX, e.clientY);
              }}
            />
          );
        })}

        {showRange && (
          <>
            <text
              x={-4}
              y={2}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize="9"
              fill="var(--text-muted)"
            >
              {max.toFixed(rangeDecimals)}{rangeUnit ? ` ${rangeUnit}` : ''}
            </text>
            <text
              x={-4}
              y={height - 1}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize="9"
              fill="var(--text-muted)"
            >
              {min.toFixed(rangeDecimals)}{rangeUnit ? ` ${rangeUnit}` : ''}
            </text>
          </>
        )}
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
