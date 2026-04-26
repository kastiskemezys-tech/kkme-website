// Phase 7.7a — financial vocabulary module (N-11).
//
// Single source of truth for the labels, sublabels, tooltips, and short
// definitions used by Returns / Trading surfaces. Re-exports from
// `irrLabels.ts` so the existing forbidden-term guard ("Gross IRR")
// keeps applying to whatever consumes this module.
//
// Design rule: every consumer of these labels imports from here, not from
// inline string literals. Phase 10 will route the entire returns surface
// through this. Anything added must keep `short` ≤ 14 chars (tile width
// budget) and `tooltip` self-contained (no external glossary lookups).

import {
  IRR_LABELS,
  FORBIDDEN_IRR_TERMS,
  isForbiddenIrrLabel,
  type IrrKind,
  type IrrLabel,
} from './irrLabels';

export { IRR_LABELS, FORBIDDEN_IRR_TERMS, isForbiddenIrrLabel };
export type { IrrKind, IrrLabel };

// ─── IRR rendering helpers ─────────────────────────────────────────────────

export interface IrrTileSpec {
  label: string;
  /** mono-uppercase sublabel ("UNLEVERED, POST-TAX") */
  sublabel: string;
  /** plain-text tooltip; renderer wraps in title=… */
  tooltip: string;
}

const IRR_TOOLTIP_PROJECT =
  'Project IRR is the unlevered cash flow returned to the asset before debt service. Convention: post-tax.';
const IRR_TOOLTIP_EQUITY =
  'Equity IRR is the levered cash flow returned to the equity sponsor after debt service. Convention: post-tax.';

export const IRR_TILES: Readonly<Record<IrrKind, IrrTileSpec>> = Object.freeze({
  unlevered: {
    label: IRR_LABELS.unlevered.short,
    sublabel: 'unlevered, post-tax',
    tooltip: IRR_TOOLTIP_PROJECT,
  },
  equity: {
    label: IRR_LABELS.equity.short,
    sublabel: 'levered, post-tax',
    tooltip: IRR_TOOLTIP_EQUITY,
  },
});

// ─── DSCR variants ─────────────────────────────────────────────────────────
//
// Three numbers from the worker, three different stories:
//   min_dscr               — minimum annual DSCR over the debt life (base scenario)
//   min_dscr_conservative  — same metric under the conservative scenario
//   worst_month_dscr       — worst single month within Y1 (seasonality stress)
//
// All three render via formatNumber(v, 'ratio') → "1.92×". Covenant default
// 1.20× is industry standard for Baltic merchant BESS debt.

export type DscrVariant = 'base' | 'conservative' | 'worst_month';

export interface DscrSpec {
  variant: DscrVariant;
  /** short label fits a MetricTile size=md */
  label: string;
  /** sublabel — mono-uppercase, ≤ 28 chars */
  sublabel: string;
  /** title=… tooltip */
  tooltip: string;
}

export const DEFAULT_DSCR_COVENANT = 1.2;

export const DSCR_LABELS: Readonly<Record<DscrVariant, DscrSpec>> = Object.freeze({
  base: {
    variant: 'base',
    label: 'Min DSCR',
    sublabel: 'base scenario',
    tooltip:
      'Minimum annual debt-service coverage ratio across the debt life under the base-case scenario. CFADS ÷ debt service. ≥ 1.20× clears the typical covenant.',
  },
  conservative: {
    variant: 'conservative',
    label: 'Min DSCR',
    sublabel: 'conservative scenario',
    tooltip:
      'Same minimum annual DSCR computed under the conservative scenario (compressed spreads, faster cannibalization). Banks size debt against this number, not base.',
  },
  worst_month: {
    variant: 'worst_month',
    label: 'Worst-month DSCR',
    sublabel: 'Y1 seasonality',
    tooltip:
      'Lowest monthly DSCR within Y1, accounting for seasonality. Covenants are typically annual, but a sub-1.0× month flags cash-trap risk.',
  },
});

// ─── Other returns metrics — labels only for now (Phase 10 wires) ─────────

export interface MetricLabel {
  label: string;
  tooltip: string;
}

export const RETURNS_METRICS = Object.freeze({
  moic: {
    label: 'MOIC',
    tooltip:
      'Multiple of money. Total equity cash returned ÷ equity invested. 1.5× means a 50% gross gain over the holding period (time-blind, unlike IRR).',
  } satisfies MetricLabel,
  payback: {
    label: 'Payback',
    tooltip:
      'Years until cumulative project cash flow recovers gross capex. Simple payback ignores time value; reported in years.',
  } satisfies MetricLabel,
  npv: {
    label: 'NPV @ WACC',
    tooltip:
      'Net present value of project cash flows discounted at the weighted-average cost of capital. Positive = value-accretive vs the cost of capital benchmark.',
  } satisfies MetricLabel,
});

// ─── Market thickness on balancing tiles (7.7.14) ──────────────────────────
//
// Per the engine audit §4.2, mFRR is thin in the Baltics (a 50 MW asset is
// not a strict price-taker). aFRR is medium-thick. FCR is thinnest of all
// (sometimes Baltic-aggregate, single-buyer post-DRR).

export type ThicknessProduct = 'afrr' | 'mfrr' | 'fcr';
export type ThicknessLevel = 'thick' | 'medium' | 'thin';

export interface MarketThicknessSpec {
  product: ThicknessProduct;
  level: ThicknessLevel;
  /** Optional short caption shown beneath the chip; null for `thick`. */
  caption: string | null;
  /** title=… tooltip */
  tooltip: string;
}

export const MARKET_THICKNESS: Readonly<Record<ThicknessProduct, MarketThicknessSpec>> = Object.freeze({
  afrr: {
    product: 'afrr',
    level: 'thick',
    caption: null,
    tooltip:
      'aFRR is the thickest balancing market in the Baltics. A 50 MW asset is a price-taker.',
  },
  mfrr: {
    product: 'mfrr',
    level: 'medium',
    caption: 'thinner market — bid-shading recommended',
    tooltip:
      'mFRR is medium-thickness. Liquidity drops in off-peak hours; bid-shading recommended for assets > 50 MW.',
  },
  fcr: {
    product: 'fcr',
    level: 'thin',
    caption: 'very thin market — price-taker assumption breaks for >50 MW',
    tooltip:
      'FCR is the thinnest balancing product — sometimes Baltic-aggregate, single-buyer (post-DRR derogation). The price-taker assumption breaks down for assets > 50 MW.',
  },
});
