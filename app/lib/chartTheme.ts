// Shared KKME Chart.js theme
// Chart.js renders to <canvas> — CSS variables don't work in Canvas 2D context.
// This module resolves CSS custom properties to actual color strings at runtime.

import { useState, useEffect, useCallback, useMemo } from 'react';

// Map of semantic name → CSS variable name
const DATA_VAR_MAP = {
  teal:       '--teal',
  tealMid:    '--teal-medium',
  tealLight:  '--teal-subtle',
  amber:      '--amber',
  amberLight: '--amber-subtle',
  rose:       '--rose',
  roseLight:  '--rose-strong',
  fillTeal:   '--chart-fill-teal',
  fillAmber:  '--chart-fill-amber',
  fillSd:     '--chart-fill-sd',
} as const;

const CHROME_VAR_MAP = {
  textPrimary:   '--text-primary',
  textSecondary: '--text-secondary',
  textMuted:     '--text-muted',
  textFaint:     '--text-faint',
  grid:          '--chart-grid',
  border:        '--chart-grid',
  tooltipBg:     '--overlay-heavy',
  tooltipBorder: '--border-highlight',
} as const;

// Resolve a CSS variable to its computed value
function resolveVar(varName: string): string {
  if (typeof document === 'undefined') return 'rgba(128,128,128,0.5)';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function resolveMap(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, varName] of Object.entries(map)) {
    result[key] = resolveVar(varName);
  }
  return result;
}

function buildResolvedColors(): ChartColors {
  return { ...resolveMap(DATA_VAR_MAP), ...resolveMap(CHROME_VAR_MAP) } as ChartColors;
}

export type ChartColors = Record<keyof typeof DATA_VAR_MAP | keyof typeof CHROME_VAR_MAP, string>;

// Dark fallback for SSR / initial render
const DARK_FALLBACK: ChartColors = {
  teal: 'rgb(0,180,160)',
  tealMid: 'rgba(0,180,160,0.65)',
  tealLight: 'rgba(0,180,160,0.30)',
  amber: 'rgb(212,160,60)',
  amberLight: 'rgba(212,160,60,0.30)',
  rose: 'rgb(214,88,88)',
  roseLight: 'rgba(214,88,88,0.75)',
  fillTeal: 'rgba(0,180,160,0.15)',
  fillAmber: 'rgba(212,160,60,0.18)',
  fillSd: 'rgba(232,226,217,0.18)',
  textPrimary: 'rgba(232,226,217,0.92)',
  textSecondary: 'rgba(232,226,217,0.65)',
  textMuted: 'rgba(232,226,217,0.45)',
  textFaint: 'rgba(232,226,217,0.22)',
  grid: 'rgba(232,226,217,0.12)',
  border: 'rgba(232,226,217,0.12)',
  tooltipBg: 'rgba(7,7,10,0.95)',
  tooltipBorder: 'rgba(232,226,217,0.20)',
};

// Static export for non-chart HTML/SVG contexts (legend squares, etc.)
// CSS variables work fine in HTML — this uses var() strings for those cases.
export const CHART_COLORS: ChartColors = DARK_FALLBACK;

// Hook: resolves CSS variables to actual color values, re-resolves on theme toggle
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(DARK_FALLBACK);

  const resolve = useCallback(() => {
    setColors(buildResolvedColors());
  }, []);

  useEffect(() => {
    resolve();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') {
          setTimeout(resolve, 50);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [resolve]);

  return colors;
}

export const CHART_FONT = {
  family: "'DM Mono', monospace",
};

// Hook: returns theme-aware tooltip style with resolved colors.
// Default — chart.js renders its own tooltip with the legacy theme. Existing
// consumers continue to call `useTooltipStyle(colors)` and see identical output.
//
// Phase 7.7e — pass `external: handler` to delegate rendering to the unified
// `<ChartTooltip>` primitive. The handler is built via
// `buildExternalTooltipHandler(setState, mapPoint)` from chartTooltip.ts.
//
// `external` is typed as a generic chart.js handler — the handler shape is
// (ctx: { chart, tooltip }) => void, matching chart.js's own contract.
export function useTooltipStyle<T = unknown>(
  colors: ChartColors,
  opts?: { external?: (ctx: T) => void },
) {
  // Memoize the returned options object. react-chartjs-2 reconciles options on
  // every render; if this returns a fresh literal each call, chart.js treats
  // it as an options change and (when a tooltip is active) re-fires the
  // `external` callback inside its update path, which lives in
  // componentDidUpdate — i.e. the React commit phase. setState in the commit
  // phase + fresh options every render = React error #185.
  // Keying on primitive color fields (not the wrapper object) so theme-equal
  // re-renders that produce a new `colors` reference don't bust this memo.
  const external = opts?.external;
  return useMemo(() => {
    if (external) {
      return {
        enabled: false,
        external,
      };
    }
    return {
      enabled: true,
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      borderWidth: 1,
      titleFont: { family: CHART_FONT.family, size: 12, weight: 'bold' as const },
      bodyFont: { family: CHART_FONT.family, size: 11 },
      footerFont: { family: CHART_FONT.family, size: 11, weight: 'bold' as const },
      titleColor: colors.textPrimary,
      bodyColor: colors.textSecondary,
      footerColor: colors.teal,
      padding: { top: 8, bottom: 8, left: 12, right: 12 },
      displayColors: false,
      cornerRadius: 2,
    };
  }, [
    external,
    colors.tooltipBg,
    colors.tooltipBorder,
    colors.textPrimary,
    colors.textSecondary,
    colors.teal,
  ]);
}

// Shared axis/scale options factory — call with resolved colors
export function buildScales(colors: ChartColors) {
  return {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: colors.textMuted,
        font: { family: CHART_FONT.family, size: 10 },
      },
    },
    y: {
      grid: { color: colors.grid, lineWidth: 0.5 },
      border: { display: false },
      ticks: {
        color: colors.textMuted,
        font: { family: CHART_FONT.family, size: 10 },
        maxTicksLimit: 4,
      },
    },
  };
}

export const euroTick = (v: number | string) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return '€' + (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n));
};
