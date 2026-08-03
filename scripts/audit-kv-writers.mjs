// A7 enumeration: every worker route, whether it writes KV (directly or via a
// helper that writes KV), and whether it checks an auth secret.
import { readFileSync } from 'node:fs';

const SRC = '/Users/Kastis/kkme/workers/fetch-s1.js';
const lines = readFileSync(SRC, 'utf8').split('\n');

// 1. Find helper functions that write KV, so a route calling one counts as a writer.
const helperWriters = new Set();
{
  // crude: for each `function NAME(` / `const NAME = async (`, brace-match its body
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:async\s+)?function\s+(\w+)\s*\(/)
      || lines[i].match(/^const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
    if (!m) continue;
    let depth = 0, started = false, body = '';
    for (let j = i; j < lines.length && j < i + 400; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      body += lines[j] + '\n';
      if (started && depth <= 0) break;
    }
    if (/\.put\(/.test(body)) helperWriters.add(m[1]);
  }
}

// 2. Locate the route guards inside the fetch handler.
const guardRe = /url\.pathname\s*(?:===|\.startsWith\(|\.match\()/;
const guards = [];
for (let i = 0; i < lines.length; i++) {
  if (/^\s*if\s*\(/.test(lines[i]) && guardRe.test(lines[i])) guards.push(i);
  else if (guardRe.test(lines[i]) && /^\s*(&&|\|\|)/.test(lines[i])) guards.push(i);
}

const AUTH_RE = /update-secret|UPDATE_SECRET|FLEET_SECRET|CALC_SECRET|Api-Secret-Token/i;
const PUT_RE = /\.put\(/;

const rows = [];
for (let g = 0; g < guards.length; g++) {
  const start = guards[g];
  const end = g + 1 < guards.length ? guards[g + 1] : lines.length;
  const block = lines.slice(start, end).join('\n');

  // route label: methods + pathnames named on the guard line(s)
  const head = lines.slice(start, Math.min(start + 3, end)).join(' ');
  const paths = [...head.matchAll(/pathname\s*(?:===|\.startsWith\(|\.match\()\s*['"`]([^'"`]+)/g)].map(m => m[1]);
  const methods = [...head.matchAll(/request\.method\s*===\s*['"`](\w+)/g)].map(m => m[1]);
  if (!paths.length) continue;

  // B13: strip comments before testing for auth, or the word "x-update-secret"
  // in an explanatory comment reads as an auth check that is not there.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const directPut = PUT_RE.test(code);
  const calledHelpers = [...code.matchAll(/\b(\w+)\s*\(/g)].map(m => m[1])
    .filter(n => helperWriters.has(n));
  const helperPut = calledHelpers.length > 0;
  const authed = AUTH_RE.test(code);

  rows.push({
    line: start + 1,
    method: methods.length ? [...new Set(methods)].join('/') : 'ANY',
    path: paths.join(' | '),
    writes: directPut ? 'direct' : helperPut ? `via ${[...new Set(calledHelpers)].join(',')}` : '',
    authed,
  });
}

const writers = rows.filter(r => r.writes);
console.log(`route guards matched: ${rows.length}`);
console.log(`of those, KV writers: ${writers.length}`);
console.log(`  authed:   ${writers.filter(r => r.authed).length}`);
console.log(`  UNAUTHED: ${writers.filter(r => !r.authed).length}`);
console.log('\n--- UNAUTHENTICATED KV WRITERS ---');
for (const r of writers.filter(r => !r.authed)) {
  console.log(`  :${r.line}\t${r.method}\t${r.path}\t(${r.writes})`);
}
console.log('\n--- AUTHENTICATED KV WRITERS ---');
for (const r of writers.filter(r => r.authed)) {
  console.log(`  :${r.line}\t${r.method}\t${r.path}\t(${r.writes})`);
}
console.log('\n--- helper functions that write KV ---');
console.log('  ' + [...helperWriters].join(', '));
