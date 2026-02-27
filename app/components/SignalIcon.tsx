import React from 'react';

type IconType =
  | 'price-separation'
  | 'balancing'
  | 'battery-cost'
  | 'grid'
  | 'dc-power'
  | 'hydro'
  | 'gas'
  | 'flows'
  | 'carbon';

interface SignalIconProps {
  type: IconType;
  size?: number;
  dim?: boolean;
}

// 48×48 viewBox geometric icons
function IconPaths({ type, dim }: { type: IconType; dim: boolean }) {
  const o = dim ? 0.35 : 0.82;
  const s = dim ? 0.28 : 0.55;

  switch (type) {
    case 'price-separation':
      // Two lines diverging from center — spread visualization
      return (
        <>
          <line x1="10" y1="28" x2="24" y2="24" stroke="white" strokeWidth="1.5" opacity={o} />
          <line x1="24" y1="24" x2="38" y2="16" stroke="white" strokeWidth="1.5" opacity={o} />
          <line x1="10" y1="28" x2="38" y2="28" stroke="white" strokeWidth="0.5" opacity={s} strokeDasharray="2,3" />
          <circle cx="24" cy="24" r="2.5" fill="white" opacity={o} />
          <polygon points="38,13 35,19 41,19" fill="white" opacity={o} />
        </>
      );
    case 'balancing':
      // Sine wave — frequency/balance signal
      return (
        <>
          <path
            d="M8,24 C12,16 16,16 20,24 S28,32 32,24 S40,16 44,24"
            fill="none" stroke="white" strokeWidth="1.5" opacity={o}
          />
          <line x1="24" y1="14" x2="24" y2="34" stroke="white" strokeWidth="0.5" opacity={s} strokeDasharray="2,2" />
          <circle cx="20" cy="24" r="1.5" fill="white" opacity={s} />
          <circle cx="32" cy="24" r="1.5" fill="white" opacity={s} />
        </>
      );
    case 'battery-cost':
      // Battery with declining cost arrow
      return (
        <>
          <rect x="9" y="18" width="28" height="14" rx="2" fill="none" stroke="white" strokeWidth="1.5" opacity={o} />
          <rect x="37" y="21" width="3" height="8" rx="1" fill="white" opacity={s} />
          <rect x="11" y="20" width="14" height="10" rx="1" fill="white" opacity={0.2} />
          <line x1="14" y1="36" x2="34" y2="36" stroke="white" strokeWidth="0.5" opacity={s} />
          <polyline points="16,40 24,34 32,38" fill="none" stroke="white" strokeWidth="1" opacity={s} />
          <polygon points="32,35 35,40 29,40" fill="white" opacity={s} />
        </>
      );
    case 'grid':
      // Central hub with four node connections
      return (
        <>
          <circle cx="24" cy="24" r="4.5" fill="none" stroke="white" strokeWidth="1.5" opacity={o} />
          <line x1="24" y1="9"  x2="24" y2="19" stroke="white" strokeWidth="1" opacity={s} />
          <line x1="24" y1="29" x2="24" y2="39" stroke="white" strokeWidth="1" opacity={s} />
          <line x1="9"  y1="24" x2="19" y2="24" stroke="white" strokeWidth="1" opacity={s} />
          <line x1="29" y1="24" x2="39" y2="24" stroke="white" strokeWidth="1" opacity={s} />
          <circle cx="24" cy="9"  r="2.5" fill="white" opacity={s} />
          <circle cx="24" cy="39" r="2.5" fill="white" opacity={s} />
          <circle cx="9"  cy="24" r="2.5" fill="white" opacity={s} />
          <circle cx="39" cy="24" r="2.5" fill="white" opacity={s} />
        </>
      );
    case 'dc-power':
      // Server rack with LED indicators
      return (
        <>
          <rect x="10" y="12" width="28" height="7"  rx="1" fill="none" stroke="white" strokeWidth="1.2" opacity={o} />
          <rect x="10" y="21" width="28" height="7"  rx="1" fill="none" stroke="white" strokeWidth="1.2" opacity={o} />
          <rect x="10" y="30" width="28" height="7"  rx="1" fill="none" stroke="white" strokeWidth="1.2" opacity={o} />
          <circle cx="35" cy="15.5" r="1.8" fill="white" opacity={0.65} />
          <circle cx="35" cy="24.5" r="1.8" fill="white" opacity={0.45} />
          <circle cx="35" cy="33.5" r="1.8" fill="white" opacity={0.65} />
          <rect x="13" y="14" width="16" height="3" rx="0.5" fill="white" opacity={0.12} />
          <rect x="13" y="23" width="16" height="3" rx="0.5" fill="white" opacity={0.12} />
          <rect x="13" y="32" width="16" height="3" rx="0.5" fill="white" opacity={0.12} />
        </>
      );
    case 'hydro':
      // Water reservoir container with fill level
      return (
        <>
          <rect x="13" y="10" width="22" height="26" rx="2" fill="none" stroke="white" strokeWidth="1.5" opacity={o} />
          <rect x="13" y="24" width="22" height="12" rx="0 0 2 2" fill="white" opacity={0.15} />
          <line x1="13" y1="24" x2="35" y2="24" stroke="white" strokeWidth="1" opacity={s} />
          <line x1="24" y1="36" x2="24" y2="41" stroke="white" strokeWidth="1.5" opacity={s} />
          <polygon points="24,44 21,40 27,40" fill="white" opacity={s} />
        </>
      );
    case 'gas':
      // Flame shape
      return (
        <>
          <path
            d="M24,38 C14,34 12,24 19,19 C17,26 22,26 21,20 C21,14 28,10 28,10 C23,20 32,22 27,31 C31,26 31,19 29,15 C38,22 38,34 24,38 Z"
            fill="none" stroke="white" strokeWidth="1.5" opacity={o}
          />
          <circle cx="24" cy="32" r="3" fill="white" opacity={0.18} />
        </>
      );
    case 'flows':
      // Directed graph: LT → SE4/PL
      return (
        <>
          <circle cx="13" cy="24" r="3.5" fill="none" stroke="white" strokeWidth="1.5" opacity={o} />
          <circle cx="35" cy="14" r="3"   fill="none" stroke="white" strokeWidth="1.2" opacity={s} />
          <circle cx="35" cy="34" r="3"   fill="none" stroke="white" strokeWidth="1.2" opacity={s} />
          <line x1="16.5" y1="22" x2="31.5" y2="16" stroke="white" strokeWidth="1" opacity={s} />
          <line x1="16.5" y1="26" x2="31.5" y2="32" stroke="white" strokeWidth="1" opacity={s} />
          <polygon points="32,14 28.5,17.5 31,20" fill="white" opacity={s} />
          <polygon points="32,34 28.5,30.5 31,28" fill="white" opacity={s} />
        </>
      );
    case 'carbon':
      // Hexagon — carbon credit/ETS
      return (
        <>
          <polygon
            points="24,10 35,17 35,31 24,38 13,31 13,17"
            fill="none" stroke="white" strokeWidth="1.5" opacity={o}
          />
          <polygon
            points="24,16 30,20 30,28 24,32 18,28 18,20"
            fill="white" opacity={0.08}
          />
          <line x1="24" y1="16" x2="24" y2="32" stroke="white" strokeWidth="0.5" opacity={s} />
          <line x1="13" y1="24" x2="35" y2="24" stroke="white" strokeWidth="0.5" opacity={s} />
        </>
      );
    default:
      return null;
  }
}

export function SignalIcon({ type, size = 48, dim = false }: SignalIconProps) {
  const id = `si-${type}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#7b5ea7" stopOpacity={dim ? 0.04 : 0.10} />
          <stop offset="100%" stopColor="#07070a" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Background circle */}
      <circle cx="24" cy="24" r="23" fill="#07070a" opacity={dim ? 0.5 : 1} />
      <circle cx="24" cy="24" r="23" fill={`url(#bg-${id})`} />

      {/* Star dust */}
      {[[8,6],[38,10],[42,32],[12,40],[35,42],[5,28],[44,18]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="0.5" fill="white" opacity={dim ? 0.12 : 0.28} />
      ))}

      {/* Geometric icon */}
      <IconPaths type={type} dim={dim} />

      {/* Border */}
      <circle
        cx="24" cy="24" r="22.5"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        opacity={dim ? 0.10 : 0.22}
      />
    </svg>
  );
}
