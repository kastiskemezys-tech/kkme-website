# Phase 37.D — CP delta table (36.D CP-2 pattern)

**Date:** 2026-08-01 · **Branch:** `phase-37-batch-2` · **Reference commit:** `46d1bdf` (= `origin/main`).
**Status: AWAITING OPERATOR SIGNATURE. Nothing deployed.**

---

## Method (C6, C3, A8)

The baseline comes from a **clean worktree** of `46d1bdf` (`git worktree add`), never from a stash — 36.D's stash-based baseline produced a sign-wrong +12.9 % client delta, which is why this rule exists.

Both sides run against **one frozen KV snapshot**, `sha256 b52cc355d4e7d8854d607cec…`, captured once at `2026-08-01T10:41:05.879Z` and copied byte-identical into both trees (hashes compared before each run). Hitting the live worker on each side would have measured data drift instead of code change.

No magnitude was predicted before measuring (A8). The zeros below are the measurement.

---

## 1. Public numbers — `/revenue`, all 54 published parameter combinations

`computeRevenueV7` run over the full cross-product the public route can produce, against the committed frozen fixture, each result hashed with `timestamp` stripped.

| | result |
|---|---|
| Configurations compared | **54 / 54** |
| Configurations whose full-result hash differs | **0** |
| Largest relative movement, 54 configs × 4 metrics | **0.0000000000 %** |

Reference config `dur=2h capex=mid cod=2028 scenario=base`:

| Metric | Pre (`46d1bdf`) | Post (batch-2) | Abs Δ | % Δ | Cause |
|---|---:|---:|---:|---:|---|
| Gross revenue Y1 | €7 994 239 | €7 994 239 | **0** | **0.0000 %** | no engine input changed |
| EBITDA Y1 | €5 064 816 | €5 064 816 | **0** | **0.0000 %** | no engine input changed |
| Project IRR | 0.2228 | 0.2228 | **0** | **0.0000 %** | no engine input changed |
| **Min DSCR** | 2.36 | 2.36 | **0** | **0.0000 %** | no engine input changed |
| NPV @ WACC | €16 139 595 | €16 139 595 | **0** | **0.0000 %** | no engine input changed |

## 2. Client numbers — Prosperus portfolio (3 projects, 123 MW / 246 MWh)

| Metric | Pre (`46d1bdf`) | Post (batch-2) | Abs Δ | % Δ | Cause |
|---|---:|---:|---:|---:|---|
| Portfolio gross Y1 | €12 770 114 | €12 770 114 | **0** | **0.0000 %** | no supply input changed |
| Portfolio EBITDA Y1 | €7 941 385 | €7 941 385 | **0** | **0.0000 %** | no supply input changed |
| **Portfolio NPV @ 8 %** | €37 177 495 | €37 177 495 | **0** | **0.0000 %** | no supply input changed |
| Portfolio MOIC | 3.431 | 3.431 | **0** | **0.0000 %** | no supply input changed |
| Gross CAPEX | €40 344 000 | €40 344 000 | **0** | **0.0000 %** | unchanged |
| IRR — Bitėnai | 0.2307 | 0.2307 | **+0.000000** | **0 %** | no supply input changed |
| IRR — Stoniškiai | 0.2045 | 0.2045 | **+0.000000** | **0 %** | no supply input changed |
| IRR — Eigirdžiai | 0.2051 | 0.2051 | **+0.000000** | **0 %** | no supply input changed |

The full `portfolio.json` is **identical between the two runs** with `generated_at` / `kv_captured_at` / `run` stripped — not "within tolerance", identical.

---

## 3. Why every delta is zero — the named cause

Not because the wiring was skipped. Because **there is no citable capacity to wire in.**

The 37.A evidence set holds 141 rows: 36 public-confirmed, 105 private-only, 0 corroborated. The 105 are excluded by the privacy architecture. Of the 36:

- every one is LV, `new-to-us`, and carries **exactly one** citation;
- all 36 citations are `data.gov.lv`, `source_type: registry`;
- every `what_it_confirms` reads *"entity resolves in the Latvian Uzņēmumu reģistrs, reg. NNNNNNNNNNN, status active"*;
- **`Σ bess_mw` across all 36 = 0.0 MW.**

