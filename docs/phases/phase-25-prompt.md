# Phase 25 — P0 hot-fix + audit-3 credibility-disclosure pass

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~1.5–2 hours, single PR, three pause points (Pause A discovery + scope confirmation, Pause B foundation gates + local-build smoke-test + chrome MCP visual verification, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** Audit-3 pasted 2026-05-08 surfaced one P0 visible bug + several credibility-disclosure gaps. Cowork chrome-MCP empirical verification 2026-05-08 confirmed:

- ✅ **Right-rail clipping at 1066-1100px viewport** — €378 hero number container at `left:937 → right:1163` overflows **97px past viewport edge** at 1066px width. First-viewport visible bug; affects common laptop sizes between mobile-collapse (<900px) and full-desktop (≥1200px).
- ❌ £ currency in IRR sensitivity chart — NOT REPRODUCIBLE (zero £ matches in body or SVG text)
- ⚠️ S/D 1.81× math — formula IS internally consistent: `(operational + 0.5 × pipeline) / demand` = `(822 + 541.5) / 752` = 1.813. Auditor's complaint "doesn't reconcile from displayed inputs" is correct as a credibility-disclosure gap, not an arithmetic bug.
- ❌ Theme toggle "doesn't clearly toggle" — NOT REPRODUCIBLE (toggle works `dark→light` cleanly; minor a11y issue: aria-label doesn't update on flip)

This phase ships the P0 right-rail clipping fix + a small editorial sweep to close the credibility-disclosure gaps (S/D formula on card, 651/822 footnote, "investable" pill rule-#6 fix, number formatting consistency, base-definition for delta chips, dispatch card copy de-dup, theme-toggle aria-label). All small fixes; single PR.

---

## What ships

8 sub-items, single PR, frontend-only.

**(1) Right-rail clipping fix** (~30-45 min) — `HeroBalticMap.tsx:357` grid template `minmax(260px, 300px) minmax(540px, 620px) minmax(260px, 300px)` requires ≥1060px to fit; at 1066-1100px viewports the grid items overflow 97px+ past the viewport edge. Phase 18.1 set hero collapse at `<900px`; the 900-1100px range is the awkward middle.

Fix options at Pause A:
- (A) **Raise hero collapse breakpoint** from `<900px` to `<1100px` (or `<1180px`) — single-col stack triggers at slightly higher viewport. Cheap; same pattern as 18.1.
- (B) **Auditor's pattern**: fix right rail at 320-360px, let map column flex with `min-width:0; overflow:hidden`. Different responsive strategy; allows 3-col layout to compress at 900-1100px instead of overflowing.
- (C) **Hybrid**: raise breakpoint to `<1080px` AND tighten the right-rail max-width — reduces collision at boundary viewport.

Recommend (A) for cleanest mental model; minimal change. (B) preserves more visual content at narrower desktops but introduces a new responsive pattern. Operator-pick at Pause A.

**(2) S/D ratio formula disclosure** (~10-15 min) — find where the S/D `1.81×` chip renders (`HeroBalticMap.tsx` baltic flex fleet block + `SignalBar.tsx` ticker). Add inline formula disclosure OR tooltip OR methodology-drawer link surfacing `(operational + 50% pipeline) / demand` — closes auditor's "doesn't reconcile from displayed inputs" gap. Per discipline rule #2 (no-hardcoded-temporal-label) — labels asserting derived values must surface their derivation.

**(3) 651 vs 822 MW Kruonis footnote** (~10-15 min) — auditor's claim verified via `app/lib/fleet.ts:1-18` known-comment: 822 = `flexibility_fleet_mw` (BESS + pumped hydro per `_fleet/entries` KV) vs 651 = `bess_installed_mw` (BESS-only TSO registry). The 171 MW difference is Kruonis flex-allocated share. Currently Phase 21 added "(BESS + pumped hydro)" subscript on the 822 hero; this phase adds the explicit arithmetic explainer footnote: `Flex fleet 822 MW = TSO-tracked BESS (651 MW) + Kruonis flex-allocated share (171 MW)`. Choose anchor location at Pause A — likely below the FLEX FLEET tile in HeroBalticMap.

**(4) "Investable" pill rule-#6 fix** (~15-20 min) — find the "investable" pill near 14.8% IRR display (likely `RevenueCard.tsx`). Replace with one of:
- (A) Explicit threshold disclosure: `≥14% IRR · investable` with the threshold visible
- (B) Quantitative micro-descriptor: `+0.8pp / hurdle` or similar
- (C) Methodology link: pill becomes clickable → opens methodology drawer

Operator-pick at Pause A. Same lesson as Phase 21's THICK chip; rule #6 (no editorial chips) territory.

**(5) Number formatting consistency** (~30-45 min) — auditor caught "€20400/day" missing thousands separator vs "€141,985/MW/yr" with one. Cross-card consistency rule #4 violation. Sweep all number renderers (`app/lib/format.ts` likely centralizes formatNumber/formatEur/etc.) and verify EU thousands separator is applied uniformly. Either: (a) update all currency renderers to use comma separator (`€20,400`) or (b) update all to use EU dot separator (`€20.400`). Operator-pick locale convention at Pause A.

**(6) "↓23% vs base" base-definition** (~15-20 min) — find where the `↓23% vs base` delta chip renders on RevenueCard hero. "base" is currently undefined to the reader. Add inline tooltip OR small text disclosing what "base" means (likely 30-day trailing average OR forward expectation OR annual average). Per rule #2 (no-hardcoded-temporal-label, broad spirit).

**(7) Dispatch card copy de-dup** (~5-10 min) — auditor flagged that "DISPATCH INTELLIGENCE — How the KKME dispatch algorithm allocates a 50 MW reference BESS across Baltic balancing and arbitrage." appears verbatim above the section title that says the same thing. Find duplicate text in TradingEngineCard.tsx or DispatchCard component; remove redundancy.

**(8) Theme toggle aria-label updates** (~5-10 min) — `ThemeToggle.tsx` aria-label currently says "Switch to light theme" even after toggling to light. Should flip to "Switch to dark theme" when in light mode. Small a11y improvement (deferred from Phase 19 per Pause A scope).

`model_version` does NOT bump. No worker, no engine. Frontend-only.

---

## OUT of scope

- Engine / worker changes
- Deeper editorial passes (provenance label on every numeric claim, tone consistency, etc.) — Phase 19/20+ territory
- Color palette retune (Phase 18.2.1)
- Card height consistency (Phase 7.7g-b primitives)
- Email subscription / RSS / API (Phase 26)
- Project fleet tracker drilldown (Phase 27)
- Cross-border flow → spread analytics (Phase 28)
- LV↔LT B-006 flow display (separate)
- True vector logo (Cowork-side design)
- Search command palette
- Date/time-zone consistency sweep (separate)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #2 no-hardcoded-temporal-label, #4 cross-card consistency, #6 no-editorial-state-label)
2. `docs/handover.md` Sessions 50-53 (recent context)
3. `docs/phases/_post-12-8-roadmap.md` — Phase 25 entry under Currently-active
4. `app/components/HeroBalticMap.tsx:357` — current 3-col grid template (root cause of #1)
5. `app/components/SignalBar.tsx` — sticky KPI ticker (S/D ratio chip rendering)
6. `app/lib/fleet.ts:1-18` — known comment about 822 vs 651 metric distinction
7. `app/components/RevenueCard.tsx` — "investable" pill + IRR display + base-delta chip
8. `app/lib/format.ts` (or wherever number formatting helpers live) — for sub-item 5
9. `app/components/TradingEngineCard.tsx` (or DispatchCard) — for sub-item 7
10. `app/components/ThemeToggle.tsx` — for sub-item 8

Memory references (Cowork-side):
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Pause B local-build smoke-test gate REQUIRED for any phase touching layout breakpoints + bundle composition; Phase 18.1.1 ChunkLoadError lesson
- **`feedback_chrome_mcp_orphans.md`** — chrome MCP gate restored 2026-05-07 via `cc` alias; should work cleanly for Pause B visual verification
- `feedback_tailwind_v4_silent_drop.md` — hoist new @media rules into fresh blocks
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -10
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-18.1.3-merge commit. State understanding (one paragraph): plan for §1 + §2 + §3, especially the right-rail clipping fix approach (A/B/C). Wait for "proceed".

### Cowork-grepped baseline + verification (audit-3 + chrome MCP 2026-05-08)

| Concern | Verified | Action |
|---|---|---|
| Right-rail clipping at 1066px | ✅ €378 overflows 97px | Sub-item 1 |
| £ currency in IRR sensitivity | ❌ Zero matches | NOT REPRODUCIBLE; skip |
| S/D 1.81× math | ⚠️ Formula `(822 + 0.5×1083) / 752` = 1.813; not disclosed | Sub-item 2 (disclosure, not arithmetic) |
| 651 vs 822 fleet metric | ⚠️ Difference = Kruonis 171 MW | Sub-item 3 (footnote explainer) |
| Theme toggle works | ✅ dark↔light flip works | Sub-item 8 (aria-label only) |
| Fleet baseline values | `baltic_operational_mw: 822, baltic_pipeline_mw: 1083, eff_demand_mw: 752, baltic_total.installed_mw: 651` | Confirmed via /s4 curl |

---

## 1. Branch + baseline

```bash
git checkout -b phase-25-credibility-disclosure-pass
npx tsc --noEmit       # 0 errors
npx vitest run          # 925/925 baseline (post-18.1.3)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers.

---

## 2. Pause A — Discovery + scope confirmation

### 2a. Right-rail clipping reproduction

```bash
# If chrome MCP available (cc alias should restore the gate):
# Open localhost:3000 at 1066px viewport
# Verify €378 hero element extends past viewport.right
# OR run JS in chrome-devtools-mcp:
# document.querySelectorAll('*').forEach... bounding-rect check for overflow
```

If chrome MCP fails (alias regression): curl-only verification is acceptable; Cowork already empirically verified at 1066px; trust the empirical result.

### 2b. Hero grid template current state

```bash
sed -n '350,375p' app/components/HeroBalticMap.tsx
```

Confirm:
- Grid template `minmax(260px, 300px) minmax(540px, 620px) minmax(260px, 300px)` requires ≥1060px
- Phase 18.1 collapse breakpoint at `<900px`
- The 900-1100px range is unaddressed

Propose pick (A)/(B)/(C) at Pause A based on the visual cost-benefit:
- (A) Cheap: raise breakpoint to `<1100px`. Single-col stack triggers earlier; visitors at common 1066px laptops see mobile-stack instead of broken-3col. Trade-off: less use of horizontal space at desktops 1100-1200px.
- (B) Auditor's: fix right rail width + flex map. Preserves 3-col at 900-1100px range. New responsive pattern.
- (C) Hybrid.

### 2c. S/D chip render sites

```bash
grep -rnE "sd_ratio|S/D RATIO|1\.81|sd-ratio" app/components/ app/lib/
```

Identify all surfaces. Phase 12.9's S/D RATIO migration moved consumers to `s4.fleet.sd_ratio`. Find the chip-render site for the disclosure addition.

### 2d. "Investable" pill location

```bash
grep -rnE "investable|Investable|INVESTABLE" app/components/ | head -10
```

Identify pill-render site. Read context to understand:
- Is the pill driven by a quantitative threshold (e.g., `irr >= 0.14 ? 'investable' : 'below_hurdle'`)?
- If so, the threshold (0.14) is the right disclosure value.
- Per rule #6, surface the threshold or quantitative micro-descriptor.

### 2e. Number-formatting site audit

```bash
grep -nE "fmtEuro|fmtEur|formatEur|formatNumber" app/lib/format.ts 2>/dev/null
grep -rnE "€\$\{|€\\$\{|toLocaleString|Intl\.NumberFormat" app/components/ app/lib/ | head -20
```

Identify centralized vs ad-hoc number formatting. Propose: standardize via existing `format.ts` helpers; sweep ad-hoc sites to consume helpers.

### 2f. "vs base" delta chip location

```bash
grep -rnE "vs base|vs\\s*base|↓.*%.*vs|↑.*%.*vs" app/components/
```

Identify chip render. Define what "base" means (likely `30d trailing` per the chart period).

### 2g. Dispatch card duplicate copy

```bash
grep -nE "DISPATCH INTELLIGENCE|dispatch algorithm" app/components/
```

Identify duplicate text site.

### 2h. ThemeToggle aria-label update

```bash
sed -n '1,80p' app/components/ThemeToggle.tsx
```

Verify aria-label is hardcoded "Switch to light theme" instead of derived from current theme state. Propose: derive aria-label from theme prop/state.

### Pause A report

Halt + report:

1. **Per-sub-item verification** — current location + proposed fix shape
2. **Sub-item 1 pick** — (A) raise breakpoint OR (B) auditor's right-rail-fixed pattern OR (C) hybrid
3. **Sub-item 4 "investable" pick** — (A) threshold disclosure OR (B) micro-descriptor OR (C) methodology link
4. **Sub-item 5 number-format pick** — (a) `€20,400` (comma) OR (b) `€20.400` (EU dot)
5. **Sub-item 8 theme-toggle aria-label** — confirm small fix; defer larger a11y work to Phase 19
6. **Refined estimate** vs prompt's ~1.5-2h
7. **Local-build risk pre-check** — sub-item 1 touches the responsive layout (same risk class as Phase 18.1 mobile foundation pass; the band-aid removal in 18.1.3 worked at 360-1440 viewports — verify 1066-1100px range still passes scrollWidth=clientWidth post-fix)
8. **Chrome MCP gate availability** — verify chrome MCP launched cleanly via `cc` alias

Wait for explicit operator "proceed" before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes in order (lowest-risk → highest-risk):

1. **(8) ThemeToggle aria-label** — single component, ~5 lines
2. **(7) Dispatch card copy de-dup** — single component, ~3 lines
3. **(6) "vs base" tooltip** — single component, ~5 lines
4. **(2) S/D formula disclosure** — single chip render site, ~5-10 lines
5. **(3) 651/822 footnote** — single anchor location, ~5 lines
6. **(4) "Investable" pill rule-#6 fix** — per Pause A pick
7. **(5) Number formatting sweep** — multiple sites; centralize via format.ts helpers; per Pause A locale pick
8. **(1) Right-rail clipping fix** — biggest blast radius; do last; per Pause A pick

For each:
- Read file end-to-end first
- Verify cross-component impact (rule #4)
- For sub-item 1: post-fix verify scrollWidth=clientWidth at 1066/1100/1180/1440px viewports

---

## 4. Pause B — Foundation gates + LOCAL PRODUCTION BUILD + chrome MCP visual verification

### 4a. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 + N if specs added
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

### 4b. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

```bash
npm run build && npx serve@latest out -l 3100
```

Verify:
- Home page returns HTTP 200
- All JS chunks return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Bundle delta near-noise-floor

### 4c. Visual verification at 6 viewports (CHROME MCP RESTORED)

Per `feedback_chrome_mcp_orphans.md`, chrome MCP gate is restored 2026-05-07 via the `cc` alias. Use chrome-devtools-mcp at the audit's specific viewports:

1. **1066 px** (audit-3 reported width) — `scrollWidth === clientWidth` PASS; €378 hero NOT clipped
2. **1100 px** — `scrollWidth === clientWidth` PASS
3. **1253 px** (audit-3 also reported) — PASS
4. **1440 px** — PASS (no regression on full desktop)
5. **414 px mobile** — PASS (no regression on mobile)
6. **360 px mobile** — PASS

For each viewport, also verify:
- S/D 1.81× chip shows formula disclosure
- 651/822 footnote visible
- "Investable" pill replaced
- Number formatting consistent
- Dispatch card copy de-duped

If chrome MCP fails: curl-only fallback acceptable; prose state doc at `docs/visual-audit/phase-25/STATE.md`.

### Pause B report

- Per-sub-item status: SHIPPED / DEFERRED-with-reason
- 6-viewport visual verification table
- Bundle size delta
- Local-build smoke-test result

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Visual audit

If chrome MCP succeeded: 6+ screenshots at `docs/visual-audit/phase-25/` covering 1066/1100/1253/1440/414/360 px.

If chrome MCP failed: prose STATE.md + key screenshot at 1066 px (the audit-3 specific viewport) for pre/post comparison.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/components/HeroBalticMap.tsx app/globals.css
git commit -m "phase-25(layout): right-rail clipping fix at 1066-1100px viewport range; raised hero collapse breakpoint per Pause A pick"

git add app/components/SignalBar.tsx app/components/RevenueCard.tsx app/components/TradingEngineCard.tsx app/components/ThemeToggle.tsx app/lib/format.ts
git commit -m "phase-25(disclosure): S/D formula on card + 651/822 Kruonis footnote + investable pill rule-#6 fix + number formatting consistency + base-definition tooltip + dispatch copy de-dup + theme-toggle aria-label"

git add docs/handover.md docs/visual-audit/phase-25/
git commit -m "phase-25(handover): Session 54 + visual audit captures"

git push -u origin phase-25-credibility-disclosure-pass
```

(Adjust per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 54

Mirror Session 53 structure. Specific items:
- Headline: P0 right-rail clipping fix + audit-3 credibility-disclosure pass; 8 sub-items shipped
- Branch + base
- Pause A discovery + per-sub-item picks
- Pause B verification gates + 6-viewport visual table + chrome MCP availability status
- Per-fix description + line:line citations
- Bundle size delta
- Visual audit (chrome MCP screenshots OR curl-only prose)
- Audit-3 P0 closure: right-rail no longer clips at 1066-1100px viewport range
- Out of scope reminder
- Tier 1 sequence: 25 ✅ → next CC pick today is Phase 4G.1 (encoding gate; ~30-60 min); then Phase 18.3 (animation activation)
- Next operator action: open PR; merge; hard-refresh kkme.eu at 1066px laptop viewport (the audit-3 reported width) to confirm hero renders cleanly

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 25 → Shipped appendix
- Currently-active update: 25 SHIPPED; next CC is Phase 4G.1

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Right-rail clipping at 1066px was empirically verified Cowork-side; sub-items 2/3/4/6/7/8 rely on that verification. Re-verify each surface at Pause A in case 7.7g-a-3 typography phase or 18.1.3 reflow phase touched same lines.
- **Discipline rule #2 (no-hardcoded-temporal-label).** S/D ratio "1.81×" + "↓23% vs base" + "investable" all assert derived values; surface their derivation per rule #2's spirit.
- **Discipline rule #4 (cross-card consistency).** Number formatting consistency sweep is exactly this rule. After fix, every euro display goes through the same formatter.
- **Discipline rule #6 (no editorial chips).** "Investable" pill is the load-bearing one; same lesson as Phase 21's THICK chip.
- **Tailwind v4 silent-drop pattern.** If sub-item 1 adds new `@media` rules in `globals.css`, hoist into fresh blocks. Multi-selector @media also drops silently.
- **Local-build verification at Pause B.** Phase 18.1.1's chunk error came from new component + GSAP guard; this phase touches layout breakpoints (similar risk class). Required.
- **Chrome MCP gate.** Restored 2026-05-07 via `cc` alias; should work cleanly. If lock returns, that's a regression worth flagging.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete.

End of prompt.
