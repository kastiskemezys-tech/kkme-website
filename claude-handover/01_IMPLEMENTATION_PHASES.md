# KKME.eu — Implementation Phases
**Updated: 2026-03-11**

---

## Phase summary

| Phase | Name | Status | Key deliverable |
|-------|------|--------|----------------|
| 0 | Infrastructure | ✅ Complete | Worker, KV, deploy pipeline, all 9 fetch functions |
| 1 | Signal cards | ✅ Complete | S1–S9 live with data, design tokens, hero, nav |
| 2 | Fleet tracker | ✅ Complete | S2 fleet endpoints, S/D ratio, CPI, trajectory |
| 3 | Revenue Engine v1 | ✅ Complete | computeRevenue(), /revenue endpoint, basic card |
| 4 | Investor review fixes | ✅ Complete | S5 RSS removed, design cleanup, bug fixes |
| 5A | Revenue Engine rebuild | ✅ Complete (c565ad5) | Full RevenueCard rebuild: comparison cards, neutral language, drivers, revenue table, drawer |
| 5A+ | EBITDA label fix | ✅ Complete | Fixed EBITDA/MW/yr to show true EBITDA (ebitda_y1/mw), not net_mw_yr |
| 5B | Sensitivity matrix | ✅ Complete | 3×2 IRR sensitivity grid (COD × CAPEX) with threshold coloring |
| 6 | Market pressure | ✅ Complete (via S2 enhancement) | CPI trajectory annotation on S2 bars + COD-window interpretation line |
| 6+ | S2 density cleanup | 🔨 In progress | Bug fixes (CPI 0.03 rendering) + visual density reduction |
| 7 | Data truth layer | 📋 Next | Intelligence pipeline, outreach system, confidence scoring |
| 8 | Data strengthening | 📋 Planned | ENTSO-E intraday, balancing cross-validation, VERT parser fix |
| 9 | Deal Flow upgrade | 📋 Planned | Premium intake form, structured submission |
| 10 | SEO / discoverability | 📋 Planned | SSR, JSON-LD, OG images, sitemap |

---

## Completed phases — detail

### Phase 0: Infrastructure (Feb 2026)
- Cloudflare Worker with 8+ fetch functions, cron every 4h
- KV namespace configured
- Wrangler deploy pipeline
- Mac cron for BTD, Nord Pool DA, VERT permits
- Telegram bot for intel intake
- GitHub repo (kastiskemezys-tech/kkme-website)
- ENTSO-E API key configured

### Phase 1: Signal cards (Feb 2026)
- All 9 signal cards (S1–S9) live with real data
- Design tokens, dark terminal aesthetic
- Hero + StickyNav + StatusStrip
- Three-tier card system (Tier 1/2/3 with distinct borders)
- Signal card anatomy established (hero → sub-metrics → viz → explain → source → footer)

### Phase 2: Fleet tracker (Feb–Mar 2026)
- processFleet() in worker
- /s2/fleet GET and POST endpoints
- /s2/fleet/entry for single-entry upsert
- /s2/btd for BTD clearing price upload
- S/D ratio computation (weighted supply / effective demand)
- CPI piecewise function (SCARCITY / COMPRESS / MATURE)
- 8-year trajectory projection
- Fleet list in S2Card drawer

### Phase 3: Revenue Engine v1 (Feb–Mar 2026)
- computeRevenue() in worker (~200 lines)
- 20-year cashflow model: capacity + activation + arbitrage - RTM fees - OPEX
- Project IRR, Equity IRR, Min DSCR, EBITDA, Net/MW/yr
- /revenue endpoint with query params (mw, mwh, capex, grant, cod)
- /api/model-inputs endpoint for agent API

### Phase 4: Investor review fixes (Mar 2026)
- S5 DC news feed removed (quality control failure)
- Design cleanup across cards
- Various bug fixes (S7 regime label, P90 overlap, etc.)
- Content rules established (neutral language, proxy flags, source citations)

### Phase 5A: Revenue Engine rebuild (Mar 11, 2026 — c565ad5)
- Full RevenueCard.tsx rewrite
- 2H vs 4H dual-fetch comparison cards
- Neutral status chips: "Above/Near/Below model hurdle"
- Revenue breakdown table (Capacity/Activation/Arbitrage/RTM/OPEX/EBITDA/Net)
- "Why it moved" delta line (client-side, 0.5pp threshold)
- Interpretation block (explains mechanism, not just verdict)
- Stacking disclosure (always visible)
- Impact line (positional language only)
- Details drawer (7 sections: model config, revenue detail, financing, asset life, revenue quality, data confidence, methodology)
- URL parameter persistence for duration/case/COD
- EBITDA label fix: displays true EBITDA/MW (ebitda_y1/mw), not net_mw_yr

### Phase 5B: Sensitivity matrix (Mar 11, 2026)
- 3×2 IRR sensitivity grid added to RevenueCard
- Rows: COD 2027/2028/2029, Columns: Base/High CAPEX
- Threshold coloring: >12% teal, 8-12% amber, <8% rose
- Selected scenario highlighted
- Summary line: identifies whether COD or CAPEX drives more IRR variance (2pp threshold)
- 6 parallel fetches, reuses cached active scenario

### Phase 6: Market pressure (Mar 11, 2026 — via S2 enhancement)
Audit determined a separate MarketPressureCard would duplicate S2. Instead:
- CPI values added to existing S2 trajectory bars (secondary annotation)
- COD-window interpretation line added below trajectory: bridges S2 → Revenue Engine
- "S/D TRAJECTORY · fleet projection" label added for data honesty
- No new component created. S2Card.tsx modified only.

---

## In progress

