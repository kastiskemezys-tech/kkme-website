# Phase 38.3 — dispatch-card → hourly-engine cutover

**Branch:** `phase-38-3-hourly-cutover` off latest main. **Semi-autonomous — CP before deploy, mandatory.** ~2-3 h.
**Why now, and why third:** 38.1 fixed the stale inputs, 38.2 shipped corrections that all cut unflatteringly. This one raises the headline. That order was chosen deliberately and belongs in the commit message — an IRR that rises while the card's own inputs are visibly stale, or before the unflattering corrections land, invites exactly the reading we would deserve.

**NOT bundled with E6.** E6 replaces `reservePrice()` and moves numbers again; two movements under one delta means no attribution, which is what C3 exists to prevent.

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

---

## Scope

Cut the dispatch card over from its own calculation to 36.B's hourly engine — the parked item from the Phase 37 backlog, parked for sequencing optics rather than correctness.

1. **Pause A — the consumer graph before anything else (A7).** Every surface that reads the dispatch card's output, every surface that reads the hourly engine's, and every place the two are compared or reconciled. The mirror-test warning applies directly: a dispatch-vs-engine comparison is B5-class and blind to anything both share — pair it with an independent check (energy balance, a hand-computed golden day, or the physical invariant that discharge ≤ capacity × duration).
2. **The three routed card defects travel with this phase** per the arc's own routing — carry them, don't defer them again.
3. **The 498 → 222 EFC/yr question is IN SCOPE and must be answered or explicitly declared unanswered, in the drawer, in this phase.** 36.B5 already recorded 498 EFC/yr as below the observed merchant band (550-720); the cutover moves it to 222, further below. Either there is a mechanism that explains a battery cycling less than a third of merchant practice while earning more, or the drawer says plainly that the model's cycling sits below observed practice and why that is or isn't a problem for the revenue claim. **Do not ship a higher IRR beside a cycle count nobody can defend.**

## CP — before deploy, no exceptions

Signed delta table, 36.D CP-2 pattern:

- All 54 public configurations: pre, post, absolute, %, for gross Y1 · project IRR · equity IRR · min DSCR · LCOS · NPV.
- Client portfolio: the same set.
- **Baseline captured from a CLEAN WORKTREE of the reference commit against ONE frozen KV snapshot copied byte-identical into each tree** (37.D's method). Never a stash (C6).
- The cycling answer, in the form it will appear in the drawer.
- Which surfaces change, named.

I sign before deploy. If the movement is larger than the arc anticipated, that is a finding to report, not a reason to soften anything.

## Gates
No public number moves before the signed CP · byte-identity gate scoped at ROUTE level (the 36.B lesson: engine-level green while the route broke) · mirror tests paired with independent fixtures · `docs/_private/` never staged · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8 (poll until two reads agree).

## Wrap
Origin-SHA · the consumer graph with counts · the independent (non-mirror) check and its result · the signed delta as shipped · the cycling answer as it renders · post-deploy verification at the correct tick · PR URL.
