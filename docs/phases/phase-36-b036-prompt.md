# B-036 — Settled German activation-price source (gates E2/E3)

**Branch:** `phase-36-b036-activation-source` off latest main. **Autonomous. ~half day.**
**Why:** E0 established we hold NO settled German aFRR/mFRR activation prices — the RAM offer-curve export is bids, not settlements, and must never be read as a price series. E2/E3's activation models are gated until a settled source exists. ENTSO-E A84+A16 verified serving AT/FI but empty for DE.

## Scope
1. **netztransparenz.de** (the German TSOs' settlement-data platform): locate settled aFRR/mFRR activation/balancing-energy price publications. A5 discipline — verify what downloads actually contain, not what pages claim. Check: access (open/registered/API-key), format, resolution, history depth, licence.
2. If netztransparenz serves: acquire max history, normalise into the mature-markets schema, manifest + checksum + loader + fixture per E0 conventions, extend `summary-table.json` where the new series supports cells, note structural breaks (PICASSO accession DE-side is IN this series — segment it).
3. If netztransparenz does NOT serve (or gates behind registration worth operator review): document precisely, fall back to ENTSO-E A84+A16 for AT/FI as the activation-price evidence base — smaller markets, but PICASSO members with before/after coverage; state the substitution and its limits in `comparability.md`.
4. Either way: the wrap states what E2/E3 calibrate activation on, with the honesty line pre-written for the methodology.
5. **Piggyback (same trip, B-038):** confirm the recorded ENTSO-E A15/B95/A01 parameter shape for LT procured balancing capacity still returns data; if yes, file the one-line note that 36.C's worker-secondary could gain ENTSO-E as a tertiary path (route to 36.C follow-up, do NOT build it here).

## Gates
No engine changes (`git diff main -- workers/ app/` empty) · loaders + fixtures green · playbook four questions · manifests complete.

## Wrap
Origin-SHA · verdict (netztransparenz serves / fallback engaged) + what E2/E3 now calibrate on · PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-36-b036-activation-source`
