/**
 * Phase 41 — the provenance spine, generated.
 *
 * The question nothing here could answer mechanically: "where does this
 * published number come from, all the way down." That is what a lender asks,
 * what the report generator needs, and what makes the calculator defensible.
 *
 * WHAT THE INVENTORY FOUND, and it changes the shape of the artifact.
 * `app/lib/metricRegistry.ts` and `tools/consultancy/assumptions-register.json`
 * do NOT share a join key, and it is not a naming accident:
 *
 *   metricRegistry.workerPath   →  s4.storage_reference.installed_mw
 *   register.engine_binding     →  worker:RTE_BOL.h2 · engine:… · calibration:…
 *
 * The first names a FIELD ON AN OBSERVED PAYLOAD. The second names a MODEL
 * PARAMETER. Measured: 0 of 9 workerPaths match any of 68 engine_bindings.
 *
 * They are not incompatible — they are DISJOINT, and they describe two
 * different chains that meet only at the top, on a card that shows both an
 * observation and a modelled number:
 *
 *   observation chain: metric → payload field → KV key → fetcher → external source
 *   parameter chain:   published figure → engine constant → register row → cited source
 *
 * So the graph carries both and says which chain each node belongs to. Inventing
 * a key mapping by hand to fuse them is exactly what the STOP condition forbids,
 * and it would be a fiction: an RTE constant is not upstream of an installed-MW
 * observation in any real sense.
 *
 *   node scripts…/build-graph.mjs            write docs/provenance/graph.json
 *   node scripts…/build-graph.mjs --check    exit 1 if regenerating would differ
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(ROOT, 'docs/provenance');
const OUT = join(OUT_DIR, 'graph.json');

/* ── Inputs, all read from what already exists ───────────────────────────── */

function readMetricRegistry() {
  const src = readFileSync(join(ROOT, 'app/lib/metricRegistry.ts'), 'utf8');
  const out = [];
  // Each entry is `  <id>: { … }` with label / workerPath / meaning / introducedPhase.
  const re = /^ {2}([a-z0-9_]+): \{([\s\S]*?)^ {2}\},/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, id, body] = m;
    const f = (k) => body.match(new RegExp(`${k}:\\s*(?:'([^']*)'|\`([^\`]*)\`)`))?.slice(1).find(Boolean) ?? null;
    // `label` and `meaning` may be concatenated multi-line strings; take the first chunk.
    out.push({ id, label: f('label'), workerPath: f('workerPath'), meaning: f('meaning'), introducedPhase: f('introducedPhase') });
  }
  return out;
}

function readRegister() {
  const j = JSON.parse(readFileSync(join(ROOT, 'tools/consultancy/assumptions-register.json'), 'utf8'));
  return j.rows ?? [];
}

