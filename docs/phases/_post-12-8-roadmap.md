# KKME execution roadmap

**Authored:** 2026-05-03 from Cowork after seven external audits + endpoint sweeps + CC investigations.
**Last revised:** 2026-05-03 (post-Phase 12.8.0 Pause B; cleanup pass — added Currently-active, Tool-division, Quality-gates, audit-credibility taxonomy; renumbered Phase 12.12; reordered Tier 0; moved Phase 12.14 to Tier 5; added Phase 12.10a discipline patch; restructured operator decisions).

**Edit protocol** (per session-27 process learning): this roadmap is **operator/Cowork-owned**. CC may READ it but only commits roadmap changes when explicitly instructed in the prompt. Default: CC reports needed changes via handover; operator applies via Cowork. Prevents the multi-actor edit-conflict pattern that produced the messy numbering in earlier versions.

---

## Currently active

- **In flight:** none — operator at clean main. Phase 18.2.3 SHIPPED 2026-05-07 (2 commits `74489d4` / `a0423b2` on `phase-18-2-3-tooltip-dismiss-mobile` merged to main). Tooltip dismiss-on-scroll + touchend-with-250ms-grace mobile fix; +30 lines in `ChartTooltip.tsx`; gates baseline-exact; bundle delta below KB-rounding noise floor; verified zero `stopPropagation` interference on touch events. Universality confirmed: scroll-dismiss is additive on desktop, primary fix on mobile.
- **In flight:** none — operator at clean main. Phase 21.2 SHIPPED 2026-05-07 (3 commits `f9d0db9` / `38776d9` / `ab33929` on `phase-21-2-monthly-trajectory-kv-fix` merged to main; worker version `b2152be9-ed8b-4e71-9f09-9c11d96d273a` deployed at Pause B). Operator-run backfill curl confirmed: `source_count: 48 / target_after: 48 / added: 47`; capacity_monthly length recovered from 1 → 3 (Mar/Apr/May 2026). S2 drawer "Monthly trajectory" chart re-activated.
- **In flight:** none — operator at clean main. Phase 7.7g-a-3 SHIPPED 2026-05-07 (5 commits `8858f35` / `cc7406f` / `c6498b4` / `852e2f2` / `d19f783` on `phase-7-7g-a-3-typography-rationalization` merged to main). Typography rationalization + spacing residuals + per-side CI extension; 65 files changed (+636/-430); Unbounded fully removed (spec deviation from P3-1 "wordmark-only" — masthead is PNG image so spec deviation safe); 5 weights / ~167 KB Latin (vs spec 4/120 — Newsreader 200 hairline + 400-italic broadsheet identity load-bearing per Phase 18 commitments). 9 distinct type tokens emitted; 8 distinct spacing tokens; 0 production code references to `--font-display` or Unbounded post-fix. **Operator hard-refresh feedback post-merge:** 2026-05-07 — "on mobile the reference asset is all messed up, so probably more issues than the map left on mobile" — AssumptionsPanel grid right-column rendering vertical-character-per-line text. This is the reverted Phase 18.1.1 reflow scope still pending. Phase 18.1.3 prompted as the safe-subset extraction.
- **Chrome MCP gate restored 2026-05-07** via Cowork investigation — 5 orphan chrome-devtools-mcp processes accumulated since Tue 10AM; pre-session `cc` alias in operator's `~/.zshrc` runs `pkill -f "chrome.*devtools-mcp"` before launching CC. Memory: `feedback_chrome_mcp_orphans.md`. Visual MCP verification gate restored.
- **In flight:** none — operator at clean main. Phase 18.1.3 SHIPPED 2026-05-07 (3 commits `cec168d` / `f739d17` / `a49cdff` on `phase-18-1-3-mobile-component-reflow` merged to main). Mobile per-component reflow extracted from reverted Phase 18.1.1; 6 sub-items shipped (DSCR + AssumptionsPanel + S3 BreakdownBar + chart-canvas track + Sensitivity tornado SVG + MonthlyHeatmap); both html + body `overflow-x: hidden` band-aids removed; 5-viewport scrollWidth=clientWidth verified clean at 360/414/768/1024/1440. **Operator-screenshot bug closed** (AssumptionsPanel right-column-vertical-text → readable paragraph blocks at 360px). 7 visual audit PNGs captured via chrome MCP (gate restored end-to-end this session — first chrome-MCP-clean ship since Session 47). NO mobile map redesign (Phase 18.1.1.1 territory; still deferred).
- **Mojibake intel item deleted 2026-05-07:** `cur_motnhb6l-o8mv3k` ("Leidimai plÄŠtoti...") removed via `POST /feed/delete-by-id`; intel feed 47 → 46 items. 2nd `cur_*` deletion in the project's history (Phase 12.10.0 was the 1st). Pattern recognized; Phase 4G.1 candidate filed.
- **Today's plan progress (2026-05-08):**
  1. ✅ **Phase 25** SHIPPED — P0 right-rail clipping + credibility-disclosure pass (8 sub-items)
  2. ✅ **Phase 25.1** SHIPPED Cowork-direct — hero-bg unification (--hero-bg = var(--bg-page))
  3. ❌ **Phase 25.2 / 25.3** REVERTED — site-wide texture experiments rejected; site-texture candidate filed for future design-time work
  4. ✅ **Phase 4G.1** SHIPPED — POST /curate encoding-validation gate. 4-test verification protocol; refined 10-bigram set per Pause A empirical false-positive sanity check (no /Ä[A-Z]/ /Ä/ /Å/ — those false-positive on Estonian/Nordic content); test entries cleaned via /feed/delete-by-id; worker version e150b2d8-8878-49b9-ab0e-fc0ef8588ea5 deployed.
  5. ⏳ **Phase 18.3** (~2-3h CC) — animation activation per spec P2-1. 11 dormant keyframes; useCountUp hook (closes V-10 dropped idea per `project_visual_vision.md`); copy-button feedback; card hover-lift.
- **Next CC pick — Phase 18.3.** Operator fire via `cc` alias.

### Newly filed candidates (2026-06-15 Phase 33 follow-ups)

