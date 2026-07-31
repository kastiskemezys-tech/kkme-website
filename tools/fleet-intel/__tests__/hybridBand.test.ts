// Phase 37.A.1 — the hybrid band artifact 37.D inherits.
//
// The constraint under test is not arithmetic, it is PROVENANCE: the band must be
// computable from the public fleet alone, because the private BESS-MW column is
// operator testimony and a correction sourced from it would move client numbers in
// the flattering direction (less BESS supply → lower sd_ratio → higher IRR).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildBand, publicHybridSignal } from '../build-hybrid-band.mjs';
import { findPrivateLeaks, findContactShapedContent } from '../lib/tiers.mjs';

const REPO = join(__dirname, '../../..');

const PUBLIC_FLEET = [
  { id: 'pure-lt', name: 'UAB "Testonys BESS"', mw: 50, country: 'LT', status: 'announced' },
  { id: 'wind-lt', name: 'UAB "Testonys vėjas"', mw: 100, country: 'LT', status: 'announced' },
  { id: 'solar-lt', name: 'UAB "Testonys saulė"', mw: 60, country: 'LT', status: 'announced' },
  { id: 'opaque-lt', name: 'UAB "Kazkokia Bendrove"', mw: 80, country: 'LT', status: 'announced' },
];

describe('publicHybridSignal — public evidence only', () => {
  it('flags a wind-named entry', () => {
    expect(publicHybridSignal({ name: 'UAB "Testonys vėjas"' })?.wind).toBe(true);
  });

  it('flags a solar-named entry', () => {
    expect(publicHybridSignal({ name: 'UAB "Testonys saulė"' })?.solar).toBe(true);
  });

  it('does NOT flag a pure-BESS entry', () => {
    expect(publicHybridSignal({ name: 'UAB "Testonys BESS"' })).toBeNull();
  });

  it('does NOT flag a company-named entry — the publicly-invisible case', () => {
    expect(publicHybridSignal({ name: 'UAB "Kazkokia Bendrove"' })).toBeNull();
  });
});

describe('buildBand', () => {
  const band = buildBand(PUBLIC_FLEET);

  it('upper bound is the status quo — every entry at full site MW', () => {
    expect(band.band.upper_bess_mw).toBe(290); // 50+100+60+80
  });

  it('lower bound removes the publicly-identifiable hybrids entirely', () => {
    expect(band.band.lower_bess_mw).toBe(130); // 50 + 80 (opaque stays, unflagged)
    expect(band.band.width_mw).toBe(160);      // 100 + 60
  });

  it('the truth is bracketed: lower <= upper, width >= 0', () => {
    expect(band.band.lower_bess_mw).toBeLessThanOrEqual(band.band.upper_bess_mw);
    expect(band.band.width_mw).toBeGreaterThanOrEqual(0);
  });

  it('declares that it is derived from PUBLIC data only', () => {
    expect(band.band.derivation).toMatch(/PUBLIC FLEET ONLY/);
  });

  it('carries the rule forbidding a point correction', () => {
    expect(band.rules_for_consumers.join(' ')).toMatch(/DO NOT apply a point correction/i);
    expect(band.rules_for_consumers.join(' ')).toMatch(/never contribute to a published/i);
  });

  it('declares its own incompleteness — the opaque entry is an unflagged hybrid risk', () => {
    expect(band.incompleteness.consequence).toMatch(/UNDERSTATES/);
  });

  it('names the unblocker rather than leaving the gap implicit', () => {
    expect(band.unblocker.status).toMatch(/NOT YET SOURCED/);
    expect(band.unblocker.candidates.join(' ')).toMatch(/VERT|Litgrid/);
  });

  it('contains NO private field and NO contact-shaped content', () => {
    expect(findPrivateLeaks(band)).toEqual([]);
    expect(findContactShapedContent(band)).toEqual([]);
  });

  it('contains no private-tier MAGNITUDE — the band must not smuggle the correction', () => {
    // the private figures must not appear anywhere in the artifact
    expect(JSON.stringify(band)).not.toMatch(/1320|4571|4572|3\.46/);
  });
});

describe('the committed artifact', () => {
  const p = join(REPO, 'kkme/tools/fleet-intel/data/hybrid-band.json');
  const alt = join(__dirname, '../data/hybrid-band.json');
  const file = existsSync(alt) ? alt : p;

  it('exists and is leak-free', () => {
    expect(existsSync(file)).toBe(true);
    const band = JSON.parse(readFileSync(file, 'utf8'));
    expect(findPrivateLeaks(band)).toEqual([]);
    expect(findContactShapedContent(band)).toEqual([]);
    expect(band.band.derivation).toMatch(/PUBLIC FLEET ONLY/);
  });
});
