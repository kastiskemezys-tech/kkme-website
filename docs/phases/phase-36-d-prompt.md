# Phase 36.D — Litgrid flexibility-forecast integration (demand-side calibration + live-update)

**Branch:** `phase-36-d-litgrid-forecast` off latest main.
**Mode:** semi-autonomous, **TWO checkpoints** — CP-1 after Pause A (primary source + definitional mapping; wrong mapping corrupts every forecast) and CP-2 after Pause B's impact quantification (demand-side changes move sd_ratio → CPI → every published and client-facing number; operator signs the deltas before ship).
**Estimate:** ~2-2.5 days.
**Risk class:** HIGH on correctness (this becomes the demand foundation of every forecast KKME publishes or sells), MEDIUM on code risk (CPI floor bounds the arithmetic blast radius — but "the floor hides it" is not a correctness argument).

## Why this phase exists, precisely

KKME's engine computes `sd_ratio = weighted_supply / eff_demand`, where `eff_demand = 935 MW` — **a static scalar with no source lineage, no year variation, and no documented relationship to the engine's own `/s2` procurement demand (752 MW = aFRR 120 + mFRR 604 + FCR 28)**. Two undocumented numbers, 24 % apart, one frozen in time.

Litgrid — the LT TSO, the entity that actually procures the flexibility — publishes an official year-by-year flexibility-need forecast with composition detail, alongside its own BESS build-out projection. As transcribed from the secondary source (LinkedIn, Adam Erki Enok, 2026-07-29 — **every number below requires primary-document verification, rule #3**):

**Flexibility demand (MW / MWh):**

| Component | 2028 | 2030 | 2033 | 2035 |
|---|---|---|---|---|
| System needs — short-term | 429 / 982 | 484 / 1789 | 415 / 1414 | 536 / 848 |
| Network needs — DSO | 30 / — | 42 / — | 77 / — | 108 / — |
| Specific — FCR | 14 / 28 | 18 / 36 | 23 / 46 | 25 / 50 |
| Specific — IZDR | 200 / 200 | 200 / 200 | 0 / 0 | 0 / 0 |
| Specific — GAGAP | 154 / 154 | 154 / 154 | 354 / 354 | 354 / 354 |
| Specific — LT-PL | 146 / 146 | 146 / 146 | 0 / 0 | 0 / 0 |
| **Total** | **973 / 1519** | **1044 / 2325** | **869 / 1814** | **1023 / 1252** |

**BESS build-out (Litgrid's own projection):** end-2028 **3.12 GW** in LT (1.26 GW LTsC + 0.97 GW "additional resources" + protocols of intent); 2030: 2.12 + 1.04; 2033: 2.43 + 0.87; 2035: 2.65 + 1.02; "developer connection indications" flat at 4.76 GW.

The assessment quoted: *"The additional flexibility need remains at approximately 1 GW in all analyzed years."*

**Why it's crucial:** any advisor, investor, or competitor holding this public TSO slide against a KKME report will check whether our demand side reconciles with the TSO's. Today it can't be checked at all — our number has no provenance. After this phase: our demand trajectory is TSO-derived, component-mapped, versioned, reconciliation-tested, and self-updating on Litgrid's publication cadence.

## Discipline rules load-bearing here

- **#1 (23+ corrections and counting):** every number above is from a screenshot of someone's excerpt. Every claim in this prompt is a hypothesis. The primary document decides.
- **#3:** the LinkedIn post is a secondary source. NOTHING enters the engine without the primary Litgrid document URL, and every adopted figure verified against it.
- **#4:** ONE canonical demand-forecast module. `eff_demand`, the register, the methodology doc, the reconciliation checks — all read from it. The 935 dies; the 935-vs-752 discrepancy gets resolved or explicitly documented in the same pass.
- **#2 (no hardcoded temporal labels):** interpolation/extrapolation computed from the published year-index, never hand-spread across years.
- **Rule-#5:** roadmap/arc docs untouched.
- **Failure-modes playbook:** read `docs/playbooks/failure-modes.md` before Pause A. At CP-1, explicitly answer the four questions: (a) which premises in this prompt are HYPOTHESIS vs verified — including every number in the transcribed table, (b) what consumes what this phase changes (eff_demand's full consumer graph, by grep), (c) what fails silently in what this phase touches and how would we know, (d) at which layer and at what time will success be verified. Note this prompt already carries known A5 (screenshot source) and A9 (static-935 archaeology) instances — they are the phase's subject matter.

---

## Pause A — Primary source, definitions, mapping (~1 day) → CHECKPOINT CP-1

### A.1 Find and pin the primary document
1. Hunt litgrid.eu (LT + EN versions): candidates — "Lankstumo poreikio vertinimas" (flexibility-need assessment), the ten-year network development plan ("Dešimties metų tinklo plėtros planas") and its annexes, any dedicated storage-integration study. Also check whether 36.C's audit already pinned it (its Pause A was instructed to log the URL).
2. Pin: exact document title, URL, publication date, version/year of the plan, and WHERE in the document the transcribed tables live (page/table numbers).
3. **Verify every transcribed number** against the document. Report any screenshot-vs-document discrepancy (the excerpt may be rounded, partial, or from a different scenario within the document — documents like this usually carry min/max scenarios; identify WHICH scenario the excerpt shows and what the others say).
4. Extract the document's own definitions of each component — do not guess: what exactly are IZDR, GAGAP, LT-PL in Litgrid's terms; what does "system needs — short-term" cover (intraday ramping? balancing energy? reserve capacity?); are DSO needs procured through markets our products participate in or bilaterally; what does the MWh column mean per component (energy need per activation? daily? the duration dimension matters for 2h-vs-4h strategy).
5. Capture the supply-side definitions equally: what qualifies as "LTsC" (grid-connection agreements signed?), "additional resources", "protocols of intent", "developer connection indications" — these must map onto KKME's STATUS_WEIGHT tiers, and the mapping is only as good as the definitions.
6. Archive the document (PDF into `tools/consultancy/data/sources/`, committed — it's public) so the provenance survives link rot.

### A.2 The definitional mapping — the phase's load-bearing work

Build the component-by-component decision table. For EACH Litgrid demand component, answer FOUR questions:

1. **Can BESS technically serve it?** (IZDR — plausibly yes; DSO congestion — depends on procurement structure.)
2. **Does KKME's revenue model have a product that earns from it?** (FCR/aFRR/mFRR yes; IZDR/GAGAP/LT-PL — we have no such revenue lines.)
3. **If BESS serves it but our model doesn't earn from it, where does it go?** This is the subtle one, get it right: a component like IZDR that BESS fleets CAN serve but that is procured OUTSIDE our modelled products is not *addressable demand* for our sd_ratio — it is **supply absorption**: MW of competing BESS that get contracted away from the aFRR/mFRR pool. Modelling it as added demand would flatter the ratio dishonestly; modelling it as supply-side absorption (deduct contracted-away MW from competing supply, per year, per the Litgrid trajectory) is the defensible treatment. Propose per component: `addressable-demand` | `supply-absorption` | `excluded (with reason)`.
4. **What's the year trajectory of the answer?** (IZDR 200→0 at 2030-33 means its absorption effect EXPIRES — competing supply comes back to the pool exactly when the fleet is largest. That compounding matters and must fall out of the data, not be hand-waved.)

Then reconcile the three demand numbers in play: Litgrid-total (973) vs KKME `eff_demand` (935) vs `/s2` procurement (752). After the mapping, each must either derive from the canonical module or be explicitly retired. The 935's archaeology (where did it come from? grep history) gets one honest paragraph.

### A.3 Scope: LT vs Baltic
`eff_demand` is Baltic; Litgrid's document is LT. Audit: does AST publish a flexibility assessment? Does Elering? Is there a joint Baltic coordinated-capacity-market demand figure (post-sync the TSOs procure aFRR/mFRR through common Baltic auctions — a JOINT procurement target may exist and would be the cleanest single source)? Propose: (a) three-TSO composite with per-country provenance, (b) LT-anchored with documented scaling factor, or (c) Baltic-auction-derived. Quantify the difference between options.

### A.4 Supply-side reconciliation
1. Map Litgrid's build-out tiers onto KKME STATUS_WEIGHT — hypothesis: LTsC ≈ our operational + under-construction + grid-agreement tiers; "additional" ≈ permitted; "intent protocols"/"indications" ≈ announced (0.1). Verify tier definitions from A.1.5 before asserting.
2. Compare trajectories on a like-for-like basis (LT-only, per tier, per year): Litgrid 3.12 GW end-2028 vs our realisation-weighted LT subset. Quantify the gap. If the TSO — who sees the actual connection agreements — implies a faster build-out than our Central 50 % realisation, that is evidence our Central is optimistic ON REVENUE (more supply sooner = more cannibalisation). Report what recalibrating to the Litgrid basis does.
3. Propose supply-side integration: (a) recalibrate realisation rates to reproduce the Litgrid trajectory, (b) add "Litgrid LTsC basis" as an explicit named scenario alongside Central/Downside/Upside, or (c) both — Central recalibrated, plus the named scenario for client conversations ("your TSO's own numbers"). Quantify each option's revenue delta.

### A.5 Live-update mechanism design
Design in full, build in Pause B:
1. **Canonical module** `tools/consultancy/data/demand-forecast.json` (or .mjs with validation): `{source: {title, url, published, plan_year, scenario_used, archived_copy}, components: [{id, definition, treatment: addressable|absorption|excluded, treatment_reason, series: {2028: {mw, mwh}, ...}}], derived: {addressable_mw_by_year, absorption_mw_by_year}, interpolation_policy, extrapolation_policy, version, adopted_by, adopted_date}`.
2. **Interpolation between published years** (2028/2030/2033/2035): linear per component (components move for structural reasons — IZDR ends, GAGAP steps — so interpolate per component THEN sum; never interpolate the total).
3. **Extrapolation beyond 2035:** our projections run to ~2048; Litgrid stops at 2035. Propose policy options with revenue impact: flat-last-value (conservative-simple) vs component-trend (GAGAP growing?) vs demand-growth-linked. Operator picks at CP-1. Whatever is picked is stated in the methodology as an explicit assumption with a register row.
4. **Tripwire:** litgrid.eu publications watcher (lv_press pattern — page-diff on the publications index, Telegram alert on new NDP/flexibility documents, cadence weekly). **Human-in-the-loop adoption, never auto-ingest:** alert → operator reviews new document → adoption run updates the module with new version + changelog entry. The tripwire is testable: fixture page-pair (old/new) → alert fires.
5. **Forecast-evolution retention:** on adoption of a new Litgrid version, the OLD version is retained in the module's history. KKME can then show "Litgrid's own forecast moved X between plan-years; here is how our numbers tracked it" — a credibility artifact no competitor bothers to build.
6. **Register + changelog:** every component treatment and both policies become register rows (`review_cycle: litgrid-annual`, `engine_binding` into the module); adoption events are changelog entries with the document diff summarised.

### CP-1 — STOP. Report:
Primary document + screenshot-verification results (discrepancies listed) · component definitions from the document · the four-question mapping table with proposed treatments · addressable-demand + absorption trajectories · 935/752 archaeology + retirement plan · LT-vs-Baltic proposal with quantified options · supply-side tier mapping + gap quantification + integration options with revenue deltas · extrapolation-policy options with deltas · update-mechanism design. **Operator approves: mapping treatments, scope option, supply-side option, extrapolation policy.**

---

## Pause B — Build (autonomous) → CHECKPOINT CP-2 before ship

1. Canonical module per approved design; validation (components sum to document totals for published years; treatments enumerate; series complete).
2. `eff_demand` becomes year-indexed from the module's addressable series; supply-side absorption applied per approved treatment; `/s2`-vs-module relationship documented in code where both appear.
3. Supply-side integration per approved option (recalibration and/or named scenario; tier mapping documented against A.1.5 definitions).
4. Interpolation/extrapolation per approved policies, per-component.
5. Tripwire + adoption workflow + fixture tests.
6. Register rows + changelog founding entries + methodology-lender.md demand-side section (the mapping table verbatim, the reconciliation-to-TSO statement, forecast-evolution commitment).
7. **Reconciliation harness additions:** (a) published-year addressable demand ties to document totals through the mapping arithmetic exactly; (b) sd_ratio trajectory recomputed from module matches engine output; (c) supply-side LT subset vs Litgrid trajectory within the approved calibration tolerance; (d) module version referenced by run registry.
8. **Tests:** module validation · per-component interpolation (IZDR hits exactly 0 at the document's year, not smeared) · extrapolation policy · absorption arithmetic · tripwire fixtures · every existing gate (byte-identity until intended movement, suite, lints).
9. **Impact quantification for CP-2:** public `/revenue` before/after (all 54) · client portfolio rerun · percentiles rerun · per-scenario deltas · the "Litgrid LTsC basis" scenario outputs if built. **The floor may mute arithmetic deltas — quantify anyway and state which deltas are floor-absorbed (that statement itself goes in the methodology: current cannibalisation assumptions already saturate at the floor even under the TSO's own build-out projection — that is a defensible, checkable claim).**

### CP-2 — STOP. Operator signs the delta table before ship.

---

## Pause C — Ship
Standing rules: origin-SHA · single operator deploy · cron-tick verification (banked lesson) · pre-deploy git-state check (banked lesson). Handover headline artifact: **the KKME-vs-Litgrid reconciliation table** — every published Litgrid number, its verification status, its treatment in KKME, and the resulting trajectory — plus the delta table and the tripwire's first live check. Route follow-ups: AST/Elering demand-source phases if A.3 found them, forecast-evolution first-use on Litgrid's next publication. PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-d-litgrid-forecast`

## Out of scope
- Building IZDR/GAGAP revenue products (absorption treatment handles them honestly; product expansion is its own commercial question)
- LV/EE demand documents beyond the audit (follow-up phases if found)
- Phase 37 dispatch-card cutover (still parked)
