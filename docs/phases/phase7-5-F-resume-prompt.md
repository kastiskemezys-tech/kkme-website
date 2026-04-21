# Phase 7.5-F — resume prompt (F2, F3, F4 + verify + push)

**For:** fresh Claude Code session in YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**State as of handoff:** F1 shipped on branch `phase-7-5-F-card-redesign` at commit `9c6395d`. F2, F3, F4 not started. No screenshots. No PR.
**Full plan:** `docs/phases/phase7-5-F-card-redesign-plan.md` (on main) — **read first, authoritative.**

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/handover.md` (skim current-phase + backlog sections)
3. `cat docs/phases/phase7-5-F-card-redesign-plan.md` — the full spec. F2/F3/F4 here are the execution checklist, not a re-spec.
4. `git status && git log --oneline -10`
5. `bash scripts/diagnose.sh`
6. Verify branch starting point:
   ```
   git checkout phase-7-5-F-card-redesign
   git pull origin phase-7-5-F-card-redesign
   git log --oneline -3
   ```
   HEAD must be `9c6395d`. If it isn't, stop and report.
7. `cat app/components/S1Card.tsx | head -80` — see what F1 shape actually looks like (LiveSignal + useRefreshFlash helpers).
8. `grep -n "signal-drawer-request" app/components/primitives/DetailsDrawer.tsx` — confirm the existing event machinery F4 will extend.

Report back: branch state, production health, and that your reading confirms the spec understanding. **Pause A — wait for explicit "go" before touching any files.**

## 1. F2 — remove interpretation prose from card faces

### S1Card.tsx

Delete the interpretation paragraph at lines 132–143 (search `"sitting p"` or `"Today's gross"`). The block starts with `{heroVal != null && stats && (` and renders a `<p>` that repeats the hero metric. **No replacement.** The percentile row immediately below already carries this data.

### S2Card.tsx

Delete the interpretation paragraph at lines 187–204 (search `"capacity clearing at"`). It starts with `<p style={{ fontFamily: 'var(--font-serif)' ...}}>` and renders the aFRR clearing + imbalance + p90 context in prose.

Replace with a **three-tile context row** directly under the hero, matching the visual treatment of S1's percentile row (tile with mono-xs label + mono-sm value, `var(--border-subtle)` top/bottom, 10px 0 padding). Three tiles:

- `imb. mean` → `{Math.round(data.imbalance_mean)} MWh`
- `imb. p90` → `{Math.round(data.imbalance_p90)} MWh`
- `% >100 MWh` → `{Math.round(data.pct_above_100)}%`

Each tile hides gracefully if its source value is null (don't render an em-dash placeholder, just skip the tile).

### Verify

```
grep -n "sitting" app/components/S1Card.tsx              # expect 0
grep -n "capacity clearing at" app/components/S2Card.tsx # expect 0
npm run build
```

Commit: `phase-7-5-F(cards): F2 — remove interpretation prose, replace S2 prose with context tiles`.

## 2. F3 — S2 country toggle (LT/LV/EE)

### Lift the pattern

Reference `app/components/S4Card.tsx:374–399` — three-button segmented control with installed-MW chiplet. Mirror the style verbatim (mono-xs, teal active border, `var(--bg-elevated)` active background, 150ms transitions). MW chiplets in S2 can be stubbed to the Baltic installed MW values shown in S4 if a cleaner source isn't wired — keep the visual symmetry.

### Placement

In `S2Card.tsx` header row, the country toggle sits next to the existing product toggle (aFRR/mFRR/FCR). Same row, separated by a vertical hairline: `<span style={{ width: '1px', background: 'var(--border-subtle)', alignSelf: 'stretch' }} />`. If horizontal space is tight, `flex-wrap: wrap` is acceptable — don't re-architect the header.

### State + data

Add local `const [country, setCountry] = useState<'lt' | 'lv' | 'ee'>('lt');`. Product toggle preserves across country switches and vice versa.

When country changes, re-key:

- **Hero metric:** `data.activation[country].afrr_p50` (or `.mfrr_p50` when product is mFRR; FCR path — see below).
- **Activation rate readout:** `data.activation[country].afrr_rate` (or `.mfrr_rate`). **LV and EE return `null` for both rates by source-data design — BTD only populates activation rates for LT.** Apply the `n/a` glyph rule to these specifically: show a muted `n/a` instead of `?%` or `0%`.
- **Sparkline data:** switch the source from the current `/s2/history` to `data.activation[`${country}_monthly_${productKey}`]` (now available post-worker PR #26). Convert the monthly `{ '2026-01': { p50, ... }, ... }` map to `{ date, value }` points for the Line chart.
- **Drawer 9-day BTD table:** filter rows to the selected country where such rows exist; for LV/EE where only aggregate is surfaced, render a single row honestly.

### FCR is Baltic-wide

FCR is procured Baltic-wide, not per-country — there is no `lt.fcr_p50` or equivalent. When product is FCR: disable the country toggle buttons (opacity 0.35, cursor not-allowed) and show a mono-xs caption under the toggle: `FCR is Baltic-wide`. When country is selected and user switches to FCR, country resets to LT visually but the caption takes over.

### No-data cells

When a `(country, product)` combination has no data despite being logically valid (e.g. mFRR for EE is empty), show the hero as a muted `n/a` glyph with the country+product name underneath. Do not render a zero or dash. Honest gap, not broken UI.

### Verify

```
grep -n "n/a" app/components/S2Card.tsx          # expect hits in the toggle logic
curl -s "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2?t=$(date +%s)" \
  | jq '.activation.lv.mfrr_p50, .activation.ee.mfrr_p50'
# expect 13.6 and 11.9 (cache-bust param required — edge caching caused post-deploy drift last session)
npm run build
```

Commit: `phase-7-5-F(cards): F3 — S2 LT/LV/EE country toggle (re-keys hero/rate/sparkline/drawer, FCR gated Baltic-wide)`.

## 3. F4 — clickable face, anchored drawer

### Drawer anchor mechanism

**Do not restructure DetailsDrawer.** Extend the existing `signal-drawer-request` custom event at `app/components/primitives/DetailsDrawer.tsx:34–49`. Add an optional `scrollToAnchor?: string` field to the event detail. On the panel side (`SignalDrawerPanel`), after the panel expands, if `scrollToAnchor` is set, find `document.getElementById(anchorId)` inside the panel and call `scrollIntoView({ behavior: 'smooth', block: 'start' })` after a `requestAnimationFrame` (let expand animate first).

### Drawer sections

Both S1 and S2 drawers grow to four sections, each a `<section id="...">` inside the drawer content:

- `id="what"` — "Reading this card." The interpretation text lifted from the face prose (before F2 deleted it from the face). Expand slightly:
  - S1: "Today's gross 2h capture is €X/MWh, sitting [pband] of the rolling 30-day distribution. This is the unrestricted arbitrage upside — a battery selling at peak and buying at trough, before efficiency or fees."
  - S2: "aFRR capacity clears at €X/MW/h on average across the 9-day BTD window. LT imbalance averaging N MWh, p90 stress at M MWh, K% of periods above 100 MWh."
  - Keep the text lean — a short paragraph per card, not a thesis. Use the variables from scope so the text updates with data.
- `id="how"` — "How we compute this." 4–6 sentences of methodology:
  - S1: what gross vs net means, why 2h vs 4h, RTE loss convention (scales with charge-leg cost), why data ends at T-1, ENTSO-E + Fraunhofer source chain.
  - S2: BTD `price_procured_reserves` as source, per-country column indices, recent 3-month P50 vs monthly trajectory, capacity-vs-activation distinction, Litgrid post-sync data handover.
- `id="monthly"` — existing `MonthlyChart` (S1) / `CapacityChart` (S2). No changes.
- `id="bridge"` — existing `BridgeChart` (S1) / `ContextTable` (S2). No changes.

Rename drawer label from its current string to `Reading this card`.

### Clickable face

- **Hero metric** becomes clickable. Wrap the hero `<div>` in a `<button>` with `all: unset` + `cursor: pointer` + subtle underline on hover. `onClick` dispatches `signal-drawer-request` with `scrollToAnchor: 'what'`. Keyboard: `Enter` triggers.
- **Percentile tiles (S1) and context tiles (S2)** become `<button>` elements with same event dispatch to anchor `what`. Tab-order reads left-to-right.
- **Sparkline click-to-pin:** Chart.js already emits `onClick` on the chart with index access. Add a local `const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)`. On click, set the index; render a small readout below the chart: `<div>{fmtDate(history[pinnedIndex].date)}: €{value}/MWh, swing €{swing}/MWh</div>`. Click elsewhere on the chart background unpins (handle via `onClick` when `event.type === 'click'` but no `items.length`).

### Verify

- Click hero → drawer expands, scrolls to `what`.
- Click any percentile / context tile → drawer expands, scrolls to `what`.
- Click a sparkline point → readout appears with correct date + value + swing.
- Tab through hero + tiles → focus visible, Enter opens drawer.
- `npm run build && npm run lint` pass.

Commit: `phase-7-5-F(cards): F4 — clickable hero+tiles, sparkline pin, anchored drawer (what/how/monthly/bridge)`.

## 4. Screenshots + push

### Screenshots

Use chrome-devtools MCP at 1440×900. Save to `docs/visual-audit/phase-7-5-F/`:

- `01-s1-face-dark.png` — S1 face with pulse + timestamp + percentile tiles.
- `02-s1-face-light.png` — same, light theme.
- `03-s2-face-dark-lt-afrr.png` — S2 face, LT + aFRR default.
- `04-s2-face-light-lt-afrr.png` — same, light theme.
- `05-s2-toggle-lv-afrr.png` — S2 country toggle switched to LV, aFRR active. Verify `n/a` glyph renders on activation rate.
- `06-s2-toggle-ee-mfrr.png` — S2 country EE + product mFRR. Verify data loads from new `ee_monthly_mfrr`.
- `07-s2-fcr-baltic-wide.png` — FCR selected, country tabs disabled, caption "FCR is Baltic-wide" visible.
- `08-drawer-what.png` — drawer open scrolled to "Reading this card."
- `09-drawer-how.png` — drawer scrolled to methodology.
- `10-sparkline-pinned.png` — a sparkline point pinned with readout visible.

Commit: `phase-7-5-F(docs): visual audit screenshots for F1-F4`.

### Push

```
git push origin phase-7-5-F-card-redesign
```

**Do NOT use `gh` CLI to create the PR.** Push only. Report the branch URL + a PR title + PR body for Kastytis to create manually in the GitHub UI.

## 5. Pause 3

After push, stop. Do not:

- Open the PR.
- Update handover.md (Kastytis does this in Cowork after merge).
- Start on anything else.

Report: commits landed, screenshot list, PR body, any deferred items discovered.

## 6. Deferred items (explicitly NOT for this session)

- LiveSignal + useRefreshFlash extraction to `app/components/primitives/LiveSignal.tsx`. CC flagged this in the F1 handoff — sensible refactor but out-of-scope noise for this session. Add to session-end deferred list.
- Phase 7.5 interventions B-E (chart polish, motion, drawer UX) — these come after F merges, per re-sequencing in the plan doc §7c.
- Phase 7.6 (hero refinement) — next up after 7.5 closes.

## 7. Working rules (same as every session)

- Design tokens: always `var(--token-name)`, never raw rgba.
- `workers/fetch-s1.js` is 7740 lines — never cat whole file.
- No editorial labels or sentiment mappings on card faces (Tightening / Low / High / Open are banned per `c52be3a`).
- Chart tooltips keep `interaction: { mode: 'index', intersect: false }` with series-name labels and swing footer.
- Cache-bust all prod curl (`?t=$(date +%s)` or `-H "Cache-Control: no-cache"`).
- One logical change per commit.
- If context budget hits 80%, stop at a clean boundary. No silent drops.
- Do not touch `logs/btd.log`, `workers/.wrangler/`, `.claude/settings.local.json` — these are session artifacts, correctly untracked.

## 8. Hard stops

- Do not merge. Push only.
- Do not use `gh` CLI.
- Do not force-push, reset hard, or rebase interactively.
- Do not skip hooks (`--no-verify`).
- Do not expand scope beyond F2, F3, F4 + screenshots.
