# KKME execution roadmap

**Authored:** 2026-05-03 from Cowork after seven external audits + endpoint sweeps + CC investigations.
**Last revised:** 2026-05-03 (post-Phase 12.8.0 Pause B; cleanup pass — added Currently-active, Tool-division, Quality-gates, audit-credibility taxonomy; renumbered Phase 12.12; reordered Tier 0; moved Phase 12.14 to Tier 5; added Phase 12.10a discipline patch; restructured operator decisions).

**Edit protocol** (per session-27 process learning): this roadmap is **operator/Cowork-owned**. CC may READ it but only commits roadmap changes when explicitly instructed in the prompt. Default: CC reports needed changes via handover; operator applies via Cowork. Prevents the multi-actor edit-conflict pattern that produced the messy numbering in earlier versions.

---

## Currently active

- **In flight:** none — operator at clean main, Phase 18 just shipped. **Phase 29 VPS Python deploy COMPLETE** (2026-05-06, LT/2h=€284.4, LT/4h=€306.6 live; daily cron at 06:30 UTC).
- **Tier 1 — operator-pick across three eligible threads:**
  1. **Phase 7.7g-a-2** (~1-2 days) — spacing tokens + rollout; continues the typography/foundation thread Phase 7.7g-a-1 opened.
  2. **Phase 12.12 #1+#2** (~2-3 days) — schema validation + freshness gates; opens the parallel data-integrity thread.
  3. **Phase 7.7g-b reduced** (~3-4 days, scope reduced post-Phase-18) — Stat / Badge / Chart / Drawer primitives + worker URL centralization; Card primitive done by Phase 18; source-into-drawer reconsidered post-bracket-markers.
