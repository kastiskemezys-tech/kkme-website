# Phase 7 — S1 & S2 Card Rebuild (Bloomberg density)

**Status**: Ready to run in Claude Code (YOLO).
**Branch base**: `main` (NOTE: working tree is currently on `phase-6a-s2-auto-tampere` — see Branch prep below).
**Target branch**: `phase-7-s1-s2-cards`.
**Verified against production**: 2026-04-21 (live curl confirmed).
**Prompt author**: revised by Cowork 2026-04-21 after finding multiple factual drifts in v1.

---

## 0. Read first

Do all of these before writing any code. No shortcuts.

1. `docs/handover.md` — canonical state, backlog, last session.
2. `docs/playbooks/session-start.md` — diagnostic curl loop.
3. `docs/playbooks/verification.md` — non-negotiable verification order.
4. `docs/playbooks/pause-points.md` — when to stop and report.
5. `CLAUDE.md` — token + card-anatomy rules ("Rules that apply to every session").
6. `docs/map.md` — concept → file lookup (note: line counts in map.md are stale — trust code).
7. `app/lib/chartTheme.ts` — the `useChartColors()` hook. Canvas 2D cannot resolve CSS vars. Always resolve via this hook.
8. This file, end to end.

---

## 1. Goal

Rebuild the S1 (arbitrage/day-ahead) and S2 (balancing) cards into a dense, Bloomberg-terminal-style investor surface that:

