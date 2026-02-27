const ICONS: Record<string, string[]> = {
  'price-separation': [
    '  ╱─────╲  ',
    ' ╱  ···  ╲ ',
    '│·· ╌──╌ ··│',
    '│ ·· ╌╌ ·· │',
    ' ╲  ···  ╱ ',
    '  ╲─────╱  ',
  ],
  'balancing': [
    '           ',
    ' ╭─╮   ╭─╮',
    '─╯  ╰─╯  ╰',
    '     ↑     ',
    '    FCR    ',
    '           ',
  ],
  'battery-cost': [
    ' ┌───┬──┐  ',
    ' │▓▓▓│▒▒│  ',
    ' │▓▓▓│░░│  ',
    ' │▓▓▓│  │  ',
    ' └───┴──┘  ',
    '  €/kWh    ',
  ],
  'grid': [
    ' ─┬─ ─┬─  ',
    '  │   │   ',
    '──◉───◉── ',
    '  │   │   ',
    ' ─┴─ ─┴─  ',
    '    MW     ',
  ],
  'dc-power': [
    ' ┌────────┐',
    ' │▐██████▌│',
    ' │▐▒▒▒▒▒▒▌│',
    ' │▐██████▌│',
    ' │· · · ·│',
    ' └────────┘',
  ],
  'hydro': [
    '  ╭──────╮ ',
    '  │░░░░░░│ ',
    '  │▓▓▓▓▓▓│ ',
    '  │██████│ ',
    '  ╰──┬───╯ ',
    '     ▼     ',
  ],
  'gas': [
    '    ╭╮     ',
    '   ╭╯╰╮    ',
    '  ╭╯  ╰╮   ',
    '  │╲  ╱│   ',
    '  ╰─╲╱─╯   ',
    '   TTF     ',
  ],
  'flows': [
    '  LT       ',
    '  ◉        ',
    ' ←│→       ',
    '  │ SE4·PL ',
    '  ◉─→◉─→◉  ',
    '           ',
  ],
  'carbon': [
    '  ○─◉─○    ',
    ' ╱  │  ╲   ',
    '○   │   ○  ',
    ' ╲  │  ╱   ',
    '  ○─◉─○    ',
    '   EUA     ',
  ],
};

interface SignalIconProps {
  type: keyof typeof ICONS;
  size?: number;
  dim?: boolean;
}

export function SignalIcon({ type, size = 48, dim = false }: SignalIconProps) {
  const lines = ICONS[type] ?? ICONS['grid'];
  const id = `${type}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`clip-${id}`}>
          <circle cx="24" cy="24" r="23" />
        </clipPath>
        <radialGradient id={`bg-${id}`} cx="70%" cy="70%" r="50%">
          <stop offset="0%" stopColor="#1a3a6b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#07070a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background */}
      <circle cx="24" cy="24" r="23" fill="#07070a" opacity={dim ? 0.5 : 1} />

      {/* Blue glow */}
      <circle cx="24" cy="24" r="23" fill={`url(#bg-${id})`} />

      {/* Star dots */}
      {[[8,6],[38,10],[42,32],[12,40],[35,42],[5,28],[44,18],[20,4],[30,46]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="0.5" fill="white" opacity="0.35" />
      ))}

      {/* ASCII art */}
      <g clipPath={`url(#clip-${id})`}>
        {lines.map((line, i) => (
          <text
            key={i}
            x="24"
            y={10 + i * 7}
            textAnchor="middle"
            fontFamily="'DM Mono', monospace"
            fontSize="5.5"
            fill="white"
            opacity={dim ? 0.4 : 0.82}
          >
            {line}
          </text>
        ))}
      </g>

      {/* Border */}
      <circle
        cx="24" cy="24" r="22.5"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        opacity={dim ? 0.12 : 0.28}
      />
    </svg>
  );
}
