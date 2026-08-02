// Phase 36.E0.3 — the refresh workflow's self-check.
//
// This file exists because the workflow's own claims about itself were wrong in three
// independent ways on its first two real firings, and nothing caught any of them:
//
//   B-053  A gate that structurally could not fail. `if npx vitest … | tail -40` takes `tail`'s
//          exit status. It recorded `tests=pass` with 3 tests failing.
//   B-052  A schedule that fired ~11×/month beside a comment asserting "exactly one day per
//          month". The comment was reasoned; the cron was ORed; nobody computed either.
//   B-051  A PR step that could not open a PR, where the only signal was a red job.
//
// The common shape: PROSE ASSERTING BEHAVIOUR THAT NOTHING DERIVES (rule #2). So every assertion
// below re-derives the behaviour from the mechanism and compares it to the claim. None of them
// string-matches a comment for reassurance — a test that greps for the word "pipefail" would
// have passed on the broken file too, because the *Refresh* step had it and the *tests* step
// did not.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = path.join(import.meta.dirname, '..', '..', '..', '.github', 'workflows');
const REFRESH_WF = path.join(WORKFLOW_DIR, 'refresh-mature-markets.yml');
const wf = fs.readFileSync(REFRESH_WF, 'utf8');

/**
 * POSIX cron day matching, which is the whole of B-052.
 *
 * When BOTH day-of-month and day-of-week are restricted, cron ORs them — it does not AND them.
 * This is the rule that made `0 3 1-7 * 0` fire on every day 1-7 AND every Sunday. Implemented
 * here rather than asserted, so the test computes what the schedule really does.
 */
function cronFiresOn(domField: string, dowField: string, date: Date): boolean {
  const dom = date.getUTCDate();
  const dow = date.getUTCDay();

  const matches = (field: string, value: number): boolean => {
    if (field === '*') return true;
    return field.split(',').some((part) => {
      const [lo, hi] = part.split('-').map(Number);
      return hi === undefined ? value === lo : value >= lo && value <= hi;
    });
  };

  const domRestricted = domField !== '*';
  const dowRestricted = dowField !== '*';

  if (domRestricted && dowRestricted) return matches(domField, dom) || matches(dowField, dow);
  if (domRestricted) return matches(domField, dom);
  if (dowRestricted) return matches(dowField, dow);
  return true;
}

/** Every firing a (dom, dow) pair produces over `years`, keyed by YYYY-MM. */
function firingsByMonth(domField: string, dowField: string, years: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const y of years) {
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      counts.set(key, 0);
      const d = new Date(Date.UTC(y, m, 1));
      while (d.getUTCMonth() === m) {
        if (cronFiresOn(domField, dowField, d)) counts.set(key, counts.get(key)! + 1);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
  }
  return counts;
}

/** The guard implemented in the `window` job, kept as one expression so both can be compared. */
const windowGuard = (date: Date): boolean => date.getUTCDate() <= 7;

const YEARS = [2026, 2027, 2028, 2029, 2030];

describe('refresh workflow — schedule means what the comment says (B-052, rule #2)', () => {
  const cronMatch = wf.match(/^\s*- cron: '([^']+)'/m);

  it('declares exactly one schedule, and it parses', () => {
    expect(cronMatch).not.toBeNull();
    expect(wf.match(/^\s*- cron:/gm)!.length).toBe(1);
    expect(cronMatch![1].trim().split(/\s+/).length).toBe(5);
  });

  it('restricts at most one of day-of-month / day-of-week — never both', () => {
    const [, , dom, , dow] = cronMatch![1].trim().split(/\s+/);
    const bothRestricted = dom !== '*' && dow !== '*';
    // This is the defect itself, not a stylistic preference: two restricted fields are ORed,
    // so the expression can never mean "the first Sunday". If this ever goes red, the schedule
    // has been rewritten into the B-052 shape.
    expect(bothRestricted, `cron '${cronMatch![1]}' restricts both day fields — POSIX ORs them`).toBe(false);
  });

  it('fires exactly once per month once the window guard is applied', () => {
    const [, , dom, , dow] = cronMatch![1].trim().split(/\s+/);

    for (const y of YEARS) {
      for (let m = 0; m < 12; m++) {
        let fired = 0;
        const d = new Date(Date.UTC(y, m, 1));
        while (d.getUTCMonth() === m) {
          if (cronFiresOn(dom, dow, d) && windowGuard(d)) fired++;
          d.setUTCDate(d.getUTCDate() + 1);
        }
        // The comment claims "exactly one firing per month". This is that claim, computed.
        expect(fired, `${y}-${String(m + 1).padStart(2, '0')} fired ${fired}×`).toBe(1);
      }
    }
  });

  it('the firing it selects is genuinely the FIRST Sunday of the month', () => {
    const [, , dom, , dow] = cronMatch![1].trim().split(/\s+/);
    for (const y of YEARS) {
      for (let m = 0; m < 12; m++) {
        // The first Sunday, derived independently of the cron.
        const firstSunday = new Date(Date.UTC(y, m, 1));
        while (firstSunday.getUTCDay() !== 0) firstSunday.setUTCDate(firstSunday.getUTCDate() + 1);

        const selected: number[] = [];
        const d = new Date(Date.UTC(y, m, 1));
        while (d.getUTCMonth() === m) {
          if (cronFiresOn(dom, dow, d) && windowGuard(d)) selected.push(d.getUTCDate());
          d.setUTCDate(d.getUTCDate() + 1);
        }
        expect(selected).toEqual([firstSunday.getUTCDate()]);
      }
    }
  });

  it('the rejected form named in the comment really does fire ~11×/month', () => {
    // The comment justifies the current shape by asserting `0 3 1-7 * 0` fires ~11 times a
    // month. That number is derived here too — a justification nobody checks is how the
    // original wrong comment survived in the first place.
    const counts = [...firingsByMonth('1-7', '0', YEARS).values()];
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThanOrEqual(9);
    expect(max).toBeLessThanOrEqual(12);
    // And it is emphatically not the "exactly one" the old comment claimed.
    expect(min).toBeGreaterThan(1);
  });

  it('the workflow still contains the day-of-month guard the count depends on', () => {
    // The "once per month" result above is only true because the guard exists. If the guard is
    // deleted, the computation above stays green while the workflow fires every Sunday — so the
    // guard's presence is asserted separately, tied to the same `<= 7` bound the test applies.
    expect(wf).toMatch(/date -u \+%-d/);
    expect(wf).toMatch(/-le 7\b/);
  });
});