- ~~**Phase 33.A — Map feed Baltic allowlist + reject-on-flag + purge endpoint**~~ **[SHIPPED 2026-06-15]** — PR `phase-33-a-baltic-allowlist` (commit `7619785` code+test, `7cd4f01` handover+evidence) merged to main (`3bf629e`). Worker deploy `2306c828-8728-4e97-b2b6-525e3b4b79a2`. 196 → 170 entries in `/s4.projects` (26 polluters purged: 18 foreign-country + 8 blank-country, all `source: "esn · …"` with mislabeled `tso: "Litgrid"`). Single-source `BALTIC_COUNTRIES = new Set(['LT','LV','EE'])` constant + `filterFleetEntries()` gate at POST-before-processFleet (allowlist + HIGH-flag reject in one pass; doesn't mutate inputs) + new `POST /admin/purge-non-baltic-fleet` admin endpoint (UPDATE_SECRET auth, idempotent, recomputes aggregates from survivors). 2 files / +85/−4 in worker + 10-case test (`fleetAllowlist.test.ts`).

  **Premise correction (rule #1, third consecutive phase):** prompt said "allowlist is fleet-scoped, doesn't touch revenue." It DID — and correctly so. The 26 polluters were 4967 MW of fake announced pipeline inflating `baltic_pipeline_mw` (19034 → 14067 MW). That cascades into `sd_ratio` (2.39 → 1.86) → CPI (0.30 → 0.33) → **project_irr 18.5% → 20.0%**. Not a regression: the foreign pollution was corrupting the supply/demand model. The fleet pipeline → revenue engine coupling is now empirically documented for future phases (data-quality fixes in fleet ripple into IRR via S/D).

  **Gates:** tsc=0 · vitest 941/941 (+10 new) · lint:no-raw-spacing=0 · lint:no-editorial-chips=0 · build=7 routes · origin-SHA equality verified. Post-deploy verification: 401 on no-secret POST, idempotent re-purge `{purged:0}`, synthetic PH single-entry POST returns `dropped_non_baltic:1`, `/revenue` v7.3 confirmed.

  **CC findings filed (no scope creep):**
  - **Phase 33.A.3** filed below — blank-`cod` root cause = (c) upstream `kkme_sync.py` never sends `cod`; worker only reads it. Fix upstream also improves the `:147` "specific-date sorts first" comparator quality.
  - **POST `/s2/fleet/entry` single-upsert endpoint is ungated** — only the batch ingest path got the allowlist. Gate it if manual upserts ever resume. Noted for next Cowork pass.
  - **CLAUDE.md "7740 lines" is stale** — worker is 9394 lines as of 2026-06-15. Fixed in this roadmap delta commit.

  **NOT in this phase:** Phase 33.A.2 (frozen `installed_mw` pipeline, `storage_by_country.LT = 484 as-of 2026-03-23`) — needs operator's 5-10 known-operational-projects sample first.

- ~~**Phase 33.B — BTD capacity-price documentation + `prices_source` relabel (Path C, no remap)**~~ **[SHIPPED 2026-06-15]** — PR `phase-33-b-btd-cap-reparse` (commit `ec49286` code, `17006e2` handover+evidence) merged to main (`3323566`). Worker deploy `82df190f-aa4d-44bf-aac4-4745ab327988`. Behaviour-no-op ship (+20/−2 single worker file, zero new tests, IRR stable 20.0% before/after).

  **The 4th consecutive rule-#1 correction (extends `feedback_prompt_premises_empirically_verified.md`):** Phase 33's "activation/capacity conflation" narrative was empirically wrong. CC's Pause A traced BTD→S2 end-to-end and found:
  - BTD's `price_procured_reserves` dataset (cols 10-14) DOES carry Baltic capacity prices €/MW/h.
  - The Mac-cron parser (`~/kkme-cron/fetch-btd.js` → `s2ShapePayload` at `fetch-s1.js:4565`) already extracts them into `s2.{fcr_avg, afrr_up_avg, mfrr_up_avg}` — these are **directional capacity prices**, NOT activation prices as Phase 33's diagnosis claimed.
  - The actual bug Phase 33 closed: the engine reads `s2.*_cap_avg` fields that NO parser path ever produces (silently null forever); the `?? *_up_avg` fallback was a misnamed band-aid for a missing-field path. Phase 33's fix (calibrated-constant bound) was still the right outcome — just under a clearer mental model.

  **Why NOT remap (decision: Path C):** live BTD-parsed capacity prices are **2-177× the calibrated constants** (afrr 72.71 vs 7.06 = 10×; mfrr 38.93 vs 19.74 = 2×; **fcr 63.73 vs 0.36 = 177×** — €551k/MW/yr FCR-only is structurally implausible). Mechanically wiring `*_up_avg → *_cap_avg` would clamp afrr 72→50 + fcr 63→50, producing an unreviewed IRR swing — exactly the failure mode Phase 33's bound was designed to prevent. Path C: document the truth, relabel `prices_source`, defer the substantive capacity-basis decision to operator-signed review at 2026-06-29 (33.B.2).

  **Changes shipped:**
  - Multi-line comment at `:1062` (capPrice fallback) recording: BTD parses directional capacity €/MW/h into `s2.{fcr_avg, afrr_up_avg, mfrr_up_avg}`; 2-177× calibrated constants; FCR anomalous; no-remap rationale; points to 33.B.2 review.
  - `prices_source: "BTD partial"` → `"BTD parsed; calibrated capacity (review pending)"` at both `:1468` (V7) and `:1775` (V6).
  - `[revenue/s2-capacity-watch]` log confirmed firing at `:8569` on every `/revenue` compute (currently ephemeral console.log — see 33.B.3).

  **Pre-existing inconsistency left untouched (Path C scope):** `fetch-s1.js:2793` still labels `fcr_avg` as `'BTD measured'` in `computeBaseYear`. Cosmetic label drift, separate from this phase's documentation scope. Noted here for future cleanup (fold into 33.B.3 or its own micro-phase).

  **Gates:** worker syntax (node --check) OK · tsc=0 · vitest 941/941 (capPriceBound.test.ts keeps guarding) · lint:no-raw-spacing=0 · lint:no-editorial-chips=0 · build=7 routes · origin-SHA equality verified twice (Session 74 guard).

- **Phase 33.B.2 — Capacity-price basis review (all 3 products)** (BLOCKED until ~2026-06-29 — needs ~2 weeks of watch-log data, requires 33.B.3 first for KV persistence) — Operator-signed review packaging three questions into one coherent decision:
  1. Is live BTD-parsed `afrr_up_avg = €72.71/MW/h` capacity the right basis for the engine's `afrr_cap`, or do we average up+down direction (asymmetric capacity), or stay with calibrated `7.06`?
  2. Same question for `mfrr_up_avg = €38.93` vs calibrated `19.74`.
  3. Is `fcr_avg = €63.73` a real post-CE-synchronisation Baltic FCR market level, or a transient scarcity-spike artifact? €551k/MW/yr FCR-only is structurally implausible — but post-Feb-2025 sync produced real volatility worth confirming. If real, what's the disclosure path (assumption-band documentation + IRR move with operator sign-off)?

  Outputs: coherent calibration document covering all three products + operator sign-off + worker constants updated (or explicit decision to keep calibrated baseline) + Session-N handover entry recording the decision rationale.

- **Phase 33.B.3 — KV-persisted `[revenue/s2-capacity-watch]` accumulator + `:2793` label fix** (~30-45 min, P3) — Replace the ephemeral `console.log` in `flagOutOfBandS2Capacity()` at `:8569` with a daily-summary KV write: `s2_capacity_watch_<YYYY-MM-DD>` storing `{date, fcr_avg, afrr_up_avg, mfrr_up_avg, afrr_down_avg, mfrr_down_avg, clip_events_count}`. Retention: append to a rolling 30-day list KV; let TTL expire older. Lets 33.B.2 actually reason about persistence vs transient. Also folds in: relabel `fcr_avg` source string at `fetch-s1.js:2793` from `'BTD measured'` → consistent with Phase 33.B's `prices_source` wording (or honest "BTD parsed; review pending" if symmetric is wanted). Combined micro-ship.

- **Phase 33.A.2 — Frozen `installed_mw` pipeline investigation** (BLOCKED on operator-input sample) — `/s4.storage_by_country.LT.installed_mw = 484 (as-of 2026-03-23)` unchanged by Phase 33's VPS cron catch-up; separate pipeline, ~3 months stale. Operator gut-check confirms real Baltic operational fleet has grown materially since March. Three diagnosis paths: (a) TSO operational ledger lag (Litgrid energy_storage_balance / Elering / AST register projects later than commissioning), (b) source coverage gap (no positive Baltic feed for fresh commissionings), (c) ingestion field-mapping bug. **Unblocks when:** operator jots down 5-10 known-operational Baltic BESS projects not on the map (name, MW, country, COD if known) — sample diagnoses which of (a/b/c) is dominant. Memory `s4-installed-mw-frozen-pipeline`.

- **Phase 33.A.3 — Upstream `cod` field + single-upsert allowlist gate** (~2h, external `~/kkme-control-center` repo + small worker) — Phase 33.A Pause A confirmed all 196 fleet entries have empty `cod` because the worker only READS the field, never writes it; root cause is `kkme_sync.py` never sending `cod`. Fix upstream extraction; downstream wins are better `:147` "specific-date sorts first" comparator + per-project freshness reasoning + future Phase 27 (project drilldown table) gets a real COD column. Also includes: gate the worker-side `POST /s2/fleet/entry` single-upsert endpoint with the same `BALTIC_COUNTRIES` filter (Phase 33.A only covered the batch path). Combined ship.

- **Watchdog escalation tier (carry-forward from Session 73 follow-up #94)** — baltic_index was 457h (~19 days) stale before Phase 33; Telegram watchdog paged on S4 16-24h drift but did NOT page louder on the 19-day baltic_index gap. Need escalation rules: any signal `>5× threshold` should page on a separate channel, signal name explicit. Worker-side or VPS-side TBD. ~2h Cowork-direct or 1-2h CC.

### Newly filed candidates (2026-05-08 audit-3 + dropped-ideas review)

These don't run today; surfaced from audit-3 + `project_visual_vision.md` ideas-at-risk + chat scan for slipped asks. Operator picks when/if relevant.

- **Phase 26 — Email subscription / Baltic Flex newsletter** (~1 day CC) — Subscribe form between Intel section and contact form; routes to `/newsletter`; email ingestion via worker storage + Resend send-on-confirm; weekly digest scaffolding. Audit-3 §3 + §6 ("more natural conversion than cold contact form").
- **Phase 27 — Project fleet tracker drilldown** (~1-2 days CC) — Sortable table for "29 projects" (developer/MW/MWh/country/status/COD); shareable URL filters; possibly per-project dedicated route. Audit-3 §6 ("the single most likely page to be bookmarked and shared").
- **Phase 28 — Cross-border flow → spread analytics** (~3-5h CC) — Connect interconnector flows on hero map to S1 price spreads. Display "Today's import balance: 3,855 MW north→south, compressing LT-FI spread to €4.2/MWh." Makes the map work analytically vs decoratively. Audit-3 §6.
- **B-006 LV↔LT flow display** (~1-2h CC) — Worker already emits B-006 data; frontend doesn't render. From `project_visual_vision.md` ideas-at-risk #3 (Phase 4D era). Frontend-only; closes a long-standing dropped item.
- **Vector logo cleanup** (~1-2h Cowork) — Current "SVGs contain embedded PNGs, not real vectors" per ideas-at-risk #7. Replace embedded-PNG SVG assets with real vector paths. Design-tooling work; possibly out-of-scope for CC; pure Cowork.
- **Search command palette** (`/` shortcut) — Audit-3 §6. Could fold into Phase 19 a11y or its own ~3-4h CC phase. Defers if not picked.
- **Date/time-zone consistency sweep** (~30-45 min CC) — Standardize on ISO + UTC ("2026-05-08 06:00 UTC") across all surfaces. Audit-3 §6.
- **Provenance label sweep** (~3-4h editorial CC) — Extend `[src]/[as-of]/[observed]` pattern to every quantitative card; every numeric claim carries `observed/derived/modelled/operator-estimate/forecast`. Audit-3 §4 ("be more rigorous").
- **Site-wide map-faithful texture** (NEW 2026-05-08; ~design-time + ~1-2h CC implementation) — Operator wants the site's background to share the map's halftone character (varying density, organic patches). Tried 2026-05-08 with CSS-only approaches: (25.2) three-layer coprime grids = too uniform/dense; (25.3) single grid + SVG noise mask = still too uniform, doesn't blend with map's varied texture. Root issue is architectural — cards + sections paint their own backgrounds covering body-level texture, so body::before alone can't unify the visual surface. Proper paths forward: (a) extract the map's actual halftone pattern as a tileable SVG asset and apply at body level + override card backgrounds to transparent; (b) redesign card-elevation pattern (Phase 18 used `--bg-card` opacity) to use BORDER + SHADOW only, no fill; (c) accept Phase 18's subtle 16px grid as "good enough" and stop chasing this. (a) is most authentic but biggest scope (designer-time + CSS sweep across 13+ cards); (b) is medium effort; (c) is what's currently shipping. **Status:** Phase 18 16px grid restored 2026-05-08 after revert; this candidate filed for if/when operator wants to invest design-time.
- ~~**Phase 33 — Revenue engine capacity-price bound + VPS dash/cron fix + s1_capture dual-writer lock**~~ **[SHIPPED 2026-06-15]** — PR `phase-33-engine-drift-and-feed-quality` merged to main (`610fd9c`). 4 commits: `a761893` (capPrice bound + VPS dash fix), `6f3d9cb` (s1_capture allow-list lock), `5739358` + `6323328` (handover Session 78 + EVIDENCE.md). Two worker deploys: `0972c7c4-be3e-4758-a7db-550499ba192d` (bound + lock-prep), `06b9d774-4ba0-4178-a277-962c5d8c8ad8` (dual-writer lock).

  **Live impact on production:** project_irr 49.6% → 18.5% (inside ch_benchmark 6–31%, just above central 16.6%); MOIC 17 → 5.15; bankability "Fail" → "Pass"; gross_revenue_y1 €13.65M → €7.32M. Capacity-price caps now bounded (afrr 7.06 / mfrr 19.74 / fcr 0.36 €/MW/h; ceiling [0, 50]).

  **Three corrections to the prompt's premises (rule #1 audit-triage doing its job):**
  1. **clampSdRatio was a no-op** — CC's Pause A code-grep proved `cpiCurve()` already floors at 0.30 for any `sd_ratio ≥ 1.5`, so 28.5 and 2.69 produce identical CPI. The actual lever was `computeBaseYear` capacity-price fallback at `fetch-s1.js:2431`: `fb_afrr_cap = s2.afrr_cap_avg ?? s2.afrr_up_avg ?? 7.7` — when `afrr_cap_avg` went null (BTD source change ~May 27), it fell to `afrr_up_avg=37` (an activation price used as a capacity price → 5× inflation). Same `?? *_up_avg` pattern at 4 sites (2431, 2149, 1661, 1595) + 2 display sites + V6 fallback. Fix: single-source `capPrice(product, observed)` helper with calibrated constants + [0,50] clamp + clip-event log + out-of-band `[revenue/s2-capacity-watch]` diagnostic log. Regression test `app/lib/__tests__/capPriceBound.test.ts` (8 cases) blocks re-introduction.
  2. **Session 73's `.env` orphan-lines diagnosis was incomplete** — CC's Pause A decisive shell test on the VPS: `/bin/sh → dash`; cron has no `SHELL=`; `source` is a bashism dash lacks. Inline crons silently fail under dash. The Session 73 `&&→;` change only turned silent freeze into visible-error freeze; the manual catch-up runs were under bash interactively, masking that cron never recovered. baltic_index stayed 457h stale since right after Session 73. Fix: `SHELL=/bin/bash` + `source` → `.` on all 4 inline crons (belt-and-suspenders), backed up to `crontab.bak.20260615`. All 4 crons caught up + proven exit 0.
  3. **s1_capture dual-writer dynamic discovered mid-verification + closed** — the B.2 `ingest_daily` catch-up clobbered `s1_capture.monthly` (12 months → 0) → engine fell to v6_fallback / bankability:"Fail" / moic:null. CC caught it in verification, recovered via worker's own `POST /admin/trigger-s1-capture` (rebuilds `.monthly` from intact `s1_capture_history` — 400-day rolling, not in POST allow-list). Then locked the worker as sole writer of `s1_capture` (removed from POST `/kv/set` allow-list at `:9217`) — POST now returns `400 {"error":"not in allowlist"}`. Prevents tomorrow's 07:45 UTC re-clobber and the daily 15-min v6_fallback window that would have recurred until DB backfills to ≥6 months.

  **Map feed third workstream split out** at Pause A operator approval (kept in 33.A scope per rule-#1 split-decision trigger). Phase 33 limited to revenue + VPS as the P0 trust issues.

  **/s4 installed_mw finding (operator gut-check):** `storage_by_country.LT.installed_mw = 484 (as-of 2026-03-23)` — UNCHANGED by the VPS catch-up. Confirms operator's intuition that the installed-MW pipeline is separately-sourced, frozen 3+ months, not fed by today's broken crons. Materially expands Phase 33.A scope. `connected_mw=8672` is grid-connection capacity (different metric, not the BESS installed base).

  **Two transparency notes:** (1) Pause C visual artifact was `docs/visual-audit/phase-33/EVIDENCE.md` (curl-sourced before/after table) rather than browser PNGs — frontend unchanged this phase, RevenueCard just renders /revenue; curl IS the truth that the screenshot would render. (2) CC's local IRR probe ran +9pp hot vs prod (showed 25% projected; prod landed 18.5%); calibration gap documented for future probe work.

  **Gates:** tsc=0 · vitest 931/931 (−1 from throwaway probe file removed) · lint:no-raw-spacing=0 · lint:no-editorial-chips=0 · build=7 routes · origin-SHA-equality guard PASS twice (Session 74 lost-commit lesson held). Pre-existing logs/btd.log working-tree mod ignored per scoped staging.

  **Memories saved this session:** [[vps-cron-dash-source-bashism]] (root cause + Session 73 correction), [[s4-installed-mw-frozen-pipeline]] (separate from cron freeze, ~3-month freshness gap, Phase 33.A scope).

  **3 follow-up candidates filed below** (33.A, 33.B, watchdog-escalation #94 carry-forward).

- ~~**Phase 31.A — Tier-3 card data integrity audit + rebuild**~~ **[SHIPPED 2026-05-13; full entry in Shipped appendix]** — PR `phase-31-a-tier3-data-integrity` (commit `afd8f95`) merged to main. 3 of 4 visible-from-screenshot bugs CONFIRMED + fixed (PeakForecast hero-vs-rows mismatch via worker-side peak/trough emission; S7 TTF dual-threshold via data-derived rewrite + rule-#6 editorial label drop; SpreadCapture net/gross hero alignment via swap-to-gross + net disclosure line); 1 SKIP per rule #1 (RenewableMix 143% — math reconciles, operator misreading). 3 bonus bugs surfaced: SpreadCapture sparkline same slice(-24) root cause (folded into PeakForecast fix); S7 dead `data.interpretation` field (deleted); S9 CSS typo `translateX(-50)` → `translateX(-50%)`. Worker deploy `71faa3df-e4b3-465d-b72d-4183ee9ffce4` live. New worker fields: `lt_peak_hour_utc`, `lt_peak_price`, `lt_trough_hour_utc`, `lt_trough_price`, `lt_hourly_24` — registered in `metricRegistry.ts` per rule #4. All 6 gates baseline-exact or improved (vitest 919/919 = −6 from deleted heuristic specs, lint −2). 16/16 DOM probe checks pass via playwright fallback (chrome-devtools-mcp disconnected mid-session — 6th consecutive instance). Local-build smoke-test green. 8 files touched. **3 follow-up candidates filed below** (31.A.1, 31.A.2, /api/dispatch 404).

- ~~**Phase 31.A.1 — Tier-3 editorial-copy sweep per rule #6**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `164ab26` merged to main (`04f03fc`). 4 cards rewritten with data-derived `interpretation()` matching S7/S9 reference rhythm: RenewableMix (`Renewables X% of Y MW load (Z MW); thermal residual W MW (V%)`), ResidualLoad (`Thermal + imports cover X MW (Y% of demand); renewables displace Z MW` + export-window split case for negative residual), PeakForecast (`Swing €X/MWh · Y× the 90D median (€Z), W× the P90 (€V)`), SpreadCapture (`Gross €X/MWh; net €Y/MWh after RTE losses — €Z/MWh drag (W%)`). All editorial vocabulary removed: zero matches of `elevated|above-normal|high renewable|tight system|wide envelope|favorable|supporting|moderate|thin|exceptional|compressed` in DOM probe. Gates: tsc 0, vitest 919/919, lint 125 (−1 from dead `interpValue` removal), build clean. Visual evidence at `docs/visual-audit/phase-31-a-1/structural-1440.png`. 4 frontend files (+34/−24).

- ~~**Phase 31.A.2 — Evening-premium resolution-aware slicing fix**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `9766097` merged to main. Worker deploy `b6bd77e3-832e-4cd2-87b6-41db92b79112`. Fix shape evolved at Pause A from prompt's `perHour = N===96 ? 4 : 1` ternary to **`Math.round(h * N / 24)`** index arithmetic after live curl surfaced N=95 today (neither 24 nor 96). Pre/post curl: `lt_evening_premium` -9.6 → +120.65 (sane vs today's evening €130-150 / midday €10-30 profile). Frontend label-alignment audit confirmed `lt_evening_premium` is type-defined but zero UI consumers; the displayed "Eve premium" reads `shape.evening_premium` from already-resolution-aware `priceShapeMetrics()`. No rule #4 follow-up needed. Two follow-up candidates filed below (31.A.3, N=95 watch).

- ~~**Phase 31.A.3 — `lt_hourly_24` downsampler robustness fix**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `2128bc0` merged to main (`35a5540`). Worker deploy `c86116d8-af0d-421e-ab9f-8f48a36fa30a`. Fix shape (b) `Math.round(h * N / 24)` slice-and-average shipped per Pause B operator pick — mirrors 31.A.2's same-function arithmetic (rule #4 within-engine-block consistency). Removed `Number.isInteger(perHour)` gate; only degenerate-case null branch retained via `N >= 24` guard. Post-deploy curl reality-check on same N=95 day: `lt_hourly_24` length 24 (was null), min 9.39 / max 153 — sanity-brackets hold (≥ trough 8.94, ≤ peak 158.41). Consumer audit at Pause A corrected the prompt's premise (`SpreadCaptureCard` null fallback was `?? []` render-hidden, not slice-fallback as I'd guessed); either way fix resolves, no frontend change. Gates baseline-exact vs 31.A.2 (vitest 919/919 today — calendar inside passing window for the time-of-day-dependent freshness boundary, no delta from change). 1 file touched (`workers/fetch-s1.js`).

- **N=95 hourly_lt watch** (NEW 2026-05-17; not a phase; observation only) — Live `/s1` curl on 2026-05-17 showed `hourly_lt` length 95 instead of 96 (15-min ISP day expected) or 24 (hourly day expected). Likely ENTSO-E publishing one-off (single missing quarter-hour bar). NOT blocking, NOT a phase yet. If recurring across multiple days, escalate to investigation candidate — could indicate a worker fetch bug discarding a bar, an ENTSO-E API change, or a DST-adjacent edge case. Operator: glance at `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | jq '.hourly_lt | length'` over the next few days to see if 95 persists or 96 returns.

- ~~**Phase 31 — Tier-3 card structural normalization (formerly 31.B)**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `55b3346` merged to main (`6f88cc7`). Tight scope per 8 operator-approved design picks: filled dot status indicator across all 6 (dropped green "observed" pill from S7/S9), hero type aligned to `clamp(1.5rem, 3vw, 1.75rem)` matching cards 1-4 (was clamp(40px, 5.5vw, 64px) on S7/S9), unified "▸ View [thing] detail" footer drilldown affordance via DetailsDrawer scaffolds added to RenewableMix + ResidualLoad + PeakForecast + SpreadCapture (with Source/Computation/Limitations methodology prose authored by CC + operator-approved), PeakForecast P25/P50/P90 marker bar viz added (closes viz-parity gap), commodity-subtype bottom scale bar preserved on S7/S9 with code-comment marker. **Scope adjustment per rule #1:** "hollow circle on SpreadCapture" claim dropped — empirically false (already filled dot post-31.A.1). Gates baseline-exact (tsc 0, vitest 919/919, lint 125). Multi-viewport visual evidence at `docs/visual-audit/phase-31/structural-{1440,1024,414}.png`. Probe regex caveat documented: `/elevated/i` hits S7 drawer-collapsed methodology copy (`HIGH >50 €/MWh · ELEVATED >30 · NORMAL 15-30 · LOW <15`) — pre-existing prose, methodology reference not engine-emitted chip; rule #6 + CI gate both pass. 7 files touched + 3 PNGs + 1 probe script.

- **Phase 31.1 — `<MetricCard>` primitive extraction for tier-3 cards** (NEW 2026-05-17 from 31 Pause A discovery; ~3-4h CC) — Per Phase 31 ship: all 6 tier-3 cards now share the same JSX rhythm (`header(label + filled dot) → hero metric → calibration micro-row → interp prose → viz (when present) → footer [src] · [as-of] · [observed] · ▸ View detail drawer trigger`) but each card still maintains its own per-component JSX. Extract a `<MetricCard>` primitive at `app/components/primitives/MetricCard.tsx` taking props for label / dotColor / heroValue / heroUnit / calibrationRow / interp / viz (optional ReactNode) / footer / drawerContent. Cards 1-6 then become thin configuration callers. Wide-scope continuation of Phase 31 that was held out at the tight ship. Risk: refactor of 6 components; chart/viz children need to remain freely composable. Test coverage at the primitive level (Vitest) advisable. Closes part of the Phase 7.7g-b primitives gap.

- ~~**/api/dispatch console-noise fix**~~ (renamed from "/api/dispatch 404 worker fix" — wasn't actually a bug) **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `fcd8d03` merged to main (`6652cef`). Worker deploy `a718b2e8-359f-4b75-86a4-ff4c43b51896`. Bug reframe at Pause A: the 404 was the worker's documented response when `da_tomorrow` KV is empty (pre-~14:00 CET daily publish) — endpoint exists, data not yet ready. Status code semantically wrong (404 = "endpoint not found"). Fix: 2-line worker change at `fetch-s1.js:8784` and `:8790` returning HTTP 200 with `{forecast: null, reason: 'DA tomorrow publishes ~14:00 CET'}` envelope instead of 404. Frontend untouched per Pause A simplification — existing `TradingEngineCard.tsx:343` `f?.meta` guard already filters null envelope correctly. Pre/post curl confirmed: `HTTP/2 404 {"error":...}` → `HTTP/2 200 {"forecast":null,"reason":...}`. Console-noise condition now silent. Gates baseline-exact (tsc 0, vitest 919/919, lint 126).

- ~~**Worker 404-as-empty status code rationalization**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `106538a` (+ `32e6ba4` handover) merged to main (`a1cbb1f`). Worker deploy `8736f778-caa6-44c9-a991-7613a395d924`. **10 of 14 sibling 404 sites flipped to 200 `{<field>:null, reason}` envelope** (lines 7052, 7137, 8760, 8764, 8829, 8831, 8840, 8842, 9124, 9232). 3 caller-side guards added in `S1Card.tsx:102` (Array.isArray(cap.history) discriminator), `PeakForecastCard.tsx:61` (data.updated_at discriminator), `SpreadCaptureCard.tsx:75` (same pattern). Operator-approved Pause A scope: **2 admin routes STAY at 404 by design** (line 6901 `/feed/delete-by-id`, line 7109 `/admin/backfill-s1-history`) — operator-triggered curl ops SHOULD surface preconditions, not silently mask them as null envelope; NOT a follow-up candidate, deliberate design decision per the bug-pattern reframe. **2 user-input not-found 404s STAY at 404 per HTTP spec** (line 6908 specific-id feed entry; line 8821 user-supplied date). Reason-copy strings operator-honest with 2 tweaks pre-Pause-B (dropped script/function names: "run fetch-btd.js" → "awaiting BTD push"; "computeS1() run" → "awaiting first cron run"). Gates baseline-exact (tsc 0, vitest 919/919, lint 126). 5 files touched, +109/−13 LOC.

- **Chrome MCP disconnect-during-session investigation (v2)** (NEW 2026-05-13; supersedes prior "Chrome MCP lock investigation"; ~30-60 min Cowork or operator) — The Phase 18.3-era `cc` alias (`pkill -f "chrome.*devtools-mcp" 2>/dev/null; claude`) addressed the orphan-process-on-launch case, but a NEW pattern is recurring: chrome-devtools-mcp **disconnects MID-session** even after a clean launch. 6th consecutive instance during Phase 31.A's Pause C (operator-confirmed earlier sessions: 18.1.3 Session 53, Phase 25 Session 54, Phase 18.3 Session 56, plus 31.A Session 58). CC's mid-session fallback is now a hand-rolled playwright script (`scripts/_phase-31-a-probe.mjs`) — works but is workaround quality. Investigation candidates: (a) chrome-devtools-mcp server keepalive / heartbeat; (b) move to playwright primary + chrome-devtools-mcp secondary; (c) confirm whether disconnect correlates with parallel chrome use elsewhere on the operator's Mac. Memory entry `feedback_chrome_mcp_orphans.md` updated 2026-05-13 with the v2 finding + playwright-script fallback path.

- **Phase 19.1 — Scrollspy aria-current + tab-order audit** (NEW 2026-05-17 from Phase 19 deferral; ~1-2h CC) — StickyNav active section link should expose `aria-current="location"` for screen reader users navigating between sections. Implementation: scroll handler tracks visible section, sets state, link rendering applies `aria-current` matching the visual active state. Plus comprehensive Tab/Shift-Tab order audit across the site (catch any positive-tabindex sites + verify all interactives reachable via keyboard). Out of Phase 19 MVP scope per operator-approved deferral. Independent of Phase 19.2.

- ~~**Phase 19.2 — WCAG 2.1 AA color-contrast pass**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `11af014` merged to main (`62d590d`). **Phase 19's "7 violations" baseline was viewport-sparse;** Pause A's 4-config scan (light/dark × 1440/414) found **259 actual violations** — 85-92% from a single `--text-muted` token cascade across 388 call sites. Operator-approved token shifts (4 lines in `globals.css` + 2 `aria-hidden` on decorative ghost text): **Dark mode A3** — `--text-muted` 0.45→0.55, `--text-tertiary` 0.55→0.62, `--text-secondary` 0.65→0.70 (preserves 3-step hierarchy with minimal upward cascade). **Light mode B3** — `--text-muted` 0.60→0.65 (joins Phase 18 tertiary+secondary collapse; minimum brand disruption). Post-fix axe-core delta: **259 → 28 violations (−89%)** across 4 configs. DOM verification: 3 previously-failing selectors now compute 5.6-5.74 (was 3.73-3.79). **28 remaining are documented exceptions** in three follow-up bins: (i) ~13 inline-opacity × `--text-tertiary` sites filed as Phase 19.2.1; (ii) ~12 accent-color failures (`--teal`/`--rose`/`--amber`/`--accent-amber` failing by slim margins) deferred to existing **Phase 18.2.1** (Baltic palette retune); (iii) 1× `--white` on `--mint` chip + 1× decorator at 3:1-large-text boundary held as documented exception. **Honest caveat:** axe-core 4.x's color-contrast rule does NOT skip `aria-hidden` elements — the `aria-hidden` is the right semantic fix for screen readers but axe still counts the visual ratio. Documented in Session 67. Gates baseline-exact except pre-existing lint drift (125→129 in `RevenueCard.tsx` — Phase-19.2-uninvolved, observation only). 4 files touched + 1 probe script + 4 viewport PNGs at `docs/visual-audit/phase-19-2/`.

- ~~**Phase 19.2.1 — Inline opacity audit (component-level cleanup)**~~ **[SHIPPED 2026-05-18; full entry in Shipped appendix]** — PR commit `9964ba7` merged to main (`2195c80`). **Scope A+B applied per operator rule #4** — 14 sites across 6 files: 8 axe-flagged in `S4Card.tsx` (LitGrid stage breakdown ladder per Phase 19.2 prediction) + 6 cross-card-consistency siblings in `WindCard.tsx` / `SolarCard.tsx` / `LoadCard.tsx` / `RevenueCard.tsx` (×2) / `TradingEngineCard.tsx`. Fix policy (b) drop inline opacity + use darker token directly. Post-fix axe-core delta: **54 → 21 violations (−33)** across 4 configs. All 10 inline-opacity sites cleared. **21 remaining = 19 accents (Phase 18.2.1 turf — `--teal`/`--rose`/`--amber`/`--accent-amber` + 2 pipeline-on-colored-bg labels) + 2 docs-exception ghost decoratives.** Gates baseline-exact except pre-existing vitest flake on `freshnessBadge.test.tsx:39` (time-of-day-dependent; Vilnius-midnight band — filed below as 19.2.2 candidate). Pause A count-delta vs prompt's "13 sites" estimate confirmed at 10 axe-flagged + 4 cross-card-consistency = 14 total (rule #1 audit-triage win). PNG-overwrite incident on first probe run surfaced + recovered via git restore + per-phase OUT_VIS routing in cloned probe script. Visual evidence at `docs/visual-audit/phase-19-2-1/{light,dark}-1440.png`.

- ~~**Phase 19.2.2 — `freshnessBadge.test.tsx` Vilnius-midnight flake fix**~~ **[SHIPPED 2026-05-18; full entry in Shipped appendix]** — PR merged to main (`6e89578`). Fix shape (a) `vi.useFakeTimers()` + `vi.setSystemTime('2026-05-15T12:00:00+03:00')` with `afterAll(() => vi.useRealTimers())` applied in `app/lib/__tests__/freshnessBadge.test.tsx`. Pause A empirically reproduced the failure (test ran at 09:10 EEST → pre-noon Vilnius wall-clock pushed `Date.now()-12h` onto yesterday's Vilnius day → `isSameVilniusDay` false → TODAY band skipped → STALE). Sibling-test risk-cleared at Pause A (all 10 tests in file analyzed). Verification: 3×3 sequential = 10/10 pass each run; full suite 919/919 deterministic (recovers carrying-flake baseline 918/919 since Phase 21). +15/−1 line, single file. **Vitest baseline reference now 919/919** — drop carrying-flake note from future phase prompts.

- ~~**Phase 18.2.1 — Baltic palette retune (medium scope)**~~ **[SHIPPED 2026-05-18; full entry in Shipped appendix]** — PR commit `ac60bec` merged to main (`17c85cf`). 48 files / +578 / −124. **axe-core delta: 43 → 10 violations (−33)** across 6 configs (light/dark × 1440/1024/414). Mobile (1024 + 414) now COMPLETELY CLEAN; only 10 light-1440 + dark-1440 violations remain, all pre-approved exceptions: 4 doc'd (text-ghost + white-on-mint per Phase 19.2) + 4 pipeline-bg labels (→ Phase 18.2.2 below) + 2 faded-teal Financing arrow (→ Phase 19.2.3 below). **Sentiment-lock preserved** per pick #4 — `--positive ≡ --teal` and `--warning ≡ --amber` overlap surfaced at Pause A; instead of shifting sentiment primitives, 3 dedicated text-path tokens added: `--teal-accent-text` `#0e6155` (4.44 → 6.23), `--amber-accent-text` `#7a5a1c` (4.44 → 5.37), `--teal-medium-accent-text` `rgba(14,97,85,0.95)` (3.19 → 5.61). `--rose` direct shift `#dc3535` → `#b82828` (no sentiment overlap; 28 sites inherit + charts auto-pick via getComputedStyle). ~19 axe-flagged accent text sites migrated + 9 tier3-impact `--teal-medium` sites for rule #4 consistency. Gates baseline-exact except pre-existing lint drift (127 → 129 in baseline-family RevenueCard.tsx; not Phase 18.2.1 regression). 6 viewport PNGs at `docs/visual-audit/phase-18-2-1/`. **Spec-vs-shipped reconciliation note (memory cleanup for Cowork):** my earlier roadmap memory cited spec P2-2 hex `#1a3833` / `#d4a574` / `#a8324a` — those values DO NOT appear in `docs/specs/2026-05-06-designer-developer-spec.md`. Actual spec doc prescribes `#00b4a0` / `#d4a03c` / `#d65858` which would WORSEN WCAG (lighter than shipped). Proceeded with minimum-delta-from-shipped per pick #2 hybrid policy. Memory `reference_designer_dev_spec.md` may need update to reflect this finding.

- ~~**Phase 18.2.2 — Pipeline-bar on-colored-bg label contrast**~~ **[SHIPPED 2026-05-18; full entry in Shipped appendix]** — PR commit `33e97f4` merged to main (`8f8afcd`). **axe-core 8 → 4 (a11y arc complete — remaining 4 are irreducible documented exceptions: text-ghost decorative source-footer + white-on-mint chip elsewhere × 2 modes).** Rule-#1 catch at Pause A: prompt assumed light/white chip labels but they used `var(--text-primary)` which INVERTS per mode (dark text light-mode / light text dark-mode); `--white` token ALSO inverts (cream #e8e2d9 dark / near-black #1a1a1f light). Resolution: 3 NEW scoped non-inverting tokens in `globals.css` — `--pipeline-chip-text: #e8e2d9` (cream, both modes), `--pipeline-chip-mint` (#1c705c light / #016b5d dark), `--pipeline-chip-amber` (#7c601c light / #7d5c1c dark) — consumed only by the 2 flagged S4Card chip divs (`S4Card.tsx:468-485`). Final contrast all ≥4.5 with cream-white: light mint 4.61 / light amber 4.61 / dark mint 5.01 / dark amber 4.77 (hexes shifted ~10-15 RGB darker than initial proposal because cream-white L=0.766 < pure-white L=1.0). Intention chip (`:491`) deliberately left `var(--text-primary)` — swapping would've created a 1.20-ratio violation on amber-subtle. Legend squares keep `--teal-strong`/`--amber-strong` → zero cross-card blast radius. Gates baseline-exact (vitest 919/919; lint 134 pre-existing-family, zero new in touched files). **playwright@^1.60.0 added to devDependencies** (closes the flag from commit `3a83767`; gsap accidental-bump reverted). 2 PNGs at `docs/visual-audit/phase-18-2-2/`. **Namespace note:** collides with the legacy "Phase 18.2.2 — chart crosshair UX hotfix" (Session 48, shipped 2026-05-06) referenced lower in this doc — that was a different 18.2.2; this pipeline-bg one reused the number. Both shipped; no action, just don't confuse them.

- ~~**Phase 19.2.3 — Parent-opacity residual fix (faded-teal Financing arrow)**~~ **[SHIPPED 2026-05-18; full entry in Shipped appendix]** — PR commit `81e1790` merged to main. Mechanism reframed at Pause A: site lives at `S3Card.tsx:393–394` (NOT S4Card — earlier audit drift) — driver-chip wrapper applies `opacity: stale ? 0.35 : 1` which compounds with `--teal-accent-text` alpha. Fix (a) drop wrapper opacity + swap text color when stale: `color: stale ? var(--text-muted) : chipColor(drv.direction)`. 4 driver chips inherit uniformly. Post-fix axe-core delta: 10 → 8 violations (both Financing-arrow ones cleared on light + dark 1440); composited contrast lifted to 5.06 light / 5.30 dark. Gates baseline-exact except pre-existing lint drift (127 → 132 in baseline RevenueCard.tsx family; not 19.2.3 regression). Sibling parent-opacity wrapper at `S3Card.tsx:565` (drawer "Raw inputs" table) audited at Pause A + correctly NOT folded in (different context, no axe flag, text-tertiary/text-primary tokens). 1 file touched (2-line surgical change). Visual evidence at `docs/visual-audit/phase-19-2-3/{light,dark}-1440.png`. **Operator-side flags for follow-up:** (1) `package.json` + `package-lock.json` had unstaged gsap `^3.14.2 → ^3.15.0` bump — npx side-effect, operator decision; (2) Playwright not in devDependencies — symlinked from npx cache for probe run; file as **Playwright devDep declaration** backlog (~5 min).

- **Featured-item age cap hot-fix** (NEW 2026-05-18; Cowork-direct, NOT a phase) — `app/lib/sourceClassify.ts` `featuredScore()` math at line 143 (`0.5 × recency + 0.3 × impactScore + 0.2 × sourceScore`): for ANY primary-source impact-positive/negative item the minimum non-recency contribution = 0.50 — above FEATURED_SCORE_FLOOR (0.4) regardless of age. Result: a 128-day-old VERT regulatory item ("Lithuanian balancing cost allocation shifts — producers cover 30%", `published_at: 2026-01-10`) was floating to FEATURED at the top of the intel feed on 2026-05-18. **Fix:** new `FEATURED_MAX_AGE_DAYS = 30` constant; `featuredScore()` returns `-1` early if `daysSince > 30`. Items > 30d old cannot be Featured regardless of score. Operator intuition: "Featured" implies "fresh". 1 file, ~7 lines.

- **Axe-core CI gate** (NEW 2026-05-17 from Phase 19 backlog; ~30-60 min CC) — Add `npx @axe-core/cli http://localhost:3100/ --exit` (or similar headless variant) to the foundation gates list. Threshold: zero "serious" or "critical" violations; baseline "moderate" / "minor" tracked and flagged in CI output. Prevents Phase 19-class regressions without adding a wholesale a11y phase to every ship. Pairs with `lint:no-editorial-chips` + `lint:no-raw-spacing` pattern. Implementation: shell script in `scripts/` + add to `package.json` lint section + CI workflow update if applicable.

- ~~**Phase 32 — Reference asset recalibration from Bitėnai cascade**~~ **[SHIPPED 2026-05-27 as scope-narrowed "performance-assumption refinement"; merged PR commit `1ef9cfa` → main `e10d956`]** — Operator reframed scope at runtime: NOT a broad recalibration, just refine what's genuinely optimistic/missing in the reference-asset model + use standard warranties (no extensions) + only touch the existing card. Cowork read the Bitėnai deal materials (engineering summaries, `commercial_facts.json` / `computed_metrics.json`, cascade output) and produced NDA-laundered generic ranges; **CC never touched the deal files** (prompt carried only generic numbers). **Shipped:** RTE_BOL 0.85/0.86 → **0.82/0.83** (POI-level, conservative; Pause-A confirmed h4 above-band, h2 at edge); warranty **base-only** (≤730 EFC/yr 'within' / else 'exceeds-base-warranty', dropped the 1460 'premium-tier-required' extension tier); 7 NDA code comments genericized to "NREL ATB + public manufacturer warranty data + Baltic field observation 2026". **Deliberately UNCHANGED** (field data validated them): CAPEX €164/kWh, LCOS reference, S3 cost bands, SOH curves (already 70-74.5% Y10 = more conservative than the 78-82% target — not raised), decay 0.20pp/yr, availability 0.97. 8 files +36/−47; gates green (vitest 918/918). **NDA boundary verified:** `docs/_private/` gitignored+untracked, zero supplier/client/project/deal references in shipped code or rendered DOM. **v6_fallback latency:** live `/revenue` serves v6 (s1_months:0 from the May cron outage) — lowered RTE is active via `rteCurveFor`, but the V7 assumptions-panel/warranty surfacing is latent until S1 coverage rebuilds ≥6mo (recovering post-cron-fix). Unit tests are canonical verification. **Lost-commit recovery:** first CC run (Session 74) deployed the worker but its git commit silently failed — git fell behind the live worker (prod ahead of source). Caught via PR-compare showing 0 changes; re-applied as `1ef9cfa` (Session 75) with independent origin verification before merge. **Two cross-card follow-ups filed below.**

- **Phase 32.1 — S1Card hardcoded "85% round-trip efficiency" relabel** (NEW 2026-05-27 from Phase 32 Pause C; ~30 min) — `S1Card.tsx:763` hardcodes "85% round-trip efficiency" for the DA charge-leg haircut. Distinct concept from the reference asset's POI BOL RTE (now 82/83%), but the bare "85%" sitting near the refined figures could read as inconsistent to a careful reader. Relabel to make the concept explicit ("charge-leg haircut") OR reconcile the value. Small frontend edit.

- **Phase 32.2 — Delete dead `app/lib/revenueModel.ts`** (NEW 2026-05-27 from Phase 32 Pause C; ~15 min) — `app/lib/revenueModel.ts` is dead code carrying a stale optimistic SOH curve. Deletion candidate so it can't accidentally get wired in and reintroduce non-conservative assumptions. Verify zero imports first, then remove.

- ~~(superseded — original Phase 32 broad-recalibration scope below, kept for context)~~ Operator owns the EF/Prosperus Bitėnai 48 MW POI / 96 MWh BESS deal (`~/Documents/KKME/01_Deals/Prosperus_48MW_96MWh/`); the project has a 4-layer math architecture (supplier docs → Python physics model → Excel calculator → HTML investor view) with a cascade-reality-check script (`08_Engineering/notebooks/11_RTE_SOH_cascade_check.py`) that recomputes realistic POI RTE from first principles using PE PCSM measured efficiency (FSIC20042026AI: EURO RT 93.90%) and per-supplier DC battery RTE / aux. As of 2026-05-08 the cascade output for three live-comparison suppliers shows realistic POI RTE 79.38-83.12% — substantially below industry-typical published claims (85-90%). This is a higher-quality calibration source than generic Wood Mackenzie / BNEF benchmarks for KKME's 50 MW Baltic reference asset.

  **Confidentiality gates (load-bearing per discipline rule #3 + Bitėnai project rule "Never share supplier A's pricing with supplier B"):**
  - **No supplier-specific config patterns published.** Bitėnai cascade discriminates topology (PE-PCSM-with-Hithium-18×6.25 vs CATL-19×5.644 etc.). KKME publishes a generic "Baltic reference asset" — must not echo any one supplier's arrangement, container count, or kVA derate table.
  - **Aggregate ranges, not single-deal point values.** "POI RTE 76-82% at 2 c/d" is fine; "POI RTE 80.53%" reads like a leaked deal number.
  - **No trade names, model numbers, audit-letter references** (FSIC20042026AI etc.), kVA-by-temperature curves, cell vendor names, or any other identifier triangulable to the live supplier set.
  - **Padding direction:** operator instruction "+10-15%" — interpreted as more-conservative-published-numbers (cost padded UP, performance padded DOWN). Confirm exact direction at Pause A.
  - **Internal trace memo (NOT git-committed):** every assumption update writes a one-liner trace at `~/Documents/KKME/.../private/reference-asset-bitenai-trace-2026-05-08.md` (gitignored or stored outside repo): "published value X-Y → derived from cascade output A-B × padding factor C". Allows future-self audit without exposing the chain in any public surface.

  **Scope:**
  1. **Cowork-side (~1-2h):** Read cascade output (`08_Engineering/outputs/rte_cascade_2026_05_08_v2_PE_confirmed.txt`); extract aggregate ranges (RTE, useable factor, aux %, CAPEX €/kWh) across the live-comparison set; apply padding; produce internal trace memo.
  2. **CC-side (~2-3h):** Code-grep KKME for current reference-asset constants (likely in worker `revenueParameters` or frontend assumptions config); replace with padded aggregate ranges; verify cross-card consistency post-change per discipline rule #4 (same RTE shouldn't appear in 3 cards with 3 values); update methodology doc with new assumption table including provenance line ("calibrated against operator's live Baltic project audits, May 2026" — no further detail).
  3. **Verification (~30-60min):** local-build smoke-test per `feedback_local_build_verification.md`; visual-confirm hero / S3 / RevenueCard / methodology page reflect new numbers; commit changelog entry.

  **Dependencies:** ships AFTER Phase 31.A (data integrity) so we know which fields need recalibration. **Risk:** if KKME currently uses fields not represented in cascade output (e.g., cycling cost €/MWh-throughput), keep existing assumptions for those — don't fabricate to fill gaps. Prompt to be authored when picked; needs explicit confidentiality re-read each time before starting.

**Note on naming collision:** the legacy "Phase 21 — Print stylesheet" in Tier 5 still exists (pre-S2-polish era); rename someday to free up Phase 21 namespace cleanly. Same for "Phase 8/9" which were unused low-number slots historically; the LV↔LT-flow + vector-logo tasks above use named identifiers to avoid collision.
- **Then operator chooses among:**
  2. **Phase 18.3** (~2-3h CC) — animation activation (11 dormant keyframes + useCountUp hook); spec P2-1/3/4
  3. **Phase 19** (~3-4h CC) — A11y MVP (focus-visible + aria-labels + role=status); spec P1-3 + P2-2
  4. **Phase 12.12 #1+#2** (~2-3 days CC) — schema validation + freshness gates infrastructure
  5. **Phase 7.7g-b reduced** (~3-4 days CC) — primitives + useScenario hook + worker URL centralization
  6. **Phase 18.2.4 / 18.2.5** (~30-60min CC each) — conditional on operator post-merge feedback
  7. **Phase 18.2.1** (~3-5h CC) — Baltic palette retune (cross-cutting)
  8. **Phase 18.1.2** (~30-60min) — mobile map threshold tuning (conditional)
  9. **Phase 20** (~1 day CC) — static IA pages + 4-column footer
  10. **Phase 18.1.1.1** (unknown) — chunk-error investigation (re-ship 18.1.1)
  11. **Phase 21.1** (~3-4h CC) — per-country aFRR up-only worker engine extension; unblocks β option for hero country toggle
  12. **Chrome MCP lock investigation** (~30-60min Cowork) — solves recurring 4-session lock pattern
- **Recommendation:** Phase 7.7g-a-3 next. Operator's "fonts all over the place" feedback has been deferred since the 18.x cluster started; addressing it closes the typography polish gap and produces the broadest visual quality lift. Bigger phase (~1-2 days) so worth firing when fresh attention budget is available.
- **Earlier:** Phase 18.2 SHIPPED 2026-05-06 (3 commits `c11cbe5` / `22aed12` / `facbe76` on `phase-18-2-chart-editorial-polish` merged to main). Chart editorial polish: crosshair plugin (vertical line on hover), Newsreader italic ref-line callouts (4 sites), sentinel-line constants (SENTINEL_DASH = [4,4], SENTINEL_LINE_WIDTH = 0.8), 13 chart aria-labels. Phase 7.7e UI track had absorbed most spec P2-2 work pre-emptively (chartTheme.ts centralization existed); 18.2 was a smaller refined scope (~1.5h actual vs estimate 2-3h). Local-build verification via curl-only path (chrome MCP locked); structural verification confirmed 18.1.1-class ChunkLoadError absent. **Operator hard-refresh feedback post-merge:** (a) crosshair only fires on data points / hover lines, want "+" pattern (vertical + horizontal) following cursor anywhere over chart canvas — Phase 18.2.2 hotfix prompted; (b) Newsreader/typography sprawl visible on IntelFeed item — defer to Phase 7.7g-a-3 (typography rationalization, queued); (c) mojibake visible in screenshot intel item ("plÄŠtoti" should be "plėtoti") — Phase 4G follow-up candidate.
- **Earlier:** Phase 18.1.1 SHIPPED 2026-05-06 then **REVERTED same-day** via revert commit `f62d3f8` after operator hard-refresh hit `ChunkLoadError: Failed to load chunk` on production (mobile + desktop). Cause: HTML referenced JS chunks that returned 404 from origin (`cf-cache: BYPASS` confirmed). Likely culprit in 18.1.1 diff (~200 lines MobileBalticMap + GSAP guard tweak): SSR/build-time mismatch with the new code path. **Production restored to Phase 18.1 state** (mobile foundation works; mobile map is back to compressed dotted-grid). Re-ship conditional on chunk-error investigation (would-be Phase 18.1.1.1).
- **Next CC pick — Phase 18.2.2 (operator-confirmed 2026-05-06):** chart crosshair UX hotfix. Prompt at `docs/phases/phase-18-2-2-prompt.md`. ~30-60 min CC. Adds horizontal line to existing crosshair plugin + sets `interaction.intersect = false` on all chart options so crosshair "+" follows cursor anywhere over chart canvas, not just on data points.
- ~~**Phase 4G.1 candidate**~~ **[SHIPPED 2026-05-08; full entry in Shipped appendix]** — encoding-validation gate now live in production.
- ~~**Phase 4G.2 — Entity verification gate at POST /curate per rule #3**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `8915060` merged to main (`302166b`). Worker deploy `5440c37d-648e-433f-8e68-08eca70edf22`. `validateCurationEntity(body)` + `detectEntity(text)` + `isAuthoritativeSource(url)` helpers wired into `POST /curate` immediately after 4G.1's encoding gate. Operator-honest `{error: 'entity_verification_failed', field, detected_entity, source_host, message}` envelope at HTTP 400. **Pause A empirical calibration** (mirrors 4G.1 discipline): 7-item live `/feed` corpus 0/7 false-positives + 9-item positive-entity test 9/9 hits + 8-item negative-prose test 0/8 false-positives. **Refined regex from prompt's proposal:** dropped `AKA` (not real Latvian entity form) + dropped `AS` (high FP risk on English prose like "As Latvia scales..."; deferred to 4G.3 with stricter look-behind matcher); added `u` flag + `\p{Lu}/\p{L}` Unicode classes for diacritic capture (without it, `detected_entity` truncates "UAB Saulėtas Pasaulis" to "UAB Saul"). Final regex: `/\b(?:UAB|AB|MB|VšĮ|SIA|OÜ|MTÜ)\s+\p{Lu}[\p{L}\d-]*(?:\s+\p{Lu}[\p{L}\d-]*)*/u`. **Allowlist:** commercial registries (registrucentras.lt, lursoft.lv, inforegister.ee) + regulators (NRA, SPRK, Konkurentsiamet, VERT) + TSOs/markets (Litgrid, AST, Elering, Nord Pool) + EU bodies (ACER, ENTSO-E) + gov roots (lrv.lt, gov.lv, valitsus.ee, eesti.ee) + Baltic tier-1 press (LRT, 15min, Delfi LT/LV/EE, LSM, ERR, BNN, Baltic Times). Suffix-matched (`host === d || host.endsWith('.' + d)`) so subdomains pass. **4-test verification protocol** (mirrors 4G.1): hallucinated UAB+random-blog → 400 ✓; legitimate UAB+registrucentras suffix → 201 ✓; raw_text path 400 ✓; entity-free Baltic news prose+random-blog → 201 ✓ (no FP). Gates baseline-exact (tsc 0, vitest 919/919, lint baseline preserved). Test KV entries `mpa1pha5-boml40` + `mpa1phys-i5i41v` for operator cleanup via `/feed/delete-by-id`. **Future candidates filed below as 4G.3.**

- **Phase 4G.3 — Stricter AS-matcher + auto-suggest URLs at /curate** (NEW 2026-05-17 from 4G.2 Pause A deferrals; ~1-2h CC, worker-only) — Two extensions deferred from 4G.2: (a) **Stricter AS-prefix matcher** — current regex skips `AS X` Baltic entities (e.g., AS Latvenergo, AS Eesti Energia) because including AS produces unacceptable false-positive rate on English prose ("As Latvia scales BESS..."). 4G.3 adds an AS-specific matcher with stricter discriminators: sentence-end look-behind (`\.\s+AS\s+` matches only after sentence break), require ≥2 Title-Case follow-words, OR detect through known-entity-list match (curated tier-1 AS entities). Adds the missing leak path 4G.2 deliberately held. (b) **Auto-suggest authoritative URLs** — when entity-verification fails, the error envelope currently surfaces `{detected_entity, source_host, message}`. 4G.3 enhancement: if the detected entity has a known registry URL (via cached lookup against registrucentras.lt + lursoft.lv + inforegister.ee via their public APIs if available), append `suggested_source_url: '<URL>'` to the envelope. Helps operator paste with verifiable source on retry. Operator picks when ready.
- **Then operator chooses among (post-21):**
  1. **Phase 18.2.4** (~30-60min CC) — CONDITIONAL on operator post-18.2.3-merge feedback; M2 mobile tooltip pinning to fixed chart corner if dismiss-on-scroll proves insufficient OR longer-grace tweak (250ms→350-500ms) if dismiss feels too aggressive
  2. **Phase 18.2.5** (~30-60min CC) — CONDITIONAL on operator post-18.2.3-merge feedback; crosshair visibility lift (textMuted→textSecondary, 0.5px→1px) OR IntersectionObserver fallback for non-scroll edge cases
  3. **Phase 18.2.1** (~3-5h CC OR Cowork) — Baltic palette retune across all cross-card consumers per spec P2-2 hex values vs Phase 18 shipped tokens; ~30+ files; cross-cutting per discipline rule #4
  4. **Phase 18.1.2** (~30-60min Cowork OR CC) — mobile map threshold tuning if 4-amber/2-brick split visually noisy on hard-refresh (one-line edit to `MOBILE_HIGH_FLOW_THRESHOLD_MW` constant; e.g., 500 → 600 to put only Fenno-Skan 2 in brick). Trivial.
  2. **Phase 18.2** (~2-3h CC) — chart polish; spec P2-2
  3. **Phase 18.3** (~2-3h CC) — animation activation; spec P2-1/3/4
  4. **Phase 12.12 #1+#2** (~2-3 days CC) — schema validation + freshness gates
  5. **Phase 7.7g-a-3** (~1-2 days CC) — spacing residuals + type-scale rationalization; spec CC-1 + P3-1
  6. **Phase 7.7g-b reduced** (~3-4 days CC) — primitives + `useScenario()` hook + worker URL centralization; spec CC-2
  7. **Phase 19** (~3-4h CC) — A11y MVP; spec P1-3 + P2-2
  8. **Phase 20** (~1 day CC) — static IA pages + 4-column footer; spec CC-3
- **Three small follow-on phases queued post-7.7g-a-2** (operator-surfaced 2026-05-06 audit "mobile is still off, charts aren't professional, lots of old requests pending"):
  1. **Phase 18.1 — Mobile foundation pass** (~2-3h CC) — viewport meta + hero-grid responsive collapse <900px + masthead stack <520px + touch event scaffolding for hover-replacement. **Spec:** `docs/specs/2026-05-06-designer-developer-spec.md` P1-1/2/3/4/5 has concrete mobile mockup, KPI ticker reflow CSS, 44×44 touch targets, breakdown bar fix, smooth scroll. Doesn't replace Tier 6 but unblocks "site reads on phone."
  2. **Phase 18.2 — Chart editorial polish** (~2-3h CC) — chart.js fonts → Plex Mono + Newsreader for axis labels; explicit Baltic palette; tooltip styling matches Phase 18 bracket-notation; sentinel-line treatment standardized across S1/S2/RevenueBacktest. **Spec:** P2-2 chart tooltips + crosshair + tornado pointer-events fix. Doesn't replace Phase 7.7g-b Chart primitive but lifts current charts to match the editorial site.
  3. **Phase 18.3 — Animation activation** (~2-3h CC, NEW 2026-05-06 from spec) — apply 11 dormant keyframes (`hero-mount`, `cardFadeIn`, `skeleton-shimmer`, etc.); add `useCountUp` hook for KPI value tweens; copy-button feedback; card hover-lift on interactive cards. **Spec:** P2-1/3/4. Honor `prefers-reduced-motion`.
  4. **Phase 12.10c — Operator-action verification + small backlog cleanup** (~30-45min Cowork, scope reduced 2026-05-06) — document curl results for 12.9 deferred verifications; visual-confirm 12.9.1/12.9.3 from operator-side; Notion sync update for Tier 1 progress; mark closed items closed in roadmap operator-action-items section. (Branch-cleanup line dropped per workflow simplification.)
  5. ~~**Phase 19 — A11y MVP**~~ **[SHIPPED 2026-05-17; full entry in Shipped appendix]** — PR commit `e8d51ae` merged to main. 11 fixes across 14 files per 8 operator-approved design picks + 9-step Pause B order: global `:focus-visible` ring `2px var(--accent) + 2px offset + 2px radius`; 7 `<section role="region" aria-labelledby>` landmarks on page sections; 6 chart aria-label gaps closed + 2 rewrites (RegimeBarometer + RevenueSensitivityTornado data-derived); SourceFooter live region `role="status" aria-live="polite" aria-atomic="false"` auto-propagates to 11 in-prod sites; DetailsDrawer trigger `aria-expanded + aria-controls` via `useId()` auto-propagates to 12 consumers; CountryToggle per-button `aria-disabled` + wrapper `role="group" aria-label`; ContactForm 4× `aria-required` + global `input::placeholder { color: var(--text-muted) }` for cream-on-cream P5 fix. Gates baseline-exact (tsc 0, vitest 919/919, lint 125). axe-core scan: 7 color-contrast violations identical to pre-Phase-19 baseline; zero NEW landmark/ARIA/label/focus violations. Focus-ring evidence at `docs/visual-audit/phase-19/focus-ring-{1440,414}.png`. 3 follow-up candidates filed below (19.1, 19.2, axe-core CI gate). Operator post-merge actions: VoiceOver smoke + keyboard-only nav + Lighthouse a11y score target ≥95.
  6. **Phase 20 — Static IA pages + 4-column footer** (~1 day CC, NEW 2026-05-06 from spec) — 13 routes (`/methodology`, `/sources`, `/glossary`, `/references`, `/changelog`, `/archive`, `/about`, `/api`, `/press`, `/privacy`, `/terms`, `/imprint`, `/issue/:date`); 4-column footer (Product / Data / Company / Legal); reduce homepage `[src]` token instances ≤1 (move to global "Sources & freshness" panel). **Spec:** CC-3.
- **Tier 1 — operator-pick across remaining threads (after 18.1 / 18.2 / 12.10c):**
  1. **Phase 12.12 #1+#2** (~2-3 days) — schema validation + freshness gates; opens the parallel data-integrity thread.
  2. **Phase 7.7g-a-3** (~1-2 days, NEW post-7.7g-a-2 ship) — off-scale spacing residuals + shorthand expansion + missed top-level pages (intel/regulatory/layout.tsx 16 sites) + per-side CI variant extension (paddingLeft / paddingTop / etc.). ~422 sites. Continuation of value-aware gate from 7.7g-a-2.
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
5. ~~**Merged-branches cleanup on origin**~~ **[DROPPED 2026-05-06 by workflow simplification]** — operator clarified merged branches don't need active cleanup; harmless clutter on origin, no quota or collision pressure. Phase 12.10c scope reduces accordingly.
6. ~~**Chrome MCP lock investigation**~~ **[RESOLVED 2026-05-07]** — root cause identified: `npx exec chrome-devtools-mcp@latest` doesn't propagate SIGTERM cleanly on CC exit; orphan chrome-devtools-mcp processes accumulate across sessions and lock the chrome profile. Cowork investigation 2026-05-07 found 5 orphan instances spanning Tue 10AM → Thu 5:53PM (matches the 5 consecutive sessions affected: 47/48/49/50/51/52). **Fix:** pre-session cleanup alias `cc` in operator's `~/.zshrc` that runs `pkill -f "chrome.*devtools-mcp" 2>/dev/null` before launching CC. Memory entry: `feedback_chrome_mcp_orphans.md`. Visual MCP verification gate restored once operator uses the alias.

- **Roadmap last updated:** 2026-05-06 by Cowork (post-Phase-7.7g-a-2-ship: 3 commits `76c4092` / `0e41c94` / `c0ee974` on `phase-7-7g-a-2-spacing-tokens`; 361 inline-px sites migrated to canonical 8-value `--space-*` scale via Python regex pass; `lint:no-raw-spacing` value-aware CI gate live; gates green tsc 0 / vitest 919 / lint 126 / build 7 routes; PR pending operator open. Phase 7.7g-a-3 added as continuation candidate. Phase 7.7g-c entry annotated re: gate-extension framing. Audit-v2 gap-analysis acknowledged but not folded into roadmap per operator instruction "no it's ok" — gaps captured in memory only.)

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

#### ~~Phase 21.2 — S2 monthly trajectory + capacity_monthly KV fix~~ [SHIPPED 2026-05-07; full entry in Shipped appendix] (~2h actual vs estimate 2-4h)

#### ~~Phase 21 — S2 professional polish~~ [SHIPPED 2026-05-07; full entry in Shipped appendix] (~3-4h)

#### ~~Phase 18.1.1 — Mobile map redesign + per-component reflow~~ [SHIPPED 2026-05-06; full entry in Shipped appendix] (~3h actual vs estimate 3-4h)

#### Phase 18.1.2 — Mobile map threshold tuning + memory refinement [NEW 2026-05-06; CONDITIONAL on operator-visual feedback] (~30-60min)

**Why:** Phase 18.1.1 shipped the simplified mobile SVG with `MOBILE_HIGH_FLOW_THRESHOLD_MW = 500` (4-amber / 2-brick split for current S8 data). Operator hard-refresh validation pending; if split feels visually noisy or "wrong story," this phase tunes the constant.

**Scope:**
1. **Threshold tuning** — one-line edit to `MOBILE_HIGH_FLOW_THRESHOLD_MW` constant in `HeroBalticMap.tsx` (likely 500 → 600 to put only Fenno-Skan 2 in brick, or whatever feels right after seeing it).
2. **Tailwind v4 silent-drop memory refinement** — Cowork-side memory entry already updated 2026-05-06 to cover both modes (multi-selector-per-block + inline-display clobbering). This sub-item is **DONE** (task #35 in Cowork session).

**Conditional:** if operator says "looks good as-is" on hard-refresh validation, only sub-item 2 was needed and it's already done — no Phase 18.1.2 work; mark CLOSED with no commits. If operator wants threshold tuning, ship as Cowork-direct one-line edit (no CC needed).

**Estimate:** ~30-60min Cowork. Smaller than other Tier 1 items.

#### ~~Phase 12.11 — P0 functional bug reconciliation~~ [SHIPPED 2026-05-06; full entry in Shipped appendix] (~1-2 days)

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

##### Phase 7.7g-a-2 — Spacing tokens + rollout [SHIPPED 2026-05-06 → 3 commits `76c4092` / `0e41c94` / `c0ee974` on `phase-7-7g-a-2-spacing-tokens`; PR pending operator open] (~1h actual vs estimate 1-2 days)
Components used raw px inline (`padding: '8px'`, `margin: '4px'`) instead of CSS variables. Rolled out 8-value canonical scale (4 / 8 / 16 / 24 / 32 / 48 / 64 / 96 px) via `--space-2xs..3xl` token additions in `app/globals.css`; **361 inline-px sites migrated** across 56 files (288 quoted + 73 bare-number) via Python regex pass with property-name + value anchoring; `lint:no-raw-spacing` value-aware CI gate added (forbids new raw px in component padding/margin/gap with the 8-value scale as allowlist). Final gates: tsc 0 / vitest 919 / lint 126 / lint:no-raw-spacing exit 0 / lint:no-editorial-chips exit 0 / build 7 routes — baseline-exact. Migration scriptability paid off (zero existing-token-consumer blast radius — original concern empirically moot).

##### Phase 7.7g-a-3 — Spacing residuals + per-side CI extension + type-scale rationalization (~1-2 days, NEW 2026-05-06 post-7.7g-a-2-ship; scope expanded 2026-05-06 with designer/dev spec input)

**Spec input:** `docs/specs/2026-05-06-designer-developer-spec.md` CC-1 + P3-1. Pre-decided 9-step modular type scale, 4-step neutral text scale, 4-step motion scale, drop ad-hoc 6/10/14/18 spacing values, restrict Unbounded → wordmark only.

Continuation of 7.7g-a-2's mechanical migration. Three buckets the value-aware gate doesn't yet catch:
1. **Off-scale residuals** — sites using non-canonical px values (e.g., `padding: '6px'`, `margin: '12px'`) that don't map to the 8-value scale. Either snap to nearest scale value or add a justified design-rationalization exception with comment.
2. **Shorthand-expansion residuals** — `padding: '4px 8px'` / `margin: '8px 16px'` style sites where the value-aware regex was conservative; expand and migrate to `--space-*` per side.
3. **Missed top-level pages** — 16 raw-px sites in `intel/regulatory/layout.tsx` not in 7.7g-a-2's component sweep.
4. **Per-side CI extension** — extend `lint:no-raw-spacing` regex to cover `paddingLeft` / `paddingTop` / `marginInline` / etc. (currently only enforces shorthand `padding` / `margin` / `gap`).
Estimate: ~1-2 days CC, similar Python-regex pattern as 7.7g-a-2 but with per-side enumeration. ~422 sites total in scope per CC's Session 43 handover.

##### ~~Phase 7.7g-a-3 (original — accent color consolidation)~~ [SUPERSEDED 2026-05-06 by Phase 18]
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

**Spec input:** `docs/specs/2026-05-06-designer-developer-spec.md` CC-2 (component contracts including `<Pill.Group>`, `<FreshnessChip>`, `<KPI>`, `<ChartFrame>`). **Critical architectural piece:** the `useScenario()` hook + URL-sync pattern (single reducer, `history.replaceState`, `data-loading` attr, 240ms count-up tween) is the fix that prevents future toggle-doesn't-recompute bugs (P0-1 CAPEX selector / P0-2 duration toggle in spec). Bake into prompt §0 context.

5. **Build 5 primitive components,** every card rebuilt from these:
   - **`Stat`** — eyebrow label + hero number + delta + sparkline + footer
   - **`Card`** — consistent padding + border (already shipped Phase 18; remaining: interactive prop for hover-lift)
   - **`Badge`** — 3 variants (status, severity, neutral)
   - **`Chart`** wrapper — consistent title + source row + controls
   - **`Drawer`** — named, counted, expandable
6. **Worker URL centralization** — single `app/lib/worker-url.ts`; migrate 16 sites.
7. **Source attribution moves to Drawer** [operator surfaced 2026-05-05 — *"no need to show the source"*]. Card face renders only the data + freshness chip. Source URL, source name, methodology citation collapse into the `Drawer` primitive ("Reading this card" expandable). Card-face metadata reduced to: hero number, derived chip, micro-chart, freshness tick.
8. **`useScenario()` hook + URL-sync pattern** [from spec CC-2]. Single source-of-truth reducer for `{ dur, capex, cod, scenario }`; all toggles dispatch to same reducer; all displays read from it. Prevents stale-closure / parallel-state-tree bugs.

##### Phase 7.7g-c — Regression cleanup + CI gate (~2-3 days, scope reduced 2026-05-06)
7. **rgba/hex regression cleanup** — fix 213 rgba violations + 11 hex colors.
8. **CI grep gate consolidation** — `lint:no-raw-spacing` already shipped in Phase 7.7g-a-2 (value-aware, shorthand only); `lint:no-editorial-chips` already in place from Phase 12.9.1. This phase folds those existing gates into a single `npm run lint:tokens` umbrella + adds rgba/hex/hardcoded-URL detection. Per-side spacing variant detection lives in Phase 7.7g-a-3 (continuation).

**Acceptance:** every page element expressible as one of the 5 primitives; CI fails on new rgba/hex/hardcoded URL; all spacing/chips/color gates run from one umbrella.

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
| 1 — Foundation | 12.12 (16 sub-items + #17 daily_intel.py mirror) · 7.7g-a-1 [SHIPPED] · 7.7g-a-2 [IN FLIGHT] · ~~7.7g-a-3~~ ~~7.7g-a-4~~ · **18** [SHIPPED] · **18.1** (mobile foundation, ~2-3h) · **18.2** (chart editorial polish, ~2-3h) · **12.10c** (operator-action verification, ~1h Cowork) · 7.7g-b reduced · 7.7g-c · **12.10b** [SHIPPED] | ~12-15 days |
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
- **Phase 4G.1** — POST /curate encoding-validation gate [SHIPPED 2026-05-08; 2 commits `1450e02` (worker) + `b60db01` (Session 55 handover) on `phase-4g-1-curate-encoding-gate`; worker version `e150b2d8-8878-49b9-ab0e-fc0ef8588ea5` deployed at Pause B]. **Pattern set refined Pause A** based on empirical sanity-check against current corpus (210 curations + 8 feed items): dropped `/Ä[A-Z]/` (regex matches nothing real — character class ASCII-only, doesn't catch real mojibake bigrams which use extended-Latin like Š/„/etc.), dropped bare `/Ä/` (false-positive risk on Estonian — Tähtsamad, Käiku — and German), dropped bare `/Å/` (false-positive on Swedish/Finnish/Norwegian — Stora Enso etc.). **Added 7 explicit Lithuanian Win-1252-misdecode bigrams** covering full LT special-char table: `Ä„` (ą), `Ä…` (ą Win-1252), `Ä—` (ė Win-1252), `Ä™` (ę), `Ä¯` (į), `Å³` (ų), `Å«` (ū). Plus `ÄŠ` (ė/Ė per ENTSO-E corpus), `Å¡` (š), `Å¾` (ž). Empirically validated: zero false-positive against current 210-item corpus; only the existing VERT batch dupe matched. **4-test verification protocol:** Test 1 mojibake-title→400 ✓, Test 2 clean Lithuanian ė→201 ✓, Test 3 mojibake-raw_text→400 ✓, Test 4 Estonian ü/ä→201 ✓ (load-bearing — proved no false-positive on legitimate non-LT Baltic content). All gates baseline-exact (tsc 0 / vitest 924/925 with pre-existing freshnessBadge boundary failure carried / lint 127 / no-raw-spacing 0 / no-editorial-chips 0 / build 7 routes). Local-build smoke-test all routes 200. Test entries (cur_mownfpv9-6kweqy + cur_mownfqhs-nwli7n) cleaned via /feed/delete-by-id by operator post-merge. **Side findings:** 7 dupes of cur_mowid0zn-siyurd "[PDF] Leidimai plÄŠtoti..." still in raw /curations KV (de-duped to 1 in /feed; that 1 already deleted earlier; 30-day TTL will reap; non-user-visible). Pre-existing freshnessBadge "renders TODAY label between 6h and 24h" failure introduced by Phase 21's EET-day-aware logic; time-of-day-dependent; foldable into 12.10b housekeeping later.
- **Phase 18.1.3** — Mobile per-component reflow (extracted from reverted 18.1.1) [SHIPPED 2026-05-07; 3 commits `cec168d` (reflow: 6 sub-items + visual evidence) + `f739d17` (band-aid: drop html + body overflow-x:hidden) + `a49cdff` (Session 53 handover + 7 visual audit PNGs) on `phase-18-1-3-mobile-component-reflow`]. **Operator-screenshot bug closed:** AssumptionsPanel right-column rendering vertical-character-per-line text → readable paragraph blocks at 360px viewport. Per Pause A discovery: line numbers drifted +11/+27 from Phase 18.1.1 era (post-7.7g-a-3 typography phase touched same files); zero partial-fixes from 7.7g-a-3 — full scope still needed. **6 sub-items shipped** in lowest-risk-first order: (4b) Tornado SVG `width={width}` → `viewBox + maxWidth: 360 + width: 100%`; (4c) MonthlyHeatmap `1fr` → `minmax(0, 1fr)`; (3) S3 BreakdownBar `.breakdown-bar` className family + 6 split `@media (max-width: 720px)` blocks (Tailwind v4 silent-drop pattern respected per memory `feedback_tailwind_v4_silent_drop.md`); (1) DSCR triple panel `min-width: 0` + `overflow-wrap: anywhere` + `.rv-dur-dscr` class wrapping DurationOptimizer + DSCR 2-col grid stacks at <720px; (2) AssumptionsPanel `.assumptions-grid` class replacing inline `auto 1fr` with `auto minmax(0, auto) minmax(0, 1fr)` desktop / single column at <720px + drop `whiteSpace: nowrap` + add `overflowWrap: anywhere`; (4a) `.rv-main > *, .rv-analytics > * { min-width: 0 }` injection in inline `<style>`. **Both band-aids removed:** `html { overflow-x: hidden }` (globals.css:486 origin Phase 18.1) + `body { overflow-x: hidden }` (globals.css:502); 5-viewport scrollWidth=clientWidth verified clean at 360/414/768/1024/1440 with `overflowX: visible` confirmed in served bundle (cache-bypassed reload — not just source). **Phase 18.1.4 candidate NOT FILED** — honest empty-state, no regressing site discovered. **Chrome MCP gate validated end-to-end** — first chrome-MCP-clean ship since Session 47 (5+ session streak broken via `cc` alias fix from Cowork investigation). All 6 gates baseline-exact (tsc 0 / vitest 925/925 / lint 127 / no-raw-spacing 0 / no-editorial-chips 0 / build 7 routes); 20/20 chunks 200; CSS chunk 40,479 B (smaller than 18.1.1's 43,470 B reference — 7.7g-a-3 typography pruning was load-bearing). **Risk class LOW confirmed** — no HeroBalticMap/MobileBalticMap/GSAP/dynamic imports touched (the actual Phase 18.1.1 chunk-error sources). 7 visual audit PNGs at `docs/visual-audit/phase-18-1-3/`. Files modified: 4 components + 1 globals.css + handover.
- **Phase 7.7g-a-3** — Typography rationalization + spacing residuals + per-side CI extension [SHIPPED 2026-05-07; 5 commits `8858f35` (tokens) + `cc7406f` (fonts) + `c6498b4` (ci) + `852e2f2` (migration) + `d19f783` (handover) on `phase-7-7g-a-3-typography-rationalization`]. 65 files changed (+636/-430). **Sub-items (a)-(g) shipped:** (a) 9-step modular type scale per spec CC-1; (b) 185 inline fontSize sites migrated to scale tokens via Python regex pass; (c) Unbounded fully removed (spec deviation from P3-1 "wordmark-only" — masthead is PNG image so deviation safe; 17 production files / 31 var(--font-display) line hits migrated to var(--font-serif) editorial bulk + var(--font-mono) at 5 data sites); (d) Plex + Newsreader subset; 5 weights / ~167 KB Latin (vs spec 4 / 120 KB — Newsreader 200 hairline + 400-italic load-bearing per Phase 18 commitments; deliberate exception); (e) 202 shorthand padding/margin sites expanded to per-side via Python regex pass; (f) 113 off-scale 6/10/14/18/20/40/80/120 px residuals preserved as deliberate operator-design-rhythm exception (gate is value-aware so off-scale doesn't break gate); (g) `lint:no-raw-spacing` regex extended to per-side variants (paddingTop/marginInline/etc.). **Bug-and-fix during implementation:** initial shorthand-migration script emitted bare `var(--space-xs)` (invalid JS — `var` is keyword); 227 unquoted refs across 51 files repaired by `_phase-7-7g-a-3-shorthand-fix.py` wrapper. Single duplicate-property tsc error in IntelFeed.tsx:641-647 resolved by combining sites. Discipline rule #1/#3 working. **Production CSS confirmed:** 9 distinct `--type-*` tokens emitted; 8 distinct `--space-*` tokens; 0 production code references to `--font-display` or Unbounded. All gates baseline-exact (tsc 0 / vitest 925/925 / lint 127 / no-raw-spacing 0 / no-editorial-chips 0 / build 7 routes). 21 chunks 200; 18.1.1 ChunkLoadError class structurally absent. Visual audit deferred to chrome MCP recurring lock (5th consecutive session); curl-only verification path + STATE.md prose at `docs/visual-audit/phase-7-7g-a-3/`. **Operator-confirmed post-merge:** masthead PNG renders correctly (Unbounded was vestigial); hero scale shift 72px Unbounded → 64px Newsreader feels right. Closed operator's "fonts all over the place, some old some new" feedback originally surfaced after Phase 18.x cluster.
- **Phase 21.2** — S2 monthly trajectory + capacity_monthly KV fix [SHIPPED 2026-05-07; 3 commits `f9d0db9` (frontend: S1 + S2 fmtMonth + empty-state) + `38776d9` (worker: appendBtdHistory helper + backfill endpoint) + `ab33929` (Session 51 handover + STATE.md) on `phase-21-2-monthly-trajectory-kv-fix`; worker version `b2152be9-ed8b-4e71-9f09-9c11d96d273a` deployed at Pause B]. **Pause A diagnosis confirmed empirically:** production curl returned `capacity_monthly[0] = { month: "2026-03", days: 1 }` matching smoking gun; root cause was dual-write architecture mismatch — three write paths existed (4h cron at fetch-s1.js:6329, 09:30 watchdog at :6205, POST /s2/update at :7269) but only one wrote to s2_btd_history while all three wrote to s2_history. The 3rd write path (09:30 watchdog) was missed in Pause A scoping but caught at implementation; honest acknowledgment in handover (rule #3 no-silent-drops). **Sub-items shipped:** (a) `fmtMonth` helper output `Mar 26` → `2026-03` (operator-picked ISO; identity function since worker payload month already YYYY-MM); both S1Card.tsx + S2Card.tsx consumers updated per discipline rule #4 cross-card consistency; (b) KV diagnostic confirmed under-population pattern; (c) shared `appendBtdHistory(env, payload)` helper paired into all three write paths; new POST `/s2/btd-history/backfill` UPDATE_SECRET-gated endpoint reads `s2_history` (consistently-written KV with 48 entries from 2026-03-02) and re-emits to `s2_btd_history`; (d) honest empty-state fallback at threshold <3 months in S2Card.tsx:170-180 with dynamic accrual-date computation, rule-#6-compliant text "Capacity history accruing — N months collected (YYYY-MM + YYYY-MM); full trajectory available YYYY-MM-01." All gates baseline-exact (tsc 0 / vitest 925/925 / lint 127 / build 7 routes / 20/20 chunks 200 / no-raw-spacing exit 0 / no-editorial-chips exit 0). No specs added (fmtMonth identity tautological; capacityEmptyStateText time-dependent brittle in CI; flagged for 21.2.1 follow-up if regressions hit). **Cross-card check (rule #4):** s1_capture.monthly GREEN with 15 months populated 2025-03 → 2026-05 (different KV `s1_history` via different write topology); no Phase 21.3 needed. **Operator-run backfill curl** restored chart 2026-05-07: `source_count: 48 / target_after: 48 / added: 47`; capacity_monthly length 1 → 3 (Mar/Apr/May 2026); chart re-activated with 3 bars in `2026-03` ISO format. Operator workflow recovery clean.
- **Phase 21** — S2 professional polish [SHIPPED 2026-05-07; 3 commits `3e75557` (frontend hero inversion + IMB connector + chip anchor) + `b11addf` (worker afrr_up_avg_90d_delta derived field + registry) + `799ad30` (Session 50 handover + visual-audit STATE.md) on `phase-21-s2-professional-polish` merged to main; worker version `2b3c6bc5-e9a3-4819-9919-cd1ec3d85952`]. Origin: operator hard-refresh feedback 2026-05-07 "I don't understand this one at all? what is mwh/h?" + energy-expert audit (saved as `project_s2_audit_phase_21.md`). All gates baseline-exact (tsc 0 / vitest 925/925 / lint 127 / build 7 routes); 7 files modified; ~+50 lines source; +1 KB gzipped delta. **Three sub-items shipped:** (a) Hero inversion — `S2Card.tsx` swap `data.afrr_p50` (€13.5/MW/h up+down combined) → `data.afrr_up_avg` (€7.91/MW/h up-only Lithuania); €5.9M/yr footer auto-corrects to €3.46M/yr (operational reality); CountryToggle disabled-on-aFRR with `effectiveCountry` derivation pattern preserving user's prior LV/EE pick across product round-trip. (b) 90d delta signal — `s2.afrr_up_avg_90d_delta` derived field (current 30d vs prior 60d window per Pause A pick; computeAfrrUp30dVs60dDeltaPct function); `AfrrDeltaChip` component renders quantitative micro-descriptor `Δ ±N% / 90d` per rule #6; first deploy returns null (s2_history at 48/60 days; first real value ~2026-05-19; full 90d window ~2026-06-18); muted UI with explanatory tooltip handles null state honestly. (c) IMB interpretive line below imbalance tiles + `MarketThicknessChip` quantitative-anchor extension Option A (`AFRR · THICK · ≥100 MW` / `MFRR · MEDIUM · 50–100 MW` / `FCR · THIN · ≤50 MW`); chip retains technical term recognized by energy experts + adds quantitative anchor for non-experts; rule #6 spirit satisfied. **Quiet integrity fix landed in same scope** (audit-triage rule #1): subline mislabel `(up only, Baltic avg)` → `Combined up+down (LT, 3m P50)` methodology disclosure; `data.afrr_up_avg` is **Lithuania-only** per BTD price_procured_reserves col 11/12, NOT Baltic-aggregate; the previous label was misleading. **Local-build smoke-test:** curl-only verification (chrome MCP locked 3rd consecutive session); 20/20 JS chunks 200; new symbols (`afrr_up_avg_90d_delta`, "up only", "Lithuania, up-direction column", `100 MW`, `50 MW`) confirmed in static chunks; 18.1.1 ChunkLoadError class structurally absent. **Cross-card consistency (rule #4):** no other card displays €13.5 as primary hero post-fix; `afrr_up_avg` consumers reduced (S2Card hero migrated; ContextTable + drawer kept on `act.afrr_p50` for reference). Phase 21.1 candidate filed (per-country aFRR worker engine extension would unblock β option for hero country toggle — would need BTD historical data extraction beyond LT col 11/12 only). Phase 22 candidate filed (institutional-grade S2: forward curves / P95 tail / cross-region Baltic vs Continental benchmarks).
- **Phase 18.2.3** — Tooltip dismiss-on-scroll mobile fix [SHIPPED 2026-05-07; 2 commits `74489d4` (dismiss handler) + `a0423b2` (Session 49 handover) on `phase-18-2-3-tooltip-dismiss-mobile`] — single-file change in `ChartTooltip.tsx` (+30 lines); window scroll listener (passive) + document touchend with 250ms grace timer added inside `useChartTooltipState` hook effect; reuses existing `tooltipStateEqual` dedupe pattern (Phase 7.7e Session 25 React error #185 cascade fix preserved). All gates baseline-exact (tsc 0 / vitest 925/925 / lint 127 / build 7 routes / 20/20 chunks 200). Touchend listener verified bundled in 5 chunks. Bundle 4,620 KB exact-match Phase 18.2.2 closeout. Verified zero `stopPropagation` interference: 6 hits all on `onClick` events for intel/asset/page UI; document-level touchend bubbles cleanly. **Operator-reported bug closed:** mobile tooltip stuck at top of viewport after scroll (S2 "MAR 26 / €6.12/MW/h" floating overlay despite chart scrolled out). **Universality:** scroll-dismiss applies on desktop too (additive alongside existing mouseleave); single set of listeners covers both modalities; no `@media` gating needed. **Per Pause A judgment calls:** 250ms touchend grace (mid-band of operator's 200-300ms range; balances tap-and-read vs tap-then-pan-races-scroll), per-instance listeners (~19 hooks; cost analysis ~1,140 calls/sec during active scroll passive; bailout via dedupe means non-visible instances skip re-render), IntersectionObserver SKIPPED for first ship (filed as 18.2.5 if non-scroll edge case surfaces). **Cross-session friction observation upgraded:** chrome MCP lock now on 3rd consecutive session (47 + 48 + 49); curl-only verification path used; Cowork-side investigation candidate filed.
- **Phase 18.2.2** — Chart crosshair UX hotfix [SHIPPED 2026-05-06; 5 commits on `phase-18-2-2-crosshair-ux`: `67405e8` (crosshair "+" + CHART_INTERACTION rollout) + `bdc78ab` (Session 48 handover) + `ab67e88` (α tooltip typography tighten) + `773285a` (β small-chart heights 120→170 / 140→190) + `9668bae` (Session 48 handover-amend)] — vitest 925/925 baseline-exact; tsc 0 / lint 127 / build 7 routes; 9 files modified; +1 KB gzipped delta. **Three sub-items shipped:** (1) Crosshair "+" — `makeCrosshairPlugin(colors)` extended to draw both vertical AND horizontal lines via `tooltip.caretX`/`caretY` + `chartArea.left/right` access; `CHART_INTERACTION = { mode: 'index', intersect: false, axis: 'xy' }` const exported and rolled out to all 10 plugin sites (5 already had inline literal — migrated; 5 lacked it entirely — added); fires anywhere over chart canvas. (2) α tooltip tightening — `ChartTooltip.tsx` typography + padding: value 17→13, lineHeight 1.05→1.15, padding 10/12→6/8, minWidth 128→96, headline 10.5→10, marginBottom 5→3, secondary grid 10.5→10 + rowGap 3→2 + marginTop/paddingTop 8/8→6/6, source-footer marginTop 6→5; tooltip box drops ~24% in size, padding ~33-40%; tooltip/chart ratio improves from 58-67% to 31-35% (after β). (3) β small-chart heights — S1.Sparkline 120→170, S1.MonthlyChart 140→190, S2.HistoryChart 120→170, S2.MonthlyTrajectoryChart 120→170, S2.CapacityChart 140→190; +30-42% per chart; tooltip-to-chart proportionality improved. **Local-build smoke-test:** curl-only verification path (chrome MCP locked 2nd consecutive session); home + methodology + intel HTTP 200; 20/20 JS chunks 200; new symbols (`SENTINEL_DASH`, `kkme-crosshair`, `Newsreader`, `axis:"xy"`) confirmed in static chunks; 18.1.1 ChunkLoadError class structurally absent. Phase 18.2.3 follow-up filed for mobile tooltip dismiss bug; Phase 18.2.4 + 18.2.5 conditional candidates filed.
- **Phase 18.2** — Chart editorial polish [SHIPPED 2026-05-06; 3 commits `c11cbe5` (theme constants + crosshair plugin) + `22aed12` (5 chart components: theme adoption + sentinel constants + Newsreader italic ref-line callouts + crosshair plugin + 13 data-derived aria-labels) + `facbe76` (Session 47 handover + 18.2.1 candidate filed) on `phase-18-2-chart-editorial-polish`] — vitest 924/925 baseline-exact (1 pre-existing freshness boundary failure unchanged); tsc 0 / lint 127 / build 7 routes (10.7s) / `lint:no-raw-spacing` exit 0 / `lint:no-editorial-chips` exit 0; ~1 KB gzipped delta; no new deps; no worker deploy. **Per-fix landed:** (A) `makeCrosshairPlugin(colors)` factory in `chartTheme.ts:140-159` integrated across 9 chart wrappers (S1.Sparkline + S1.MonthlyChart + S2.History + S2.MonthlyTrajectory + S2.Capacity + RevenueBacktest + DegradationChart + CannibalizationChart + RevenueChart + TradingEngineCard.HourlyChart); skipped on DSCRChart + Drawer.Degradation (both have `tooltip.enabled: false` so plugin's `tooltip.opacity` gate would never fire). (B) `CHART_FONT_DISPLAY = "'Newsreader', serif"` constant added; 4 ref-line callouts switched to italic 10px Newsreader (RevenueBacktest "Y1 model €N" + DegradationChart "0.80·augment" + "0.70·EoL" + CannibalizationChart "1.0·today"). (C) `SENTINEL_DASH = [4,4]` + `SENTINEL_LINE_WIDTH = 0.8` constants extracted in chartTheme.ts; 7 sites refactored; RevenueChart Fleet S/D `[2,3]` left alone with explanatory comment (intentional same-chart differentiation from OPEX). (D) 13 chart wrappers gained data-derived quantitative aria-labels (no editorial language per rule #6); examples: "Day-ahead 2h capture, last 30 days; median €113/MWh; P90 €203/MWh", "State-of-health trajectory over 18 years; year-17 retention 70%". **Per Pause A audit-triage:** spec P2-2 tornado pointer-events claim NOT REPRODUCIBLE (no `pointer-events: none` in `RevenueSensitivityTornado.tsx`); spec hex Baltic palette `#1a3833 / #d4a574 / #a8324a` MISMATCH with Phase 18 shipped tokens (different rgb values) — surfaced as Phase 18.2.1 candidate (cross-cutting, ~30+ files, deserves own scope); chart titles claim NOT APPLICABLE TO CANVAS (chart titles are HTML/JSX already using `var(--font-serif)`). **Phase 7.7e UI track had absorbed most P2-2 work pre-emptively** — `chartTheme.ts` centralization (`useChartColors()` + `useTooltipStyle()` + `CHART_FONT.family`) + `getComputedStyle()` resolution + theme-toggle MutationObserver were already in place (Sessions 24+25). **Local-build smoke-test:** curl-only path per operator approval (chrome MCP locked by parallel CC sessions); npm run build clean (0 errors, 7 routes); `npx serve@latest out -l 3100` all 20 JS chunks return HTTP 200; SENTINEL_DASH / kkme-crosshair / Newsreader confirmed in static chunks (no tree-shaking); 18.1.1 ChunkLoadError class structurally absent. Visual hover/theme-toggle verification deferred to operator post-merge. **Operator post-merge feedback:** Phase 18.2.2 hotfix needed — crosshair fires only on data points (chart.js default `intersect: true`), should follow cursor anywhere as "+" pattern.
- **Phase 18.1.1** — Mobile map redesign + per-component reflow [SHIPPED 2026-05-06 PR #67 → merge `0a9a68e`; **REVERTED SAME-DAY 2026-05-06** via revert commit `f62d3f8` after operator hard-refresh hit `ChunkLoadError: Failed to load chunk /_next/static/chunks/<hash>.js` on production mobile + desktop; chunks returned 404 with `cf-cache: BYPASS` confirming origin doesn't have them despite manifest referencing them; likely SSR/build-time mismatch with new MobileBalticMap component (~200 lines) + GSAP guard tweak; production restored to Phase 18.1 state in ~30s after `git revert -m 1 0a9a68e --no-edit && git push`. **Re-ship conditional on Phase 18.1.1.1 chunk-error investigation** (debug `npm run build` output locally vs CF Pages, identify which import/component fails to bundle, fix SSR boundary or use `dynamic()` import). Original commits `3d8b48e` (map) + `1839328` (reflows) + `fe346c7` (handover) preserved in git history on `phase-18-1-1-mobile-map-redesign` branch for re-application after fix. — vitest 925 baseline-exact; tsc 0 / lint 127 (40e/87w; +1 warning acceptable per Phase 18.1 transition baseline) / build 7 routes / `lint:no-raw-spacing` exit 0 / `lint:no-editorial-chips` exit 0; +200/-1 HeroBalticMap.tsx + +35/-22 RevenueCard.tsx + +5/-4 S3Card.tsx + +4/-2 RevenueSensitivityTornado.tsx + +75/-10 globals.css; CSS chunk 42,421 B → 43,470 B (+1,049 B / +2.5%); 16 visual-audit PNGs at `docs/visual-audit/phase-18-1-1/`. **Direction A simplified mobile SVG variant** (`MobileBalticMap` sub-component): hand-coded LT/LV/EE country outlines + 6 cable arrow-lines (NordBalt / LitPol / EstLink 1+2 / Fenno-Skan 1+2) + MW labels in Plex Mono with halo + threshold color (`MOBILE_HIGH_FLOW_THRESHOLD_MW = 500`; amber default / brick rose >500 MW; current S8 splits 4-amber / 2-brick) + neighbor anchors FI/SE/PL + Newsreader country labels. CSS-only desktop ↔ mobile swap at 900px breakpoint (matches Phase 18.1 hero collapse). GSAP particle init now skipped on `window.innerWidth < 900` to avoid wasted MotionPath work when desktop SVG is hidden. **Per-component reflows landed:** (1) DSCR triple panel `RevenueCard.tsx:1094, :1100, :1110` — `min-width: 0` + `overflow-wrap: anywhere` + new `.rv-dur-dscr` class wrapping 2-col grid stacks at <720px; (2) AssumptionsPanel grid `RevenueCard.tsx:721+` — `.assumptions-grid` class replacing inline `auto 1fr` with `auto minmax(0, 1fr)` desktop / single column at <720px; dropped `whiteSpace: nowrap` on label cells; covers RTE row + v7.3 cycles row + v7.2 fallback + 3 standard rows in one fix; (3) S3Card BreakdownBar `S3Card.tsx:80-96` — `.breakdown-bar` family className + `<720px` flex-wrap stack media query (spec P1-4). **Pause-A scope additions** (3 sources beyond prompt's 4-item list — discipline rule #1 in action): (3a) `.rv-main > *, .rv-analytics > * { min-width: 0 }` letting chart.js Line + Sensitivity tornado SVG canvases shrink to grid track; (3b) Sensitivity tornado SVG converted from explicit `width={360}` to `viewBox + width: 100% + maxWidth: 360`; (3c) MonthlyHeatmap grid `1fr → minmax(0, 1fr)` (heatmap was rendering 22px×13 = 346px, escaping 248px parent). Without these, body scrollWidth at 360 dropped 556 → 459 (DSCR only) → 439 (+ AssumptionsPanel) → 360 (+ chart-canvas + tornado + heatmap). **BOTH band-aids removed** — `html { overflow-x: hidden }` AND `body { overflow-x: hidden }` both removed (operator's Pause-B-end ask); 5-viewport scrollWidth=clientWidth verified clean at 360/414/768/1024/1440. **Tailwind v4 silent-drop tally:** ≥6 instances + new mode discovered (multi-selector-per-block ALSO drops, not just stacked-inside-existing) + CSS specificity gotcha (inline `display: ''` clobbers class @media display rule, needs `!important` or CSS-baseline). Memory entry tightened post-merge to cover all three modes. **Operator hard-refresh validation pending** for the 4-amber / 2-brick threshold split — Phase 18.1.2 candidate filed for one-line `MOBILE_HIGH_FLOW_THRESHOLD_MW` tuning if visually noisy. **9 scratch `_phase-18-1-1-*.mjs` Playwright probes** kept untracked locally (operator instruction; signal-bearing commits only).
- **Phase 18.1** — Mobile foundation pass [SHIPPED 2026-05-06; 3 commits `1d412b2` (foundation) + `04949fd` (components) + `2423c3a` (handover) on `phase-18-1-mobile-foundation`] — vitest 925 baseline-exact; tsc 0 / lint 126 / build 7 routes / `lint:no-raw-spacing` exit 0 / `lint:no-editorial-chips` exit 0; +165 / -27 across 11 files; +125 lines globals.css (motion vars + smooth scroll + overscroll-contain + tap-target-mobile globals + hero-section collapse media + .kpi-tile responsive grid); `app/layout.tsx` viewport export added (Next 15 metadata pattern); `HeroBalticMap.tsx:357` 3-col grid `minmax(260,300) minmax(540,620) minmax(260,300)` collapses to single-column flex stack at <900px; `SignalBar.tsx` 6-col KPI grid reflows 6→3→horizontal-scroll-snap at 900/520 boundaries; 8 touch-target sites bumped to 44×44 mobile via `tap-target-mobile` class hook (S2Card pills, RevenueCard ControlGroup, S1Card duration toggle, StickyNav hamburger + mobile menu links + Get-in-touch button, SignalBar tile, ThemeToggle nav variant); `:focus-visible` 2px `--accent` ring globally; 7 `transition: all` anti-pattern sites replaced with explicit property lists; `--motion-instant: 80ms` / `--motion-fast: 160ms` / `--motion-base: 240ms` / `--motion-slow: 400ms` / `--ease-standard` tokens added to `:root`. **Pause-A discoveries:** spec width:Npx claim REFINED (24 hits all decorative/capped, none layout-locking — left as-is post-viewport-meta fix); theme-toggle "0×0px" claim NOT REPRODUCIBLE for hero variant (already 44×44), nav variant 32×32 was real (bumped). **Pause-B verification:** 5 viewports (360/414/768/1024/1440) all PASS scrollWidth=clientWidth; touch-target measurements confirm 44×44 mobile / 32-39 desktop (pointer:fine activation). **Pause-C verification:** StickyNav uses `position: fixed` not `sticky` — html `overflow-x: hidden` band-aid safe. **3 in-implementation surprises:** (1) Tailwind v4 / Turbopack silently dropped `.hero-map-wrapper` rule stacked inside existing `@media` block — hoisted to its own `@media` at globals.css:748-756 (memory entry filed); (2) SVG `<g>` past viewBox boundaries (off-map eastern context city labels) inflated `document.documentElement.scrollWidth` independent of CSS clipping — added `overflow: hidden` SVG inline-style; **labels are now invisible**, operator confirmed they were intended-visible — Phase 18.1.1 fixes via direction A redesign; (3) internal sub-card overflow (DSCR triple panel + RTE assumption rows + cycles_breakdown 4-col bar) revealed once viewport meta let mobile actually render at 360px width — page-level `html { overflow-x: hidden }` band-aid applied; per-component `min-width: 0` + label-truncation deferred to Phase 18.1.1. **Operator hard-refresh feedback:** "map doesn't work on mobile, might need to think of something better" — direction A picked for 18.1.1 (simplified country-outline SVG + arrow-line interconnectors below 900px). **15 visual-audit screenshots** at `docs/visual-audit/phase-18-1/`.
- **Phase 12.11** — P0 functional bug reconciliation [SHIPPED 2026-05-06; 4 commits `12ef52d` / `0e5ff34` / `0e3ed33` / `d804dfc` on `phase-12-11-p0-bug-reconciliation`] — vitest 919 → 925 (+6 calendar-EET specs); tsc 0 / lint 126 / build 7 routes; 8 files modified, ~160 insertions; 6 visual-audit PNGs; frontend-only no model_version bump no worker deploy. **Per-bug status:** Bug #1 FIXED (fleet 822 vs 651 inline subscript "(BESS + pumped hydro)" on hero + SignalBar header), Bug #2 FIXED (AFRR precision standardized to 2dp across all 5 consumer sites — audit's 3 + Pause-B-discovered 2: HeroMarketNow.tsx + StatusStrip.tsx folded in), Bug #3 FIXED (freshness `isSameVilniusDay` helper + `hoursStale < 24 && isSameVilniusDay(ts, now)` boundary; 3 EET-day-crossing Vitest specs), Bug #4 FIXED (DISPATCH unit `/MW` → `/MW/DAY`), Bug #5 NOT REPRODUCIBLE (live `/revenue` matrix legitimately emits cod=2027 rows; sensitivity test correctly anchors), Bug #6 NOT REPRODUCIBLE (buildTornadoBars math verified consistent), Bug #7 FIXED (BalticStorageIndexCard sup² anchor + footnote "Coverage pending Phase 29.1 — engine extension queued"), Bug #8 NOT REPRODUCIBLE (filter exists at IntelFeed.tsx:1066-1077). **Audit-v2 spec verification:** P0-1 (CAPEX selector) + P0-2 (duration toggle) empirically tested via localhost click protocol (RevenueCard.tsx:1528-1577 useState+useEffect URL-sync pattern); both VERIFIED NOT REPRODUCIBLE with empirical data tables (CAPEX €120/€164/€262 → IRR 20.2%/12.8%/4.5% with full URL+description+headline triple sync; duration 2H/4H → IRR 12.8%/6.0% matching optimizer cells). Discipline rule #1 saved scope from phantom-bug expansion. **Follow-ups filed:** Phase 12.11.1 (tornado COD-axis framing as 2026 ages), Phase 12.12 #3 territory (intel feed-source-refresh if homepage >30d evidence reproduces), Phase 12.12 #5 candidate metrics (s2.afrr_up_avg precision pinning, flexibility_fleet_mw vs bess_installed_mw scope-disclosure rule, analysis.totals.per_mw `/DAY` qualifier rule), latent scenario-vs-pivot conflation in tornado when scenarios re-populate.
- **Phase 7.7g-a-2** — Spacing tokens + rollout [SHIPPED 2026-05-06 PR #64 → merge commit `5fd2ca4`; 3 commits `76c4092` (tokens) + `0e41c94` (361-site migration) + `c0ee974` (CI + handover) on `phase-7-7g-a-2-spacing-tokens`] — 919 tests (no new); canonical 8-value `--space-2xs..3xl` scale (4/8/16/24/32/48/64/96 px) added to `app/globals.css`; **361 inline-px sites migrated** across 56 files (288 quoted `padding: '8px'` style + 73 bare-number `padding: 8` style) via Python regex pass with property-name + value anchoring; `lint:no-raw-spacing` value-aware CI gate added (shorthand `padding` / `margin` / `gap`; per-side variants deferred to Phase 7.7g-a-3). Final gates tsc 0 / vitest 919 / lint 126 / lint:no-raw-spacing exit 0 / lint:no-editorial-chips exit 0 / build 7 routes — baseline-exact. Visual diff: zero shift expected (1:1 value-preserving migration). Estimate: ~1h actual vs prompt's 1-2 days — migration scriptability paid off; original blast-radius concern empirically moot (zero existing-token consumers). Three residual buckets (off-scale + shorthand expansion + 16 missed top-level pages in intel/regulatory/layout.tsx + per-side CI extension) split out as Phase 7.7g-a-3.
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
