# Phase 12.10.0 — Emergency hallucinated-entity purge (Saulėtas Pasaulis)

**Branch:** `phase-12-10-0-entity-purge` → `main`
**Commits:** 2 (worker fix + handover)
**Test count:** 882 → 893 (+11 in `feedSourceQuality.test.ts`)
**Source delta:** +154 lines across 3 modified + 1 new (worker / lib / test / investigation), plus the handover entry
**Worker deploy required.** Endpoint already deployed: version `043fd2cb-1146-4d96-95c2-0ecb2864f5d7`. **No `model_version` bump.**

---

## TL;DR

Audit #5 (2026-05-03) flagged "UAB Saulėtas Pasaulis (500 MW)" pipeline-exit entry on production `/feed` as fabricated:

- No company by that name in the Lithuanian commercial registry.
- A 500 MW Baltic storage-pipeline exit would have made trade press if real — none did.
- Generic source URL (`https://www.litgrid.eu/`, no path).
- Hedge language in the consequence ("If confirmed, eases competition pressure on remaining projects").

Phase 4F's gates can't catch it — passes source-tier (litgrid is tier1, auto-passes topic threshold), title-length, and URL-shape checks. Only structural named-entity verification (Phase 12.12) or human cross-check would.

This PR ships the immediate purge mechanism + investigation + the helper functions Phase 12.12 will wire structurally.

---

## What ships

### Commit 1 — worker fix + helpers + investigation

- **`workers/fetch-s1.js` `POST /feed/delete-by-id`** (~50 lines, UPDATE_SECRET-gated, inserted between `/feed/purge-irrelevant` and `/feed/rejections`). Sister of `/feed/purge-irrelevant`: that one re-runs the gates as a sweep; this one targets a single id for one-off removal of items that pass every existing gate but are still wrong (e.g. hallucinated entities a human verifier identifies). Returns the removed title for audit-trail preservation.

- **`app/lib/feedSourceQuality.ts`** — two helpers exported for Phase 12.12 to wire into `evaluateFeedItemGates()`:
  - `isGenericSourceUrl(url): boolean` — homepage-only URL detector (the Litgrid generic-URL marker).
  - `hasHallucinationHedgeLanguage(text): boolean` — detects `if confirmed`, `if accurate`, `pending verification`, `unconfirmed report`, `rumored to`, `allegedly`.

- **`app/lib/__tests__/feedSourceQuality.test.ts`** — 11 new test cases under `describe('hallucination markers (Phase 12.10.0)')`. Uses Saulėtas Pasaulis as canonical positive; the real Litgrid press release URL as canonical negative.

- **`docs/investigations/phase-12-10-0-saiuletas-pasaulis.md`** — investigation: entry capture, three hallucination markers, ingestion-path trace + conclusion, Phase 12.12 wiring guidance, Item #3 backlog carry-over.

**Helpers are not yet wired into the gate.** Wiring at write-time would have rejected the legitimate VERT.lt item #3 too (same generic-URL marker, but content claim is plausible regulatory news). Phase 12.12 wires them in conjunction with the commercial-registry check so generic-URL items can still enter when the named entity verifies.

### Commit 2 — handover Session 29

`docs/handover.md` Session 29 entry + last-updated header. Documents the ingestion-path trace, the Phase 12.12 wire-up target, the VERT.lt item #3 backlog carry-over, and the roadmap-delta operator should apply Cowork-side after merge.

---

## Ingestion-path finding (load-bearing for Phase 12.12 scoping)

| Field | Saulėtas Pasaulis | Indicates |
|---|---|---|
| id | `mna2ne4x-xfri25` | Matches `makeId()` format `{base36-Date.now()}-{6 random}` (worker line 4977). **No `cur_` prefix** → not from `appendCurationToFeedIndex`. |
| Field shape | `event_type`, `source_quality`, `confidence`, `horizon`, `impact_direction`, `affected_modules`, `affected_cod_windows` all present | Exact schema written by `POST /feed/events` (worker line 6603). Curation projection produces `origin: 'curation'` + `source_tier` + `topic_score` instead. |
| `git log -S "Saulėtas Pasaulis"` | Only doc commits | **No code path in repo creates the entity** — no script, no LLM curation prompt, no operator-curated JSON. |

