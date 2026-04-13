# Architectural Decision Log

Decisions that keep getting relitigated. Record them here so we don't revisit.

## ADR-001: Static export, not SSR

**Date:** 2025 (original project setup)
**Decision:** Use `output: 'export'` in next.config.ts. Deploy as static HTML/JS/CSS to Cloudflare Pages.
**Context:** Single-page app with client-side data fetching from worker API. No user accounts, no dynamic server routes, no auth. All data comes from the worker via useSignal hook.
**Alternatives considered:** SSR via Cloudflare Pages Functions, Vercel hosting.
**Trade-offs:** Loses server-side rendering (bad for SEO, no crawlable signal data). Gains simplicity — no server runtime, no cold starts, $0 hosting, trivial deployment (git push to main). SSR is planned as a future phase for SEO/citation purposes but is not blocking any current need.

## ADR-002: Cloudflare KV, not D1

**Date:** 2025
**Decision:** Store all signal data in Cloudflare Workers KV (key-value), not D1 (SQLite).
**Context:** Signal data is written by cron (every 4h) and read by frontend (on every page load). Access pattern is simple key lookup, not relational queries. Data volume is small (~50 keys, each <100KB JSON).
**Alternatives considered:** D1, Durable Objects, external PostgreSQL (VPS already has one).
**Trade-offs:** KV is fast at reads, eventually consistent on writes (fine for 4h cadence), no schema migration hassle. Loses queryability — can't do ad-hoc SQL across signals. VPS PostgreSQL handles the relational/historical query needs.

## ADR-003: Monolith worker (single fetch-s1.js)

**Date:** 2025 (grew organically)
**Decision:** Single worker file handles all endpoints (~7740 lines). Not split into modules or separate workers.
**Context:** Cloudflare Workers have a 1MB compressed size limit but no practical line count limit. All endpoints share the same KV binding and env secrets. Splitting would require multiple workers with separate wrangler configs or a service binding architecture.
**Alternatives considered:** Multiple workers per signal, Workers for Platforms, module splitting.
**Trade-offs:** Monolith is simpler to deploy (one `wrangler deploy`), share state (one KV binding), and debug (one log stream). But it's hard to navigate (grep-only), risks hitting size limits as it grows, and makes per-endpoint testing harder. The `workers/lib/` helpers are a partial mitigation. Full modular split is a future option but not urgent.

## ADR-004: Chart.js + D3 (not just one)

**Date:** 2025–2026
**Decision:** Use Chart.js for structured charts (line, bar, DSCR) in RevenueCard/TradingEngineCard. Use D3 for custom/geo visualizations (BalticMap, sparklines, any SVG-based work).
**Context:** Chart.js is faster to build standard financial charts with. D3 gives full SVG control for maps and custom viz. Neither alone covers both needs well.
**Trade-offs:** Two charting libraries in the bundle. Acceptable because they serve different purposes and the total bundle is still under performance budgets. All chart colors go through `app/lib/chartTheme.ts` regardless of library.

## ADR-005: Three typefaces (DM Mono, Unbounded, Cormorant Garamond)

**Date:** 2025
**Decision:** Three-font system loaded via next/font/google. DM Mono = data, labels, UI, everything structural. Unbounded = hero numbers and section headings only. Cormorant Garamond = narrative paragraphs (interpretation lines, about section, investor copy).
**Context:** The site serves two reading modes — scanning (numbers, status, KPIs) and reading (interpretation, thesis, CTA). Mono for scanning, serif for reading. Display font for hierarchy.
**Alternatives considered:** Single-font approach (too flat), two fonts (couldn't distinguish data from narrative from hierarchy).
**Trade-offs:** Three font loads add ~150KB. Acceptable for the distinct visual hierarchy they create. Each font has a strict usage rule — violating these rules is a design bug.
