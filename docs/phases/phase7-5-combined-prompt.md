# Phase 7.5 — Worker backfill + Card face redesign (combined CC prompt)

**For:** fresh Claude Code session in YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Scope:** two deliverables in one session — worker first, then card redesign
**Full plan:** `docs/phases/phase7-5-F-card-redesign-plan.md` — **read this first, it is authoritative.**

---

## 0. Session-start protocol

Before writing a single line of code, do ALL of the following:

1. `cat CLAUDE.md` — project rules.
2. `cat docs/handover.md` — canonical state. Especially §Current phase and backlog.
3. `cat docs/phases/phase7-5-F-card-redesign-plan.md` — the plan this prompt executes.
4. `git status && git log --oneline -10` — branch hygiene.
5. `bash scripts/diagnose.sh` — production health.
6. `grep -n "lt_monthly_afrr\|lv_monthly_afrr\|COUNTRY_COLS" workers/fetch-s1.js` — confirm worker state matches what this prompt assumes.

Then report back: (a) current branch + cleanliness, (b) production health, (c) whether the worker findings match §1 below. **Pause 1 — wait for explicit "go" before proceeding.**

---

## 1. Deliverable A: worker — expose LV/EE monthly P50s

**Branch:** `phase-7-5-worker-lvee-monthly` off `main`.

### Finding

`computeS2Activation()` in `workers/fetch-s1.js` already computes per-country monthly aFRR and mFRR P50s for all three countries. The data structure at `countries.Latvia.afrr_up`, `countries.Latvia.mfrr_up`, `countries.Estonia.afrr_up`, `countries.Estonia.mfrr_up` is populated by the monthly aggregation loop (around lines 3814–3877). It just isn't surfaced in the S2 payload.

### Change

Two call sites need updating. Find them with `grep -n "lt_monthly_afrr" workers/fetch-s1.js` — there are exactly two occurrences today.

**Call site 1 — around line 6293** (inside the main S2 response assembly). Currently emits:

```js
lt: {
  afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: lt?.afrr_recent_3m?.avg_activation_rate ?? null,
  mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
  mfrr_rate: lt?.mfrr_recent_3m?.avg_activation_rate ?? null,
},
lv: {
  afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: lv?.afrr_recent_3m?.avg_activation_rate ?? null,
},
ee: {
  afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: ee?.afrr_recent_3m?.avg_activation_rate ?? null,
},
...
lt_monthly_afrr: lt?.afrr_up ?? null,
lt_monthly_mfrr: lt?.mfrr_up ?? null,
```

Update to:

```js
lt: {
  afrr_p50: lt?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: lt?.afrr_recent_3m?.avg_activation_rate ?? null,
  mfrr_p50: lt?.mfrr_recent_3m?.avg_p50 ?? null,
  mfrr_rate: lt?.mfrr_recent_3m?.avg_activation_rate ?? null,
},
lv: {
  afrr_p50: lv?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: lv?.afrr_recent_3m?.avg_activation_rate ?? null,
  mfrr_p50: lv?.mfrr_recent_3m?.avg_p50 ?? null,
  mfrr_rate: lv?.mfrr_recent_3m?.avg_activation_rate ?? null,
},
ee: {
  afrr_p50: ee?.afrr_recent_3m?.avg_p50 ?? null,
  afrr_rate: ee?.afrr_recent_3m?.avg_activation_rate ?? null,
  mfrr_p50: ee?.mfrr_recent_3m?.avg_p50 ?? null,
  mfrr_rate: ee?.mfrr_recent_3m?.avg_activation_rate ?? null,
},
...
lt_monthly_afrr: lt?.afrr_up ?? null,
lt_monthly_mfrr: lt?.mfrr_up ?? null,
lv_monthly_afrr: lv?.afrr_up ?? null,
lv_monthly_mfrr: lv?.mfrr_up ?? null,
ee_monthly_afrr: ee?.afrr_up ?? null,
ee_monthly_mfrr: ee?.mfrr_up ?? null,
```

