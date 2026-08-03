/**
 * Phase 38.2 · 3a — the LV registry figure, and the disclosure beside it.
 *
 * The card published 40 MW against a `coverage_note`, an `assets[]` list, a
 * `metricRegistry` declaration and a worker fallback that all said 80, and a
 * fleet tracker that said 99. Two of those were the same question answered
 * twice; one was simply wrong. AST's own publication settles it:
 *
 *   "The Rēzekne battery has a capacity of 60 MW / 120 MWh, while the Tume
 *    system adds 20 MW / 40 MWh, bringing the total capacity to 80 MW / 160 MWh"
 *   — ast.lv, 23.10.2025, balancing reserves from 2025-10-30
 *
 * These specs assert the two things the correction has to hold true: the
 * payload's LV artifacts agree with each other, and the disclosure the reader
 * sees is computed from them rather than written by hand.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TwoPopulationsNote } from '@/app/components/S4Card';

describe('the LV two-populations disclosure', () => {
  it('renders both figures and the computed difference, none of them hardcoded', () => {
    const html = renderToStaticMarkup(<TwoPopulationsNote registryMw={80} fleetMw={99} />);

    expect(html).toContain('two-populations-note');
    expect(html).toContain('80 MW is the TSO-published registry figure');
    expect(html).toContain('99 MW for the same country');
    expect(html).toContain('19 MW difference');
    // The point of the note: neither number is presented as the wrong one.
    expect(html).toContain('both are correct');
  });

  it('the difference tracks the inputs — it is arithmetic, not a sentence about 19', () => {
    const html = renderToStaticMarkup(<TwoPopulationsNote registryMw={80} fleetMw={140.5} />);
    expect(html).toContain('60.5 MW difference');
    expect(html).not.toContain('19 MW');
  });

  it('says nothing when the populations agree', () => {
    expect(renderToStaticMarkup(<TwoPopulationsNote registryMw={80} fleetMw={80} />)).toBe('');
  });

  it('says nothing rather than guessing when either figure is absent', () => {
    expect(renderToStaticMarkup(<TwoPopulationsNote registryMw={80} fleetMw={null} />)).toBe('');
    expect(renderToStaticMarkup(<TwoPopulationsNote registryMw={undefined} fleetMw={99} />)).toBe('');
  });
});

describe('the LV artifacts agree after the correction', () => {
  // Captured from the live payload after the assertion was superseded,
  // 2026-08-03T05:58Z, three consecutive agreeing reads (C8).
  const LIVE_LV = {
    installed_mw: 80,
    installed_mw_as_of: '2025-10-30',
    installed_mw_source_url:
      'https://www.ast.lv/en/events/ast-battery-energy-storage-systems-rezekne-and-tume-will-start-providing-balancing-reserves',
    assets: [
      { id: 'ast-rezekne', name: 'AST BESS (Rēzekne)', mw: 60 },
      { id: 'ast-tume', name: 'AST BESS (Tume)', mw: 20 },
    ],
    coverage_note: 'AST owns Rēzekne 60 MW + Tume 20 MW = 80 MW operational (balancing reserves from 2025-10-30, RRF/CEF-funded).',
  };

  it('the headline equals the sum of the assets listed beneath it', () => {
    expect(LIVE_LV.assets.reduce((s, a) => s + a.mw, 0)).toBe(LIVE_LV.installed_mw);
  });

  it('the coverage note states the same total as the headline', () => {
    const stated = Number(/=\s*(\d+)\s*MW operational/.exec(LIVE_LV.coverage_note)?.[1]);
    expect(stated).toBe(LIVE_LV.installed_mw);
  });

  it('the as-of date is on or after the assets entered service, not before it', () => {
    // The defect this replaces: 40 MW stamped as-of 2025-10-01, four weeks
    // BEFORE the assets AST commissioned on 2025-10-30 existed in service.
    expect(LIVE_LV.installed_mw_as_of >= '2025-10-30').toBe(true);
  });

  it('cites a document, not a bare domain — a homepage is not a citation', () => {
    // The superseded row cited "https://www.ast.lv/", which proves a TSO exists
    // and nothing about a battery (rule #3).
    expect(LIVE_LV.installed_mw_source_url).toMatch(/^https:\/\/www\.ast\.lv\/.+\/.+/);
    expect(new URL(LIVE_LV.installed_mw_source_url).pathname.length).toBeGreaterThan(20);
  });
});
