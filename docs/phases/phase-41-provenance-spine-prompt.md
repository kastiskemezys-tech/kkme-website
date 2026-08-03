# Phase 41 — the provenance spine: connect the parts that already exist (overnight item 3)

**Branch:** `phase-41-provenance-spine`. **Autonomous, box 2 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** The platform has accumulated genuine assets that do not know about each other: the fleet DB and its verification tiers (37), the mature-market evidence base and its monthly refresh (E0/E0.1), the assumptions register and changelog (36.B6), the metric registry (12.12), the run registry, the per-service models built but unwired (E1/E2), the debt-sizing solver (39), the 400-day capture archive. **Nothing today can answer, mechanically, "where does this published number come from, all the way down."** That question is what a lender asks, what the report generator needs, and what makes the calculator defensible.

This phase builds the spine, not new content.

---

## 1 · Pause A — what already exists (A7, counts and file:line)

`app/lib/metricRegistry.ts` · `tools/consultancy/assumptions-register.json` · the changelog · the run registry · `docs/methodology-lender.md` sections · the evidence-base manifests · KV key writers. For each: what it knows, what identifies a record, and whether records reference each other today.

**Report the overlap honestly.** If two of these already do the same job, say so — the answer may be that the spine is mostly assembly, not construction (rule #4: one implementation).

## 2 · The artifact — a provenance graph, generated not written

Build `tools/provenance/build-graph.mjs` producing `docs/provenance/graph.json`:

```
node  = published metric | engine field | parameter | dataset | external source
edge  = "derives from"  (metric → field → parameter → dataset → source URL/manifest)
```

Every node carries: id, human label, where it is surfaced (route + component, if surfaced), its register/manifest record if it has one, and its freshness semantics (live / cron-refreshed / static parameter).

Generate from what already exists — metric registry, register, manifests, KV writer map. **Do not hand-author the graph**; hand-authoring guarantees drift (A9), and a hand-written provenance file is exactly the kind of artifact that outlives its truth.

## 3 · The gates that make it worth having

1. **Orphan check:** every metric in the metric registry reaches at least one external source through the graph. Orphans fail, listed by name.
2. **Dangling check:** every register parameter is reachable from at least one published metric, or is explicitly marked `internal-only`. This surfaces parameters that exist and affect nothing (`effective_arb_pct` was exactly that for months) and parameters that affect something but nobody knows what.
3. **Staleness inheritance:** a metric's effective freshness is the OLDEST of its ancestors. Compute it; a metric that looks live but rests on a dataset last refreshed in March is the S1-badge lie generalised.
4. Each gate proven by inject-then-revert.

## 4 · One consumer, to prove the spine is real

Add a single machine-readable endpoint or build output — `provenance.json` shipped alongside, or `GET /provenance` — that the report generator (item 4) and the calculator (item 5) can both read. **No public UI in this phase.** The point is that the next two items consume it rather than each inventing their own source lists.

## STOP conditions
- The registries turn out to be incompatible in identity (no stable key to join on) → report the join problem and what a fix would require; do not invent a key mapping by hand.
- More than half the metric-registry entries cannot be resolved to a source → stop and report the coverage number; a spine that covers a minority is a false comfort.

## Gates on this phase
`/revenue` 54/54 byte-identical · graph is generated and reproducible (running twice yields identical bytes) · three gates proven failable · no hand-authored graph content · `docs/_private/` never staged · NDA gate runs.

## PR body must contain
Coverage: metrics resolved to a source / total. Orphan list. Dangling-parameter list. The three most interesting staleness inheritances found.
