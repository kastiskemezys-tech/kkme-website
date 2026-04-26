// IRR label vocabulary.
//
// Audit caught "Gross IRR", "Project IRR", "Unlevered IRR", "Equity IRR"
// scattered across the page, sometimes referring to the same number.
// Specifically: HeroBalticMap rendered `revenue.project_irr` as
// "X% gross IRR" - but `project_irr` from the worker is the unlevered
// project IRR (post-tax, post-opex, no debt service). "Gross IRR"
// usually means before tax/fees and is NOT a synonym; using it for
// the unlevered project IRR mislabels the metric.
//
// Two distinct metrics, one canonical short label each:
//
//   UNLEVERED PROJECT IRR (short: "Project IRR", long: "Unlevered project IRR").
//   Source: /revenue.project_irr. Definition: NPV-zero discount rate on
//   project cashflows (after tax, after opex, before debt service).
//   The investor's view of the asset's intrinsic return.
//
//   LEVERED EQUITY IRR (short: "Equity IRR", long: "Levered equity IRR").
//   Source: /revenue.equity_irr. Definition: NPV-zero discount rate on
//   equity cashflows (after tax, after opex, after debt service). The
//   sponsor's view after the debt stack is layered on.

export type IrrKind = 'unlevered' | 'equity';

export interface IrrLabel {
  kind: IrrKind;
  short: string;
  long: string;
  /** Plain-English single sentence on what the metric measures. */
  detail: string;
}

export const IRR_LABELS: Readonly<Record<IrrKind, IrrLabel>> = Object.freeze({
  unlevered: {
    kind: 'unlevered',
    short: 'Project IRR',
    long: 'Unlevered project IRR',
    detail: 'project cashflows after tax and opex, before debt service',
  },
  equity: {
    kind: 'equity',
    short: 'Equity IRR',
    long: 'Levered equity IRR',
    detail: 'equity cashflows after debt service',
  },
});

/** Words explicitly forbidden in IRR labels (regression guard). */
export const FORBIDDEN_IRR_TERMS = Object.freeze(['gross irr']);

export function isForbiddenIrrLabel(s: string): boolean {
  const lower = s.toLowerCase();
  return FORBIDDEN_IRR_TERMS.some(t => lower.includes(t));
}
