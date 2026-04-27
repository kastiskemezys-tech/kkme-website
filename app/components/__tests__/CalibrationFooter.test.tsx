import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalibrationFooter, type EngineCalibrationSource } from '@/app/components/RevenueCard';

const FIXTURE: EngineCalibrationSource = {
  soh_curves:             'Tier 1 LFP integrator consensus, binding RFP responses (2026-Q1)',
  rte_decay:              '0.20 pp/yr — cross-supplier POI-level binding curves (anonymized)',
  availability:           'Operational target with 1pp haircut from binding 98% floor',
  throughput_per_product: 'Modo / Dexter / GEM / enspired research (Q3-Q4 2025) — see worker comments',
  capex_per_mw:           '2026-Q1 Tier 1 quoting, broad market consensus (no change in this phase)',
  last_calibrated:        '2026-04-27',
  next_review:            '2026-Q3 (post-Litgrid 6-month PICASSO data; next supplier price refresh)',
};

describe('CalibrationFooter', () => {
  it('renders nothing when the source is undefined', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={undefined} />);
    expect(html).toBe('');
  });

  it('renders a single-line calibration summary with last_calibrated', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={FIXTURE} />);
    expect(html).toContain('data-testid="calibration-footer"');
    expect(html).toContain('Calibrated 2026-04-27');
    expect(html).toContain('Tier 1 LFP integrator consensus + public market research');
    expect(html).toContain('Next review 2026-Q3');
  });

  it('uses the anonymized calibration phrasing verbatim (confidentiality discipline)', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={FIXTURE} />);
    // Per Phase 7.7d Session 20 confidentiality convention — committed code
    // never names suppliers, projects, clients, or pricing.
    expect(html).not.toMatch(/CATL|BYD|Tesla|Sungrow|Wartsila|Saft/i);
  });

  it('expand button starts collapsed (aria-expanded="false")', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={FIXTURE} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="calibration-footer-detail"');
  });

  it('handles partial sources gracefully (only some fields)', () => {
    const html = renderToStaticMarkup(
      <CalibrationFooter source={{ last_calibrated: '2026-04-27' }} />,
    );
    expect(html).toContain('Calibrated 2026-04-27');
    expect(html).not.toContain('Next review');
  });

  it('falls back to the generic copy when last_calibrated is missing', () => {
    const html = renderToStaticMarkup(
      <CalibrationFooter source={{ next_review: '2026-Q3' }} />,
    );
    expect(html).toContain('Calibrated against Tier 1 LFP integrator consensus');
    expect(html).toContain('Next review 2026-Q3');
  });
});
