import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 7.7e — sitewide canary that every chart-bearing component on the site
// imports the unified ChartTooltip primitive (or routes its tooltip through
// the shared chartTooltip data contract). This is a static-text assertion: it
// catches regressions where a future edit reintroduces a bespoke `<title>` or
// inline tooltip div without the unified pattern. It does NOT assert runtime
// hover behavior — that's covered by per-component render tests + visual audit.

const ROOT = resolve(__dirname, '../../..');

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf-8');
}

describe('Sitewide ChartTooltip wiring (Phase 7.7e)', () => {
  // Group A — chart.js cards: each must import buildExternalTooltipHandler
  // and render <ChartTooltipPortal>.
  const chartJsCards = [
    'app/components/S1Card.tsx',
    'app/components/S2Card.tsx',
    'app/components/TradingEngineCard.tsx',
    'app/components/RevenueBacktest.tsx',
    'app/components/RevenueCard.tsx',
  ];

  for (const path of chartJsCards) {
    it(`${path} wires the chart.js external tooltip`, () => {
      const src = read(path);
      expect(src).toMatch(/buildExternalTooltipHandler/);
      expect(src).toMatch(/ChartTooltipPortal/);
    });
  }

  // Group B — inline-SVG primitives: each must use ChartTooltip + portal.
  const inlineSvg = [
    'app/components/Sparkline.tsx',
    'app/components/BulletChart.tsx',
    'app/components/RevenueSensitivityTornado.tsx',
    'app/components/primitives/CredibilityLadderBar.tsx',
    'app/components/primitives/RegimeBarometer.tsx',
    'app/components/primitives/DistributionTick.tsx',
  ];

  for (const path of inlineSvg) {
    it(`${path} renders ChartTooltip via the shared primitive`, () => {
      const src = read(path);
      expect(src).toMatch(/useChartTooltipState/);
      expect(src).toMatch(/<ChartTooltip[^P]/); // ChartTooltip but not ChartTooltipPortal alone
    });
  }

  // Group C — custom hover-div threshold bars (S7/S9): both must drop the
  // `showTip` boolean state in favour of useChartTooltipState.
  const customHover = [
    'app/components/S7Card.tsx',
    'app/components/S9Card.tsx',
  ];

  for (const path of customHover) {
    it(`${path} migrated showTip → useChartTooltipState`, () => {
      const src = read(path);
      expect(src).toMatch(/useChartTooltipState/);
      expect(src).not.toMatch(/setShowTip\(true\)/);
    });
  }

  // Group D — HeroBalticMap cable hover.
  it('app/components/HeroBalticMap.tsx wires cable hover via ChartTooltipPortal', () => {
    const src = read('app/components/HeroBalticMap.tsx');
    expect(src).toMatch(/cableTip/);
    expect(src).toMatch(/ChartTooltipPortal/);
    // Inline duplicate Sparkline definition was removed in favour of the
    // shared primitive (see Phase 7.7e inventory anomaly).
    expect(src).not.toMatch(/^function Sparkline\(/m);
  });

  // Phase 7.7e new RevenueCard sub-components are exported.
  it('RevenueCard.tsx exports RteSparkline / CyclesBreakdownChart / CalibrationFooter', () => {
    const src = read('app/components/RevenueCard.tsx');
    expect(src).toMatch(/export function RteSparkline/);
    expect(src).toMatch(/export function CyclesBreakdownChart/);
    expect(src).toMatch(/export function CalibrationFooter/);
  });
});
