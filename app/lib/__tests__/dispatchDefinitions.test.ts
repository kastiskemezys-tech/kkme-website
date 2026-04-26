import { describe, it, expect } from 'vitest';
import {
  DISPATCH_LABELS,
  isCanonicalDispatch,
  vsCanonicalDispatchFootnote,
} from '../dispatchDefinitions';

describe('dispatch vocabulary', () => {
  it('exactly one dispatch kind is marked canonical', () => {
    const canonical = Object.values(DISPATCH_LABELS).filter(l => l.canonical);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].kind).toBe('dispatch_model');
  });

  it('isCanonicalDispatch flags only the model kind', () => {
    expect(isCanonicalDispatch('dispatch_model')).toBe(true);
    expect(isCanonicalDispatch('live_rate_aggregate')).toBe(false);
  });

  it('non-canonical surface emits a vs-canonical dispatch footnote', () => {
    const note = vsCanonicalDispatchFootnote('live_rate_aggregate', 292);
    expect(note).not.toBeNull();
    expect(note).toContain('Canonical dispatch');
    expect(note).toContain('€292');
    expect(note).toContain('Trading');
  });

  it('canonical surface itself emits no footnote', () => {
    expect(vsCanonicalDispatchFootnote('dispatch_model', 292)).toBeNull();
  });

  it('returns null when canonical value missing — never invent', () => {
    expect(vsCanonicalDispatchFootnote('live_rate_aggregate', null)).toBeNull();
    expect(vsCanonicalDispatchFootnote('live_rate_aggregate', undefined)).toBeNull();
  });

  it('label shorts are distinct so no two surfaces compete for the same noun', () => {
    const shorts = Object.values(DISPATCH_LABELS).map(l => l.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});