**Call site 2 — around line 7204** (inside `s2_activation_parsed` assembly for revenue model). Currently emits only `lt` + `lt_monthly_afrr` + `lt_monthly_mfrr`. Add the same `lv` and `ee` snapshot objects and `lv_monthly_*` + `ee_monthly_*` keys in the same shape as call site 1. Define local `const lv = actRaw.countries?.Latvia;` and `const ee = actRaw.countries?.Estonia;` first.

### Verify before commit

Run wrangler dev locally if feasible, otherwise deploy to a preview and curl:

```
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.activation | keys' | grep -E "lv_monthly|ee_monthly"
```

Expect four matches: `lv_monthly_afrr`, `lv_monthly_mfrr`, `ee_monthly_afrr`, `ee_monthly_mfrr`.

Also:

```
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.activation.lv | keys'
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.activation.ee | keys'
```

Each should include `mfrr_p50` and `mfrr_rate` alongside `afrr_p50` and `afrr_rate`.

### Commit + deploy

- Single commit: `phase-7-5-worker(s2): expose LV/EE monthly P50 trajectories`.
- Deploy via `npx wrangler deploy` from `workers/` directory (or whatever the kkme deploy flow is — check `scripts/` first).
- Run the curl checks above against production.
- Wait for KV refresh if cron-dependent (~5 min).

**Pause 2 — after worker is live and verified. Wait for explicit "proceed to F" before starting deliverable B.** Do not start editing frontend until this pause clears.

---

## 2. Deliverable B: card face redesign (Phase 7.5-F)

**Branch:** `phase-7-5-F-card-redesign` off `main` (not off the worker branch — they ship separately).

Full spec is in `docs/phases/phase7-5-F-card-redesign-plan.md`. This section is the execution checklist, not a re-spec. Re-read the plan doc before starting.

### F1 — Live-data signal

- Lift `.pulse-dot` + `live-pulse` keyframe (already in `app/globals.css:481` and `:628`).
- In `S1Card.tsx` and `S2Card.tsx`, inject a 6px teal pulse-dot next to the "X m ago" timestamp in the header row.
- Promote "X m ago" from `var(--text-muted)` to `var(--text-primary)`, DM Mono 12px.
- Add inline source chip next to timestamp: `energy-charts.info` for S1, `BTD` for S2. Compact, DM Mono 10px, `var(--text-tertiary)`, mild border.
- On `useSignal` in-flight, flash the dot amber for 300ms. Easiest path: expose `isRefreshing` from `useSignal`, or use a small local `useEffect` keyed off `status`.
- Keep the full `SourceFooter` at the bottom for legal/methodology text.
- Commit: `phase-7-5-F(cards): F1 — live-data signal (pulse dot + prominent timestamp + inline source)`.

### F2 — Move interpretations off the face

- `S1Card.tsx`: delete the entire percentile-band interpretation paragraph (currently lines ~132–141 — search for "sitting p"). **Do not replace with chips**. The percentile row immediately below already carries this information.
- `S2Card.tsx`: delete the interpretation paragraph (currently lines ~182–200 — search for "capacity clearing at"). Replace with a **three-tile context row** underneath the hero, same visual treatment as S1's percentile row: `imb. mean` / `imb. p90` / `% >100 MWh`. Glyphs only, no prose.
- Keep the impact line in both cards (translation of hero into €/day or €/year — not interpretation).
- Commit: `phase-7-5-F(cards): F2 — remove interpretation prose from card faces`.

### F3 — S2 country toggle

- Lift the exact segmented-control pattern from `S4Card.tsx:374–399` (LT/LV/EE tabs with installed-MW chiplet).
- Add to `S2Card.tsx` header row, next to the product toggle. Same row, hairline `var(--border-subtle)` separator between them. Mono 11px, teal border on active.
- Default: `LT`.
- On country toggle change, re-key:
  - Hero metric → `data.activation.{cc}.{product_p50_key}`.
  - Activation-rate readout → `.{cc}.{product_rate_key}`.
  - Sparkline data → `data.activation.{cc}_monthly_{product}` (newly available post-worker).
  - Drawer 9-day BTD table → filter to country.
