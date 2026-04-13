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

## ADR-006: Tooling evaluation 2026-04-13 — Superpowers adopted, GSD/UI UX Pro Max/Obsidian deferred

**Date:** 2026-04-13
**Decision:** After evaluating 5 recommended tools against KKME-specific needs, adopt Superpowers as the only net-positive addition. Reject GSD and UI UX Pro Max on workflow/design-conflict grounds. Defer Obsidian skill. Bookmark Awesome Claude Code as a reference directory. Establish a standing rule: every new tool requires an ADR entry before adoption.

**Context:** Solo operator with a growing project and limited bandwidth. During Phase 2A, KKME developed its own session-start, pause-point, and handover workflow. The question is whether recommended community tools add value on top of that workflow or create friction by duplicating or conflicting with it. Evaluated 5 tools from the Claude Code ecosystem against the test: "does this solve a specific problem existing tools don't solve?"

### Evaluation summary

**Superpowers (obra/superpowers) — ACCEPTED**

Problem it solves: Phase 2A exposed three failure modes in long Claude Code sessions — scope drift (agent starts adding unrequested features), verification gaps (agent claims "works" without testing), and context rot (agent forgets earlier decisions in a 90-minute session). Superpowers addresses all three with dedicated skills for brainstorming, planning, TDD, verification-before-completion, and subagent dispatch.

Why it fits KKME: Complements the existing pause-point pattern rather than replacing it. Superpowers handles intra-task discipline (within a single deliverable), while pause-points handle inter-deliverable gates (between workstreams in a session). No conflict.

Install: Global Claude Code plugin via `~/.claude/plugins/`. Official Anthropic marketplace as of January 2026. Install prompt at docs/phases/superpowers-install-prompt.md.

Provisional: If net-negative after 2 real sessions, uninstall and write a follow-up ADR.

**GSD (gsd-build/get-shit-done) — REJECTED**

Overlaps heavily with KKME's own session-start + pause-points + handover pattern built during Phase 2A. GSD provides its own session-start hook, planning system, and progress tracking. Installing it would create two conflicting session-start hooks and two competing planning systems. The friction of reconciling them outweighs any marginal benefit from GSD's features.

Re-evaluate: 2026-10-13, or sooner if workflow gaps emerge that the current pattern doesn't cover.

**UI UX Pro Max (nextlevelbuilder/ui-ux-pro-max-skill) — REJECTED**

Would fight KKME's established design system documented in ADR-005: three-font rule (DM Mono / Unbounded / Cormorant Garamond), CSS variable-driven theming, halftone Baltic map identity. UI UX Pro Max is built for projects without existing design opinions — it imposes its own styles, spacing system, and component patterns.

The Anthropic frontend-design skill already available in Claude Code /mnt/skills/public/ is a better fit because it defers to existing design rather than overriding it.

Re-evaluate: If KKME's design opinions change fundamentally, or for greenfield side projects that lack a design system.

**Obsidian Claude skill — DEFERRED**

The repo's docs/ folder already serves as the KKME knowledge base: handover, playbooks, decision log, investigation reports, phase prompts. A separate Obsidian vault would split the knowledge surface across two locations without clear benefit.

Re-evaluate: Only if a separate personal or strategic notes vault emerges outside the KKME repo.

**Awesome Claude Code (hesreallyhim/awesome-claude-code) — NOT INSTALLED**

This is a GitHub directory of community resources, not an installable tool or plugin. Useful as a reference when searching for a specific skill. Bookmark at https://github.com/hesreallyhim/awesome-claude-code — no installation needed, no ADR needed beyond this note.

### Principle established

Every new tool requires an ADR entry BEFORE adoption. This prevents the 28-config-dirs tool sprawl cleaned up during the Phase 1 audit. The test for adoption is "does this solve a specific problem existing tools don't solve" — not "is it popular" or "is it recommended."

Rejected tools get a 6-month re-evaluation date. If an adopted tool proves net-negative after 2 real sessions, uninstall and write a follow-up ADR documenting why.

### Alternatives considered

The alternative to formal evaluation is ad-hoc tool adoption — install things as they're recommended, configure around conflicts. Phase 1 audit showed where that leads (28 config directories, overlapping tools, unclear which tool does what). The lightweight ADR-per-tool approach adds ~10 minutes of overhead per evaluation but prevents accumulating technical debt in the tooling layer.

### Trade-offs

May miss value from tools dismissed without a full trial period. Mitigated by the 6-month re-evaluation rule built into each rejection. Superpowers adoption is explicitly provisional — if net-negative after 2 real sessions, it gets uninstalled with its own ADR. The cost of a false rejection (missed productivity) is lower than the cost of a false adoption (workflow friction, config conflicts, context overhead in every session).
