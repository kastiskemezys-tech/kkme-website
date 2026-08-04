// Phase 50 — the KV backup's safety properties.
//
// The backup's job is to make a lost namespace recoverable. Its OTHER job is to
// not create a disclosure while doing it: an export walks the whole namespace,
// and the namespace has a private tier. A backup that leaks is worse than no
// backup, because it converts a durability problem into an NDA problem.
//
// These are the properties that must hold whatever else changes.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  CLASSES, PUBLIC_OUT, PRIVATE_OUT, BACKUP_ROOT, ROOT, safeName, unsafeName, verifyDir,
} from '../kv-backup.mjs';

const PRIVATE_PREFIXES = ['fleet_private:'];

describe('the private tier can never reach a public path', () => {
  it('every private-tier class is actually marked private', () => {
    for (const p of PRIVATE_PREFIXES) {
      const c = CLASSES.find((x) => x.key === p);
      expect(c, `${p} must be a declared class`).toBeTruthy();
      expect(c!.tier, `${p} must be tier=private`).toBe('private');
    }
  });

  it('no private-prefixed class is declared public — the failure mode is one word', () => {
    // A tier typo is the whole leak. Assert on the prefix, not on the list, so
    // adding `fleet_private:foo` as a public class fails here.
    for (const c of CLASSES) {
      const isPrivate = PRIVATE_PREFIXES.some((p) => c.key.startsWith(p));
      if (isPrivate) expect(c.tier, `${c.key}`).toBe('private');
    }
  });

  it('EVERY output path is inside the gitignored tree, not just the private one', () => {
    // The original design put the general tier in `data/kv-backup` and committed
    // it. The NDA gate refused (numeric needles colliding with BTD clearing
    // prices) and, worse, `contact_submissions` carries third-party names and
    // email addresses into a PUBLIC repository. Nothing from this export is
    // committable, so the assertion is on every path, not only the private one.
    expect(BACKUP_ROOT).toContain('docs/_private/');
    expect(PRIVATE_OUT).toContain('docs/_private/');
    expect(PUBLIC_OUT).toContain('docs/_private/');
  });

  it('no output path is under a committed directory', () => {
    for (const p of [BACKUP_ROOT, PUBLIC_OUT, PRIVATE_OUT]) {
      expect(p, `${p} must not be under data/`).not.toMatch(/\/data\//);
    }
  });

  it('docs/_private/ is gitignored, so the private tier cannot be committed', () => {
    const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^docs\/_private\/?$/m);
  });

  it('git does not track anything under the private backup path', () => {
    const tracked = execFileSync('git', ['ls-files', 'docs/_private'], { cwd: ROOT, encoding: 'utf8' }).trim();
    expect(tracked).toBe('');
  });
});

describe('the export carries no private key into the general tier', () => {
  const manifestPath = join(PUBLIC_OUT, 'MANIFEST.json');

  it('the public manifest names no private key, and no private file is on disk', () => {
    if (!existsSync(manifestPath)) return; // export not run in this checkout
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const e of m.keys) {
      for (const p of PRIVATE_PREFIXES) {
        expect(e.key.startsWith(p), `${e.key} is a private key in the PUBLIC manifest`).toBe(false);
      }
      expect(e.tier).toBe('public');
    }
    for (const f of readdirSync(PUBLIC_OUT)) {
      if (f === 'MANIFEST.json') continue;
      const key = unsafeName(f);
      for (const p of PRIVATE_PREFIXES) {
        expect(key.startsWith(p), `${key} is a private key file in the PUBLIC directory`).toBe(false);
      }
    }
  });

  it('the public manifest states whether a private tier exists WITHOUT naming it', () => {
    if (!existsSync(manifestPath)) return;
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Presence is operationally important — "there is private material and it
    // went elsewhere" is a different fact from "there is none". Naming it is not.
    expect(typeof m.private_tier_present).toBe('boolean');
    expect(JSON.stringify(m)).not.toMatch(/fleet_private/);
  });
});

describe('the manifest describes the directory it ships with', () => {
  it('every exported file is checksummed and every checksum matches', () => {
    if (!existsSync(join(PUBLIC_OUT, 'MANIFEST.json'))) return;
    const r = verifyDir(PUBLIC_OUT);
    expect(r.bad, `${r.bad.length} of ${r.total} failed`).toEqual([]);
    expect(r.total).toBeGreaterThan(0);
  });
});

describe('key names survive the filesystem round trip', () => {
  it('encodes and decodes keys containing colons, slashes and spaces', () => {
    for (const k of ['s2_daily_clearing', 'curation:abc-123', 'fleet_lifecycle:transitions',
      'raw:s1:2026-08-04', 'weird key/with slash', 'a:b:c*d']) {
      expect(unsafeName(safeName(k))).toBe(k);
      expect(safeName(k)).not.toContain('/');
    }
  });
});
