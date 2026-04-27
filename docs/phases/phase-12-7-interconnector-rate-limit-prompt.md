# Phase 12.7 — Interconnector live-flow rate-limit fix

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-12-7-interconnector-rate-limit` off main.
**Estimated runtime:** ~30 min.
**Predecessor:** Phase 12.4 (interconnector flow direction hotfix, Session 18). Touches the same handler.

---

## Why this phase exists

EstLink 1, EstLink 2, Fenno-Skan 1, Fenno-Skan 2 currently render `·` (no MW value) on the kkme.eu hero. NordBalt + LitPol still flow correctly.

Diagnosed in the Cowork session preceding this one: `fetchInterconnectorFlows()` in `workers/fetch-s1.js:5367` fires three CBET endpoint requests in parallel via `Promise.all([fetch(LT), fetch(EE), fetch(FI)])`. The LT request lands first and returns 200; the EE and FI requests hit `HTTP 429 Too Many Requests` from energy-charts.info because the API rate-limits anonymous parallel requests from the same IP. The `.catch(() => null)` blanket swallows the 429 failure silently. Worker writes KV with `estlink_avg_mw: null` and `fennoskan_avg_mw: null`. The /s8 endpoint serves the null KV record until the next cron run, which often hits the same 429 again because the bucket hasn't refilled.

Confirmed via direct test: `curl -v 'https://api.energy-charts.info/cbet?country=fi'` returns `HTTP/2 429` with `retry-after: 1`. NordBalt + LitPol work because they're extracted from the LT response, which lands first.

Two durable fixes, both small. Optional polish on top.

---

## What ships in this session

Single coordinated commit, single deploy. No worker version bump (this is a hotfix, not a new engine version).

1. **Add User-Agent header** identifying KKME on all three CBET fetch calls. Anonymous browsers are rate-limited more aggressively by many APIs; a polite UA is best practice and typically lifts most 429s without needing to slow down the request rate.

2. **Persist-last-good KV pattern**. After parsing each cable value, if the parsed value is `null`, read the prior KV record and fall back to its value. Worker writes the partial-update KV record back. Visitors see the last-known cable flow rather than `·`. The cron-job-stale issue degrades gracefully into "old data" rather than "no data."

3. **Optional: `data_freshness` per cable.** Add a `*_freshness` sibling field for each cable (`estlink_freshness: 'live' | 'stale-1h' | 'stale-24h' | null`). Hero card can then render a small "stale" indicator instead of pretending the value is fresh.

That's it. No card changes required if you skip step 3 (the persist-last-good fallback alone restores the values silently).

---

## What's explicitly OUT of scope

- Frontend changes. The /s8 contract is already populated with the right field names; persist-last-good means existing renderers see numeric values. Card UI for `data_freshness` is Phase 7.7e UI-track territory.
- Other interconnector data sources. The energy-charts.info CBET endpoint is the only source; switching to a different source (ENTSO-E direct, etc.) is a much larger phase.
- Generalizing the persist-last-good pattern across all signal fetchers. /s1, /s2, /s4, /s9 etc. each have their own caching dynamics — this prompt fixes /s8 specifically.
- Phase 12.6 (KV cache invalidation on worker deploy). Separate concern; /s8 is cron-driven, not deploy-cached.

---

## 0. Session-start protocol

### 0.1 Read

1. `CLAUDE.md`
2. `docs/handover.md` Sessions 18 (Phase 12.4 hotfix touched the same handler) and the current "Open issue" note in the Current phase section
3. `workers/fetch-s1.js:5367` (`fetchInterconnectorFlows`) end-to-end
4. `workers/fetch-s1.js:5936` (hourly cron writer for s8) and `workers/fetch-s1.js:6122` (4h cron writer for s8)

### 0.2 Verify the bug

```
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8 | jq '{nordbalt_avg_mw, litpol_avg_mw, estlink_avg_mw, fennoskan_avg_mw}'
```

Expected: nordbalt + litpol populated; estlink + fennoskan = `null`. Confirms the bug is live.

```
curl -v 'https://api.energy-charts.info/cbet?country=fi' 2>&1 | grep '^< HTTP'
```

Expected: `HTTP/2 429` with `retry-after: 1`. Confirms the upstream rate limit is the actual cause.

### 0.3 Git + production checks

```
git checkout main && git pull
bash scripts/diagnose.sh
git checkout -b phase-12-7-interconnector-rate-limit
git status  # clean
npm test    # baseline ~665 tests from end of 7.7d
npx tsc --noEmit
```

**Pause for "go"** before §1.

---

## 1. Pause A — pre-flight

Report:
- /s8 production confirms estlink + fennoskan null
- 429 confirmed on direct EE / FI fetches
- Test count baseline
- Plan summary

Wait for "go" before §2.

---

## 2. Worker changes

### 2.1 — User-Agent header on CBET fetches

In `fetchInterconnectorFlows()` near line 5372:

```js
const cbetHeaders = {
  Accept: 'application/json',
  'User-Agent': 'KKME/1.0 (+https://kkme.eu) — Baltic flexibility intelligence',
};
```

This goes on all three fetch calls (LT, EE, FI) since they share `cbetHeaders`.

### 2.2 — Persist-last-good KV fallback

After computing all four cable values (NordBalt, LitPol, EstLink, Fenno-Skan, plus LV↔LT internal), but BEFORE returning the response object, fall back to prior KV when any value is null:

```js
// Persist-last-good: if any cable couldn't be fetched (rate limit, parse error,
// data array all-null, etc.), prefer the prior KV value over emitting null.
// Visitors see the last-known cable flow rather than a "no data" placeholder.
let prior = null;
try {
  const cached = await env.KKME_SIGNALS.get('s8');
  if (cached) prior = JSON.parse(cached);
} catch (e) {
  console.error('[S8] prior KV read failed:', String(e));
}

