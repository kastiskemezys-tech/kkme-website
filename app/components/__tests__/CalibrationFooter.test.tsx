import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalibrationFooter, type EngineCalibrationSource } from '@/app/components/RevenueCard';

// Phase 12.10 — fixture aligned with worker engine_calibration_source post
// audit-#5 sanitization: unsourced "Tier 1 / cross-supplier consensus"
// language replaced with NREL Annual Technology Baseline citations.
const FIXTURE: EngineCalibrationSource = {
  soh_curves:             'NREL Annual Technology Baseline LFP utility-scale curves (atb.nrel.gov)',
  rte_decay:              '0.20 pp/yr — NREL ATB LFP RTE projection, cross-checked vs. public manufacturer warranty curves',
  availability:           'Operator target with 1pp haircut from public 98% manufacturer warranty floor',
  throughput_per_product: 'Modo Energy / Dexter / GEM Storage Index / enspired research (2025 Q3-Q4 public reports)',
  capex_per_mw:           '2026-Q1 public Tier-1 quoting (BloombergNEF + IEA + NREL ATB)',
  last_calibrated:        '2026-04-27',
  next_review:            '2026-Q3 (post-Litgrid 6-month PICASSO data; next NREL ATB / public quoting refresh)',
};

describe('CalibrationFooter', () => {
  it('renders nothing when the source is undefined', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={undefined} />);
    expect(html).toBe('');
  });

  it('renders a single-line calibration summary with last_calibrated and NREL ATB citation', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={FIXTURE} />);
    expect(html).toContain('data-testid="calibration-footer"');
    expect(html).toContain('Calibrated 2026-04-27');
    expect(html).toContain('NREL Annual Technology Baseline');
    expect(html).toContain('atb.nrel.gov');
    expect(html).toContain('Next review 2026-Q3');
  });

  it('does not name confidential commercial-counterparty integrators (Phase 7.7d Session 20 discipline)', () => {
    const html = renderToStaticMarkup(<CalibrationFooter source={FIXTURE} />);
    // Per Phase 7.7d Session 20 confidentiality convention — committed code
    // never names KKME's commercial counterparties (clients, project SPVs, NDA suppliers).
    // Public LFP cell manufacturers (BYD, CATL, Samsung SDI) ARE permitted as
    // public-warranty-data citations; what's banned is naming integrators KKME
    // works with under NDA or specific projects/clients.
    expect(html).not.toMatch(/Tesla|Sungrow|Wartsila|Saft/i);
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
    expect(html).toContain('Calibrated against NREL Annual Technology Baseline');
    expect(html).toContain('Next review 2026-Q3');
  });
});
