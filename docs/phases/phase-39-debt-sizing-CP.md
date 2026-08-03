# Phase 39 — CP: debt sized from cash flows

**Branch:** `phase-39-debt-sizing` · **Status:** CP, awaiting operator signature. **No public number has moved.**
**Run:** `node scripts/_phase-39-debt-sizing.mjs` (frozen KV fixture, one process, one engine module).

---

## Pause A — the four questions

**(a) Which premises are HYPOTHESIS vs verified.** The prompt's central premise is **verified**, not assumed: at the reference configuration (`dur=4h capex=mid cod=2027 scenario=base`) `min_dscr` is **0.95** and does not cross 1.00, and **24 of 54** public configurations sit below 1.00. Gearing, tenor and rate are hardcoded at `workers/fetch-s1.js:2352-2359` (`debt_pct = 0.55`, `tenor = 8`, `grace = 1`, level annuity `pmt`), duplicated in V6 (`:3121-3130`) and the legacy calculator (`:4310-4316`); V7 is the live engine (`:11197`). The mechanism behind the 0.95 is **measured, not inferred**: CFADS declines 3.96 M → 2.68 M across the debt life while the annuity is flat at 2.80 M. A flat charge against a declining profile must breach in the late years. Everything sourced from outside the repo is a **transfer** and is labelled as one — see §3.

**(b) What consumes what this phase changes.** `min_dscr` has **68 references** across 15 files (`grep -rn "min_dscr" --include=*.{ts,tsx,js,mjs}`, excluding `node_modules`/`docs/audits`), including `bankability` (`fetch-s1.js:2707`), `RevenueCard`, `HeroBalticMap`, `mwPartitionCopy`, the sensitivity matrix, the KV snapshot allow-list and the regression reference. **Nothing is repointed.** The fixed-gearing `min_dscr` stays exactly as it is, as a diagnostic; the solved structure is additive and lives outside the payload. Verified by byte-identity, not by inspection.

**(c) What fails silently here.** Three things, each gated:
1. **A sculpt that cannot cover its own interest.** Principal goes negative, gets floored to zero, and the facility silently capitalises. Caught by an explicit `sculpt_binds` flag, asserted in `assertDebtInvariants`. This gate was itself unfailable when first written — see §5.
2. **The tax circularity.** CFADS depends on the interest deduction, which depends on the debt being solved for. At the reference config the circularity is **inert** (depreciation of €3.28 M/yr already floors taxable income), so a solver that ignored it would agree exactly here and diverge silently elsewhere. It binds in **42 of 54** configurations. Solved as a fixed point everywhere and **reported per config**, not assumed either way.
3. **The stale regression baseline** — see §6.

**(d) At which layer and time success is verified.** At the engine's public output, against a **clean `origin/main` worktree** (not a stash — C6), hashing `computeRevenueV7` over all 54 public configurations against the same frozen KV fixture. No deploy, no live data, no timing window.

---

## 1 · The model

Debt is solved from cash flows to a target DSCR; **gearing is the output**.

- **Sculpted amortisation.** Scheduled principal in year *t* is `CFADS_t / DSCR_target − interest_t`, subject to non-negative principal and full repayment by tenor end.
- **Method.** Outer bisection on debt quantum, inner fixed point on the interest path. *Not* the closed-form PV of the sculpted service — the closed form cannot carry the tax circularity and silently violates the non-negative-principal invariant on an uneven profile (it over-sizes by **43 %** on golden case 4). It is retained as an independent cross-check in the tests only.
- **Both constraints applied.** A DSCR-implied quantum and a gearing cap, with the binding one reported per config.

---

## 2 · Parameters — sourced, and the transfer stated

Base case takes the **conservative end of every sourced range**, asserted mechanically in `debtParams.test.ts` rather than claimed here.

