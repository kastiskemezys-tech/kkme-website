import { describe, it, expect } from 'vitest';
import {
  IRR_LABELS,
  FORBIDDEN_IRR_TERMS,
  isForbiddenIrrLabel,
} from '../irrLabels';

describe('IRR label vocabulary', () => {
  it('defines exactly two IRR kinds: unlevered and equity', () => {
    const kinds = Object.keys(IRR_LABELS).sort();
    expect(kinds).toEqual(['equity', 'unlevered']);
  });

  it('unlevered short = "Project IRR", long = "Unlevered project IRR"', () => {
    expect(IRR_LABELS.unlevered.short).toBe('Project IRR');
    expect(IRR_LABELS.unlevered.long).toBe('Unlevered project IRR');
  });

  it('equity short = "Equity IRR", long = "Levered equity IRR"', () => {
    expect(IRR_LABELS.equity.short).toBe('Equity IRR');
    expect(IRR_LABELS.equity.long).toBe('Levered equity IRR');
  });

  it('shorts are distinct — no two IRR kinds share a label', () => {
    const shorts = Object.values(IRR_LABELS).map(l => l.short);
    expect(new Set(shorts).size).toBe(shorts.length);
    const longs = Object.values(IRR_LABELS).map(l => l.long);
    expect(new Set(longs).size).toBe(longs.length);
  });

  it('"Gross IRR" is forbidden (the audited mislabel for unlevered project IRR)', () => {
    expect(FORBIDDEN_IRR_TERMS).toContain('gross irr');
    expect(isForbiddenIrrLabel('14.7% gross IRR')).toBe(true);
    expect(isForbiddenIrrLabel('GROSS IRR')).toBe(true);
    expect(isForbiddenIrrLabel('Gross IRR sensitivity')).toBe(true);
  });

  it('canonical labels are NOT forbidden', () => {
    expect(isForbiddenIrrLabel(IRR_LABELS.unlevered.short)).toBe(false);
    expect(isForbiddenIrrLabel(IRR_LABELS.unlevered.long)).toBe(false);
    expect(isForbiddenIrrLabel(IRR_LABELS.equity.short)).toBe(false);
    expect(isForbiddenIrrLabel(IRR_LABELS.equity.long)).toBe(false);
    expect(isForbiddenIrrLabel('Project IRR sensitivity')).toBe(false);
  });

  it('detail strings disclose the cashflow basis (post-debt vs pre-debt)', () => {
    expect(IRR_LABELS.unlevered.detail).toContain('before debt');
    expect(IRR_LABELS.equity.detail).toContain('after debt');
  });
});
