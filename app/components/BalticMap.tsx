'use client';

import { useEffect, useRef } from 'react';
import { animateArc } from '@/lib/animations';

function project(lon: number, lat: number): [number, number] {
  const x = ((lon - 13.5) / 14.5) * 400;
  const y = ((62 - lat) / 8.5) * 300;
  return [parseFloat(x.toFixed(1)), parseFloat(y.toFixed(1))];
}

function toPath(coords: [number, number][]): string {
  return (
    coords.map((c, i) => {
      const [x, y] = project(c[0], c[1]);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ') + 'Z'
  );
}

const COUNTRIES: Record<string, [number, number][]> = {
  LT: [
    [20.9, 56.4], [21.7, 57.0], [22.8, 57.0],
    [23.5, 56.8], [24.9, 56.4], [25.8, 56.0],
    [26.6, 55.7], [26.5, 54.7], [25.5, 54.2],
    [24.0, 53.9], [23.5, 53.9], [22.8, 54.4],
    [21.3, 55.2], [20.9, 55.5], [20.9, 56.4],
  ],
  LV: [
    [20.9, 57.0], [21.7, 57.0], [22.8, 57.1],
    [23.8, 57.1], [24.9, 57.0], [25.8, 56.8],
    [26.6, 55.7], [26.6, 56.8], [27.3, 57.5],
    [27.8, 57.8], [27.5, 58.1], [26.5, 58.1],
    [24.5, 57.8], [23.0, 57.6], [21.5, 57.4],
    [20.9, 57.3], [20.9, 57.0],
  ],
  EE: [
    [21.5, 57.4], [23.0, 57.6], [24.5, 57.8],
    [26.5, 58.1], [27.5, 58.1], [28.0, 58.5],
    [27.9, 59.5], [27.0, 59.6], [25.5, 59.6],
    [24.0, 59.3], [23.0, 59.0], [22.0, 58.8],
    [21.0, 58.3], [21.5, 57.4],
  ],
  SE4: [
    [13.5, 55.4], [14.0, 55.4], [14.5, 55.5],
    [14.5, 56.5], [14.0, 57.5], [13.5, 58.0],
    [13.0, 58.5], [12.5, 58.0], [12.3, 57.0],
    [12.5, 56.0], [13.0, 55.4], [13.5, 55.4],
  ],
  PL: [
    [14.1, 54.2], [16.0, 54.2], [18.0, 54.4],
    [19.5, 54.4], [21.5, 54.4], [23.0, 54.0],
    [24.0, 53.9], [23.5, 53.9], [22.8, 53.9],
    [20.0, 53.9], [18.0, 53.7], [16.0, 53.5],
    [14.6, 53.9], [14.1, 54.2],
  ],
};

const LOCATIONS: Record<string, [number, number]> = {
  Vilnius:  [25.28, 54.68],
  Riga:     [24.10, 56.95],
  Tallinn:  [24.75, 59.44],
  SE4_node: [14.20, 57.50],
  PL_node:  [20.00, 54.00],
};

interface BalticMapProps {
  nordbalt_mw?:  number | null;
  nordbalt_dir?: string | null;
  litpol_mw?:    number | null;
  litpol_dir?:   string | null;
  free_mw?:      number | null;
  view?:         'bess' | 'dc';
  compact?:      boolean;
}

export function BalticMap({
  nordbalt_mw,
  nordbalt_dir,
  litpol_mw,
  litpol_dir,
  free_mw,
  view = 'bess',
  compact = false,
}: BalticMapProps) {
  const nbRef = useRef<SVGPathElement>(null);
  const lpRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    animateArc(nbRef.current, 2500);
    animateArc(lpRef.current, 3200);
  }, [nordbalt_mw, litpol_mw]);

  const nbThick = nordbalt_mw ? Math.max(1, Math.min(5, Math.abs(nordbalt_mw) / 200)) : 1.5;
  const lpThick = litpol_mw  ? Math.max(1, Math.min(5, Math.abs(litpol_mw) / 200))  : 1.5;

  // 'EXPORTING' means LT exports → outbound flow
  const nbExport = nordbalt_dir === 'EXPORTING' || nordbalt_dir === 'LT_exports';
  const lpExport = litpol_dir  === 'EXPORTING' || litpol_dir  === 'LT_exports';

  const ltNode  = project(25.28, 54.68);
  const se4Node = project(14.20, 57.50);
  const plNode  = project(20.00, 54.00);

  function arc(from: [number, number], to: [number, number], bend = -40): string {
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2 + bend;
    return `M${from[0]},${from[1]} Q${mx},${my} ${to[0]},${to[1]}`;
  }

  const maxW = compact ? 280 : 400;

  return (
    <div
      style={{
        background: 'rgba(7,7,10,0.85)',
        border: '1px solid rgba(232,226,217,0.07)',
        borderRadius: '4px',
        padding: compact ? '6px' : '8px',
      }}
    >

      <svg viewBox="0 0 400 300" style={{ width: '100%', maxWidth: `${maxW}px`, display: 'block' }}>
        <defs>
          <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(74,222,128,0.75)" />
          </marker>
          <marker id="arrow-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(245,158,11,0.75)" />
          </marker>
          <filter id="map-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="lt-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {/* Star field */}
        {Array.from({ length: 18 }, (_, i) => ({
          x: (i * 47 + 13) % 390,
          y: (i * 31 + 7) % 290,
        })).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r="0.6" fill="white" opacity="0.12" />
        ))}

        {/* Country fills */}
        {Object.entries(COUNTRIES).map(([id, coords]) => (
          <path
            key={id}
            d={toPath(coords)}
            fill={
              id === 'LT'
                ? 'rgba(123,94,167,0.15)'
                : id === 'SE4'
                  ? 'rgba(74,222,128,0.05)'
                  : 'rgba(232,226,217,0.04)'
            }
            stroke={id === 'LT' ? 'rgba(123,94,167,0.45)' : 'rgba(232,226,217,0.13)'}
            strokeWidth={id === 'LT' ? 0.8 : 0.5}
          />
        ))}

        {/* NordBalt arc */}
        <path
          ref={nbRef}
          className="flow-arc"
          d={arc(ltNode, se4Node, -35)}
          fill="none"
          stroke={nbExport ? 'rgba(74,222,128,0.55)' : 'rgba(245,158,11,0.55)'}
          strokeWidth={nbThick}
          strokeDasharray={!nordbalt_mw ? '4,4' : undefined}
          markerEnd={`url(#arrow-${nbExport ? 'green' : 'amber'})`}
          filter="url(#map-glow)"
        />

        {/* LitPol arc */}
        <path
          ref={lpRef}
          className="flow-arc"
          d={arc(ltNode, plNode, 28)}
          fill="none"
          stroke={lpExport ? 'rgba(74,222,128,0.55)' : 'rgba(245,158,11,0.55)'}
          strokeWidth={lpThick}
          strokeDasharray={!litpol_mw ? '4,4' : undefined}
          markerEnd={`url(#arrow-${lpExport ? 'green' : 'amber'})`}
          filter="url(#map-glow)"
        />

        {/* LT ambient glow ring */}
        <circle cx={ltNode[0]} cy={ltNode[1]} r={42} fill="rgba(45,212,168,0.06)" filter="url(#lt-glow)" />

        {/* City nodes */}
        {Object.entries(LOCATIONS).map(([name, coords]) => {
          const [x, y] = project(coords[0], coords[1]);
          const isLT = name === 'Vilnius';
          const label = name === 'SE4_node' ? 'SE4' : name === 'PL_node' ? 'PL' : name;
          return (
            <g key={name}>
              {isLT && (
                <circle cx={x} cy={y} r={8} fill="none" stroke="rgba(123,94,167,0.22)" strokeWidth="1" />
              )}
              <circle
                cx={x} cy={y}
                r={isLT ? 4 : 2.5}
                fill={isLT ? 'rgba(123,94,167,0.9)' : 'rgba(232,226,217,0.38)'}
              />
              <text x={x + 6} y={y + 1} fontFamily="var(--font-mono)" fontSize="10" fill="rgba(232,226,217,0.55)">
                {label}
              </text>
            </g>
          );
        })}

        {/* DC view overlay */}
        {view === 'dc' && (
          <text
            x={ltNode[0]} y={ltNode[1] - 22}
            textAnchor="middle"
            fontFamily="var(--font-mono)" fontSize="7"
            fill={free_mw != null && free_mw > 2000 ? 'rgba(86,166,110,0.85)' : 'rgba(204,160,72,0.85)'}
          >
            {free_mw != null ? (free_mw > 2000 ? 'DC: OPEN' : 'DC: TIGHT') : 'DC VIEW'}
          </text>
        )}

        {/* LT free MW badge */}
        {free_mw != null && (
          <g transform={`translate(${ltNode[0] - 20},${ltNode[1] + 8})`}>
            <rect width="46" height="14" rx="2" fill="rgba(7,7,10,0.9)" stroke="rgba(123,94,167,0.38)" strokeWidth="0.5" />
            <text x="23" y="10" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6" fill="rgba(74,222,128,0.85)">
              {(free_mw / 1000).toFixed(1)}GW free
            </text>
          </g>
        )}

        {/* Arc labels with MW */}
        <text
          x={project(18.5, 57.0)[0]} y={project(18.5, 57.0)[1]}
          fontFamily="var(--font-mono)" fontSize="8"
          fill="rgba(232,226,217,0.40)" textAnchor="middle"
        >
          NordBalt{nordbalt_mw ? ` ${Math.abs(nordbalt_mw).toFixed(0)} MW` : ''}
        </text>
        <text
          x={project(22.5, 54.3)[0]} y={project(22.5, 54.3)[1] + 12}
          fontFamily="var(--font-mono)" fontSize="8"
          fill="rgba(232,226,217,0.40)" textAnchor="middle"
        >
          LitPol{litpol_mw ? ` ${Math.abs(litpol_mw).toFixed(0)} MW` : ''}
        </text>
      </svg>
    </div>
  );
}
