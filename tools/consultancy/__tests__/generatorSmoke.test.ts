// B-034 — the ONE test that runs the generator chain end to end.
//
// Freezing the deliverable inputs (see deliverableFixture.test.ts) removed the
// generators from the path of every consumer test, which is the point: those
// suites now grade a reviewed artifact instead of whatever the last local build
// left on disk. But it would also mean nothing runs the chain at all, and a
// generator that stops working would go unnoticed until a delivery build.
//
// So exactly one test runs it — `build-all --offline`, the whole chain against
// the frozen KV fixture — and asserts INVARIANTS rather than values. Values live
// in the frozen fixture and are reviewed when it is regenerated; asserting them
// here too would be the mirror-test error (B5), two components agreeing because
// they came from the same run.
//
// Slow by nature. Kept to one test so the cost is paid once.
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FIXTURE_FILES } from '../regen-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONSULTANCY = join(HERE, '..');
const OUTPUT_DIR = join(CONSULTANCY, 'output');

let status: number | null;
let stdout: string;

beforeAll(() => {
  // Redirect the run registry. `runs.jsonl` is append-only and committed — a
  // rehearsal build appending to a delivery audit trail would both pollute the
  // provenance record and leave the tree dirty after every `npm test` (C1).
  const registry = join(mkdtempSync(join(tmpdir(), 'kkme-smoke-')), 'runs.jsonl');
  const r = spawnSync(
    process.execPath, [join(CONSULTANCY, 'build-all.mjs'), '--offline', '--no-pdf'],
    {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000,
      env: { ...process.env, KKME_RUNS_REGISTRY: registry },
    },
  );
  status = r.status;
  stdout = `${r.stdout ?? ''}${r.stderr ?? ''}`;
}, 600_000);

const readOut = (f: string) => JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf8'));

describe('build-all --offline runs the whole chain', () => {
  it('exits clean — every stage, including the consistency gate', () => {
    // The gate at stage 7 is what makes the workbook, the summary and the engine
    // incapable of disagreeing. A non-zero exit here is a real break.
    expect(status, stdout.split('\n').slice(-20).join('\n')).toBe(0);
  });

  it('produces every input the deliverable generators consume', () => {
    for (const f of FIXTURE_FILES) {
      expect(existsSync(join(OUTPUT_DIR, f)), `${f} not produced`).toBe(true);
    }
  });
});

describe('invariants of a freshly generated set', () => {
  it('every runner agrees on one engine version', () => {
    // loadInputs enforces this too; asserted here so a generator that starts
    // emitting a second version fails at the source rather than at the consumer.
    const versions = new Set(FIXTURE_FILES.map((f) => readOut(f).engine_version).filter(Boolean));
    expect([...versions]).toHaveLength(1);
  });

  it('nothing is marked as computed against an unverified KV snapshot', () => {
    for (const f of FIXTURE_FILES) {
      expect(readOut(f).kv_verified, `${f}.kv_verified`).not.toBe(false);
    }
  });

  it('every output carries its provenance — run id, stamp and engine sha', () => {
    // B10: a refresh that blanks a provenance field is a corruption path even
    // when every value is correct. Assert the fields survive generation.
    for (const f of FIXTURE_FILES) {
      const o = readOut(f);
      expect(o.generated_at, `${f}.generated_at`).toBeTruthy();
      expect(o.run?.run_id, `${f}.run.run_id`).toBeTruthy();
      expect(o.run?.engine_git_sha, `${f}.run.engine_git_sha`).toBeTruthy();
    }
  });

  it('the portfolio bridge conserves, year by year', () => {
    // Accounting identities the generator cannot satisfy by accident, and which
    // restate no fixture value (B5). Derived from the generated set and checked
    // to hold on all 21 years, not assumed:
    //   net_market_revenue = gross_market_revenues − charging_costs
    //   project_ebitda     = net − operating − grid − market − optimiser
    //
    // pre_financing_cf gets an INEQUALITY, not an identity. The EBITDA-to-cash
    // step subtracts maintenance capex and augmentation, which are lumpy (the
    // observed gaps run 120k–6.44M across the 21 years). Writing
    // `cf === ebitda − (ebitda − cf)` to "cover" it would be an assertion that
    // is true of any two numbers — the unfailable-gate class this phase closes.
    const p = readOut('portfolio.json');
    expect(Array.isArray(p.bridge_20yr)).toBe(true);
    expect(p.bridge_20yr.length).toBeGreaterThan(0);
    for (const [i, y] of p.bridge_20yr.entries()) {
      expect(y.net_market_revenue, `year ${i}: net vs gross − charging`)
        .toBeCloseTo(y.gross_market_revenues - y.charging_costs, 0);
      expect(y.project_ebitda, `year ${i}: ebitda vs net − costs`)
        .toBeCloseTo(y.net_market_revenue - y.operating - y.grid - y.market - y.optimiser, 0);
      expect(y.pre_financing_cf, `year ${i}: cash cannot exceed EBITDA`)
        .toBeLessThanOrEqual(y.project_ebitda + 0.5);
      expect(y.charging_costs, `year ${i}: charging cost sign`).toBeGreaterThanOrEqual(0);
    }
  });

  it('the delivery bundle is packaged', () => {
    // Run with --no-pdf: PDF rendering needs a Playwright Chromium binary CI
    // does not have. The packaging STAGE still runs and is still under test —
    // the workbook and the README are produced — but the three PDFs are not.
    //
    // COVERAGE GIVEN UP, stated rather than quietly narrowed: PDF rendering and
    // the full four-file bundle are exercised only by a local `build-all`
    // without the flag. Recorded in docs/gates.md as a known blind spot.
    for (const f of ['Prosperus_BESS_Model_v0.5.xlsx', 'README.txt']) {
      expect(existsSync(join(OUTPUT_DIR, 'delivery', f)), f).toBe(true);
    }
  });
});