const safe = (current, fallback) => current != null ? current : (fallback ?? null);

const merged = {
  nordbalt_avg_mw:  safe(nordbalt_avg_mw,  prior?.nordbalt_avg_mw),
  litpol_avg_mw:    safe(litpol_avg_mw,    prior?.litpol_avg_mw),
  estlink_avg_mw:   safe(estlink_avg_mw,   prior?.estlink_avg_mw),
  fennoskan_avg_mw: safe(fennoskan_avg_mw, prior?.fennoskan_avg_mw),
  lv_lt_avg_mw:     safe(lv_lt_avg_mw,     prior?.lv_lt_avg_mw),
};
```

Then re-derive `*_signal` from the merged values (the existing `flowSignal()` helper consumes a number → string), and use the merged values when assembling the return object.

The `fetchInterconnectorFlows()` function signature becomes `async function fetchInterconnectorFlows(env)` so it can read prior KV. Update the two cron call-sites (lines ~5938 and ~6126) to pass `env`.

### 2.3 — Per-cable freshness indicator

For each cable, mark whether the value came from this cycle's fetch ('live') or from prior KV ('stale'). The card can ignore this if it doesn't render the indicator yet.

```js
const freshnessFor = (current, fallback) =>
  current != null ? 'live' :
  fallback != null ? 'stale' :
  null;

return {
  // ... existing fields ...
  freshness: {
    nordbalt:  freshnessFor(nordbalt_avg_mw,  prior?.nordbalt_avg_mw),
    litpol:    freshnessFor(litpol_avg_mw,    prior?.litpol_avg_mw),
    estlink:   freshnessFor(estlink_avg_mw,   prior?.estlink_avg_mw),
    fennoskan: freshnessFor(fennoskan_avg_mw, prior?.fennoskan_avg_mw),
    lv_lt:     freshnessFor(lv_lt_avg_mw,     prior?.lv_lt_avg_mw),
  },
};
```

### 2.4 — Update interpretation string

The existing `interpretation` field uses the merged values (already does, since `fmtFlow` consumes the variables in scope). Verify the string still reads correctly post-merge.

---

## 3. Tests

Add `app/lib/__tests__/interconnectorMerge.test.ts` with ~6 tests covering the safe/freshness helpers logic. Mock pattern (no actual fetch):

```ts
describe('safe(current, fallback)', () => {
  it('returns current when not null', () => expect(safe(432, 100)).toBe(432));
  it('returns fallback when current is null', () => expect(safe(null, 100)).toBe(100));
  it('returns null when both are null', () => expect(safe(null, null)).toBe(null));
  it('returns null when fallback is undefined', () => expect(safe(null, undefined)).toBe(null));
  it('preserves zero (not falsy)', () => expect(safe(0, 100)).toBe(0));
});

