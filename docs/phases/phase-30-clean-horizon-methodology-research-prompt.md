# Phase 30 — Clean Horizon methodology reverse-engineering + KKME engine gap analysis

**For:** Cowork session OR CC session with WebSearch + WebFetch. Research deliverable, not code.
**Branch:** new `phase-30-methodology-research` off main. No code changes — three new docs added under `docs/research/` + one new public-facing methodology page.
**Estimated runtime:** ~2-3 days research + writing (or ~1 long Cowork session if focused).
**Predecessors:** Phase 12.10 (data discrepancy bundle — informs which KKME numbers Phase 30 should reconcile against). Phase 12.10.0 (Saulėtas Pasaulis purge — confirms named-entity discipline already in place).
**Successor:** Phase 29 (KKME Baltic Storage Index, ~4-6h) — depends on Phase 30's findings to know what the index calculation should be.

---

## Why this phase exists

Operator's competitive-positioning question (2026-05-04): *"are you able to access and check all this information to verify that what we're getting is better?"* re Clean Horizon's Battery / Storage Index ([cleanhorizon.com/battery-index/](https://www.cleanhorizon.com/battery-index/)).

Clean Horizon's Storage Index is the institutional benchmark KKME would be measured against by sophisticated readers:
- 15+ European countries, including Baltics (added late 2025)
- Monthly aggregate per bidding zone per BESS duration (1h / 2h / 4h) in €/MW/month annualized
- Methodology: COSMOS proprietary simulation tool, "replicates real-world route-to-market behaviour"
- January 2026 update: factors in actual volumes available on capacity reservation + energy activation markets + installed storage capacity per country (= cannibalization)
- Distribution: Nord Pool subscription product (paywalled)

**Strategic positioning chosen:** *(c) independent Baltic flexibility platform with own methodology* — not "free version of Clean Horizon" (positions as discount product), not "Lithuanian-deep complement to Clean Horizon" (anchors identity to competitor). Independent peer requires matching their methodology rigor.

**Three things Phase 30 produces:**
1. Confirmation that KKME's v7.3 engine is methodologically comparable on dimensions COSMOS exposes
2. Identification of gaps where KKME is genuinely behind (cannibalization refinement, multi-market simultaneous bidding, etc.) → engine-improvement backlog
3. KKME's own public methodology paper at comparable rigor — citable in trade press, linkable from Phase 29's index card

---

## What ships in this session

Three documents (no code changes):

1. **`docs/research/clean-horizon-methodology-vs-kkme-v7.3.md`** — side-by-side methodology comparison
2. **`docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md`** — gap-closure backlog with per-item engine-improvement scope
3. **`docs/methodology.md`** (or `app/methodology/page.tsx` — operator decision at §0.3) — public-facing KKME methodology paper

Plus one decision artifact:

4. **Updated handover Session 31 entry** documenting Phase 30 outcomes + Phase 29 unblocked

---

## What's explicitly OUT of scope

- **Implementing engine improvements identified by gap analysis.** Those become discrete Phase 7.7e+ backlog items. Phase 30 only documents gaps; doesn't fix them.
- **Phase 29 (Baltic Storage Index card).** Separate phase, ~4-6h, ships after Phase 30 lands.
- **Direct ingestion of Clean Horizon's data.** Operator already decided against (legal + brand risk). Phase 30 reads their PUBLIC material — published methodology + monthly summaries — not paywalled detailed values.
- **`gh pr create`.** Operator opens PRs via GitHub web UI per `CLAUDE.md`.
- **Roadmap edits.** Per Session 28 backlog #2 protocol — CC/Cowork reports needed deltas in Session 31 handover; operator applies.

---

## 0. Session-start protocol

### 0.1 Read