- Leads with one hero number + status + one interpretation sentence.
- Exposes the existing rich rolling stats and monthly aggregates (already computed in the worker — the cards just don't show them).
- Uses the shared card anatomy (header → hero → status → interpretation → viz → impact → source → drawer).
- Fixes two real data-pipeline bugs so `/s1/history` and `/s1/capture` expose top-level `gross_2h`/`gross_4h` correctly.
- Ships a reusable `AnimatedNumber` primitive so numeric changes feel alive without JS-only animations in Canvas.

Investor-first audience. Terse, numbers-first, one interpretation line per card.

---

## 2. Branch prep (run first, do not skip)

Working tree is currently on `phase-6a-s2-auto-tampere` with untracked files (including this prompt and `.claude/skills/`). Get to a clean `main` before branching.

```bash
git status --short                            # inspect
git stash push -m "phase7-prep untracked" -u  # -u includes untracked so you don't lose them
git checkout main
git pull --ff-only
git checkout -b phase-7-s1-s2-cards
git stash pop                                 # restore untracked onto the new branch
```

If `git stash pop` re-surfaces `docs/phases/phase7-s1-s2-rebuild-prompt.md` as untracked, commit it before starting code work:

```bash
git add docs/phases/phase7-s1-s2-rebuild-prompt.md
git commit -m "docs(phases): add revised phase 7 prompt"
```

---

## 3. Ground truth — production state as of 2026-04-21

Verified via live curl before writing this prompt. Do NOT trust older docs over the actual worker response.

### `/s1/capture` — populated and healthy; shape below

```json
{
  "date": "2026-04-21",
  "capture_2h": { "gross_eur_mwh": 141.35, "net_eur_mwh": 140.61, "avg_charge": 5.17, "avg_discharge": 146.51, "rte": 0.875, "n_intervals": 8 },
  "capture_4h": { "gross_eur_mwh": 128.33, "net_eur_mwh": 127.48, "avg_charge": 5.70, "avg_discharge": 134.02, "rte": 0.87,  "n_intervals": 16 },
  "shape": { "peak_hour": 17, "trough_hour": 13, "peak_price": 134.15, "trough_price": 5.48, "daily_avg": 67.67, "swing": 152.81, "solar_trough_depth": -59.63, "evening_premium": 87.43, "hourly_profile": [ ... 22 numbers ... ] },
  "rolling_30d": {
    "stats_2h": { "mean": 127.89, "p25": 81.33, "p50": 136.67, "p75": 170.11, "p90": 202.78, "days": 30 },
    "stats_4h": { "mean": 113.71, "p25": 71.63, "p50": 124.80, "p75": 143.21, "p90": 176.36, "days": 30 }
  },
  "monthly": [ { "month": "2025-04", "avg_gross_2h": 172.23, "avg_gross_4h": 145.96, "avg_net_2h": 170.80, "avg_net_4h": 143.91, "days": 30 }, ... 13 months ... ],
  "gross_to_net": [ ... bridge lines ... ],
  "history": [ { "date": "...", "gross_2h": 123.4, "gross_4h": 110.1, "net_2h": 120.2, "net_4h": 108.5, "swing": 140.0 }, ... × 30 ],
  "source": "energy-charts.info (Fraunhofer ISE)",
  "data_class": "derived",
  "resolution": "60min",
  "updated_at": "..."
}
```

**What v1 of this prompt got wrong**: claimed rolling stats were null and asked to add new fields named `{avg, p5, p95, n}`. Reality: the rolling stats are fully populated and use fields `{mean, p25, p50, p75, p90, days}`. Do NOT add new fields — bind the card to what already exists.

### `/s1/history` — 90 days; bugged on capture fields

```json
{
  "history": [
    { "date": "2026-04-03", "spread_eur": -3.31, "spread_pct": -8.5, "lt_swing":  91.27, "gross_2h": null, "gross_4h": null },
    ...
    { "date": "2026-04-21", "spread_eur": -6.08, "spread_pct": -8.0, "lt_swing": 152.81, "gross_2h": null, "gross_4h": null }
  ]
}
```

Only `gross_2h`/`gross_4h` are null. `spread_eur`, `spread_pct`, `lt_swing` are all populated. This is the **Bug 1** fix target in Part A.

### `/s2` — healthy; no worker-side rebuild needed

Top-level keys (verified live):

```
timestamp, fcr_avg, afrr_up_avg, afrr_down_avg, mfrr_up_avg, mfrr_down_avg,
pct_up, pct_down, imbalance_mean, imbalance_p90, pct_above_100,
afrr_annual_per_mw_installed, mfrr_annual_per_mw_installed,
cvi_afrr_eur_mw_yr, cvi_mfrr_eur_mw_yr,
stress_index_p90, source, _meta,
demand_mw, afrr_demand_mw, mfrr_demand_mw, fcr_demand_mw,
activation,        // per-country object { lt, lv, ee }, each { afrr_p50, afrr_rate, mfrr_p50, mfrr_rate }
capacity_monthly,  // monthly auction clearing
rolling_180d       // { computed_at, period, products }
```

The `activation` shape is per-country **objects**, not a `countries[]` array. v1 of this prompt got this wrong too.

### `/s2/history` — 35 entries, healthy

```json
{ "afrr_up": 2.6, "mfrr_up": 10.1, "fcr": 0.37, "date": "2026-04-20" }
```

All fields populated in the newest entry. v1 claimed these were null — they are not.

### Cadence (do not change)

- S1 → `REFRESH_HOT` (5 min) in `lib/refresh-cadence.ts`
- S2 → `REFRESH_WARM` (15 min)
- S4 → `REFRESH_COOL` (60 min)

---

## 4. Part A — Data pipeline fixes (worker only)

Two real bugs. Both in `workers/fetch-s1.js` (8029 lines — **never cat the whole file**; grep or read ranges).

### Bug 1 — `/s1/history` null `gross_2h`/`gross_4h`

Location: `workers/fetch-s1.js:3040-3041` inside `updateHistory()`.

Current code:

```js
// workers/fetch-s1.js:3034-3042
history.push({
  date:       todayEntry.updated_at.split('T')[0],
  spread_eur: todayEntry.spread_eur_mwh,
  spread_pct: todayEntry.separation_pct,
  lt_swing:   todayEntry.lt_daily_swing_eur_mwh,
  // Capture fields — populated after computeCapture() merges into todayEntry
  gross_2h:   todayEntry.capture?.gross_2h ?? null,
  gross_4h:   todayEntry.capture?.gross_4h ?? null,
});
```

Root cause: the `captureData` object returned by `computeCapture()` (line 2860) does not contain top-level `gross_2h`/`gross_4h` fields. Those values live at `captureData.capture_2h.gross_eur_mwh` and `captureData.capture_4h.gross_eur_mwh`. The cron scheduler merges `capture` into `todayEntry` around lines 5572–5577 with `todayEntry.capture.gross_2h = cap.capture_2h?.gross_eur_mwh` — but `updateHistory` runs earlier in the same cron pass, before that merge. So at the point `updateHistory` reads, `todayEntry.capture` is the raw `captureData` without flat fields.

**Fix**: flatten the read inside `updateHistory` so it works regardless of merge order.

```js
// workers/fetch-s1.js:3040-3041 — REPLACE
gross_2h:   todayEntry.capture?.gross_2h ?? todayEntry.capture?.capture_2h?.gross_eur_mwh ?? null,
gross_4h:   todayEntry.capture?.gross_4h ?? todayEntry.capture?.capture_4h?.gross_eur_mwh ?? null,
```

Backfill the 90 days already in KV. The source of truth for historical gross capture is `s1_capture_history` (700+ days in KV, per-day `{date, gross_2h, gross_4h, ...}`). Write `scripts/backfill-s1-history-gross.js`:

- Read `s1_capture_history`.
- Read `s1_history` (90 days).
- Merge by `date`, populate `gross_2h`/`gross_4h` on `s1_history[i]`.
- Put back.
- Gate behind the worker's existing admin-auth pattern. Grep `workers/fetch-s1.js` for `admin` / `X-Admin-Key` / `ADMIN_KEY` to find the existing middleware and reuse it.

### Bug 2 — `/s1/capture` top-level `gross_2h`/`gross_4h` missing

Location: `workers/fetch-s1.js:2860-2873` inside `computeCapture()`.

Current `captureData` object:

```js
// workers/fetch-s1.js:2860
const captureData = {
  date: today,
  capture_2h,
  capture_4h,
  shape,
  rolling_30d: { stats_2h, stats_4h },
  monthly,
  gross_to_net: grossToNet,
  history: history.slice(-30),
  source: 'energy-charts.info (Fraunhofer ISE)',
  data_class: 'derived',
  resolution: `${resolution}min`,
  updated_at: new Date().toISOString(),
};
```

The `/s1/capture` handler returns this raw. The `/read` handler at line 7993–7994 post-resolves `gross_2h = cap.capture_2h?.gross_eur_mwh`. Meaning the frontend currently has to go through `/read` to get flat gross numbers — but the S1 card fetches `/s1/capture` directly. Result: the card has to navigate nested objects needlessly.

**Fix**: add flat top-level fields to `captureData` at line 2860. Keep nested objects (existing consumers in `/read`, `lib/signals/s1.ts`, and `computeS1` still depend on them).

```js
// workers/fetch-s1.js:2860 — REPLACE
const captureData = {
  date: today,
  // Flat top-level for convenience (matches /read merged shape)
  gross_2h: capture_2h?.gross_eur_mwh ?? null,
  gross_4h: capture_4h?.gross_eur_mwh ?? null,
  net_2h:   capture_2h?.net_eur_mwh   ?? null,
  net_4h:   capture_4h?.net_eur_mwh   ?? null,
  // Nested originals (unchanged)
  capture_2h,
  capture_4h,
  shape,
  rolling_30d: { stats_2h, stats_4h },
  monthly,
  gross_to_net: grossToNet,
  history: history.slice(-30),
  source: 'energy-charts.info (Fraunhofer ISE)',
  data_class: 'derived',
  resolution: `${resolution}min`,
  updated_at: new Date().toISOString(),
};
```

Secondary effect: `updateHistory` now finds `todayEntry.capture?.gross_2h` on first read regardless of merge timing. Bug 1's fix stays belt-and-braces.

### Worker deploy

```bash
cd workers
npx wrangler deploy
# confirm success; note the deployed version tag in the commit message
```

### Pause point 1 — after worker deploy, before any frontend work

Report to the user:

1. `git diff workers/fetch-s1.js` — should be ~3 small hunks only.
2. Wrangler deploy output.
3. Live curl:
   - `curl -s .../s1/capture | jq '.gross_2h, .gross_4h'` → numbers, not null.
   - After next cron (≤5 min) or manual admin trigger: `curl -s .../s1/history | jq '.history[-1]'` → newest row has numeric `gross_2h`.
4. If backfill ran: count of history rows patched.

Wait for explicit **proceed** before starting Part B.

---

## 5. Part B — S1 Card rebuild

Target: `app/components/S1Card.tsx` (currently 887 lines). Tighter, denser, single hero number, more rolling context.

### What the card must show (Bloomberg density, top to bottom)

1. **Header** — "S1 · DA Arbitrage · Lithuania" + `FreshnessBadge` (uses `updated_at` from `/s1/capture`) + duration toggle `2h / 4h` (default 2h).
2. **Hero metric** — today's gross capture: `€141.35/MWh` (from `/s1/capture` → `gross_2h` or `gross_4h` depending on toggle). Big. Unbounded font. Wrap in the new `AnimatedNumber` (Part D).
3. **Status chip** — one of `OPEN / TIGHTENING / COMPRESSED`. Thresholds from `rolling_30d.stats_{2h|4h}`:
   - `hero >= stats.p75` → OPEN (teal)
   - `stats.p25 <= hero < stats.p75` → TIGHTENING (amber)
   - `hero < stats.p25` → COMPRESSED (rose)
4. **Interpretation line** — one Cormorant Garamond italic sentence. Template:
   `"Today's gross capture is €{hero}, sitting {p-bucket} of the rolling 30-day distribution. {OPEN|TIGHTENING|COMPRESSED}."`
   p-bucket = `below p25 / p25–p50 / p50–p75 / p75–p90 / above p90`. Hero number stays DM Mono; only the connective tissue is Cormorant.
5. **Rolling context strip** — horizontal row of small `MetricTile`s: `mean / p25 / p50 / p75 / p90` from `rolling_30d.stats_{duration}`. Small type. Format with `euroTick`. Pin today's value as an inline bullet marker on the same axis below the tiles.
6. **Viz — 30-day sparkline**:
   - x: last 30 days from `capture.history` (already trimmed in worker).
   - y: `gross_{duration}`.
   - Chart.js line chart using `useChartColors()` + `buildScales()` + `useTooltipStyle()` from `app/lib/chartTheme.ts`.
   - Fill below line: `colors.fillTeal`.
   - Overlay p50 as a horizontal reference line (annotation plugin if already installed; otherwise a second dataset with constant y).
   - **Never pass raw CSS var strings into Chart.js** — the hook resolves them.
7. **Monthly strip (drawer only)** — bar chart from `capture.monthly` (12+ months of `avg_gross_{duration}`). Put in `DetailsDrawer`, not main card, to keep above-the-fold dense.
8. **Impact line** — one sentence, Unbounded numbers, Cormorant connective tissue:
   `"At a 100 MW / 2h plant, today's gross capture implies €{hero × 200}/day of arbitrage optionality."`
   Multiplier: `hero × 2 × installedMW`. Round to nearest €100.
9. **Source footer** — `SourceFooter` primitive. Source: `energy-charts.info (Fraunhofer ISE)`. Class: `derived` via `DataClassBadge`. Updated timestamp.
10. **Details drawer**:
    - Monthly bar chart (see 7).
    - `gross_to_net` bridge chart (waterfall; read `capture.gross_to_net[]`).
    - Extreme-event ticker (read `/read` → `extreme:latest`, optional; only if present).
    - Duration toggle shared with hero (state lifted to card root).

### Do NOT

- Add new fields to the worker API from the card side.
- Change the `rolling_30d` shape. Use `mean / p25 / p50 / p75 / p90 / days`.
- Use raw `rgba()` or hex. Every color goes through tokens via `useChartColors()` (for Canvas) or CSS vars (for JSX).
- Inline Chart.js options. Use `buildScales()`, `useTooltipStyle()`, and `CHART_FONT`.
- Let the card exceed ~550 lines. Above 600, split the drawer into `S1CardDrawer.tsx`.

### Refresh

`useSignal(${WORKER_URL}/s1/capture, REFRESH_HOT)`. Drop the `/read` call unless you need extreme events.

---

## 6. Part C — S2 Card rebuild

Target: `app/components/S2Card.tsx` (currently 1449 lines). Halve the line count by leveraging existing `/s2` fields and the same primitives.

### What the card must show

1. **Header** — "S2 · Balancing · LT/LV/EE" + `FreshnessBadge` from `timestamp` + product toggle `aFRR / mFRR / FCR` (default aFRR).
2. **Hero metric** — today's clearing for the selected product: `afrr_up_avg` / `mfrr_up_avg` / `fcr_avg` from `/s2`. Wrap in `AnimatedNumber`.
3. **Status chip** — thresholds from `rolling_180d.products[<selected>]` (p50 and p90 inside). Fall back to `STABLE` if rolling not yet populated.
4. **Interpretation line** — one Cormorant sentence using `imbalance_mean`, `imbalance_p90`, and `pct_above_100` to describe LT grid stress.
5. **Rolling context strip** — `MetricTile`s for the selected product from `rolling_180d.products[<selected>]`.
6. **Viz — 35-day line** — read `/s2/history`, plot `afrr_up / mfrr_up / fcr` depending on toggle. `useChartColors()`, `buildScales()`.
7. **Activation strip (drawer only)** — per-country from `/s2.activation.{ lt, lv, ee }`, each `{ afrr_p50, afrr_rate, mfrr_p50, mfrr_rate }`. Three stacked tiles or a mini table. It is NOT a `countries[]` array — v1 of this prompt got this wrong.
8. **Capacity monthly (drawer only)** — read `capacity_monthly` from `/s2` if present; bar chart of monthly clearing. If absent for the selected month, hide the strip — do not show an empty state.
9. **Impact line** — template:
   `"At a 50 MW aFRR offer, today's clearing implies €{afrr_up_avg × 50 × 24 × 365 / 1000}k/year of reserved-capacity revenue."`
   Numbers Unbounded, connective tissue Cormorant.
10. **Source footer** — `BTD (Baltics TSOs)`. Data class: `source`.

### Refresh

`useSignal(${WORKER_URL}/s2, REFRESH_WARM)`.

### Do NOT

- Rebuild the worker `/s2` endpoint. It's healthy.
- Assume `activation.countries[]`. It is `activation.{lt,lv,ee}`.
- Duplicate fleet/trajectory interfaces from S4 — if the card currently re-declares `FleetEntry` / `TrajectoryPoint`, remove them.
- Break the token/Chart.js/line-count rules from §5.

---

## 7. Part D — Shared infrastructure

### `AnimatedNumber` primitive

New file: `app/components/primitives/AnimatedNumber.tsx`. Export from `app/components/primitives/index.ts`.

API:

```ts
type Props = {
  value: number;
  duration?: number;  // ms, default 700
  decimals?: number;  // default 2
  prefix?: string;    // e.g. '€'
  suffix?: string;    // e.g. '/MWh'
  className?: string;
};
```

Behavior:

- Tween from previous `value` to new `value` over `duration` via `requestAnimationFrame`.
- Respect `prefers-reduced-motion` (short-circuit to instant set).
- No libraries (no Framer Motion). Raw RAF, keep the bundle tight.
- Stable layout: wrapper uses `tabular-nums` to avoid width jitter.

Use it in both S1 and S2 hero metrics.

### Tokens / animations

No new tokens. Reuse what's in `app/globals.css`. If you reach for a raw color, stop and grep the existing token first. Design-governance playbook is law.

### Chart theme

Do not add new exports to `app/lib/chartTheme.ts` unless a card genuinely needs something shared. Prefer local composition of `useChartColors()` + `buildScales()`.

### Pause point 2 — after Parts B/C/D built, before any commit

Report:

1. `npx next build` passes (or minimum `npx tsc --noEmit`).
2. Line counts: `S1Card.tsx` (target <600), `S2Card.tsx` (target <800 after de-dup).
3. Screenshots (or description) of S1 and S2 rendered at `npm run dev`:
   - Hero, status chip, interpretation readable.
   - Sparkline colors match tokens in both themes (toggle `data-theme`).
   - No Chart.js "undefined color" warnings in console.
4. Token-drift check: `rg 'rgba\(' app/components/S1Card.tsx app/components/S2Card.tsx` — only resolved chart-color paths.

Wait for **proceed** before committing.

---

## 8. Part E — Verification

Follow `docs/playbooks/verification.md` exactly. No substituting "I think this works" for actual output.

Minimum gates:

1. `npx tsc --noEmit` clean.
2. `npx next build` clean (static export).
3. Live-worker curl:
   - `/s1/capture | jq '.gross_2h, .gross_4h, .rolling_30d.stats_2h.mean'` — all numbers.
   - `/s1/history | jq '.history[-1]'` — `gross_2h` numeric (after cron or backfill).
   - `/s2 | jq '.fcr_avg, .activation.lt.afrr_p50'` — numbers.
   - `/s2/history | jq '.history[-1]'` — numeric fields.
4. Local `npm run dev`:
   - Both cards render with zero console errors.
   - `prefers-reduced-motion: reduce` disables `AnimatedNumber` tween (devtools emulation).
   - Dark ↔ light toggle re-colors Chart.js canvases within ~100 ms.
5. Visual audit (preferred): screenshots saved to `docs/visual-audit/phase-7/` as `s1-dark.png`, `s1-light.png`, `s2-dark.png`, `s2-light.png`.

---

## 9. Part F — Commit and PR

One commit per logical change. Suggested split:

1. `phase7(worker): flatten gross_2h/gross_4h in captureData + updateHistory`
2. `phase7(worker): backfill s1_history gross fields from s1_capture_history` (if script written)
3. `phase7(ui): add AnimatedNumber primitive`
4. `phase7(s1): rebuild card — rolling-30d context strip + sparkline`
5. `phase7(s2): rebuild card — leverage /s2 rolling_180d + activation per-country`
6. `phase7(docs): update docs/map.md + handover session log`

Push `phase-7-s1-s2-cards`. Open PR via GitHub web UI (Kastytis merges manually — do NOT use `gh pr merge`).

### Pause point 3 — after verification, before PR write

Report:

- All curl outputs from §8.3.
- `git log --oneline` on the branch.
- Proposed PR title + 3–5 bullet description.

Wait for **proceed** to push + open PR.

---

## 10. Out of scope for Phase 7

Do NOT touch any of these. Each is its own phase.

- S3 (grid services), S4 (connection scarcity) — separate cards.
- Hero map (`app/components/Hero*`) — Phase 2B-1 owns that.
- Navigation, site chrome, footer.
- VPS scraper tuning — VPS is stable; Phase 6A already shipped S2 automation.
- Notion board edits — Cowork handles those separately.

---

## 11. Appendix — quick refs

- Worker base URL: `https://kkme-fetch-s1.kastis-kemezys.workers.dev`
- Worker file: `workers/fetch-s1.js` (8029 lines as of 2026-04-21).
- Verified function line numbers (2026-04-21):
  - `captureRollingStats`: 2768
  - `computeCapture`: 2787
  - `computeS1`: 2906
  - `updateHistory`: 3027
  - `computeS2Activation`: 3775
  - `computeS2`: 3893
  - `/s2` handler: ~6222
  - `/s1/history` handler: ~7368
  - `/s1/capture` handler: ~7876
  - `/read` handler: 7980 (merges `s1_capture` into `/read` response at lines 7993–7994)
- Cron: hot signals refresh every few minutes; S2 automation shipped in Phase 6A (`phase-6a-s2-auto-tampere`).
- Chart.js hook contract: Canvas 2D cannot read CSS vars. `useChartColors()` resolves via `getComputedStyle(document.documentElement)` and re-resolves on `data-theme` changes via `MutationObserver`. Always use the hook inside Chart.js components; static `CHART_COLORS` fallback is for HTML/SVG legend squares only.
- Token rule: every color in code goes through a CSS var or the resolved `chartColors` map. No raw `rgba()`, no hex.

---

## 12. Meta-rules for this run (because past drift has been expensive)

- If the code contradicts this prompt, trust the code. Update this file with a footnote and continue.
- If a curl response contradicts this prompt, trust the curl. Update and continue.
- If a fix balloons past its scope, stop at the next pause point and report before proceeding.
- Do not silently drop work. If you skip a step, say which and why in the pause-point report.
- End-of-session: update `docs/handover.md` session log with date, scope, what shipped, what deferred.
