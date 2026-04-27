'use client';

// Phase 7.7a (7.7.10) — sensitivity tornado for the Returns card.
//
// Pure-SVG horizontal bar chart. No Chart.js dependency since the chart is
// trivially geometric and we want sub-pixel control over the bar baselines.
// Color rule (P1): positive IRR deltas in mint, negative in coral — data
// state, not editorial valence ("more IRR" is just a data direction).
//
// Phase 7.7e — per-bar hover wired through the unified ChartTooltip primitive
// (label as headline since this chart has no time axis; absolute IRR shown as
// a secondary row).

import {
  buildTornadoBars,
  tornadoAxisExtent,
  type MatrixRow,
} from '@/app/lib/sensitivity';
import { ChartTooltip, useChartTooltipState } from '@/app/components/primitives';

interface ScenarioInput {
  project_irr?: number | null;
}

interface RevenueSensitivityTornadoProps {
  matrix: ReadonlyArray<MatrixRow>;
  scenarios?: { conservative?: ScenarioInput; stress?: ScenarioInput };
  /** Container width in CSS pixels; defaults to 360. */
  width?: number;
  /** Per-bar row height in CSS pixels; defaults to 22. */
  rowHeight?: number;
}

const LABEL_COL = 110;        // pixel width reserved for the row label
const BAR_GUTTER = 8;          // pixels between the label column and the chart
const VALUE_COL = 56;          // pixel width reserved for the trailing value text

export function RevenueSensitivityTornado({
  matrix,
  scenarios,
  width = 360,
  rowHeight = 22,
}: RevenueSensitivityTornadoProps) {
  const bars = buildTornadoBars(matrix, scenarios);
  if (!bars.length) {
    return (
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)', padding: '12px 0' }}>
        Insufficient sensitivity data
      </div>
    );
  }

  const extent = tornadoAxisExtent(bars);
  const chartLeft = LABEL_COL + BAR_GUTTER;
  const chartRight = width - VALUE_COL;
  const chartW = chartRight - chartLeft;
  const zeroX = chartLeft + chartW / 2;
  const ppToPx = (chartW / 2) / extent;
  const height = rowHeight * bars.length + 24;  // header + bars

  const tt = useChartTooltipState();

  return (
    <div onMouseLeave={() => tt.hide()}>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 6 }}>
        Sensitivity tornado · Δ Project IRR vs base
      </div>
      <svg width={width} height={height}
        role="img" aria-label="IRR sensitivity tornado chart"
        style={{ display: 'block', overflow: 'visible' }}>
        {/* Zero axis */}
        <line x1={zeroX} y1={20} x2={zeroX} y2={height - 4}
          stroke="var(--border-card)" strokeWidth={1} />

        {/* Axis labels */}
        <text x={chartLeft} y={14}
          fill="var(--text-muted)" fontSize={9}
          fontFamily="var(--font-mono)">
          −{extent.toFixed(0)} pp
        </text>
        <text x={chartRight} y={14} textAnchor="end"
          fill="var(--text-muted)" fontSize={9}
          fontFamily="var(--font-mono)">
          +{extent.toFixed(0)} pp
        </text>

        {bars.map((b, i) => {
          const yTop = 20 + i * rowHeight;
          const barH = rowHeight - 8;
          const barLen = Math.abs(b.deltaPp) * ppToPx;
          const isPos = b.deltaPp >= 0;
          const x = isPos ? zeroX : zeroX - barLen;
          const fill = isPos ? 'var(--mint)' : 'var(--coral)';
          return (
            <g key={`${b.dimension}-${b.label}`}>
              <text x={LABEL_COL} y={yTop + barH * 0.75} textAnchor="end"
                fill="var(--text-secondary)" fontSize={11}
                fontFamily="var(--font-mono)">
                {b.label}
              </text>
              <rect
                x={x} y={yTop + 2}
                width={Math.max(0.5, barLen)} height={barH}
                fill={fill} opacity={0.85} rx={1}
                onMouseEnter={(e) => tt.show({
                  label: b.label,
                  value: b.deltaPp,
                  unit: 'pp',
                  secondary: [{ label: 'Project IRR', value: b.absoluteIrr * 100, unit: '%' }],
                }, e.clientX, e.clientY)}
                onMouseMove={(e) => tt.show({
                  label: b.label,
                  value: b.deltaPp,
                  unit: 'pp',
                  secondary: [{ label: 'Project IRR', value: b.absoluteIrr * 100, unit: '%' }],
                }, e.clientX, e.clientY)}
              />
              <text
                x={isPos ? chartRight : chartLeft}
                y={yTop + barH * 0.75}
                textAnchor={isPos ? 'end' : 'start'}
                fill={isPos ? 'var(--mint)' : 'var(--coral)'}
                fontSize={10}
                fontFamily="var(--font-mono)">
                {b.deltaPp >= 0 ? '+' : ''}{b.deltaPp.toFixed(1)} pp
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
        fontFamily: 'var(--font-mono)', marginTop: 4 }}>
        Base: mid CAPEX · COD 2028 · base scenario
      </div>
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

export default RevenueSensitivityTornado;
