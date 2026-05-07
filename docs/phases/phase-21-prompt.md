# Phase 21 — S2 professional polish

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~3–4 hours, single PR, three pause points (Pause A discovery, Pause B foundation + local-build smoke-test, Pause C visual + commits). **Worker deploy needed for sub-item (b) only.**

**Operator framing:** Operator hard-refresh feedback 2026-05-07 — "I don't understand this one at all? what is mwh/h? why I can only see once a month? what does this even mean?" Energy-expert audit followed (memory: `project_s2_audit_phase_21.md`). Verdict: S2 Balancing card is methodologically honest but operationally thin. Three specific gaps to close for "professional but not institutional" target. Operator confirmed picks (a)+(b)+(c) for Phase 21 scope.

---

## What ships

3 sub-items, single PR:

**(a) Hero inversion** — frontend-only. Currently `S2Card.tsx:220-243` renders €13.5/MW/h (up+down combined `data.afrr_p50`) as the hero number with a small "up+down combined" label, then a sub-line at `:255-263` shows one-direction up/down avg. Per audit: real Baltic BESS overwhelmingly bid one-direction (up only); €13.5 combined headline overstates the opportunity ~70% to non-expert readers; ENTSO-E reports combined for auction-clearing methodology purity, not investor-decision framing. Swap field priority: lead with **`data.afrr_up_avg`** (€7.91/MW/h up-only Baltic avg) as primary hero number; demote `data.afrr_p50` (€13.5/MW/h up+down combined) to methodology subline. Auto-corrects the €5.9M/yr footer translation → ~€3.46M/yr (€7.91 × 50 MW × 8760 h) — the more honest annualized number for one-direction BESS at 50 MW. Math is already correct; this is reframing not recalculation.

**(b) 90d delta signal** — worker deploy. Add a derived field `s2.afrr_up_avg_90d_delta` (or similar) computed worker-side as `(current_30d_p50 - prior_90d_p50) / prior_90d_p50` (or whatever rolling-window comparison makes sense — confirm at Pause A). Surface as a quantitative micro-descriptor chip near the hero: `Δ −12% / 90d` style (or whatever sign the actual delta is). Per discipline rule #6 (no editorial chips). Tells regime story (post-Feb-2025 Continental synchronization context) without chart redesign. Reuses existing rolling-7d infrastructure pattern at `workers/fetch-s1.js:4423` area.

**(c) IMB interpretation + THICK chip fix** — frontend-only. Two changes:

1. **One-line interpretive connector** below the IMB stats block (`S2Card.tsx:267-296`). Today three numbers (IMB MEAN N MWh / IMB P90 N MWh / %>100 N%) sit decoratively without revenue-logic connection. Add a single muted-text line: *"Higher imbalance → more aFRR activations → activation revenue layer on top of capacity reservation. Today's N% > 100 MWh means roughly 1-in-N settlement periods is system-stressed."* Make N values data-derived so prose stays accurate.

2. **`AFRR · THICK` chip discipline-rule-#6 audit.** Per Cowork-side investigation 2026-05-07: this chip is actually `MarketThicknessChip` from Phase 7.7a (7.7.14) at `app/components/MarketThicknessChip.tsx`. Levels (`THICK` / `MEDIUM` / `THIN`) are config from `app/lib/financialDefinitions.ts` `MARKET_THICKNESS` and carry real analytical content (price-taker vs bid-shading vs depth-constrained). However, "THICK" reads editorial-vibe to non-expert readers. Per rule #6 spirit (data/math/visuals speak; quantitative micro-descriptor not editorial state-label), surface a quantitative anchor. Operator-decide at Pause A:
   - **Option A:** Add quantitative anchor inline — keep level word, append depth threshold: "aFRR · THICK · ≥100 MW", "mFRR · MEDIUM · 50–100 MW", "FCR · THIN · ≤50 MW"
   - **Option B:** Replace level word with quantitative descriptor — "aFRR · ≥100 MW depth", "mFRR · 50–100 MW shade ±5%", "FCR · ≤50 MW only"
   - **Option C:** Verify against rule #6 textually; if levels are deemed structural metadata (not engine-emitted state per rule #6's actual scope), keep as-is and just add quantitative caption beneath

