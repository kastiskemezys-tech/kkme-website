# Phase 7.5-F — Resume prompt v2 (S2 F4 + screenshots + push)

**For:** fresh Claude Code session, YOLO mode
**Branch:** `phase-7-5-F-card-redesign` (already checked out; do NOT re-branch)
**State:** F1 (9c6395d), F2 (e43cac7), F3 (0d8b350), F4-part-1 / S1 only (9459890) all committed.
**Full plan:** `docs/phases/phase7-5-F-card-redesign-plan.md` — §F4 still governs; the S1 half is done, S2 mirrors.

v1 prompt stopped at ~84% context mid-S1 build. Clean commit boundary is
9459890. S1 face + drawer are live; S2 face + drawer match the old Phase 7 shape.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/handover.md` (Session 9 + current phase)
3. `cat docs/phases/phase7-5-F-card-redesign-plan.md` — re-read §F4 (S2 mirror + country filter)
4. `git log --oneline -6` — confirm top of tree is `9459890 phase-7-5-F(cards): F4 part 1 …`
5. `bash scripts/diagnose.sh` — confirm prod still green

Read `app/components/primitives/DetailsDrawer.tsx` end-to-end (forwardRef +
DrawerSection shape is the API you'll mirror) and `app/components/S1Card.tsx`
(HeroButton, TileButton, Sparkline pin, S1WhatSection / S1HowSection are the
patterns you'll replicate).

Report state, pause for "go" before editing.

---

## 1. F4 part 2 — S2Card

### Face changes (mirror S1)

Everything goes in `app/components/S2Card.tsx`:

1. **Hero** — wrap the `AnimatedNumber` in a `HeroButton` identical in
   shape to S1's (copy the helper into S2Card; don't extract into
   primitives yet, the two faces are allowed to diverge slightly). Click
   opens drawer at `what`. Keep the `/MW/h` unit suffix and the `StatusChip`
   + `RateChip` siblings exactly where they are.

2. **Imbalance context tiles** (`imb. mean`, `imb. p90`, `% >100 MWh`) —
   convert each `<div>` tile to a `TileButton` mirroring S1. All three
   route to `openDrawer('what')`.

3. **RateChip** — keep the current `<span>` render path for the muted
   `n/a` state (no click, the chiplet is informational when data is
   absent). When `rate != null`, wrap the chip in a `<button>` with the
   same styling and route click to `openDrawer('what')`. Muted branch
   stays a plain span — don't stylize what you can't action.

4. **Sparkline pin** —
   - `MonthlyTrajectoryChart` (used for aFRR/mFRR) needs pin props + a
     readout below. Readout format: `LT aFRR Mar 26: €6.2/MW/h`. Reuse
     the S1 `Pinned` type shape (`{idx, date, value, swing: null}`) — S2
     monthly points have no swing, pass `null` and skip the swing span.
   - `HistoryChart` (used for FCR only) likewise — readout `FCR Apr 14:
     €0.37/MW/h`, no swing.
   - Pinned state lives on S2Card so it survives product/country toggles.
     When product or country changes, call `setPinned(null)` — the idx no
     longer maps to the same day.

### Drawer changes

Replace the existing `<DetailsDrawer label="Capacity monthly + detail">`
block with a ref-attached drawer using four anchored sections — mirror
S1's pattern exactly:

```tsx
<DetailsDrawer ref={drawerRef} label="Reading this card">
  <DrawerSection id="what" title="What this is">
    <S2WhatSection data={data} prod={prod} country={country} hero={hero} rate={rate} />
  </DrawerSection>
  <DrawerSection id="how" title="How we compute this">
    <S2HowSection />
  </DrawerSection>
  <DrawerSection id="monthly" title="Monthly trajectory — Baltic aggregate">
    {capMonthly.length > 0 ? <CapacityChart monthly={capMonthly} prod={prod} CC={CC} ttStyle={ttStyle} /> : <MutedLine text="No capacity history yet." />}
  </DrawerSection>
  <DrawerSection id="bridge" title="Country detail + BTD context">
    <ContextTable data={data} country={country} />
  </DrawerSection>
</DetailsDrawer>
```

**Monthly section**: title is literally `"Monthly trajectory — Baltic
aggregate"` — the `capacity_monthly` payload is Baltic-wide (fields
`afrr_avg`, `mfrr_avg`, `fcr_avg`, no per-country split). Do **not**
synthesize per-country bars. User confirmed this scope call.

**Bridge / ContextTable changes**: add a country-prefixed header block
above the existing 9-day table. Two new rows pulled from
`data.activation?.[cc]`:
- `{country} {prod} P50` → `act?.afrr_p50` / `act?.mfrr_p50`, unit `€/MW/h`
- `{country} {prod} rate` → `act?.afrr_rate` / `act?.mfrr_rate`, unit `%`
  (muted "n/a" when null)