### Phase 6+: S2 density cleanup (Mar 11, 2026)
- Bug: CPI 0.03 on 2026 bar (should be ~0.93) — likely rendering issue
- Bug check: RevenueCard takeaway decimal formatting verification
- Visual: soften CPI labels to be secondary to S/D
- Visual: reduce lower-half clutter (market references, fleet list default depth, methodology verbosity)
- Preserve: S/D hero, trajectory bars, CPI visibility, COD-window line, drawer

---

## Next phases — planned

### Phase 7: Data truth layer
**Priority: HIGH — this is the most important thing after the current cleanup**

The intelligence pipeline design is complete (designed Mar 11, 2026). Components:

1. **Google Sheets working model** — 10-tab structure for tracking ~145 Baltic BESS projects
   - Projects_Master, Outreach_Tracker, Public_Sources, Contacts, Verification_Log, Stage_Changes, Website_Export, Field_Definitions, Source_Hierarchy, Confidence_Rules

2. **Manual outreach campaign** — contact all ~145 projects across LT/LV/EE
   - Priority A: >50MW, COD 2026-2028, Lithuania
   - Priority B: 10-50MW, COD 2028-2030, Latvia/Estonia
   - Priority C: <10MW, COD >2030, dormant
   - Batch pace: ~25-35 per batch, 2-3 weeks each

3. **Confidence system** — 5-level (confirmed/strong/medium/weak/unknown) per field dimension
   - Separate confidence for: identity, technical, stage, COD, operational, commercial
   - Source hierarchy: verified document > developer email > public registry > verbal > press > inferred

4. **Website export** — Sheets → JSON → /s2/fleet/entry bulk POST
   - Maps directly to fleet tracker format
   - Confidence scores feed site data-class labels (observed/proxy/derived)

### Phase 8: Data strengthening
Scraper and API enhancements to improve signal quality:

| Enhancement | Source | Impact | Effort |
|-------------|--------|--------|--------|
| ENTSO-E intraday prices (A62) | ENTSO-E API (existing key) | Replace arbitrage proxy with computed BESS capture | Medium |
| ENTSO-E balancing data | ENTSO-E API | Cross-validate BTD capacity prices | Medium |
| ENTSO-E installed storage (PSR B10) | ENTSO-E API | Cross-check fleet tracker operational MW | Low |
| VERT.lt parser fix | VERT.lt ArcGIS | Restore S4 permit counts | Low |
| ECB yield curve (5Y/10Y swap) | ECB SDMX API | Better financing cost input | Low |
| ENTSO-E VRE generation | ENTSO-E API | VRE penetration trends → demand growth | Low |
| GitHub Actions S2 fix | GitHub | Restore automated BTD workflow | Low |

### Phase 9: Deal Flow upgrade
- Replace placeholder form with structured intake
- Stronger visual presence
- Context-linked CTA (benchmark your project, stress-test a case)
- Not urgent but the weakest section on the page

### Phase 10: SEO / discoverability
- SSR signal pages (each signal gets own route)
- JSON-LD structured data
- Dynamic OG images for LinkedIn sharing
- sitemap.xml
- Meta description optimization
- Weekly market brief at /briefs/ (templated from signal deltas)

---

## Parked / deprioritized

| Item | Reason |
|------|--------|
| For Investors section | Good idea but wait until fleet data quality improves |
| Methodology section | Wait until Revenue Engine is stable for 2+ weeks |
| Alert signup placeholder | Wait until there's something to alert about |
| Mobile accordion (Tier 3) | UX improvement, not structural |
| Branded metric name | Marketing, not product |
| Individual fleet entry pages | Wait for Phase 7 data quality |
| aFRR/mFRR price history chart on S2 | No history data accumulated yet |
| Li carbonate feed | No free source available |
| 3-scenario architecture (conservative/base/upside) | Deferred — current base/high structure is sufficient |

---

## Revenue math audit results (2026-03-11)

Worker computeRevenue() is internally consistent. All 12 fields match manual reconstruction.

Key findings:
- No computation bugs
- Frontend had one label mismatch: "EBITDA/MW/yr" was displaying net_mw_yr (fixed)
- Live BTD prices differ from CLAUDE.md proxy defaults (aFRR €17.27 vs proxy €40)
- CPI at 2028 COD = 0.48 (from fleet trajectory S/D = 0.95) — primary driver of lower numbers
- Numbers are correct given current assumptions. Not a math bug, just market compression.

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-11 | Phase 6 implemented as S2 enhancement, not separate card | S2 already had trajectory bars. Separate card would duplicate. CPI + COD-window line is the missing bridge. |
| 2026-03-11 | StatusChip language: "Above/Near/Below" not "Passes/Fails/Clears" | Neutral positional language. The tool describes conditions, not makes judgments. |
| 2026-03-11 | "Why it moved" has 0.5pp threshold | Small deltas don't warrant explanation. Showing one implies false precision. |
| 2026-03-11 | Revenue math confirmed correct, not a bug | CPI compression and live BTD prices explain lower numbers vs historical outputs. |
| 2026-03-11 | Product principles saved to repo | FREE_TOOL_PRODUCT_PRINCIPLES.md, referenced as CLAUDE.md rule 11. |
| 2026-03-11 | Intel pipeline designed, not yet built | 13-section design document complete. Google Sheets implementation next. |

---

## Session workflow

| Task type | Tool |
|-----------|------|
| Code edits, bug fixes, deploys | Claude Code |
| New feature architecture, design decisions | Opus in claude.ai |
| Explain panel copy, narrative text | Opus in claude.ai |
| Quick component tweaks | Sonnet in claude.ai |

**Rule:** Design decisions in Opus first → hand implementation prompt to Claude Code. Never design in Claude Code.

**Deploy sequence:** `npx tsc --noEmit` → `npm run build` → `npx wrangler deploy` (worker, if changed) → `git add` → `git commit` → `git push`
