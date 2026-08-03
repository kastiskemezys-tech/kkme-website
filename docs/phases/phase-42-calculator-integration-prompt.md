# Phase 42 — calculator integration: make the gated product carry what we now know (overnight item 5)

**Branch:** `phase-42-calculator-integration`. **Autonomous, box 2 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** The calculator behind the gate is the product. Since it shipped, the engine gained: measured trading realisation, the contracted-floor overlay, the hourly dispatch engine, the tri-TSO demand series and the named TSO scenario, the MW partition, the corrected cost stack, and **debt sized from cash flows with a contracted-share lever**. Almost none of it is reachable from the calculator. A sponsor running it today gets last month's product.

**This phase wires, it does not invent.** Every number must come from the engine that already computes it.

---

## 1 · Pause A — what the calculator can reach today (A7, counts)

Enumerate the calculator's request/response surface: which engine fields it sends, which it renders, which engine outputs exist but are unreachable from it. Report the gap as a list — that list is the phase's scope, and it is likely longer than this prompt assumes.

Verify the tier logic while you are there: sample tier vs full tier, what each may see, and that the leak tests still prove the boundary (seed values, vacuity guard — the batch-2 protocol).

## 2 · What to wire, in priority order

1. **Debt sizing (39).** Solved debt, implied gearing, binding constraint, equity IRR at the solved structure, and the DSCR ladder (1.50 / 1.75 / 2.00). Present with the tie-sentence already agreed: at the assumed gearing minimum cover is X and the structure fails; sized to a lender's target cover the same asset supports €Y — same asset, different structure. **Compute the verdict, never assert it** (39.1's defect: a sentence that said "fails" beside a passing number).
2. **The contracted-share lever.** 0 / 25 / 50 % contracted → sustainable debt and equity IRR, measured channel only (the floor-alone effect, 1.30 / 2.25 / 2.61). This is the most commercially expressive thing the platform owns and it is currently invisible.
3. **Scenario presets** as structurally meaningful choices, not dials: base / conservative / stress, plus the named TSO-projection scenario. Each preset states in one line what it assumes — no editorial labels, a quantitative descriptor.
4. **Provenance surfacing** — if item 3 landed, each headline number links to its source chain. If item 3 blocked, use explicit source lines instead; do not skip provenance.

## 3 · Product mechanics that make it usable

- **Shareable configuration**: the URL must encode the configuration and reproduce it. Note the known defect from the Phase 38 audit — *the site renders the default configuration regardless of URL parameters* — verify whether it applies to the calculator route too, and fix it there if it does. A calculator whose link does not reproduce its result is not shareable.
- **Export**: one button producing the report generator's HTML for this configuration (item 4's shell + charts if they landed). If item 4 blocked, export a structured JSON the report tool can consume later — never a screenshot.
- **Empty and error states**: what the user sees when the engine is unreachable, when a config is uneconomic, and when a number is withheld for insufficient data (the n < 10 pattern from 37.B.1). Every one of these must render honestly rather than showing a zero.

## 4 · The browser layer, because that is where the last defect lived

B-045 (the CORS preflight that made full tier unauthenticated in every browser) passed every endpoint test because the tests bypassed the browser. **Add a browser-layer regression test** covering: gate → token → full-tier result rendered, and a preflight assertion with `Authorization` in `Access-Control-Request-Headers`. If the harness cannot run a real browser in CI, write it as a scripted manual check with exact steps and say so.

## STOP conditions
- Wiring any of §2 would move a published number → build behind a flag defaulting OFF, and stop.
- The URL-configuration defect turns out to be structural (framework-level) → report it with the diagnosis; do not rewrite routing overnight.

## Gates on this phase
`/revenue` 54/54 byte-identical · leak tests still proven failable at API and rendered-UI level, with the vacuity guard · no number computed in the calculator that the engine could compute · every verdict computed, never asserted · `docs/_private/` never staged · NDA gate runs.

## PR body must contain
The reachability gap list from Pause A, what was wired, screenshots of the new panels in both themes, and the browser-layer test result.
