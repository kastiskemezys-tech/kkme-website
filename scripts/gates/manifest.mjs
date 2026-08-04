/**
 * Phase 40 — generate docs/gates.md FROM the registry.
 *
 * Written rather than hand-maintained for one reason: a manifest that is typed
 * by a person is a second definition of the gate set, and a second definition
 * is a thing that drifts. The registry is the source of truth; this renders it.
 *
 * `--check` fails if the committed manifest no longer matches the registry —
 * wired into the suite, so a gate added without regenerating the manifest is a
 * red test rather than a stale document nobody re-reads.
 *
 *   node scripts/gates/manifest.mjs            write docs/gates.md
 *   node scripts/gates/manifest.mjs --check    exit 1 if it is out of date
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATES } from './registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST_PATH = join(ROOT, 'docs/gates.md');

export function render() {
  const rows = GATES.map((g) => {
    const inj = g.injections?.length
      ? g.injections.map((i) => i.label).join('; ')
      : '**NONE — fails gates:selftest**';
    const where = g.ciBlocked ? `${g.where} · **CI-BLOCKED:** ${g.ciBlocked}` : g.where;
    let covers = g.notSeen ? `${g.covers} · **NOT seen:** ${g.notSeen}` : g.covers;
    if (g.preconditions?.length) {
      covers += ` · **needs:** ${g.preconditions.map((p) => p.path ?? p.cmd ?? p.name).join(', ')}`;
    }
    return `| \`${g.id}\` | \`${g.command}\` | ${covers} | ${where} | ${inj} |`;
  });

  const withInjection = GATES.filter((g) => g.injections?.length).length;

  return `# Gate manifest

**Generated from \`scripts/gates/registry.mjs\` — do not hand-edit.**
Run \`node scripts/gates/manifest.mjs\` to regenerate; \`--check\` is asserted by the suite,
so a gate added without regenerating this file is a red test rather than a stale document.

## The rule this file exists to enforce

**A gate with no declared injection is a FAILURE of \`npm run gates:selftest\`, never a skip.**

The single most repeated failure in this project is a gate that cannot fail. In one week:
the workflow-tests gate taking \`tail\`'s exit status (B-053); the \`pipefail\` test matching
the word in a comment; a grep gate whose \`[^\\n]\` excluded the letter n; the NDA gate
building a 12 MB shell variable and losing the untracked path; a non-negative-principal
invariant no golden case could reach; two new specs passing with the bug reinjected.
Every one was found by injection. Not one by running the gate.

## Commands

| command | what it does |
|---|---|
| \`npm run gates\` | run every registered gate |
| \`npm run gates:selftest\` | apply every declared injection, assert red, revert, assert green |
| \`npm run gate:byte-identity [-- <ref>]\` | \`/revenue\` 54-config payload identity vs a ref (default \`origin/main\`) |
| \`npm run gate:eslint-delta\` | eslint error count vs the recorded baseline |

## The gates

${GATES.length} registered · ${withInjection} with a declared injection · ${GATES.length - withInjection} without.

| id | command | covers | where it runs | declared injection |
|---|---|---|---|---|
${rows.join('\n')}

## Known blind spots

Recorded rather than fixed, so they stay visible:

1. **The B-053 pipefail guard cannot see \`defaults.run.shell\`.**
   \`tools/consultancy/__tests__/refreshWorkflow.test.ts\` inspects \`run:\` blocks only. A
   workflow that sets \`pipefail\` once via \`defaults:\` reads to the guard as unprotected.
   \`gates.yml\` therefore sets the flag redundantly in its piped block rather than have the
   guard taught to accept it — editing a guard so it accepts new code is the move B6 forbids.

2. **The NDA gate is local-only.** Its needle list lives under \`docs/_private/\` and is
   gitignored by design: publishing the list of forbidden strings would publish them.
   Wiring it into CI means putting that list in a repository secret. \`npm run gates\`
   reports it as \`CI-BLOCKED\` with the reason attached whenever \`CI\` is set — it is never
   silently dropped, because "not in the set" and "in the set but not run here" are exactly
   what a manifest exists to distinguish.

3. **\`npm run lint\` is not a gate and is not registered as one.** Repo-wide eslint exits 1
   on untouched \`main\` (85 errors, mostly react-compiler diagnostics in long-lived
   components). A check that is red before anyone touches anything cannot tell "this branch
   broke something" from "this repo has always been like this". \`eslint-delta\` replaces it
   with a delta against a recorded baseline, which is failable in both directions.

4. **The NDA gate scans file CONTENT, not file PATHS — and a path can disclose.**
   \`eslint -f json\` prints an absolute \`filePath\` for every file it visits. The private
   tree's filenames are themselves counterparty-suggestive: a term-sheet filename names the
   counterparty without quoting a line of it. A lint report pasted into a PR, an issue or a
   chat therefore carried names the needle scan would never fire on — no needle appears in
   that JSON, only paths do, so the gate reported a clean pass on a real disclosure.

   Closed at the source rather than by inventing path-shaped needles: \`docs/_private/**\` is
   now in eslint's \`globalIgnores\`, so those paths are no longer produced. That also moved
   the eslint baseline from 87 errors to **85** — the two that disappeared were the private
   file's own, which is the accounting check that the ignore did what it claims and nothing
   more.

   **The general form stays open, and is the thing to watch.** Any tool that enumerates
   paths across the repo can disclose by path while the NDA gate passes on content: test
   reporters, coverage output, \`tsc\` diagnostics, bundle analysers, or a \`git status\`
   pasted verbatim. Recorded on the \`nda\` gate as its \`notSeen\` field.

5. **PDF rendering is not covered by any automated check.** \`fixture-currency\` and
   the generator smoke test run \`build-all --offline --no-pdf\`, because rendering needs a
   Playwright Chromium binary a CI runner does not have, and no PDF affects a value
   either check compares. The engine chain, the workbook, the consistency gate and
   the packaging step are all still exercised; the three PDFs and the full four-file
   bundle are exercised **only by a local \`build-all\` without the flag**. Installing a
   browser in CI so those checks could walk past a stage they do not test would buy
   nobody any coverage.

## Preconditions, and UNRUNNABLE (B14)

A gate declares what it needs to run — a tracked file, a binary, an env var — and
\`npm run gates\` checks that BEFORE the command. **A gate whose precondition is
missing reports UNRUNNABLE: not a pass, and not a red.**

Both alternatives lie about a different thing. A pass claims the check ran. A red
claims the SUBJECT is broken, and sends the reader after a bug that is not there —
PR #152 spent four rounds on exactly that, because each missing precondition
surfaced as an ordinary failure of whatever the gate happened to point at. The
run exits non-zero either way; the difference is what it tells you to go and fix.

## Positive control

The registry carries \`_positive_control\`: a gate (\`true\`) that passes whatever happens to
the tree. \`gates:selftest\` must **report it as broken**. A self-test that comes back clean
*including* the control has caught nothing — which is precisely the state the NDA gate was in
when its 12 MB shell variable swallowed the match and it reported PASS on a live violation.
`;
}

const argv = process.argv.slice(2);
const out = render();

if (argv.includes('--check')) {
  if (!existsSync(MANIFEST_PATH)) {
    console.error('docs/gates.md does not exist — run `node scripts/gates/manifest.mjs`');
    process.exit(1);
  }
  if (readFileSync(MANIFEST_PATH, 'utf8') !== out) {
    console.error('docs/gates.md is out of date with scripts/gates/registry.mjs — regenerate it');
    process.exit(1);
  }
  console.log('docs/gates.md matches the registry');
  process.exit(0);
}

writeFileSync(MANIFEST_PATH, out);
console.log(`wrote ${MANIFEST_PATH} — ${GATES.length} gates`);
