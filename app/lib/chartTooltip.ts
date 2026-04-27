/**
 * Phase 7.7e UI — unified tooltip data shape for every chart on the site.
 *
 * Mandate: every chart hover MUST surface date (or time), value, unit. Optional
 * secondary fields exist for peer comparison, source attribution, etc. Charts
 * without a time axis (tornado, distribution-tick) substitute `label` for
 * `date` — the headline row falls through to label when date is absent.
 *
 * The same shape feeds chart.js (via the external-tooltip adapter) and inline
 * SVG primitives (via direct setState in onMouseMove). Decimal-place rules and
 * locale-short date formats live here so every consumer formats consistently.
 */

export interface ChartTooltipData {
  /** Primary date or label for the hovered point. Optional iff `label` is set. */
  date?: Date | string;
  /** Optional time component, ISO HH:MM UTC. Omit for daily-or-coarser series. */
  time?: string;
  /** Primary value. */
  value: number;
  /** Unit string (€/MWh, MW, %, c/d, EFCs/yr, ratio, …). */
  unit: string;
  /** Optional human-readable label for the data point ("aFRR up clearing", "DA peak", …). */
  label?: string;
  /** Optional secondary metrics rendered as a small key/value list below the headline. */
  secondary?: Array<{ label: string; value: number | string; unit?: string }>;
  /** Optional source attribution (small text, italics). */
  source?: string;
}

// ─── Date / time formatters ────────────────────────────────────────────────

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtTooltipDate(d: Date | string, opts?: { showWeekday?: boolean; showYear?: boolean }): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : '';
  const day = date.getDate();
  const mon = MONTH_SHORT[date.getMonth()];
  const wkd = WEEKDAY_SHORT[date.getDay()];
  const year = date.getFullYear();
  const showWeekday = opts?.showWeekday;
  const showYear = opts?.showYear;
  if (showWeekday && showYear) return `${wkd}, ${day} ${mon} ${year}`;
  if (showWeekday) return `${wkd}, ${day} ${mon}`;
  if (showYear) return `${day} ${mon} ${year}`;
  return `${mon} ${day}`;
}

export function fmtTooltipTime(t: string): string {
  if (!t) return '';
  // accept "HH:MM", "HH:MM:SS", or ISO; surface "HH:MM UTC" verbatim
  const trimmed = t.trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const hhmm = trimmed.slice(0, 5);
    return `${hhmm} UTC`;
  }
  // ISO timestamp — extract HH:MM in UTC
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m} UTC`;
  }
  return trimmed;
}

// ─── Value formatter ───────────────────────────────────────────────────────

const NUM_DECIMALS: Record<string, number> = {
  '€/MWh': 2,
  'EUR/MWh': 2,
  '€/MW/h': 2,
  '€/kW-yr': 0,
  '€/kW': 0,
  '€/MW': 0,
  'MW': 0,
  'MWh': 1,
  '%': 1,
  'pp': 2,
  'c/d': 2,
  'EFCs/yr': 0,
  'EFC/yr': 0,
  'cycles/yr': 0,
  '×': 2,
  'x': 2,
  'ratio': 2,
};

function formatWithMagnitude(v: number, decimals: number, unit: string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000 && unit !== '€/MWh' && unit !== 'EUR/MWh' && unit !== '%' && unit !== 'pp' && unit !== '×' && unit !== 'x' && unit !== 'ratio' && unit !== 'c/d') {
    return `${(v / 1_000).toFixed(1)}k`;
  }
  // thousands separator for plain integer-ish values
  if (decimals === 0) return Math.round(v).toLocaleString('en-US');
  return v.toFixed(decimals);
}

/**
 * Render `value + unit` as a tooltip-ready string. Currency-leading units
 * ("€/MWh") render as "€12.35/MWh"; trailing-suffix units ("MW", "%", "c/d")
 * render as "{value} {unit}". Magnitude-aware: large MW values shorten to
 * "12.3k MW", multi-million counts to "1.2M".
 */
export function fmtTooltipValue(v: number, unit: string): string {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return '—';
  const decimals = NUM_DECIMALS[unit] ?? 2;
  const formatted = formatWithMagnitude(v, decimals, unit);

  // Currency-leading: "€/MWh", "€/kW-yr", "€/MW/h", "EUR/MWh"
  if (unit.startsWith('€/') || unit.startsWith('EUR/')) {
    const suffix = unit.startsWith('€/') ? unit.slice(1) : unit.slice(3); // "/MWh"
    return `€${formatted}${suffix}`;
  }
  // Trailing percent/ratio without a space
  if (unit === '%' || unit === 'pp') return `${formatted}${unit}`;
  if (unit === '×' || unit === 'x') return `${formatted}×`;
  if (unit === 'ratio') return formatted;
  // Default: value + space + unit
  return `${formatted} ${unit}`;
}

// ─── chart.js external-tooltip adapter ─────────────────────────────────────

/** chart.js dataPoint subset we depend on. Mirrors chart.js's TooltipItem
 *  loosely: `parsed.y` can be `number | null` for missing values. */
export interface ChartJsDataPoint {
  label?: string;
  formattedValue?: string;
  parsed?: { y?: number | null; x?: number | null };
  raw?: unknown;
  dataset?: { label?: string };
  datasetIndex?: number;
  dataIndex?: number;
}

/** Internal shape of chart.js's tooltip model (subset we depend on). */
export interface ChartJsTooltipModel {
  opacity: number;
  caretX: number;
  caretY: number;
  title?: string[];
  body?: Array<{ lines: string[] }>;
  dataPoints?: ReadonlyArray<ChartJsDataPoint>;
}

export interface ChartJsExternalContext {
  chart: {
    canvas: { getBoundingClientRect: () => DOMRect };
  };
  tooltip: ChartJsTooltipModel;
}

/**
 * Build a chart.js `external` tooltip handler that pushes the tooltip model
 * into a React state setter as `ChartTooltipData`. The host component renders
 * `<ChartTooltip>` with the resulting state.
 *
 * @param setState - React setState callback receiving `{ visible, x, y, data }`
 * @param mapPoint - per-card adapter that takes a chart.js dataPoint and returns
 *   the unit + (optional) date / label / secondary fields. Cards that already
 *   feed time-series with ISO labels can let the default mapper extract the
 *   first dataPoint's `label` as `date`.
 */
export function buildExternalTooltipHandler(
  setState: (state: { visible: boolean; x: number; y: number; data: ChartTooltipData | null }) => void,
  mapPoint: (point: ChartJsDataPoint, title?: string) => Partial<ChartTooltipData> & { value: number; unit: string },
) {
  return (ctx: ChartJsExternalContext) => {
    const { chart, tooltip } = ctx;
    if (!tooltip || tooltip.opacity === 0) {
      setState({ visible: false, x: 0, y: 0, data: null });
      return;
    }
    const point = tooltip.dataPoints?.[0];
    if (!point) {
      setState({ visible: false, x: 0, y: 0, data: null });
      return;
    }
    const title = tooltip.title?.[0];
    const mapped = mapPoint(point, title);
    const rect = chart.canvas.getBoundingClientRect();
    const data: ChartTooltipData = {
      date: mapped.date ?? title,
      time: mapped.time,
      value: mapped.value,
      unit: mapped.unit,
      label: mapped.label,
      secondary: mapped.secondary,
      source: mapped.source,
    };
    setState({
      visible: true,
      x: rect.left + tooltip.caretX,
      y: rect.top + tooltip.caretY,
      data,
    });
  };
}
