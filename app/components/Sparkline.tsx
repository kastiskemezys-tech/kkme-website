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

  const pts = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * width;
    return { x: parseFloat(x.toFixed(1)), y: parseFloat(toY(v).toFixed(1)) };
  });

  const points = pts.map(p => `${p.x},${p.y}`).join(' ');

  // Gradient fill area path
  const areaPath = [
    `M${pts[0].x},${height}`,
    ...pts.map(p => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${height}`,
    'Z',
  ].join(' ');

  const lastX  = pts[pts.length - 1].x;
  const lastY  = pts[pts.length - 1].y;
  const p50Y   = p50 !== undefined ? toY(p50) : null;
  const gradId = `sg-${width}-${height}`;

  return (
    <svg
      width={width}
      height={height}
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
          x1={0} y1={p50Y} x2={width} y2={p50Y}
          stroke="rgba(232,226,217,0.12)"
          strokeWidth={0.5}
          strokeDasharray="2,2"
        />
      )}

      {/* Gradient fill */}
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
    </svg>
  );
}
