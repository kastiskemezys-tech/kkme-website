# Phase 7.5-F — Resume prompt (F4 + screenshots + push)

**For:** fresh Claude Code session, YOLO mode
**Branch:** `phase-7-5-F-card-redesign` (do NOT branch off — already checked out)
**State:** F1 (9c6395d), F2 (e43cac7), F3 (0d8b350) all committed on branch.
**Full plan:** `docs/phases/phase7-5-F-card-redesign-plan.md` — §F4 section is the spec.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/handover.md` (especially Session 9 + current phase)
3. `cat docs/phases/phase7-5-F-card-redesign-plan.md` — re-read §F4 before editing
4. `git log --oneline -5` — confirm you're on top of `0d8b350`
5. `bash scripts/diagnose.sh` — confirm prod still green
6. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.activation | keys'` — confirm lv_monthly_* / ee_monthly_* still present

Report state, pause for "go" before editing.

---

## 1. F4 — Clickable face, narrative drawer

Spec is `phase7-5-F-card-redesign-plan.md` §F4 (do not re-interpret; execute).

### Face interactions to add

**S1Card.tsx** (after F2 + F3, currently ~200 lines):
- Hero `<AnimatedNumber>` wrapper → clickable. Cursor pointer, subtle underline on hover. `onClick={() => openDrawer('what')}`. Needs drawer anchor support — see DetailsDrawer §below.
- Percentile tiles in "Rolling context strip" (mean/p25/p50/p75/p90/days) → `<button>`. `onClick={() => openDrawer('what')}` (all tiles route to `what` — the percentile narrative lives there).
- Sparkline: add click-to-pin. When user clicks a day, store `{date, value, swing?}` in a ref/state; show small readout below chart `Apr 14: €112/MWh`. Click same day again or outside chart unpins. Use Chart.js `onClick` handler on Line options; reuse existing tooltip data (no new fetch).

**S2Card.tsx** (after F3, currently ~370 lines):
- Same hero-click pattern.
- Imbalance context tiles (imb. mean / imb. p90 / % >100 MWh) → buttons, `openDrawer('what')`.
- Rate chiplet → button, `openDrawer('what')`.
- Sparkline click-to-pin same as S1. `MonthlyTrajectoryChart` is per-country monthly so the readout format differs: `LT aFRR Mar 26: €6.2/MW/h`.

### Drawer primitive changes

`app/components/primitives/DetailsDrawer.tsx` — read it first, it currently accepts `{label, children}`. Extend it to:
- Accept optional `anchor` prop + `onOpenAnchor` callback via ref (the cards need to programmatically open at a specific anchor).
- Render children inside a scrollable container with 4 internal `<section id="{what|how|monthly|bridge}">` sections.
- When opened with an anchor, scroll that section into view (`element.scrollIntoView({behavior: 'smooth', block: 'start'})`).
- Rename label from "Monthly + Gross→Net bridge" / "Capacity monthly + detail" → **"Reading this card"** on both.

Practical API shape (suggestion, confirm with existing primitive shape before wiring):

```tsx
const drawerRef = useRef<DrawerHandle>(null);
const openDrawer = (anchor: DrawerAnchor) => drawerRef.current?.open(anchor);
// ...
<DetailsDrawer ref={drawerRef} label="Reading this card">
  <DrawerSection id="what" title="What this is">…</DrawerSection>
  <DrawerSection id="how" title="How we compute this">…</DrawerSection>
  <DrawerSection id="monthly" title="Monthly trajectory"><MonthlyChart .../></DrawerSection>
  <DrawerSection id="bridge" title="Gross → Net bridge"><BridgeChart .../></DrawerSection>
</DetailsDrawer>
```

### Drawer content (narrative home)

**S1 drawer — `what`:** Lift the interpretation paragraph deleted in F2. Expand to ~3–5 sentences covering: where today sits in the 30-day distribution, what "p50–p75" means in revenue terms, why gross capture vs. net, why today's value is meaningful for a 100 MW plant.

