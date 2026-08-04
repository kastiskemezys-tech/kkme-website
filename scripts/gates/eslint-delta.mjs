/**
 * Phase 40 — eslint as a gate that can actually be passed.
 *
 * `npm run lint` exits 1 on untouched main: the repo carries a pre-existing
 * error backlog (87 at the time of writing, mostly react-compiler diagnostics in
 * long-lived components). A gate that is red before anyone touches anything
 * cannot distinguish "this branch broke something" from "this repo has always
 * been like this" — so in practice every session has reasoned around it, which
 * is the same as not having it. Same shape as `regression-baseline.json` reading
 * RED 54/54 for a week.
 *
 * This makes it a DELTA gate. The baseline is committed; the gate fails when the
 * count grows, and it also fails when the count SHRINKS without the baseline
 * being updated — a silent improvement is still baseline drift, and letting it
 * pass would let the number wander until it means nothing.
 *
 *   node scripts/gates/eslint-delta.mjs              compare (exit 1 on drift)
 *   node scripts/gates/eslint-delta.mjs --capture    rewrite the baseline
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const BASELINE = join(HERE, 'eslint-baseline.json');

function count() {
  const r = spawnSync('npx', ['eslint', '.', '--format', 'json'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '').trim();
  if (!out.startsWith('[')) {
    console.error('eslint produced no JSON report — gate cannot run.');
    console.error((r.stderr || '').slice(0, 800));
    process.exit(2); // never a pass from a check that did not execute
  }
  const report = JSON.parse(out);
  let errors = 0, warnings = 0;
  const byRule = {};
  for (const f of report) {
    for (const m of f.messages) {
      if (m.severity === 2) { errors++; byRule[m.ruleId ?? '(fatal)'] = (byRule[m.ruleId ?? '(fatal)'] ?? 0) + 1; }
      else warnings++;
    }
  }
  return { errors, warnings, byRule };
}

const argv = process.argv.slice(2);
const now = count();

if (argv.includes('--capture')) {
  let sha = 'unknown';
  try { sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* never invent one */ }
  // A baseline captured mid-edit records the editor's transient mistakes as the
  // repo's normal. That happened on the first capture of this very file: a
  // stray `require` in an ESM module counted as an 88th error, and the gate
  // then read GREEN at 88 and RED at the true 87. The tree state is therefore
  // recorded ON the artifact rather than assumed — rule #2, computed not asserted.
  let dirty = null;
  try {
    dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter((l) => l && !l.startsWith('??')).length > 0;
  } catch { /* leave null rather than claim clean */ }
  if (dirty) console.warn('WARNING: capturing an eslint baseline from a DIRTY tree — recorded as such on the artifact.');
  writeFileSync(BASELINE, `${JSON.stringify({
    _note: 'eslint error/warning counts on the reference commit. The gate is a delta against these, because absolute zero is unreachable here.',
    represents_sha: sha,
    captured_at: new Date().toISOString(),
    captured_from_dirty_tree: dirty,
    ...now,
  }, null, 2)}\n`);
  console.log(`captured eslint baseline: ${now.errors} errors, ${now.warnings} warnings → ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('no eslint baseline — run with --capture first');
  process.exit(2);
}
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

if (now.errors === base.errors) {
  console.log(`ESLINT DELTA GREEN — ${now.errors} errors (unchanged vs baseline ${base.represents_sha?.slice(0, 7) ?? '?'}), ${now.warnings} warnings`);
  process.exit(0);
}

const dir = now.errors > base.errors ? 'GREW' : 'SHRANK';
console.error(`ESLINT DELTA RED — error count ${dir}: ${base.errors} → ${now.errors}`);
for (const [rule, n] of Object.entries(now.byRule).sort((a, b) => b[1] - a[1])) {
  const was = base.byRule?.[rule] ?? 0;
  if (n !== was) console.error(`  ${rule}: ${was} → ${n}`);
}
for (const [rule, was] of Object.entries(base.byRule ?? {})) {
  if (!(rule in now.byRule)) console.error(`  ${rule}: ${was} → 0`);
}
if (dir === 'SHRANK') {
  console.error('  A shrink is good news and still fails: recapture the baseline in the commit that earned it.');
}
process.exit(1);
