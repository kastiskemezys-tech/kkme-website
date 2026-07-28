# Phase 34 arc — Consultancy revenue-model engine (permanent platform capability)

**Owner:** Cowork-authored 2026-07-22. Operator-owned document (rule #5 applies — CC reads, never edits).
**Trigger:** Prosperus 3-project BESS revenue-modelling engagement (€10k, v0.5 due 2026-07-31). Operator directive: *"start scoping each phase prompt for KKME website to be able to deliver this for me no matter what for any future jobs like these."*
**Framing:** every phase serves the Prosperus deliverable AND lands as permanent KKME platform capability. Next client engagement of this shape should take ~3 days, not 9, because the engine work persists.

---

## The deliverable contract (what v0.5 must produce)

Locked with client via mockup `prosperus-mockup-v5.html` (KKME Website folder). Client scope (Indrė Lukošaitienė, 2026-07-22):

- Independent revenue + EBITDA model per project + consolidated portfolio
- DA + intraday charging/discharging cashflows (4 lines)
- FCR / aFRR / mFRR capacity + activation (6 lines)
- Dispatch physics at annual/monthly resolution (efficiency, SoC-budget, availability, degradation, cycle limits, grid constraints) — **hourly chronological is v1.0 extended scope, agreed with client**
- Central / Upside / Downside with Baltic saturation + cannibalisation
- Adjustable assumptions (39-row register)
- The 8-line bridge exactly: Gross → less charging → Net → less optimiser/grid/market/operating → EBITDA → less maintenance/augmentation/replacement CAPEX → Pre-financing CF
- Deliverables: editable Excel + assumptions register + scenario selector + per-project & portfolio outputs + reconciliation (external benchmarks; vs Prosperus model only if shared)
- Debt / interest / DSCR excluded

**The 3 projects:** Bitėnai 48/96 (UAB "Baltakis Capital", VERT L-7441, COD 2028-01) · Stoniškiai 45/90 (Prosperus bess 1 UAB, VERT L-7162, COD 2028-06) · Eigirdžiai 30/60 (same SPV, VERT L-7179, COD 2029-Q1). All public-register data. Client-provided technical docs, if any arrive, stay in `docs/_private/` (NDA discipline per Phase 32 precedent).

---

## Architecture decisions (pre-made, CC verifies at Pause A)

1. **Engine extensions live in `workers/fetch-s1.js`** — computeRevenueV7 gains per-project parameterisation. Worker stays the single engine home (rule #4).
2. **Consultancy tooling lives in `tools/consultancy/`** (new directory) — Node scripts that drive the engine the way `scripts/audit-stack.mjs --probe-v73` already does (existing pattern, Phase 32.1 precedent). NOT worker routes — deliverable generation is a build-time concern, not a serving concern.
3. **Project inputs as JSON** — `tools/consultancy/projects/<client>/<project>.json` holds `{project_id, name, mw, mwh, poi, cod, warranty_efc_yr, grid_headroom_mw, notes}`. Gitignored per-client directory if inputs are client-confidential; Prosperus inputs are public-register so committable.
4. **Assumptions register as structured data** — `tools/consultancy/assumptions-register.json` (39 rows: id, category, label, value, unit, source, sensitivity_range, override). Excel export generates FROM this. Single source of truth (rule #4; extends `project_reference_asset_single_source` memory).
5. **Public site unchanged this arc** — reference asset stays 50/100. A public per-project calculator is a future phase (35+), NOT now.
6. **No new external data dependencies** — v0.5 runs entirely on the already-calibrated engine + BTD/S1/S4 live inputs. ENTSO-E integration is deferred (was in an earlier over-plan; not needed for v0.5).

---

## Phase sequence + day packing (July 23 → 31)

Serial per `feedback_cowork_cc_sequencing.md` — one phase lands end-to-end before the next prompt is authored. Prompts authored just-in-time; this arc doc carries the scope-level definition.

### Phase 34.1 — Per-project engine parameterisation (~1.5 days · Wed 23-Thu 24)
`computeRevenueV7` accepts a project-config object instead of hardcoded 50/100 reference. Reference asset becomes just another config. 3 Prosperus configs added. Output: per-project full engine JSON verified for all 3 + unchanged reference-asset output (regression gate: public /revenue byte-identical).
**Platform value:** any future project computable in minutes.
**Full prompt:** `phase-34-1-prompt.md` (authored, see file).

### Phase 34.2 — Cost decomposition + CAPEX schedule (~1 day · Fri 25)
Split `opex_y1` lump into optimiser (12% gross) / grid (3%) / market (1%) / operating (€29/kW/yr) — each with basis + override handle. Add explicit CAPEX lines: maintenance €4/kW/yr annual, augmentation Y8 trigger (40% MWh × BNEF-2035 €80/kWh), replacement Y15 (85% × €120/kWh). 20-yr cash flow gains the two CAPEX events. Bridge output structure = client's 8 lines exactly.
**Platform value:** RevenueCard drawer can later show honest cost stack; LCOS math gains explicit augmentation.

### Phase 34.3 — Portfolio aggregation (~1 day · Sat 26)
Multi-project rollup: staggered-COD weighting (partial-year operational months), portfolio bridge = Σ projects per line (tie-out enforced), correlation disclosure (LT zone ~0.97 — no fake diversification). Output: portfolio JSON with per-project + consolidated.
**Platform value:** fleet-level economics for any future multi-asset client.

### Phase 34.4 — Scenario drivers + sensitivity engine (~1 day · Mon 28)
Map existing base/conservative/stress to client-facing Central/Downside/Upside with the 6 explicit driver deltas (fleet realisation 50/65/35%, spread growth +2/−1/+3.5%, availability 97/95/98%, trading realisation 0.85/0.78/0.88, cap prices 0/−25/+20%, CPI floor 0.30/0.28/0.35). Sensitivity runner: perturb each of 8 drivers one-at-a-time, emit Δ EBITDA table.
**Platform value:** scenario selector for the live site later; sensitivity becomes a KKME card candidate.

### Phase 34.5 — Assumptions register + reconciliation harness (~1 day · Tue 29)
`assumptions-register.json` (39 rows, sources cited, ranges). Reconciliation runner: 7 internal tie-outs (bridge arithmetic, portfolio=Σ, energy balance, monthly=annual) + 6 external benchmarks (Clean Horizon IRR band, BTD backtest ±8%, Modo cycles, BNEF CAPEX, CH margin, EBRD Hertz 1) — all as automated asserts that fail loudly. Vitest suite.
**Platform value:** the reconciliation harness becomes a permanent CI gate for engine changes — every future engine PR proves it still ties out.

### Phase 34.6 — Excel generator (~1.5 days · Wed 30)
`tools/consultancy/generate-xlsx.mjs` via SheetJS (or exceljs for formula support): 8 tabs — Cover · Assumptions (editable, feeds formulas) · Bridge Y1 (per-project + portfolio) · 20-yr CF · Scenarios · Sensitivity · Reconciliation · Glossary. Scenario selector = dropdown cell driving formula switches. Numbers formula-linked to assumptions tab where feasible; static-value fallback where formula-linking exceeds timeline.
**Platform value:** any future engagement gets Excel export for free.

### Phase 34.7 — Branded HTML/PDF summary + delivery QC (~1 day · Thu 31)
Generate the client-facing summary from `prosperus-mockup-v5.html` as template with real computed numbers injected. Print-to-PDF (8pp exec summary + 4pp methodology annex from docs/methodology.md). Final QC: rerun reconciliation harness, verify mockup-vs-delivered numbers match, package: 1×xlsx + 2×pdf. Deliver.
**Platform value:** the Baltic-birch deliverable template is reusable; brand asset.

**Slack:** none — July 31 is hard. If any phase overruns, cut from 34.6 (formula-linking → static values) never from 34.5 (reconciliation is the credibility spine).

---

## v1.0 extended backlog (post-July-31, +€8-12k if client converts)

- **34.8** — Hourly chronological dispatch (8760 × 3 projects) — the "chronological" scope word, 3-4 days
- **34.9** — SOH trajectory with augmentation-restoration modelling — 1-2 days
- **34.10** — Dispatch visuals (day/week/heatmap) + saturation visuals + tornado + Gantt — 2-3 days
- **34.11** — Register expansion 39 → 78 rows — 1-2 days
- **34.12** — Designer-polished PDF — 1-2 days

## Platform follow-ups (separate from client work, file when arc ships)

- **Phase 35 candidate** — public per-project calculator on kkme.eu (lead-gen; engine already parameterised after 34.1)
- **Phase 36 candidate** — reconciliation harness promoted to CI gate on every worker PR
- **Phase 37 candidate** — RevenueCard drawer cost-stack + augmentation-schedule surfacing (34.2 outputs, public-site side)

---

## Discipline rules for every phase in this arc

- Rule #1 audit-triage: 9 consecutive prompt-premise corrections to date — every premise in these prompts is a hypothesis for CC's Pause A. Architecture decisions above included.
- Rule #4: one canonical source per quantity — project configs, assumptions register, engine constants. No parallel literals.
- Rule #5: roadmap + this arc doc are operator-owned.
- NDA: nothing client-confidential in commits. Prosperus project data used is public-register (VERT/Litgrid). Client docs → `docs/_private/`.
- Public site regression gate every phase: `/revenue` for the 50/100 reference must stay byte-identical until explicitly changed.
- CC runs `npx wrangler deploy` after origin-SHA check (only phases that touch the worker: 34.1-34.4; 34.5-34.7 are tools-only, no deploy).
- Session 74 origin-verify before any "shipped" claim.