- If `(product, country)` has no data (e.g. FCR is Baltic-wide, not per-country), disable the tile with muted `n/a` glyph. Honest gap, not silent.
- Preserve product selection across country switches and vice versa.
- Commit: `phase-7-5-F(cards): F3 — S2 country toggle (LT/LV/EE), re-keys hero+sparkline+drawer`.

### F4 — Clickable face, narrative drawer

- Hero metric becomes clickable. Cursor pointer, subtle underline on hover. `onClick` opens drawer anchored to `what`.
- Percentile tiles (S1) and context tiles (S2) become buttons. `onClick` opens drawer anchored to `what`, scrolled to the relevant paragraph. Keyboard: `Tab` order reads left-to-right, `Enter` activates, `Esc` closes drawer.
- Sparkline: click-to-pin. Pinning a day shows a small readout below the chart (`Apr 14: €112/MWh, swing €58`). Click elsewhere unpins. Reuse existing tooltip data — don't add new fetch.
- `DetailsDrawer` primitive gains an `anchor` prop. Four sections, each with `id` anchors:
  - `what` — the interpretation text lifted from the face, expanded. This is the prose home.
  - `how` — methodology: gross vs net, why 2h/4h, RTE loss, why data ends at T-1, source provenance.
  - `monthly` — existing `MonthlyChart` (S1) / `CapacityChart` (S2).
  - `bridge` — existing `BridgeChart` (S1) / `ContextTable` (S2).
- Drawer opens scrolled to the anchor. Rename drawer label to "Reading this card" or similar.
- Commit: `phase-7-5-F(cards): F4 — clickable face, anchored drawer with narrative home`.

### Verify before PR

```
npm run build
npm run lint
grep -n "sitting" app/components/S1Card.tsx       # expect 0
grep -n "capacity clearing at" app/components/S2Card.tsx   # expect 0
```

Screenshots to `docs/visual-audit/phase-7-5-F/` at both dark and light themes, at 1440×900:

- S1/S2 initial face (hero + pulse dot + timestamp visible).
- S2 country toggle at LV and EE states.
- Drawer open at each of the four anchors.

### PR

Open PR via GitHub web UI — do **not** use `gh` CLI (project rule, Kastytis merges manually).

Push the branch:

```
git push -u origin phase-7-5-F-card-redesign
```

Then report the branch URL and PR template body to Kastytis for manual creation.

**Pause 3 — after branch is pushed and verification output is captured. Wait for explicit "merged" confirmation before any end-of-session updates.**

---

## 3. End-of-session

After both branches merge to main:

- Update `docs/handover.md`: move Phase 7.5-worker and Phase 7.5-F from "Queued" to "What's shipped." Add a session log entry with date, scope, commits landed, any deferred items.
- Flag for Kastytis to sync Notion board (close Phase 7.5 F, add worker completion note).
- If any items were deferred or any TODOs emerged during the session, list them explicitly in the session log. **No silent drops.**

---

## 4. Working rules (repeat for this session)

- `workers/fetch-s1.js` is 7740 lines. Never `cat` whole file. Use `grep` + targeted `sed -n` reads.
- Design tokens: always `var(--token-name)`, never raw rgba().
- Verify with actual output before committing. `curl` checks over "I think this works."
- One logical change per commit.
- No editorial labels or sentiment mappings on card faces. `Tightening`, `Low`, `High`, `Open` etc are forbidden per `c52be3a` regression fix. Percentile bands and raw data only.
- Chart tooltips: `interaction: { mode: 'index', intersect: false }` with series-name labels and swing footer — don't strip these during F refactor.
- If context budget gets tight (>80%), stop at a clean boundary and hand back. Do not claim work is done when it isn't.

---

## 5. Hard stops — do not do these

- Do not start F work before worker is deployed + verified.
- Do not merge branches yourself. Push only. Kastytis reviews in GitHub UI.
- Do not run `git push --force`, `reset --hard`, or `rebase -i`.
- Do not use `gh` CLI for PRs.
- Do not skip hooks (`--no-verify`).
- Do not amend commits after push.
- Do not extend scope beyond F1–F4 and the worker spec. Other ideas go into the session-end deferred list.
