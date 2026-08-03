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

  it('docs/gates.md is in sync with the registry', () => {
    // The manifest is generated, so it cannot drift — unless someone edits the
    // registry and forgets. This turns that into a red test.
    expect(() =>
      execFileSync('node', ['scripts/gates/manifest.mjs', '--check'], { encoding: 'utf8' }),
    ).not.toThrow();
  });
});