- **Then:** Phase 7.7g-c (rgba/hex regression cleanup + CI gate), then Tier 2 (Phase A chapter restructure) → Tier 3 (Phase B + 12) → Tier 4 (charts + connection) → Tier 5 (editorial) → Tier 6 (mobile + a11y).
- **Parallel research track:** Phase 30 research deliverables shipped; Phase 29 unblocked by Phase 12.10 follow-up.
- **Phase 12.10 follow-up shipped 2026-05-05** [PR #61 → commits `2fa2e72` + `191c548` + `4535fc9`; worker `ea88ccc9-0b45-46e6-87cc-b0afbac7407d`]. Resolution: Gap #5 reframed as methodology disclosure (CC primary-source verification of Clean Horizon's "Baltic S1 2025 Price Forecasts" Jun 2025 confirmed €340 was Apr–mid-Jun 2025 launch-window aggregate-Baltic; KKME's €14/MW/h LT post-integration is internally consistent with Clean Horizon's own Oct 2025 Storage Index showing ~5× compression even pre-sync). EE A68/fleet boundary set to **strict-commissioned (path a)** — current state already aligned, codified in methodology paper. Phase 12.12 #15 closed by this commit (no further action needed).

### Operator action items (visible tracking surface — currently scattered across handover backlogs)

These are not phases (no CC code work). They're operator-only actions that need a single tracking surface so they don't drop:

1. **Phase 12.9 deferred verification curls** [Session 33 backlog]:
   - At any 4h cron tick post-2026-05-05-10:25-UTC: `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s9 | jq .eua_trend` — confirm result is one of `'↑ rising' | '→ stable' | '↓ falling'` (or null if `s9_history` < 2 entries). If null with ≥2 history entries, file Phase 12.9.4 follow-up.
   - After next operator `POST /da_tomorrow/update` push: `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/health | jq '.signals."da_tomorrow:lastgood"'` — confirm transitions `missing` → `present`. If still missing, file Phase 12.9.4 follow-up.
2. **Phase 12.9.1 production chip visual confirmation** — open kkme.eu Returns/S2/S4/S7/S9 cards; confirm chips render quantitative (`+45% / P50` etc.), not editorial (`STABLE` / `HIGH`). If old chips visible, Cloudflare Pages cache may be stuck.
3. **Phase 12.9.3 default duration production confirmation** — open kkme.eu Returns card; confirm 2h is the on-load default (toggle still offers 4h).
4. ~~**Methodology paper destination decision**~~ **[CLOSED 2026-05-06 by Phase 29]** — Standalone `/methodology` route shipped via Phase 29 commit `app/methodology/page.tsx`; renders `docs/methodology.md` via react-markdown + remark-gfm at build time; heading IDs auto-generated for anchor support; `/methodology#kkme-baltic-storage-index` deep-link confirmed working in dark + light mode.
5. **Merged-branches cleanup on origin** — six branches from 2026-05-05 PRs likely still on origin (`phase-12-9-1-brand-discipline`, `phase-12-9-2-s8-timestamp`, `phase-12-9-3-default-duration-2h`, `phase-4g-intel-encoding`, `phase-12-10a-claude-md-discipline`, `phase-7-7g-a-1-token-audit`). One-click delete per branch on GitHub web UI; or `git push origin --delete <branch>` per branch.

- **Roadmap last updated:** 2026-05-06 by Cowork (post-Phase-18-merge: Phase 18 → Shipped appendix [5 commits e160c77 / 36c8ac7 / db00eac / 473dcd2 / ac5b179, ~143 KB Latin bundle = -13% vs baseline, broadsheet masthead Vol I · No 128, IBM Plex Mono + Newsreader live, sharp 0px corners + per-card-type accents, Newsreader 200 hairline hero scale, footnote citation discipline real-anchors-only, bracket-notation SourceFooter, pull-quotes on §1/§4/§6, 18 visual-audit screenshots]; Phase 29 VPS Python deploy COMPLETE 2026-05-06 producing LT/2h=€284.4 LT/4h=€306.6 with daily cron 06:30 UTC; Currently-active In-flight clears to Tier 1 thread eligibility)

---

## Source documents

- 2026-04-29 audit (P0–P6 visual)
- 2026-05-03 audit #1 (deeper structural)
- 2026-05-03 audit #2 (execution-ready 6-tier plan)
- 2026-05-03 architecture proposal (4-layer hub-and-spoke) + operator pushback + **consolidated final revision** (canonical)
- 2026-05-03 audit #4 (data fact-check pass against KKME content)
- 2026-05-03 audit #5 (data live-cross-check vs primary sources)
- 2026-05-03 audit #6 (data-source inventory with API endpoints)
- 2026-05-03 audit #7 (feature/format ideas catalogue)
- Cowork-side endpoint sweeps + CC investigations (Phase 12.8 dispatch render, Phase 12.8.0 light-mode audit-vs-reality)

---

## Audit credibility taxonomy (process learning)

Three audit categories with different empirical track records. Apply different triage discipline to each.

| Category | Audits | Reliability | Triage rule |
|---|---|---|---|
| **Visual-inference** | #2, #3 | ~25% (3 of 4 claims hallucinated — percentile, keyboard, light-mode) | **Hypothesis to investigate, NOT bug to fix.** Code-grep + screenshot + git-log triangulation BEFORE scoping fix |
| **Primary-source cross-check WITH citation** | #4, #5 | ~95%+ (verified by Cowork curl + independent corroboration) | **Authoritative.** Ship the fix; verification mostly redundant |
| **Primary-source cross-check WITHOUT citation** | (none in current set, but the category exists for future audits) | ~80% (claim is plausible but unverifiable without operator effort) | **Verify-then-ship.** Cowork curl OR ask operator to confirm before scoping; if curl/confirm agrees → ship; if disagrees → escalate |
| **Inventory / catalogue** | #6, #7 | n/a (research deliverables, not critiques) | **Filter against consolidated-revision principles** ("denser-not-broader"). Most defer; high-leverage minority incorporates. **Caveat from Phase 4G:** even inventory-style audits can carry empirically-false premises (audit #6's cp1257 claim was wrong); apply audit-triage rule at scope time |

This taxonomy belongs in `CLAUDE.md` working-discipline section — see Phase 12.10a.

---

## The consolidated framing

Five visually-distinct chapters on one URL, navigated by right-edge dot indicator. Two "wow" moments. One quiet relationship layer. Daily editorial habit. No multi-surface architecture, no command palette, no workspace, no alerts, no founder bio.

| Chapter | Position | Density register | Purpose |
|---|---|---|---|
| 1. Live state | Hero | Composed (single scene) | Three-second visual proof: this is real-time Baltic flexibility |
| 2. Today's signal | New editorial band | Lowest density, generous whitespace | Daily one-sentence + supporting chart; "wow" moment + retention engine |
| 3. Dispatch story | Merged Revenue + Dispatch | Medium density, illustrated | Composed visualization showing battery cycle through the day |
| 4. Economics | Merged Build + Returns | Highest density, table-like | Analyst working area; IRR sensitivity slider lives here |
| 5. What's moving | Merged Structure + Intel | Feed-style, chronological | Weekly scan-for-what's-new + forward calendar (Phase 12.14) |

About / contact = quiet coda paragraph at the foot. No bio.

---

## Tool division per phase type

| Phase activity | Best tool | Why |
|---|---|---|
| Investigation / planning / read | **Cowork** | Live folder access, ad-hoc curl, light edits, no context burn |
| Multi-file feature build | **CC YOLO** (`--dangerously-skip-permissions --model claude-opus-4-7`) | Sustained session, bash + tests + screenshots in one context |
| Visual verification | **chrome-devtools MCP** in CC | Real-browser screenshots, axe-core, click-through testing |
| Periodic check (>1 day cadence) | **Scheduled tasks** | `trig_011x9vT1GrGoiwtWHPt5aAR8` (Phase 4F feed-health-check) is the working model |
| Roadmap status visualization | **Cowork artifacts** (`mcp__cowork__create_artifact`) | Live page that re-fetches handover state on open |
| Phase ship → Notion sync | **Notion MCP** | Tasks DB `8adc11357f784ecc9a76fb8cb3c2c185`; Phases DB `9ffd6b7e3f294aa594a15bebded5ae29` |
| Memory persistence | **Cowork memory writes** | `MEMORY.md` carries context to future Cowork sessions |
| Document creation (PDF/PPTX/XLSX) | **anthropic-skills:** pdf / pptx / xlsx / docx | Use when phase produces deliverable beyond code |

**Default rule:** every CC prompt should reference these tools by name where applicable. Don't re-derive tool choice per phase.

---

## Quality gates (every phase)

**PRE-flight** (before §0):
- Read `CLAUDE.md`, `docs/handover.md` last 3 sessions
- `git status && git log --oneline -10` — confirm clean state on intended branch
- `bash scripts/diagnose.sh` — confirm production health
- `npm test` — capture baseline test count
- Stale `.git/index.lock` check — `rm -f .git/index.lock` if needed

**IN-flight** (between §0 and §6):
- Three pauses (after Pause A discovery, after Pause B build, after Pause C verification)
- Empirical-proof discipline: fail-then-pass tests for any defect fix (test fails on unfixed code, passes on fixed code, both captured in commit message body)
- No silent drops: every step explicitly reported

**POST-flight** (every phase ships):
- PR opened via GitHub web UI (no `gh` CLI per CLAUDE.md)
- `docs/handover.md` Session N entry appended: scope, fix description, test count delta, visual audit dir, backlog items
- Roadmap entry marked `[SHIPPED <date> PR #N]` and moved to "Shipped appendix" (operator does this in Cowork — NOT CC, per edit protocol)
- Notion Tasks DB entry created and marked Done (operator does this in Cowork via Notion MCP)
- Cowork memory write if observation worth carrying to future sessions
- Cleanup: remove temp diagnostics from working tree

---

## Sequence (~9-11 weeks total, 30 phases across 6 tiers)

### Tier 0 — Bug fixes + data integrity (this week, ~3-5 days)

#### Phase 12.8 — Dispatch render-error fix [SHIPPED 2026-05-03]
Defensive guards + CardBoundary upgrade. Ships preventive hardening (audit's transient SIGNAL ERROR doesn't currently reproduce). 6 throw-eligible candidates each verified to fail-then-pass. Test count 837 → 866.

#### Phase 12.8.0 — Audit-first percentile/keyboard + ticker + light-mode investigation [IN FLIGHT — PAUSE B AWAITING PUSH 2026-05-03]
- **Light mode** — investigation only (Path D). Audit's "highest-priority bug, only 6 of ~50 light overrides, white-on-white country labels" claim was empirically false: 152 root tokens, 114 light overrides, 38 intentionally theme-agnostic. Visual screenshots confirm parity. ContactForm dropdown chevron fix only. Writeup: `docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`.
- **Percentile tiles** — Path C (static labels, drop click handler).
- **Keyboard shortcuts** — single-source-of-truth `app/lib/keyboard-shortcuts.ts`, S/B/T/R/D/I/C + `?` mapping, fix two broken bindings, 200ms outline flash. Phase A will rebind to chapter numbers 1-5.
- **Ticker** — pause-on-hover + edge-fade + robustified prefers-reduced-motion selector.

5 commits ready: 8c79907 light-mode Path D · cf6ad2b percentile · 40be723 keyboard · a2bec07 ticker · 0b837db fixup. Test count 866 → 882. All gates green.

#### Phase 12.10.0 — Emergency hallucinated-entity purge [NEXT — SAME-DAY URGENCY]
**Why:** Audit #5 found "UAB Saulėtas Pasaulis (500 MW)" pipeline-exit entry on production right now. No company by that name in Lithuanian commercial registry. Generic Litgrid homepage URL + "If confirmed" hedge language are LLM-hallucination tells. Phase 4F gates don't catch it.

**Scope (~1h):**
1. Locate via `curl /feed | jq '.items[] | select(.title | test("Saulėtas Pasaulis"; "i"))'`
2. Add `POST /feed/delete-by-id` endpoint (UPDATE_SECRET-gated); remove from `feed_index`
3. Audit all "Pipeline exit" entries — verify each named entity OR cite Litgrid/VERT document
4. Audit all `source: 'litgrid'` entries with generic URL `https://www.litgrid.eu/` (no specific path = hallucination marker)
5. Trace ingestion path (`git log -S "Saulėtas Pasaulis"`, grep `daily_intel.py`)
6. Handover note documenting investigation
**Worker deploy required.**
**Acceptance:** /feed no longer surfaces Saulėtas Pasaulis; all pipeline-exit + generic-litgrid-URL entries verified or removed.

#### Phase 12.10 — Data discrepancy hot-fix bundle [URGENT, ~6-8h]
**Why:** Two independent fact-check audits (#4, #5) cross-checked against Litgrid, AST, Elering/Evecon, Energy-Charts, BTD, Trading Economics. Multiple primary-source-contradicted values + cross-card internal contradictions + 2× revenue methodology mislabel.

**Verified findings (Cowork-curl confirmed):**
- LT installed storage `s4_buildability` 484 MW from "Litgrid 2026-03-23" — 41 days stale; Litgrid current 506 MW (353 transmission + 153 distribution)
- LT cross-card contradiction: `storage_by_country.LT.installed_mw: 484` vs `fleet.countries.LT.operational_mw: 596` (596 includes Kruonis PSP 205); both disagree with Litgrid 506; ~115 MW gap suggests fleet tracker missing distribution-grid storage
- LV cross-card: `storage_by_country.LV: 40` vs `fleet.countries.LV: 99` (sums Utilitas Targale 10 + AST Rēzekne+Tume 80 + AJ Power 9)
- EE 127 stale; Hertz 1 may be 100 vs 200 MW per Evecon press
- Quarantine flags ignored: items flagged `_quarantine: true` (Hertz 1, Eesti Energia BESS, Utilitas Targale, AJ Power, Kruonis PSP) STILL counted in totals
- aFRR P50 €13.5/MW/h ≈ afrr_up_avg (7.98) + afrr_down_avg (5.15); card describes one-direction product; 2× overstatement risk
- Peak/trough hour labels hardcoded; both Peak Forecast card AND 2h Capture card wrong; actual today h22 EEST €158.81
- DA capture marquee €133 vs 2h card €140 — same metric two values
- EUA carbon ~3% lag (€73.9 vs €71.80)

**Scope:**
1. **Worker** — refresh stale buildability assertions (LT 484→506, LV 40→80, audit EE) via `POST /s4/buildability` with `last_verified_at` timestamp
2. **Worker** — enforce quarantine flag in totals
3. **Worker** — reconcile fleet tracker against Litgrid (~115 MW gap; likely missing distribution sites)
4. **Frontend** — rename `baltic_total.installed_mw` → "Baltic BESS installed (TSO sources)"; `fleet.baltic_operational_mw` → "Baltic flexibility fleet (BESS + Kruonis PSP)" with tooltip + as-of date
5. **Frontend** — compute peak/trough hour from `hourly_today` (today slice, not full 187h array); fix BOTH Peak Forecast card AND 2h Capture card
6. **Frontend** — reconcile DA capture marquee vs 2h card (label both or single source)
7. **Frontend** — fix "7.0% Project IRR" mislabel under 30D capture sparkline
8. **Methodology** — disclose aFRR direction ("up+down combined" or halve to one-direction P50)
9. **Sanitize unsourced model-confidence claims** — "Tier 1 LFP integrator consensus" → cite NREL Annual Technology Baseline; "cross-supplier consensus" → cite or weaken; remove "canonical"; cite/weaken "proprietary"
10. **Verify-or-remove unverifiable claims** using audit #6's API inventory:
    - Connection guarantee €25/kW reduction → search VERT decisions feed OR remove
    - APVA 1,545/3,232/€45M → fetch from apva.lt structured page OR remove
    - Effective demand 752 / Free grid 3,600 → cite Litgrid/VERT methodology OR remove
    - Legal references XV-779/XV-687/O3-189 → auto-verify via **e-tar.lt** RSS; replace with API-fetched canonical title + URL
11. **Add IRR/DSCR/CAPEX assumptions footnote** (discount rate, debt fraction, debt cost, Euribor)
12. **Surface Elering's €74M Baltic frequency-reserve cost for 2025** as a positive macro anchor (audit #5 recommends)

**Worker deploy required.** **Acceptance:** every cross-checked KKME number reconciles with primary source within ±5% (or has documented definitional difference); aFRR methodology unambiguous; no unsourced "consensus"/"canonical"/"proprietary" claims; cross-card internal contradictions resolved.

#### Phase 12.8.1 — Backtest dashed-line caption clarification [REVISED]
**Why:** Auditor walked back the credibility-crisis framing. Don't reframe — clarify.
**Scope:**
1. Identify what the dashed line represents (read chart code)
2. If deliberate Y1 anchor: caption explicitly *"Y1 model anchor (€368/MW/day, scenario base, conservative). Realised tracked +70.9% above — model intentionally conservative."*
3. If intended as time-varying prediction but rendered flat: replace with time-varying line OR placeholder
4. Add MAE alongside mean error
**Estimate:** ~30-60 min.

#### Phase 12.9 — Worker + header KPI hot-fix bundle
**Scope:** SignalBar S/D RATIO migration (1 line: `data.s2?.sd_ratio` → `data.s4?.fleet?.sd_ratio`); /da_tomorrow upstream-error handling (try/catch JSON parse, last-good fallback); /health endpoint expansion to all 16 KV keys; /extreme/latest TTL 24h backstop; /s9.eua_trend regeneration from history.
**Estimate:** ~1.5-2h. Worker deploy required.

#### Phase 12.9.1 — Brand discipline pass [NEW — operator surfaced 2026-05-05]
**Why:** Live site review on 2026-05-05 surfaced two violations of the locked design principles ("data/math/visuals speak; no methodology reveal") that shipped under the radar: editorial state labels ("TIGHTENING", "STABLE", and similar) and a too-lenient stale threshold on S1 that lets day-old data render without amber. Operator framing: *"extremely unprofessional."* Ships immediately to recover brand voice + freshness signal accuracy.

**Scope (~45-60 min, single PR):**
1. **Strip editorial state labels site-wide.** Find all instances where the engine emits a state-name string into a card chip — likely sources include `s1.regime`, `s2.regime`, `direction` fields, or similar. Map: TIGHTENING / TIGHT / WIDENING / WIDE / STABLE / STEADY / RISING / FALLING / NORMAL / CALM / ELEVATED / HIGH / LOW. Three options per chip:
   - **Remove entirely** (default; matches "data speaks" principle)
   - **Replace with a quantitative micro-descriptor** if the chip is load-bearing visually (e.g. `"Δ −8% / 30d"` instead of `"TIGHTENING"`)
   - **Keep behind a methodology-drawer-only context** if the editorial label is genuinely the methodology talking about itself
   Default: remove. Replace only where removal leaves a visual hole that breaks layout.
2. **Tighten S1 stale threshold.** `workers/lib/defaults.js` `STALE_THRESHOLDS_HOURS.s1` is 36h. DA prices publish daily ~14:00 UTC; threshold should be 24h. Same audit for the other signal keys (s2 48h is reasonable; s5 6h is reasonable; review s7/s8/s9 12h against actual upstream publish cadence).
3. **Audit other opinion-labels** that may have crept in elsewhere: card prose, IntelFeed item summaries, hero copy. Don't ship new editorial; flag for the next pass.

**Out of scope:**
- Underlying staleness fix (data not refreshing) — that's Phase 12.12 #3 (VPS-Python live-fetch pattern extension).
- Source-attribution placement (move from card-face to drawer) — that's Phase 7.7g-b card rebuild.
- 15-min chart hover granularity — that's Phase 12.13 #6 (added below).

**Estimate:** ~45-60 min. Frontend + worker config; worker deploy required for stale-threshold change.

**Sequencing:** ships AFTER Phase 12.9 merges (or in parallel — no overlap). **Highest immediate priority** per operator framing.

#### Phase 12.9.2 — s8 timestamp fix [NEW — surfaced 2026-05-05 during Phase 12.9.1 verification]
**Why:** `/health.signals.s8.age_hours` reads negative (-5.1 observed). Root cause: `fetchInterconnectorFlows()` in `workers/fetch-s1.js:5540` writes ENTSO-E forward-looking slot-end timestamp (`2026-05-05T20:45:00.000Z` for ~15:39 UTC fetch) into the `timestamp` field; `/health` at line 8693 reads `data.timestamp` for age computation, gets a future value, returns negative. Surgical fix: separate write-time from data-slot-end timestamp.

**Scope (~5-15 min, single PR):**
1. **Move slot-end timestamp to a new field** (`data_slot_end` or `interval_end`); set `timestamp = new Date().toISOString()` to match every other signal fetcher's convention in the same file.
2. **Verify no consumer breaks** — grep `s8.timestamp` / `data.timestamp` against frontend + worker. Likely no consumer expects the slot-end semantics.
3. **No tests added** — bug fix has no existing test coverage to touch; in-deploy + curl verification is sufficient.

**Estimate:** ~5-15 min. Worker deploy required.
**Sequencing:** ships AFTER Phase 12.9.1 merges. Independent of Phase 4G; can run before or after.

#### Phase 12.9.3 — Default duration 4h → 2h [NEW — operator surfaced 2026-05-05]
**Why:** Site default duration is currently `4h` across three card surfaces (RevenueCard, S3Card, HeroBalticMap). KKME audience cares more about 2h economics — most contracted Baltic BESS today is 2h (older fleet); financing assumptions converge faster on 2h. 4h is the global frontier-market default; 2h is the local-fleet default. Switch the visible default, keep 4h as toggle option.

**Scope (~5-10 min, single PR):**
1. `app/components/RevenueCard.tsx:1528` — `useState<'2h' | '4h'>('4h')` → `'2h'`
2. `app/components/S3Card.tsx:180` — `useState<Duration>('4h')` → `'2h'`
3. `app/components/HeroBalticMap.tsx:123` — `fetch(\`${W}/revenue?dur=4h\`)` → `dur=2h`

**Estimate:** ~5-10 min. Frontend-only, no worker deploy, no test churn.
**Sequencing:** ships AFTER Phase 12.9.2 merges.

#### Phase 4G — Intel feed encoding + count cleanup
**Scope:** Python URL-decode encoding fix in `scripts/daily_intel.py` (cp1257/latin-1 → UTF-8); one-shot mojibake backfill purge (scan `feed_index` for `Ä[ŠŽ]`/`Å[ĄĮ]`/`Ã[€¶]` patterns); IntelFeed badge `${allItems.length}` vs View-all `${totalAvailable}` denominator alignment.
**Estimate:** ~1.5h.

#### Phase 12.10a — CLAUDE.md discipline patch [NEW]
**Why:** Five discipline rules emerged from Sessions 25-28 process learning. Documenting them in CLAUDE.md prevents future repetition of the same class of mistake.
**Scope (~30 min, single commit):**
1. **Audit-triage rule:** Visual-inference audit claims (no screenshot, no code-level grep, no primary-source check) are hypotheses to investigate, NOT bugs to fix. Code-grep + screenshot + git-log triangulation before scoping fix.
2. **No-hardcoded-temporal-label rule:** No display label asserting "where" or "when" a value comes from without computing it. "Peak h10 EET" must be derived from hourly array.
3. **Named-entity verification rule:** No named entity in published content without verifiable source URL traceable to a commercial registry, press release with specific path, or regulator decision.
4. **Cross-card consistency rule:** Same metric in N display locations must derive from one canonical worker field. Declared in metric registry; CI test enforces.
5. **Roadmap edit-conflict rule:** `_post-12-8-roadmap.md` is operator/Cowork-owned. CC may READ but only commits roadmap changes when explicitly instructed. Default: CC reports needed changes via handover.
6. **No-editorial-state-label rule** [Phase 12.9.1 backlog]: cards must not surface engine-emitted state strings ("TIGHTENING", "STABLE", "RISING", etc.) as chips. Locked design principle: data/math/visuals speak. If a chip is load-bearing visually, use a quantitative micro-descriptor (`"Δ −8% / 30d"`) not an editorial label. CI grep gate forbids re-introduction of stripped state-label literals in card components.

**Sequencing:** ships AFTER Phase 12.10 closes (so the data-discipline rules are anchored in shipped work, not aspirational).

---

### Tier 1 — Foundation (~2-3 weeks)

#### Phase 12.12 — Data integrity infrastructure [PARALLEL TO 7.7g]
**Why:** Phase 12.10 fixes specific discrepancies. Phase 12.12 prevents the next class. The 41-day-stale Litgrid assertion shipped silently. The Saulėtas Pasaulis hallucinated entity passed every existing gate. Quarantine flags are decorative. Without infrastructure, audit findings recur.

**Scope (~7-10 days):**
1. **Schema validation at fetch boundary.** Zod schemas for every upstream API response (`fetchLitgridFleet`, `fetchBTDActivation`, ENTSO-E A44/A75/A65, `fetchEnergyCharts`, ECB Euribor). On schema drift: fail-loud (worker logs + Telegram alert).
2. **Hardcoded-assertion freshness gates.** Every operator-curated value in `s4_buildability` gets `last_verified_against_source_at`. Frontend cards display "Source: Litgrid, verified 41 days ago" with amber chip > 14 days, red > 30 days.
3. **Daily reconciliation cron** [REFRAMED per Phase 12.10 architecture]. The VPS-Python + PostgreSQL + worker-POST pattern shipped in Phase 12.10 for ENTSO-E A68 (installed capacity) is the **template**, not a parallel build. Reframe this item as "extend the existing VPS live-fetch pattern (`scripts/vps/fetch_entsoe_installed_capacity.py`) to AST + Elering + APVA + VERT + ETS" rather than "build live-fetch from scratch in worker". Schema validation + freshness gates (item #1 + #2) wire into the parser's `parse_warnings` field shape. Alerts on > 5% drift; output to KV `reconciliation_log` + `/reconciliation` endpoint.
4. **Per-metric provenance footer.** `<MetricProvenance>` primitive renders source + last-verified-at + computation chain on hover.
5. **Reconciliation test suite (vitest, nightly via GitHub Actions cron)** [CONCRETE STARTING POINT per Phase 12.10]:
   - `app/lib/metricRegistry.ts` declares the canonical `s4.storage_by_country.{LT,LV,EE}.installed_mw[_live]` paths via the `getInstalledMw` selector. CI test greps for raw alternatives (e.g. `sbc.LT?.installed_mw` direct reads bypassing the selector) and fails on bypass.
   - `baltic_total.installed_mw === sum(country installed_mw)`
   - `fleet.baltic_operational_mw >= baltic_total.installed_mw`
   - aFRR P50 documented direction matches text description
   - For each card: source attribution matches worker payload field
   - Same-metric cross-card consistency (declared canonical source per metric in registry; rendering must read from that)
   - Alert on failure to operator's Telegram
6. **Methodology version banner.** Surface `model_version` on every revenue-derived number with link to methodology drawer.
7. **Quarantine flag enforcement.** Items in fleet tracker with `_quarantine: true` excluded from `operational_mw` totals at worker level.
8. **Named-entity verification at intel-feed ingestion** (audit #6 specifies APIs):
   - **Lithuania:** `registrucentras.lt` or `rekvizitai.lt`
   - **Latvia:** Lursoft commercial registry
   - **Estonia:** `inforegister.ee`
   - Not-found entries marked `_entity_unverified: true` and excluded from default `/feed` GET (move to `/feed/unverified` queue)

   **Ingestion-path target (per Phase 12.10.0 Session 29 finding):** the structural
   named-entity verification gate must wire into **`POST /feed/events`** at the
   existing `evaluateFeedItemGates(...)` call in `workers/fetch-s1.js` (~line 6602),
   **not** into `POST /curate` / `appendCurationToFeedIndex`. Saulėtas Pasaulis was
   confirmed to have entered via the typed-event API (id `mna2ne4x-xfri25` matches
   `makeId()` format, has the typed-event field shape, no `cur_` prefix, no repo
   source). The two helpers already exported from `app/lib/feedSourceQuality.ts`
   (`isGenericSourceUrl`, `hasHallucinationHedgeLanguage`) plug straight into that
   gate alongside the commercial-registry API check that 12.12 #8 adds.
9. **Cross-source TSO capacity reconciliation.** Fetch ENTSO-E "Installed Capacity per Production Type [14.1.A]" daily; cross-check against `s4_buildability`; resolves the 484 vs 506 vs 596 LT mess via independent third source.
10. **Legal references auto-fetch:**
    - **e-tar.lt** RSS for Lithuanian primary legislation
    - **vert.lt** decisions feed for regulator decisions
    - **likumi.lv** for Latvia
    - **Riigi Teataja** API for Estonia
    - **EUR-Lex** for EU directives
    Replaces operator-curated legal references with API-fetched canonical titles + effective dates + URLs.
11. **Generic-source-URL detection.** Feed items where source_url matches `^https?://(www\.)?<domain>/?$` (homepage only, no path) get `_generic_source: true` flag; filtered from default /feed.
12. **Time-of-day label discipline.** ESLint rule + CI gate forbidding hardcoded `h<digit>` patterns in TSX components rendering time-series data.
13. **Same-instant cross-source value consistency.** When two cards display same-meaning metric, CI asserts they pull from same worker field.
14. **Quarantine-rule taxonomy review** [Phase 12.10 backlog]. The contradiction detector in `workers/fetch-s1.js` `detectContradictions()` flags Kruonis PSP `_quarantine` because its `source` doesn't match `/TSO|Litgrid|.../i` despite the entry being explicitly `type: 'pumped_hydro'` and Litgrid-confirmed operational. The flag is correct for behind-the-meter BESS but produces false positives on the operational pumped-hydro entry. Refine the C-01 rule to honour `type: 'pumped_hydro'` as a separate evidentiary category. This will move ~205 MW from `quarantined_mw` to `operational_mw_strict` for LT — ahead of any UI that surfaces strict by default in a hard-cutover way.
15. ~~**A68 vs fleet `under_construction` boundary review (EE +92 MW gap)** [Phase 12.10 backlog]~~ **[CLOSED 2026-05-05 by Phase 12.10 follow-up commit `2fa2e72`]**. Resolved as **path (a) strict-commissioned**: Elering's A68 transparency-reporting classification of Hertz 2 (100 MW under construction) as "installed" is a TSO-side reporting choice, not a market-readiness claim; KKME tracks `under_construction` per its commissioning-evidence policy. `storage_by_country.EE.coverage_note` discloses the gap; methodology paper codifies the policy. No further code action.
16. **Curation ingestion encoding-passthrough audit** [Phase 4G backlog]. `POST /curate` accepts operator-pasted strings as-given. Phase 4G found 1 production item (`cur_mo87wkt8-65w5pc`) where upstream encoding mangling (`\xc4\x97` UTF-8 ė interpreted as cp1257 → ÄŠ) carried through KKME unchanged. Decide: (a) detect mojibake patterns at write-time and reject with helpful error; (b) auto-attempt UTF-8 round-trip recovery on common Lithuanian/Latvian patterns; (c) pass through but mark `_encoding_suspect: true` for visual amber-disclosure on intel-feed cards. Recommendation: (a) reject + helpful error guides operator to clean-paste; cheapest, no recovery-heuristic risk.
17. **VPS `daily_intel.py` repo mirror** [Phase 4G #3d operator-deferred]. Phase 4G shipped a defensive `resp.encoding = 'utf-8'` to 3 `requests.get` sites in VPS `/opt/kkme/app/sync/daily_intel.py` via `scp`, but did NOT mirror the post-fix script to `scripts/vps/daily_intel.py` per the Phase 12.10 precedent (which DID mirror `fetch_entsoe_installed_capacity.py`). VPS-only state is audit hygiene tech debt: no version control, no diff against future changes, no rollback if VPS dies. Mirror the current VPS version to repo + add a `scripts/vps/README.md` documenting the scp deploy convention. Estimate: ~30 min via Cowork (scp current state, commit, document).

**Acceptance:** schema-drift detection live; staleness chips visible; reconciliation cron running nightly; quarantine flag enforced (incl. pumped-hydro carve-out from C-01); named-entity verification active; generic-source filter active; CI gates failing on time-of-day hardcodes + cross-card metric divergence; A68/fleet boundary policy chosen + documented.

#### Phase 7.7g — Token rebuild + 5-primitive system
**Why:** Foundation that everything else sits on. Consolidated revision is more disciplined than my prior version: explicit small numbers, no aspirational tokens.

**Splits into seven sub-phases.** Phase 7.7g-a was originally scoped as a single 5-7 day phase but split into 4 sub-phases at session-start of Tier 1 (2026-05-05) per audit-vs-reality findings — significant pre-existing infrastructure (16 primitives, comprehensive `formatNumber()` in `app/lib/format.ts`, 6 next/font fonts loaded with 3 dead, 5+ accent colors with rgba variants) means the work is "audit + drop + extend" not "build from scratch."

##### Phase 7.7g-a-1 — Drop dead font triplet [SHIPPED 2026-05-05 PR #60 → commits `cc36e42` + `5b08c15`]
6 next/font/google loaders (Cormorant, DM Mono, Unbounded, Fraunces, JetBrains Mono, Inter) → 3 (Cormorant, DM Mono, Unbounded). Dead `--type-*` ramp at globals.css:238-244 dropped (orphan-by-association); `app/lib/__tests__/typography.test.ts` deleted (Phase-8.2-era monument that pinned the dead system in place; 6/8 assertions broke on drop). 927 → 919 tests (pure subtraction). No visual change. Bytes-on-wire reduction every page load. Two in-session scope extensions, both operator-approved after triangulation. Process artifact: the `grep -v __tests__` filter in verify-before-act was the wrong default for declaration removal — tests pin systems; recurring-error memory updated.

##### Phase 7.7g-a-2 — Spacing tokens + rollout (~1-2 days)
Components currently use raw px inline (`padding: '8px'`, `margin: '4px'`) instead of CSS variables. Roll out 8-value spacing scale (4 / 8 / 16 / 24 / 32 / 48 / 64 / 96 px) via `--space-*` token additions; migrate component inline-px to tokens; CI grep gate forbids new raw px in component padding/margin.

##### ~~Phase 7.7g-a-3 — Accent color consolidation~~ [SUPERSEDED 2026-05-06 by Phase 18]
~~5 accents (purple / green / teal / rose / amber) + ~15 rgba variants → 3 semantic (`--positive` / `--warning` / `--negative`) + 1 brand `--accent`.~~

**Replaced by Phase 18's Baltic-grounded palette consolidation:** mint → Baltic deep teal `#1a3833` (`--positive`); drop coral; keep Baltic amber `#d4a574` (`--warning`); add brick `#a8324a` (`--negative`, sparingly for live/critical only). The Phase-18 palette is more opinionated than the original 7.7g-a-3 plan — explicitly Baltic-regional, not generic-semantic. CI grep gate from this phase deferred to Phase 7.7g-c.

##### ~~Phase 7.7g-a-4 — Cormorant migration + size system reduction~~ [SUPERSEDED 2026-05-06 by Phase 18]
~~Operator decision recorded 2026-05-05: drop Cormorant entirely. 39 `tier3-interp` usages migrate to `var(--font-body)`.~~

**Replaced by Phase 18's typography swap:** DM Mono → IBM Plex Mono (workhorse, distinctive); Cormorant → Newsreader (editorial-publishing-grade serif). The Phase-18 swap is more positive than the original 7.7g-a-4 plan — Cormorant is replaced with a stronger editorial serif rather than dropped to system fallback. Both via `next/font/google`; token redirects in `app/globals.css`. Font-size scale reduction (6 → 5 sizes) deferred to Phase 7.7g-a-2 since spacing rollout is the natural place to audit the type ramp.

##### Phase 18 — Baltic editorial visual identity ship [NEW 2026-05-06] (~8-12h)
**Why:** Operator-surfaced 2026-05-06 in response to "looks AI-built, needs to read as human-designed." The cumulative effect of small AI-tells across the site (DM Mono workhorse, soft-rounded card corners, mint sentiment palette, symmetric layouts, no editorial scale contrast, no footnote discipline) reads as vibecoded. This phase ships the Baltic editorial direction researched against current best-in-class web design (Mercury, Bryter, Stripe Press, Pentagram editorial work, Order, Build in Amsterdam).

**Scope (~8-12h, single PR, three pause points):**

Foundation group (lands at Pause B):
1. Typography swap — DM Mono → IBM Plex Mono; Cormorant → Newsreader (both via next/font; token redirects)
2. Sentiment palette consolidation — Baltic-grounded (deep teal / amber / brick) replacing mint/coral
3. Card primitive redesign — sharp 0px corners + per-card-type top accent rule (3px border-top per card class)
4. Masthead row — broadsheet feel: pixel-KKME wordmark + italic Newsreader tagline + mono `Vol I · No NN · DD MMM YYYY` issue stamp + Baltic-amber rule below
5. Background polish — site-wide pixel-grid; HeroBalticMap card-glued-on-map fix (full-bleed map + cards layered with proper backdrop); marquee architectural ticks

Editorial polish group (lands at Pause C):
6. Hero number editorial scale — RevenueCard / S1 / S2 / S4 / BalticStorageIndex hero stats get serif Newsreader at 88-96px hairline + italic supporting line
7. Footnote citation discipline — every claim with a source gets superscript anchor tied to footnote at card bottom
8. Bracket-notation source markers — `[src]`, `[as-of]`, `[t-2h]` format replacing prose source footers

**Pause points:** Pause A (discovery + per-card-accent map + masthead text + footnote/pull-quote text approval), Pause B (foundation gates + screenshot diff), Pause C (pre-commit full-page screenshots + bundle size delta).

**Estimate:** ~8-12h CC. Frontend-only, no worker deploy.
**Sequencing:** ships AFTER Phase 29 merges (Phase 29 added the `/methodology` route and BalticStorageIndexCard which Phase 18 will visually polish).
**Prompt:** `docs/phases/phase-18-prompt.md`.

**Supersedes:** Phase 7.7g-a-3 (accent consolidation) + Phase 7.7g-a-4 (Cormorant migration). Reduces scope of Phase 7.7g-b (Card primitive done by Phase 18; remaining: Stat / Badge / Chart / Drawer + worker URL centralization + reconsider source-into-drawer post-bracket-markers).

##### Phase 7.7g-b — Five primitives + card migration (~5-7 days)
5. **Build 5 primitive components,** every card rebuilt from these:
   - **`Stat`** — eyebrow label + hero number + delta + sparkline + footer
   - **`Card`** — consistent padding + border
   - **`Badge`** — 3 variants (status, severity, neutral)
   - **`Chart`** wrapper — consistent title + source row + controls
   - **`Drawer`** — named, counted, expandable
6. **Worker URL centralization** — single `app/lib/worker-url.ts`; migrate 16 sites.
7. **Source attribution moves to Drawer** [operator surfaced 2026-05-05 — *"no need to show the source"*]. Card face renders only the data + freshness chip. Source URL, source name, methodology citation collapse into the `Drawer` primitive ("Reading this card" expandable). Card-face metadata reduced to: hero number, derived chip, micro-chart, freshness tick.

##### Phase 7.7g-c — Regression cleanup + CI gate (~2-3 days)
7. **rgba/hex regression cleanup** — fix 213 rgba violations + 11 hex colors.
8. **Add CI grep gate** — pre-commit hook or `npm run lint:tokens` fails on new rgba/hex/hardcoded URL.

**Acceptance:** every page element expressible as one of the 5 primitives; CI fails on new rgba/hex/hardcoded URL.

---

### Tier 2 — Chapter restructure (~1 week)

#### Phase A — Five-chapter restructure + dot indicator
**Why:** Auditor's central architectural recommendation. Same total scroll length, but eye gets reset between chapters, brain registers progress, returning analyst can jump to chapter 4 by recognizing its silhouette.
**Scope:**
1. Re-group existing sections into 5 chapters per the framing table.
2. Each chapter gets a visibly different layout register (proportions, density, rhythm).
3. **Right-edge floating dot indicator** — 5 dots, fixed position right-middle of viewport, current filled, others outlined. Click → smooth scroll. Hover → tooltip with chapter name.
4. Replace top nav labels with chapter names (Live · Today · Dispatch · Economics · Moving). Anchor scrolling.
5. **Re-bind keyboard shortcuts to 1-5 (chapter numbers)** per consolidated revision. Migrates from S/B/T/R/D/I/C established in Phase 12.8.0 — operator should know this transition is intended.
6. Remove existing top nav clutter — no breadcrumb, no left rail, no command palette. The dot indicator IS the navigation system.
7. **About section** — strip founder bio entirely. One paragraph: what KKME tracks, who it's for, how to get in touch. No name, no photo. Quiet coda.
**Estimate:** ~5 days.
**Acceptance:** scroll progress visible at all times; pressing 1-5 jumps to chapters with 200ms outline flash on destination header.

---

### Tier 3 — Two moments of presence (~2 weeks)

#### Phase B — Composed hero visualization ["WOW" MOMENT #1]
**Why:** Auditor: *"the kind of thing the FT and Bloomberg invest a designer-week in and use for years."* Replaces current multi-widget arrangement with one unified scene.
**Scope:**
1. Map as canvas (existing HeroBalticMap as base)
2. Animated interconnector flow particles, speed proportional to live MW from `/s8`
3. Hero capture number ticks visibly when /s1 polls (digit-flash green/amber 400ms — Bloomberg signature)
4. Side-rail metrics tied to map points by faint connecting lines
5. Live status dot pulses 1Hz with 60% opacity ring
6. Reader sees in three seconds: real-time view of a specific market
7. **Live frequency clock** (audit #7) — small `50.000 Hz · ±X mHz` reading at one corner. From Elering/Litgrid live SCADA. Striking + unique to post-Baltic-sync (Feb 2025) story
8. **Realised-vs-scheduled cable flow delta** (audit #7) — `/s8` adds `scheduled_mw`; render gap as stress-indicator stripe on each cable
**Estimate:** ~6-8 days. **OPERATOR DECISION REQUIRED on scope.**
**Acceptance:** single composed scene reads as one visual unit; live frequency visible; cable stress visible.

#### Phase 12 — IRR sensitivity slider on Returns card [REVISED — ONLY ONE SLIDER]
**Why:** Auditor: *"only one slider, only on this card. Adding interactivity everywhere dilutes it."* Demonstrates what KKME does in a way no static chart can.
**Scope:**
1. ONE slider on Returns card: drag CAPEX from €120 to €262 per kWh
2. IRR / payback / LCOS reflow live
3. Tick marks at the three scenario points (low / mid / high)
4. URL persistence (`?capex=164`) — shareable
5. "Reset to base" button
6. Mobile: vertical layout
**Estimate:** ~5 days.
**Replaces / supersedes:** Phase 7.7c Session 2 (capital-structure sliders) — formally un-queued.
**Acceptance:** dragging CAPEX visibly reflows three downstream numbers without page reload.

---

### Tier 4 — Connection + content layer (~2 weeks)

#### Phase 7.7f — Chart insight upgrade
**Scope:**
1. **DA Arbitrage chart (S1)** — P25–P75 percentile band, dashed median, today's dot labeled
2. **aFRR chart (S2)** — 12-month rolling-average overlay
3. **Dispatch stacked bar (TradingEngineCard)** — overlay DA price line on secondary axis
4. **IRR sensitivity (RevenueCard)** — replace yellow-blob area with **tornado bar chart** ranked by absolute impact
5. **Sparkline + delta beneath every hero number** — universal `HeroDelta` primitive applied to ~30 sites
6. **Per-chart methodology checklist:** task stated in one sentence above chart; today/now marked; reference context (band/baseline/peer); accessible data table for screen readers
7. **Weather overlay on DA price chart** (audit #7) — optional toggle. Wind at 100m + GHI from Open-Meteo (free, no key)
8. **Today vs same-day-last-year toggle** (audit #7) — one toggle, applies to all charts via `<Chart>` primitive (Phase 7.7g)
9. **Capture rate per RES technology** (audit #7) — wind/solar capture ÷ baseload added to S6/Wind/Solar
10. **Negative-price hours per month counter** (audit #7) — single derived number in Chapter 4
11. **Fleet card shows MWh alongside MW** (audit #7) — duration is the actual constraint
**Estimate:** ~7 days.
**Note:** Backtest fix moved to Phase 12.8.1 (Tier 0).

#### Phase 12.13 — Outage data + price-anomaly chart annotations + chart hover granularity [FROM AUDIT #6 + operator review 2026-05-05]
**Why:** ENTSO-E Unavailability feeds publish scheduled and unplanned outages. Auditor: *"huge price drivers."* Currently KKME shows price spikes with no explanation. Operator-surfaced 2026-05-05: hover on every chart shows aggregate (daily/monthly bucket) when underlying data has finer resolution (15-min for BTD, hourly for ENTSO-E DA). Reader sees a chart but can't drill into the actual tick they're hovering. *"I don't know what I'm looking at."*
**Scope:**
1. Worker `fetchEntsoeOutages()` polling Unavailability endpoints daily; KV `outages:scheduled` + `outages:unplanned`
2. Endpoint `GET /events?from=<date>&to=<date>&type=outage|interconnector|regulatory`
3. `<EventAnnotation>` primitive (extends Phase 7.7g `<Chart>` wrapper) — vertical dashed line + tooltip on time-series charts
4. Wire into S1 DA chart, dispatch chart, capture chart
5. Editorial extension: events of type `regulatory` operator-pushed via `POST /events` (UPDATE_SECRET-gated)
6. **Hover granularity** [NEW per operator review 2026-05-05]: every time-series chart's hover tooltip exposes the underlying tick at native resolution. S2/BTD has 15-min resolution → hover surfaces 15-min ticks (not just monthly aggregate); S1/ENTSO-E DA has hourly resolution → hover surfaces hourly ticks (not daily aggregate). Currently both render aggregates only. Sub-implementation: `<Chart>` wrapper (Phase 7.7g) gets `hoverGranularity?: 'native' | 'aggregate'` prop, defaults to `'native'`. Cards that bucket for visual density still render aggregates but expose underlying ticks on hover. **Sequencing dependency:** this sub-item is BLOCKED on Phase 7.7g-b shipping the `<Chart>` primitive — until then, the live site has aggregate-only hovers. Operator decision implicit: accept the aggregate-only-hover live state until 7.7g-b ships.
**Estimate:** ~7-9h (was 6-8h; +1h for hover granularity primitive).
**Sequence:** depends on Phase A's `<Chart>` primitive. Ship as soon as Phase A lands.
**Acceptance:** today's price chart shows vertical line for any Baltic outage in last 7 days; hovering shows detail. No more unexplained spikes.

#### Phase D — Related-card hover layer
**Why:** Auditor: *"the navigation that works best is the one the reader does not need to use."*
**Scope:**
1. `app/lib/card-relationships.ts` — pre-defined lookup table, each metric → 2-3 connected metrics
2. Hover any metric → related metrics elsewhere on page receive subtle outline (1px teal at 0.4 opacity, smooth fade-in)
3. Invisible until hover; never required
**Estimate:** ~2 days.
**Acceptance:** hovering capture lights up DA arbitrage + renewable mix; hovering IRR lights up CAPEX + capture sparkline.

#### Phase 11 — Glossary acronym tooltips
**Scope:**
1. `app/lib/glossary.ts` — `{ acronym: { full, definition, link?, formula?, example? } }`. ~25 terms. Per audit #7, each gets a worked example, not just definition.
2. `<Acronym term="DSCR">DSCR</Acronym>` primitive — dotted underline + hover tooltip
3. Replace plain-text acronyms across cards (start with worst offenders: RevenueCard, TradingEngineCard, S1Card, S2Card)
4. Sync with existing `docs/glossary.md`
**Estimate:** ~3 days.

#### Phase C — Custom illustrations
**Why:** Auditor walked back data-ink doctrine for page-level work. Audit #7 endorses **credibility-ladder funnel** specifically.
**Scope (three illustration moments):**
1. **Dispatch decision schematic** in Chapter 3 — small SVG showing battery cycling through a day with revenue building up by source
2. **Credibility ladder funnel** in Chapter 4 — funnel diagram showing pipeline MW dropping at each stage: speculative → intention → reservation → permit → financial close → construction → operational
3. **Map-derived country icon system** — small consistent icons for country-specific facts site-wide
**Estimate:** ~3-4 days adapted from existing assets, ~1 week if commissioned. **OPERATOR DECISION REQUIRED on path.**
**Acceptance:** three illustrative moments shipped; each communicates a concept that prose alone couldn't.

---

### Tier 5 — Editorial + content layer (~5-7 days build + ongoing)

#### Phase 9 — "Today's signal" editorial band (= Chapter 2 content)
**Scope:**
1. Worker `/digest/today` endpoint
2. Operator hand-writes via `POST /digest/update` (UPDATE_SECRET-gated)
3. `<TodaysSignal>` component reads /digest/today, renders one big sentence + one chart sized to fill the chapter
4. Archive accessible via small "previous days" link
**Estimate:** ~3 days build + ~5 min/day ongoing.
**Acceptance:** populated daily by 10:00 UTC weekdays.
**OPERATOR DECISION REQUIRED:** daily commitment vs Phase 28 weekly-only? (See Decisions section.)

#### Phase 28 — Weekly column [FROM AUDIT #7]
**Why:** Audit #7: *"a short, opinionated weekly column — three paragraphs, signed, with a single chart."*
**Scope:**
1. Worker `/column/latest` endpoint
2. Operator hand-writes via `POST /column/publish` Friday afternoon (UPDATE_SECRET-gated)
3. Surfaces in Chapter 2 on Mon-Fri as supplement; replaces "Today's signal" panel on Sat-Sun
4. Archive accessible via `/column/<slug>` permalink
**Estimate:** ~1 day build + ~30-60 min/Friday ongoing.
**Note:** Pick Phase 9 OR Phase 28 OR both based on operator bandwidth.

#### Phase 13 — Email digest signup
**Scope:**
1. Single signup field on the page (footer + Chapter 5)
2. Resend API (already used by ContactForm)
3. Weekly digest auto-composed Friday morning summarizing week's "Today's signals" + key intel + one chart
4. Track signup count anonymously (no PII)
**Estimate:** ~2 days build + ~30 min/week ongoing.

#### Phase 19 — "Submit market lead" promotion
**Why:** Auditor: *"unique value proposition the site is hiding."*
**Scope:** move CTA from footer to inline card in Chapter 5. Add Credits page listing data sources.
**Estimate:** ~2h.

#### Phase 27 — "What we got wrong" log [FROM AUDIT #7]
**Why:** Audit #7: trust-building counter-positioning. *"Most sites won't do this; the ones that do are trusted."*
**Scope:**
1. `docs/wrongs.md` — version-controlled markdown. Each entry: date, claim, what-happened, what-model-said, lesson.
2. Surfaced via Methodology drawer (Phase A consolidates methodology there).
3. ~5 min commitment when forecast misses materially.
**Estimate:** ~1h infrastructure + ongoing editorial.
**Acceptance:** at least one entry shipped at launch (the v7.3 conservative-bias note from Phase 12.8.1 makes a natural first).

#### Phase 12.14 — Forward-looking platform integration tracker [FROM AUDIT #7] [MOVED FROM TIER 0 — feature add, not bug fix]
**Why:** Three forward-looking signals that change the storage thesis when they shift: Harmony Link timeline (PL→LT subsea HVDC, planned 2030), PICASSO/MARI/IGCC platform integration status per country, capacity-mechanism watch (Lithuania in consultation).
**Scope:**
1. Worker `GET /forward-tracker` returning `{harmony_link, picasso, mari, igcc, capacity_mechanism}` per country
2. Worker fetches ENTSO-E monthly platform reports + scrapes Energetikos ministerija for capacity-mechanism updates (low-frequency cron)
3. Frontend: small footer card in Chapter 5 ("What's moving") titled "Forward calendar" — three rows, each with status badge + next-milestone-date + source link
**Estimate:** ~3-4h.
**Acceptance:** reader sees at a glance when Harmony Link COD shifts, when LT joins MARI, or when capacity-mechanism consultation closes.

---

### Tier 6 — Mobile + accessibility + polish (~1-2 weeks)

#### Phase 11.2 — Mobile pass
**Scope:** per 2026-04-29 audit P3 — render hero map portrait crop, CSS grid hero reorder, topbar metrics scroll-snap, marquee ticker overflow containment, fluid type via clamp(), logo max-width, Playwright snapshot regression at 390×844 + 768×1024. Phase A's dot indicator becomes bottom-of-viewport horizontal dots on mobile.
**Estimate:** ~5-7 days.

#### Phase 20 — WCAG AA + axe-core formal audit
**Scope:**
- Run axe-core against every route, fix every violation
- Particular attention: tertiary text contrast (currently <4.5:1)
- Keyboard navigation: every interactive element reachable by Tab, focus rings visible
- Screen-reader audit: chart `<figure>` + `<figcaption>` + hidden data table per chart
**Estimate:** ~1-2 days.
**Acceptance:** 100% axe-core clean on top routes; zero violations.

#### Phase 21 — Print stylesheet
**Scope:** `@media print` switches to white bg + black text + removes nav/tickers; one chapter per page.
**Estimate:** ~3-4h.

#### Phase 22 — OG image generation
**Scope:** worker `/og?dur=4h&capex=mid` returns 1200×630 PNG with hero state rendered server-side; meta tags wired.
**Estimate:** ~4-6h.

#### Phase 23 — Animated SVG favicon
**Scope:** pixel KKME mark static favicon + animated variant with live-status-dot pulse for browsers that support.
**Estimate:** ~1-2h.

#### Phase 25 — Empty state design
**Scope:** explicit "Quiet hour" / "Source unavailable" / "Awaiting first publication" states for each signal card.
**Estimate:** ~3-4h.

#### Phase 26 — Polish bundle [REMAINING SMALL ITEMS]
**Scope:** items from earlier audits that don't fit elsewhere —
- Audit #1 — duplicated "Dispatch intelligence" eyebrow + section heading
- Audit #3 — hand-drawn arrow in Engine assumptions
- Audit #4 — FCR-reopens callout demote (over-saturated)
- Audit #5 — `v7.3` superscripts removed (move to single footer)
- Audit #12 — duplicate "Start the conversation" CTA dedup
- Audit #14 — top progress bar audit
- "Reading this card" rename → `Methodology (3 paragraphs)` pattern + chevron
- `▸▸` double-chevron typo fix
- External link `↗` standardization via `<ExternalLink>` component
- Bottom marquee KPI dedup vs above
- HeroMarketNow.tsx delete decision (B-009)
- ColorTuner.tsx:60 console.log cleanup
- Map background seam (P4)
- Color semantics conflation (red = COMPRESSED + red = OUTDATED)
**Estimate:** ~4-6h.

---

## Operator decisions

### Resolved
- ~~Light-mode rebuild path (Phase 12.8.0 #1)~~ — **Path D shipped 2026-05-03** (investigation only; chevron fix; full audit-vs-reality writeup at `docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`)

### Pending — needed before Tier 1 launches (~1 week from now)
1. **Typography (Phase 7.7g-a #1)** — drop Cormorant serif (auditor directive — confirmed in consolidated revision) or hold the line on three-typeface principle (locked design principle)? **My recommendation:** drop serif for prose; retain mono for tabular numerals + labels. Locked principles are guidelines, not vows.
2. **Phase 9 vs Phase 28** — daily digest (~5 min/day) vs weekly column (~30-60 min/Friday). Pick one or both.

### Pending — needed before Tier 3 launches (~2-3 weeks from now)
3. **Phase B composed hero scope** — designer-week investment. Confirm scope (frequency clock + cable stress overlay additions are audit-#7 enrichments).
4. **Phase C illustrations** — commissioned (~1 week, design budget) or adapted from existing assets (~3-4 days, in-CC scope)?

### Pending — process decisions (no time pressure)
5. **Notion sync protocol** — should ship-of-phase auto-create Notion entry (CC via MCP from inside CC session) or operator does manually in Cowork after PR merge? Default: operator does manually; Cowork can do batched syncs weekly.

---

## Total estimate

| Tier | Phases | Days |
|---|---|---|
| 0 — Bug fixes + data integrity | 12.8 [SHIPPED] · 12.8.0 [SHIPPED] · 12.10.0 [SHIPPED] · 12.10 [SHIPPED] · 12.8.1 [SHIPPED] · 12.9 [SHIPPED] · 12.9.1 [SHIPPED] · 12.9.2 [SHIPPED] · 12.9.3 [SHIPPED] · 4G [SHIPPED] · 12.10a [SHIPPED] | **TIER CLOSED 2026-05-05** |
| 1 — Foundation | 12.12 (16 sub-items + #17 daily_intel.py mirror) · 7.7g-a-1 [SHIPPED] · 7.7g-a-2 · ~~7.7g-a-3~~ ~~7.7g-a-4~~ · **18** [SHIPPED] · 7.7g-b reduced · 7.7g-c · **12.10b** [SHIPPED] | ~12-15 days |
| 2 — Chapter restructure | A | ~5 days |
| 3 — Two moments of presence | B · 12 | ~10 days |
| 4 — Connection + content | 7.7f · 12.13 · D · 11 · C | ~12-14 days |
| 5 — Editorial + content | 9 · 28 · 13 · 19 · 27 · 12.14 | ~6 days build |
| 6 — Mobile + a11y + polish | 11.2 · 20 · 21 · 22 · 23 · 25 · 26 | ~6-8 days |
| 7 — Methodology depth + comparable index | 30 [SHIPPED] · 29 [SHIPPED] · 29.1 (per-country extension) | ~3-4 days |
| **Total** | **32 phases** | **~58-69 focused days ≈ 10-12 weeks** |

---

## Dependencies + sequencing

- **Tier 0 ships this week** — highest impact-per-hour. As of 2026-05-05: 12.8 / 12.8.0 / 12.10.0 / 12.10 / 12.8.1 / 30 (research) all SHIPPED; 12.9 in flight (PR #53 awaiting merge); next: **12.9.1 (brand discipline, HIGHEST PRIORITY) → 4G → 12.10a**, then Tier 1.
- **Tier 1 (12.12 + 7.7g)** runs in parallel — different files, different concerns. 7.7g is the foundation; 12.12 is the integrity infrastructure. Both unlock Tier 2+.
- **Tier 2 (Phase A)** depends on Tier 1's `Chart`, `Stat`, `Card` primitives. Sequence after.
- **Tier 3 (Phase B + Phase 12)** can run parallel to each other; both depend on Tier 1's `Chart` primitive.
- **Tier 4 phases** mostly parallel — chart upgrades, hover layer, glossary, illustrations independent. Phase 12.13 explicitly depends on Phase A's `<Chart>` primitive.
- **Tier 5** is editorial-commitment-heavy. Build is small; sustaining digest/column is operator's ongoing work.
- **Tier 6** is the polish-and-correctness pass. Mobile is the largest single item.

**Deferred / un-queued (per consolidated revision):**
- ⌘K command palette (overkill at scale)
- Alerts layer (no login, no paying users yet)
- Historical scrubber (no audience)
- ~~Methodology as separate destination (keep inline as drawer)~~ → **REOPENED 2026-05-04 by Phase 30.** Standalone `/methodology` route now recommended (mirrors cleanhorizon.com publishing pattern) for the public-facing methodology paper at `docs/methodology.md`. **Operator decision still pending.** If chosen, `/methodology` destination decision lands as part of Phase A's chapter restructure or as a small dedicated phase.
- Multi-page architecture (worsens current audience experience)
- Workspace / paid tier (no audience to justify)
- Founder bio in About (mystery is brand asset)
- Comparison views with peer benchmarks (defer; LT/LV/EE side-by-side stays as later nice-to-have)
- ~~Chart annotations / event lines~~ → resurrected as Phase 12.13 with concrete data source (ENTSO-E Unavailability)

---

## Update protocol

When a phase ships:
1. Mark its entry above with `[SHIPPED <date> PR #N]`
2. Move shipped entry to "Shipped appendix" below
3. Sync canonical state into `docs/handover.md` Session log
4. Create Notion Tasks DB entry, mark Done
5. Update "Currently active" header at top to reflect new in-flight + next-job

This document is the planning layer; `docs/handover.md` is the canonical state-of-the-world layer. When they diverge, handover wins (per `CLAUDE.md`).

**Edit-conflict rule:** roadmap is operator/Cowork-owned. CC may READ but only commits roadmap changes when explicitly instructed in the prompt. Default: CC reports needed changes via handover; operator applies via Cowork.

---

## Shipped appendix

- **Phase 12.8** — Dispatch render-error fix [SHIPPED 2026-05-03 PR #46] — defensive guards + CardBoundary upgrade; preventive hardening; 6 throw-eligible candidates fail-then-pass verified; 837 → 866 tests
- **Phase 12.8.0** — Tier 0 hot-fix bundle [SHIPPED 2026-05-03 PRs #47 + #48 → commits `652b551` + `67c0d96`] — 866 → 882 tests; light-mode investigation (audit hallucination), percentile static labels, keyboard SOT + outline flash + ?-overlay, ticker pause+fade. Process artifact: `docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md` documents the 3-of-4 visual-audit-#2 hallucination tally.
- **Phase 12.10.0** — Emergency hallucinated-entity purge (Saulėtas Pasaulis) [SHIPPED 2026-05-04 PR #49 → commit `85ec7f8`] — 882 → 893 tests; new `POST /feed/delete-by-id` worker endpoint (UPDATE_SECRET-gated); two hallucination-marker helpers exported (`isGenericSourceUrl`, `hasHallucinationHedgeLanguage`) for Phase 12.12 #8 to wire structurally; ingestion-path traced to operator hand-pushed `POST /feed/events` with externally-LLM-drafted content; entity removed from production `/feed` (`mna2ne4x-xfri25`, before:9 → after:8). Worker version `043fd2cb-1146-4d96-95c2-0ecb2864f5d7`.
- **Phase 12.10** — Broader data discrepancy hot-fix bundle [SHIPPED 2026-05-04 PR #50 → commit `02a64ea`] — 893 → 914 tests (+21); ENTSO-E A68 (B25) live-fetch architecture via VPS-Python + PostgreSQL + worker POST (NEW, template for Phase 12.12 #3); `installed_storage_<c>_mw_live` surfacing in `/s4` with `getInstalledMw` selector preferring `_live` over hardcode; soft quarantine companion fields per country; LT distribution-grid + EE A68/fleet 218 vs 126.5 gap coverage_notes; Elering €74M `macro_context` on `/s2`; HeroBalticMap "BALTIC FLEX FLEET" rename + tooltips + amber quarantine disclosure; S4Card uses selector + EE/LV "awaiting TSO confirmation" footers; computePeakTrough slice-idx → UTC clock-hour fix; "DA CAPTURE 4h" marquee disambiguation; aFRR Path-1 direction disclosure on S2Card; NREL ATB cite swap (worker + RevenueCard); APVA tuple weakened with verified APVIS portal link; €25/kW soft-removed; 752/3,600 marquee inline computation chain; IRR/DSCR/CAPEX assumptions footnote on RevenueCard. Pause B load-bearing finding: A68 returns LT 426 / LV 90 / EE 218 MW; two parser bugs caught + fixed pre-deploy (wrong XML namespace, Element-truthiness gotcha). Worker version `99458af7-2834-4232-9600-2b1250b02896`.
- **Phase 30** — Clean Horizon methodology research + KKME methodology paper [SHIPPED 2026-05-04 PR #51] — research-only, no code/tests/deploy. 3 docs across `phase-30-methodology-research` branch: `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md` (217 lines, 12 dimensions, 16 Clean Horizon sources cited), `docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md` (240 lines, 5 gaps prioritized), `docs/methodology.md` (350 lines, public-facing methodology paper at Clean-Horizon-comparable rigor). Headline finding: Gap #5 — KKME aFRR-down €5.03/MW/h vs Clean Horizon Baltic ~€340/MW/h order-of-magnitude mismatch; folds into next Phase 12.10 follow-up scope (NOT a new phase). Methodology paper rendering destination decision deferred (recommended `/methodology` route). Position C confirmed: independent Baltic flexibility platform with own methodology.
- **Phase 12.8.1** — Backtest dashed-line caption clarification [SHIPPED 2026-05-04 PR #52] — 914 → 918 tests (+4 MAE cases); MAE field added to `backtestStats` (sign-stripped magnitude alongside sign-bearing meanErrorPct in `app/lib/backtest.ts`); two-line caption in `RevenueBacktest.tsx` explicitly names dashed-line as Y1 model anchor (€/MW/day, scenario, conservative bias) + reports realised vs model with sign-bearing % AND MAE; tail flips between "intentionally conservative" (realised > model) and "recalibration triggered" (realised < model, amber sentiment-warning token); `scenario?: string` prop wired from RevenueCard. Path-1 in-place edit per CC's §10 halt (prompt assumed caption was in RevenueCard.tsx; actually inside RevenueBacktest.tsx — discipline rule honored). Pause A captured production numbers €348/MW/day modeled, +74.0% mean realised, MAE €254/MW/day over 13 months — confirms engine v7.3's intentional conservative bias. Frontend-only, no worker change.
- **Phase 12.9** — Worker + header KPI hot-fix bundle [SHIPPED 2026-05-04 PR #53 → commit `82474cc`] — 918 → 927 tests (+9 EUA trend cases); SignalBar S/D RATIO migration s2.sd_ratio → s4.fleet.sd_ratio; `/da_tomorrow` last-good fallback (`da_tomorrow:lastgood` KV mirror, X-Stale header on stale serve); `/health` endpoint expansion 6 → 14 keys (11 canonical signals + 3 data: `da_tomorrow`, `da_tomorrow:lastgood`, `extreme:latest`); `/extreme/latest` is_stale flag for cached events > 24h old; `/s9.eua_trend` regenerated from `s9_history` via pure `computeEUATrend(history, currentValue)` in `workers/lib/eua_trend.js`. Worker version `8320c11c-8bec-4b9b-92d8-30afafbdf24d`. `all_fresh` flipped true → false meaningfully (vacuous over 6 keys → honest over 14).
- **Phase 12.9.1** — Brand discipline pass [SHIPPED 2026-05-05 PR #55 → commit `96cc677`] — 927 tests (no new); editorial state-name chips stripped from S1, S2, S4, S7, S9 cards (TIGHTENING / STABLE / HIGH / ELEVATED / etc. → quantitative micro-descriptors like `≥P90 / 30d`, `+45% / P50`, `1.04× / 70 €/t threshold`); engine `derivePhase()` retained for sentiment-color drive only; `STALE_THRESHOLDS_HOURS` tightened (s1: 36→24, s4: 36→24); CI grep gate `lint:no-editorial-chips` blocks future re-introduction. Worker version `ff9ed839-f609-462c-bb80-5cf2bcac6a4e`. Operator-framing as "extremely unprofessional"; same-day fix.
- **Phase 12.9.2** — s8 timestamp fix [SHIPPED 2026-05-05 → commit `e8c2654`] — 927 tests (no new); `fetchInterconnectorFlows()` `timestamp` field reset to `new Date().toISOString()` (canonical "as-of-write"); ENTSO-E forward-looking slot-end value preserved as new `data_slot_end` field. Resolves Session 34 backlog #1 (`/health.signals.s8.age_hours = -5.1`). CC's §10 halt caught a prompt assumption: upstream is `energy-charts.info` CBET, not ENTSO-E (same fix shape, different upstream attribution). Worker version `456cf230-10fd-4135-9270-beade824a2b4`.
- **Phase 12.9.3** — Default duration 4h → 2h [SHIPPED 2026-05-05 → commits `ec85338` + `6d4922c`] — 927 tests (no new); 3-line frontend flip across `RevenueCard.tsx:1528`, `S3Card.tsx:180`, `HeroBalticMap.tsx:123`. KKME audience defaults to 2h economics (most contracted Baltic BESS is 2h; financing assumptions converge faster on 2h). 4h remains as toggle option. No worker deploy.
- **Phase 4G** — Intel feed encoding + count cleanup [SHIPPED 2026-05-05 → commits `8e14a5f` + `72f8379`] — 927 tests (no new); IntelFeed badge + View-all link converged on `allItems.length` denominator (option (a)) at `IntelFeed.tsx:1311`; defensive `resp.encoding = 'utf-8'` added to 3 `requests.get` sites in VPS `daily_intel.py` (scp'd, not mirrored to repo); 1 production mojibake item purged via `POST /feed/delete-by-id` (cur_mo87wkt8-65w5pc). **Audit-vs-reality finding (load-bearing):** Phase 4G's premise — that `daily_intel.py` URL-decodes as cp1257/latin-1 — was empirically false. Repo + VPS grep for `unquote | cp1257 | latin-1` → zero matches. Live litgrid scrape returns charset=utf-8 and decodes correctly. The 1 mojibake item came via `POST /curate` (operator-pasted), with `\xc4\x97` (UTF-8 ė) interpreted as cp1257 → ÄŠ upstream of KKME entirely. Same audit-vs-reality pattern as Phase 12.8.0 light-mode investigation. **Actual scope ~20 min vs estimate ~1.5h.** Curation-encoding investigation queued as Phase 12.12 #16.
- **Phase 12.10a** — CLAUDE.md discipline patch [SHIPPED 2026-05-05 → commits `f15a371` + `68ef9ba`] — 927 tests (no new); CLAUDE.md +19 / -2 added "Discipline rules" section codifying six rules (audit-triage, no-hardcoded-temporal-label, named-entity verification, cross-card consistency, roadmap edit-conflict, no-editorial-state-label) with origin-incident traces; "Current phase" section refreshed from stale Phase-2B-1 reference to Tier-0-closing state. Documentation-only, no code/worker change. **Closes Tier 0.**
- **Phase 7.7g-a-1** — Drop dead font triplet [SHIPPED 2026-05-05 PR #60 → commits `cc36e42` + `5b08c15`] — 927 → 919 tests (pure subtraction); 6 next/font fonts → 3 in `app/layout.tsx`; dead `--type-*` ramp + dead Phase-8.2-era `typography.test.ts` removed (both orphan-by-association). Two in-session scope extensions operator-approved after triangulation. **First Tier 1 sub-phase shipped.** Process artifact: recurring-error memory updated re: `grep -v __tests__` is wrong default for declaration removal.
- **Phase 12.10 follow-up** — Gap #5 reconciliation + EE A68/fleet boundary policy [SHIPPED 2026-05-05 PR #61 → commits `2fa2e72` + `191c548` + `4535fc9`] — 919 tests (no new). Methodology paper updated with two paragraphs documenting (1) Gap #5 reframing per CC primary-source verification of Clean Horizon's "Baltic S1 2025 Price Forecasts" Jun 2025 (€340/MW/h was Apr–mid-Jun 2025 launch-window aggregate-Baltic; not present-day comparable to KKME's post-integration €14/MW/h LT) and (2) EE A68/fleet boundary policy (strict-commissioned chosen, path (a); Hertz 2 stays `under_construction`). Worker `/s2.macro_context.afrr_methodology_note` field added (626 chars) so S2 card methodology drawer surfaces the disclosure to live readers without depending on `/methodology` route decision. Worker version `ea88ccc9-0b45-46e6-87cc-b0afbac7407d`. **Closes Phase 30's P1 critical Gap #5 finding; unblocks Phase 29.** Mid-session cross-actor race (operator's parallel Cowork roadmap commit `face05f` arrived during CC's deploy/commit flow) recovered cleanly via branch-ref-forward + main-reset + edit-replay; discipline lesson saved to memory.
- **Phase 29** — KKME Baltic Storage Index [SHIPPED 2026-05-06 PR #62 → commit `69d482c`] — 919 tests; first public-facing Tier 1 product surface. Worker `GET /index/baltic` + `POST /index/update` (UPDATE_SECRET-gated), `/methodology` standalone route via react-markdown + remark-gfm, `BalticStorageIndexCard` rendered in Chapter 4 (`#revenue`), VPS Python aggregate script + PostgreSQL append-only history table. **Coverage scope: option ε at Pause A** — LT/{2h,4h} canonical (LT/2h=€284.4, LT/4h=€306.6 for Apr 2026 in production deploy); LV, EE, and 1h slots ship `coverage_status` strings (`pending_phase_29_1` and `pending_engine_1h_physics` respectively) per discipline rule #1 + #6 transparency framing. **Methodology paper +1 new "KKME Baltic Storage Index" section** documenting calculation (engine `/revenue.backtest` reshape × 30 / 50 MW), launch coverage profile, comparability framing vs Clean Horizon, annualization, source-of-truth + cadence. **Phase 30 destination decision resolved by this commit** (was Operator-action-item #4 — closed). Worker version `3c77897f-62ec-4dff-90c7-4aa94f052f47`. **VPS Python deploy COMPLETE 2026-05-06**: scripts/vps/baltic_storage_index.py + sql/002 migration deployed; daily cron 30 6 * * * active; first live `[DB] inserted 9 rows` + `[WORKER] POST {'ok': True}` confirmed. Mid-session git-state recovery noted (operator's parallel Cowork commit `22f6f27` arrived; recovered cleanly via ref-move). Phase 29.1 spun out as dedicated follow-on for per-country DA capture extension + 5-product cap-reservation extraction (~3-4h) to close LV/EE.
- **Phase 18** — Baltic editorial visual identity ship [SHIPPED 2026-05-06 PR #63 → commits `e160c77` / `36c8ac7` / `db00eac` / `473dcd2` / `ac5b179`] — 919 tests (1 pinned-token updated for editorial-serif lock); ~143 KB Latin-only bundle (-13% vs baseline). **Operator-surfaced 2026-05-06 in response to "looks AI-built, needs to read as human-designed."** Foundation: typography swap DM Mono → IBM Plex Mono [400, 500] + Cormorant → Newsreader [200, 400, 400-italic] via @fontsource imports (literal family names so SVG attrs + chart.js Canvas 2D resolve correctly); 33 hardcoded font-family sites migrated (9 Cormorant Garamond / 1 Cormorant / 10 Unbounded / 13 DM Mono); `--accent-rose` dark retuned to `#a8324a` brick (matches light); `--positive` / `--negative` aliases added mapping to existing `--success` / `--danger` (back-compat); sharp 0px corners across `.card` / `.card-tier1-feature` / `.card-tier3` + 8 inline card-shaped sites; per-card-type accent classes `.card--revenue` (deep teal) / `.card--balancing` (amber) / `.card--neutral` / `.card--live` (brick) wired to 11 wrappers; site-wide dotted pixel-grid via `--pixel-grid-dot` token + radial-gradient body::before; broadsheet masthead `<header>` with KKME wordmark + italic Newsreader tagline + mono `Vol I · No 128 · 06 MAY 2026` issue stamp + 0.5px Baltic-amber rule + bracket source-row + 24-tick architectural marquee row. Editorial polish: Newsreader 200 hairline hero scale on S1 / S2 / RevenueCard / BalticStorageIndexCard + MetricTile primitive (clamp 40-64px tier3, 56-88px tier1); footnote citation discipline real-anchors-only per operator's no-fabricated-§ rule (no methodology.md additions needed; every cited topic has real anchor); per-section pull-quotes on §1 / §4 / §6 (Baltic flexibility / Reference-asset economics / Pipeline movements); SourceFooter primitive refactored to bracket-notation `[src] / [as-of] / [class]` flowing to ~21 consumers without call-site changes. 18 visual-audit screenshots in `docs/visual-audit/phase-18/full/`. §4d hero-glued dropped (empirically false; 3-col grid had clean separation). §6e nice-to-haves (S·II archival stamp, ornament dingbats, brick live-dot) deferred as foundation already pushed identity hard. Supersedes Phase 7.7g-a-3 (accent consolidation) + Phase 7.7g-a-4 (Cormorant migration); reduces Phase 7.7g-b scope (Card primitive done; Stat / Badge / Chart / Drawer + worker URL centralization remain).

(more populated as phases close)

---

## Tier 7 — Methodology depth + comparable-index publication (~2 weeks)

Added 2026-05-04 after operator's Clean Horizon competitive-positioning question. Position chosen: **(c) independent Baltic flexibility platform with own methodology** — not "free version of Clean Horizon" (positions as discount product) and not "Lithuanian-deep complement to Clean Horizon" (anchors identity to competitor). Independent peer requires matching their methodology rigor + publishing equivalent benchmark.

#### Phase 30 — Clean Horizon methodology reverse-engineering + KKME engine gap analysis (research, ~2-3 days) [RESEARCH DELIVERABLES SHIPPED 2026-05-04 — branch `phase-30-methodology-research`]

**Shipped artifacts:** `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md` (12-dimension comparison), `docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md` (5 gaps prioritized), `docs/methodology.md` (public-facing KKME methodology paper at Clean-Horizon-comparable rigor). 16 Clean Horizon public sources cited.

**Headline finding (P1 critical, folded into Phase 12.10 follow-up scope above):** Gap #5 — KKME's published aFRR-down €5.03/MW/h is order-of-magnitude lower than Clean Horizon's published Baltic average ~€340/MW/h. Either KKME is reporting realised €/MWh-activated rather than reservation €/MW/h, OR the engine is computing a different product. Reconciliation needed before any side-by-side numerical comparison is published on the live site.

**Why:** Clean Horizon's Storage Index is the institutional benchmark KKME would be measured against by sophisticated readers. Their COSMOS simulation is paywalled (delivered via Nord Pool subscription) but their methodology is partially public — Intersolar 2025 talk, October 2025 + January 2026 update notes, monthly market updates. Reverse-engineering as much as the public material allows lets KKME (a) confirm its v7.3 engine is methodologically comparable on the dimensions COSMOS exposes; (b) identify gaps where KKME is genuinely behind (cannibalization, multi-market simultaneous bidding, etc.); (c) publish KKME's own methodology paper at comparable rigor.

**Scope (research deliverable, not code):**
1. **Read all public Clean Horizon material:**
   - Intersolar 2025 Michael Salomon talk on BESS revenue models
   - PVTP article ("Unlocking BESS revenues in Europe's key markets", Storage & Smart Power 86, May 2025)
   - October 2025 European BESS market update (their first explicit methodology summary)
   - November 2025 + December 2025 + monthly Storage Index posts (track update cadence + framing changes)
   - January 2026 methodology update (the cannibalization extension — "actual volumes available on capacity reservation and energy activation markets, as well as installed storage capacity")
   - Baltics-specific announcement + per-country revenue-stream disclosures
   - Energy-Storage.News Clean Horizon-bylined articles
2. **Extract methodology assumptions** into a structured comparison document at `docs/research/clean-horizon-methodology-vs-kkme-v7.3.md`:
   - Per-product participation logic (which markets each MWh visits in priority order)
   - SoC management + cycling discipline
   - Activation rate modeling per product per country
   - Cannibalization model (installed_storage_capacity × actual market volume)
   - Cross-product allocation (FCR + aFRR + mFRR + DA simultaneous bidding when SoC permits)
   - Annualization assumption ("year = 12 repetitions of same month")
   - RTE / degradation / availability assumptions
   - CAPEX / OPEX / financing assumptions (where disclosed)
3. **Side-by-side comparison vs KKME v7.3 engine** (read `workers/fetch-s1.js` `computeRevenueV7` + sub-functions, document each assumption + parameter):
   - Direct reads of throughput cycle calculation, RTE decay curves, augmentation modeling, dispatch logic
   - Where KKME matches Clean Horizon: confirm + add citation in KKME methodology copy
   - Where KKME is more sophisticated: highlight (e.g., live sub-daily data vs Clean Horizon's monthly aggregate)
   - Where KKME is less sophisticated: log as engine improvement backlog (likely items: cannibalization model refinement, multi-market simultaneous-bidding cascade, activation-rate quantile correction)
4. **Gap closure backlog** in `docs/research/kkme-engine-improvements-from-clean-horizon-comparison.md`: each gap as a discrete engine improvement Phase 7.7e+ items can pull from. Estimate per item.
5. **KKME methodology paper** in `docs/methodology.md` (or `app/methodology/page.tsx` if Phase A's inline methodology drawer isn't yet built): public-facing explanation of KKME's revenue model at the rigor Clean Horizon publishes — written for institutional reader, not for casual visitor. Cites Clean Horizon's framework where KKME aligns; explains where KKME diverges and why (live data, project-finance lens, Baltic-deep specifics).

**Deliverables:** 3 docs (methodology comparison, gap backlog, KKME methodology paper). No code changes in this phase.

**Estimate:** ~2-3 days research + writing. Best done as a Cowork session (research-heavy, web-fetch-heavy) or CC session with WebSearch.

**Sequence:** runs in parallel to Tier 0 / Tier 1 (no code dependencies). Ship before Phase 29 — its findings inform what the index card should compute.

**Operator decision required:** publish the methodology paper as inline drawer (Phase A consolidates methodology there) OR as standalone `/methodology` route. Auditor's consolidated revision walked back standalone methodology destination; this is the one case worth re-considering since methodology depth IS the credibility play vs Clean Horizon. **Recommendation:** standalone `/methodology` route. Clean Horizon publishes monthly methodology updates as standalone blog posts; KKME needs a comparable destination to be linkable in trade press / cited externally.

#### ~~Phase 29 — KKME Baltic Storage Index~~ [SHIPPED 2026-05-06 PR #62 → commit `69d482c`; full entry in Shipped appendix]

**Phase 30 finding informs:** Position C confirmed; Clean Horizon ingestion legal/IP risk documented in research deliverable; comparable-index framing validated. **Blocker:** Gap #5 (aFRR-down magnitude reconciliation) must resolve before this phase ships, otherwise published index would contradict Clean Horizon's published numbers without methodological explanation. Gap #5 work folds into next Phase 12.10 follow-up commit.

**Why:** Position (c) requires KKME to publish a comparable monthly benchmark, not just live current-day data. Clean Horizon's Storage Index is monthly per country per duration; KKME currently has no monthly aggregate suitable for cross-period or cross-country comparison. This phase ships KKME's own equivalent — methodologically separate, computed from KKME's live primary-source ingestion (not COSMOS sim), free, public, monthly cadence.

**Scope:**
1. **Worker route `GET /index/baltic`** returning:
   ```json
   {
     "month": "2026-04",
     "lt": { "1h": 12345, "2h": 18234, "4h": 22456 },
     "lv": { "1h": ..., "2h": ..., "4h": ... },
     "ee": { "1h": ..., "2h": ..., "4h": ... },
     "methodology_url": "https://kkme.eu/methodology",
     "comparable_clean_horizon_published": true,
     "last_updated_at": "2026-05-01T00:00:00Z"
   }
   ```
   Values in €/MW/month annualized to match Clean Horizon's framing (assumes month conditions repeat for 12 months).

2. **Computation:** monthly aggregate from existing engine output. Cron daily computes month-to-date + previous-month-final. Stored in PostgreSQL `kkme_baltic_storage_index` table on VPS (history preserved per Phase 12.10 architecture pattern); snapshot POSTed to worker via `/index/update` (UPDATE_SECRET-gated).

3. **Frontend:** new card in Chapter 4 (Economics) or Chapter 5 (What's moving). Renders monthly index with trailing 6-month sparkline per country per duration. Tooltip: "Per Phase 30 methodology paper; comparable framing to Clean Horizon Storage Index (Nord Pool); KKME values computed from primary-source ingestion."

4. **Methodology link** prominent on the card — clicking opens Phase 30's methodology paper at the section explaining the index calculation specifically.

5. **Comparison framing on the card** (NOT data ingestion): one line citing Clean Horizon as the institutional reference: *"For cross-European context: Clean Horizon Storage Index (Nord Pool subscription) covers 15+ countries with COSMOS simulation methodology. KKME's index is independent + Baltic-deep + free."*

6. **Non-goals explicitly:**
   - Don't ingest Clean Horizon's data (legal + brand risk per operator's prior decision)
   - Don't display Clean Horizon's published numbers (paywall + IP)
   - Cite their methodology framework only

**Estimate:** ~4-6h (worker route + Python script for monthly aggregate + frontend card). Depends on Phase 30 (methodology paper informs computation).

**Sequence:** ships AFTER Phase 30. Both run after Tier 0 closes.

**Acceptance:** monthly index published per country per duration; methodology paper linked from card; trailing 6-month sparkline rendering; comparable framing to Clean Horizon without data redistribution.

---

## Audit #7 backlog (deferred — not in current 9-11 week plan)

Audit #7 catalogued ~30 features across 13 categories. The high-leverage subset was incorporated into Phase B / Phase 7.7f / Phase C / Phase 11 / Phase 12.13 / Phase 12.14 / Phase 27 / Phase 28. Everything below is deferred — captured here so it doesn't fall out of plan, but explicitly NOT scoped per the consolidated revision's "stay single-page, denser-not-broader" principle.

**Data enrichments (defer — could fold into existing cards in future polish pass):**
- BTD activated bids per MTU (granular detail; needs workspace tier)
- NVE Nordic reservoir levels (already partial in S6; could be enriched)
- Polish coal-fleet generation + PL→LT flow detail
- ENTSO-E "Total Commercial Schedules [12.1.F]" for richer cross-border data
- Industrial load flexibility DSR potential (cement, steel, ammonia)
- Heat-pump installation pace per country
- EV penetration + V2G addressable fleet
- Hydrogen-electrolyser pipeline
- District-heating power-to-heat
- Behind-the-meter solar growth

**Reframings of existing cards (defer — interesting but adds complexity):**
- €/MW/day card as probability distribution (10/50/90 fan instead of point estimate)
- IRR card as Monte Carlo with multiple sliders (consolidated revision: ONE slider only)
- Live curtailment estimate (RES production minus what system can absorb)

**Feature categories not in current scope:**
- Comparisons LT vs UK / ERCOT / Nordic / Iberia / Poland (UK as canonical reference is lowest-effort first if/when this resurfaces)
- M&A ticker for Baltic flexibility
- Equity raises + project-finance closings tracker
- LCOS curves per country
- Negative-price hours study (one-off piece, not infrastructure)

**One-off pieces (interesting essays, dedicated content effort):**
- Sync-day retrospective: "What actually happened the day Baltic sync went live, hour by hour"
- Backtest of simple BESS strategy 2020-2026 per Baltic country
- Olkiluoto-3 Finnish price effect on Estonia
- Saltholm cable counterfactual using SE4 prices
- Study of four largest negative-price hours since sync

**Format / engineering ideas (defer — operational burden too high or audience expansion):**
- Scrollytelling Baltic 2019 → 2026 sequence
- Small multiples grid (12 mini-charts per month)
- Embeds / iframe widget for third-party sites
- Printable monthly PDF (Phase 21 print stylesheet covers basic)
- Daily one-tweet auto-post

**Counter-positioning ideas (some KEPT, others deferred):**
- "What we got wrong" log — KEPT as Phase 27
- Useful glossary with examples — KEPT as Phase 11 enrichment
- URL-calculator (paste CAPEX, get IRR) — overlaps with Phase 12 sensitivity slider
- User submission feature for project sightings (moderation infra; defer)

**Slightly weird (defer — niche, operationally heavy):**
- Sentinel-2 satellite-imagery diff for known BESS sites
- "BESS visible from space" gallery
- Hard-hat photo essays per site
- Audio explainers (60-second clips)
- Weekly podcast
- Interactive timeline of every TSO press release since sync
- Developer leaderboard (already partially in /s4 fleet)
- Leaked-document analysis (legal risk)
- "What your project would have earned yesterday" calculator

**Adjacent reader pools (defer — explicit audience expansion against current focus):**
- Journalists (one-chart-screenshot widget)
- Lawyers / policy advisers (regulatory-change clean page with redline)
- Academics (CSV downloads with proper citations / DOIs)
- Equipment vendors (project pipeline tracker)
- Lenders / ECAs (back-test page for DSCR sensitivity)

**Non-visual matters (some KEPT, others deferred):**
- Unique URL per scenario — KEPT as Phase 13
- Version history on every chart — KEPT as Phase 12.12 #6
- Data freshness green/amber/red dot per source — KEPT as Phase 12.12 #2
- Short opinionated weekly column — KEPT as Phase 28
- Reading list quarterly — defer
- List of who's cited the site — defer (needs adoption first)

**Cross-domain inspiration mappings** (sportradar / flightradar / epexspot / Bloomberg cards / Stripe status) — framing reminders, not phases. Hold in mind during Phase B + Phase 7.7g design.

---

**End of roadmap.**