describe('refresh workflow — every piped gate can actually fail (B-053)', () => {
  /**
   * Split a workflow file into its `run:` blocks, keeping each block's own text. `pipefail` is
   * per-shell: setting it in one step does nothing for the next, which is exactly how the
   * *Refresh* step had it while the *tests* step did not.
   */
  function runBlocks(src: string): { body: string; startLine: number }[] {
    const lines = src.split('\n');
    const blocks: { body: string; startLine: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:- name: .*)?\s*run: \|/) ?? lines[i].match(/^(\s*)run: \|/);
      if (!m) continue;
      const indent = m[1].length;
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() !== '' && (lines[j].length - lines[j].trimStart().length) <= indent) break;
        body.push(lines[j]);
      }
      blocks.push({ body: body.join('\n'), startLine: i + 1 });
      i = j - 1;
    }
    return blocks;
  }

  /**
   * Executable lines only. This is load-bearing and was itself paid for: the first version of
   * this test checked the raw block for /set -o pipefail/ and passed with the pipefail DELETED,
   * because the explanatory comment above it contains the words "set -o pipefail". A test that
   * greps prose for reassurance is the same defect it is meant to catch, one level up.
   */
  function code(body: string): string {
    return body
      .split('\n')
      .map((l) => l.replace(/#.*$/, ''))
      .filter((l) => l.trim() !== '')
      .join('\n');
  }

  /** Shell pipes only — not `||`, and not a `|` inside a quoted string or a jq filter. */
  function hasShellPipe(body: string): boolean {
    return code(body)
      .split('\n')
      .some((l) => {
        const stripped = l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
        return /(^|[^|])\|([^|]|$)/.test(stripped);
      });
  }

  const workflowFiles = fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  it('finds the workflow files it claims to cover (A7 — the count is evidence)', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
    expect(workflowFiles).toContain('refresh-mature-markets.yml');
  });

  for (const file of fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
    it(`${file}: every run: block containing a shell pipe sets pipefail`, () => {
      const src = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8');
      const offenders = runBlocks(src)
        .filter((b) => hasShellPipe(b.body))
        .filter((b) => !/set [-a-z]*o pipefail/.test(code(b.body)))
        // A pipe whose exit status is never consumed cannot lie about a gate. Only blocks that
        // branch on the pipeline are dangerous, and those are the ones asserted here.
        .filter((b) => /\bif\s|&&|\|\|/.test(code(b.body)));
      expect(
        offenders.map((o) => `${file}:${o.startLine}`),
        'a piped command whose status decides a gate, without pipefail — this is B-053',
      ).toEqual([]);
    });
  }

  it('the tests gate pipes into tail AND sets pipefail — the exact B-053 site', () => {
    const gate = wf.slice(wf.indexOf('id: tests'));
    const block = code(gate.slice(0, gate.indexOf('- name:', 10)));
    expect(block).toMatch(/\|\s*tail -40/);
    expect(block).toMatch(/set -o pipefail/);
    // The order matters: pipefail after the pipeline would be decoration.
    expect(block.indexOf('set -o pipefail')).toBeLessThan(block.indexOf('tail -40'));
  });
});

describe('refresh workflow — a failed gate reaches the job status (B-053, one layer out)', () => {
  it('has a summary step that runs even when an earlier step died', () => {
    const summary = wf.slice(wf.indexOf('Gate summary'));
    expect(summary).toMatch(/if:\s*always\(\)/);
  });

  it('treats a gate that never ran as a failure, not as a pass', () => {
    const summary = wf.slice(wf.indexOf('Gate summary'));
    // `[ "$X" = "pass" ] || fail` — an unset gate takes the failure branch. The inverse
    // formulation (`= "fail" && fail`) would let "not reached" pass silently.
    for (const gate of ['REFRESH', 'TESTS', 'SCOPE']) {
      expect(summary).toMatch(new RegExp(`\\[ "\\$\\{${gate}:-\\}" *= *"pass" \\] \\|\\|`));
    }
    expect(summary).toMatch(/exit 1/);
  });

  it('treats a blocked PR as a failure (B-051 must never be a silent success)', () => {
    const summary = wf.slice(wf.indexOf('Gate summary'));
    expect(summary).toMatch(/BLOCKED/);
    const prStep = wf.slice(wf.indexOf('Open or update the review PR'));
    expect(prStep).toMatch(/gh issue create/);
    expect(prStep).toMatch(/compare\/main\.\.\./);
  });
});

describe('INJECTED gate-failability probe (36.E0.3, reverted next commit)', () => {
  it('fails on purpose to prove the tests gate can go red', () => {
    expect('injected').toBe('this must fail');
  });
});