`model_version` does NOT bump for (a) and (c). Sub-item (b) needs a worker deploy with new derived field. Operator-confirm at Pause A whether 90d delta should bump or not.

---

## OUT of scope

Per energy-expert audit explicit deferrals (operator-confirmed):
- Forward curves
- P95/P99 tail risk lines on the chart
- Cross-region benchmarks (Baltic aFRR vs Continental aFRR)
- Cross-product side-by-side view (aFRR + mFRR + FCR all visible at once)
- Cross-country side-by-side view (LT + LV + EE all visible at once)
- Multi-period decomposition / scenario analysis
- Restructuring card layout / hierarchy
- Pre/post-Feb-2025 sync event annotation on chart (deferred to potential Phase 22+)
- Extending chart from 8 months to 18-24 months
- Activation revenue companion display
- Engine math changes
- Roadmap edits (operator/Cowork-owned per rule #5)
- Any other card (S1, S4, S7, S9, RevenueCard, etc.)

These are deferred to potential Phase 22+ if operator later wants institutional-grade S2.

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #4 cross-card consistency, #6 no-editorial-state-label, #5 roadmap edit-conflict)
2. `docs/handover.md` Sessions 47–49 (Phase 18.2 / 18.2.2 / 18.2.3 chart-UX cluster context)
3. `docs/phases/_post-12-8-roadmap.md` "Phase 21" entry — roadmap source-of-truth for scope
4. `docs/specs/2026-05-06-designer-developer-spec.md` — section P0-1/P0-2 (related but not in this scope)
5. `app/components/S2Card.tsx` — read hero block (`:220-265`), imbalance tiles (`:267-296`), drawer (`:329-345`), MonthlyTrajectoryChart (`:671+`)
6. `app/components/MarketThicknessChip.tsx` (~55 lines, full file) — current THICK chip implementation
7. `app/lib/financialDefinitions.ts` — `MARKET_THICKNESS` config; identify what THICK/MEDIUM/THIN currently encode (caption/tooltip/level text)
8. `workers/fetch-s1.js:4400-4450` — current `afrr_up_avg` rolling-7d computation; design 90d delta around this pattern
9. `app/lib/metricRegistry.ts` — register the new 90d delta field per rule #4

Memory references (Cowork-side):
- **`project_s2_audit_phase_21.md`** [LOAD-BEARING] — full audit findings, pick rationale, out-of-scope explicit list
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Pause B local-build smoke-test gate REQUIRED for any phase touching chart.js / new worker fields / new derived data; Phase 18.1.1 ChunkLoadError lesson
- `feedback_canvas_chartjs.md` — Canvas 2D doesn't resolve CSS vars (relevant only if delta chip uses chart.js Canvas; if HTML chip, not relevant)
- `feedback_tailwind_v4_silent_drop.md` — hoist new @media rules into fresh blocks
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge; no PR body, no branch delete
- `reference_designer_dev_spec.md` — points at the saved spec doc

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-18.2.3-merge commit. State understanding (one paragraph): which sub-items you'll tackle in what order, expected blast radius, worker deploy plan for (b), local-build smoke-test plan. Wait for "proceed".

### Cowork-grepped baseline (verify at Pause A per discipline rule #1)

| Concern | File:line | Current state |
|---|---|---|
| Hero number rendering | `S2Card.tsx:220-243` | €13.5/MW/h (`data.afrr_p50`) labeled "up+down combined" |
| One-direction subline | `S2Card.tsx:255-263` | €7.91/MW/h up + €6.44/MW/h down (Baltic avg) |
| €5.9M/yr footer | `S2Card.tsx:~308` | `data.afrr_p50 × 50 × 8760` — auto-updates if hero source changes |
| Imbalance tiles | `S2Card.tsx:267-296` | `imbalance_mean`, `imbalance_p90`, `pct_above_100` rendered as 3 TileButtons |
| THICK chip | `S2Card.tsx:248-249` (uses `<MarketThicknessChip>`) | Implementation at `MarketThicknessChip.tsx`; levels in `financialDefinitions.ts` `MARKET_THICKNESS` |
| afrr_up_avg field | `workers/fetch-s1.js:4423` | Rolling 7-day mean from BTD activation feed |
| Methodology link | `S2Card.tsx:316-318` | "BTD price_procured_reserves, {country}, rolling 7d" + methodology anchor |

---

## 1. Branch + baseline

```bash
git checkout -b phase-21-s2-professional-polish
npx tsc --noEmit       # 0 errors
npx vitest run          # 925/925 baseline (post-18.2.3)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. Pre-commit must match (small +/- per spec additions if any).

---

## 2. Pause A — Discovery + scope confirmation

Per discipline rule #1 (audit-triage), re-verify each Cowork-grepped baseline claim before scoping fixes:

### 2a. Hero inversion field-source confirmation

Read `S2Card.tsx:220-265` end-to-end. Confirm:
- Current hero pulls from `data.afrr_p50` (or whichever `combinedDisplay`-style helper at `:106` returns)
- `data.afrr_up_avg` exists in payload type and is non-null in production
- The €5.9M/yr footer line at `:308` derives from the hero variable; swapping hero source auto-corrects the footer
- The "up+down combined" label literal text is at the right line

Propose: hero swap pattern (single variable swap vs introduce new helper) + label text update + footer math invariance check.

### 2b. THICK chip — read the implementation

Read `MarketThicknessChip.tsx` end-to-end + `financialDefinitions.ts` `MARKET_THICKNESS` config. Identify:
- What `level` string values exist (`'thick'` / `'medium'` / `'thin'` likely)
- What `caption` and `tooltip` text exist per level
- What quantitative content (MW thresholds, depth caveats) is in tooltips/captions
- Whether `lint:no-editorial-chips` CI gate currently flags THICK/MEDIUM/THIN — likely NOT (gate covers TIGHTENING/STABLE/etc, see `package.json` `lint:no-editorial-chips` script regex). Confirm via `cat package.json | grep lint:no-editorial-chips` → see what regex is enforced.

Propose: rule #6 interpretation. THICK/MEDIUM/THIN is a structural-metadata label (market depth class), not an engine-emitted state about market direction. Falls in a gray zone vs the rule's literal scope. Three Options as listed in §What ships sub-item (c).

### 2c. 90d delta — worker engine design

Read `workers/fetch-s1.js:4400-4450` (current `afrr_up_avg` rolling-7d computation). Design:
- New derived field name: `afrr_up_avg_90d_delta` (or `afrr_up_30d_vs_90d_delta` for clarity)
- Computation: `(rolling_30d_p50_or_mean - rolling_90d_p50_or_mean) / rolling_90d_p50_or_mean × 100` → percentage
- Data window: confirm BTD `price_procured_reserves` history goes back ≥120 days for the comparison window (operator confirmed cron has been running long enough; confirm by reading worker KV access pattern)
- Memory cost: small (one new scalar field on `s2` object)
- Whether to register in `metricRegistry.ts` per rule #4 (cross-card consistency CI gate)

Edge cases:
- What if `prior_90d_p50` is null or zero? (NaN/Infinity protection)
- What if data window is too short (early days, post-deploy)? Render `—` or skip chip
- Worker fallback path if computation fails: serve `afrr_up_avg_90d_delta: null`

Propose: full computation function + null-safety + chip display logic (quantitative micro-descriptor format `Δ ±N% / 90d` per rule #6).

### 2d. IMB interpretive line — wording

Read `S2Card.tsx:267-296` imbalance tiles block. Identify:
- The data values (`imbalance_mean`, `imbalance_p90`, `pct_above_100`)
- Where to render the new interpretive line (above? below? inline with tiles?)
- Style: muted-text mono, smaller than tile values, similar to footnote prose at `:316-318`

Propose: exact wording, data-derived placeholder pattern, render position. Verify language stays operator-honest (no marketing-speak).

### 2e. lint:no-editorial-chips gate behavior

```bash
cat package.json | grep lint:no-editorial-chips
```

If the existing CI gate regex catches THICK/MEDIUM/THIN, then sub-item (c) Option A or B becomes mandatory. If it doesn't, operator's discipline-rule-#6 question is interpretive (does the rule's spirit catch THICK?).

### Pause A report

Halt + report:

1. **Per-baseline verification** — VERIFIED / REFINED / NOT REPRODUCIBLE per Cowork-grepped table
2. **(a) hero inversion** — proposed swap pattern, field source, label text update, footer math invariance check
3. **(b) 90d delta** — proposed worker computation function, field name, null-safety pattern, registry inclusion (rule #4), chip display format
4. **(c) IMB interpretation** — proposed exact wording + render position
5. **(c) THICK chip** — Option A / B / C pick recommendation; confirm CI gate behavior (caught vs not caught); operator interpretive call needed
6. **Refined estimate** vs prompt's ~3-4h
7. **Worker deploy plan for (b)** — secret access, KV writes, deploy command, verification curl
8. **Local-build risk pre-check** — chart.js + Canvas + worker = same risk class as Phase 18.1.1; Pause B local-build verification gate REQUIRED

Wait for explicit operator "proceed" before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes in this order (lowest-risk → highest-risk per Phase 18.1.1 lesson):

1. **(c-1) IMB interpretive line** — pure prose addition, ~3-5 lines, frontend-only, no logic change
2. **(c-2) THICK chip per Pause A pick** — frontend-only, levels OR captions update
3. **(a) Hero inversion** — single-file display change, field-source swap + label text
4. **(b) 90d delta worker computation** — extend `fetch-s1.js` with new derived field
5. **(b-cont) Frontend chip display** — render `afrr_up_avg_90d_delta` as quantitative chip near hero

For each:
- Read the file end-to-end first (don't grep+sed)
- Verify no cross-card regression (rule #4 — same metric in N display locations)
- For worker change in (b): test locally with `wrangler dev` if available; smoke-curl `/s2` after deploy

---

## 4. Pause B — Foundation gates + worker deploy + local production build

### 4a. Foundation gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 + N if specs added
npm run lint            # 127 baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0; verify THICK chip handling per Pause A
npm run build           # 7 routes
```

### 4b. Worker deploy (for sub-item b only)

```bash
cd ~/kkme
npx wrangler deploy --env production  # or whatever the existing pattern is — confirm via `cat wrangler.toml`
# Capture worker version output
```

Then verify:
```bash
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.afrr_up_avg_90d_delta'
# Should return a number (percentage) or null if computation failed gracefully
```

If null when expected non-null, debug at the computation function — likely null-safety branch fired or data window too short.

### 4c. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

```bash
npm run build
npx serve@latest out -l 3100  # or equivalent
```

Verify (curl-based, since chrome MCP recurring lock condition):
- Home page returns HTTP 200
- All JS chunks referenced in HTML return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Bundle delta near-zero (chip rendering + prose addition + hero text swap)

If chrome MCP available:
- Open localhost:3100 at 360px AND 1440px
- Hover S2 card; confirm hero shows €7.91/MW/h up-only as primary
- Confirm 90d delta chip renders quantitatively
- Confirm IMB interpretive line renders below tiles
- Confirm THICK chip per Pause A pick
- Confirm light + dark theme switching unchanged

Halt + report:
- Per-fix status: SHIPPED / DEFERRED-with-reason
- Worker deploy: SUCCESS (with version hash) or FAIL (with error)
- Local-build smoke-test: PASS / FAIL
- Bundle delta
- Cross-card consistency check (rule #4): per-grep for `afrr_p50` and `afrr_up_avg` consumers; confirm no display still shows €13.5 as a primary hero number elsewhere

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Visual audit

Capture screenshots at `docs/visual-audit/phase-21/` — at least 8 screenshots:
- 360px mobile + 1440px desktop × Light + Dark themes = 4 hero screenshots
- 360px mobile + 1440px desktop × Light + Dark themes = 4 IMB-interpretation screenshots

If chrome MCP locked, capture via local-build curl-only verification + describe the rendered state in prose.

### 5b. Commits + push

Suggested 3-commit structure:

```bash
git add app/components/S2Card.tsx app/components/MarketThicknessChip.tsx app/lib/financialDefinitions.ts
git commit -m "phase-21(frontend): hero inversion to up-only operational reality + IMB interpretive connector + THICK chip rule-#6 alignment"

git add workers/fetch-s1.js app/lib/metricRegistry.ts
git commit -m "phase-21(worker+registry): afrr_up_avg_90d_delta derived field for regime-direction signal"

git add docs/handover.md docs/visual-audit/phase-21/
git commit -m "phase-21(handover): Session 50 + visual audit captures"

git push -u origin phase-21-s2-professional-polish
```

(Adjust file groupings per actual touched set.)

Print PR-creation URL.

---

## 6. Handover Session 50

Mirror Session 49 structure. Specific items:
- Headline: S2 professional polish; hero inversion + 90d delta worker field + IMB interpretation + THICK chip rule-#6 alignment
- Branch + base
- Pause A audit results (per-claim VERIFIED / REFINED / NOT REPRODUCIBLE per Cowork baseline; THICK chip Option A/B/C pick rationale)
- Pause B verification gates (paste actual numbers; worker version; local-build smoke-test result)
- Per-sub-item description + file:line
- Bundle size delta
- Worker deploy: version hash + curl verification
- Cross-card consistency check (`afrr_p50` and `afrr_up_avg` consumer list)
- Visual audit screenshot inventory
- Out of scope reminder
- Tier 1 sequence: 21 ✅ → next CC pick across (18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1)
- Phase 22 candidate filed for institutional-grade S2 if operator later wants forward curves / P95 tail / cross-region benchmarks
- Next operator action: open PR via web UI; merge; hard-refresh kkme.eu mobile + desktop dark + light to confirm hero reads as €7.91/MW/h up-only + 90d delta chip + IMB interpretation + THICK chip per Option

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 21 → Shipped appendix
- Currently-active update: 21 SHIPPED; next CC across (18.2.4 / 18.2.5 / 18.2.1 / 18.1.2 / 18.3 / 12.12 #1+#2 / 7.7g-a-3 / 7.7g-b / 19 / 20 / 18.1.1.1)
- Phase 22 conditional candidate filed (institutional-grade S2: forward curves, P95 tail, cross-region benchmarks)

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Cowork-grepped baseline is starting point; verify each at Pause A. Especially: confirm `data.afrr_up_avg` is reliably non-null in production payload (if often null, hero inversion regresses to "—").
- **Discipline rule #4 (cross-card consistency).** After hero inversion, grep for any other site rendering `afrr_p50` as a primary hero — should be NONE (S2 is the canonical surface). If found elsewhere, decide whether to migrate too or leave (operator-decide).
- **Discipline rule #6.** THICK chip Option pick must result in either a quantitative micro-descriptor OR a structural-metadata exemption documented in the handover. Don't ship a card chip that reads as editorial state-label.
- **`prefers-reduced-motion`** — no motion added in this phase; no concern.
- **Tailwind v4 silent-drop pattern** — if any new `@media` rules added in `globals.css` (unlikely this phase), hoist into fresh blocks per memory.
- **Out-of-scope drift risk.** Forward curves, P95 tails, cross-region benchmarks all surfaced during audit but are explicitly deferred. Don't silently extend.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete.
- **Local-build verification at Pause B is REQUIRED**, not optional. Phase 18.1.1 lesson is fresh.

End of prompt.
