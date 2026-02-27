'use client';

import { useRef, useEffect } from 'react';
import { drawSparkline } from '@/lib/animations';

interface SparklineProps {
  values:  number[];
  width?:  number;
  height?: number;
  color?:  string;
  p50?:    number;
}

export function Sparkline({
  values, width = 80, height = 24,
  color = '#4ade80', p50,
}: SparklineProps) {
  const lineRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    drawSparkline(lineRef.current);
  }, []); // mount only

  if (!values || values.length < 2) return null;

  const valid = values.filter(v => typeof v === 'number' && isFinite(v));
  if (valid.length < 2) return null;

  const min   = Math.min(...valid);
  const max   = Math.max(...valid);
  const range = max - min || 1;

  const toY = (v: number) =>
    height - ((v - min) / range) * (height - 2) - 1;

  const points = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * width;
    return `${x.toFixed(1)},${toY(v).toFixed(1)}`;
  }).join(' ');

  const lastX = width;
  const lastY = toY(valid[valid.length - 1]);
  const p50Y  = p50 !== undefined ? toY(p50) : null;

  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {p50Y !== null && (
        <line
          x1={0} y1={p50Y} x2={width} y2={p50Y}
          stroke="rgba(232,226,217,0.12)"
          strokeWidth={0.5}
          strokeDasharray="2,2"
        />
      )}
      <polyline
        ref={lineRef}
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.65}
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} opacity={0.9} />
    </svg>
  );
}
