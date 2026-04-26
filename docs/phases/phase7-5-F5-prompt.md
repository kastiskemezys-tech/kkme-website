# Phase 7.5-F5-lite — Close out card surgery

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** `phase-7-5-F-card-redesign` (already pushed at `117b1a7`; PR #27 open with merge conflict)
**Why this is a SLIM scope:** the broader F5 originally included today-row, chart geometry, and dotted-underline affordance. Per `docs/phases/upgrade-plan.md`, those three items get redone in Phase 9–10 with new design-system primitives (`<MetricDisplay>`, consolidated chart layer, semantic affordance grammar), so doing them now is wasted work. F5-lite keeps only the items that survive the redesign:

1. **Gross→Net bridge math fix** (data correctness — survives)
2. **Freshness chip thresholds standardised** (templates a pattern other cards inherit)
3. **Drawer prose trim** (an editorial rule, not a layout choice; permanent going forward)
4. **Resolve PR #27 merge conflict** (unblocks merge)

Read `docs/phases/upgrade-plan.md` first — it's the master roadmap. F5-lite is one row in it.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — understand what F5-lite is and isn't
3. `cat docs/handover.md` (Session 9 + current phase)
4. `git log --oneline -10` — top should be `117b1a7 docs(phase7-5-F): persist visual-audit screenshots …`
5. `bash scripts/diagnose.sh` — confirm prod still green
6. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '.bess_net_capture'` — inspect the current Gross→Net bridge structure to scope the math fix correctly

Read `app/components/S1Card.tsx` (specifically the `BridgeChart` inline component at ~line 456 and how `cap.gross_to_net` is consumed) and `app/components/S2Card.tsx` (freshness chip area near top of card render). Do NOT read worker source whole — grep for `gross_to_net` if you need worker-side logic.

Report state, pause for "go" before editing.

---

## 1. F5-lite.1 — Gross→Net bridge: SHOW THE WORK

**Symptom:** S1 "Gross → Net bridge" displays `Gross +€36 → RTE loss +€0 (12.5%) → Net +€36`. Reader sees "12.5% loss → €0" and concludes the math is broken.

**Diagnosis (per the deep numerical audit):** The math is *probably correct*. RTE loss is applied to the **charge leg** (not the gross spread). If today's trough hour cleared at €0 (renewable-surplus midday, plausible in Baltic markets), then `RTE_loss = 12.5% × charge_price = 12.5% × €0 = €0`. Mathematically valid; visually broken because the bridge doesn't explain why.

**Investigation order:**
1. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '.bess_net_capture.gross_to_net'` — confirm the line items. Specifically check the trough/charge price input. If trough is €0, math is correct and the fix is presentational. If trough is non-zero but RTE row reports €0, there's a real worker-side bug.
2. Cross-check the bridge against `data.spread_eur_mwh`, `data.lt_avg_eur_mwh`, `data.p_low_avg`. Reconcile the inputs.

**Fix (case A: math is correct, presentation is the issue):** Render the formula explicitly even when the output rounds to zero:

```
RTE loss (12.5% on charge leg)
  = 12.5% × charge price (€0 today)
  = €0 today
  Typical: €30 charge → ≈ €4/MWh
```

Two-line presentation: today's value with the input that drove it, plus a typical-case anchor so reader sees the formula isn't dead.

**Fix (case B: real bug):** Patch in worker. Expected formula: `rte_loss_eur_mwh = gross × (1 - rte_efficiency) × charge_leg_share` or equivalent. For gross=€36, rte=85%, charge_share~0.5 → ~€2.7/MWh. State assumptions in the bridge row.

**Acceptance:** reader sees either (a) "today's RTE loss = €0 because charge price was €0, with the formula visible" or (b) a sensible non-zero value with audit math.

**Out of scope:** other bridge rows (fees, imbalance). If they look suspicious, flag in Pause C — they go to Phase 7.6 numerical reconciliation.

---

## 2. F5-lite.2 — Freshness chip thresholds

**Define the global thresholds** (apply to S1 and S2 only in F5-lite; Phase 7.6.16 normalises all timestamps site-wide, and Phase 10 propagates the chip pattern across remaining cards as part of the MetricDisplay rollout):

| Age | Label | Color |
|---|---|---|
| `<1h` | `LIVE` | teal |
| `1–6h` | `RECENT` | text-secondary (neutral) |
| `6–24h` | `TODAY` | text-tertiary (neutral) |
| `>24h` | `STALE` | amber-muted |
| `>72h` | `OUTDATED` | rose-muted |

**Implementation rules:**
- Centralise the threshold logic. Add a small helper in `app/lib/freshness.ts` (create file if needed) exporting `freshnessLabel(updatedAt: number): { label, age, hoursStale }`. Both S1Card and S2Card import from there. This pre-positions the helper for Phase 11 to consume site-wide.
- The colors above resolve to **existing tokens** — don't invent new ones. F5-lite respects the existing token system; Phase 8 expands it.
- **Add absolute timestamp on hover.** `<span title="2026-04-26 11:00 UTC">3h ago</span>`. Use the worker's `updated_at` formatted as ISO without seconds.
- **Critical:** if data is older than 1h, the word `LIVE` MUST NOT appear anywhere on that card. The word "LIVE" attached to "28h ago" is the audit's single most cited credibility break.

**Verification:**
```
grep -rn "LIVE" app/components/S1Card.tsx app/components/S2Card.tsx
```
Each occurrence should be inside a conditional that gates on `<1h`.

---

## 3. F5-lite.3 — Drawer prose trim

Apply the rule from `feedback_drawer_prose` memory: drawers are sparse, not expository.

**S1WhatSection — target: 1–2 sentences max.**

```
Today's gross 2h capture is €{hero}/MWh, sitting in the {band} band of the rolling 30-day distribution.
```

Delete in S1WhatSection (currently lines roughly between the `WHAT THIS IS` heading and the `HOW WE COMPUTE THIS` heading):
- "Why the distribution matters" paragraph
- "p25–p50 flat-curve regime" sentence
- "In revenue terms: a 100 MW / 2h plant cycling once/day…" — the face's impact line covers this

**S1HowSection — target: 3 short bullets.**

```
- Peak-2h average price minus trough-2h average, on day-ahead clearing prices.
- 85% round-trip efficiency applied on the charge leg (gross → net).
- Source: energy-charts.info (Fraunhofer ISE), polled every 5 minutes.
```

Delete:
- "2h vs 4h tracks typical Baltic BESS durations" essay
- "Data ends at T-1: day-ahead clearing for the next day…" explainer
- "We store the 30-day rolling distribution in KV alongside the history array"

**S2WhatSection — target: 1–2 sentences.**

```
{country} {prod} clears at €{hero}/MW/h on a 7-day rolling P50.
This is capacity payment — paid per MW offered per hour, regardless of activation.
```

Delete the imbalance interpretation paragraph and the speculative "richer aFRR/mFRR prints tend to clear the following day" line.

**S2HowSection — target: 3 short bullets.**

```
- 7-day rolling P50 of capacity clearing prices, per country, per product.
- aFRR / mFRR / FCR are reserve products; LT has the richest mix, LV/EE are aFRR-dominated.
- Source: BTD (api-baltic.transparency-dashboard.eu), polled every 20 minutes.
```

Delete the response-time mini-dictionary, the "P50 vs mean" essay, the "activation rate caveat" paragraph.

**Rule:** if a sentence is teaching, cut it. If it's explaining methodology beyond formula+assumption+source, cut it. If it's computing revenue scenarios, cut it (the face does that).

**Verification:**
```
grep -n "Why the distribution matters" app/components/S1Card.tsx   # 0
grep -n "2h vs 4h" app/components/S1Card.tsx                       # 0
grep -n "Data ends at T-1" app/components/S1Card.tsx               # 0
grep -n "richer aFRR" app/components/S2Card.tsx                    # 0
grep -n "P50 vs mean" app/components/S2Card.tsx                    # 0
```

---

## 4. F5-lite.4 — PR #27 conflict resolution

Conflict file: `docs/phases/phase7-5-F-resume-prompt.md`. Branch and main both modified it.

**Resolution path (locally, not via web UI):**
```
git fetch origin main
git merge origin/main
# conflict on docs/phases/phase7-5-F-resume-prompt.md
# resolve in favor of branch version (the version on phase-7-5-F-card-redesign)
# keep all <<<<<<< HEAD ... ======= content; delete ======= ... >>>>>>> main content; delete the three marker lines
git add docs/phases/phase7-5-F-resume-prompt.md
git commit -m "merge main into phase-7-5-F-card-redesign (take branch version of v1 resume prompt)"
```

Reasoning: the branch version is the document that actually drove F4 execution. Main's version is stale (pre-F4 intent).

After merge, also stage and commit the upgrade plan / F5-lite prompt itself if not already on the branch:
```
git add docs/phases/upgrade-plan.md docs/phases/phase7-5-F5-prompt.md
git commit -m "docs: upgrade master plan + F5-lite scope"
```

---

## 5. Verification gate

```
npx tsc --noEmit                   # clean
npx next build                     # release gate (clean)
grep -rn "LIVE" app/components/S1Card.tsx app/components/S2Card.tsx | head
# every match should be conditional on <1h
```

Visual sanity: `npm run dev` and load `localhost:3000`. Verify:
- S1 hero with bridge expanded shows the formula visibly (either non-zero RTE loss with the math shown, or €0 today with the formula and typical-case anchor visible).
- Freshness chip color/label matches actual current age — re-curl `/s1` and `/s2` to read `updated_at` and confirm the label maps correctly through the threshold table.
- Drawer WHAT/HOW are visibly shorter (~30% of F4 length).
- The word `LIVE` does not appear on a card whose data is older than 1h.

Commit (single commit for F5-lite code; merge commit is separate):
`phase-7-5-F(cards): F5-lite — bridge math fix, freshness thresholds, drawer trim`

---

## 6. Push, then user merges via GitHub UI

```
git push origin phase-7-5-F-card-redesign
```

Report to Kastytis:
- F5-lite commit hash
- Merge commit hash
- Branch URL (no `gh` CLI)
- Confirmation that PR #27 should now be merge-ready (no conflicts)
- Verification quotes (grep + tsc + build)

**Stop after push.** Kastytis merges via GitHub web UI after eyeballing.

---

## 7. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- No scope creep beyond F5-lite.1–.4. The today-row, chart geometry, and dotted-underline affordance are deferred to Phase 9–10 by explicit decision.
- No new dependencies.
- The pre-existing lint errors in `workers/fetch-s1.js` are out of scope. `npx next build` is the release gate.
- If budget gets tight (>80%), commit at a clean boundary and write a continuation prompt.
- **No screenshots.** Phase 9–10 will replace the cards entirely; investing in F5-lite screenshots is wasted. The existing F4 screenshots in `docs/visual-audit/phase-7-5-F/` stay as the historical record of the F-series intermediate state.

---

## 8. After merge

The user opens `docs/phases/upgrade-plan.md`, ticks the F5-lite checkboxes, adds a session-log entry, and kicks off **Phase 7.6 — Numerical Reconciliation** next (not Phase 8). Principles P1–P6 are locked; P7 (engagement layer) is pending and only gates Phase 17. Phase 7.6 fixes the ~20% of numbers that have arithmetic or labelling errors plus the ~35% that fail to reconcile across cards. Foundation work (Phase 8) starts on top of trusted numbers, not on top of broken ones.
