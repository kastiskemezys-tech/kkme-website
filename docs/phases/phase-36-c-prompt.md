# Phase 36.C — Reserve-price fallback sources (S2 resilience)

**Branch:** `phase-36-c-reserve-fallback` off latest main. **Semi-autonomous: ONE CHECKPOINT after source audit (Pause A) — source viability determines everything downstream.**
**Estimate:** ~2-3 days depending on what the audit finds.
**Risk class:** MEDIUM — touches the S2 ingestion path (worker + possibly Mac cron + upstream); public S2 card comes back to life on ship.

## Why (the arc's own conclusion)

BTD (`baltic.transparency-dashboard.eu`) has been host-down since 2026-07-17 — 12+ days. It is the ONLY source for Baltic reserve capacity + activation prices, which after the 36.B measured-value cutover constitute **71 % of gross revenue in every published number — still assumed, not measured**, precisely because this feed is the single point of failure. The S2 card is serving 07-17 data. Measuring reserve realisation (the B3 treatment for the reserve stack — the single biggest remaining bankability upgrade) is impossible until reserve-price history flows again.

Goal: **BTD demoted from sole source to one-of-N.** Litgrid + Elering publish balancing-capacity procurement results directly; those become primary-capable feeds. Plus the B0-G forecast plumbing fix (routed here from batch-2).

## Pause A — Source audit (~half day) → CHECKPOINT

1. **BTD status re-check** — host, DNS history, any announcement of migration/decommission (Baltic TSO comms, LinkedIn, ENTSO-E news). If it returned: the phase becomes "add redundancy" not "replace"; scope shrinks.
2. **Litgrid direct:** locate balancing-capacity auction/procurement result publications (litgrid.eu — market data section, the BTD-predecessor pages Phase 33 encountered as "moved to BTD", any API/XLSX/CSV endpoints). Assess: products covered (FCR/aFRR/mFRR, cap + activation), granularity, history depth, format, update cadence, scrapability. **While there: log the URL of Litgrid's flexibility-need assessment / ten-year plan (the "973 MW by 2028 / 3.12 GW BESS" forecast document) — Phase 36.D consumes it; don't audit it here, just pin the primary source.**
3. **Elering direct:** same audit (elering.ee dashboard has an API — check balancing datasets; Estonia publishes reserve procurement).
4. **AST:** same (thinner expectation, per 33.A.2.b findings).
5. **ENTSO-E balancing library re-check:** B1's audit said "not available" for LT balancing — verify per-product per-country precisely (A81/A82/A83 document types; post-sync data may be arriving with lag as TSOs onboard).
6. **Baltic common procurement:** post-sync, the TSOs run coordinated capacity auctions — find WHERE results publish (this may be one feed covering all three countries).
7. **Verdict table:** per data need (S2 live card · reserve-price history for realisation measurement · forecast plumbing inputs) — best source, fallback order, gaps.

CHECKPOINT — report verdict table + proposed architecture + revised estimate. Operator approves before build.

## Pause B — Build (autonomous after checkpoint)

Shape depends on audit; expected:
1. **Multi-source S2 ingestion:** fetcher(s) for the viable source(s) (Mac cron pattern like fetch-btd.js, or worker cron if API-friendly), normalising to the existing s2 KV schema. Source priority chain with per-source freshness stamps; `_meta.source` reflects what actually served.
2. **BTD kept as a source** — self-heals into the chain whenever it returns.
3. **Staleness honesty:** the S2 card's freshness badge must reflect the true data age (verify it does — 12 days stale should be LOUD).
4. **B0-G fix:** `da_tomorrow` writers store the actual price array (`prices_24h`), resolution-aware (PT15M per the transition), so `mode=forecast` serves for the first time. Validate against the resolution lessons (36.B0-D class).
5. **History backfill** where the sources allow — every day of reserve-price history is future evidence for the reserve-realisation measurement.
6. Tests: per-source parsers (fixture-pinned), priority chain, staleness propagation, forecast plumbing end-to-end.

## Pause C — Ship
Deploy sequence per standing rules (worker changes → operator deploy → verify at cron tick, per the banked lesson). Verify: S2 card serving current data with honest source attribution · forecast mode returns a real forecast for the first time · handover routes the reserve-realisation measurement phase (36.D candidate — needs N weeks of accumulated multi-source history before it can run). PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-c-reserve-fallback`
