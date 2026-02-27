'use client';

import { useEffect } from 'react';
import { animateArc } from '@/lib/animations';

// Web Mercator (EPSG:3857) projection bounded to Baltic region
function project(
  lon: number,
  lat: number,
  width = 400,
  height = 300,
): [number, number] {
  const minLon = 10.5, maxLon = 28.5;  // extended west so SE4 is visible
  const minLat = 53.5, maxLat = 60.5;

  const latRad    = (lat    * Math.PI) / 180;
  const minLatRad = (minLat * Math.PI) / 180;
  const maxLatRad = (maxLat * Math.PI) / 180;

  const mercY    = Math.log(Math.tan(Math.PI / 4 + latRad    / 2));
  const minMercY = Math.log(Math.tan(Math.PI / 4 + minLatRad / 2));
  const maxMercY = Math.log(Math.tan(Math.PI / 4 + maxLatRad / 2));

  const x = ((lon - minLon) / (maxLon - minLon)) * width;
  const y = ((maxMercY - mercY) / (maxMercY - minMercY)) * height;

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

// Verified Natural Earth simplified outlines
const COUNTRIES: Record<string, [number, number][]> = {
  // Estonia
  EE: [
    [23.34, 59.61], [24.60, 59.47], [26.06, 59.45],
    [27.90, 59.52], [28.21, 59.00], [27.98, 58.53],
    [27.35, 57.82], [26.46, 57.63], [25.60, 57.91],
    [24.32, 57.88], [23.34, 58.34], [22.08, 58.46],
    [21.46, 58.02], [21.63, 57.52], [22.70, 57.38],
    [23.20, 57.70], [23.34, 58.20], [23.34, 59.61],
  ],
  // Latvia
  LV: [
    [21.06, 57.04], [22.00, 56.97], [22.70, 57.38],
    [23.20, 57.70], [23.34, 58.20], [24.32, 57.88],
    [25.60, 57.91], [26.46, 57.63], [27.35, 57.82],
    [27.88, 57.47], [28.18, 56.74], [27.52, 56.11],
    [26.59, 55.67], [25.37, 56.16], [24.86, 56.37],
    [24.11, 56.26], [23.49, 56.34], [22.08, 56.40],
    [21.06, 56.79], [21.06, 57.04],
  ],
  // Lithuania
  LT: [
    [21.06, 56.79], [22.08, 56.40], [23.49, 56.34],
    [24.11, 56.26], [24.86, 56.37], [25.37, 56.16],
    [26.59, 55.67], [26.59, 54.97], [25.68, 54.57],
    [24.45, 53.90], [23.48, 53.97], [22.73, 54.36],
    [22.73, 54.96], [22.03, 55.10], [21.46, 55.18],
    [21.06, 55.84], [20.95, 56.27], [21.06, 56.79],
  ],
  // SE4 — southernmost Sweden, extended to ~10.96°E
  SE4: [
    [10.96, 55.35], [12.26, 55.35], [12.96, 55.70],
    [13.60, 56.00], [14.32, 56.35], [14.67, 56.80],
    [14.18, 57.30], [13.60, 58.20], [12.85, 58.60],
    [11.75, 58.06], [11.12, 57.51], [10.96, 56.60],
    [10.96, 55.80], [10.96, 55.35],
  ],
  // Poland — northern strip only
  PL: [
    [14.12, 53.88], [15.02, 53.80], [17.00, 54.46],
    [18.62, 54.68], [19.60, 54.45], [20.89, 54.44],
    [22.77, 54.36], [23.48, 53.97], [24.45, 53.90],
    [23.50, 53.20], [22.00, 53.10], [20.00, 53.00],
    [18.00, 53.15], [16.00, 53.40], [14.55, 53.45],
    [14.12, 53.88],
  ],
};

// Verified city / node locations
const LOCATIONS: Record<string, [number, number]> = {
  Vilnius: [25.28, 54.69],
  Riga:    [24.10, 56.95],
  Tallinn: [24.75, 59.44],
  SE4:     [13.50, 56.80],
  PL:      [19.50, 54.20],
};

// Per-country fill and stroke
const COUNTRY_STYLE: Record<string, { fill: string; stroke: string; strokeWidth: number }> = {
  LT:  { fill: 'rgba(123,94,167,0.15)',  stroke: 'rgba(123,94,167,0.50)', strokeWidth: 0.8 },
  LV:  { fill: 'rgba(232,226,217,0.04)', stroke: 'rgba(232,226,217,0.15)', strokeWidth: 0.4 },
  EE:  { fill: 'rgba(232,226,217,0.04)', stroke: 'rgba(232,226,217,0.15)', strokeWidth: 0.4 },
  SE4: { fill: 'rgba(74,222,128,0.06)',  stroke: 'rgba(232,226,217,0.15)', strokeWidth: 0.4 },
  PL:  { fill: 'rgba(232,226,217,0.03)', stroke: 'rgba(232,226,217,0.15)', strokeWidth: 0.4 },
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
  // Direction: true = LT is exporting outward
  const nbLTExports = nordbalt_dir === 'LT_exports' || nordbalt_dir === 'EXPORTING';
  const lpLTExports = litpol_dir  === 'LT_exports' || litpol_dir  === 'EXPORTING';

  const nbThick = nordbalt_mw ? Math.max(1, Math.min(5, Math.abs(nordbalt_mw) / 200)) : 1.5;
  const lpThick = litpol_mw  ? Math.max(1, Math.min(5, Math.abs(litpol_mw)  / 200)) : 1.5;

  // Projected node positions
  const ltNode  = project(25.28, 54.69);
  const se4Node = project(13.50, 56.80);
  const plNode  = project(19.50, 54.20);

  // Arc label positions (geographic midpoints, slightly displaced)
  const nbLabelPos = project(19.8, 57.2);
  const lpLabelPos = project(22.5, 54.0);

  // Direction-aware animation — runs whenever direction or magnitude changes
  useEffect(() => {
    const nbPath = document.getElementById('nb-arc') as SVGPathElement | null;
    const lpPath = document.getElementById('lp-arc') as SVGPathElement | null;

    if (nbPath) {
      animateArc(nbPath, nbLTExports ? 'forward' : 'reverse', 2500);
    }
    if (lpPath) {
      animateArc(lpPath, lpLTExports ? 'forward' : 'reverse', 3000);
    }
  }, [nordbalt_mw, litpol_mw, nordbalt_dir, litpol_dir, nbLTExports, lpLTExports]);

  // Quadratic Bézier arc helper
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
          {/* markerEnd — arrow at the END of the path (used for LT exports) */}
          <marker id="arrow-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(74,222,128,0.80)" />
          </marker>
          <marker id="arrow-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(245,158,11,0.80)" />
          </marker>

          {/* markerStart — arrow at the START (LT end) reversed (used for LT imports) */}
          <marker id="arrow-start-green" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(74,222,128,0.80)" />
          </marker>
          <marker id="arrow-start-amber" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <path d="M0,0 L0,6 L6,3 z" fill="rgba(245,158,11,0.80)" />
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
        {Object.entries(COUNTRIES).map(([id, coords]) => {
          const style = COUNTRY_STYLE[id] ?? COUNTRY_STYLE.LV;
          return (
            <path
              key={id}
              d={toPath(coords)}
              fill={style.fill}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
            />
          );
        })}

        {/* NordBalt arc — LT ↔ SE4 (west)
            exports (green):  forward dashes + arrow at SE4 end (markerEnd)
            imports (amber):  reverse dashes + arrow at LT end  (markerStart) */}
        <path
          id="nb-arc"
          d={arc(ltNode, se4Node, -35)}
          fill="none"
          stroke={nbLTExports ? 'rgba(74,222,128,0.60)' : 'rgba(245,158,11,0.60)'}
          strokeWidth={nbThick}
          strokeDasharray={!nordbalt_mw ? '4,4' : undefined}
          markerEnd={nbLTExports ? 'url(#arrow-green)' : undefined}
          markerStart={!nbLTExports ? 'url(#arrow-start-amber)' : undefined}
          filter="url(#map-glow)"
        />

        {/* LitPol arc — LT ↔ PL (south-west)
            exports (green):  forward dashes + arrow at PL end
            imports (amber):  reverse dashes + arrow at LT end */}
        <path
          id="lp-arc"
          d={arc(ltNode, plNode, 22)}
          fill="none"
          stroke={lpLTExports ? 'rgba(74,222,128,0.60)' : 'rgba(245,158,11,0.60)'}
          strokeWidth={lpThick}
          strokeDasharray={!litpol_mw ? '4,4' : undefined}
          markerEnd={lpLTExports ? 'url(#arrow-green)' : undefined}
          markerStart={!lpLTExports ? 'url(#arrow-start-amber)' : undefined}
          filter="url(#map-glow)"
        />

        {/* LT ambient glow ring */}
        <circle cx={ltNode[0]} cy={ltNode[1]} r={42} fill="rgba(45,212,168,0.06)" filter="url(#lt-glow)" />

        {/* City nodes */}
        {Object.entries(LOCATIONS).map(([name, coords]) => {
          const [x, y] = project(coords[0], coords[1]);
          const isLT = name === 'Vilnius';
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
              <text
                x={x + 6} y={y + 1}
                fontFamily="var(--font-mono)" fontSize="10"
                fill="rgba(232,226,217,0.55)"
              >
                {name}
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
          <g transform={`translate(${ltNode[0] - 23},${ltNode[1] + 8})`}>
            <rect width="50" height="14" rx="2" fill="rgba(7,7,10,0.9)" stroke="rgba(123,94,167,0.38)" strokeWidth="0.5" />
            <text x="25" y="10" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6" fill="rgba(74,222,128,0.85)">
              {(free_mw / 1000).toFixed(1)} GW free
            </text>
          </g>
        )}

        {/* Arc labels with MW values */}
        <text
          x={nbLabelPos[0]} y={nbLabelPos[1]}
          fontFamily="var(--font-mono)" fontSize="8"
          fill="rgba(232,226,217,0.40)" textAnchor="middle"
        >
          NordBalt{nordbalt_mw ? ` ${Math.abs(nordbalt_mw).toFixed(0)} MW` : ''}
        </text>
        <text
          x={lpLabelPos[0]} y={lpLabelPos[1] + 12}
          fontFamily="var(--font-mono)" fontSize="8"
          fill="rgba(232,226,217,0.40)" textAnchor="middle"
        >
          LitPol{litpol_mw ? ` ${Math.abs(litpol_mw).toFixed(0)} MW` : ''}
        </text>
      </svg>
    </div>
  );
}
