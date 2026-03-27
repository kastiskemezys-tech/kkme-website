// Shared KKME Chart.js theme
// Import into every chart component that uses Chart.js

export const CHART_COLORS = {
  teal: 'rgb(0,180,160)',
  tealMid: 'rgba(0,180,160,0.55)',
  tealLight: 'rgba(0,180,160,0.25)',
  amber: 'rgb(212,160,60)',
  amberLight: 'rgba(212,160,60,0.5)',
  rose: 'rgb(214,88,88)',
  roseLight: 'rgba(214,88,88,0.5)',
  textPrimary: 'rgba(232,226,217,0.88)',
  textSecondary: 'rgba(232,226,217,0.65)',
  textMuted: 'rgba(232,226,217,0.30)',
  grid: 'rgba(232,226,217,0.06)',
  tooltipBg: 'rgba(7,7,10,0.95)',
  tooltipBorder: 'rgba(232,226,217,0.20)',
};

export const CHART_FONT = {
  family: "'DM Mono', 'Courier New', monospace",
};

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
    border: { color: 'rgba(232,226,217,0.08)' },
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
