# Phase 12.10.0 — Saulėtas Pasaulis hallucinated entity (investigation)

**Date:** 2026-05-03
**Branch:** `phase-12-10-0-entity-purge`
**Trigger:** Audit #5 (2026-05-03) cross-checked KKME against Lithuanian commercial registry, Litgrid press, VERT, AST, Evecon, EBRD. Surfaced "UAB Saulėtas Pasaulis (500 MW)" pipeline-exit entry as fabricated.
**Outcome:** Entry removed via new `POST /feed/delete-by-id` worker endpoint. Two helper functions (`isGenericSourceUrl`, `hasHallucinationHedgeLanguage`) added to `app/lib/feedSourceQuality.ts` for Phase 12.12 to wire into the structural ingestion gate.

---

## 1. The entry

| Field | Value |
|---|---|
| id | `mna2ne4x-xfri25` |
| title | `Pipeline exit: UAB "Saulėtas Pasaulis" (500 MW) (LT)` |
| source | `litgrid` |
| source_url | `https://www.litgrid.eu/` (homepage, no path) |
| published_at | `2026-03-28T06:00:52.201237+00:00` |
| category | `competition` |
| consequence | `UAB "Saulėtas Pasaulis" (500 MW) removed from litgrid pipeline. If confirmed, eases competition pressure on remaining projects.` |
| feed_score | 0.78 |
| status | `published` |
| origin | absent |

Captured from `GET /feed` on 2026-05-03 prior to removal.

## 2. Hallucination markers (three independent tells)

1. **No matching company in Lithuanian commercial registry.** A 500 MW pipeline removal would be the largest single Baltic storage-pipeline exit on record — would have made trade press if real. None did.
2. **Generic source URL.** `https://www.litgrid.eu/` (homepage, no path). Real Litgrid press releases live at specific paths like `/index.php/naujienos/naujienos/litgrid-per-3-menesius-…/36506`. Generic-domain URLs are a hallucination tell — the LLM didn't know the actual source URL so it defaulted to the homepage.
3. **"If confirmed" hedge language.** Real news doesn't write "if confirmed, eases competition pressure" — it confirms or it doesn't print. The hedge phrase betrays the model's own uncertainty about the published claim.

Phase 4F's `/feed/purge-irrelevant` cannot catch this entry — it passes the source-tier gate (litgrid is tier1, auto-passes topic threshold), the title-length gate, and the URL-shape gate. Only structural named-entity verification (Phase 12.12) or human cross-check would catch it.

## 3. Ingestion-path trace (the structurally important part)

This determines what Phase 12.12's named-entity gate must intercept. Three plausible paths:

| Path | Worker entry point | id format | Indicators |
|---|---|---|---|
| `POST /feed/events` (typed-event API, operator-pushed) | line 6573 | `makeId()` → `{base36-Date.now()}-{6 random}` | Has full typed-event fields (event_type, source_quality, horizon, affected_modules, affected_cod_windows) |
| `POST /curate` → `appendCurationToFeedIndex()` (curation projection) | line 7181 → 5241 | `cur_{curationId}` | `origin: 'curation'`, `source_tier`, `topic_score` set by `projectCurationToFeedItem` |
| LLM-drafted in digest pipeline | n/a — digests do not write to feed_index | n/a | n/a |

**Evidence from this entry:**
- id `mna2ne4x-xfri25` matches `makeId()` format. **No `cur_` prefix** → not curation-projected.
- Field shape includes `event_type`, `source_quality`, `confidence`, `horizon`, `impact_direction`, `affected_modules`, `affected_cod_windows` — the exact schema written by `POST /feed/events` (worker line 6603).
- `git log -S "Saulėtas Pasaulis"` returns only documentation commits (`aa8c1ff`, `61c88d4`, `0b837db`, `2eaba5e`). **No code path in the repo creates the entity** — no script, no LLM curation prompt, no operator-curated JSON file.
- `daily_intel.py` lives on the VPS (`/opt/kkme/app`), not in this repo, but it writes via `/curate` → `appendCurationToFeedIndex` which produces `cur_*` ids. Not the source.

**Conclusion:** entry was hand-pushed via `curl POST /feed/events` from operator's terminal. Body content was LLM-drafted externally (in a Cowork / CC chat that produced curl commands without verifying the entity). The fabrication entered KV via the typed-event API; no committed script or scheduled job authored it.