function readManifests() {
  const base = join(ROOT, 'tools/consultancy/data/mature-markets');
  if (!existsSync(base)) return [];
  const out = [];
  for (const d of readdirSync(base)) {
    const p = join(base, d, 'manifest.json');
    if (!existsSync(p)) continue;
    try {
      const m = JSON.parse(readFileSync(p, 'utf8'));
      out.push({
        dir: d,
        dataset: m.dataset ?? d,
        source: m.source ?? null,
        // `source_urls` is a KEYED OBJECT in every manifest that has one
        // ({entsoe: …, elexon_gb: …}), not the array the field name suggests,
        // and `fx` has none at all. Normalised here rather than assumed —
        // assuming the array shape threw on the first run, which is the cheap
        // version of the same mistake this whole graph exists to catch.
        source_urls: Array.isArray(m.source_urls) ? m.source_urls
          : (m.source_urls && typeof m.source_urls === 'object') ? Object.values(m.source_urls).filter((v) => typeof v === 'string')
          : (m.source_url ? [m.source_url] : []),
        licence: m.licence ?? null,
        retrieved_at: m.retrieved_at ?? null,
        last_successful_refresh: m.last_successful_refresh ?? null,
        resolution: m.resolution ?? null,
        timezone: m.timezone ?? null,
      });
    } catch { /* a manifest that will not parse is reported as missing, not guessed at */ }
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * Which KV key a worker payload path lives on, and what writes it.
 *
 * Derived from the path's own first segment (`s4.…` → the `s4` KV key) and from
 * the worker's cron structure, NOT hand-authored. If a path's root is not a KV
 * key the worker writes, that is reported rather than assumed away.
 */
function readKvWriters() {
  const src = readFileSync(join(ROOT, 'workers/fetch-s1.js'), 'utf8');
  const writers = {};
  for (const m of src.matchAll(/KKME_SIGNALS\.put\('([a-z0-9_:]+)'/g)) {
    writers[m[1]] = (writers[m[1]] ?? 0) + 1;
  }
  // The fetch host each signal's compute function reaches. Derived by locating
  // the compute function and taking the hosts named inside it.
  /** A named top-level function's body, by brace balance rather than a fixed slice. */
  const bodyOf = (name) => {
    const i = src.search(new RegExp(`(?:async )?function ${name}\\s*\\(`));
    if (i < 0) return null;
    const open = src.indexOf('{', i);
    if (open < 0) return null;
    let depth = 0;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return src.slice(open, j + 1);
    }
    return null;
  };
  const hostsIn = (body) => [...new Set([...body.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((x) => x[1]))];
  /** Literal URLs in a body PLUS any URL-valued constant the body names. */
  const hostsAndConstsIn = (body, constUrls) => {
    const out = new Set(hostsIn(body));
    for (const c of new Set([...body.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)].map((x) => x[1]))) {
      if (constUrls[c]) { try { out.add(new URL(constUrls[c]).hostname); } catch { /* not a URL */ } }
    }
    return out;
  };
  // Constants hold most of the URLs (`const S4_URL = 'https://…'`), so resolve
  // any all-caps identifier the body mentions against its declaration too.
  const constUrls = {};
  for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]+)\s*=\s*['"`](https?:\/\/[^'"`]+)/g)) constUrls[m[1]] = m[2];

  const hostsFor = {};
  for (const fn of ['computeS1', 'computeS2', 'computeS3', 'computeS4', 'computeCapture', 'computeEuribor']) {
    const body = bodyOf(fn);
    if (body == null) continue;
    const hosts = new Set(hostsIn(body));
    // ONE level of named-helper indirection. computeS1 holds no URL at all —
    // ENTSO-E lives in `fetchBzn`, which computeS1 calls. Without this the graph
    // reports S1's metrics as orphans, which would say "these have no source"
    // when the truth is "this derivation could not see one" — a negative about
    // the probe reported as a fact about the world (B11).
    for (const call of new Set([...body.matchAll(/\b([a-z][A-Za-z0-9_]{3,})\s*\(/g)].map((x) => x[1]))) {
      // Const resolution applies inside HELPERS too, not only in the top body.
      // computeS1 → fetchBznGuarded → fetchBzn → ENTSOE_API is two levels of
      // indirection plus a constant, and without following all three the S1
      // metrics report as orphans while ENTSO-E is plainly their source.
      const sub = bodyOf(call);
      if (sub) for (const h of hostsAndConstsIn(sub, constUrls)) hosts.add(h);
    }
    for (const c of new Set([...body.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)].map((x) => x[1]))) {
      if (constUrls[c]) { try { hosts.add(new URL(constUrls[c]).hostname); } catch { /* not a URL */ } }
    }
    hostsFor[fn] = [...hosts];
  }
  return { writers, hostsFor };
}

/* ── Graph construction ─────────────────────────────────────────────────── */

const metrics = readMetricRegistry();
const register = readRegister();
const manifests = readManifests();
const { writers, hostsFor } = readKvWriters();

const nodes = [];
const edges = [];
const add = (n) => { if (!nodes.some((x) => x.id === n.id)) nodes.push(n); return n.id; };
const link = (from, to, kind = 'derives_from') => {
  if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, kind });
};

/** Which compute function owns a KV key — by the key the function's writes name. */
const SIGNAL_FN = { s1: 'computeS1', s2: 'computeS2', s3: 'computeS3', s4: 'computeS4', s1_capture: 'computeCapture', euribor: 'computeEuribor' };

// ── Chain 1: observation ────────────────────────────────────────────────
for (const m of metrics) {
  const metricId = `metric:${m.id}`;
  add({
    id: metricId, kind: 'metric', chain: 'observation',
    label: m.label, meaning: m.meaning, introduced: m.introducedPhase,
    surfaced_in: null,          // filled below from a component grep
    freshness: 'cron-refreshed',
  });
  if (!m.workerPath) continue;

  const fieldId = `field:${m.workerPath}`;
  add({ id: fieldId, kind: 'engine_field', chain: 'observation', label: m.workerPath, freshness: 'cron-refreshed' });
  link(metricId, fieldId);

  const kvKey = m.workerPath.split('.')[0];
  const kvId = `kv:${kvKey}`;
  add({
    id: kvId, kind: 'dataset', chain: 'observation', label: `KV \`${kvKey}\``,
    writers: writers[kvKey] ?? 0,
    freshness: writers[kvKey] ? 'cron-refreshed' : 'UNKNOWN — no KKME_SIGNALS.put found for this key',
  });
  link(fieldId, kvId);

  const fn = SIGNAL_FN[kvKey];
  for (const host of (fn ? hostsFor[fn] ?? [] : [])) {
    if (host.includes('kkme')) continue;
    const srcId = `source:${host}`;
    add({ id: srcId, kind: 'external_source', chain: 'observation', label: host, freshness: 'live' });
    link(kvId, srcId);
  }
}