| Parameter | Base | Published range | Source | Transfer? |
|---|---|---|---|---|
| Merchant storage DSCR | **2.00×** | 1.20–2.00× | Beth Waters (MUFG), *Cost of Capital: 2025 Outlook*, Norton Rose Fulbright / projectfinance.law, [2025-01-24](https://www.projectfinance.law/publications/2025/january/cost-of-capital-2025-outlook/) — "Merchant storage 2.0 times debt service." | **yes — US panel** |
| Contracted storage DSCR | 1.20× | 1.15–1.20× | Beth Waters (MUFG), same source and the [2026 Outlook](https://www.projectfinance.law/publications/cost-of-capital-2026-outlook), 2026-01-29 — the same figure in both years | **yes — US panel** |
| Tenor (legal, incl. grace) | **7 yr** | 7–10 yr | Nathalie Lemarcis & Michael De Witte, Société Générale CIB, ["BESS — Emerging Asset to Essential Infrastructure"](https://wholesale.banking.societegenerale.com/en/news-insights/all-news-insights/news-details/news/bess-emerging-asset-to-essential-infrastructure/), 2025-06-24 — "7-year to 10-year legal tenor hard mini-perms… constrained by the underlying warranty duration" | no — European bank, European market |
| Debt margin | **350 bp** | 275–350 bp | Ralph Cho (Apterra), *Cost of Capital: 2025 Outlook*, 2025-01-24 — "For merchant battery assets, you are looking at 275 to 350" | **yes — quoted over SOFR, applied over EURIBOR** |
| Gearing cap | 60 % | 40–60 % | Pexapark, ["The BESS Brief — Part 2"](https://pexapark.com/blog/prmc-the-bess-brief-part-2-bess-financing/), 2025-07-15 — "most deals today fall within the 40–60% range" | no — European BESS deals |
| Merchant share lenders will underwrite | 25–40 % | — | Ralph Cho: "limit the merchant revenue to a maximum of 25% to 30%"; Beth Waters: "not going over 40% merchant" — *2026 Outlook*, 2026-01-29 | **yes — US panel** |
| Base rate (3M EURIBOR) | 2.60 % | — | ECB, via the engine's own KV snapshot, 2026-07-28 | no |
| **DSCR blend for partial contracting** | weighted | — | **UNSOURCED — modelling choice** | n/a |

**Corroboration.** NREL's Annual Technology Baseline independently cites Norton Rose Fulbright at a **P50 DSCR of 2.0 for battery storage**, reached by a separate search path.

**What could not be sourced, stated as such.** No European source consulted publishes a storage DSCR number. DNV, Modo Energy's 2025 European BESS financing review, ess-news' BBDF 2025 and 2026 coverage and energy-storage.news' German merchant-BESS piece all discuss DSCR **qualitatively only** ("tighter DSCRs", "robust DSCR cushions"). That absence is reported rather than papered over, and it is why the DSCR rows carry a transfer flag.

**The blend is not sourced.** No consulted source publishes a rule for blending merchant and contracted DSCR at a partial contracted share; they publish the two endpoints. A revenue-weighted linear blend reproduces both endpoints exactly and that is the most that can be claimed for it. It sits next to well-sourced parameters and must not inherit their authority — the E1/E2 `dur_req_h` precedent. Its effect is quantified and separated in §4.

**Note on the engine's existing rate.** The fixed-gearing diagnostic prices merchant debt at EURIBOR + **250 bp** (`fetch-s1.js:1636`), *below* the sourced merchant range. The diagnostic is left untouched; the solver uses the sourced 350 bp.

---

## 3 · Per-configuration result

Reference configuration, `dur=4h capex=mid cod=2027 scenario=base`:

| | engine today | sized from cash flows |
|---|---|---|
| structure | fixed 55 % gearing, level annuity | solved to 2.00× DSCR, sculpted |
| debt | €18.04 M | **€7.85 M** |
| gearing | 55.0 % (input) | **23.9 % (output)** |
| min DSCR | **0.95 — never crosses 1.00** | 2.00 in every sculpted year, by construction |
| average life | — | 4.49 yr |
| equity cheque | €14.76 M | €24.95 M |
| equity IRR | 4.78 % | 4.70 % |
| binding constraint | n/a | **DSCR** |

Across all 54 configurations: **DSCR-bound 54/54, gearing-capped 0/54.** Solved gearing min 11.1 %, median 27.7 %, max 58.2 %. The tax circularity binds in 42/54.

**The finding.** The asset does not fail debt service — the assumed capital structure did. At 55 % gearing on a level annuity it breaches; sized properly it supports **€7.85 M at 23.9 % gearing** with 2.00× cover throughout. The structure moved, not the asset.

---

## 4 · Contracted share — two channels, separated

**This table was wrong in its first form and the correction is the finding of the phase.** Built naively it showed sustainable debt **+25.5 % at 50 % contracted**, which reads as "the floor converts into debt". Decomposition showed that **98 % of that movement was the unsourced DSCR blend**, not the floor. Contracting raises debt through two channels and they are now reported separately:

- **(A) Cash-flow effect — MEASURED.** The floor lifts CFADS in the years it binds. DSCR held at the merchant 2.00×, so this is the floor alone.
- **(B) Lender-treatment effect — ASSUMED.** Contracted revenue underwritten at a lower DSCR, via the unsourced blend.

Floor €116k/MW/yr (median of merchant net revenue per MW, operating years 1–10, central case), 10-year term, blended. Illustrative structure test, no counterparty — rule #3.

| scenario | contracted | 20yr net rev | debt (A) measured | debt (A+B) w/ blend | gearing | equity IRR | floor pays |
|---|---|---|---|---|---|---|---|
| base | 0 % | €101.81 M | €7.85 M | €7.85 M | 23.9 % | 4.70 % | — |
| base | 25 % | €101.95 M | €7.87 M | €8.74 M | 26.6 % | 4.73 % | 6/10 yr |
| base | 50 % | €102.10 M | €7.88 M | €9.85 M | 30.0 % | 4.76 % | 6/10 yr |
| conservative | 0 % | €98.67 M | €7.27 M | €7.27 M | 22.2 % | 3.29 % | — |
| conservative | 25 % | €99.10 M | €7.34 M | €8.16 M | 24.9 % | 3.40 % | 7/10 yr |
| conservative | 50 % | €99.52 M | €7.41 M | €9.26 M | 28.2 % | 3.50 % | 7/10 yr |
| stress | 0 % | €93.63 M | €6.32 M | €6.32 M | 19.3 % | −0.76 % | — |
| stress | 25 % | €94.49 M | €6.47 M | €7.19 M | 21.9 % | −0.49 % | 8/10 yr |
| stress | 50 % | €95.35 M | €6.62 M | €8.27 M | 25.2 % | −0.25 % | 8/10 yr |

### The measured asymmetry

At 50 % contracted, **floor alone, no blend assumption** — how much faster debt rises than revenue:

| scenario | revenue | debt | lever |
|---|---|---|---|
| base | +0.29 % | +0.37 % | **1.30×** |
| conservative | +0.86 % | +1.94 % | **2.25×** |
| stress | +1.84 % | +4.80 % | **2.61×** |

> **Correction, 2026-08-03.** These levers were first reported as 1.28 / 2.26 with a ratio of 2.04×. Those were computed from the ROUNDED percentage deltas in the printed table rather than from the underlying values. The run artifact carries 1.3030 / 2.2538 / 2.6108. The published copy uses the unrounded values and derives the ratio from them. The conclusion is unchanged.

**A floor converts into debt 2.00× more efficiently in the downside than in the central case.** Sculpting is set by the low years, so the worse the case, the more a floor is worth as debt rather than as revenue. That is 36.B4's tail-vs-median asymmetry in its financing form — **measured here on the deterministic scenario ladder, not inherited from B4's P90**, which the five-shape-year sample cannot resolve (`methodology-lender.md` §4, `resolved: false`).

This is the answer to "why would I contract away upside", and it is derived rather than asserted. The honest number is smaller than the naive one and it stands on its own mechanism.

**Separately, and not modelled as a constraint:** the same lender panels cap merchant revenue at **25–40 %** before they will lend at all. On that evidence the 0 %-contracted column is not a financing option at any DSCR. Reported, not applied — applying it would declare the answer by assumption.

---

## 5 · DSCR sensitivity — how much is the transferred parameter?

The entire answer rests on 2.00× merchant cover, a flagged US-panel transfer producing the striking claim that a fully merchant Baltic BESS is barely debt-financeable. Shown, not described:

| DSCR target | solved debt | gearing | equity IRR | median gearing (54 cfg) | configs < 30 % gearing |
|---|---|---|---|---|---|
| 1.50× | €10.47 M | 31.9 % | 4.64 % | 37.1 % | 16/54 |
| 1.75× | €8.97 M | 27.4 % | 4.68 % | — | 26/54 |
| **2.00× (base)** | **€7.85 M** | **23.9 %** | **4.70 %** | **27.7 %** | **33/54** |

**The conclusion is stable across the range.** Even at 1.50× — already well below anything published for *merchant* cover, and only just above the 1.15–1.20× published for *contracted* — gearing reaches 31.9 % at the reference config and 37.1 % median. That remains far below the 55 % the engine assumes and below the midpoint of the 40–60 % European BESS range. **The transferred parameter moves the magnitude, not the finding.** Every configuration stays DSCR-bound at every point on the ladder, so the 60 % gearing cap is not what produces the low gearing.

---

## 6 · Two things the operator should know

**The committed regression baseline is red on untouched `main`.** All 54 configurations drift against `tools/consultancy/regression-baseline.json`, which was captured 2026-07-29 and predates 38.6 / 38.6a / 38.8 / 38.8a — phases that deliberately moved public numbers. **This phase did not recapture it.** Doing so inside this phase would erase 38.x's record and mask this phase's own diff (B7). Instead the byte-identity gate here runs against a clean `origin/main` worktree. **The recapture should be its own deliberate commit at the next boundary, stating which SHA and date the new baseline represents** — not a side effect of whoever notices it next.

**The §4 correction.** Recorded here as a correction rather than quietly fixed (B9). The first table would have credited a contracted floor with a +25.5 % debt uplift that was 98 % an unsourced modelling assumption of mine.

---

## 7 · Gates

| Gate | Result |
|---|---|
| Public payload byte-identity vs clean `origin/main` worktree (b7e9618) | **54/54 identical** |
| Full suite | **2257 passed, 122 files** |
| Solver golden cases | 26 passed — 4 hand-computed, verified independently in Python `decimal` |
| Parameter provenance | 16 passed |
| Engine contract hook | 11 passed |
| Inject-then-revert on all three new gates | all go red on injection, green on revert |
| eslint delta | **zero** on every file this phase touches |
| `lint:no-editorial-chips` · `lint:manifest-single-writer` | pass |
| `docs/_private/` staged | none |
| Named entities | all attributed speakers in cited publications with URLs (rule #3) |

**On the golden cases.** Four hand-computed cases, every intermediate amortisation line written out in the test comments. Three of the four initially failed — **all three were arithmetic slips in my own hand-worked comments, and the solver was correct in each**; the values were then re-derived independently at 30-digit precision. Golden case 4 exists because inject-then-revert showed the non-negative-principal invariant **could be disabled with the entire suite staying green** (B13's corollary): no test case reached a year where the sculpt cannot cover interest. Case 4 is that case — a collapsed year forcing the balance to exactly 40/0.10, giving **D = 2080/1.21 = 1719.0083** by hand — and the invariant now asserts on the *sculpt*, not on the floored principal.

---

## 8 · What the public surfaces would say — NOT YET WRITTEN

No copy has been drafted and no public number has moved. On signature, the framing follows the correction just shipped: *the model now sizes debt the way a lender does, and the DSCR breach at the old assumed gearing is what motivated it.* **The structure moved, not the asset.** New fields additive; the existing fixed-gearing `min_dscr` stays as a diagnostic with the drawer explaining which is which. No editorial state labels.

## 9 · Sign-off asked

1. The parameter set and its conservative-end base case, transfers included.
2. Publishing gearing as an **output** (23.9 % at the reference config) alongside the retained 0.95 diagnostic.
3. Whether §4 goes public as the two-channel table, or measured-channel only.
