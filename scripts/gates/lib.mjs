/**
 * Phase 40 — shared machinery for the gate runner and the gate self-test.
 *
 * The one rule this file exists to enforce: an injection must break the REAL
 * mechanism and must be undone byte-identically. Everything else is bookkeeping.
 */
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function sha256(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

/** Run a gate command. Returns {code, stdout, stderr}. Never throws on non-zero. */
export function runGate(command, { timeoutMs = 900_000 } = {}) {
  const r = spawnSync('bash', ['-o', 'pipefail', '-c', command], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: r.status === null ? 124 : r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/**
 * Apply one declared injection and return a restore() that puts the tree back.
 *
 * Kinds:
 *   patch  — replace `find` with `replace` in `file` (must actually match)
 *   write  — create a NEW file at `file` with `content` (must not already exist)
 *   stage  — `git add` a path, to exercise index-scoped gates
 *
 * A patch whose `find` does not match is a VACUOUS injection: it proves nothing
 * and is reported as a harness failure rather than a passing gate. That is the
 * exact hole a self-test can fall into — asserting a gate stayed green after an
 * edit that never happened.
 */
export function applyInjection(inj) {
  if (inj.kind === 'patch') {
    const path = join(ROOT, inj.file);
    if (!existsSync(path)) throw new Error(`injection target missing: ${inj.file}`);
    const before = readFileSync(path, 'utf8');
    const beforeHash = sha256(path);
    if (!before.includes(inj.find)) {
      throw new Error(`VACUOUS INJECTION — \`find\` does not occur in ${inj.file}; this injection proves nothing`);
    }
    writeFileSync(path, before.replace(inj.find, inj.replace));
    if (sha256(path) === beforeHash) {
      throw new Error(`VACUOUS INJECTION — ${inj.file} is unchanged after the patch`);
    }
    return () => {
      writeFileSync(path, before);
      const after = sha256(path);
      if (after !== beforeHash) {
        throw new Error(`RESTORE FAILED — ${inj.file} sha256 ${beforeHash} → ${after}; tree left dirty`);
      }
    };
  }

  if (inj.kind === 'write') {
    const path = join(ROOT, inj.file);
    if (existsSync(path)) throw new Error(`injection would clobber an existing file: ${inj.file}`);
    mkdirSync(dirname(path), { recursive: true });
    const content = typeof inj.content === 'function' ? inj.content() : inj.content;
    writeFileSync(path, content);
    return () => {
      if (existsSync(path)) unlinkSync(path);
      if (existsSync(path)) throw new Error(`RESTORE FAILED — could not remove ${inj.file}`);
    };
  }

  if (inj.kind === 'stage') {
    const path = join(ROOT, inj.file);
    const created = !existsSync(path);
    if (created) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, typeof inj.content === 'function' ? inj.content() : (inj.content ?? 'injected\n'));
    }
    execSync(`git add -f -- ${JSON.stringify(inj.file)}`, { cwd: ROOT });
    return () => {
      execSync(`git rm --cached -q --force -- ${JSON.stringify(inj.file)}`, { cwd: ROOT, stdio: 'ignore' });
      if (created && existsSync(path)) unlinkSync(path);
    };
  }

  throw new Error(`unknown injection kind: ${inj.kind}`);
}

/** Snapshot of every tracked file's state, so the harness can prove it left nothing behind. */
export function treeFingerprint() {
  return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
}

/**
 * Decide what one injection attempt proved, from the three observations the
 * harness makes. Pure, so the decision table can be tested directly instead of
 * by grepping selftest.mjs — a test whose subject is a string in a file has
 * verified the file, not the behaviour (B13).
 *
 * The case this exists to get right: `preGreen === false`. A gate already red
 * for an unrelated reason is red under injection and red after revert, which is
 * indistinguishable from a botched revert unless the pre-state is consulted.
 * Reporting it as `stuck-red` accuses the injection of leaving damage behind
 * and sends the reader after a restore bug that is not there.
 *
 * @param {{preGreen: boolean, wentRed: boolean, backToGreen: boolean,
 *          isPositiveControl?: boolean}} obs
 * @returns {{verdict: string, ok: boolean, message: string}}
 */
export function classifyInjectionResult({ preGreen, wentRed, backToGreen, isPositiveControl = false }) {
  if (!preGreen) {
    return {
      verdict: 'cannot-self-test',
      ok: false,
      message: '✗ CANNOT SELF-TEST — already red before injection; fix the gate, then re-run',
    };
  }
  if (isPositiveControl) {
    return wentRed
      ? { verdict: 'control-broken', ok: false,
          message: 'CONTROL UNEXPECTEDLY FAILABLE — the control is no longer a control; fix the registry' }
      : { verdict: 'control-ok', ok: true,
          message: '✓ correctly REPORTED BROKEN (stayed green under injection, as a control must)' };
  }
  if (!wentRed) {
    return { verdict: 'unfailable', ok: false,
      message: '✗ STAYED GREEN — this gate cannot fail; it is not a gate' };
  }
  if (!backToGreen) {
    return { verdict: 'stuck-red', ok: false,
      message: '✗ STILL RED AFTER REVERT — the injection was not fully undone' };
  }
  return { verdict: 'proven', ok: true, message: '✓ red under injection, green on revert' };
}
