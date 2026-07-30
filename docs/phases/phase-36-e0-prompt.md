# Phase 36.E0 — Mature-market evidence base

**Branch:** `phase-36-e0-evidence-base` off latest main.
**Mode:** semi-autonomous, ONE CHECKPOINT at wrap — the cross-market summary table and dataset quality determine every calibration in E1-E6; operator reviews before the arc proceeds.
**Estimate:** ~2-3 days.
**Risk class:** LOW code risk (data + loaders only, no engine changes, no deploys), HIGH downstream-consequence (bad data here poisons every later phase).

Arc doc governs: `docs/phases/phase-36-e-arc.md` §36.E0. Read `docs/playbooks/failure-modes.md`; at Pause A answer the four questions. Particular exposure this phase: **A5 in industrial quantity** — every dataset arrives through a portal/API whose documentation may lie about coverage; verify by fetching and inspecting actuals, never by reading the docs page. **A3** — access terms, URL schemes, and licensing change; everything is checked at execution time.

## Scope (per arc doc, operationalised)

### 1. Dataset acquisition — priority order
1. **Germany, regelleistung.net** — FCR/aFRR/mFRR capacity + energy auction results, maximum available history (target 2015→now; the docs claim further — verify what actually downloads). THE reference lifecycle.
2. **Fingrid open data (FI)** — FCR-N/FCR-D hourly/period prices + volumes; aFRR where available. Clean API, good history.
3. **Statnett / Svenska kraftnät (NO/SE)** — primary reserve market results; take what is cleanly downloadable, don't fight portals for marginal additions.
4. **GB — NESO data portal** — DC/DM/DR auction results + legacy FFR; the 2022-23 saturation episode must be fully covered.
5. **Australia — AEMO / opennem** — FCAS prices + battery dispatch-era summaries; arbitrage-maturity evidence (SA).
6. **PICASSO/MARI accession effects** — ACER market monitoring reports + ENTSO-E platform publications: accession dates per country + before/after aFRR/mFRR energy price behaviour for at least two earlier joiners each.
7. **Baltic structural calendar** — primary-source pinning (rule #3, fetch-at-pin per C7): PICASSO/MARI Baltic accession target dates, coordinated Baltic capacity-auction design docs, any derogations. ENTSO-E/ACER/TSO documents only.

Per dataset: raw files into `tools/consultancy/data/mature-markets/<market>/` (committed if licence-clean and size-sane; manifest + fetch script if too large — decide per dataset, document), provenance manifest (source URL, licence, retrieval date, resolution, span, checksum), loader with fixture test, and a **coverage-verification note: what the portal claimed vs what the download actually contains**.

### 2. Normalisation
One schema across markets: `{market, product, mechanism (cap|energy), period_start, period_end, resolution, price, currency, volume?, notes}`. Currency conversion policy: store native + EUR at period-average ECB rates (rate table committed, sourced). No resampling in storage — loaders serve native resolution; analysis resamples explicitly.

### 3. The cross-market summary table (the checkpoint artifact)
Per market × per service, computed FROM the committed data (never from literature): first-battery-entry year (defined criterion, documented) · years to saturation (defined as price reaching within X % of floor — criterion documented and applied uniformly) · peak-to-floor price ratio · floor level in EUR and as ratio to contemporaneous arbitrage opportunity · demand growth over the same window · structural breaks annotated (auction reforms, platform couplings — these must be separated from organic decay or every half-life is wrong).

### 4. Honesty layer
- Where a market's data can't support a cell (e.g., floor not yet reached), the cell says `not_reached` — never extrapolated.
- Structural-break contamination flagged per series (DE aFRR auction reforms are the known hard case — a decay half-life computed across a reform is meaningless; segment the series).
- A `comparability.md` note: what makes each market a valid/invalid analogue for the Baltics per service (market size, technology mix of the marginal provider, coupling status) — the E1-E5 phases cite this rather than re-arguing it.

## Gates
Loaders + fixtures green · manifests complete with checksums · summary table reproducible from committed data by one script (`build-summary-table.mjs`) · no engine changes (`git diff main -- workers/ app/` empty) · playbook four-questions answered in the report.

## CHECKPOINT at wrap
Report: per-dataset acquisition verdict (claimed vs actual coverage) · the cross-market summary table · comparability notes · structural-break annotations · anything that changes the E1-E5 specs (e.g., if PICASSO before/after data is thinner than hypothesised, E2's break-calibration design changes — say so now, not in E2). Operator approves the evidence base before E1 begins.

PR: `https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-e0-evidence-base`
