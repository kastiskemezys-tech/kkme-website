/**
 * Phase 43 §1 — the dimensional gate.
 *
 * Scans the engine for multiplication chains in which a value-share (EUR/EUR)
 * multiplies an energy or power quantity — the B-065 shape — and fails on any
 * occurrence not on the allowlist.
 *
 * Why a scanner and not a type system. Retrofitting types onto a 9,400-line JS
 * worker is a project, not a gate, and the phase that attempts it will not be
 * the phase that catches the next unit error. This catches ONE rule, the one
 * that was paid for, today.
 *
 * Two honesty requirements it imposes on itself:
 *
 *   1. It reports its own COVERAGE — how many multiplication operands it could
 *      resolve to a declared dimension. A dimensional check that silently
 *      examines 4 % of the multiplications is the most reassuring possible way
 *      to have no dimensional check at all.
 *   2. It PRINTS the allowlist on every green run. A suppressed P1 that nobody
 *      is reminded of has been forgotten, not managed.
 *
 *   node scripts/gates/units-gate.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNITS, FORBIDDEN_PRODUCTS, KNOWN_VIOLATIONS, DIM } from '../../workers/lib/units.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGETS = ['workers/fetch-s1.js', 'tools/consultancy/lib/dispatch.mjs', 'tools/consultancy/lib/price-formation.mjs'];

/**
 * Strip comments and string literals before scanning.
 *
 * Load-bearing: the B-065 seam is DESCRIBED in a comment directly above the
 * line that commits it, in the same words. A scanner that reads comments finds
 * the prose and calls it a violation, or worse finds the prose and calls the
 * code clean. Same defect as the pipefail test matching the word in a comment.
 */
function blank(m) { return m.replace(/[^\n]/g, ' '); }

function code(src) {
  // Every stripper preserves NEWLINES. Template literals in this engine span
  // many lines, and collapsing one to two characters silently merged unrelated
  // statements and shifted every line number after it — the first version of
  // this scanner reported 77 lines containing a multiplication in a 9,400-line
  // file and found zero of the violation it was built to find. A scanner whose
  // line numbers are wrong is worse than no scanner: it is a scanner whose
  // green result is about a file that does not exist.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:/])\/\/[^\n]*/g, (_m, p) => p + blank(_m.slice(p.length)))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
    .replace(/`(?:[^`\\]|\\.)*`/g, blank);
}

/**
 * Statements, not lines.
 *
 * `rev_trd` — the one multiplication this gate exists to catch — is written
 * across three physical lines, with `da_mwh_per_mw_yr` on the second and
 * `arb_share_yr` on the third. A line-based scan cannot see them together, and
 * reports the file clean. Splitting on `;` keeps a whole multiplication chain
 * in one unit and keeps its starting line number for the report.
 */
function statements(src) {
  const out = [];
  let buf = '';
  let line = 1;
  let startLine = 1;
  for (const ch of src) {
    if (ch === '\n') line++;
    if (ch === ';' || ch === '{' || ch === '}') {
      if (buf.trim()) out.push({ text: buf, startLine });
      buf = '';
      startLine = line;
    } else {
      if (!buf.trim() && ch.trim()) startLine = line;
      buf += ch;
    }
  }
  if (buf.trim()) out.push({ text: buf, startLine });
  return out;
}

/** The registered identifiers taking part in a multiplication inside `text`. */
function multiplicationChains(text) {
  if (!/\*(?!\*|=)/.test(text)) return [];
  const ids = [...text.matchAll(/([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g)]
    .map((x) => x[1].split('.').pop())
    .filter((x) => x in UNITS);
  return ids.length >= 2 ? [[...new Set(ids)]] : [];
}

const violations = [];
let linesWithMul = 0;
let operandsResolved = 0;
let operandsTotal = 0;

for (const rel of TARGETS) {
  let src;
  try { src = readFileSync(resolve(ROOT, rel), 'utf8'); } catch { continue; }
  for (const st of statements(code(src))) {
    if (!/\*(?!\*|=)/.test(st.text)) continue;
    linesWithMul++;
    const all = [...st.text.matchAll(/([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g)].map((x) => x[1].split('.').pop());
    operandsTotal += all.length;
    operandsResolved += all.filter((x) => x in UNITS).length;

    for (const chain of multiplicationChains(st.text)) {
      for (const rule of FORBIDDEN_PRODUCTS) {
        const lefts = chain.filter((id) => rule.left.includes(UNITS[id]));
        const rights = chain.filter((id) => rule.right.includes(UNITS[id]));
        if (!lefts.length || !rights.length) continue;
        for (const l of lefts) {
          for (const r of rights) {
            violations.push({ file: rel, line: st.startLine, left: l, right: r, rule: rule.id, why: rule.why, text: st.text.replace(/\s+/g, ' ').trim().slice(0, 140) });
          }
        }
      }
    }
  }
}

const allowed = (v) => KNOWN_VIOLATIONS.some((k) =>
  k.file === v.file && k.identifiers.includes(v.left) && k.identifiers.includes(v.right));

const unexpected = violations.filter((v) => !allowed(v));
const suppressed = violations.filter(allowed);

const coveragePct = operandsTotal ? ((operandsResolved / operandsTotal) * 100).toFixed(1) : '0.0';
console.log(`units gate — ${TARGETS.length} file(s) · ${linesWithMul} lines containing a multiplication`);
console.log(`  registry: ${Object.keys(UNITS).length} identifiers over ${new Set(Object.values(DIM)).size} dimensions`);
console.log(`  coverage: ${operandsResolved}/${operandsTotal} operands resolve to a declared dimension (${coveragePct}%)`);
console.log(`  NOTE: coverage is PARTIAL by design. An unresolved operand is not a clean operand — it is an unchecked one.`);

if (KNOWN_VIOLATIONS.length) {
  console.log('');
  console.log(`  ${KNOWN_VIOLATIONS.length} KNOWN violation(s) suppressed, printed every run so they are not forgotten:`);
  for (const k of KNOWN_VIOLATIONS) {
    const hits = suppressed.filter((v) => k.identifiers.includes(v.left) && k.identifiers.includes(v.right));
    console.log(`    · ${k.register} [${k.status}] — ${k.identifiers.join(' × ')} in ${k.file}`);
    console.log(`      ${hits.length} live site(s): ${hits.map((h) => `${h.file}:${h.line}`).join(', ') || 'NONE — the allowlist entry is stale and should be removed'}`);
  }
}

if (unexpected.length) {
  console.log('');
  console.error(`UNITS GATE RED — ${unexpected.length} unallowed dimensional violation(s):`);
  for (const v of unexpected) {
    console.error(`  ${v.file}:${v.line}  ${v.left} [${UNITS[v.left]}] × ${v.right} [${UNITS[v.right]}]`);
    console.error(`    ${v.why}`);
    console.error(`    ${v.text}`);
  }
  process.exit(1);
}

console.log('');
console.log('UNITS GATE GREEN — no new value-share × energy products.');
process.exit(0);
