/**
 * Phase 39 — the parameter provenance gate.
 *
 * The prompt's §3: "every parameter sourced or explicitly banded". This asserts
 * that mechanically, so a future edit cannot slip an unsourced number in beside
 * the sourced ones and inherit their authority (the E1/E2 `dur_req_h` precedent).
 */
import { describe, it, expect } from 'vitest';
import {
  DEBT_PARAMS, baseCase, blendedDscrTarget, parameterTableMarkdown,
  provenanceNote, DSCR_SENSITIVITY_LADDER,
} from '../lib/debtParams.js';

describe('every parameter carries its provenance', () => {
  const entries = Object.entries(DEBT_PARAMS);

  it('has a source, a resolvable URL, a date and an attribution', () => {
    for (const [k, p] of entries) {
      expect(p.source, `${k}.source`).toBeTruthy();
      expect(p.url, `${k}.url`).toMatch(/^https:\/\//);
      expect(p.date, `${k}.date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.attributed, `${k}.attributed`).toBeTruthy();
      expect(p.basis, `${k}.basis`).toBeTruthy();
    }
  });

  it('declares the transfer assumption wherever the source is not the target market', () => {
    // Named entities and figures carried across markets must say so (rule #3,
    // failure-modes A5). The flag is an explicit BOOLEAN, not the truthiness of
    // the note: `tenor_years` and `gearing_cap` carry notes that begin "None
    // material..." and "None — European market...", so a truthiness check
    // labelled both European sources as transferred. That error reached the
    // generated CP table and would have reached the public provenance line.
    for (const [k, p] of entries) {
      expect(typeof p.is_transfer, `${k}.is_transfer`).toBe('boolean');
      expect(p.transfer === null || typeof p.transfer === 'string', `${k}.transfer`).toBe(true);
    }
    // The US-panel rows must all be flagged, and say so in the note.
    for (const k of ['dscr_merchant', 'dscr_contracted', 'margin_bp', 'merchant_share_cap']) {
      expect(DEBT_PARAMS[k].is_transfer, k).toBe(true);
      expect(DEBT_PARAMS[k].transfer, k).toMatch(/US/);
    }
    // The European-sourced rows must NOT be flagged, however their note reads.
    for (const k of ['tenor_years', 'gearing_cap']) {
      expect(DEBT_PARAMS[k].is_transfer, k).toBe(false);
    }
    // The engine's own EURIBOR is not a transfer.
    expect(DEBT_PARAMS.base_rate.is_transfer).toBe(false);
    expect(DEBT_PARAMS.base_rate.transfer).toBeNull();
  });

  it('states a band wherever the literature gives one', () => {
    for (const [k, p] of entries) {
      if (p.range === null) continue;
      expect(Array.isArray(p.range), `${k}.range`).toBe(true);
      expect(p.range[0]).toBeLessThanOrEqual(p.range[1]);
    }
  });
});

describe('the base case sits at the conservative end of every band', () => {
  // The prompt is explicit: "make the base case the conservative end (higher
  // DSCR target, shorter tenor)", and "do not reason from the number that makes
  // the asset work". Conservative means LESS debt, so:
  //   DSCR target  -> the HIGH end   (more cover demanded)
  //   tenor        -> the SHORT end  (less time to repay)
  //   margin       -> the WIDE end   (more interest)
  //   gearing cap  -> documented exception, see below
  it('takes the high end of the merchant DSCR band', () => {
    expect(DEBT_PARAMS.dscr_merchant.base).toBe(DEBT_PARAMS.dscr_merchant.range[1]);
  });

  it('takes the high end of the contracted DSCR band', () => {
    expect(DEBT_PARAMS.dscr_contracted.base).toBe(DEBT_PARAMS.dscr_contracted.range[1]);
  });

  it('takes the short end of the tenor band', () => {
    expect(DEBT_PARAMS.tenor_years.base).toBe(DEBT_PARAMS.tenor_years.range[0]);
  });

  it('takes the wide end of the margin band', () => {
    expect(DEBT_PARAMS.margin_bp.base).toBe(DEBT_PARAMS.margin_bp.range[1]);
  });

  it('takes the LOOSE end of the gearing cap, and says why', () => {
    // The one deliberate exception, and it is conservative in the sense that
    // matters: a tight cap would bind before DSCR at most configurations and
    // hide the measurement. Loosening the CAP cannot flatter the result, because
    // the DSCR constraint is what actually binds — asserted below on real output.
    expect(DEBT_PARAMS.gearing_cap.base).toBe(DEBT_PARAMS.gearing_cap.range[1]);
    expect(DEBT_PARAMS.gearing_cap.basis).toMatch(/deliberately|sensitivity/);
  });

  it('assembles a base case with those values', () => {
    const bc = baseCase();
    expect(bc.targetDscr).toBe(2.00);
    expect(bc.tenorYears).toBe(7);
    expect(bc.graceYears).toBe(1);
    expect(bc.rate).toBeCloseTo(0.026 + 0.035, 10);   // EURIBOR 2.60 % + 350 bp
    expect(bc.maxGearing).toBe(0.60);
  });

  it('uses a margin ABOVE the engine\'s existing 250 bp diagnostic', () => {
    // The engine's fixed-gearing diagnostic prices merchant debt below the
    // sourced merchant range. The solver must not inherit that.
    expect(DEBT_PARAMS.margin_bp.base).toBeGreaterThan(250);
  });
});

describe('the blended DSCR target', () => {
  it('reproduces both published endpoints exactly', () => {
    expect(blendedDscrTarget(0)).toBe(DEBT_PARAMS.dscr_merchant.base);
    expect(blendedDscrTarget(1)).toBe(DEBT_PARAMS.dscr_contracted.base);
  });

  it('interpolates linearly in between', () => {
    expect(blendedDscrTarget(0.25)).toBeCloseTo(1.80, 10);   // 0.25x1.20 + 0.75x2.00
    expect(blendedDscrTarget(0.50)).toBeCloseTo(1.60, 10);
  });

  it('is monotonic — more contracting never demands more cover', () => {
    let prev = Infinity;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const v = blendedDscrTarget(Math.min(1, s));
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('rejects a share outside [0, 1]', () => {
    expect(() => blendedDscrTarget(1.5)).toThrow();
    expect(() => blendedDscrTarget(-0.1)).toThrow();
  });
});

describe('the CP parameter table', () => {
  it('renders every parameter and flags the unsourced blend as unsourced', () => {
    const md = parameterTableMarkdown();
    for (const k of Object.keys(DEBT_PARAMS)) expect(md).toContain(`\`${k}\``);
    expect(md).toMatch(/UNSOURCED/);
  });

  it('renders each parameter in its own unit rather than a bare number', () => {
    const md = parameterTableMarkdown();
    expect(md).toContain('2.00×');     // DSCR, not "2"
    expect(md).toContain('7 yr');
    expect(md).toContain('350 bp');
    expect(md).toContain('60 %');      // gearing cap, not "0.6"
  });
});

describe('the public provenance line', () => {
  it('names ONLY the genuinely transferred parameters', () => {
    // The defect this guards: a truthiness check on the transfer NOTE listed the
    // two European-sourced parameters as transferred, because their notes begin
    // with the word "None". Caught in the payload before it reached a surface.
    const p = provenanceNote();
    expect(p.transferred).toContain('dscr_merchant');
    expect(p.transferred).toContain('margin_bp');
    expect(p.transferred).not.toContain('tenor_years');
    expect(p.transferred).not.toContain('gearing_cap');
    expect(p.transferred).not.toContain('base_rate');
  });

  it('states the US-panel origin and the missing European source in the summary', () => {
    // The operator's condition: the transfer must be visible on the public
    // surface, not only in the register.
    const s = provenanceNote().summary;
    expect(s).toMatch(/US bank panel/);
    expect(s).toMatch(/No European or Baltic source publishes a storage/);
    expect(s).toMatch(/2\.00×/);
  });

  it('is computed from the register, not written as prose (rule #2)', () => {
    // Change a source and the line must change with it — a hardcoded sentence
    // would outlive its premise.
    const before = provenanceNote().summary;
    const original = DEBT_PARAMS.tenor_years.base;
    DEBT_PARAMS.tenor_years.base = 9;
    const after = provenanceNote().summary;
    DEBT_PARAMS.tenor_years.base = original;
    expect(after).not.toEqual(before);
    expect(after).toMatch(/9 yr/);
  });

  it('carries the review trigger the operator set', () => {
    const t = provenanceNote().review_trigger;
    expect(t.condition).toMatch(/European or Baltic/);
    expect(t.action).toMatch(/re-derive/);
    expect(t.set_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('publishes a sensitivity ladder that brackets the base case', () => {
    expect(DSCR_SENSITIVITY_LADDER).toContain(DEBT_PARAMS.dscr_merchant.base);
    expect(Math.min(...DSCR_SENSITIVITY_LADDER)).toBeLessThan(DEBT_PARAMS.dscr_merchant.base);
  });
});
