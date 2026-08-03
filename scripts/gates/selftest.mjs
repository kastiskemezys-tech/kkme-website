/**
 * Phase 40 — `npm run gates:selftest`. Prove every gate can fail.
 *
 * For each registered gate, for each declared injection:
 *   0. run the gate UNINJECTED — it must already be GREEN, or nothing below means
 *      anything (see "the precondition" note)
 *   1. record sha256 of everything the injection will touch
 *   2. apply the injection to the REAL mechanism
 *   3. run the gate — it must go RED
 *   4. revert
 *   5. verify byte-identical restoration (sha256 before === after)
 *   6. run the gate again — it must go GREEN
 *
 * **The precondition.** Step 0 was missing, and its absence produced a confident
 * wrong diagnosis. A gate that is ALREADY red for an unrelated reason goes
 * "red under injection" (it was red anyway) and "still red on revert" (likewise),
 * so the harness reported `STILL RED AFTER REVERT — the injection was not fully
 * undone`. That accuses the injection of leaving damage behind when the injection
 * was in fact reverted perfectly and the gate was never green to begin with. The
 * reader then goes looking for a restore bug that does not exist.
 *
 * A red gate cannot be self-tested at all: under an already-red gate, an injection
 * that does nothing and an injection that works are indistinguishable. So the run
 * reports `CANNOT SELF-TEST — already red` and does not pretend to have proven
 * anything. It still counts as a failure, because a self-test that quietly declines
 * to test is the silent-skip class (B8) this harness exists to close.
 *
 * Three rules that make this a proof rather than a ritual:
 *
 *   · **A gate with no declared injection FAILS.** Not a skip, not a warning.
 *     An opt-out re-creates the class this whole phase exists to close.
 *   · **A vacuous injection FAILS.** If the patch's `find` never matched, the
 *     gate "stayed green" after an edit that did not happen — which is the
 *     shape of a passing self-test that proves nothing.
 *   · **The positive control must be REPORTED BROKEN.** A registered gate that
 *     cannot fail is included on purpose; a run that reports everything healthy
 *     including the control has caught nothing, and the harness says so.
 *
 * The tree is fingerprinted before and after the whole run. If anything is left
 * behind, the harness fails loudly rather than handing back a dirty worktree.
 */
import { GATES } from './registry.mjs';
import { runGate, applyInjection, treeFingerprint, sha256, classifyInjectionResult } from './lib.mjs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const fingerprintBefore = treeFingerprint();
const results = [];
let hardFailures = 0;
/** cmd -> was the gate green BEFORE any injection this run */
const preState = new Map();

const inCI = Boolean(process.env.CI);

for (const g of GATES) {
  if (inCI && g.ciBlocked) {
    // Reported, not skipped silently. The injection exists and is proven
    // locally; what CI cannot do is run it, and that is a fact about CI.
    console.log(`◦ ${g.id} — CI-BLOCKED, injection not exercised here (${g.ciBlocked})`);
    results.push({ id: g.id, verdict: 'ci-blocked' });
    continue;
  }
  if (!g.injections?.length) {
    console.log(`✗ ${g.id} — NO DECLARED INJECTION. A gate that has not been proven failable is not a gate.`);
    results.push({ id: g.id, verdict: 'no-injection' });
    hardFailures++;
    continue;
  }

  for (const inj of g.injections) {
    const cmd = inj.scope ?? g.command;
    process.stdout.write(`· ${g.id} :: ${inj.label} … `);

    // Step 0 — the precondition. Cached per command, because several injections
    // can share one gate command and the uninjected answer cannot differ between
    // them within a single run.
    if (!preState.has(cmd)) preState.set(cmd, runGate(cmd).code === 0);
    if (!preState.get(cmd)) {
      // Nothing has been injected yet, so this is NOT a revert failure. Routed
      // through the same classifier as every other outcome so the two verdicts
      // cannot drift apart.
      const r = classifyInjectionResult({ preGreen: false, wentRed: false, backToGreen: false });
      console.log(r.message);
      results.push({ id: g.id, verdict: r.verdict });
      hardFailures++;
      continue;
    }

    const targetPath = join(ROOT, inj.file);
    const hashBefore = sha256(targetPath);

    let restore;
    try {
      restore = applyInjection(inj);
    } catch (e) {
      console.log(`HARNESS FAILURE — ${e.message}`);
      results.push({ id: g.id, verdict: 'vacuous', detail: e.message });
      hardFailures++;
      continue;
    }

    let wentRed = false;
    let restoreError = null;
    try {
      wentRed = runGate(cmd).code !== 0;
    } finally {
      try { restore(); } catch (e) { restoreError = e.message; }
    }

    if (restoreError) {
      console.log(`RESTORE FAILURE — ${restoreError}`);
      results.push({ id: g.id, verdict: 'restore-failed', detail: restoreError });
      hardFailures++;
      continue;
    }
    const hashAfter = sha256(targetPath);
    if (hashBefore !== hashAfter) {
      console.log(`RESTORE NOT BYTE-IDENTICAL — ${inj.file}: ${hashBefore} → ${hashAfter}`);
      results.push({ id: g.id, verdict: 'restore-drift' });
      hardFailures++;
      continue;
    }

    const backToGreen = runGate(cmd).code === 0;

    const r = classifyInjectionResult({
      preGreen: true, wentRed, backToGreen, isPositiveControl: Boolean(g.isPositiveControl),
    });
    console.log(r.message);
    results.push({ id: g.id, verdict: r.verdict });
    if (!r.ok) hardFailures++;
  }
}

const fingerprintAfter = treeFingerprint();
console.log('');
if (fingerprintBefore !== fingerprintAfter) {
  console.log('✗ WORKING TREE CHANGED ACROSS THE RUN — the harness left something behind:');
  const before = new Set(fingerprintBefore.split('\n'));
  for (const line of fingerprintAfter.split('\n')) if (line && !before.has(line)) console.log(`    + ${line}`);
  hardFailures++;
} else {
  console.log('✓ working tree byte-identical across the whole run');
}

const proven = results.filter((r) => r.verdict === 'proven').length;
const noInj = results.filter((r) => r.verdict === 'no-injection').length;
const untestable = results.filter((r) => r.verdict === 'cannot-self-test').length;
console.log(`${proven} gate(s) proven failable · ${noInj} without a declared injection · `
  + `${untestable} untestable (already red) · ${hardFailures} failure(s)`);
if (!results.some((r) => r.verdict === 'control-ok')) {
  console.log('✗ the positive control did not run — a self-test with no control is not evidence');
  hardFailures++;
}
process.exit(hardFailures ? 1 : 0);
