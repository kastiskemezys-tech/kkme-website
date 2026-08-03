# Phase 39 — debt sizing from cash flows (the answer to a DSCR the model can't service)

**Branch:** `phase-39-debt-sizing` off latest main. **Semi-autonomous — CP before any public number moves.** ~3-4 h.
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why now.** After the partition and the cost-stack correction, min DSCR at the reference config is **0.95 and does not cross 1.00**. The site currently publishes an asset that fails debt service. That is not a statement about the asset — it is a statement about an assumed capital structure that no lender would have written. **Lenders do not fix gearing and check DSCR; they size debt from cash flows to a target DSCR and let gearing fall out.** The engine does it backwards, and fixing that turns "this fails" into "this supports €X of debt at Y % gearing" — the number a sponsor needs and a credit committee recognises.

---

## 1 · Pause A — what exists, before building

1. Where gearing, tenor, rate and the DSCR calculation live today (file:line, with search counts). What is assumed vs computed. **`min_dscr` is currently an OUTPUT of a fixed structure — after this phase it becomes a CONSTRAINT that sets the structure**, so every consumer of it needs identifying (A7).
2. What CFADS the engine can already produce per year (EBITDA less tax, less maintenance capex, less any reserve movements) and what is missing to make it lender-shaped.
3. Whether 36.B4's contracted-floor overlay is reachable from here — it is the commercially decisive input (see §4).

## 2 · The model

For each config, solve for the maximum debt that satisfies a target DSCR in every year:

- **Sculpted amortisation** (the standard for merchant-tail project finance): scheduled principal in year *t* = `CFADS_t / DSCR_target − interest_t`, subject to non-negative principal and full repayment by tenor end. Debt quantum is the solved present value of that schedule.
- **Gearing is the output**, not the input: `debt / total capex`, reported per config.
- Also report: **debt service cover in every year** (should sit at the target by construction where the sculpt binds), **average life**, **tenor used**, **implied equity cheque**, and **equity IRR at the solved structure** — which is the number that actually changes the sponsor conversation.
- Keep a **cap on gearing** independent of DSCR (lenders apply both); make the binding constraint per config explicit — "DSCR-bound" vs "gearing-capped" is itself information.

## 3 · Parameters must be sourced, not invented (A8)

Target DSCR, tenor and margin are the whole answer, so they cannot be plucked. Source them from published lender or market commentary on **merchant / partially-contracted battery storage financing in Europe** — bank project-finance reports, published deal terms, ratings-agency criteria, TSO or regulator financing studies. Cite each per rule #3 with URL and date. Where the literature gives a range, model the range and make the base case the **conservative end** (higher DSCR target, shorter tenor). If a parameter genuinely cannot be sourced, band it and say so — do not let proximity to a sourced parameter make it look sourced (the E1/E2 `dur_req_h` precedent).

Expect merchant storage to demand a materially higher DSCR than contracted infrastructure. **Do not reason from the number that makes the asset work.**

## 4 · The link that makes this commercially expressive

36.B4 measured that a contracted floor lifts the downside tail **4.6× more than it lifts the median**. Debt sizing is exactly where that asymmetry converts into money: sculpting is driven by the *low* years, so a floor that raises P90 raises sustainable debt far more than it raises expected revenue.

Quantify it: **sustainable debt and equity IRR at 0 %, 25 %, 50 % contracted share.** That table is the single most useful artefact this phase can produce — it is the answer to "why would I contract away upside", and it is ours, measured, not asserted.

## 5 · Presentation

- New fields are **additive**; the existing fixed-gearing `min_dscr` stays as a diagnostic so nothing that consumes it breaks, and the drawer explains which is which.
- The public framing follows the correction we just shipped: the model now sizes debt the way a lender would, and the DSCR breach at the old assumed gearing is what motivated it. **State that the structure moved, not the asset.**
- No editorial state labels; numbers first; the locked design principles apply.

## CP — before any public number moves
Per-config table: solved debt, implied gearing, binding constraint, equity IRR, and the contracted-share sensitivity from §4. Plus the parameter table with sources. I sign before deploy.

## Gates
`/revenue` 54/54 byte-identical until the signed CP (new fields additive and off, or behind a flag) · every parameter sourced or explicitly banded · sculpting solver tested against a hand-computed golden case, not only against itself (B5) · full-repayment and non-negative-principal invariants asserted · `docs/_private/` never staged · NDA name/figure gate runs on every commit · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the solver's golden-case check · per-config table · contracted-share table · parameter sources · what the public surfaces will say · PR URL.
