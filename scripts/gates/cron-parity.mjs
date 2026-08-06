/**
 * Phase 53 — the cron schedule and the handler that dispatches on it are one
 * fact stored in two files. This asserts they agree.
 *
 * `scheduled()` routes by string equality against `event.cron`, and the value
 * Cloudflare sends is whatever `wrangler.toml` declares. So the two are coupled
 * by an exact literal with nothing checking the coupling. Editing one is a
 * silent outage: a handler comparing against a schedule that no longer exists
 * takes no branch, does no work, throws nothing, and logs a clean tick. Every
 * surface reports success while the leg it was supposed to run has stopped.
 *
 * That is B8 with a config file as the trigger, and this phase created the
 * opportunity by moving the hourly leg from `0 * * * *` to `5 * * * *` to
 * stagger it off the 4-hourly collision. The move is one line in each file; the
 * gate is what makes the pair safe to edit again.
 *
 * WHAT THIS CAN AND CANNOT SEE. Static. It proves every schedule the handler
 * dispatches on is declared in `wrangler.toml`, and that every declared schedule
 * is dispatched on by something. It does NOT prove the branch does the right
 * work, nor that Cloudflare has been redeployed — a deploy is what actually
 * makes wrangler.toml true, and a green gate on an undeployed change means the
 * files agree with each other and not yet with production.
 *
 * Usage:
 *   node scripts/gates/cron-parity.mjs
 *   node scripts/gates/cron-parity.mjs --json
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WRANGLER = `${ROOT}/wrangler.toml`;
const WORKER = `${ROOT}/workers/fetch-s1.js`;

// B14 — preconditions checked before any claim. Missing input is UNRUNNABLE,
// which exits 2, distinct from a real failure at exit 1 (B15: an error is not
// a negative result).
for (const [what, path] of [['wrangler.toml', WRANGLER], ['workers/fetch-s1.js', WORKER]]) {
  if (!existsSync(path)) {
    console.error(`UNRUNNABLE — ${what} not found at ${path}`);
    process.exit(2);
  }
}

const toml = readFileSync(WRANGLER, 'utf8');
const src = readFileSync(WORKER, 'utf8');

/** The `crons = [ ... ]` array, comments stripped. */
function declaredCrons(text) {
  const block = /crons\s*=\s*\[([\s\S]*?)\]/m.exec(text);
  if (!block) return null;
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

/**
 * Every cron string the handler can dispatch on: literals compared against
 * `event.cron`, plus the value of any named constant used in such a comparison.
 * Both forms are collected because the repo uses both, and a gate that saw only
 * one would go green on exactly the drift it exists to catch.
 */
function dispatchedCrons(text) {
  const out = new Map(); // cron -> how it is referenced
  for (const m of text.matchAll(/event\.cron\s*===\s*['"]([^'"]+)['"]/g)) {
    out.set(m[1], 'literal');
  }
  for (const m of text.matchAll(/event\.cron\s*===\s*([A-Z_][A-Z0-9_]*)/g)) {
    const name = m[1];
    const decl = new RegExp(`const\\s+${name}\\s*=\\s*['"]([^'"]+)['"]`).exec(text);
    if (!decl) {
      console.error(`UNRUNNABLE — ${name} is compared against event.cron but its declaration was not found`);
      process.exit(2);
    }
    out.set(decl[1], `const ${name}`);
  }
  // A schedule can also be claimed WITHOUT a comparison: `scheduled()` returns
  // early for every other cron, so the 4-hourly block is a fall-through. That is
  // still a coupling to wrangler.toml, so any `*_CRON` constant counts as a
  // claim. Without this the gate would report the fall-through as an orphan and
  // its one true finding would be permanent noise — a gate that always fails is
  // a gate nobody reads.
  for (const m of text.matchAll(/const\s+([A-Z][A-Z0-9_]*_CRON)\s*=\s*['"]([^'"]+)['"]/g)) {
    if (!out.has(m[2])) out.set(m[2], `const ${m[1]} (fall-through)`);
  }
  return out;
}

const declared = declaredCrons(toml);
if (!declared || declared.length === 0) {
  console.error('UNRUNNABLE — no [triggers] crons array parsed from wrangler.toml');
  process.exit(2);
}
const dispatched = dispatchedCrons(src);
if (dispatched.size === 0) {
  console.error('UNRUNNABLE — no `event.cron ===` comparisons found in the worker');
  process.exit(2);
}

// Positive control (B15): the parse must actually be seeing data before any
// negative result from it is believed. Both sides non-empty is that control.
const problems = [];
for (const [cron, how] of dispatched) {
  if (!declared.includes(cron)) {
    problems.push({
      kind: 'dispatched-but-not-declared',
      cron,
      how,
      detail: 'the handler waits for a schedule wrangler.toml never fires — this branch is dead',
    });
  }
}
for (const cron of declared) {
  if (!dispatched.has(cron)) {
    problems.push({
      kind: 'declared-but-not-dispatched',
      cron,
      how: 'wrangler.toml',
      detail: 'Cloudflare fires this schedule and no branch claims it — the tick does nothing',
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    declared,
    dispatched: [...dispatched].map(([cron, how]) => ({ cron, how })),
    problems,
    ok: problems.length === 0,
  }, null, 2));
} else {
  console.log(`declared in wrangler.toml (${declared.length}):`);
  for (const c of declared) console.log(`  ${c.padEnd(14)} ${dispatched.has(c) ? `→ ${dispatched.get(c)}` : '→ NOTHING DISPATCHES ON THIS'}`);
  console.log(`\ndispatched in scheduled() (${dispatched.size}):`);
  for (const [c, how] of dispatched) console.log(`  ${c.padEnd(14)} ${how.padEnd(26)} ${declared.includes(c) ? '' : '← NOT DECLARED'}`);
  if (problems.length) {
    console.log('\nMISMATCH:');
    for (const p of problems) console.log(`  [${p.kind}] "${p.cron}" (${p.how}) — ${p.detail}`);
  } else {
    console.log('\nparity OK — every schedule is declared and dispatched.');
  }
}

process.exit(problems.length ? 1 : 0);
