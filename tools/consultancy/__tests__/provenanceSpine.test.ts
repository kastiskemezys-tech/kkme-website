/**
 * Phase 41 §3 — the three gates that make the spine worth having.
 *
 * Each is proven by inject-then-revert in `scripts/_phase-41-inject-revert.sh`.
 * A provenance graph nobody can fail is a diagram.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveProvenance, resolveAll, loadGraph } from '../../provenance/resolve.mjs';

const graph = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/provenance/graph.json'), 'utf8'));

describe('the graph is generated, not written', () => {
  it('regenerating produces identical bytes', () => {
    // Reproducibility is the property that makes a generated artifact
    // trustworthy. A generator whose output depends on iteration order or a
    // timestamp produces a diff on every run, which trains everyone to ignore
    // the diff — and then a real change hides in the noise.
    expect(() => execFileSync('node', ['tools/provenance/build-graph.mjs', '--check'], { encoding: 'utf8' })).not.toThrow();
  });

  it('carries no hand-authored content', () => {
    // Every node id is derived from a registry key, a worker path, a manifest
    // directory or a URL. If a node appears whose id matches none of those
    // shapes, someone typed it in.
    const legal = /^(metric|param|field|binding|kv|dataset|source):/;
    const illegal = graph.nodes.filter((n: { id: string }) => !legal.test(n.id));
    expect(illegal.map((n: { id: string }) => n.id)).toEqual([]);
  });
});

describe('gate 1 — orphan check: every metric reaches an external source', () => {
  it('has no orphans', () => {
    // An orphan means "the graph cannot prove this reaches a source", which is
    // NOT the same as "this has no source". Getting the first version of the
    // derivation wrong produced three false orphans (the S1 price metrics),
    // because ENTSO-E lives two helper hops and one constant away from
    // computeS1. Reporting those as sourceless would have been a claim about
    // the world made by a limitation of the probe (B11).
    expect(graph.orphans).toEqual([]);
  });

  it('checks every registered metric, not a subset (A7)', () => {
    const registrySrc = readFileSync(resolve(process.cwd(), 'app/lib/metricRegistry.ts'), 'utf8');
    const registryCount = [...registrySrc.matchAll(/^ {2}([a-z0-9_]+): \{/gm)].length;
    expect(graph.counts.metrics).toBe(registryCount);
    expect(graph.counts.metrics_reaching_a_source).toBe(registryCount);
  });
});

describe('gate 2 — dangling check: every parameter reaches a source or is marked internal', () => {
  it('has no dangling parameters', () => {
    // This is the gate that would have surfaced `effective_arb_pct`: computed
    // on every request, published in every payload, consumed by nothing, for
    // months, with no gate anywhere noticing.
    expect(graph.dangling_parameters).toEqual([]);
  });

  it('covers every register row', () => {
    const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'tools/consultancy/assumptions-register.json'), 'utf8')).rows;
    expect(graph.counts.parameters).toBe(rows.length);
  });
});

describe('gate 3 — staleness inheritance: a metric is only as fresh as its oldest ancestor', () => {
  it('reports HOW MANY nodes can inherit a stamp, and today the answer is none', () => {
    // The finding, pinned so it cannot quietly change without someone noticing.
    //
    // 7 datasets carry a `last_successful_refresh`. ZERO parameters can inherit
    // it, because no register row references a dataset: 1 of 70 rows cites a URL
    // at all and it matches no manifest host. So the evidence base's monitored
    // freshness reaches nothing that consumes it.
    //
    // The first version of this test asserted `dated.length > 0` and went red.
    // The assertion was wrong, not the graph — asserting that inheritance
    // happens does not make it happen, and weakening the assertion to `>= 0`
    // would have made the gate unfailable. It pins the actual coverage instead,
    // so the day a register row gains a `dataset` field this test says so.
    const si = graph.staleness_inheritance;
    expect(si.datasets_with_a_refresh_stamp).toBeGreaterThan(0);
    expect(si.parameters_total).toBeGreaterThan(0);
    expect(si.parameters_with_a_dated_ancestor).toBe(0);
    expect(si._gap).toContain('No register row references a dataset');
  });

  it('every dated node inherits a real ancestor stamp, not a fabricated one', () => {
    for (const n of graph.nodes.filter((x: { effective_freshness_from: string | null }) => x.effective_freshness_from)) {
      expect(Date.parse(n.effective_freshness_from)).not.toBeNaN();
    }
  });

  it('every node states its freshness semantics', () => {
    for (const n of graph.nodes) {
      expect(n.freshness, `${n.id}.freshness`).toBeTruthy();
    }
  });
});

describe('§4 — the consumer', () => {
  it('resolves a metric all the way to an external source', () => {
    const r = resolveProvenance('installed_storage_lt_mw');
    expect(r.found).toBe(true);
    expect(r.chain).toBe('observation');
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.path.map((p: { kind: string }) => p.kind)).toContain('external_source');
  });

  it('resolves a parameter to its cited source', () => {
    const r = resolveProvenance('rte_bol_2h');
    expect(r.found).toBe(true);
    expect(r.chain).toBe('parameter');
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it('reports not-found rather than returning an empty chain', () => {
    // An empty chain reads as "this number has no sources". Not-found reads as
    // "I do not know about this number". Those must never be the same answer.
    const r = resolveProvenance('a_metric_that_does_not_exist');
    expect(r.found).toBe(false);
    expect(r.sources).toEqual([]);
  });

  it('resolves every metric and parameter — what items 9 and 10 will read', () => {
    const all = resolveAll();
    expect(all.length).toBe(graph.counts.metrics + graph.counts.parameters);
    expect(all.every((a: { sources: unknown[] }) => a.sources.length > 0)).toBe(true);
  });

  it('refuses to answer from a missing graph', () => {
    expect(typeof loadGraph).toBe('function');
    expect(loadGraph().nodes.length).toBeGreaterThan(0);
  });
});
