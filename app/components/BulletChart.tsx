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
  const h = 20;
  const barH = 8;
  const barY = (h - barH) / 2;

  const toX = (v: number) => Math.max(0, Math.min(width, ((v - min) / (max - min)) * width));
  const valueX = toX(value);
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);

  return (
    <div style={{ fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
      <div
        style={{
          fontSize: '0.65rem',
          color: 'rgba(232,226,217,0.60)',
          marginBottom: '3px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'rgba(232,226,217,0.85)' }}>
          {value.toFixed(1)} {unit}
        </span>
      </div>

      <svg
        width={width}
        height={h + 10}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Background ranges */}
        {sorted.map((t, i) => {
          const x1 = i === 0 ? 0 : toX(sorted[i - 1].value);
          const x2 = toX(t.value);
          return (
            <rect
              key={`range-${i}`}
              x={x1}
              y={barY}
              width={Math.max(0, x2 - x1)}
              height={barH}
              fill={t.color}
              opacity={0.18}
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
        />

        {/* Threshold ticks */}
        {sorted.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={toX(t.value)} y1={barY - 2}
              x2={toX(t.value)} y2={barY + barH + 2}
              stroke="rgba(232,226,217,0.18)"
              strokeWidth="0.5"
            />
            <text
              x={toX(t.value)}
              y={barY + barH + 9}
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill="rgba(232,226,217,0.28)"
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
          fill="rgba(232,226,217,0.62)"
        />

        {/* Current value marker */}
        <rect
          x={valueX - 1}
          y={barY - 3}
          width={2}
          height={barH + 6}
          rx="1"
          fill="white"
        />
      </svg>
    </div>
  );
}
