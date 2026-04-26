# Phase 7.6 — Numerical Reconciliation (Session 3)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** existing `phase-7-6-numbers` (Session 1 + Session 2 already landed there; do NOT branch off main).
**Why this comes before any redesign work:** the deep audit caught ~20% of numbers as math/labelling errors and ~35% as cross-card reconciliation failures. Sessions 1 and 2 fixed the bug-class items and the cross-card reconciliation. Session 3 closes out the timestamp / hour / activation-rate methodology items, then verifies the whole branch and prepares it for merge.

**Read first, before anything else:**
1. `docs/phases/upgrade-plan.md` — master roadmap. §1 (locked principles P1–P7), §1b (cross-cutting numerical rules N-1 through N-10), §2 Phase 7.6 (the full 17-item scope; Sessions 1–2 already landed 7.6.0–7.6.11 + 7.6.13).
2. `docs/handover.md` — Session 11 entry covers Session 1 (commits, anomalies). Look for the Session 12 entry next; if missing, add it from this session.
3. `CLAUDE.md` — repo conventions.

This is **Session 3 of 3** for Phase 7.6. Scope split:
- **Session 1 (`1862ca4` → `209d7f0`):** 7.6.0 (Vitest harness) + 7.6.1–7.6.7 (low-blast-radius bug-class fixes).
- **Session 2 (`a2a44c3` → `1880496`):** 7.6.8 (capture price reconciliation), 7.6.9 (dispatch price reconciliation), 7.6.10 (pipeline labelling), 7.6.11 (IRR label consistency), 7.6.13 (S1 distribution skew investigation).
- **Session 3 (this prompt):** 7.6.14 (hour labelling), 7.6.15 (activation-rate methodology), 7.6.16 (timestamp normalisation site-wide) + final verification + handover update + push.

