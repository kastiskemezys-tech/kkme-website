import { describe, it, expect } from 'vitest';
import {
  PIPELINE_TIER_LABELS,
  summarizePipelineTiers,
  type PipelineTier,
} from '../pipelineDefinitions';

describe('pipeline tier vocabulary', () => {
  it('labels are distinct — no two tiers share a short noun', () => {
    const shorts = Object.values(PIPELINE_TIER_LABELS).map(l => l.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it('no tier uses the bare word "Pipeline" as its short label (the audited bug)', () => {
    for (const l of Object.values(PIPELINE_TIER_LABELS)) {
      expect(l.short.toLowerCase()).not.toBe('pipeline');
    }
  });

  it('every tier surfaces its scope (baltic vs country) in metadata', () => {
    for (const l of Object.values(PIPELINE_TIER_LABELS)) {
      expect(l.scope).toMatch(/^(baltic|LT|LV|EE)$/);
    }
  });

  it('LT-only tiers (TSO reserved, intention protocols, APVA) are scope=LT', () => {
    expect(PIPELINE_TIER_LABELS.lt_tso_reserved.scope).toBe('LT');
    expect(PIPELINE_TIER_LABELS.lt_intention_protocols.scope).toBe('LT');
    expect(PIPELINE_TIER_LABELS.lt_apva_applied.scope).toBe('LT');
  });

  it('flex_pipeline is the only Baltic-wide tier (the BESS-pipeline aggregate)', () => {
    expect(PIPELINE_TIER_LABELS.flex_pipeline.scope).toBe('baltic');
  });

  it('summarize: audit-shaped payload returns 4 distinct labelled MW values', () => {
    const summary = summarizePipelineTiers({
      flex_pipeline_mw: 1083,
      lt_tso_reserved_mw: 1395,
      lt_intention_protocols_mw: 3700,
      lt_apva_applied_mw: 1545,
    });
    expect(summary).toHaveLength(4);
    const byTier = Object.fromEntries(summary.map(s => [s.tier, s.mw]));
    expect(byTier.flex_pipeline).toBe(1083);
    expect(byTier.lt_tso_reserved).toBe(1395);
    expect(byTier.lt_intention_protocols).toBe(3700);
    expect(byTier.lt_apva_applied).toBe(1545);
    // Regression: every entry has a distinct short label
    const shorts = summary.map(s => s.short);
    expect(new Set(shorts).size).toBe(4);
  });

  it('summarize: missing values come through as null, not silently zero', () => {
    const summary = summarizePipelineTiers({ flex_pipeline_mw: 100 });
    const byTier = Object.fromEntries(summary.map(s => [s.tier, s.mw]));
    expect(byTier.flex_pipeline).toBe(100);
    expect(byTier.lt_tso_reserved).toBeNull();
    expect(byTier.lt_intention_protocols).toBeNull();
    expect(byTier.lt_apva_applied).toBeNull();
  });
});
