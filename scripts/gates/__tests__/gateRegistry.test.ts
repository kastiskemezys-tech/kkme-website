/**
 * Phase 40 — the registry's own invariants.
 *
 * These are the properties that make `gates:selftest` a proof rather than a
 * ritual. They are asserted here so a future edit to the registry cannot quietly
 * remove them — most importantly the no-opt-out rule, which is the one thing
 * standing between this harness and the class of failure it exists to close.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { GATES, RUNNABLE } from '../registry.mjs';
import { classifyInjectionResult, checkPreconditions } from '../lib.mjs';

describe('gate registry', () => {
  it('every gate declares at least one injection — no opt-out', () => {
    // The rule. A gate permitted to register without a way to prove it can fail
    // re-creates the exact class this phase closes.
    const naked = GATES.filter((g) => !g.injections?.length).map((g) => g.id);
    expect(naked, 'gates with no declared injection').toEqual([]);
  });

  it('carries a positive control, and exactly one', () => {
    // A self-test with no control is not evidence: it cannot tell "everything
    // is healthy" from "the harness reports everything healthy".
    const controls = GATES.filter((g) => g.isPositiveControl);
    expect(controls).toHaveLength(1);
    expect(RUNNABLE).not.toContain(controls[0]);
  });

  it('gate ids are unique and shell-safe', () => {
    const ids = GATES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('every gate states where it runs and what it covers', () => {
    for (const g of GATES) {
      expect(g.covers, `${g.id}.covers`).toBeTruthy();
      expect(g.where, `${g.id}.where`).toBeTruthy();
      expect(['green', 'red']).toContain(g.expect);
    }
  });

  it('every declared injection names a supported kind and a target', () => {
    for (const g of GATES) {
      for (const inj of g.injections ?? []) {
        expect(['patch', 'write', 'stage'], `${g.id}: ${inj.label}`).toContain(inj.kind);
        expect(inj.file, `${g.id}: ${inj.label}`).toBeTruthy();
        expect(inj.label, `${g.id} injection label`).toBeTruthy();
        if (inj.kind === 'patch') {
          expect(inj.find, `${g.id}: patch needs a find`).toBeTruthy();
          expect(inj.replace, `${g.id}: patch needs a replace`).not.toBe(inj.find);
        }
      }
    }
  });

  it('a CI-blocked gate states its reason', () => {
    // "Skipped" with no reason is how a gate silently leaves the set.
    for (const g of GATES.filter((x) => 'ciBlocked' in x)) {
      expect(typeof g.ciBlocked, `${g.id}.ciBlocked`).toBe('string');
      expect(g.ciBlocked.length).toBeGreaterThan(20);
    }
  });

  it('an already-red gate is untestable, and is NOT reported as a revert failure', () => {
    // The bug this pins. A gate already red for an unrelated reason is red under
    // injection and red after revert — observationally identical to a botched
    // revert. Without consulting the pre-state the harness said "STILL RED AFTER
    // REVERT — the injection was not fully undone", accusing the injection of
    // leaving damage behind and sending the reader after a restore bug that was
    // not there. Verified against the live harness by disabling the check and
    // watching that exact string come back.
    const red = classifyInjectionResult({ preGreen: false, wentRed: true, backToGreen: false });
    expect(red.verdict).toBe('cannot-self-test');
    expect(red.message).toMatch(/CANNOT SELF-TEST/);
    expect(red.message).not.toMatch(/STILL RED AFTER REVERT/);

    // …and it is a failure, not a quiet skip: a self-test that declines to test
    // and reports success is the silent-skip class this harness exists to close.
    expect(red.ok).toBe(false);

    // The same observations WITH a green pre-state are the genuine revert bug,
    // and must still be diagnosed as one — the fix must not swallow that case.
    const stuck = classifyInjectionResult({ preGreen: true, wentRed: true, backToGreen: false });
    expect(stuck.verdict).toBe('stuck-red');
    expect(stuck.message).toMatch(/STILL RED AFTER REVERT/);
    expect(stuck.ok).toBe(false);
  });

  it('classifies the remaining outcomes without collision', () => {
    const v = (o: Parameters<typeof classifyInjectionResult>[0]) => classifyInjectionResult(o).verdict;
    expect(v({ preGreen: true, wentRed: true, backToGreen: true })).toBe('proven');
    expect(v({ preGreen: true, wentRed: false, backToGreen: true })).toBe('unfailable');
    expect(v({ preGreen: true, wentRed: false, backToGreen: true, isPositiveControl: true })).toBe('control-ok');
    expect(v({ preGreen: true, wentRed: true, backToGreen: true, isPositiveControl: true })).toBe('control-broken');
    // only 'proven' and 'control-ok' are passes
    expect(classifyInjectionResult({ preGreen: true, wentRed: true, backToGreen: true }).ok).toBe(true);
    expect(classifyInjectionResult({ preGreen: true, wentRed: false, backToGreen: true }).ok).toBe(false);
  });

  it('an already-red gate outranks the control exemption', () => {
    // A control that is already red is untestable too — the inverted expectation
    // does not license reporting it as a healthy control.
    expect(classifyInjectionResult({
      preGreen: false, wentRed: false, backToGreen: false, isPositiveControl: true,
    }).verdict).toBe('cannot-self-test');
  });

  it('B14 — a declared precondition is checked, and its absence is UNRUNNABLE', () => {
    // The rule: a gate whose precondition is missing must not report a pass
    // (which claims a check happened) and must not report a generic red (which
    // blames the subject). PR #152 spent four rounds chasing the wrong bug
    // because each missing precondition surfaced as an ordinary failure.
    const present = checkPreconditions({ preconditions: [{ kind: 'file', path: 'package.json' }] });
    expect(present.ok).toBe(true);

    const absent = checkPreconditions({
      preconditions: [{ kind: 'file', path: 'no/such/file.json', why: 'the reason' }],
    });
    expect(absent.ok).toBe(false);
    expect(absent.missing[0].what).toContain('no/such/file.json');
    expect(absent.missing[0].why).toBe('the reason');

    // A gate with no declared preconditions is runnable, not vacuously blocked.
    expect(checkPreconditions({}).ok).toBe(true);
  });

  it('B14 — every precondition names a real, checkable thing', () => {
    for (const g of GATES) {
      for (const p of g.preconditions ?? []) {
        expect(['file', 'binary', 'env'], `${g.id}`).toContain(p.kind);
        expect(p.why, `${g.id} precondition must say why`).toBeTruthy();
        if (p.kind === 'file') expect(p.path).toBeTruthy();
      }
    }
  });

  it('B14 — the declared preconditions of every gate are satisfied here', () => {
    // If this goes red, a gate is about to report UNRUNNABLE rather than a
    // result — which is the point, but it should be visible as its own failure.
    for (const g of GATES) {
      const r = checkPreconditions(g);
      if (!r.ok) {
        // The NDA needle list is gitignored by design and absent in CI; that
        // gate is already declared CI-BLOCKED, so it is the one legitimate miss.
        expect(g.ciBlocked, `${g.id} preconditions missing: ${r.missing.map((m) => m.what).join(', ')}`).toBeTruthy();
      }
    }
  });

  it('docs/gates.md is in sync with the registry', () => {
    // The manifest is generated, so it cannot drift — unless someone edits the
    // registry and forgets. This turns that into a red test.
    expect(() =>
      execFileSync('node', ['scripts/gates/manifest.mjs', '--check'], { encoding: 'utf8' }),
    ).not.toThrow();
  });
});