Keep the existing `aFRR up avg` / `mFRR up avg` / `FCR avg` / imbalance /
% rows — but prepend a tiny muted caption `"Imbalance & Baltic-wide
averages:"` so readers understand that block isn't country-filtered.

### S2WhatSection — narrative content

Lift the F2-deleted interpretation and expand to ~4 sentences. Example
sketch (rewrite in your own voice, match S1's DrawerProse style):

> The current {prod} clearing for {country} is €{hero}/MW/h, {phase}
> relative to the rolling P50. This price is the **capacity** payment —
> paid per MW offered, per hour, regardless of whether the TSO actually
> activates the reserve. Activation pay (the energy side) sits on top
> when called.
>
> Imbalance mean of {imb_mean} MWh with p90 {imb_p90} MWh indicates
> {tight | routine | loose} balancing conditions — the higher the imbalance,
> the more the TSO leans on activated reserves, and the richer aFRR/mFRR
> prints tend to clear the following day.

Name what each number implies for a 50 MW reserve offer — same translation
voice as the S1 impact sentence in the face.

### S2HowSection — methodology

5–6 DrawerProse paragraphs, covering:
- **aFRR** — secondary reserve, automatic frequency response, ~30 s
  response, 15-min bid windows. The main Baltic revenue stream for
  fast-response BESS.
- **mFRR** — manual frequency restoration reserve, TSO-dispatched, slower
  (~15 min response). Only LT has a mature mFRR market today.
- **FCR** — primary reserve, ~30 s, symmetric band; Baltic FCR market is
  thin and mostly Estonia-led.
- **P50 vs mean** — median is the honest summary for skewed reserve
  prices (occasional high-stress events pull the mean). P50 is what a
  "typical" day clears.
- **Per-country variance** — LT has the richest product mix (aFRR +
  mFRR + occasional FCR). LV and EE are mostly aFRR-only today; that's
  why mFRR P50 reads n/a for some country/product combos.
- **Activation rate caveat** — BTD publishes €/MW/h for capacity but
  the activation fraction isn't always reported per-country; the `n/a`
  chip reflects a real reporting gap, not a bug.
- **Source** — BTD ([api-baltic.transparency-dashboard.eu](https://api-baltic.transparency-dashboard.eu)),
  polled every 20 minutes.

### Verification

```
grep -n "capacity clearing at" app/components/S2Card.tsx   # 0
grep -n "sitting" app/components/S1Card.tsx                # 0
npx tsc --noEmit   # clean
npx next build     # clean
```

Commit: `phase-7-5-F(cards): F4 part 2 — S2 clickable face, country-scoped drawer bridge`

---

## 2. Screenshots

Dir: `docs/visual-audit/phase-7-5-F/`

Use chrome-devtools MCP (`new_page` → `navigate_page` → `take_screenshot`).
1440×900 viewport.

Required captures (exact filenames):

- `s1-face-dark.png`, `s1-face-light.png` — initial face with pulse dot + timestamp + source chip
- `s2-face-dark.png`, `s2-face-light.png` — same, S2 LT default
- `s2-country-lv.png` — after clicking LV; hero ≈ €13.2, sparkline re-keyed to `lv_monthly_afrr`, rate chip muted "n/a"
- `s2-country-ee.png` — same for EE, hero ≈ €13.6
- `s2-product-fcr.png` — FCR active; country toggle buttons visibly disabled
- `s1-drawer-what.png` — S1 drawer open at `what` anchor (click hero)
- `s1-drawer-how.png` — S1 drawer open at `how` anchor (click any percentile tile… wait, all tiles anchor to `what`; instead click the drawer toggle then scroll to `how`, OR use the devtools console to call the drawerRef directly)
- `s2-drawer-what.png`, `s2-drawer-how.png`

Dark is default. Light-theme button is in the header nav.

---

## 3. Push (no PR)

```
git push -u origin phase-7-5-F-card-redesign
```

Report to Kastytis:
- Branch URL on GitHub (construct manually, **no `gh` CLI**)
- Suggested PR title: `phase-7-5-F: S1/S2 card face redesign — live-data signal, prose→drawer, country toggle, clickable face`
- Suggested PR body: summary of F1/F2/F3/F4, screenshot links, verification output (grep + tsc + build)

**Stop at Pause 3.** Do not open PR. Do not merge. Wait for
"merged" confirmation before any handover/session-log writes.

---

## 4. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- No scope creep beyond F4 S2 + screenshots + push.
- The pre-commit lint errors in `workers/fetch-s1.js` and two
  `no-direct-set-state-in-use-effect` errors in S1Card/S2Card come from
  F1's refresh-flash hook and are out of scope. `npx next build` is the
  release gate; ignore `npm run lint` noise.
- If budget gets tight (>80%), stop at a clean commit boundary, write a
  shorter resume prompt, hand back.
