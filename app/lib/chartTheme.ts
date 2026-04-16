// Shared KKME Chart.js theme
// Import into every chart component that uses Chart.js

import { useState, useEffect } from 'react';

// Data-semantic colors — consistent across themes
const DATA_COLORS = {
  teal: 'var(--teal)',
  tealMid: 'var(--teal-medium)',
  tealLight: 'var(--teal-subtle)',
  amber: 'var(--amber)',
  amberLight: 'var(--amber-subtle)',
  rose: 'var(--rose)',
  roseLight: 'var(--rose-strong)',
};

// Chrome colors — theme-dependent
const DARK_CHROME = {
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  grid: 'var(--chart-grid)',
  border: 'var(--chart-grid)',
  tooltipBg: 'var(--overlay-heavy)',
  tooltipBorder: 'var(--border-highlight)',
};

const LIGHT_CHROME = {
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  grid: 'var(--chart-grid)',
  border: 'var(--chart-grid)',
  tooltipBg: 'var(--overlay-heavy)',
  tooltipBorder: 'var(--border-highlight)',
};

export type ChartColors = typeof DATA_COLORS & typeof DARK_CHROME;

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function buildColors(dark: boolean): ChartColors {
  return { ...DATA_COLORS, ...(dark ? DARK_CHROME : LIGHT_CHROME) };
}

// Static export for non-chart JSX (legend squares, etc.)
// Data colors are theme-independent so this is always safe.
export const CHART_COLORS = buildColors(true);

// Hook: returns theme-aware chart colors, re-renders on theme toggle
export function useChartColors(): ChartColors {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    setDark(isDarkTheme());
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return buildColors(dark);
}

export const CHART_FONT = {
  family: "var(--font-mono)",
};

// Hook: returns theme-aware tooltip style
export function useTooltipStyle(colors: ChartColors) {
  return {
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
}

// Static tooltip for backwards compat (dark mode only)
export const tooltipStyle = {
  backgroundColor: CHART_COLORS.tooltipBg,
  borderColor: CHART_COLORS.tooltipBorder,
  borderWidth: 1,
  titleFont: { family: CHART_FONT.family, size: 12, weight: 'bold' as const },
  bodyFont: { family: CHART_FONT.family, size: 11 },
  footerFont: { family: CHART_FONT.family, size: 11, weight: 'bold' as const },
  titleColor: CHART_COLORS.textPrimary,
  bodyColor: CHART_COLORS.textSecondary,
  footerColor: CHART_COLORS.teal,
  padding: { top: 8, bottom: 8, left: 12, right: 12 },
  displayColors: false,
  cornerRadius: 2,
};

export const axisStyle = {
  x: {
    grid: { display: false },
    border: { color: DARK_CHROME.border },
    ticks: {
      color: CHART_COLORS.textMuted,
      font: { family: CHART_FONT.family, size: 10 },
    },
  },
  y: {
    grid: { color: CHART_COLORS.grid, lineWidth: 0.5 },
    border: { display: false },
    ticks: {
      color: CHART_COLORS.textMuted,
      font: { family: CHART_FONT.family, size: 10 },
      maxTicksLimit: 4,
    },
  },
};

export const euroTick = (v: number | string) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return '€' + (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n));
};
