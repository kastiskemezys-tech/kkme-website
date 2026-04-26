import { describe, it, expect } from 'vitest';
import {
  CAPTURE_LABELS,
  isCanonicalCapture,
  vsCanonicalFootnote,
} from '../captureDefinitions';

describe('capture vocabulary', () => {
  it('exactly one capture kind is marked canonical (the headline)', () => {
    const canonical = Object.values(CAPTURE_LABELS).filter(l => l.canonical);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].kind).toBe('da_gross_capture');
  });

  it('isCanonicalCapture flags only the headline kind', () => {
    expect(isCanonicalCapture('da_gross_capture')).toBe(true);
    expect(isCanonicalCapture('da_peak_trough_range')).toBe(false);
    expect(isCanonicalCapture('realised_arbitrage')).toBe(false);
  });

  it('non-canonical surfaces emit a vs-canonical footnote pointing back to the hero', () => {
    const note = vsCanonicalFootnote('da_peak_trough_range', 32);
    expect(note).not.toBeNull();
    expect(note).toContain('Canonical DA capture');
    expect(note).toContain('€32');
  });

  it('canonical surface itself emits no vs-canonical footnote (would be circular)', () => {
    expect(vsCanonicalFootnote('da_gross_capture', 32)).toBeNull();
  });

  it('returns null when canonical value missing — never invent a number', () => {
    expect(vsCanonicalFootnote('da_peak_trough_range', null)).toBeNull();
    expect(vsCanonicalFootnote('da_peak_trough_range', undefined)).toBeNull();
  });

  it('label shorts use distinct nouns — no two surfaces compete for "capture"', () => {
    const shorts = Object.values(CAPTURE_LABELS).map(l => l.short);
    const unique = new Set(shorts);
    expect(unique.size).toBe(shorts.length);
    // Specifically: the peak-trough range MUST NOT use the bare word "Capture"
    // (the audited source of the bug).
    expect(CAPTURE_LABELS.da_peak_trough_range.short).not.toMatch(/^capture$/i);
  });
});
