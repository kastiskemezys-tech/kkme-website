# Phase 36.B arc — Bankable backend

**Owner:** Cowork-authored 2026-07-28. Operator-owned (rule #5 — CC reads, never edits).
**Directive:** *"Focus on the backend for these calculators first — the real logic, guidelines, how to make sure it's actually really bankable first."* Portal UI (36.1-36.4) waits until this arc ships.
**Commercial frame:** this arc builds the Stage-2 "institutional depth" that the Path-to-Bankable sells. When a lender engages DNV/AFRY to review a KKME report, the report must survive. That review is the design target for every phase here.

---

## The bankability standard (what the advisor tests)

Compiled from DNV bankability guidance, lender-advisor scopes (AFRY/DNV revenue studies), Forvis Mazars BESS model reviews, and 2026 market practice:

| # | Test | Current state (v7.3 + Phase 34/35) | Gap |
|---|---|---|---|
| 1 | **Physical dispatch proof** — hourly chronological simulation with SoC continuity, showing the revenue stack is simultaneously achievable | Time-allocation model (70 % both-reserves / 14 % arb windows, `dispatch_observed_30d`) | **B1** |
| 2 | **Probabilistic revenue** — P50 for equity, P90 (P99 merchant) for debt sizing, with defensible distribution basis | 3 named scenarios (screening-grade) | **B2** |
| 3 | **Evidence over assumption** — key haircuts measured, not asserted; the advisor attacks the largest assumption first | Trading realisation 0.85 = assumed (Modo range 0.70-0.90) | **B3** |
| 4 | **Revenue-structure flexibility** — contracted floor/toll cases; "what % contracted floors the coverage" | 100 % merchant only | **B4** |
| 5 | **Internal consistency** — no contradictory branches; degradation↔dispatch loop closed or proven conservative open | dur_h 2h-3h band mixes calibrations (batch-35 finding); SOH open-loop | **B5** |
| 6 | **Auditability** — every number reproducible: run registry, versioned assumptions, lender-grade methodology document | 133-check harness + 44-row register + public methodology.md (good foundation) | **B6** |
| 7 | Independent benchmark reconciliation | Clean Horizon / BTD / Modo / BNEF / EBRD — **already shipped (34.5)** | — |
| 8 | Backtest vs realised market | 12-mo balancing backtest — **already shipped**; extended by B3 | — |

Rows 7-8 are why this arc is 2 weeks and not 2 months — the reconciliation spine already exists.

---

## Data foundation (resolve FIRST — B1 Pause A)

Everything in B2/B3 stands on hourly price history. Current known state (hypotheses — B1 audits empirically):

- **KV (worker):** rolling windows only — `s1_capture_history` 400-day, `s2_rolling_180d`, `capacity_monthly` (~5 mo). Hourly LT DA: `lt_hourly_24` = today only.
- **VPS PostgreSQL:** depth unknown — Session 73 noted "trailing 12m: 2 months" for one dataset; never audited fully.
- **BTD:** history since ~2025 via `price_procured_reserves`; how far back the API serves is unverified.
- **ENTSO-E Transparency:** authoritative hourly DA for LT/LV/EE back to 2015+, free REST API (token by email registration — **operator action, day 1: register at transparency@entsoe.eu**). Balancing data coverage for Baltics post-sync (Feb 2025) needs checking.
- **Nord Pool:** free day-ahead history via data portal; intraday trades = paid (€1.2k/yr country tier) — **decision deferred until B3 proves intraday matters at bankability level.**

**Minimum viable history for B2:** 2 complete calendar years hourly DA (2024, 2025) + partial 2026, LT zone; balancing prices from BTD/ENTSO-E for the post-sync period. Pre-sync balancing years are structurally different (BRELL) — use for DA shape only, never balancing calibration. This asymmetry MUST be documented in the methodology (B6).

---

## Phase specifications

### 36.B1 — Chronological hourly dispatch engine (~3-4 days)

**The load-bearing phase.** New module `workers/lib/dispatch.js` (or `tools/consultancy/lib/` if worker-runtime constraints bite — CC decides at investigation; either way single-source, no forked math).

**Policy: conservative greedy, NOT LP.** A linear-programming co-optimiser is optimiser-vendor territory — hard to explain, hard to audit, and *claims more revenue than a real BRP contract guarantees*. A greedy priority policy (reserve commitments first at observed acceptance rates → DA arbitrage in residual windows against day-ahead price shape → intraday uplift on residual) is simpler, auditable line-by-line, and its conservatism is a FEATURE in front of a credit committee. Document the policy as pseudocode in the methodology.

**Hourly state per project:** SoC (MWh, continuity enforced), committed reserve MW by product, available MW, price (DA hourly; balancing per period), availability draw (planned + forced outage windows totalling the 3 % haircut), POI export/import limit, negative-price rule (no discharge below €0 unless SoC-full forces cycling; charging PREFERRED in negative hours — free energy is upside, model it conservatively as €0 capture).

**Constraints enforced hourly:** SoC bounds (usable window e.g. 5-95 %), cycle budget (running EFC counter vs warranty cap — throttle DA cycling as budget tightens, NEVER breach), RTE on every charge leg (SOH-year-appropriate), reserve energy reservation (committed aFRR/mFRR MW implies SoC headroom both directions — this is the constraint the time-model can't see and the advisor most wants proven).

**Validation gates:**
1. **Reconciliation to current model:** hourly-summed annual revenue per product vs the time-model's Y1 for the reference asset. Expected: hourly comes in LOWER (it enforces constraints the allocation model idealises). Every delta explained and attributed; the delta itself becomes methodology content ("the hourly simulation confirms X % of the allocation-model revenue is simultaneously achievable").
2. Energy balance exact: Σ charge × RTE = Σ discharge, hourly and annually.
3. Cycle count from dispatch ≈ throughput-derived 678 EFC (±10 %, explained).
4. No hour violates any constraint (property test over the full 8760).
5. Public `/revenue` byte-identical — the hourly engine is a NEW capability alongside, not a replacement (cutover is a separate operator decision later).

### 36.B2 — Historical-year bootstrap → percentiles (~2-3 days)

- ENTSO-E backfill job: hourly DA for LT (LV/EE later), 2024-2026 → stored as static data files in `tools/consultancy/data/` (committed — public data, reproducibility beats repo-size purity here; revisit if >50 MB).
- For each historical market year: replay the B1 dispatch with that year's price shapes; apply the forward saturation transformation (fleet CPI trajectory per scenario) to produce each projection year's revenue under each historical shape-year.
- Output per project: revenue distribution → **P50 / P75 / P90 / P99** per year and lifetime; percentile bridge tables (the client bridge at P50 and P90).
- **Honesty constraints (methodology-bound):** N historical years is small (2-3) — percentiles beyond the sample are extrapolation; state the method (empirical percentiles of shape-years × parametric spread on balancing prices) and its limits. Pre-sync years excluded from balancing calibration, stated.
- Gate: P50 ≈ Central scenario within explained bounds; ordering P99 < P90 < P75 < P50 always.

### 36.B3 — Dispatch backtest → measured trading realisation (~1-2 days)

- Run the B1 policy day-by-day over realised 2025-07 → 2026-06 LT prices with day-ahead information only (the policy sees the DA curve after auction — as a real BRP does — never the future).
- Achievable capture ÷ perfect-foresight capture = **measured realisation**. Compare vs the assumed 0.85.
- Whatever the number is, it SHIPS: measured 0.81 beats assumed 0.85 in front of an advisor. If measured > 0.90, investigate for look-ahead leakage before believing it.
- Output: `trading_realisation_measured` replaces the assumption in the register (source: "KKME dispatch backtest 2025-07→2026-06"), with the old assumed value kept as a comparison row. Monthly breakdown for the methodology.

### 36.B4 — Contracted-revenue overlay (~1 day)

- Config: `{floor_eur_mw_yr, contracted_pct_of_mw, term_years, counterparty_note}`.
- Blended revenue = contracted floor on the tolled share + merchant on the rest; floor-only downside case; percentile impact (a floor truncates the left tail — show P90 with/without).
- Output: the bridge + percentiles at 0 % / 30 % / 50 % contracted. This is the "what floors the coverage" answer every financing conversation asks.

### 36.B5 — Degradation loop + dur_h continuity (~1-2 days)

- **Loop closure:** 2-pass iteration — dispatch → realised EFC → SOH trajectory → re-dispatch with SOH-scaled MWh. Converges in 2 passes for realistic parameters (verify); document residual.
- **dur_h fix:** align the `<= 2` / `>= 3` branch inconsistency (batch-35 finding). Calibration stays anchored at 2h/4h; the band between them gets ONE documented interpolation policy (linear on throughput AND RTE together, never mixed anchors). Property test: every output monotone-sensible in dur_h from 1h to 8h, no step discontinuities except documented calibration anchors.
- This touches engine internals → full regression discipline: byte-identity for /revenue (2h and 4h are on-anchor, should be exactly unchanged), explained deltas elsewhere.

### 36.B6 — Governance + lender-grade methodology (~1-2 days)

- **Run registry:** every runner invocation logs `{run_id, timestamp, engine_git_sha, input_hash, output_hash, data_vintage}` to `tools/consultancy/runs.jsonl` (committed). Every number in every delivered report traces to a run_id. Report footers carry it.
- **Assumption changelog:** the register gains version history — any value change appends `{date, old, new, reason, source}`. Delivered reports state register version.
- **Methodology expansion** (`docs/methodology-lender.md`, builds on public methodology.md): dispatch policy pseudocode · calibration evidence + dates · backtest results (B3 tables) · bootstrap method + its stated limits · degradation loop · dur_h policy · data lineage (ENTSO-E/BTD vintages, pre/post-sync asymmetry) · known limitations (honest list — the advisor finds them anyway; finding them pre-listed builds trust). Target 25-40 pp when PDF-rendered. This document is itself a sales asset.

---

## Sequencing + batching

```
Batch B-1: 36.B1 (with data-audit CHECKPOINT after Pause A — semi-autonomous)
Batch B-2: 36.B2 + 36.B3   (autonomous — B1's patterns established)
Batch B-3: 36.B4 + 36.B5   (autonomous)
Batch B-4: 36.B6           (autonomous, mostly documentation + tooling)
```

The B1 checkpoint exists because the data audit's findings (how much history, where) determine B2's design — the one decision Cowork/operator must see before it's baked in. Everything after runs on the proven autonomous pattern.

**Operator actions, day 1:** register for ENTSO-E API token (email transparency@entsoe.eu — approval 24-48 h, needed by B2).

## Standing rules (all batches)

- Public `/revenue` byte-identical every commit (54/54 + route-level probe — the batch-35 gate-scope lesson: assert at the outermost layer).
- New capabilities land ALONGSIDE the existing engine; cutover of the public site to hourly-based numbers is a separate, explicit operator decision (it will move public IRR — that's a Phase 37 conversation).
- Rule #1: 13 corrections and counting — every claim in this arc doc is a hypothesis for Pause-A verification.
- Rule #4: one canonical implementation per quantity — the hourly engine REUSES price inputs, RTE curves, SOH curves, CPI machinery; it never re-implements them.
- NDA: Prosperus configs are public-register; client technical docs stay in docs/_private/.
- Worker deploys only when worker files change and byte-identity holds; operator-sequenced.
