// Phase 50 — `--offline` must not depend on untracked generated state.
//
// Gates went red on main at d2780b0 and stayed red for every run after it. The
// cause was mine and it was the SAME defect B-034 is about, shipped by the fix
// for B-034: `--offline` read `tools/consultancy/output/kv-snapshot.json`, which
// is generated and untracked. It exists on a laptop that has run a live capture
// and nowhere else, so `build-all --offline` threw "no cached KV snapshot" in
// CI — taking down both checks built on top of it, `fixture-currency` and the
// generator smoke test. Both were proven failable by injection before shipping;
// neither was ever run in a clean checkout.
//
// The rule this pins: the offline input is COMMITTED, so an offline build is
// identical on a laptop and on a clean runner.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { OFFLINE_KV_PATH, SNAPSHOT_PATH } from '../kv-snapshot.mjs';

const ROOT = join(import.meta.dirname, '../../..');
const tracked = (p: string) =>
  execFileSync('git', ['ls-files', relative(ROOT, p)], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';

describe('the offline KV input is a committed artifact', () => {
  it('exists and is tracked by git', () => {
    expect(existsSync(OFFLINE_KV_PATH), `${OFFLINE_KV_PATH} missing`).toBe(true);
    expect(tracked(OFFLINE_KV_PATH), `${OFFLINE_KV_PATH} is not tracked — CI will not have it`).toBe(true);
  });

  it('is NOT the untracked generated snapshot', () => {
    // The specific mistake: pointing offline at generated output.
    expect(OFFLINE_KV_PATH).not.toBe(SNAPSHOT_PATH);
    expect(tracked(SNAPSHOT_PATH), 'output/kv-snapshot.json must stay untracked (C1)').toBe(false);
  });

  it('carries the shape the runners consume', () => {
    const snap = JSON.parse(readFileSync(OFFLINE_KV_PATH, 'utf8'));
    expect(snap.captured_at).toBeTruthy();
    expect(snap.kv && typeof snap.kv).toBe('object');
    // The nine signal keys every runner reads. A short fixture would fail the
    // build in CI only, which is the failure mode this file exists to stop.
    for (const k of ['s1', 's2', 's3', 'euribor', 'fleet', 's1_capture']) {
      expect(snap.kv[k], `offline fixture missing kv.${k}`).toBeDefined();
    }
  });
});