Note: 7.6.12 (Gross→Net "show the work") was completed in F5-lite. Skip.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — re-read §1b and §2 Phase 7.6
3. `cat docs/handover.md` — confirm Session 11 entry covers Session 1; if a Session 12 entry covers Session 2, fine; if not, you'll add a combined Session 12+13 entry at the end of this session.
4. `git log --oneline -20` — confirm the 14 commits from Sessions 1+2 are in place on `phase-7-6-numbers`. The most recent should be `1880496 fix(7.6.13)`.
5. `git status` — clean working tree (modified `docs/handover.md`, `docs/phases/upgrade-plan.md`, `logs/btd.log`, `package.json` zod addition, plus the untracked items from before are all user-side and can stay as-is).
6. `bash scripts/diagnose.sh` — confirm prod still green.
7. `npm test` — confirm all Session 1 + 2 specs still pass (should be 81 tests / 13 files).
8. `npx tsc --noEmit` — clean.
9. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq 'keys'` and same for `/s2`, `/s8`, `/genload` — refresh the data shape.
10. Read these files end-to-end before editing:
    - `app/components/PeakForecastCard.tsx`, `app/components/S1Card.tsx`, `app/components/SpreadCaptureCard.tsx` — for hour labelling (7.6.14)
    - `app/components/TradingEngineCard.tsx`, `app/components/S2Card.tsx` — for activation-rate methodology (7.6.15)
    - `app/components/SourceFooter` and any `toLocaleString`/`new Date(...)` site-wide — for timestamp normalisation (7.6.16)
11. Do NOT read `workers/fetch-s1.js` whole (8050+ lines after Session 1 fix). Grep for the specific functions you need.

Report state, pause for "go" before editing.

---

## 1. 7.6.14 — Hour labelling (S1 peak h0)

**Problem:** Peak Forecast card displays "Peak h0 / Trough hX." h0 = midnight UTC, which is 2am EET. Daily peak at 2am local is unusual for a Baltic market (peak is usually morning ramp ~7am or evening ~19h).

**Investigation steps:**
1. `app/components/PeakForecastCard.tsx:30-40` `computePeakTrough(hourly)` finds peak/trough by argmax/argmin of `hourly_lt[]`. Need to verify what timebase the hourly array uses.
2. Worker: grep `hourly_lt` in `workers/fetch-s1.js`. Find where the array is populated. ENTSO-E A65 returns hourly DA in UTC by default. If we're not converting to EET (UTC+2) for display, h0 in our chart is actually 2am EET → wrong label.
3. The S1Card sparkline / today-curve also uses `hourly_lt[]`; same potential issue.

**Fix:**
- If indices are UTC (most likely): either label as "h0 UTC" + "h0 EET" pair, OR convert to EET on the frontend so peak hour matches the locally-relevant time.
- Pick one rule globally: every "h{N}" reference uses EET (Baltic local time, UTC+2 winter / UTC+3 summer DST).
- A small helper `app/lib/hourLabels.ts` with `formatHourEET(utcHourIdx, dateIso)` would centralise this.

**Spec:** unit test on the hour-conversion helper. Given a UTC hour index 0 on a winter date, returns "h2 EET"; on a summer date (DST), returns "h3 EET". Edge: midnight crossover.

Commit: `fix(7.6.14): hour labels — UTC → EET, peak/trough match local market clock`.

---

## 2. 7.6.15 — Activation-rate methodology

**Problem:** Trading card shows ~49% activation rate. European aFRR markets typically run 20–40%; 49% is on the high side. Either a real Baltic specificity worth flagging or a definition mismatch.

**Investigation steps:**
1. `app/components/TradingEngineCard.tsx`: find where `data.reserves_detail.activation_rate_pct` is rendered.
2. Worker: grep `activation_rate_pct` in `workers/fetch-s1.js`. Find the formula. Activation rate is usually `(activated MWh) / (reserved MW × hours)`. Verify which numerator is being used:
   - Activated energy in MWh? (correct)
   - Number of activated ISPs / total ISPs? (different metric, often higher)
   - Activated capacity / total reserved capacity? (different again)
3. Cross-check with `/s2.activation` payload — what does each field semantically mean?

**Fix:**
- Document the methodology explicitly on the card. Surface a one-line caption: "Activation rate = activated MWh / (reserved MW × hours), Baltic aFRR up + down combined" (or whatever the actual formula is).
- If the formula is non-standard (e.g., per-ISP rather than per-MWh), keep it but rename the metric to something distinct from "activation rate" (e.g., "ISP hit rate" or "activation coverage").

**Spec:** unit test on the activation-rate calculation. Given a synthetic input (e.g., 100 MW reserved, 20 MWh activated over 24h), returns the documented percentage.

Commit: `fix(7.6.15): activation rate — explicit methodology on card`.

---

## 3. 7.6.16 — Timestamp normalisation site-wide

**Problem:** Mixed formats across the page per audit:
- `28h ago`
- `26 Apr 11:00`
- `Apr 26, 2026`
- `5 days ago`
- `2025-04`

Need ONE rule globally: relative for ≤24h, absolute UTC ISO8601 for >24h, always show timezone.

**Investigation steps:**
1. Grep every `toLocaleString`, `new Date(`, `formatRelativeTime`, `fmtDate`, `freshnessLabel` across `app/`. Catalogue every distinct format string.
2. Find the existing freshness helper (`app/lib/freshness.ts`) — that already has the `<1h LIVE / 1–6h RECENT / 6–24h TODAY / >24h STALE / >72h OUTDATED` ladder from F5-lite. Build on it.
3. The bare `toLocaleString` calls in cards (e.g., `S1Card`, `S2Card`, structural cards) need to route through one helper.

**Fix:**
- Extend `app/lib/freshness.ts` (or create `app/lib/timestamp.ts`) with `formatTimestamp(iso, now?)` that returns:
  - ≤24h: relative ("2h ago", "45 min ago")
  - >24h: absolute ISO8601 with timezone ("2026-04-25 14:30 UTC")
- Always show the timezone explicitly ("UTC" or "EET"). Pick one display timezone for absolute timestamps — recommend UTC for canonical machine-readable, but EET acceptable if it's annotated.
- Replace every site-wide `toLocaleString({...timeZone: 'UTC'})` call with the helper.

**Spec:** unit test on the formatter. Given a timestamp 2 hours ago, returns "2h ago". Given 25h ago, returns absolute UTC. Given exactly 24h, picks one rule (boundary case).

Commit: `fix(7.6.16): timestamp normalisation — single rule, single helper`.

---

## 4. Final verification + handover update + push

After 7.6.14–7.6.16 land:

```
npm test           # all specs green (will be ~85+ tests, 16 files)
npx tsc --noEmit   # clean
npx next build     # release gate, clean
```

**Visual sanity check:** `npm run dev`, load `localhost:3000`. Eyeball:
- Peak Forecast: peak hour now in EET (likely h7 or h19 not h0).
- S1Card sparkline: x-axis indices match local market clock if labelled.
- Trading: activation rate shows methodology caption.
- Source footers and timestamps: every "X ago" line uses the new formatter.
- All Session 1 + 2 fixes still rendering cleanly (FLEX FLEET, Project IRR, Peak-trough range, etc.).

**Handover.md update:**
Add `### Session 13 — 2026-04-26 (or current date) — Phase 7.6 Sessions 2 & 3 (Claude Code)` (or split into Session 12 + 13 if that's cleaner). Cover:
- All commits from Sessions 2 + 3 with hashes
- Each spec's name and what it covers
- The Session 2 finding that the Cowork-side audit revised Phase 7.7 down to 3 sessions
- Any anomalies discovered during 7.6.14/15/16 investigation
- Out-of-scope items not touched

Update the **What's queued** section at the top of handover.md: Phase 7.6 → done, branch ready for review/merge. Phase 7.7 (financial model exposure) and Phase 8 (design foundation) become parallel options for next phase.

**Optional but recommended:** strike the 7.6.0–7.6.16 checkboxes in `docs/phases/upgrade-plan.md` §2 Phase 7.6 to mark them complete.

**Push:** branch is already on `origin/phase-7-6-numbers` from Pause B. Push the new commits.

```
git push
```

**Stop here.** Branch ready for user review. Do NOT open a PR — that's user's call per protocol. Report the final commit count, total test count, and the handover entry to Kastytis.

---

## 5. If budget gets tight (>80% context) before all three items land

Stop at the most recent clean commit. Write a continuation prompt at `docs/phases/phase7-6-prompt-v3.md` covering:
- Which 7.6.* items in this session are done (with commit hashes)
- Which are still pending
- Same hard stops as below

Commit the v3 prompt. Push. Hand back.

---

## 6. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- No scope creep beyond 7.6.14 + 7.6.15 + 7.6.16 in this session.
- **Worker changes are allowed** if a fix requires it (7.6.14 might if hour conversion needs to be worker-side; 7.6.15 might if activation-rate formula is wrong). Deploy via `wrangler deploy` from `workers/` and verify `/s1 /s2 /s8 /genload` still return 200 with sensible payloads. If a worker change breaks production, revert immediately.
- No new dependencies beyond what Sessions 1 + 2 already added (Vitest, zod). If you genuinely need a date-fns or similar library for timezone handling, prefer Intl.DateTimeFormat first.
- Skip 7.6.12 — F5-lite already shipped it.
- Each fix is a separate commit. No mega-commits.
- The pre-existing lint errors in `workers/fetch-s1.js` are out of scope. `npx next build` is the release gate; ignore `npm run lint` noise.
- **Do not modify `docs/handover.md` mid-session — accumulate findings in your context and write them all in one entry at the end.** This avoids merge conflicts with any user edits to the file.
- **Do not modify `docs/phases/upgrade-plan.md` content** beyond the optional checkbox-strike for 7.6.* completion. The user owns this file (P7 lock edit landed during Session 1).
- If you're tempted to refactor adjacent code while fixing a bug: don't. Note it as a follow-up, fix the bug, ship.
- Numerical reconciliation REQUIRES a unit test per fix. The audit's closing point — "credibility compounds; first error discounts everything else by 30%" — means we don't ship reconciliation work that itself has math errors.

---

## 7. After Session 3 ships

Phase 7.6 branch is ready for merge. Next phases (per Cowork-side note in Session 11 handover):
- **Phase 7.7 — Financial model exposure** (estimate revised down from 4 sessions to 3 because `/revenue` engine is far richer than originally scoped — `project_irr`, `equity_irr`, `min_dscr`, `min_dscr_conservative`, `worst_month_dscr`, bankability, 13-month backtest, ch_benchmark, eu_ranking, all_scenarios all already exist on the worker; most of Phase 7.7 is binding existing engine output to cards).
- **Phase 8 — Foundation Sprint** (design tokens, typography, primitives, microbrand) — the keystone phase per `docs/phases/upgrade-plan.md` §2.

Either can go first. Decision deferred to user based on which has the cleaner kickoff.
