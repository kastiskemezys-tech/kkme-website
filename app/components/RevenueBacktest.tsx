'use client';

// Phase 7.7a (7.7.12) — backtest 13-month chart for the Returns card.
//
// Highest credibility-per-pixel viz on the page: realised €/MW/day per
// month over the trailing 13 months, with a horizontal reference line
// at the modeled Y1 daily average. Mean error vs the model is shown in
// the caption — the trust anchor.
//
// X-axis convention: months in EET (Baltic local time), as the worker's
// trailing window aligns to local-calendar months.

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { useChartColors, CHART_FONT, useTooltipStyle } from '@/app/lib/chartTheme';
import { ChartTooltipPortal, useChartTooltipState } from '@/app/components/primitives';
import { buildExternalTooltipHandler } from '@/app/lib/chartTooltip';
import {
  backtestStats,
  backtestAxisRange,
  formatBacktestMonth,
  type BacktestRow,
} from '@/app/lib/backtest';

interface RevenueBacktestProps {
  rows: ReadonlyArray<BacktestRow>;
  /** Modeled Y1 daily revenue in €/MW/day; rendered as a horizontal reference. */
  modeledY1Daily?: number | null;
  /** Active engine scenario (e.g. "base", "conservative"); named in caption. */
  scenario?: string;
}

export function RevenueBacktest({ rows, modeledY1Daily, scenario }: RevenueBacktestProps) {
  const CC = useChartColors();
  const stats = backtestStats(rows, modeledY1Daily);
  const tt = useChartTooltipState();
  // Memo dep is upstream `rows` only.
  const externalHandler = useMemo(
    () => buildExternalTooltipHandler(tt.setState, (point, title) => {
      const r = rows[point.dataIndex ?? 0];
      return {
        label: title ?? formatBacktestMonth(r?.month ?? ''),
        value: typeof point.parsed?.y === 'number' ? point.parsed.y : 0,
        unit: '€/MW/day',
        secondary: r ? [
          { label: 'Sample', value: `${r.days}d` },
          { label: 'S1 capture', value: r.s1_capture, unit: '€/MWh' },
        ] : undefined,
      };
    }),
    [tt.setState, rows],
  );
  const externalTooltip = useTooltipStyle(CC, { external: externalHandler });

  if (!stats.count) {
    return (
      <div>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 6 }}>
          Back-test · last 13 months · realised vs predicted
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', padding: '12px 0' }}>
          Insufficient history
        </div>
      </div>
    );
  }

  const { min, max } = backtestAxisRange(rows, modeledY1Daily);

  const data = {
    labels: rows.map(r => formatBacktestMonth(r.month)),
    datasets: [{
      label: 'Realised',
      data: rows.map(r => r.total_daily),
      borderColor: CC.teal,
      backgroundColor: CC.fillTeal,
      borderWidth: 1.5,
      pointRadius: 2,
      tension: 0.25,
      fill: false,
    }],
  };

  // Reference-line plugin draws the modeled Y1 horizontal at modeledY1Daily.
  const refLine = {
    id: 'backtest-modeled-line',
    afterDraw(chart: any) {
      if (modeledY1Daily == null) return;
      const { ctx, scales } = chart;
      const yPx = scales.y.getPixelForValue(modeledY1Daily);
      if (!Number.isFinite(yPx)) return;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = CC.amber;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(scales.x.left, yPx);
      ctx.lineTo(scales.x.right, yPx);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = CC.amber;
      ctx.font = `9px ${CHART_FONT.family}`;
      ctx.textAlign = 'right';
      ctx.fillText(`Y1 model €${Math.round(modeledY1Daily)}`, scales.x.right - 4, yPx - 3);
      ctx.restore();
    },
  };

  const options: any = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: externalTooltip,
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          autoSkip: true, maxTicksLimit: 7 },
      },
      y: {
        min, max,
        grid: { color: CC.grid, lineWidth: 0.5 },
        border: { display: false },
        ticks: { color: CC.textMuted, font: { family: CHART_FONT.family, size: 9 },
          callback: (v: number | string) => '€' + Number(v).toFixed(0) },
      },
    },
  };

  // Two-line caption: line 1 names the dashed line as the Y1 model anchor;
  // line 2 reports realised tracking with sign-bearing % AND MAE (magnitude),
  // with a tail that flips between "intentionally conservative" (realised >
  // model) and amber-styled "recalibration triggered" (realised < model).
  const haveStats =
    modeledY1Daily != null &&
    Number.isFinite(modeledY1Daily) &&
    stats.meanErrorPct != null &&
    stats.mae != null;
  const aboveModel = haveStats && (stats.meanErrorPct as number) >= 0;
  const signedPct = haveStats
    ? `${(stats.meanErrorPct as number) >= 0 ? '+' : ''}${(stats.meanErrorPct as number).toFixed(1)}`
    : '';
  const scenarioLabel = scenario ?? 'base';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
          letterSpacing: '0.08em' }}>
          Back-test · last 13 months · realised vs predicted
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)' }}>
          n={stats.count} months · {stats.totalDays}d
        </div>
      </div>
      <div style={{ height: 160 }}>
        <Line data={data} plugins={[refLine]} options={options} />
      </div>
      {haveStats ? (
        <div style={{ marginTop: 4, fontSize: 'var(--font-xs)', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: 'var(--text-muted)' }}>
            Dashed: Y1 model anchor — €{Math.round(modeledY1Daily as number)}/MW/day,
            scenario &ldquo;{scenarioLabel}&rdquo;, conservative bias.
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Realised tracked {signedPct}% {aboveModel ? 'above' : 'below'} model · MAE €
            {Math.round(stats.mae as number)}/MW/day over {stats.count} months ·{' '}
            {aboveModel ? (
              <span>Model intentionally conservative.</span>
            ) : (
              <span style={{ color: 'var(--warning)' }}>
                Model overshooting realised — recalibration triggered.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)',
          fontFamily: 'var(--font-mono)', marginTop: 4 }}>
          Backtest data not yet available.
        </div>
      )}
      <ChartTooltipPortal tt={tt} />
    </div>
  );
}

export default RevenueBacktest;