Their only power figure is `site_total_mw` (Σ 3 583.5 MW) and their only technology figure is `plant_type`. **Both come from the operator's private workbook, not from the citation.** A registry entry proves a company exists. It does not prove a battery exists, or how large it is. Publishing those 3 583.5 MW would publish private testimony wearing a registry citation — barred by rule #3 and by the arc's own words: *"a row that only exists in the private table stays private-only until a public source corroborates it"*, and corroborating the **company** is not corroborating the **capacity**.

So `verifiedSupplyContribution` returns **0 MW from 0 of 141 contributing rows**, and the supply trajectory is untouched. The zero is asserted by test, not assumed: `supply.test.ts` fails if `site_total_mw` ever leaks into the sum.

**Secondary reason the deltas could not have moved much anyway:** `cpi` sits at its **0.30 floor** in the live fleet payload, so a supply change must be large enough to lift CPI off the floor before any IRR can respond.

---

## 4. The three supply bases

Artifact: `tools/fleet-intel/data/supply-bases.json` (public-safe, leak-gated at write time).

| Basis | Value | What it is |
|---|---:|---|
| **Pre-37 baseline** | **16 020.4 MW** | the public fleet as published, every entry at full site MW |
| **KKME-verified bottom-up** | **+0.0 MW** (16 020.4 MW) | 0 of 141 rows carry a citation speaking to capacity |
| **Litgrid L TrSc** (LT only) | 1 260 / 2 115 / 2 428 / 2 652 MW at 2028 / 2030 / 2033 / 2035 | the TSO's own published series, as-published |

Three claims about the same market, deliberately **not** reconciled to one another — the 36.D precedent: the KKME-vs-Litgrid gap changes sign across years, so any tolerance band wide enough to hold would assert nothing.

The client sentence the arc anticipated was *"the TSO projects X; our verified bottom-up sees Y"*. The honest version is: **the TSO projects X; we can cite the existence of 32 distinct Latvian companies and the capacity of none of them.** That is a more useful artifact than a number we would later have to withdraw, and it names its own unblocker.

## 5. The hybrid band — re-derived, never corrected

Inherited from `hybrid-band.json` by `hybridBand()`: **11 975.7 – 16 020.4 MW, width 4 044.7 MW.**

- Re-derived **from the artifact**, never recomputed from the private BESS-MW column, whatever its magnitude.
- **No midpoint is exposed**, and a test asserts the midpoint value appears nowhere in the object — *"a midpoint is a point estimate wearing a range costume"*.
- The band's **upper bound equals the status quo**: live `Σ raw_entries[].mw` = 16 020.4 MW = `band.upper_bess_mw`, verified against `/s4/fleet`. Adopting the band therefore **moves no published point** — it only states the uncertainty that was always there.
- It **understates** that uncertainty, and says so wherever displayed: only 24 of 45 known hybrids carry a public technology signal, so the true lower bound sits *below* `lower_bess_mw`.

**Direction check, stated as required.** A hybrid correction moves supply **DOWN** → `sd_ratio` down → cannibalisation down → **IRR UP**. That is the flattering direction. Flattering movements demand the strongest evidence available; we do not have it, which is exactly why this ships as a band and not as a correction.

## 6. Retired-MW accounting

`retiredMwAccounting` — **gated**, and currently **OK: 0 retirements, 0 MW**, because `fleet_lifecycle:transitions` is empty (`/health.fleet_lifecycle` reports `transition_log_size: 0`).

It refuses to subtract a retirement that matches no fleet entry, or that carries no resolvable citation. A test replays batch-1's near-miss shape — 500 uncited retirements — and asserts `ok: false` with `retired_mw: 0`. That near-miss (an untrimmed truthiness check marking all 486 509 LV entities terminated, Latvenergo included) passed every other gate, which is why this is a first-class check rather than a footnote.

---

## What is being asked for

**Signature on a zero.** The wiring, the tier weighting, the exclusion, the band re-derivation, the three-basis comparison and the retirement tie are all built and tested; they move no public and no client number, because the evidence set contains no citable capacity.

If signed, what deploys is 37.C's console routes plus this measurement machinery. Neither touches an engine input, and the 54/54 hash-identity above is the proof rather than the promise.

**Deploy still additionally requires `wrangler secret put FLEET_SECRET`** — until it is set, `/fleet/*` returns 503 with zero data (fail-closed, asserted by test).
