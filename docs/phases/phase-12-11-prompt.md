# Phase 12.11 — P0 functional bug reconciliation

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~1–2 days, single PR, three pause points (Pause A discovery, Pause B foundation, Pause C pre-commit). Frontend-mostly with possible 1–2 metric-registry additions; no worker deploy expected.

**Operator framing:** audit-v2 P0 list (~7 items) was empirically validated 2026-05-06 via operator screenshot triangulation. Visible bugs include same-page contradictions (822 MW Flex Fleet vs 651 MW BESS installed), same-metric-different-precision (AFRR €8 / €7.96 / €13.5 across three locations), freshness-chip semantic drift ("TODAY" displayed next to "13h ago" timestamp), and unit/scope collisions (DISPATCH €/MW vs €/MW/DAY). These are credibility-breaking to a sharp visitor (TSO planner, IPP CIO) — visitors can see contradictions on a single viewport without leaving the screen.

This phase does **NOT** rewrite the engine. Most fixes are display disambiguation + label discipline + freshness logic tuning. The engine already separates the conflicting metrics in `app/lib/fleet.ts` and `app/lib/metricRegistry.ts`; the bug is in how the display surfaces them.

---

## What ships

**Eight bug fixes, single PR, scoped to verified-from-screenshot list.** Code-grep audit done Cowork-side 2026-05-06; canonical-field hints baked into §0 below.