1. `CLAUDE.md`
2. `docs/handover.md` Sessions 28 + 29 + 30 (most recent shipped); note the audit-credibility taxonomy + roadmap-edit protocol
3. `docs/phases/_post-12-8-roadmap.md` — Phase 30 entry (this prompt's anchor) + Phase 29 entry (the dependent successor)
4. `workers/fetch-s1.js` `computeRevenueV7` and all sub-functions:
   ```bash
   grep -nE "function computeRevenueV7|function computeRevenueV6|function calcIRR|function computeLiveRate|function computeTradingMix|function computeCapacityMonthly|computeMarketComparisonWorker|REVENUE_SCENARIOS|SOH_CURVE|RTE|cycles_breakdown|warranty" workers/fetch-s1.js | head -40
   ```
   Read each match in 30-line windows to understand what KKME's engine actually does today.
5. Existing engine documentation if any:
   - `docs/handover.md` Phase 7.7c Session 1 entry (engine v7.2)
   - `docs/handover.md` Phase 7.7d entry (engine v7.3)
   - `docs/principles/decisions.md` ADRs around engine architecture
6. `docs/glossary.md` — ensure KKME's vocabulary used in methodology paper matches existing terms

### 0.2 Public-source acquisition (research phase)

WebSearch + WebFetch the following Clean Horizon material. Capture the relevant text for each into a working notes file `docs/research/_clean-horizon-source-extracts.md` (delete-before-commit if you want; keep if it's useful audit trail):

1. **Storage Index landing page** — [cleanhorizon.com/battery-index/](https://www.cleanhorizon.com/battery-index/) — methodology summary, country list, framing
2. **Intersolar 2025 talk** — Michael Salomon on BESS revenue models. Find via WebSearch `"Michael Salomon" Intersolar 2025 BESS revenue models site:cleanhorizon.com`. May not be a transcript — likely a summary blog post.
3. **PVTP article** — "Unlocking BESS revenues in Europe's key markets", Storage & Smart Power 86, May 2025. PDF at `solar-media.s3.amazonaws.com/assets/Pubs/PVTP%2042/20_Clean%20Horizons%20revenue%202%20BW%20latest.pdf`. PDF, multi-page — extract systematically.
4. **October 2025 European BESS market update** — [cleanhorizon.com/news/storage-index-european-bess-market-update-october-2025/](https://www.cleanhorizon.com/news/storage-index-european-bess-market-update-october-2025/) — first explicit methodology summary post.
5. **November 2025 Storage Index** — [cleanhorizon.com/news/clean-horizon-releases-november-storage-index/](https://www.cleanhorizon.com/news/clean-horizon-releases-november-storage-index/)
6. **December 2025 Storage Index** — [cleanhorizon.com/news/december-storage-index-monthly-update-from-clean-horizon/](https://www.cleanhorizon.com/news/december-storage-index-monthly-update-from-clean-horizon/)
7. **January 2026 methodology update** — find via WebSearch `"Clean Horizon" "January 2026" Storage Index methodology installed capacity cannibalization`
8. **Baltics-specific announcement** — [cleanhorizon.com/news/clean-horizon-storage-index-update-now-covering-the-baltics/](https://www.cleanhorizon.com/news/clean-horizon-storage-index-update-now-covering-the-baltics/) — per-country revenue stream coverage explicitly stated
9. **BESS profitability in Europe (incl Denmark)** — [cleanhorizon.com/news/bess-profitability-in-europe-including-dk1-dk2/](https://www.cleanhorizon.com/news/bess-profitability-in-europe-including-dk1-dk2/) — per-country breakdowns
10. **Italy update** — [cleanhorizon.com/news/the-new-storage-index-now-includes-italy/](https://www.cleanhorizon.com/news/the-new-storage-index-now-includes-italy/) — per-country revenue stream + zone selection logic
11. **August 2025 Storage Index** — [cleanhorizon.com/news/august-storage-index-is-out-key-market-insights-across-europe/](https://www.cleanhorizon.com/news/august-storage-index-is-out-key-market-insights-across-europe/)
12. **Nord Pool product page** — [nordpoolgroup.com/en/services/power-market-data-services/bess-market-clean-horizon-storage-index/](https://www.nordpoolgroup.com/en/services/power-market-data-services/bess-market-clean-horizon-storage-index/) — distribution model + product naming + framing
13. **Energy-Storage.News bylines** — search `site:energy-storage.news "Clean Horizon"` for any guest-authored articles where Clean Horizon discloses methodology or results

For each source, capture:
- Methodology assertions (algorithms, parameters, assumptions)
- Per-country revenue stream coverage statements
- Specific monthly index values published (for KKME's own future reconciliation — but DO NOT republish in any artifact; reference only)
- Update cadence + framing changes over time

### 0.3 Pause A — research scope confirmation + operator decisions

**Wait for explicit "proceed".** Report:

1. **Sources acquired** — checklist of which of the 13 above were reachable + any new sources discovered during search
2. **Methodology summary** — initial extract of Clean Horizon's published assumptions (will deepen in §1)
3. **Per-country revenue-stream table from Clean Horizon's published material:**

   | Country | Revenue streams per Clean Horizon |
   |---|---|
   | LT | DA + Intraday + FCR + aFRR + mFRR (already known) |
   | LV | DA + Intraday + FCR + aFRR + mFRR (already known) |
   | EE | DA + FCR + aFRR + mFRR (no intraday — already known) |
   | DE | DA + Intraday + FCR + aFRR (already known) |
   | IT | DA + Intraday + MSD-ex-ante + MB (SUD zone, already known) |
   | … | extract for all 15+ countries |

4. **Operator decisions required:**
   - **Methodology paper destination:** standalone `/methodology` route (recommended for trade-press citability) OR inline drawer per Phase A consolidation. Auditor's consolidated revision walked back standalone destination, but methodology depth IS the credibility play vs Clean Horizon — worth re-considering.
   - **Methodology paper voice:** institutional-sober (Clean Horizon's voice — operator-neutral, third-person, no "KKME proprietary") OR KKME-character (terse, opinionated, branded). Recommendation: institutional-sober for the methodology paper specifically; KKME-character stays for everywhere else on the site.
   - **Engine-improvement gap closure scoping:** are gap-backlog items added to Tier 1 (foundation, urgent) or Tier 5 (editorial + content, sequenced after current bug-fix Tier 0)? Recommend Tier 5 unless any gap is materially affecting KKME's headline numbers (cannibalization model is the candidate — investigate during §3).

If autonomous-YOLO: AUTO-PROCEED if all 13 sources acquired or 10+ sources with documented gaps. If <10 sources reachable, halt — research depth insufficient.

---

## 1. Methodology comparison document (`docs/research/clean-horizon-methodology-vs-kkme-v7.3.md`)

Structure:

```markdown
# Clean Horizon Storage Index methodology vs KKME v7.3 engine

**Authored:** 2026-05-XX
**Source material:** [list of 13 sources from §0.2]
**KKME engine version:** v7.3 (worker `<version-id>`, deployed `<date>`)

## Executive summary

[1-paragraph: KKME's engine is methodologically comparable to Clean Horizon's COSMOS on N of M dimensions; gaps identified at items X, Y, Z; engine-improvement backlog at /docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md]

## Methodology dimensions

For each dimension below: Clean Horizon's published approach (with source citation), KKME v7.3's approach (with code citation), comparison verdict (match / KKME ahead / KKME behind / different framing).

### 1. Per-product participation logic
- Clean Horizon: [source]
- KKME v7.3: `computeRevenueV7` lines X-Y; uses S1 capture × cycles + S2 clearing × MW
- Verdict: [...]

### 2. Route-to-market priority order
- Clean Horizon: COSMOS sim — order undisclosed in public material
- KKME v7.3: dispatch model at `app/lib/dispatchChart.ts` + worker `computeDispatch` priorities FCR > aFRR > mFRR > DA arbitrage based on SoC
- Verdict: [...]

### 3. SoC management + cycling discipline
[...]

### 4. Activation rate modeling per product per country
[...]

### 5. Cannibalization model (installed_storage_capacity × actual_market_volume_available)
- Clean Horizon: January 2026 update factors in actual volumes available on capacity reservation + energy activation markets + installed storage capacity in the country
- KKME v7.3: S2 fleet trajectory + cycles_breakdown produces per-product EFC/yr scaling with fleet growth; warranty_status flags premium-tier upgrades when actual c/d exceeds standard
- Verdict: KKME has analogous mechanism but framed differently. Specific gap: KKME doesn't expose per-MW marginal-revenue-vs-fleet-MW curve the way Clean Horizon's January 2026 update implies.

### 6. Cross-product simultaneous bidding (FCR + aFRR + mFRR + DA when SoC permits)
- Clean Horizon: COSMOS replicates "real-world route-to-market behaviour and decision-making" — implies multi-market simultaneous
- KKME v7.3: partially via dispatch model; backlog Phase 7.7e #4 explicitly notes "top-N quantile correction, mFRR vs aFRR cascade in 4h+ assets still missing"
- Verdict: KKME behind. Documented gap.

### 7. Annualization assumption
- Clean Horizon: "year = 12 repetitions of the same month"
- KKME v7.3: live €/MW/day × 365 (current presentation); no monthly-aggregate framing
- Verdict: different framings; KKME's live-current is denser; Clean Horizon's monthly-aggregate is more comparable. Phase 29 ships KKME's monthly-aggregate equivalent.

### 8. RTE / degradation / availability assumptions
[...]

### 9. CAPEX / OPEX / financing assumptions
- Clean Horizon: not disclosed publicly in detail
- KKME v7.3: explicit per-scenario CAPEX (€120 / 164 / 262 per kWh), 10-year debt at €X%, Y% leverage, Euribor reference
- Verdict: KKME ahead on transparency.

### 10. Geographic coverage normalization
- Clean Horizon: 15+ countries on consistent monthly framework
- KKME: Baltic-only; live + project-finance lens
- Verdict: different positioning (Position C — independent peer, not pan-European).

[continue for all dimensions extractable from public material]

## Side-by-side numerical comparison (where Clean Horizon publishes specific values)

For any country/month where Clean Horizon's headline value is publicly visible (in their monthly blog posts), compute KKME's v7.3 monthly-aggregate equivalent and compare. **Important:** do not republish Clean Horizon's specific values in the document — reference only ("per Clean Horizon Storage Index, October 2025: published"); show KKME's number explicitly. Frame as "KKME's independent calculation: €X; Clean Horizon's published value (cited via source URL): €Y; difference Z%".

If KKME's numbers track within ±20%, that's strong validation. If KKME's numbers diverge >50%, document the methodology delta that explains it.
```

---

## 2. Gap-closure backlog (`docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md`)

Each gap from §1 becomes a discrete engine-improvement backlog item. Format:

```markdown
# KKME engine improvements identified from Clean Horizon comparison

## Gap 1: Cannibalization model — explicit per-MW marginal-revenue-vs-fleet-MW curve

**Source:** Clean Horizon January 2026 update — factors actual market volumes + installed capacity per country.

**KKME current state:** S2 fleet trajectory + cycles_breakdown does cannibalization implicitly via per-product EFC/yr scaling. Operator can read the trend but can't query "what's my marginal MW worth at a specific fleet size."

**Proposed improvement:** add `marginal_revenue_vs_fleet_mw_curve: number[]` to `/revenue` payload — array of (fleet_MW, projected_marginal_revenue_per_MW_per_yr) tuples sweeping from current fleet to 3× current. Front-end renders as a small chart on the Returns card.

**Estimate:** ~4-6h engine work. Goes into Phase 7.7e Engine track or new Phase 31.

**Priority:** P2 medium — KKME's current cannibalization story is implicit; making it explicit closes the largest single methodology gap vs Clean Horizon.

---

## Gap 2: Multi-market simultaneous-bidding cascade
[...same template...]

## Gap 3: Activation-rate quantile correction
[...]

[continue for each gap identified in §1]
```

Rank gaps by:
1. How materially they affect KKME's headline numbers (top priority if KKME's IRR/€/MW/yr would shift >5pp with the fix)
2. Effort to implement
3. Dependency on other phases

---

## 3. KKME methodology paper (`docs/methodology.md` OR `app/methodology/page.tsx`)

Public-facing document at the rigor Clean Horizon publishes — written for institutional reader (project finance, developer, investor), not casual visitor.

Structure:

```markdown
# KKME methodology

**Engine version:** v7.3
**Last updated:** 2026-05-XX
**Maintainer:** UAB KKME

KKME is an independent Baltic flexibility intelligence platform. This document explains how the revenue, IRR, and dispatch numbers shown on kkme.eu are computed, what data sources back each calculation, and where our methodology differs from peer products including [Clean Horizon Storage Index](https://www.cleanhorizon.com/battery-index/) (the institutional reference for European BESS revenue benchmarking, delivered via Nord Pool).

## Scope

- **Geographic:** Lithuania (deep), Latvia + Estonia (extending). Baltic-region focus by design.
- **Time horizon:** live (sub-daily polling) + monthly aggregate (Phase 29 KKME Baltic Storage Index, monthly cadence).
- **Asset assumed:** generic 50 MW BESS reference asset with configurable duration (1h / 2h / 4h) and CAPEX (low / mid / high).
- **Audience:** project-finance, developer, investor, regulator. Not retail.

## Data sources

| Source | Used for | Cadence | Citation |
|---|---|---|---|
| Litgrid | LT installed storage, intention protocols, TSO reservations | Daily live-fetch (Phase 12.10) + manual operator refresh | https://www.litgrid.eu/ |
| AST | LV installed storage | Quarterly manual refresh (Phase 12.12 will live-fetch) | https://www.ast.lv/ |
| Elering | EE installed storage + frequency reserve cost | Quarterly manual refresh (Phase 12.12 will live-fetch) | https://elering.ee/ |
| ENTSO-E A44 | LT day-ahead prices | Hourly | https://transparency.entsoe.eu/ |
| ENTSO-E A75/A65 | Generation + load per fuel | Hourly | https://transparency.entsoe.eu/ |
| ENTSO-E A68 | Installed capacity per production type per country | Daily live-fetch (Phase 12.10) | https://transparency.entsoe.eu/ |
| BTD (Baltic Transparency Dashboard) | Balancing market clearing prices, activated bids, imbalance | 15-minute MTU | https://api-baltic.transparency-dashboard.eu/ |
| Energy-Charts (Fraunhofer ISE) | EU ETS carbon price, TTF gas | Daily | https://energy-charts.info/ |
| ECB SDW (via Frankfurter API) | Euribor 3M, HICP, FX | Daily | https://sdw.ecb.europa.eu/ |
| NREL Annual Technology Baseline | LFP RTE projection, CAPEX trajectory benchmark | Annual | https://atb.nrel.gov/electricity/ |
| Anthropic API | Editorial enrichment of intel feed | On-demand | (internal) |

## Revenue model

[Detailed per-product revenue calculation — DA, FCR, aFRR, mFRR, intraday — with formulas, citations, and example numbers. Comparable depth to what Clean Horizon's January 2026 methodology update publishes.]

### Day-ahead arbitrage
[...]

### Capacity reservation revenue
[...]

### Activation-energy revenue
[...]

### Cycle accounting
[...]

### RTE decay
[...]

### Augmentation modeling
[...]

## Comparison to Clean Horizon Storage Index

KKME's revenue calculation is methodologically comparable to Clean Horizon's COSMOS simulation on the dimensions both products expose. Documented similarities + differences:

[Summarized from §1 comparison doc — table form, brief narrative]

## What's intentionally different

KKME ≠ Clean Horizon:
- KKME is live (sub-daily); Clean Horizon is monthly aggregate
- KKME is Baltic-deep; Clean Horizon is pan-European
- KKME is free + public; Clean Horizon is Nord Pool subscription
- KKME exposes project-finance metrics (IRR, MOIC, LCOS, DSCR); Clean Horizon publishes the revenue index only
- KKME's intel feed surfaces named developments; Clean Horizon's monthly market update is curated narrative

These are positioning choices, not capability gaps. KKME and Clean Horizon serve overlapping but distinct readerships.

## What we got wrong

Public-facing version of the [`docs/wrongs.md`](https://github.com/.../docs/wrongs.md) log. Each entry: date, claim, what-happened, lesson.

## Engine version history

| Version | Shipped | Major change |
|---|---|---|
| v7.3 | 2026-04-27 | Throughput-derived cycle accounting; rate-tagged empirical SOH curves at 1 / 1.5 / 2 c/d; per-duration RTE BOL |
| v7.2 | 2026-04-27 | LCOS, MOIC, duration optimizer, assumptions panel surfaced |
| v7 (final) | 2026-04 | Probe-driven calibration framework |
| v6 | (earlier) | Initial scenario framework |

## Updates + corrections

Methodology updates published as date-stamped entries below. Corrections to past methodology issued via the wrongs log above.
```

Make this document genuinely good. It's the credibility artifact for institutional readers.

---

## 4. Verification gates (before commit)

This phase has no code changes — verification is editorial + research-rigor:

- All 13 source URLs in §0.2 cited explicitly in `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md` source list
- Every methodology dimension in §1 has KKME code citation (`workers/fetch-s1.js:line` or similar)
- No Clean Horizon specific numerical values republished in any artifact (citations only)
- KKME methodology paper readable + complete — not skeleton
- Gap backlog has time estimate per item

---

## 5. Pause B — review

Report:
- Three docs created with line counts
- Source-acquisition success rate (how many of 13 reached + extracted)
- Methodology dimensions documented (with verdict per dimension: match / ahead / behind / different framing)
- Number of gaps identified + total estimated engine-improvement backlog hours
- KKME methodology paper destination decision (per Pause A operator call)
- Roadmap delta needed for operator to apply Cowork-side:
  - Move Phase 30 from active to Shipped appendix
  - Update Phase 29 entry with "Phase 30 findings inform: <key insight>" cross-reference
  - Add gap-closure items as new Phase 31+ entries OR fold into Phase 7.7e Engine track backlog (operator decides)

Wait for explicit "proceed" before §6 commits.

---

## 6. Commits + push

Three commits:

```bash
git add docs/research/clean-horizon-methodology-vs-kkme-v7.3.md \
        docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md
git commit -m "$(cat <<'EOF'
phase-30(research): Clean Horizon methodology comparison + KKME engine gap analysis

Reverse-engineered Clean Horizon's Storage Index methodology from public
material (Intersolar 2025 talk + monthly market updates + Baltics + January 2026
methodology update + Nord Pool product page). Side-by-side comparison vs KKME's
v7.3 engine documented per dimension. N gaps identified totaling X engine-
improvement-hours; ranked by impact on KKME's headline numbers.

Conclusion: KKME's engine is methodologically comparable to COSMOS on M of N
dimensions Clean Horizon exposes publicly; gaps mostly in cannibalization
explicit-curve exposure + multi-market simultaneous-bidding cascade.
Documented gaps become engine-improvement backlog for Phase 7.7e+ pulls.
EOF
)"

git add docs/methodology.md  # OR app/methodology/page.tsx if standalone route chosen
git commit -m "phase-30(methodology): public-facing KKME methodology paper at Clean-Horizon-comparable rigor"

git add docs/handover.md
git commit -m "phase-30(handover): Session 31 — Clean Horizon methodology research shipped; Phase 29 unblocked"

git push -u origin phase-30-methodology-research
```

PR via GitHub web UI per `CLAUDE.md`.

---

## 7. Handover Session 31 entry

Standard format. Include:
- Three docs delivered with paths
- Source acquisition rate (X of 13)
- Number of methodology dimensions documented
- Verdict summary: M dimensions match, N dimensions KKME ahead, P dimensions KKME behind
- Gap backlog summary: K items totaling H engine-improvement hours
- Operator decision applied (methodology paper destination)
- **Phase 29 unblocked** — KKME Baltic Storage Index can now ship using methodology paper as its computation reference
- Roadmap delta requested (operator applies Cowork-side)

---

## 8. Cowork-side authoring notes (delete before final commit)

Authored 2026-05-04 from Cowork after operator's Clean Horizon competitive-positioning question.

This phase is uncomfortable in two ways and operator should know upfront:

1. **Reverse-engineering implies acknowledging Clean Horizon as the standard.** That's true and worth being honest about. Position (c) is "independent peer at comparable rigor" — peer means recognizing the field. The methodology paper is how KKME claims peer status without conceding subordination.

2. **Some gaps will be uncomfortable.** Clean Horizon's January 2026 cannibalization update is methodologically sophisticated; KKME's v7.3 has analogous mechanism but less explicitly framed. Documenting this honestly might surface engine-improvement work that's bigger than expected. That's the cost of independent-peer positioning.

The methodology paper is the highest-leverage output of this phase. It's what gets cited in trade press, what institutional readers send their analysts to verify KKME's numbers, what positions KKME alongside Clean Horizon in a way that's defensible. Spend the time on it — don't ship a skeleton.

**End of prompt.**
