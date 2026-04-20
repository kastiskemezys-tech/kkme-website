# Phase 4B-5 — Feed Quality Gate + BESS Relevance Scoring + Homepage Cap

Self-contained Claude Code prompt. YOLO mode. Expected duration: 60–90 minutes. Stay on branch `phase-4b-intel-pipeline` (add commit on top of the existing 4).

**Problem:** The feed now has 50+ items but many are generic energy/government content with no BESS relevance. "Environmental Impact Assessment Report — Aplinkos ministerija" and "LSTA heating bulletins" dilute the signal. An investor landing on the page should see 8–10 high-quality Baltic BESS items, not 50 mixed-relevance rows.

**Goal:** Ship a feed that is relevant, recent, real, and quality — focused on Baltic BESS. Three changes:

1. **Worker: quality gate** — reject garbage at ingest time so it never enters `feed_index`
2. **Worker: BESS relevance scoring** — replace the flat `curationFeedScore(relevance)` with a signal-weighted score
3. **Frontend: homepage cap** — show top 8 items + "View all intelligence" expander

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh`
2. Read `docs/handover.md`
3. `git checkout phase-4b-intel-pipeline && git log --oneline -5`
4. Inspect current feed content: `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | jq '.items[:10] | .[] | {title, category, feed_score, source}'`
5. Read the current projection function: `workers/fetch-s1.js` lines 4508–4533 (`projectCurationToFeedItem`) and lines 4503–4506 (`curationFeedScore`)

Proceed — YOLO, no pause.

---

## Change 1: Quality gate in `projectCurationToFeedItem` (worker)

Current gate (line 4510): rejects items where title is empty, <15 chars, or starts with `http`. Too loose — lets through government HR announcements, heating bulletins, unrelated EU documents.

**Add a BESS/energy relevance gate.** After the existing title checks, add:

```js
// Relevance gate: title + raw_text must contain at least one energy/BESS signal
const blob = (title + ' ' + (entry.raw_text || '')).toLowerCase();
const BESS_SIGNALS = [
  'bess', 'battery', 'storage', 'flexibility', 'balancing',
  'afrr', 'mfrr', 'fcr', 'reserve', 'ancillary',
  'day-ahead', 'intraday', 'spread', 'arbitrage', 'dispatch',
  'mw', 'mwh', 'gwh', 'capacity', 'grid connection',
  'renewable', 'wind', 'solar', 'interconnect', 'cable',
  'electricity', 'power', 'energy market', 'price',
  'litgrid', 'ast.lv', 'elering', 'entsoe', 'entso-e',
  'nord pool', 'nordpool', 'baltic',
  'lithuania', 'latvia', 'estonia', 'vilnius', 'riga', 'tallinn',
  'vert', 'apva', 'sprk',
  'pipeline', 'cod ', 'commercial operation',
  'subsidy', 'support scheme', 'auction', 'tender',
  'derogation', 'transmission', 'distribution',
  'hydrogen', 'electrolyser', 'offshore wind',
  'carbon', 'ets', 'emission', 'co2',
  'ttf', 'gas price', 'lng',
];
const hasSignal = BESS_SIGNALS.some(s => blob.includes(s));
if (!hasSignal) return null;
```

This kills items about heating subsidies, nuclear decommissioning assessments, government HR, transport policy, etc. that have zero energy/BESS connection. The keyword list is deliberately broad — it's a gate, not a precision filter. Items about electricity markets, grid connections, or Baltic energy policy should pass even if not explicitly about batteries.

**Also reject items with stale content:**
```js
// Freshness gate: reject items older than 90 days at ingest
const pubMs = new Date(pubDate).getTime();
if (isNaN(pubMs) || pubMs < Date.now() - 90 * 86400000) return null;
```

**Also add a minimum content gate:**
```js
// Content depth gate: raw_text must have some substance
const rawText = (entry.raw_text || '').trim();
if (rawText.length < 50 && !entry.consequence) return null;
```

Items without meaningful body text AND without a consequence/editorial line are scrapes that passed the title check but have nothing to offer.

---

## Change 2: BESS relevance scoring (worker)

Replace `curationFeedScore(relevance)` with a signal-weighted scorer. The current function (line 4503) just maps the VPS relevance number (which is often NaN → defaults to 60) to a 0.5–0.9 range. Everything scores ~0.74.

New function — `computeBessRelevanceScore(entry)`:

```js
function computeBessRelevanceScore(entry) {
  const blob = ((entry.title || '') + ' ' + (entry.raw_text || '') + ' ' + (entry.consequence || '')).toLowerCase();
  let score = 0;

  // ── BESS core keywords (strongest signal) ──
  const BESS_CORE = ['bess', 'battery storage', 'battery energy', 'energy storage',
                     'flexibility market', 'balancing market', 'ancillary service',
                     'afrr', 'mfrr', 'fcr-d', 'fcr-n'];
  if (BESS_CORE.some(k => blob.includes(k))) score += 0.35;

  // ── Baltic specificity ──
  const BALTIC = ['lithuania', 'latvija', 'latvia', 'estonia', 'eesti',
                  'litgrid', 'ast.lv', 'elering', 'baltic',
                  'vilnius', 'riga', 'tallinn', 'kaunas', 'klaipeda'];
  if (BALTIC.some(k => blob.includes(k))) score += 0.20;

  // ── Quantified impact (MW, MWh, €) ──
  if (/\d+\s*(mw|mwh|gwh|€\/mwh|eur\/mwh)/i.test(blob)) score += 0.15;

  // ── Market/regulatory signal ──
  const MARKET = ['day-ahead', 'intraday', 'capacity market', 'reserve price',
                  'clearing price', 'activation', 'tender', 'auction',
                  'support scheme', 'subsidy', 'grid connection', 'derogation',
                  'tariff', 'network code', 'regulation'];
  if (MARKET.some(k => blob.includes(k))) score += 0.10;

  // ── Source quality bonus ──
  const sq = feedSourceQuality(entry.source, entry.url);
  if (sq === 'tso_regulator') score += 0.10;
  else if (sq === 'trade_press') score += 0.05;

  // ── Recency bonus ──
  const pubDate = new Date(entry.created_at || entry.published_at || Date.now());
  const daysOld = (Date.now() - pubDate.getTime()) / 86400000;
  if (daysOld < 7) score += 0.10;
  else if (daysOld < 30) score += 0.05;

  // Cap at 1.0
  return Math.min(1.0, score);
}
```

Then in `projectCurationToFeedItem`, replace:
```js
feed_score: curationFeedScore(entry.relevance),
```
with:
```js
feed_score: computeBessRelevanceScore(entry),
```

**Scoring examples (verify these mentally before coding):**
- "Litgrid: 484 MW storage installed nationally" → BESS_CORE(storage) +0.35, BALTIC(litgrid) +0.20, quantity(484 MW) +0.15, source(tso_regulator) +0.10 = **0.80** ← top of feed
- "E energija 65MW/130MWh BESS enters Lithuanian balancing market" → BESS_CORE(BESS, balancing market) +0.35, BALTIC(Lithuanian) +0.20, quantity(65MW) +0.15, MARKET(balancing) +0.10, recency varies = **0.80+**
- "Environmental Impact Assessment Report — Aplinkos ministerija" → fails BESS_SIGNALS gate → **rejected entirely**
- "LSTA heating season bulletin" → fails BESS_SIGNALS gate → **rejected**
- "NordBalt maintenance confirmed for Q2 2026" → no BESS_CORE +0, BALTIC(NordBalt contains "balt") +0.20, quantity(700MW if in text) +0.15, MARKET(no) +0, source(litgrid) +0.10, recency +0.05 = **0.50** ← mid-feed, fair ranking

**Also update the seeded event items** that enter via `/feed/events` POST. Currently their `feed_score` is passed in by the caller (or defaults to 0.5). Don't change that path — seeded items already have manually-assigned scores. Only curations use the new scorer.

---

## Change 3: Re-run backfill after scoring changes

After deploying the updated worker, the existing 54 items in `feed_index` still have the old flat scores. Re-run the backfill to re-project everything with the new gate + scoring:

1. First, clear existing curation-origin items from feed_index (keep event-origin items intact): `curl -X POST .../feed/clean-curations` — or add this as a small endpoint that filters `feed_index` to only items where `origin !== 'curation'`, then re-appends curations via backfill. Alternatively, just re-run `/feed/backfill-curations` if it already replaces (check — current implementation may append duplicates).

2. Check: does the current backfill endpoint dedup by URL/title? (Yes — line 5867 in the backfill handler calls `projectCurationToFeedItem` and the earlier backfill code likely deduplicates.) If so, you need to either:
   - Clear curation-origin items first, then re-backfill
   - Or modify the backfill to update-in-place (replace existing curation items with re-scored versions)

   Simplest: add a `POST /feed/rebuild-curations` endpoint that strips all `origin === 'curation'` items from `feed_index`, then re-backfills from KV curation entries. One-shot, idempotent.

3. After rebuild, verify: `curl -s .../feed | jq '[.items[] | {title: .title[:60], score: .feed_score, cat: .category}] | sort_by(-.score)[:10]'`

---

## Change 4: Homepage cap (frontend)

In `app/components/IntelFeed.tsx`, after the items are fetched, normalized, and scored:

- Show **featured item** (top scorer, current treatment — no change)
- Show **top 7 standard items** below it (total visible: 8 including featured)
- Below the 8th item, render a "View all N items →" button:
  - DM Mono, muted, uppercase, tracked — matches existing chip/filter aesthetic
  - On click: expands to show all remaining items (in current sort order)
  - Button text changes to "Show less ↑" when expanded
- Filter chips still work on the full list when expanded; on the collapsed 8-item view, filters apply but the cap stays at 8 visible

This replaces the current "show everything" approach. The collapsed state is what investors see on first load. They get the top 8 by BESS relevance score, not 50 rows of mixed quality.

---

## What NOT to do

- Don't change `/feed/events` POST scoring — seeded/manual items keep their scores
- Don't add Anthropic API calls (that's Option B, deferred)
- Don't change IntelFeed.tsx normalizer logic from Phase 3A — the frontend quality gate stays as defensive backup
- Don't change source classification in `app/lib/sourceClassify.ts`
- Don't remove the `SEED_ITEMS` array — it's the fallback when live fetch fails
- No raw hex/rgba in any new CSS
- No new npm packages

---

## Verification

### Worker
- `curl -s .../feed | jq '.total'` — should be lower than 54 (quality gate rejects non-energy items)
- `curl -s .../feed | jq '[.items[:10][] | {t: .title[:70], s: .feed_score}]'` — scores should vary (0.4–0.9 range, not flat 0.74), BESS-specific items at top
- `curl -s .../feed | jq '[.items[] | select(.title | test("heating|assessment|transport|HR"; "i"))] | length'` — should be 0 (quality gate killed them)
- `curl -s .../feed | jq '[.items[].category] | group_by(.) | map({c: .[0], n: length}) | sort_by(-.n)'` — category spread visible

### Frontend
- `npx tsc --noEmit` clean
- `npm run build` clean
- `npm run dev` → scroll to Market Intelligence:
  - Featured item should be a high-signal BESS item (e.g., Litgrid storage, E energija BESS, Ignitis 291MW)
  - 7 standard items visible below it (8 total)
  - "View all N items →" button visible
  - Click it → remaining items appear
  - Filter chips work in both collapsed and expanded state

### Sanity
- No items about heating, nuclear decommissioning, transport, or government HR survive the gate
- Every visible item has a clear BESS/energy/Baltic connection
- Top 3 items by score are items any Baltic BESS investor would want to see first

---

## Commit + push

Single commit on top of the existing 4 on `phase-4b-intel-pipeline`:
`phase4b-5: BESS quality gate, relevance scoring, homepage 8-item cap`

Push. Report compare URL. Don't run `gh pr create`.

End-of-session report: before/after item count, before/after top-5 titles+scores, examples of items rejected by the gate, "View all" button renders, any surprises.

---

## Reference

- Current projection: `workers/fetch-s1.js` lines 4508–4533 (`projectCurationToFeedItem`)
- Current scoring: lines 4503–4506 (`curationFeedScore`)
- Current feed handler: `/feed` GET around line 5774
- Backfill endpoint: `/feed/backfill-curations` around line 5854
- Frontend: `app/components/IntelFeed.tsx`
- Source classifier (frontend): `app/lib/sourceClassify.ts`