1. **Fleet 822 vs 651 disambiguation** (audit P0 #4) — both labels need scope disclosure. Currently both render as "[Baltic] [BESS|Flex Fleet] [installed|operational]" without telling the reader that 822 MW includes pumped hydro (Kruonis 205 MW) while 651 MW excludes it. Fix: amend display labels to make scope explicit.

2. **AFRR precision standardization** (audit P0, "AFRR triple-label") — header `SignalBar.tsx:51-52` `Math.round(afrr_up_avg)` rounds 7.96 → 8; bottom marquee `HeroBalticMap.tsx:296` `formatTickerItem('afrr', 'AFRR', afrr_up_avg, 2)` shows 7.96. Same field, two precisions, looks like two values. Fix: standardize on 2-decimal precision in both surfaces; canonical AFRR price field declared in metric registry.

3. **Freshness "TODAY" chip semantic fix** (audit P0 #6) — `app/lib/freshness.ts:96` boundary is `hoursStale < 24` → TODAY. Per discipline rule #2 (no-hardcoded-temporal-label), this fires "TODAY" for any timestamp <24h regardless of calendar day. At 12:33 UTC, a 13h-ago timestamp is yesterday-23:33 UTC = yesterday's data. Reads wrong. Fix per Pause A operator decision: redefine TODAY → calendar-today-in-EET, OR rename TODAY → "≤24h", OR drop TODAY chip entirely and rely on relative `Xh ago`.

4. **DISPATCH unit collision** (audit-v2 visible) — header marquee shows "DISPATCH €376/MW" while hero card shows "€346/MW/DAY"; different units, different scopes (capture vs daily revenue), but the labels read like the same metric. Fix: header label should disambiguate (e.g., "DA CAPTURE €/MWh" vs "DISPATCH €/MW/DAY") AND units should be displayed.

5. **COD alias cleanup** (audit P0 #3) — `app/lib/__tests__/sensitivity.test.ts:54` still references `COD 2027`; live display shows `COD 2028`. Grep for stragglers; remove dead `COD 2027` references in non-test code; either retire the test or update assertion to match current canonical year.

6. **CAPEX low/high tornado consistency** (audit P0 #1) — `RevenueSensitivityTornado.tsx:136` shows "Base: mid CAPEX · COD 2028 · base scenario". Verify the bar values match `data.scenario`-derived numbers and `data.capex_eur_kwh` reference. If the tornado bars label "CAPEX low" / "CAPEX high" but the absolute numbers come from a different scenario, that's the audit's #1 finding.

7. **LV/EE empty cells display** (audit P0 #5, partly known — Phase 29.1 deferred) — BalticStorageIndexCard shows blank cells where `coverage_status` is `pending_phase_29_1`. Verify the displayed message is operator-honest ("LV/EE pending Phase 29.1 — engine extension queued") rather than blank-without-explanation.

8. **Intel feed freshness** (audit P0 #7) — visitor screenshot showed S2's data block ages and intel items aging weeks. Verify `app/components/IntelFeed.tsx` filters or visibly downgrades items > 30 days old. If intel hasn't refreshed in 30+ days, quarantine flag should fire.

`model_version` does NOT bump (no engine logic change). Worker deploy not expected unless §1 surfaces a metric-registry hint that warrants a worker-side companion field for proper labeling — flag at Pause A if so.

---

## OUT of scope

- Engine math changes (computeRevenueV7, balancing model, fleet trajectory)
- Worker endpoint additions (frame any required signal as "verify exists" not "build new")
- Mobile / responsive design (Phase 18.1)
- Chart polish (Phase 18.2)
- Schema validation gates (Phase 12.12 #1+#2 — separate phase)
- Bigger structural rebuilds (Tier 2 chapter restructure, Tier 3 hero composed-viz)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- New primitives (Phase 7.7g-b reduced)
- Additional spacing residuals (Phase 7.7g-a-3)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #2 no-hardcoded-temporal-label, #4 cross-card consistency, #6 no-editorial-state-label)
2. `docs/handover.md` Sessions 42 (Phase 18), 43 (Phase 7.7g-a-2)
3. `docs/phases/_post-12-8-roadmap.md` "Phase 12.11" entry — roadmap source-of-truth for scope
4. `app/lib/fleet.ts:1-18` — already documents the 822 vs 651 reconciliation as a KNOWN problem with comment "Same surface MUST NOT show one as 'operational MW' and another as 'operational MW' — that's the audit's #4 reconciliation finding"
5. `app/lib/metricRegistry.ts` — canonical field declarations including `baltic_flexibility_fleet_mw` (822), `baltic_bess_installed_total` (651), `installed_storage_lt_mw` / `_lv_mw` / `_ee_mw`
6. `app/lib/freshness.ts:77-101` — current freshness boundaries (LIVE <1h, RECENT <6h, TODAY <24h, STALE <72h, OUTDATED ≥72h)

Memory references (Cowork-side):
- `project_audit_v2_gaps.md` — comprehensive 2026-05-06 audit; this phase tackles the P0 subset
- `feedback_cowork_sandbox_limits.md` — recurring-error notes; vitest + next build core-dump in Cowork (run on Mac), tsc + eslint reliable
- `feedback_pr_workflow_minimal.md` — operator workflow: open PR + click merge; no PR body, no branch delete

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at `5fd2ca4` (Phase 7.7g-a-2 merge) or later. State understanding (one paragraph). Wait for "proceed".

### Canonical-field hints (Cowork-grepped 2026-05-06; verify before scoping)

| Bug | Display sites (file:line) | Canonical field | Reconciliation |
|---|---|---|---|
| #1 fleet 822 vs 651 | `HeroBalticMap.tsx:768` ("BALTIC FLEX FLEET"), `SignalBar.tsx:62` ("FLEX FLEET"), `S4Card.tsx:385` ("Baltic BESS installed (TSO-tracked)") | `baltic_flexibility_fleet_mw` (822, BESS+pumped) ≠ `baltic_bess_installed_total` (651, BESS-only) | Two different real metrics; labels need scope disclosure, not engine fix |
| #2 AFRR header rounds | `SignalBar.tsx:51-52` `Math.round(data.s2.afrr_up_avg)` = 8 | `s2.afrr_up_avg` (= 7.96 €/MW/h) | Header should `.toFixed(2)` like marquee at `HeroBalticMap.tsx:296` |
| #3 TODAY at 13h | `freshness.ts:96` `hoursStale < 24` → 'TODAY'; consumed by S1Card, S2Card, S5Card, S6Card, etc. via `freshnessLabel()` | `(Date.now() - ts) / 3_600_000` raw-hour bucket | Operator decides at Pause A: calendar-today-in-EET vs rename ≤24h vs drop |
| #4 dispatch unit | `HeroBalticMap.tsx:719` "/MW/DAY" + header marquee value | revenue per MW per day vs DA capture per MWh | Header label needs unit + metric-name disambiguation |
| #5 COD alias | Test `app/lib/__tests__/sensitivity.test.ts:54` references `COD 2027`; live shows 2028 | `data.cod_year` from `/revenue` | Grep `COD 2027` for stragglers; align test or kill it |
| #6 CAPEX tornado | `RevenueSensitivityTornado.tsx:136` ("Base: mid CAPEX · COD 2028") | sensitivity bars input `data.scenario` + `data.capex_eur_kwh` | Verify bars labeled "low/high" pull the matching scenario absolute numbers |
| #7 LV/EE blanks | `BalticStorageIndexCard.tsx` (Phase 29) | `coverage_status: 'pending_phase_29_1'` | Display message must be operator-honest |
| #8 intel staleness | `IntelFeed.tsx` | item-age threshold + quarantine flag | Verify >30d items either filtered or visibly downgraded |

These hints are starting points. Per discipline rule #1 (audit-triage), re-verify each via grep + screenshot before scoping the fix. The operator's earlier audit-v2 was visual-inference; the Cowork screenshot triangulation 2026-05-06 elevated it to primary-source-with-citation. Don't trust either alone — confirm with code-grep at Pause A.

---

## 1. Branch + baseline

```bash
git checkout -b phase-12-11-p0-bug-reconciliation
npx tsc --noEmit       # 0 errors
npx vitest run          # 919 baseline (post-Phase-7.7g-a-2)
npm run lint            # 126 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. Pre-commit must match (with explained delta if any test count changes — likely +1-3 per metric registry assertion if §3 adds a new canonical field).

---

## 2. Pause A — Discovery + scope confirmation

Per discipline rule #1 (audit-triage), re-verify each bug claim before scoping:

### 2a. Fleet 822 vs 651

```bash
grep -nE "BALTIC FLEX FLEET|Baltic Flex Fleet|Flex Fleet|FLEX FLEET" app/components/
grep -nE "BESS installed|bess_installed|baltic_bess_installed" app/components/ app/lib/
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | jq '{fleet:.fleet, baltic_total:.baltic_total}'
```

Confirm:
- Hero shows `flexibility_fleet_mw` (822, BESS+pumped) — that's the right field for "FLEX FLEET" label
- S4 / Build conditions show `bess_installed_mw` (651, BESS-only) — that's the right field for "BESS installed (TSO-tracked)" label
- The two ARE different metrics — fix is **display label disambiguation**, not engine reconciliation

Propose label changes. Operator decides at Pause A. Likely shape:
- Hero "BALTIC FLEX FLEET" → "BALTIC FLEX FLEET" with subscript "(BESS + pumped hydro)" or footnote anchor
- Header marquee "FLEX FLEET 822 MW" → "FLEX FLEET 822 MW" with the disclosure visible in the per-card-mouseover tooltip (already? verify)
- S4 "Baltic BESS installed (TSO-tracked) 651 MW" — already explicit, keep

If ambiguity persists across surfaces, propose a metric-registry assertion that flags any same-page rendering of both 822 and 651 without disambiguating subscript.

### 2b. AFRR precision

```bash
grep -nE "afrr_up_avg|afrr_clearing|formatTickerItem.*afrr|AFRR" app/components/
```

Confirm:
- `SignalBar.tsx:51-52` rounds via `Math.round(data.s2.afrr_up_avg)` → 8 (incorrectly imprecise)
- `HeroBalticMap.tsx:296` uses `formatTickerItem('afrr', 'AFRR', s2.afrr_up_avg, 2)` → 7.96 (correct)
- S2 hero `S2Card.tsx:241` is up+down combined P50 (different field); already disclosed honestly

Fix: change `SignalBar.tsx:52` to `data.s2.afrr_up_avg.toFixed(2)` instead of `Math.round(data.s2.afrr_up_avg)`. Verify result on production: 7.96 should appear in both header and bottom marquee.

### 2c. Freshness boundary

```bash
grep -nE "freshnessLabel|hoursStale|TODAY" app/lib/freshness.ts app/components/
```

Read `app/lib/freshness.ts:77-101` end-to-end. Current logic is hours-since-update. Operator must decide:

**Option A — Calendar-today-in-EET:**
```ts
const updatedDate = new Date(ts);
const nowDate = new Date();
const sameCalendarDay =
  updatedDate.toLocaleDateString('en-LT', { timeZone: 'Europe/Vilnius' }) ===
  nowDate.toLocaleDateString('en-LT', { timeZone: 'Europe/Vilnius' });
if (sameCalendarDay && hoursStale < 12) label = 'TODAY';
else if (hoursStale < 6) label = 'RECENT';
// etc.
```

**Option B — Rename TODAY → "≤24h":**
Drop the "TODAY" string; show only relative `Xh ago` for items 6-24h old. RECENT bucket extends to <6h; STALE bucket starts at 24h.

**Option C — Drop TODAY chip entirely:**
Show only the relative age and the absolute timestamp. No editorial chip.

Operator picks. Recommend Option A (calendar-today-in-EET) — preserves the chip semantic while making it match user expectation. Add Vitest spec: `freshnessLabel(yesterday-23:33-UTC, now-12:33-UTC)` returns NOT 'TODAY'.

### 2d. DISPATCH unit collision

```bash
grep -nE "DISPATCH|/MW/DAY|/MW/h|capture.*mwh|revenue.*mw.*day" app/components/HeroBalticMap.tsx app/components/SignalBar.tsx
```

Identify:
- Where header `DISPATCH €376/MW` is rendered (likely SignalBar or top KPI row) — what field?
- Where hero `€346/MW/DAY` is rendered (HeroMarketNow or HeroBalticMap) — what field?
- Are they the same metric with units missing in one, or genuinely different?

Per the audit, header should display unit + canonical metric name. If both surfaces use the same field, header should match hero's unit (`/MW/DAY`). If they're different fields (capture vs net daily revenue), label one as "CAPTURE €/MWh" and the other as "DISPATCH €/MW/DAY".

### 2e. COD alias straggler check

```bash
grep -rEn "COD 2027|cod_year.*2027|cod.*=.*2027" app/ workers/
```

Expected: live code path uses `data.cod_year` from `/revenue`; if any hardcoded `'COD 2027'` strings remain in non-test code, those are stragglers from the 2027→2028 transition. Test `sensitivity.test.ts:54` references COD 2027 — either retire or update.

### 2f. CAPEX tornado consistency

```bash
grep -nE "CAPEX low|CAPEX high|capex_low|capex_high" app/components/RevenueSensitivityTornado.tsx
```

Read the component end-to-end. Verify each bar label matches the absolute number derived from `data.capex_eur_kwh` ± scenario delta. If "CAPEX low" bar shows a number that's actually pulled from `mid_capex` scenario, that's the audit P0 #1 finding. Document at Pause A.

### 2g. LV/EE empty cells

```bash
grep -nE "coverage_status|pending_phase_29_1" app/components/BalticStorageIndexCard.tsx
```

Read the rendering branch when `coverage_status === 'pending_phase_29_1'`. Verify the displayed message is operator-honest ("LV/EE pending Phase 29.1 engine extension") not silent blank cells.

### 2h. Intel feed staleness

```bash
grep -nE "30 day|30d|month|stale|quarantine|published_at" app/components/IntelFeed.tsx
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | jq '.items[0:3] | .[] | {id, published_at, source}'
```

Verify:
- Items > 30 days old are filtered, downgraded, or labeled "archived"
- If the freshest item is > 30 days old, that's a feed-source freshness problem (Phase 12.12 #3 territory) — file as a follow-up not in 12.11 scope

### Pause A report

Halt + report:

1. Per-bug verification status: **VERIFIED** (matches §0 hints) / **REFINED** (different field/scope than expected — describe) / **NOT REPRODUCIBLE** (claim doesn't match current code; per discipline rule #1, downgrade to deferred)
2. Per-bug fix proposal: minimal display-label change vs metric-registry addition vs deeper refactor
3. Operator decisions needed:
   - Bug #3 freshness: which option (A / B / C)
   - Bug #1 fleet: subscript vs footnote vs tooltip-only disclosure
   - Bug #4 dispatch: same-field-display-fix vs different-fields-label-fix
   - Bug #6 CAPEX: scope of tornado-label fix
4. Refined estimate vs prompt's ~1-2 days
5. Worker-deploy needed? (default: no; flag if Pause A surfaces a registry-companion field that requires worker-side computation)

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes per-bug. Suggested order (lowest blast radius → highest):

1. **#5 COD alias** (test fix or string remove — trivial)
2. **#2 AFRR precision** (1-line change in `SignalBar.tsx:52`)
3. **#7 LV/EE display message** (BalticStorageIndexCard branch fix)
4. **#1 fleet labels** (label edits across HeroBalticMap, SignalBar, S4Card)
5. **#4 DISPATCH unit** (header label + unit clarification)
6. **#3 freshness logic** (per Pause A option, in `app/lib/freshness.ts` + new Vitest spec)
7. **#8 intel feed staleness** (IntelFeed component + filter logic)
8. **#6 CAPEX tornado** (RevenueSensitivityTornado component, possibly with sensitivity.ts refactor)

For each fix:
- Read the file end-to-end first (don't grep+sed)
- Apply minimal edit aligned with operator's Pause-A decision
- Add Vitest spec where logic-tested (especially #3 freshness, #6 CAPEX)
- Verify no other consumer site silently breaks (grep new label strings to ensure consistency)

### Cross-card consistency check (discipline rule #4)

After all fixes, run:

```bash
npm run test  # confirm 919 + new specs pass
grep -nE "FLEX FLEET|BESS installed" app/components/ | sort  # all labels disclose scope
grep -nE "afrr_up_avg" app/components/ | sort                # all sites use 2-decimal precision
```

If any same-metric inconsistency remains, surface in handover for Phase 12.12 #5 cross-card consistency CI test to enforce.

---

## 4. Pause B — Foundation gates

Run all gates:

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 919 + N new (per fix-spec count)
npm run lint            # 126 baseline (or +/- per linting impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Halt + report:
- Per-bug status: FIXED / DEFERRED-with-reason / NOT-REPRODUCIBLE
- Test count delta + which spec covers what
- Bundle size delta (expected near-zero — label edits + boundary tweak)
- Any worker fields needed (default: none; if so, file Phase 12.11.1 worker-side companion follow-up)

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual verification + commits

### 5a. Visual audit

Capture screenshots at `docs/visual-audit/phase-12-11/`:
- Hero in dark + light (zoom on FLEX FLEET label)
- Header KPI row (zoom on AFRR + DISPATCH)
- S1 / S2 cards (freshness chips)
- BalticStorageIndexCard (LV/EE row)
- RevenueSensitivityTornado
- IntelFeed (top 3 items + age labels)

For each, confirm the audit-v2 P0 issue is no longer visible.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git switch -c phase-12-11-p0-bug-reconciliation  # if not already on branch
git add app/lib/fleet.ts app/lib/freshness.ts app/lib/__tests__/freshness.test.ts
git commit -m "phase-12-11(logic): freshness boundary tuning + fleet-metric label discipline"

git add app/components/SignalBar.tsx app/components/HeroBalticMap.tsx app/components/S4Card.tsx app/components/S1Card.tsx app/components/RevenueSensitivityTornado.tsx app/components/BalticStorageIndexCard.tsx app/components/IntelFeed.tsx
git commit -m "phase-12-11(displays): AFRR precision + dispatch units + fleet labels + LV/EE honest message + intel freshness filter + CAPEX tornado consistency"

git add docs/handover.md docs/visual-audit/phase-12-11/
git commit -m "phase-12-11(handover): Session 44 + visual audit captures"

git push -u origin phase-12-11-p0-bug-reconciliation
```

(Adjust file groupings per actual touched set.)

Print PR-creation URL. Per `feedback_pr_workflow_minimal.md`, operator opens PR + click-merge directly; no PR body draft needed.

---

## 6. Handover Session 44

Mirror Session 43 structure. Specific items:
- Headline: P0 bug reconciliation; N bugs fixed across N components; freshness boundary tuned per Option (A/B/C); cross-card consistency improved
- Branch + base
- Pause A audit results (per-bug VERIFIED / REFINED / NOT-REPRODUCIBLE table)
- Pause B verification gates (paste actual numbers)
- Per-bug fix description + canonical-field reference
- Bundle size delta (expected near-zero)
- Worker-side companion fields needed (if any) → Phase 12.11.1 follow-up
- Cross-card consistency findings → input for Phase 12.12 #5 CI test
- Intel feed source freshness findings (if >30d items found) → input for Phase 12.12 #3
- Out of scope reminder
- Tier 1 sequence: 12.11 ✅ → next operator-pick across (18.1 / 18.2 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced)
- Next operator action: open PR via web UI; merge; hard-refresh

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 12.11 → Shipped appendix
- Currently-active update: 12.11 SHIPPED; next CC across (18.1 / 18.2 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b reduced)
- If Phase 12.11.1 worker-side companion needed, add to Tier 1
- If Phase 12.12 #5 cross-card CI gate has new candidate metrics surfaced, append to its scope notes

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** §0 hints are Cowork-grepped 2026-05-06 but each bug must be re-verified before scoping. If a bug is not reproducible, downgrade to deferred and report via handover. Don't ship a fix for a bug that isn't there.
- **Discipline rule #2** for Bug #3 (freshness): the "TODAY" label was hardcoded by hours-bucket logic — exactly the case rule #2 was earned for (Phase 12.10 PeakForecastCard slice-idx → UTC clock-hour fix). Compute calendar-today properly OR rename the bucket.
- **Discipline rule #4** is the load-bearing one for #1 (fleet 822 vs 651) and #2 (AFRR precision). Both surfaces of the same metric must agree; if not, fix at the metric-registry layer (declared canonical) not at each render site.
- **Discipline rule #6** (no-editorial-chips) — when fixing freshness chips per #3, ensure replacement labels are quantitative ("≤24h", "13h ago") not editorial ("STABLE", "FRESH"). Run `npm run lint:no-editorial-chips` to confirm.
- **Out-of-scope drift risk:** the audit-v2 has 41 items P0-P5; this phase scopes 8 P0-only. If Pause A discovers additional bugs visible-but-not-listed, surface in handover but do NOT silently extend scope (operator must approve).

End of prompt.
