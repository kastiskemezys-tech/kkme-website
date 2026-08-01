# Execution queue — programme close-out

**Operator-owned. One CC session at a time, always. Boundary ritual between every batch: CC wraps → operator merges PR → `git checkout main && git pull origin main` → ping Cowork (roadmap delta + any prompt adjustments) → paste next launch block.**
**No git commands in ~/kkme while a CC session is running.** This file is written while E0 runs — it is untracked and safe; commit it at the next boundary, not before.

---

## NOW: boundary after B-036 + 36.E0.1 (SHIPPED 2026-07-31, PRs #118 + #117 merged)
Roadmap delta applied · playbook rows B9 + B10 added · next: step 1 (Phase 37 batch-1).

**Two operator one-minute steps carried out of this boundary:**
1. `gh secret set ENTSOE_API_KEY` (or Settings → Secrets and variables → Actions) — exact name is `ENTSOE_API_KEY`; the scheduled run cannot fetch without it.
2. Fire `workflow_dispatch` on **Refresh mature-market evidence base (36.E0.1)** once from the Actions tab. `fetch-btd.yml` precedent: BTD blocks Actions runner IPs. Whether the eight sources serve GitHub's IPs is the batch's one unverified claim — one manual run answers it today instead of a silent miss on the first Sunday of September.

---

## QUEUE (strict order)

### ~~0 · B-036 + E0.1~~ **[DONE 2026-07-31]** — DE settled activation source found (A84 per control area, not bidding zone); monthly refresh workflow live. Accession-effect measurement is NOT available from activation data — E2/E3 take break magnitude from capacity evidence, labelled.
<details><summary>original block</summary>

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-36-b036-prompt.md docs/phases/phase-37-arc.md docs/phases/phase-37-a-prompt.md docs/phases/_execution-queue.md
git add docs/phases/phase-36-b036-prompt.md docs/phases/phase-37-arc.md docs/phases/phase-37-a-prompt.md docs/phases/_execution-queue.md docs/phases/_post-12-8-roadmap.md docs/phases/phase-36-e-arc.md
git commit -m "B-036 prompt + phase 37 arc/prompt + E0 roadmap delta + arc amendments + queue"
git push origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/phases/phase-36-b036-prompt.md and execute. Autonomous, ~half day. A5 discipline on netztransparenz.de — verify what downloads contain. No engine changes. Wrap with the E2/E3 calibration verdict + PR URL.
```
</details>

### ~~1 · Phase 37 batch-1~~ **[DONE 2026-07-31]** — 37.A + 37.A.1 corrective pass + 37.B. LV 0 → 36/42 on UR bulk open data; APVA not citable (TAM = B-044); hybrid ships as a band; playbook B11 added; digest wired but deliberately unarmed. Worker additive-only, NOT yet deployed — batch-2 step 0 deploys it.
<details><summary>original block</summary>

Semi-autonomous · checkpoint after 37.A's coverage report (you review verification tiers before 37.B builds). Prompts already committed by step 0's block.

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/phases/phase-37-arc.md (privacy architecture section twice) then docs/phases/phase-37-a-prompt.md and execute batch-1. Semi-autonomous: STOP at the checkpoint after 37.A's coverage report. Non-negotiables: docs/_private/ never staged (assert every commit), contacts/comments never in fixtures/payloads/commits, leak tests from birth, rule #3 for everything entering the public DB. Playbook four-questions at Pause A, source-viability table before engine design.
```
</details>

