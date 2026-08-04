/**
 * Phase 49 item 5 — the CLASS guard for the backlog register.
 *
 * B-066 filed the diagnosis and prescribed the fix: "filing must go through the
 * table, and a test should assert that every B-id mentioned anywhere in
 * handover.md has a table row." Nobody built it, so the register kept drifting —
 * which is why the last three phase prompts carried false premises about it,
 * this one included.
 *
 * Four properties, each one a way the register has actually been wrong:
 *
 *   1. **Every mentioned ID has a row.** B-036..B-040 lived only as sentences in
 *      session-log paragraphs and were invisible to every `^\| B-` sweep.
 *   2. **IDs are contiguous.** A gap means a row was deleted rather than closed,
 *      and a deleted row is a fact that stopped existing.
 *   3. **Every row has exactly one status, from a closed vocabulary.** B-052,
 *      B-053 and B-054 each said `fixed 36.E0.3` in the priority cell and `open`
 *      in the status cell — a row that says both cannot be swept either way.
 *   4. **A closed row names what closed it.** "closed" with no commit, phase or
 *      stated reason is an assertion with nothing behind it (B1).
 *
 * Usage:
 *   node scripts/gates/register-integrity.mjs           # table + exit 1 on any violation
 *   node scripts/gates/register-integrity.mjs --json
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(`${ROOT}/docs/handover.md`, 'utf8');
const LINES = SRC.split('\n');

/** Status vocabulary. A status outside this set is a violation, not a variant. */
const STATUS_WORDS = ['open', 'closed', 'superseded', 'restated', 'wontfix', 'blocked'];

const rows = new Map();
LINES.forEach((line, i) => {
  if (!line.startsWith('| B-')) return;
  const cells = line.split('|').map((c) => c.trim());
  const [, id, , priority, , filed, status, ...rest] = cells;
  if (!/^B-\d{3}$/.test(id)) return;
  rows.set(id, { id, priority, filed, status, detail: rest.join('|'), line: i + 1 });
});

const mentioned = new Set([...SRC.matchAll(/\bB-(\d{3})\b/g)].map((m) => `B-${m[1]}`));

const violations = [];

// 1 — every mentioned ID has a row
for (const id of [...mentioned].sort()) {
  if (!rows.has(id)) violations.push({ id, kind: 'no_row', detail: 'mentioned in handover.md but has no table row' });
}

// 2 — contiguous
const nums = [...rows.keys()].map((k) => Number(k.slice(2))).sort((a, b) => a - b);
for (let n = 1; n <= nums[nums.length - 1]; n++) {
  if (!nums.includes(n)) {
    violations.push({ id: `B-${String(n).padStart(3, '0')}`, kind: 'gap', detail: 'id missing from an otherwise contiguous register — deleted rather than closed?' });
  }
}

// 3 — exactly one status, from the vocabulary, and no status word leaking into
//     the priority cell (which is how B-052/053/054 came to say two things)
for (const r of rows.values()) {
  const hits = STATUS_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(r.status));
  if (hits.length === 0) {
    violations.push({ id: r.id, kind: 'no_status', detail: `status cell "${r.status.slice(0, 60)}" carries no recognised status word`, line: r.line });
  }
  // A resolution claim in the PRIORITY cell contradicting an `open` status.
  if (/\b(fixed|closed|resolved|shipped)\b/i.test(r.priority) && /\bopen\b/i.test(r.status)) {
    violations.push({
      id: r.id, kind: 'contradiction', line: r.line,
      detail: `priority cell says "${r.priority.replace(/\s+/g, ' ').slice(0, 48)}" while status says "${r.status.slice(0, 24)}"`,
    });
  }
}

// 4 — a closed row names what closed it
// A commit hash, a phase reference, or an explanatory clause after the dash.
// A bare "closed" with nothing after it still fails, which is the point.
const CLOSER = /\b[0-9a-f]{7,40}\b|\bphase\s*\d|\b\d+\.\d+[a-z0-9.]*\b|\bsession\s*\d|—\s*\S+\s+\S+|\bdoes not exist\b/i;
for (const r of rows.values()) {
  if (!/\bclosed\b/i.test(r.status)) continue;
  if (!CLOSER.test(`${r.status} ${r.detail}`)) {
    violations.push({ id: r.id, kind: 'closed_without_evidence', line: r.line, detail: 'status is closed but neither a commit, a phase nor a stated reason appears in the row' });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows: rows.size, mentioned: mentioned.size, violations }, null, 2));
} else {
  console.log(`\nregister: ${rows.size} rows · ${mentioned.size} distinct ids mentioned in handover.md`);
  const byStatus = {};
  for (const r of rows.values()) {
    const k = STATUS_WORDS.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(r.status)) ?? '(unrecognised)';
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  console.log(Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(' · '));
  if (violations.length) {
    console.log(`\n${violations.length} violation(s):`);
    for (const v of violations) console.log(`  ${v.id}  ${v.kind.padEnd(24)} ${v.detail}${v.line ? ` (handover.md:${v.line})` : ''}`);
  } else {
    console.log('\nno violations — every mentioned id has a row, ids are contiguous, every row has one status, every closed row names what closed it.');
  }
}

process.exit(violations.length ? 1 : 0);
