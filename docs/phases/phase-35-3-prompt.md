# Phase 35.3 — Calculator: full gate + brand/sales overhaul + "Path to Bankable"

**Branch:** `phase-35-3-calculator-polish` off latest main.
**Estimate:** ~1-1.5 days. **Risk class: MEDIUM — public-facing design work + auth-surface change. Build gate mandatory. ONE VISUAL CHECKPOINT: this phase STOPS for operator screenshot review before commit (not fully autonomous — the whole point is how it looks).**

## Operator verdict on v1 (2026-07-28)
1. "No password protection — anyone can access it" → the page must be FULLY gated until it's presentable. The public sample tier was premature.
2. "Pretty sad from a branding/marketing/sales perspective" → complete design + copy overhaul.
3. "I'd like to see the further steps to what would be bankable for Prosperus after the password" → the full tier gains a staged "Path to Bankable" section — the upsell roadmap as a pitch surface.

## Part 1 — Full-page gate (unauthenticated = zero engine output)

- Unauthenticated visitors see ONLY a branded gate screen. No input form, no sample compute, no engine data of any kind. (The `/calculate` sample tier stays in the worker but the UI stops calling it — `const SAMPLE_MODE_ENABLED = false` at the top of the page module, with a comment: flip to re-open the public sample funnel once the marketing polish is validated.)
- **The gate screen IS a marketing surface** — full-viewport, site design language, composed like the site's best sections:
  - KKME wordmark + "BESS Revenue Calculator" (display serif, hero scale)
  - One-paragraph positioning: *"Independent revenue & EBITDA projections for Baltic BESS projects — the same calibrated engine behind KKME Advisory's bankable project models. Day-ahead + intraday, FCR/aFRR/mFRR, saturation-adjusted, benchmarked against realised Baltic market data."*
  - **Credibility strip** (mono, quiet, 3-4 items): `Calibrated: BTD · NREL ATB · BNEF · Clean Horizon` / `Backtested vs 12 mo realised Baltic balancing` / `133-check reconciliation harness` / `Engine v7.3 · recalibrated quarterly`
  - Password input (existing login flow) + subdued submit
  - **"Request access →"** CTA: mailto kastytis@kkme.eu, prefilled subject "BESS Revenue Calculator — access request". One line under it: *"Access is provided to KKME Advisory clients and qualified counterparties."* (Scarcity framing — access is a service touchpoint, not a signup form.)
- Auth check on mount: valid token in localStorage → straight to the tool. Logout affordance (small, footer).

## Part 2 — Brand/sales overhaul of the authenticated tool

Current v1 is functional-but-flat. Lift it to the standard of the site's best surfaces (RevenueCard + the section compositions) and the deliverable mockup's editorial discipline:

- **Header block:** section-numbered editorial layout (the deliverable's `01 ·` pattern), title + engine stamp + as-of timestamp, one-line lede under each section head (the v5 mockup's italic lede pattern — one sentence telling the reader what the section says).
- **Input card:** compose as a proper card (site card anatomy), inputs with labels + units in mono, the Advanced expander styled as the site's drawer affordance. Compute button = the site's primary-action style, not a default button.
- **Results:** hero KPI row styled like the site's hero metrics (large mono numerals, labels above, deltas below) · bridge table with the deliverable's subtotal-glaze and total-rule treatment · 20-yr CF with the compressed-column layout + Y8/Y15 event highlighting · scenario cards with the top-border accent treatment (rust/amber/moss equivalent in site tokens) · sensitivity with top-3 emphasis.
- **Copy discipline throughout:** rule #6 (no editorial state labels), numbers-first, every section carries its source line. No lorem-ish filler; every sentence either informs or sells.
- **Mobile:** the 20-yr table scrolls horizontally in a contained track (Phase 18.1.3 pattern) — no document-level scroll (the horizontal-scroll bug class from this batch's own findings).

## Part 3 — "Path to Bankable" section (authenticated, after results)

The staged roadmap from this analysis to a lender-ready package — rendered as a section of the tool, drawing content from a new `app/calculator/bankablePath.ts` data module (single source; wording aligned with `tools/consultancy/deliverable-notes.json` where they overlap):

**Stage 1 — This analysis (delivered).** Y1 + 20-yr bridge, 3 scenarios, sensitivity, 44-assumption register, reconciliation vs public benchmarks. Chip: `INCLUDED`.

**Stage 2 — Institutional depth.** 8,760-hour chronological dispatch per project · SOH trajectory with augmentation/replacement restoration modelling · sensitivity tornado + correlation analysis · duration-calibration continuity. What it adds: *"the hourly dispatch proof and degradation-event modelling that bank credit committees ask for in fully-merchant structures."* Timeline: ~2 weeks. Chip: `COMMISSIONED PER ENGAGEMENT`.

**Stage 3 — Lender pack.** Designer-finished PDF + editable Excel model with scenario selector · reconciliation against the client's internal model (if shared) · assumptions workshop + sensitivity session with the client's team · quarterly recalibration against live Baltic market state. Chip: `ADVISORY SERVICE`.

Each stage: what's in it (4-6 bullets, mono) · what it means for bankability (one serif sentence) · timeline. NO prices on the page (pricing lives in conversation — the CTA is "Discuss scope →" mailto). Closing line under the section: *"Stages 2-3 are delivered per project against your technical documentation. Figures in this tool are computed at generation time against live Baltic market state."*

## Verification + THE VISUAL CHECKPOINT

1. tsc · vitest (gate: unauthenticated render contains zero engine-output DOM — extend the leak test to the gate screen; token flow; SAMPLE_MODE_ENABLED=false path) · lints · **build + serve click-through both states**.
2. **Playwright screenshots** (dark + light where meaningful): gate screen (desktop + 414px mobile) · authenticated tool with results (desktop full-page + mobile) · Path to Bankable section. Save to `docs/visual-audit/phase-35-3/`.
3. **STOP. Post the screenshots + a summary. Do NOT commit until the operator approves the visuals.** This is the one non-autonomous gate in the phase — the operator's complaint was visual/brand quality, so the operator judges it.
4. On approval: commit → push → origin-SHA check → hand operator the deploy note (worker unchanged this phase unless the sample-tier disable needs a worker touch — prefer UI-only; CF Pages ships on merge).

## Out of scope
- Re-enabling the public sample tier (operator flips SAMPLE_MODE_ENABLED when ready)
- Site-wide nav refactor (StickyNav stays home-page-only)
- Stage-2/3 feature building (this phase SELLS them; Phase 36+ builds them on commission)
- Worker changes (UI-only phase; the tiered API stays as-is underneath)