**S1 drawer — `how`:** Methodology, 4–6 sentences:
- Gross capture = peak 2 or 4 hours' price minus trough 2 or 4 hours' price, daily
- Why 2h vs 4h (typical BESS durations)
- RTE loss convention (85% round-trip efficiency, applied on the charge leg)
- Why data ends at T-1 (day-ahead clearing for next day known by 13:00 CET; yesterday's physical shape is finalised)
- Source: energy-charts.info (Fraunhofer ISE) pulling DA LT SMP

**S2 drawer — `what`:** Lift the interpretation paragraph deleted in F2 (clearing level + imbalance context). Expand to name what each number implies for reserve-capacity revenue.

**S2 drawer — `how`:**
- What aFRR/mFRR/FCR each are, in one sentence each
- P50 vs mean (why median for skewed distributions)
- Why per-country clearing varies (LT is richer due to mFRR pool; LV/EE are aFRR-only mostly)
- Why rate shown as n/a (BTD publishes €/MW/h but not always the activation fraction)
- Source: BTD (api-baltic.transparency-dashboard.eu)

**S2 drawer — `monthly`**: existing `CapacityChart`. If time permits, filter `capacity_monthly` to the selected country (currently Baltic-wide; check if capacity_monthly is per-country in payload).

**S2 drawer — `bridge`**: existing `ContextTable`. Add country filter if activation has per-country aFRR/mFRR P50/rate — render "Selected: {country}" prefix, show activation.{cc}.{product}_{p50|rate}, keep imbalance rows Baltic-wide (flagged as such).

### Verification

```
grep -n "sitting" app/components/S1Card.tsx        # 0
grep -n "capacity clearing at" app/components/S2Card.tsx   # 0
npx tsc --noEmit   # clean
npx next build     # clean
```

Commit: `phase-7-5-F(cards): F4 — clickable face, anchored drawer with narrative home`

---

## 2. Screenshots

Dir: `docs/visual-audit/phase-7-5-F/`

Use chrome-devtools MCP (`new_page` → `navigate_page` → `take_screenshot`). 1440×900.

Captures required (rename filenames to match):
- `s1-face-dark.png`, `s1-face-light.png` — initial face with pulse + timestamp + source chip visible
- `s2-face-dark.png`, `s2-face-light.png` — same for S2 (LT default)
- `s2-country-lv.png` — after clicking LV, hero = €13.2, sparkline re-keyed to lv_monthly_afrr, rate chip muted "n/a"
- `s2-country-ee.png` — same for EE, hero = €13.6
- `s2-product-fcr.png` — FCR active, country toggle disabled (muted)
- `s1-drawer-what.png` — S1 drawer open at `what` anchor
- `s1-drawer-how.png` — S1 drawer open at `how` anchor
- `s2-drawer-what.png`, `s2-drawer-how.png`

Theme toggle: light theme button is in header nav. Dark is default.

---

## 3. Push (no PR)

```
git push -u origin phase-7-5-F-card-redesign
```

Report to Kastytis:
- Branch URL (GitHub web, not `gh` CLI)
- Suggested PR title: `phase-7-5-F: S1/S2 card face redesign — live-data signal, prose→drawer, country toggle, clickable face`
- Suggested PR body:
  - Summary of F1/F2/F3/F4
  - Screenshot links
  - Verification output (grep, build, curl)

**Stop here (Pause 3).** Do not open PR. Do not merge. Wait for Kastytis's "merged" confirmation before any handover/session-log updates.

---

## 4. Known pre-existing lint noise

`npm run lint` currently reports 26 errors, 69 warnings — most are in `workers/fetch-s1.js`. Two React `no-direct-set-state-in-use-effect` errors in S1Card/S2Card come from F1's `useRefreshFlash` (commit 9c6395d) and are not in F4's scope. The build (`npx next build`) is the release gate; it passes clean. Do not chase these in F4 — add a separate cleanup phase if the user wants them quieted.

---

## 5. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`.
- No amending commits after push.
- No scope creep beyond F4 + screenshots + push.
- If budget gets tight (>80%), stop at a clean commit boundary, write a shorter resume prompt, hand back.
