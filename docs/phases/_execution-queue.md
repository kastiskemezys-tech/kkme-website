# Execution queue — programme close-out

**Operator-owned. One CC session at a time, always. Boundary ritual between every batch: CC wraps → operator merges PR → `git checkout main && git pull origin main` → ping Cowork (roadmap delta + any prompt adjustments) → paste next launch block.**
**No git commands in ~/kkme while a CC session is running.** This file is written while E0 runs — it is untracked and safe; commit it at the next boundary, not before.

---

## NOW: boundary after 36.E0 (SHIPPED 2026-07-30)
Operator merges the E0 PR → pull → then step 0.

---

## QUEUE (strict order)

### 0 · B-036 — settled German activation-price source (gates E2/E3, ~half day)
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

### 1 · Phase 37 batch-1 — fleet verification engine + lifecycle (37.A + 37.B)
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

### 2 · Phase 37 batch-2 — private CRM page + forecast wiring (37.C + 37.D)
Prompt authored by Cowork at the boundary (just-in-time, carries batch-1's findings). Semi-autonomous · CP before deploy (37.D moves forecast numbers — signed delta table).

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
- **B-034/B-035, LV/EE flexibility assessments, Litgrid Q4-2026 plan watch, LT fleet tiering:** hygiene slots between arcs.