// ── Chain 2: parameter ──────────────────────────────────────────────────
for (const r of register) {
  const paramId = `param:${r.id}`;
  add({
    id: paramId, kind: 'parameter', chain: 'parameter',
    label: r.label ?? r.id, category: r.category ?? null,
    value: r.value ?? null, unit: r.unit ?? null,
    engine_binding: r.engine_binding ?? null,
    sensitivity_range: r.sensitivity_range ?? null,
    freshness: 'static parameter',
    // `internal-only` is explicit, per the dangling gate: a parameter that
    // reaches no published metric must SAY it is internal, not merely be one.
    internal_only: /internal|diagnostic/i.test(String(r.note ?? '')),
  });

  if (r.engine_binding) {
    const bId = `binding:${r.engine_binding}`;
    add({ id: bId, kind: 'engine_field', chain: 'parameter', label: r.engine_binding, freshness: 'static parameter' });
    link(paramId, bId);
  }
  if (r.source) {
    // A cited source is a source. URLs where present, the citation string
    // otherwise — a prose citation is weaker evidence and is labelled as such.
    const urls = [...String(r.source).matchAll(/https?:\/\/[^\s)»,]+/g)].map((x) => x[0]);
    if (urls.length) {
      for (const u of urls) {
        const sId = `source:${u}`;
        add({ id: sId, kind: 'external_source', chain: 'parameter', label: u, cited: true, freshness: 'static citation' });
        link(paramId, sId);
      }
    } else {
      const sId = `source:cited:${r.id}`;
      add({ id: sId, kind: 'external_source', chain: 'parameter', label: String(r.source).slice(0, 160), cited: true, url: null, freshness: 'static citation' });
      link(paramId, sId);
    }
  }
}

// ── Datasets from manifests ─────────────────────────────────────────────
for (const m of manifests) {
  const dId = `dataset:${m.dir}`;
  add({
    id: dId, kind: 'dataset', chain: 'parameter', label: m.dataset,
    licence: m.licence, resolution: m.resolution, timezone: m.timezone,
    last_successful_refresh: m.last_successful_refresh ?? null,
    retrieved_at: m.retrieved_at ?? null,
    freshness: m.last_successful_refresh ? 'cron-refreshed' : 'static (never refreshed on a schedule)',
  });
  for (const u of m.source_urls ?? []) {
    const sId = `source:${u}`;
    add({ id: sId, kind: 'external_source', chain: 'parameter', label: u, freshness: 'live' });
    link(dId, sId);
  }
}

// ── Where each metric is surfaced (route + component) ────────────────────
function surfacesFor(metricId) {
  const appDir = join(ROOT, 'app');
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const t = readFileSync(p, 'utf8');
      if (t.includes(metricId)) hits.push(p.slice(ROOT.length + 1));
    }
  };
  try { walk(appDir); } catch { /* app/ absent */ }
  return hits;
}
for (const n of nodes) {
  if (n.kind !== 'metric') continue;
  n.surfaced_in = surfacesFor(n.id.replace('metric:', ''));
}

/* ── Staleness inheritance: a metric is only as fresh as its oldest ancestor ── */

const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
const outEdges = {};
for (const e of edges) (outEdges[e.from] ||= []).push(e.to);

function ancestors(id, seen = new Set()) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const t of outEdges[id] ?? []) ancestors(t, seen);
  return seen;
}

for (const n of nodes) {
  if (n.kind !== 'metric' && n.kind !== 'parameter') continue;
  const anc = [...ancestors(n.id)].map((i) => byId[i]).filter(Boolean);
  const stamps = anc.map((a) => a.last_successful_refresh ?? a.retrieved_at).filter(Boolean).sort();
  n.reaches_external_source = anc.some((a) => a.kind === 'external_source');
  n.ancestor_count = anc.length - 1;
  // The generalised S1-badge lie: a metric that reads live while resting on a
  // dataset last refreshed months ago. COMPUTED from the ancestors, never
  // asserted (rule #2).
  n.effective_freshness_from = stamps.length ? stamps[0] : null;
  n.effective_freshness_note = stamps.length
    ? `oldest ancestor stamp ${stamps[0]}`
    : 'no dated ancestor — freshness cannot be computed for this node';
}

