# Phase 36.E — ENTSO-E balancing: is there a surface that actually serves?

**Priority: LOW.** Filed by Phase 36.C, 2026-07-29. Not urgent while the VPS→BTD
path works. This buys genuine *source* redundancy, which 36.C explicitly did not
deliver — it delivered *path* redundancy, which is a different and lesser thing.

**Estimate:** ~half a day for the investigation. Build scope unknown until it
resolves, and may well be zero.

## Why this is filed unresolved rather than answered

36.C's Pause-A audit swept the legacy ENTSO-E REST API
(`web-api.tp.entsoe.eu/api`) for Baltic balancing data and found nothing. The
tempting conclusion — "the Baltics do not publish balancing data to ENTSO-E" —
is **not supported by that evidence**, and the distinction is the whole reason
this phase exists.

What the audit actually established:

- `A89` (prices of procured reserves) has **no valid parameter combination** at
  all. Every documented shape returns "not a valid combination".
- `A81` + `businessType=B95` is the one accepted shape, resolving to dataItem
  `AMOUNT_AND_PRICES_PAID_OF_BALANCING_RESERVES_UNDER_CONTRACT` (17.1.B&C),
  which carries both amounts and prices.
- `A84` / `A85` / `A86` resolve to valid dataItems
  (`PRICES_OF_ACTIVATED_BALANCING_ENERGY_R3`, `IMBALANCE_PRICES_R3`,
  `TOTAL_IMBALANCE_VOLUMES_R3`) and return empty for LT at 3d, 30d, 90d, 180d
  and 300d — so not a publication lag.

And the finding that stops it there — **the positive control failed**. `A81/B95`
also returns empty for **NL, DE(50Hertz), DE(TenneT), BE, FR and AT**, across all
six `type_MarketAgreement.Type` values, including a June-2024 window. Those are
control areas that certainly do publish contracted balancing reserves. The token
is entitled and working: `A44` day-ahead prices returned 160–184 points for LT
and NL on the same runs.

So the honest verdict is **"this API surface serves nobody"**, not "the Baltics
do not publish". Phase B1's original "not available for LT balancing" conclusion
is upheld operationally — the data cannot be had this way — but its stated
*reason* is wrong, and a wrong reason is a trap for whoever reads it next and
concludes the Baltics are a gap.

This is the audit-triage rule applied to our own work: an absence claim without
a working positive control is a hypothesis, not a finding.

## The question

Is Baltic balancing data (capacity prices, activation prices, contracted volumes,
imbalance) obtainable from ENTSO-E through **some** surface — and if so, which?

Candidate surfaces to test, in rough order of likely payoff:

1. **The current Transparency Platform API.** The platform was rebuilt; the
   legacy `web-api` path may be deprecated in place — still answering, still
   authenticating, no longer serving balancing dataItems. Find the current
   documented endpoint and re-run the sweep against it.
2. **SFTP / bulk download.** ENTSO-E publishes bulk extracts separately from the
   REST API, and coverage differs. This may be the only route for balancing.
3. **The web UI's own network calls.** If `transparency.entsoe.eu` renders
   Baltic balancing in a browser, whatever it calls to do so is by definition a
   working surface. This is the fastest decisive test and probably worth doing
   **first**, ahead of 1 and 2 — if the UI shows nothing for LT either, the
   question collapses to "ENTSO-E does not have it" and the phase closes in an
   hour.
4. **Third-party libraries** (`entsoe-py` and similar) as a cross-check on
   parameter shapes — they encode working combinations, so a diff against my
   sweep would show whether my shapes were simply wrong.

## Method — non-negotiable

**Every negative result requires a working positive control in the same run.**
That is the entire lesson of 36.C's sweep. Pick a control area that certainly
publishes the dataItem under test (NL, DE, BE), confirm it returns data, and
only then report the Baltic result. A sweep that returns empty everywhere is
evidence about the API, not about the Baltics.

Reusable probes from 36.C, if still wanted — they were scratchpad artefacts, not
committed, so they may need rewriting from the method described here rather than
recovered.

## Verdict criteria

| Outcome | Action |
|---|---|
| A surface serves Baltic balancing | Scope an ingestion leg. Real source redundancy — BTD stops being a single source. Likely a follow-on phase. |
| No surface serves it; controls pass elsewhere | Close. Record that the Baltics genuinely do not publish to ENTSO-E, **with the control that proves it**. Correct B1's stated reason. |
| Controls fail everywhere again | Close. The finding is about ENTSO-E's API, not about the Baltics. Record that and stop — do not build against it. |

## What this does not change

BTD remains primary either way. Even a working ENTSO-E leg would be a
cross-check and a fallback, not a replacement: BTD carries per-ISP PT15M
per-country reserve prices with ~300 days of history, which is a richer product
than anything 17.1 publishes.

## Context

- `docs/investigations/2026-07-29-phase-36-c-pause-a-source-audit.md` — the full
  audit, including the sweep results and the failed control.
- Phase 36.C shipped the VPS→BTD primary path, the admission chain, the cert
  tripwire, and 299 days of per-delivery-day clearing history.
