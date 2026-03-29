// Shared KKME Chart.js theme
// Import into every chart component that uses Chart.js

import { useState, useEffect } from 'react';

// Data-semantic colors — consistent across themes
const DATA_COLORS = {
  teal: 'rgb(0,180,160)',
  tealMid: 'rgba(0,180,160,0.55)',
  tealLight: 'rgba(0,180,160,0.25)',
  amber: 'rgb(212,160,60)',
  amberLight: 'rgba(212,160,60,0.5)',
  rose: 'rgb(214,88,88)',
  roseLight: 'rgba(214,88,88,0.5)',
};

// Chrome colors — theme-dependent
const DARK_CHROME = {
  textPrimary: 'rgba(232,226,217,0.88)',
  textSecondary: 'rgba(232,226,217,0.65)',
  textMuted: 'rgba(232,226,217,0.35)',
  grid: 'rgba(232,226,217,0.08)',
  border: 'rgba(232,226,217,0.08)',
  tooltipBg: 'rgba(7,7,10,0.95)',
  tooltipBorder: 'rgba(232,226,217,0.20)',
};

const LIGHT_CHROME = {
  textPrimary: 'rgba(40,38,34,0.88)',
  textSecondary: 'rgba(60,58,54,0.7)',
  textMuted: 'rgba(80,78,74,0.5)',
  grid: 'rgba(60,58,54,0.1)',
  border: 'rgba(60,58,54,0.1)',
  tooltipBg: 'rgba(250,248,244,0.97)',
  tooltipBorder: 'rgba(60,58,54,0.2)',
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
  family: "'DM Mono', 'Courier New', monospace",
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
