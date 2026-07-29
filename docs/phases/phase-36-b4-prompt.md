# Phase 36.B batch-4 — 36.B6 governance + lender-grade methodology (arc close)

**Branch:** `phase-36-b-batch-4` off latest main. **Autonomous. Closes the 36.B arc.**
**Estimate:** ~1.5-2 days. **Risk class: LOW — tooling + documentation; worker READ-ONLY.**
Arc doc governs (`phase-36-b-arc.md` §36.B6); this prompt adds batch specifics + accumulated context.

## Part 0 — Repo hygiene (5 min, first commit)
`git rm --cached logs/btd.log` + add `logs/` to `.gitignore` (check nothing else tracked under logs/ matters first). This file blocked a rebase and contributed to two stale deploys on 2026-07-29 — it should never have been tracked.

## Part 1 — Run registry
- Every runner invocation appends to `tools/consultancy/runs.jsonl` (committed): `{run_id, timestamp, engine_git_sha, input_hash, output_hash, data_vintage, register_version}`.
- All generators (xlsx, deliverable HTML, PDFs) stamp their outputs with the run_id — report footers carry it.
- Test: two runs with identical inputs produce identical output_hash; any input change changes it.

## Part 2 — Assumption changelog formalisation
- The register gains structured version history (batch-3's manual entries migrate in): every value change = `{date, old, new, reason, source, decided_by}`.
- `register_version` (monotonic or content-hash) referenced by the run registry.
- The two measured-value cutovers (0.85→0.7234, 0.14→0.0885) and the cycling revision (678→498) become the founding changelog entries with their full evidence trail.

## Part 3 — Lender-grade methodology document
`docs/methodology-lender.md` per the arc spec. Assemble from what the arc PRODUCED — this document mostly already exists in fragments (DECISIONS.md files, handover entries, module headers, the audit doc). Structure:

1. Engine overview + calibration register (sources, dates, review cycle)
2. Dispatch policy — the B1 pseudocode verbatim + constraint set + the 84.0 % simultaneity measurement and its method
3. Measured parameters — B3's realisation backtest (0.7234, 349 days, monthly table, leakage checks) + 15-min uplift (0.0885) + the assumed-vs-measured comparison
4. Probabilistic method — B2's bootstrap: sample construction, 2026 exclusion evidence, the P90 resolution boundary and the primary/sensitivity presentation policy, regime asymmetry (pre/post-sync)
5. Degradation + duration — B5's loop (3-pass convergence, measured residual), dur_h interpolation policy, the cycling revision (498 EFC) with its two independent corroborations and the declared Modo-band breach
6. Contracted structures — B4's overlay mechanics + tail-truncation behaviour
7. Reconciliation framework — the check inventory, current status incl. declared WARNs/breaches with reasons
8. Data lineage — sources, vintages, resolutions (incl. the PT15M transition), BTD outage handling
9. **Known limitations** — the honest list: reserve realisation assumed (D3 boundary) · reserve prices flat in bootstrap · single-year realisation window · N=5 P90 boundary · activation modelled up-only · anything else DECISIONS.md flagged. The advisor finds these anyway; pre-listing them is the trust play.
10. Model governance — run registry, changelog, versioning, remeasurement cycle

Target 25-40 pp rendered. Written for a bank's technical advisor: every claim either derived in-document or cited to a run_id / source.

## Part 4 — Render + arc wrap
- PDF via the existing playwright pipeline + same-brand wrapper (34.7 pattern).
- Regenerate the full delivery bundle on the post-cutover engine (new run_ids, stamped) — the Prosperus files auto-update to the measured basis.
- Final reconciliation run across everything; suite green; `git diff main -- workers/` empty.
- Handover: arc-closing summary (all 6 phases, the measured-vs-assumed ledger, remaining open items routed — B0-G forecast plumbing, BTD fallback trigger 08-01, reserve-price fallback, dispatch-card cutover to hourly engine as Phase 37 candidate), PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-b-batch-4`