### 2 · Phase 37 batch-2 — private CRM page + forecast wiring (37.C + 37.D)
**Prompt written: `docs/phases/phase-37-b2-prompt.md`** (carries batch-1's findings: non-vacuous leak tests as the headline gate, hybrid band never correction, APVA opaque, retired-MW accounting as a first-class check). Semi-autonomous · CP before deploy (signed delta table, three supply bases). Step 0 of the batch closes batch-1's two open loops: deploy the additive worker changes, then digest dry-run → arm.

Terminal:
```
cd ~/kkme
rm -f .git/*.lock
git checkout main && git pull origin main
sudo chown $(whoami) docs/phases/phase-37-b2-prompt.md docs/phases/_post-12-8-roadmap.md docs/phases/_execution-queue.md
git add docs/phases/phase-37-b2-prompt.md docs/phases/_post-12-8-roadmap.md docs/phases/_execution-queue.md
git commit -m "Phase 37 batch-2 prompt + batch-1 roadmap delta + queue"
git push origin main
claude --dangerously-skip-permissions
```
CC paste:
```
read docs/playbooks/failure-modes.md, then docs/phases/phase-37-arc.md (privacy architecture section twice), then docs/phases/phase-37-b2-prompt.md, and execute batch-2.

Semi-autonomous. Step 0 first (deploy batch-1's additive worker changes after the origin-SHA + clean-state check, then the digest dry run — arm only if it is clean, and if anything surfaces, STOP the arming and report). Then 37.C, then 37.D. STOP at the CP before deploying anything that moves a public or client number — signed delta table, three supply bases, baseline from a clean worktree not a stash.

Non-negotiables: no public tier at /fleet at all · leak tests non-vacuous and proven failable at API AND rendered-UI level (seed private values, vacuity guard, inject-then-remove proof) · private-only rows excluded from every published number, asserted in payload tests · hybrid ships as a band re-derived from hybrid-band.json, never as a correction from the private column · apva_flag renders as opaque private testimony, never as a verification signal.
```

### 2.5 · Phase 37.H1 — hygiene: browser-auth fix (B-045) + digest arming (B-046) + 37.D counterfactual
**Prompt: `docs/phases/phase-37-h1-prompt.md`.** Autonomous, ~1.5-2 h. Runs before the E-arc: B-045 is a live product defect on the gated calculator's front door, B-046 is an alert pipeline that can't yet be trusted, and the counterfactual makes 37.D's wiring verifiable. All three are the same class — green but not actually working.

### 3 · 36.E batch — E1 (FCR) + E2 (aFRR/PICASSO)
Prompt authored at boundary on E0's approved evidence base. Autonomous unless E0's checkpoint changed the specs.

### 4 · 36.E batch — E3 (mFRR/MARI) + E4 (DA spread-equilibrium)
Prompt at boundary. Autonomous.

### 5 · 36.E batch — E5 (intraday) + E6 (integration + continuity gate)
Prompt at boundary. **E6 carries the arc's second checkpoint: the continuity gate + per-product divergence table get operator sign-off before the per-service models replace the blended CPI anywhere public or client-facing.**

### 6 · 36.F — the report tool (F0 → F4, programme close)
F0 visual checkpoint (you approve every chart type in both themes) · F1 copy-deck editing pass (yours — that pass IS the anti-AI guarantee) · F2-F4 with the intake checklist. Prompts at boundaries.

---

## Standing rules for every batch (compressed)
- One CC session, one worktree, serial. Parallel lanes only ever via `git worktree` and only with Cowork planning it.
- `docs/playbooks/failure-modes.md` four-questions at every Pause A.
- Evidence-not-narrative in every handover: SHA-compare output pasted, gates pasted, test deletions/weakenings called out.
- Deploys: only from verified-synced state · verification at the correct tick · public/client number movements isolated in own commits with quantified deltas, operator-signed.
- `docs/_private/` never staged, ever. Leak tests wherever private data flows.
- Boundary ritual is not optional — three orphan commits and two stale deploys were the tuition.

## Parked / triggers
- **Phase 37 candidate (dispatch-card → hourly-engine cutover):** raises public IRR materially; deliberately parked for sequencing optics. Revisit after the E-arc ships.
- **BTD/AST reply:** if AST answers the sent email, small follow-up (worker-secondary self-heal or UA/rate adjustments) — slot at any boundary.
- **Prosperus:** delivery bundle regenerates on the current measured basis with one command whenever the conversation warrants; after 37.D + E6, regenerate before any client send (numbers will have moved — attributably).
- **B-045 (CORS `Authorization` preflight) — NEXT, ahead of the E-arc.** The calculator's full tier cannot authenticate from any browser; endpoint tests pass because they bypass the browser. One word in the shared CORS constant + a browser-layer regression test so the class can't recur. Small, but it is the gated product's front door and it is broken in production today.
- **B-046 (arm the weekly digest):** blocked on a first REAL detector run, not another dry run — `/health.fleet_lifecycle` reports `never_run`, and the renderer correctly refuses to distinguish a quiet week from a dead pipeline. Sequence: trigger detectors once → confirm `/health` shows populated detectors → arm the cron in its own commit.
- **37.D counterfactual test (do it with B-045 or the next fleet slot):** every CP delta was zero because the citable capacity contribution is 0 MW — which means the enrichment path is currently unverifiable by its effect. Add a synthetic fixture carrying a CITABLE capacity source and assert the supply trajectory moves; without it, 37.D's wiring is code no test can prove is live.
- **B-044 (TAM / EU State-aid Transparency Award Module):** the only route to making `apva_flag` citable (aid >€100k must be published by law). Client-rendered app behind a language gate — needs a browser-rendering pass or its query API, not a plain fetch. Slot when a citation for 55 LT rows is worth an hour.
- **B-043:** AU/DA fetchers rewrite their own fixtures each run — churn in every monthly refresh PR.
- **EE coverage 2/15:** the weakest arm after batch-1. EE bulk open data was a demonstrated build spike, not a dead end — a batch-3 or hygiene slot closes it the way LV closed.
- **B-034/B-035, LV/EE flexibility assessments, Litgrid Q4-2026 plan watch, LT fleet tiering:** hygiene slots between arcs.
