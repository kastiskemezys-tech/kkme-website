/**
 * Phase 40 — `npm run gates`. Run every registered gate, report the table.
 *
 * Exit 1 if any gate whose recorded expectation is `green` comes back red.
 * A gate recorded as `red` is reported as a KNOWN-RED and does not fail the run,
 * but it is never silently dropped: a gate nobody can pass is a fact about the
 * repo that has to stay visible.
 */
import { RUNNABLE } from './registry.mjs';
import { runGate, checkPreconditions } from './lib.mjs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const gates = only.length ? RUNNABLE.filter((g) => only.includes(g.id)) : RUNNABLE;
if (only.length && gates.length !== only.length) {
  console.error(`unknown gate id(s): ${only.filter((id) => !RUNNABLE.some((g) => g.id === id)).join(', ')}`);
  process.exit(2);
}

const rows = [];
let failed = 0;

const inCI = Boolean(process.env.CI);

for (const g of gates) {
  if (inCI && g.ciBlocked) {
    console.log(`· ${g.id} … CI-BLOCKED — ${g.ciBlocked}`);
    rows.push({ id: g.id, status: 'CI-BLOCKED', secs: '0.0', asExpected: true });
    continue;
  }
  process.stdout.write(`· ${g.id} … `);

  // B14 — preconditions BEFORE the command. A gate that cannot run must say so.
  // Reporting it green would claim a check happened; reporting it red would
  // blame the subject. Both are worse than admitting the gate did not execute.
  const pre = checkPreconditions(g);
  if (!pre.ok) {
    console.log('UNRUNNABLE — preconditions missing');
    for (const m of pre.missing) console.log(`    · ${m.what}${m.why ? ` — ${m.why}` : ''}`);
    rows.push({ id: g.id, status: 'UNRUNNABLE', secs: '0.0', asExpected: false });
    failed++;
    continue;
  }

  const t0 = Date.now();
  const r = runGate(g.command);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const green = r.code === 0;
  const asExpected = green === (g.expect === 'green');
  let status;
  if (green && g.expect === 'green') status = 'GREEN';
  else if (!green && g.expect === 'red') status = 'KNOWN-RED';
  else if (!green) { status = 'RED'; failed++; }
  else { status = 'UNEXPECTEDLY-GREEN'; failed++; }
  console.log(`${status} (${secs}s)`);
  if (status === 'RED' || status === 'UNEXPECTEDLY-GREEN') {
    const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-8).join('\n');
    console.log(tail.replace(/^/gm, '    '));
  }
  rows.push({ id: g.id, status, secs, asExpected });
}

console.log('');
const blocked = rows.filter((r) => r.status === 'CI-BLOCKED');
const unrunnable = rows.filter((r) => r.status === 'UNRUNNABLE');
console.log(`${rows.filter((r) => r.status === 'GREEN').length}/${rows.length} green · ` +
  `${rows.filter((r) => r.status === 'KNOWN-RED').length} known-red · ${blocked.length} CI-blocked · ` +
  `${unrunnable.length} unrunnable · ${failed} unexpected`);
if (unrunnable.length) {
  console.log('UNRUNNABLE gates did not execute — this is not a pass and not a failure of the subject:');
  for (const u of unrunnable) console.log(`  · ${u.id}`);
}
if (blocked.length) {
  console.log('CI-BLOCKED gates did NOT run here and are not evidence about this change:');
  for (const b of blocked) console.log(`  · ${b.id}`);
}
process.exit(failed ? 1 : 0);