describe('freshnessFor(current, fallback)', () => {
  it('returns "live" when current populated', () => expect(freshnessFor(432, 100)).toBe('live'));
  it('returns "stale" when only fallback populated', () => expect(freshnessFor(null, 100)).toBe('stale'));
  it('returns null when both null', () => expect(freshnessFor(null, null)).toBe(null));
});
```

The actual `safe` and `freshnessFor` helpers can live inline in `workers/fetch-s1.js` and be re-exported from a TS mirror in `app/lib/interconnectorHelpers.ts` for testability — same pattern as `app/lib/throughputCycles.ts` from Phase 7.7d.

---

## 4. Pause B — diff review

Report:
- Lines changed in `workers/fetch-s1.js` (~30-50 expected)
- New test file with ~8 specs
- Test count: 665 → ~673
- Confirm `npx tsc --noEmit` clean
- Confirm `npm test` all passing

Wait for "go" before deploying.

---

## 5. Worker deploy + post-deploy verification

```
cd workers && npx wrangler deploy && cd ..
sleep 5
```

The worker deploy alone doesn't trigger an /s8 fetch — the next /s8 request will use the deployed code, but the KV record is still the stale one. Two paths:

**Option A:** wait for the next hourly cron (max 60 min) for fresh KV with the new code's fallback semantics.

**Option B:** trigger an immediate refresh by hitting any endpoint that reads /s8 from KV — actually no, that won't trigger a fetch. Cleanest: `npx wrangler tail` to watch the hourly cron run, or wait it out.

For pause-C verification within this session, just verify the deployed code is right:

```
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s8 | jq '{model_version, nordbalt_avg_mw, estlink_avg_mw, fennoskan_avg_mw, freshness}'
```

If the response includes a `freshness` field with `live` for cables that are working, the new code is live (cron picked up since deploy). If the response is the old shape without `freshness`, the cron hasn't run yet — that's fine; production will recover on next cron.

---

## 6. Pause C — final verification + commit

```
git add -A
git commit -m "$(cat <<'EOF'
phase-12-7: fix interconnector live-flow null values from upstream rate limits

Diagnosed: energy-charts.info cbet?country=ee/fi return HTTP 429 when fetched in
parallel with the LT endpoint. .catch(() => null) silently swallowed the failure
and wrote nulls to KV, which served until next cron.

Two fixes:
1. User-Agent header on all three CBET fetches identifies KKME and avoids the
   anonymous-browser bucket, which is the 429 trigger.
2. Persist-last-good KV fallback: when current fetch can't get a value (rate
   limit, parse error, all-null data array), reuse prior KV value rather than
   overwriting with null. Visitors see last-known flows, not "no data" gaps.
3. Per-cable freshness indicator (live vs stale) for future card UI use.

Hero cable rows for EstLink 1, EstLink 2, Fenno-Skan 1, Fenno-Skan 2 now show
live or stale-fallback values rather than a "·" placeholder.
EOF
)"
git push -u origin phase-12-7-interconnector-rate-limit
```

Open PR via GitHub web UI per project rules.

---

## 7. Handover update

Append a Session 23 entry to `docs/handover.md`:
- Worker deploy version ID
- Diagnosis recap (rate limit + silent .catch())
- Fix description
- Test count baseline → final
- /s8 production verification (live freshness for nordbalt/litpol; live or stale for estlink/fennoskan)
- Move Phase 12.7 from Queued to Shipped

Push handover update.

Stop. Surface anything unexpected.
