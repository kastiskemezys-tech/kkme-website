# Phase 35.2 — /calculator page (BESS Revenue Calculator)

**Branch:** continue on `phase-35-batch-1`.
**Estimate:** ~1.5 days. **Risk class: MEDIUM-HIGH — new public-site route with new components. The ChunkLoadError precedent applies in full: `npm run build && npm run start` smoke-test is MANDATORY before the final commit (memory: Phase 18.1.1 shipped green-CI but broke prod).**

## Soft-launch rule
**No edits to ANY existing page or component file.** No nav links, no footer links, no homepage mention. The page exists only at its URL until the operator reviews and decides to link it. This bounds the blast radius to zero for existing surfaces. (Assert at wrap: `git diff main -- app/` touches only new files + the route directory.)

## Scope

### 1. Route `app/calculator/page.tsx` — "BESS Revenue Calculator"
Site design language (dark KKME, existing tokens, Newsreader + IBM Plex Mono — this is a kkme.eu page, NOT the birch consultancy-deliverable brand). Metadata: own title ("BESS Revenue Calculator — Baltic Storage Economics — KKME"), description, canonical per the 33.C pattern (inherits `./` — verify the built HTML emits `https://kkme.eu/calculator`).

**Layout (top to bottom):**
1. Header: title + one-line positioning ("Independent revenue & EBITDA projection for Baltic BESS projects — powered by KKME's calibrated engine") + engine version/calibration stamp.
2. **Input card:** MW · MWh · COD year · CAPEX €/kWh (4 fields, mono inputs, sensible defaults 50/100/2028/164) + "Advanced" expander (availability, cycles, warranty cap, Y1 operational months). Client-side validation mirrors the endpoint's. Compute button.
3. **Results — sample tier** (default): hero KPI row (the 5 headline numbers) + 8-line bridge table + a clearly-designed `SAMPLE` treatment (corner ribbon or watermark row — token-based styling, no new colors) + **CTA card**: "The full analysis adds: 20-year cash flow · 3 market scenarios · sensitivity ranking · reconciliation against public benchmarks · editable Excel model. Commissioned per-project by KKME Advisory." + contact (mailto kastytis@kkme.eu with prefilled subject carrying the inputs echo).
4. **Discreet login:** small "KKME" link in the results footer → password input → `POST /calculator/login` → token to localStorage → page re-renders full tier.
5. **Results — full tier:** everything `/calculate` full returns, rendered in site-design sections: exec KPIs + NPV/MOIC · bridge with expandable sub-line detail (formulas visible — the v5 progressive-disclosure pattern, rebuilt in site components) · 20-yr CF table (compressed columns like the deliverable) · scenario comparison (3 cards) · sensitivity table (top-3 + expandable) · reconciliation summary (ties + benchmark chips). Print-friendly enough that browser print-to-PDF produces a usable document (nice-to-have, not the gate).

### 2. State + fetch
Plain React state (NO localStorage for inputs — session-only; token in localStorage is the one exception). Loading states per the site's existing data-loading patterns. Errors render the endpoint's honest messages. 429 renders the rate-limit copy + CTA (a rate-limited visitor is a hot lead).

### 3. Design discipline
- Existing tokens only (`var(--*)`); rule #6 (no editorial state labels); card anatomy per CLAUDE.md; tabular numerals; drawer prose sparse (memory: data/math speak, no methodology teaching — link to /methodology instead).
- New components will exceed 100 lines → **the build gate is mandatory, not optional**: `npm run build && npx serve out` (output:export — no `next start`), all routes 200 including `/calculator`, sampled chunks 200, then click through both tiers against the LOCAL worker... if local worker isn't feasible, against production worker with the sample tier + a dummy-secret 503 check for login. Document what was actually tested.

### 4. Gates
tsc · vitest (component render tests: sample tier shows exactly its fields and no more — the leak test again at UI level; login flow states; input validation) · both lints · **build + serve smoke** · existing-routes-untouched assert · regression 54/54 (unchanged worker since 35.1's commit, still assert).

## Batch wrap
1. Final commit `phase 35.2: /calculator page — sample + full tiers, soft launch` → push → origin-SHA equality (report SHA).
2. NO deploy of anything by CC. Operator post-merge sequence (put this verbatim at the top of the handover):
   - `npx wrangler secret put CALC_SECRET` (choose the calculator password — NOT the admin secret)
   - `npx wrangler deploy` (ships 35.1 endpoints)
   - merge → CF Pages ships the page
   - visit kkme.eu/calculator → test sample flow → login → test full flow
3. Handover: batch summary, DECISIONS.md, what the local smoke actually covered, screenshots if playwright available (dark, sample tier + full tier), leak-test results, PR URL:
`https://github.com/kastiskemezys-tech/kkme-website/compare/main...phase-35-batch-1`

## Out of scope
- Nav/footer links (operator decides post-review)
- Excel generation in-browser (paid-service workflow — batch-3 34.6/34.7 parked prompts cover it locally)
- Saved project configs / multi-project portfolio UI (Phase 35.3 candidate)
- Any existing-page edit
