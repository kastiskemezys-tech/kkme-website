/**
 * Phase 40 — the gate registry.
 *
 * Every gate in the repo, as data, with its injection declared BESIDE it rather
 * than hand-run at heroic moments.
 *
 * Why this file exists. The single most repeated failure in this project is a
 * gate that cannot fail. In one week: the workflow-tests gate taking `tail`'s
 * exit status; the `pipefail` test matching the word in a comment; a grep gate
 * whose `[^\n]` excluded the letter n; the NDA gate building a 12 MB shell
 * variable and losing the untracked path; a non-negative-principal invariant no
 * golden case could reach; two of CC's own specs passing with the bug
 * reinjected. Every one was found by injection; not one by running the gate.
 *
 * So: **a gate with no declared injection is a FAILURE of `npm run
 * gates:selftest`, never a skip.** That rule is the whole point. A registry that
 * lets a gate opt out of proof re-creates the class it exists to close.
 *
 * `expect: 'red'` on a gate means it is KNOWN-RED on main today and is recorded
 * as such rather than quietly excluded — a gate nobody can pass is not a gate,
 * and hiding it would lose the fact that it needs fixing.
 */

import { readFileSync } from 'node:fs';

export const GATES = [
  {
    id: 'tests',
    name: 'Unit + integration suite',
    command: 'npx vitest run',
    covers: 'Engine maths, worker routes, dispatch, debt sizing, fleet lifecycle, consultancy pipeline, React components. 2314 assertions.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'un-monitor s1_capture — the exact 38.1 defect, re-introduced',
      kind: 'patch',
      file: 'workers/lib/defaults.js',
      find: '  s1_capture:  12,',
      replace: '  // s1_capture:  12,  // INJECTED by gates:selftest',
      // The key behind the S1 card's hero number had no staleness threshold and
      // went 33h stale unnoticed. Removing it again is the sharpest available
      // probe: a green suite here would mean the 38.1 regression test is not
      // exercising the constants table it was written to protect.
      scope: 'npx vitest run workers/__tests__/s1MonitoringSurfaces.test.ts',
    }],
  },

  {
    id: 'no-editorial-chips',
    name: 'No engine-emitted state strings as chips (discipline rule #6)',
    command: 'npm run --silent lint:no-editorial-chips',
    covers: "Forbids `phase: 'TIGHTENING'|'STABLE'|… ` reaching app/components — the locked brand principle that data speaks, not editorial labels.",
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 're-introduce an editorial chip in a real component',
      kind: 'write',
      file: 'app/components/_GateSelftestProbe.tsx',
      content: "export const probe = { phase: 'TIGHTENING' };\n",
    }],
  },

  {
    id: 'no-raw-spacing',
    name: 'Spacing tokens only, never raw values',
    command: 'npm run --silent lint:no-raw-spacing',
    covers: 'Value-aware spacing gate over shorthand and per-side padding/margin props in app/**.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'raw px spacing in a real component file',
      kind: 'write',
      file: 'app/components/_GateSelftestSpacing.tsx',
      content: 'export const Probe = () => <div style={{ padding: 16 }} />;\n',
    }],
  },

  {
    id: 'manifest-single-writer',
    name: 'One canonical writer per manifest artifact (discipline rule #4)',
    command: 'npm run --silent lint:manifest-single-writer',
    covers: 'Forbids from-scratch construction of a manifest another module carries forward — the B-048 provenance-deletion path.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'a second from-scratch manifest writer, in the gate\'s real scope',
      kind: 'write',
      file: 'tools/_gate-selftest-second-writer.mjs',
      // Assembled at run time rather than written literally: this registry lives
      // in scripts/, which is INSIDE the gate's own grep scope, so spelling the
      // forbidden pattern here made the registry a permanent violation of the
      // gate it was trying to prove. Caught by the harness reporting STILL RED
      // AFTER REVERT — the tree was clean and the gate was still failing, which
      // is only possible if the gate was seeing something else.
      content: () => `import { writeFile } from 'node:fs/promises';\nawait writeFile('out/mani` + `fest.json', '{}');\n`,
    }],
  },

  {
    id: 'private-staged',
    name: 'Nothing under docs/_private/ is ever staged or tracked',
    command: 'bash scripts/assert-no-private-staged.sh',
    covers: 'Index and tracked-file scope of the private tree, plus the .gitignore rule itself.',
    where: 'local + CI (CI has no private tree, so it asserts the ignore rule only)',
    expect: 'green',
    injections: [{
      label: 'force-stage a file from the private tree',
      kind: 'stage',
      file: 'docs/_private/_gate-selftest-probe.txt',
      content: 'gate selftest probe\n',
    }],
  },

  {
    id: 'nda',
    name: 'NDA counterparty-name and contracted-figure gate',
    command: 'bash scripts/nda-gate.sh main',
    covers: 'Diff vs base + uncommitted + staged + every untracked non-ignored file, against the private needle list. Carries its own positive control.',
    // COVERAGE EDGE — what this gate does NOT see, recorded so the omission is a
    // known limit rather than a discovery. The gate scans file CONTENT. A
    // disclosure can also travel as a file PATH: `eslint -f json` prints an
    // absolute filePath for every file it visits, and the private tree's
    // filenames are themselves counterparty-suggestive (a term-sheet filename
    // names the counterparty without quoting a line of it). A lint report pasted
    // into a PR, an issue or a chat therefore leaked names the needle scan would
    // never fire on, because no needle appears in the JSON — only paths do.
    //
    // Closed at the source rather than by adding path-shaped needles: the private
    // tree is in eslint's globalIgnores, so those paths are no longer produced.
    // The general form stays open and is the thing to watch: ANY tool that
    // enumerates paths over the repo (test reporters, coverage output, tsc,
    // bundle analysers, `git status` pasted verbatim) can disclose by path while
    // this gate reports a clean pass on content.
    notSeen: 'disclosure by FILE PATH rather than file content — tool output that enumerates private-tree paths',
    where: 'local ONLY — blocked from CI, see below',
    expect: 'green',
    // BLOCKED FROM CI, reported rather than worked around. The needle list lives
    // under docs/_private/ and is gitignored by design: publishing the list of
    // forbidden strings would publish them. Running this in CI means putting the
    // list in a repository secret, and tonight's rules forbid new secrets. The
    // runner reports this as CI-BLOCKED with this reason attached — it is never
    // silently dropped, because "not in the list" and "in the list and skipped"
    // are the two things a gate manifest exists to distinguish.
    ciBlocked: 'needle list is gitignored by design; wiring it into CI requires a new repository secret',
    injections: [{
      label: 'plant a real needle, read from the private list at run time so it never enters the repo',
      kind: 'write',
      file: '_gate-selftest-nda-probe.txt',
      content: () => {
        // The needle is READ from the gitignored list, never written into this
        // file. Hardcoding a needle here would publish the very string the gate
        // exists to keep out — the trap an earlier version of the gate's own
        // documentation fell into.
        const lines = readFileSync('docs/_private/commercial/_nda-gate-needles.txt', 'utf8')
          .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        if (!lines.length) throw new Error('needle list empty — cannot construct a positive control');
        return `${lines[0]}\n`;
      },
    }],
  },

  {
    id: 'fixture-currency',
    name: 'B-034 frozen deliverable-input fixture is current',
    command: 'npm run --silent fixtures:regen -- --check',
    covers: 'The committed deliverable-input fixture vs a fresh `build-all --offline`. '
      + 'deliverable.test.ts and xlsx.test.ts grade the FIXTURE, so this is what stops them '
      + 'grading a reviewed-but-stale artifact — the currency half of B-034.',
    // COVERAGE EDGE. The two consumer suites are structurally insensitive to
    // fixture VALUES: the consistency gate compares HTML generated FROM the
    // inputs against those same inputs, so moving an input moves both sides
    // together (B5, a mirror). Injection-verified — `portfolio.mw + 7` leaves
    // all 62 tests green. Those suites test the GATE, not the numbers; value
    // movement is caught here and by the fixture hash manifest, not by them.
    notSeen: 'value drift INSIDE the fixture — the consumer suites mirror it; this gate and the hash manifest catch that',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'age the fixture by moving an engine number in it',
      kind: 'patch',
      file: 'tools/consultancy/__fixtures__/deliverable-inputs/portfolio.json',
      find: '"moic"',
      replace: '"moic_STALE"',
    }],
  },

  {
    id: 'regression-baseline',
    name: '/revenue 54-configuration regression baseline',
    command: 'node tools/consultancy/regression-reference.mjs',
    covers: 'computeRevenueV7 over every public (dur × capex × cod × scenario) against the frozen KV fixture. Any drift means the public site moved.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'move a public number by nudging the reference capex default',
      kind: 'patch',
      file: 'tools/consultancy/regression-reference.mjs',
      find: "const CAPEX_MAP = { low: 120, mid: 164, high: 262 };",
      replace: "const CAPEX_MAP = { low: 121, mid: 164, high: 262 };",
    }],
  },

  {
    id: 'eslint-delta',
    name: 'eslint error count does not grow',
    command: 'node scripts/gates/eslint-delta.mjs',
    covers: 'Repo-wide eslint. Absolute-zero is unreachable (main carries a pre-existing error backlog), so the gate is a DELTA against a recorded baseline — which is failable, where the absolute gate is not.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'add one new eslint error',
      kind: 'write',
      file: 'app/lib/_gateSelftestLintProbe.ts',
      content: 'export const probe = (x: any) => x;\n',
    }],
  },

  {
    id: 'evidence-freshness',
    name: 'Mature-market evidence base staleness',
    command: 'npm run --silent evidence:freshness',
    covers: 'Per-source last_successful_refresh vs cadence for the eight mature-market series grounding the 36.E forecasts.',
    where: 'local + CI',
    expect: 'green',
    injections: [{
      label: 'age a source past its threshold',
      kind: 'patch',
      file: 'tools/consultancy/mature-markets/check-freshness.mjs',
      find: 'const MISSED_CYCLES_BEFORE_STALE = 2;',
      replace: 'const MISSED_CYCLES_BEFORE_STALE = 0;',
    }],
  },

  // ── The harness's own positive control ────────────────────────────────────
  //
  // A gate that ALWAYS passes, whatever is done to the tree. `gates:selftest`
  // must report it as BROKEN. If the self-test ever reports a clean sweep
  // including this entry, the self-test is the thing that is broken — which is
  // precisely the failure the NDA gate hit when its 12 MB shell variable
  // swallowed the match and it reported PASS on a live violation.
  {
    id: '_positive_control',
    name: 'POSITIVE CONTROL — a deliberately unfailable gate',
    command: 'true',
    covers: 'Nothing. Exists so that a self-test which passes everything is caught.',
    where: 'selftest only',
    expect: 'green',
    isPositiveControl: true,
    injections: [{
      label: 'break the world; this gate will not notice, and that is the point',
      kind: 'write',
      file: '_gate-selftest-control-probe.txt',
      content: 'this file cannot affect `true`\n',
    }],
  },
];

/** Gates that run in ordinary `npm run gates` — the control is selftest-only. */
export const RUNNABLE = GATES.filter((g) => !g.isPositiveControl);
