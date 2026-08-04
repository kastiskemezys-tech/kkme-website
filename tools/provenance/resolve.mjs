/**
 * Phase 41 §4 — the one consumer, so the spine is real rather than decorative.
 *
 * The report generator (item 9) and the calculator (item 10) both need to answer
 * "where does this number come from". Without this they would each invent their
 * own source list, and two hand-maintained source lists is how the same number
 * acquires two provenances.
 *
 * No public UI in this phase — deliberately. This is the read API and the CLI.
 *
 *   node tools/provenance/resolve.mjs installed_storage_lt_mw
 *   node tools/provenance/resolve.mjs --all
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve as r, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = r(dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPH = join(ROOT, 'docs/provenance/graph.json');

export function loadGraph() {
  if (!existsSync(GRAPH)) {
    // Refusing to answer beats answering from nothing. A provenance API that
    // returns an empty chain when its graph is missing tells the reader the
    // number has no sources, which is a claim about the world made by a missing
    // file (B11).
    throw new Error('provenance graph not built — run `node tools/provenance/build-graph.mjs`');
  }
  return JSON.parse(readFileSync(GRAPH, 'utf8'));
}

/**
 * The full ancestry of one node, deepest-last, with each hop's kind.
 *
 * @param {string} id  a node id, or a bare metric/parameter name
 * @returns {{id:string, found:boolean, chain:string|null, path:Array, sources:Array, effective_freshness_from:string|null}}
 */
export function resolveProvenance(id, graph = loadGraph()) {
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const candidates = [id, `metric:${id}`, `param:${id}`, `field:${id}`, `dataset:${id}`];
  const start = candidates.find((c) => byId[c]);
  if (!start) return { id, found: false, chain: null, path: [], sources: [], effective_freshness_from: null };

  const out = {};
  for (const e of graph.edges) (out[e.from] ||= []).push(e.to);

  const path = [];
  const sources = [];
  const seen = new Set();
  const walk = (n, depth) => {
    if (seen.has(n)) return;
    seen.add(n);
    const node = byId[n];
    if (!node) return;
    if (depth > 0) path.push({ depth, id: n, kind: node.kind, label: node.label });
    if (node.kind === 'external_source') sources.push({ id: n, label: node.label, cited: node.cited ?? false });
    for (const t of out[n] ?? []) walk(t, depth + 1);
  };
  walk(start, 0);

  return {
    id: start,
    found: true,
    chain: byId[start].chain,
    label: byId[start].label,
    path,
    sources,
    effective_freshness_from: byId[start].effective_freshness_from ?? null,
    effective_freshness_note: byId[start].effective_freshness_note ?? null,
  };
}

/** Every metric and parameter, resolved. What item 9 and item 10 read. */
export function resolveAll(graph = loadGraph()) {
  return graph.nodes
    .filter((n) => n.kind === 'metric' || n.kind === 'parameter')
    .map((n) => resolveProvenance(n.id, graph));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node tools/provenance/resolve.mjs <metric-or-parameter-id> | --all');
    process.exit(2);
  }
  if (arg === '--all') {
    const all = resolveAll();
    console.log(JSON.stringify({ count: all.length, resolved: all.filter((a) => a.sources.length).length, items: all }, null, 2));
    process.exit(0);
  }
  const res = resolveProvenance(arg);
  if (!res.found) {
    console.error(`no provenance node for '${arg}'`);
    process.exit(1);
  }
  console.log(`${res.id}  [${res.chain} chain]`);
  console.log(`  ${res.label}`);
  for (const p of res.path) console.log(`  ${'  '.repeat(p.depth)}→ ${p.kind}: ${p.label}`);
  console.log(`  sources: ${res.sources.length}`);
  console.log(`  effective freshness: ${res.effective_freshness_note}`);
}
