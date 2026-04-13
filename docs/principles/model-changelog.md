# KKME Model Changelog

## v5.1 — 2026-03-28
- Phase 0 governance: variable dictionary, source registry, model risk register
- Phase 0 governance: product definitions, assumption registry, regime definitions
- Phase 0 governance: publication gates, asset capability profile, contradiction rules
- Fleet data restored: 13 curated entries replacing 135+ unverified sync entries
- S/D ratio corrected from ~1.01× to ~0.87× (demand updated to 1190 MW)
- Phase 1 honesty: DataClassBadge on all hero metrics
- Phase 1 honesty: proxy prices moved from hero to detail drawer
- Phase 1 honesty: IRR reframed as "scenario screen", revenue range as primary
- Phase 1 honesty: model risk register published on site
- Worker: raw source archiving, /health-detail endpoint, validation rules
- Worker: fleet quarantine logic, contradiction detection
- Worker: regime state engine, evidence freshness scoring
- Frontend: publication gate configuration (publicationGates.ts)
- Cron: morning review script

## v5 — 2026-03-27
- Chart.js migration for interactive charts (dispatch, spread, trajectory)
- Fleet sync from VPS scraper DB (135 entries added — later found problematic)
- Chart discipline pass (trust caveats, table headers, CSS tokens, range markers)
- S7/S9 threshold bars, GH Actions cleanup

## v4 — 2026-03 (earlier)
- Fleet tracker with S/D ratio
- Revenue Engine with scenario toggles
- Trading Engine dispatch model
- 9 signal cards live
- StickyNav with theme toggle

## v3 — 2026-02
- Signal console with live data
- Worker cron fetching from 8 sources
- Basic revenue model
- Shared primitives (SectionHeader, MetricTile, StatusChip, etc.)

## v2 — 2026-02
- First deploy to Cloudflare Pages
- ENTSO-E integration
- Worker routing structure

## v1 — 2026-02
- Signal console prototype
- Static design
- Domain setup (kkme.eu)