**Conclusion:** entry was hand-pushed via `curl POST /feed/events` from operator's terminal with externally-LLM-drafted content. Phase 12.12 #8's structural named-entity verification gate must therefore wire into `POST /feed/events` at the existing `evaluateFeedItemGates(...)` call (worker `~6602`), not into `POST /curate` / `appendCurationToFeedIndex`.

---

## Verification gates (all green)

```
npx tsc --noEmit                  → 0 errors
node --check workers/fetch-s1.js  → 0 errors
npm run lint                      → 40 errors / 129 warnings (identical to main baseline)
npx vitest run                    → 893 / 893 passed (882 → 893, +11)
npm run build                     → compiled in 3.4s, 8 static pages
wrangler deploy                   → version 043fd2cb-1146-4d96-95c2-0ecb2864f5d7 live
endpoint smoke                    → POST /feed/delete-by-id returns 401 (gate behavior correct)
```

---

## Operator-fire instructions

Endpoint is deployed and waiting. UPDATE_SECRET was not in the CC session's shell; operator fires the delete call when ready (acceptable to fire either before or after merge — endpoint is additive and live):

```bash
# Option A — pull from local .env file
export UPDATE_SECRET=$(grep -h '^UPDATE_SECRET' ~/kkme/.env* workers/.env* 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
# Option B — macOS Keychain
# export UPDATE_SECRET=$(security find-generic-password -a UPDATE_SECRET -w)

curl -s -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed/delete-by-id \
  -H "Content-Type: application/json" \
  -H "x-update-secret: ${UPDATE_SECRET}" \
  -d '{"id":"mna2ne4x-xfri25","reason":"hallucinated-entity-not-in-LT-commercial-registry"}' \
  | python3 -m json.tool
```

Expected response:
```json
{
  "ok": true,
  "removed_count": 1,
  "removed_titles": ["Pipeline exit: UAB \"Saulėtas Pasaulis\" (500 MW) (LT)"],
  "before": 9,
  "after": 8,
  "reason": "hallucinated-entity-not-in-LT-commercial-registry"
}
```

Verification:
```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | python3 -c "
import json, sys
d = json.load(sys.stdin)
items = d.get('items', [])
hits = [i for i in items if 'Saulėtas Pasaulis' in (i.get('title','') or '')]
print(f'Total: {len(items)}  Saulėtas Pasaulis hits: {len(hits)}')
print('SUCCESSFULLY REMOVED' if not hits else 'STILL PRESENT — purge failed')
"
```

---

## Out of scope

- Wiring `isGenericSourceUrl` / `hasHallucinationHedgeLanguage` into `evaluateFeedItemGates()` at write-time. Phase 12.12 #8 wires them alongside the commercial-registry check.
- VERT.lt item #3 (generic homepage URL, plausible content). Operator decision: keep, carry into Phase 12.10's audit #5 unverifiable-claims category.
- Frontend changes. Next `/feed` GET after the delete call returns the cleaned data; `IntelFeed.tsx` renders it transparently.
- Roadmap edits to `docs/phases/_post-12-8-roadmap.md` (per Session 28 backlog #2 default rule). Operator applies the delta documented in the Session 29 handover entry Cowork-side after merge.
- `model_version` bump.

---

## Rollback

If the deploy bricks `/feed` reads (very unlikely — endpoint is additive):
```bash
cd workers && npx wrangler rollback <prior-version-id>
```

If the operator fires the delete call against the wrong id, the removed entry's full record is captured in the response payload and can be re-inserted via `POST /feed/events`.