## 4. Implication for Phase 12.12

The structural fix must wire into **`POST /feed/events` (worker line 6573)** at the existing `evaluateFeedItemGates(...)` call (line ~6602). Three additions belong in that gate:

1. **Generic-source-URL filter.** `isGenericSourceUrl(url)` returns true → reject with `reason='generic_source_url'`. Already exported from `app/lib/feedSourceQuality.ts` (mirrored in worker for parity).
2. **Hedge-language filter.** `hasHallucinationHedgeLanguage(consequence)` returns true → reject with `reason='hedge_language'`. Same module.
3. **Named-entity verification (Phase 12.12 #8).** When the title or consequence asserts a specific company name (e.g. `UAB X` / `Lietuvos energija` / `Ignitis`), cross-check the name against the Lithuanian commercial registry API before accepting. This is the hard problem; the registry API integration is Phase 12.12's core deliverable.

Filters #1 and #2 ship as helpers in this phase but are **not yet wired into the gate**. Wiring them in this phase would have rejected real items too (item #3 in current /feed has the same generic-VERT-URL pattern but content is plausible regulatory news — see Backlog below). Phase 12.12 wires them in conjunction with the registry check so generic-URL items can still enter when the named entity verifies.

## 5. Action taken

1. New worker endpoint `POST /feed/delete-by-id` (UPDATE_SECRET-gated) added at `workers/fetch-s1.js` near `POST /feed/purge-irrelevant`. Removes a single entry by id from `feed_index`. Returns the removed title for audit-trail preservation. Sister of `/feed/purge-irrelevant`: that one re-runs the gates as a sweep; this one targets a single id for one-off removal of items that pass every existing gate but are still wrong.
2. Two helper functions exported from `app/lib/feedSourceQuality.ts`:
   - `isGenericSourceUrl(url): boolean` — homepage-only URL detector
   - `hasHallucinationHedgeLanguage(text): boolean` — detects "if confirmed", "allegedly", "rumored to", etc.
3. Tests in `app/lib/__tests__/feedSourceQuality.test.ts` pin both heuristics with the Saulėtas Pasaulis as the canonical positive case.
4. Operator (or CC, if `UPDATE_SECRET` is in shell) fires `POST /feed/delete-by-id` with `{"id":"mna2ne4x-xfri25","reason":"hallucinated-entity-not-in-LT-commercial-registry"}` against the deployed worker. Verified by re-fetching `/feed` and confirming the entry no longer appears.

## 6. Backlog (carried into Phase 12.10 / 12.12)

- **Item #3 in /feed: VERT.lt with generic homepage URL** (`source: 'VERT.lt'`, `source_url: 'https://www.vert.lt/'`, title "Lithuanian balancing cost allocation shifts — producers cover 30%"). Same generic-URL marker as Saulėtas Pasaulis but the content claim (Jan 2026 Lithuanian producers bearing 30% of balancing costs) is plausible regulatory news. Operator decision: **keep**, not auto-purge — generic URL is a flag, not proof. Phase 12.10 (broader data discrepancy bundle) has scope to verify-or-remove unsourced regulatory claims; carry this into that phase.
- **Phase 12.12 #8 — commercial-registry API integration.** The hard structural fix. Must wire into `POST /feed/events`'s `evaluateFeedItemGates(...)` call. The two helpers shipped in this phase are the `import` side of that wire-up.
- **Phase 12.12 #11 — generic-URL filter at the gate.** Use `isGenericSourceUrl()` + a name-presence check (do not block all generic-URL items — some are legitimate aggregator-style "see full list at vert.lt" entries, but those don't make claims about specific named entities).

---

## 7. References

- Audit #5 (2026-05-03) — primary-source cross-check audit. See [audit-credibility taxonomy](../handover.md#session-28--2026-05-03--phase-12-8-0--tier-0-hot-fix-bundle-audit-investigated-materially-smaller-than-scoped-claude-code) in Session 28 entry for why this audit's findings are authoritative.
- [`docs/phases/_post-12-8-roadmap.md`](../phases/_post-12-8-roadmap.md) Phase 12.10.0 entry — original prompt context.
- Worker change: `workers/fetch-s1.js` `POST /feed/delete-by-id` (~50 lines).
- Helper change: `app/lib/feedSourceQuality.ts` `isGenericSourceUrl` + `hasHallucinationHedgeLanguage`.
