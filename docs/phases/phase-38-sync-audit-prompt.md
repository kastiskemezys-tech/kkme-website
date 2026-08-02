# Phase 38 — site ↔ engine sync audit + capability surfacing

**Branch:** `phase-38-sync-audit` off latest main. **Semi-autonomous — checkpoint after the audit, before any change.** ~2-3 h.
**Trigger:** operator review of the live site, 2026-08-02: *"make sure it's all utilised and the whole website is up to date with the recent builds — the calculator is just an in-depth product within."*

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph. **Discipline rule #1 applies with full force:** this prompt contains screenshot-derived observations, which is the lowest-reliability audit class in our own taxonomy (~25 % historical). Every item below is a HYPOTHESIS to triangulate by code-grep + live curl + git-log before it is treated as a defect.

---

## Part A — provenance sweep (the audit proper, no changes)

For **every number rendered on the public site** — hero ticker, every card's hero metric, every drawer figure, every impact line — produce one row: rendered value · the canonical worker field it should come from (`app/lib/metricRegistry.ts`) · the field it ACTUALLY comes from · freshness at time of check · source citation shown to the user · verdict (aligned / divergent / uncited).

Rule #4 is the standard: same metric in N display locations derives from ONE canonical field. Report every violation; fix none yet.

## Part B — four specific hypotheses from the operator's review

Triangulate each; a screenshot is not evidence of a code path.

1. **S1 shows `STALE · 33h ago`** (as-of 2026-08-01 00:01 UTC, energy-charts.info) while S2 next to it is 56 m fresh. Diagnose the DA-arbitrage ingestion path end to end: is the upstream publishing, is our fetch running, is the admission gate rejecting, is the staleness threshold simply wrong for a daily-clearing market? The whole S1 line (€142 P50, the €28,400/day implication) inherits whatever this is. **B8 question:** if this path stopped entirely, how long before anything told us?
2. **The APVA line** — "APVA grant call: ~1,545 MW applied (operator estimate, pending APVA refresh)". 37.A established APVA is NOT citable today (no register serves beneficiary lists at citation grade; TAM is the unblocker, B-044). A published figure is leaning on a source we have since established cannot confirm it. Options: carry the finding in the label explicitly, or hold the number until TAM. Recommend; do not unilaterally remove a public number.
3. **`FLEX FLEET 782 MW (BESS + pumped hydro)` in the ticker vs `651 MW` installed in the card.** Almost certainly different populations, correctly — but rule #4 exists because exactly this shape produced the Phase 12.9 S/D mismatch. Confirm both derive from canonical fields and that a reader can tell which population each describes.
4. **Fleet figures vs Phase 37's findings.** LV 40 MW installed on the card against 36 registry-confirmed entities and 41 untracked live LV entities in the private tier. Nothing private may enter the public number — but state plainly whether the public LV figure is believed to be complete, and if not, whether the card says so.

## Part C — capability surfacing (what we built and never showed)

Inventory what has shipped since the last site-facing phase and where each is surfaced, if anywhere. At minimum: 36.B's hourly dispatch engine + measured trading realisation · 36.C's forecast mode (first-ever serve) + 299-day clearing history · 36.D's tri-TSO demand series + the named "Litgrid L TrSc" scenario · 37's fleet verification tiers and lifecycle · E1/E2's per-service formation (built, deliberately unwired until E6).

For each: shipped / surfaced where / not surfaced. Then a recommendation — which belong on the public site, which belong behind the calculator gate, which are internal-only. **Include the parked dispatch-card → hourly-engine cutover** (it raises public IRR materially and was parked for sequencing optics, not for correctness) with a recommendation on timing.

The framing to test the IA against: **the site is the argument, the calculator is the in-depth product within it.** A visitor should be able to follow one story from signal → structure → returns → "run it on your own project". Report where that line breaks.

## CHECKPOINT — stop here
Present the provenance table, the four triangulations with verdicts, and the surfacing recommendation. I decide what gets fixed, what gets surfaced, and what stays parked. **No public copy, IA, or number changes before that.**

## After sign-off (same batch if time allows, else its own)
Fix what's signed off. Any public-number movement carries a quantified delta table; any copy change respects the locked design principles (no editorial state labels, sparse drawer prose, numbers first).

## Gates
`/revenue` 54/54 byte-identical unless a signed delta says otherwise · `docs/_private/` never staged · no private-tier value in any public payload · suite green · eslint clean · every claim in the audit report carries its verification command.

## Wrap
Origin-SHA · the provenance table · four verdicts · surfacing recommendation with the IA break-points named · what was fixed vs what awaits sign-off · PR URL.