/* ── Emit ───────────────────────────────────────────────────────────────── */

nodes.sort((a, b) => a.id.localeCompare(b.id));
edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));

const metricNodes = nodes.filter((n) => n.kind === 'metric');
const paramNodes = nodes.filter((n) => n.kind === 'parameter');

const graph = {
  _note: 'GENERATED by tools/provenance/build-graph.mjs. Do not hand-edit — a hand-written '
       + 'provenance file is exactly the kind of artifact that outlives its truth (A9).',
  _chains: {
    observation: 'metric → payload field → KV key → fetcher → external source',
    parameter: 'published figure → engine constant → register row → cited source',
    _disjoint: 'These two chains share NO join key. metricRegistry.workerPath names a field on '
             + 'an observed payload; register.engine_binding names a model parameter. Measured: '
             + `0 of ${metrics.length} workerPaths match any of ${register.filter((r) => r.engine_binding).length} engine_bindings. `
             + 'They are disjoint, not incompatible, and fusing them by a hand-written key map '
             + 'would be a fiction — an RTE constant is not upstream of an installed-MW observation.',
  },
  counts: {
    metrics: metricNodes.length,
    metrics_reaching_a_source: metricNodes.filter((n) => n.reaches_external_source).length,
    parameters: paramNodes.length,
    parameters_reaching_a_source: paramNodes.filter((n) => n.reaches_external_source).length,
    datasets: nodes.filter((n) => n.kind === 'dataset').length,
    external_sources: nodes.filter((n) => n.kind === 'external_source').length,
    nodes: nodes.length,
    edges: edges.length,
  },
  // ── Staleness-inheritance coverage, stated rather than implied ──────────
  //
  // The finding this block exists to make un-ignorable: the mature-market
  // evidence base is refreshed monthly, its freshness IS monitored
  // (`npm run evidence:freshness`), and NOTHING that consumes it inherits that
  // freshness. Measured: 1 of 70 register rows cites a URL at all — the other
  // 69 cite prose ("NREL ATB", "Manufacturer warranty floors") — and that one
  // URL matches no manifest host. Host overlap between register citations and
  // dataset manifests is ZERO.
  //
  // So gate 3 can compute inherited freshness for the observation chain and
  // cannot for the parameter chain, because the edge it would travel does not
  // exist. That is reported as a coverage number, not hidden behind a null.
  staleness_inheritance: {
    nodes_with_a_dated_ancestor: nodes.filter((n) => n.effective_freshness_from).length,
    parameters_with_a_dated_ancestor: paramNodes.filter((n) => n.effective_freshness_from).length,
    parameters_total: paramNodes.length,
    datasets_with_a_refresh_stamp: nodes.filter((n) => n.kind === 'dataset' && n.last_successful_refresh).length,
    _gap: 'No register row references a dataset, so no parameter can inherit the evidence '
        + "base's freshness. Fixing it is one field on the register row (`dataset: 'da'`), "
        + 'not new machinery — and until then a parameter sourced from a series last refreshed '
        + 'months ago is indistinguishable from one sourced yesterday.',
  },
  orphans: metricNodes.filter((n) => !n.reaches_external_source).map((n) => n.id),
  dangling_parameters: paramNodes.filter((n) => !n.reaches_external_source && !n.internal_only).map((n) => n.id),
  nodes,
  edges,
};

const json = `${JSON.stringify(graph, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== json) {
    console.error('docs/provenance/graph.json is out of date — run `node tools/provenance/build-graph.mjs`');
    process.exit(1);
  }
  console.log('graph.json matches the tree');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, json);
console.log(`wrote ${OUT}`);
console.log(`  ${graph.counts.nodes} nodes · ${graph.counts.edges} edges`);
console.log(`  metrics reaching a source: ${graph.counts.metrics_reaching_a_source}/${graph.counts.metrics}`);
console.log(`  parameters reaching a source: ${graph.counts.parameters_reaching_a_source}/${graph.counts.parameters}`);
console.log(`  orphans: ${graph.orphans.length}${graph.orphans.length ? ` — ${graph.orphans.join(', ')}` : ''}`);
console.log(`  dangling parameters: ${graph.dangling_parameters.length}`);

export { graph };
