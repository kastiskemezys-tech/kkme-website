# Phase 3C + 3D — Intel Feed Rebuild: Hierarchy, Source Credibility, Impact Polish

Combined Phase 3C (visual hierarchy + source signaling) and Phase 3D (impact chips, timeline, filter UX). Bundled because both edit the same component (`app/components/IntelFeed.tsx`) and a single end-to-end pass produces a more coherent redesign than two sessions glued together.

Self-contained Claude Code prompt. Paste as first message of a fresh session in `~/kkme`. YOLO override applies (Kastytis is away). Expected duration: 2–3 hours.

Priority: **investor-first** (per bucket3-rebuild-plan.md section 8). The intel feed is the largest text surface on kkme.eu and currently reads as "a list of rectangles." After this phase it should read as "a curated intelligence desk."

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh` — worker + site healthy
2. Read `docs/handover.md` — current state (Phase 3A just merged)
3. Read `docs/phases/bucket3-rebuild-plan.md` sections 4B–4F (this scope)
4. `git status && git log --oneline -5` — clean tree, main up to date
5. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | python3 -m json.tool | head -300` — see what fields the worker actually returns. Some fields referenced in the plan (magnitude, impact direction) may or may not exist; design around what's present
6. `git checkout main && git pull origin main && git checkout -b phase-3cd-intel-feed-rebuild`

State scope understanding and the result of the `/feed` inspection (what fields exist, which magnitude-bearing fields are populated). Then proceed — YOLO, no pause wait.

## YOLO mode rules

- Skip the three formal pause points. Proceed straight through discovery → build → verification → commit → push.
- Still **stop and report** if you hit any of these: (a) the design decision materially diverges from the plan (e.g., no `impact_direction` field in worker output, forcing a different chip system); (b) typecheck or build breaks and the fix is non-obvious; (c) >3 files would need to change (scope should remain within IntelFeed.tsx + globals.css + maybe a new small util).
- Still run full verification before pushing.
- Do not run `gh pr create`. Stop at `git push` and report the compare URL.
- Still honor all hard rules below.

## Superpowers

- Use **brainstorming** skill for the "featured item selection algorithm" decision (recency × impact × source quality scoring). That's the one underspecified call in this brief.
- Use **verification-before-completion** before the final commit.
- Skip subagents, TDD, and the pause-points interaction — single-surface redesign.
- End-of-session note: "Superpowers: [helped/neutral/hindered] — [one line]". This is the second real evaluation per ADR-006.

---

## Scope — seven workstreams

### WS1 — Featured item treatment (Phase 3C.B)

**Goal:** The top item in the feed gets visibly different, larger treatment. Everything else stays in a standard row.

**Selection algorithm (algorithmic, per user answer Q4):**

```
featured_score = 0.5 * recency_score + 0.3 * impact_score + 0.2 * source_quality_score

recency_score = exp(-days_since_publish / 14)   // half-life 14 days
impact_score  = { positive/negative: 1.0, mixed: 0.7, watch: 0.5, neutral: 0.3 }[item.impact]
source_quality_score = { primary: 1.0, trade_press: 0.7, company: 0.5, uncurated: 0.2 }[sourceType(item)]
```

- Pinned items (`item.isPinned === true`) always win — they're manually curated.
- If no item scores above a floor (e.g., 0.4), don't featurize — just render all items standard.
- Compute in a `useMemo`; the top scorer is the featured item, rest render as standard.

**Visual treatment (featured):**
- ~2× the vertical height of a standard row
- Title in Unbounded (hero-metric font per ADR-005) or DM Mono 1.125rem bold — whichever tests better aesthetically; default to DM Mono at larger size to stay feed-coherent
- Summary excerpt (2–3 lines of `item.summary` or `item.whyItMatters`, whichever is longer) rendered in Cormorant (serif)
- Larger source attribution with favicon
- All the same chips (category, horizon, source-type, official badge)
- Separated from the standard list by a small "FEATURED" micro-heading above it (DM Mono, muted, uppercase, tracked)

**Visual treatment (standard):** Keep current `IntelRow` shape roughly, but tighten per WS3/WS5/WS6 below.

### WS2 — Source favicons (Phase 3C.C)

**Goal:** Every item (featured + standard) shows a favicon for its source, rendered as a small square left of the source name.

**Implementation per user answer Q3:** Option (b) — Google favicon service.

- URL: `https://www.google.com/s2/favicons?sz=32&domain={extracted_domain}`
- Helper: `extractDomain(sourceUrl: string | undefined): string | null` — returns domain or null
- Component: `<SourceFavicon domain={...} sourceName={...} />` — renders `<img>` with the favicon, fallback to a colored letter square (first letter of sourceName, monospace, muted background) if no sourceUrl or the image errors
- Size: 16×16 rendered, 32×32 fetched for retina
- Inline with source name: `[favicon] Litgrid · 3 days ago`
- Backlog item to file: "Consider pre-baking monochrome SVGs for top 20 sources to escape Google's favicon service (privacy + aesthetic)."

### WS3 — Source type chips + "Official" badge (Phase 3C.C)

**Goal:** A reader can tell in <1s whether an item is primary-source official or a secondary write-up.

**Source classification:**

```ts
function classifySource(sourceName: string, sourceUrl?: string): 'primary' | 'trade_press' | 'company' | 'uncurated' {
  const PRIMARY_DOMAINS = ['litgrid.eu', 'ast.lv', 'elering.ee', 'entsoe.eu', 'acer.europa.eu',
                           'ec.europa.eu', 'lrv.lt', 'vert.lt', 'nordpoolgroup.com'];
  const TRADE_PRESS = ['montel', 'argusmedia', 'spglobal', 'reuters', 'bloomberg', 'ft.com',
                       'energy-storage.news', 'pv-magazine', 'reneweconomy'];
  // + company press-release heuristics: sourceUrl contains /press/, /news/, /media/, or company's own domain
}
```

- `SourceTypeChip` component — small uppercase monospace chip, tinted by type (primary: teal, trade_press: muted, company: neutral, uncurated: warning-muted)
- `OfficialBadge` — tiny "OFFICIAL" pill on primary-source items only, sits next to the source name

### WS4 — Impact magnitude chips (Phase 3D.D)

**Goal:** Where the item has a quantifiable impact (MWh, €/MWh, MW, %), surface it as a chip.

**Approach:**
- If the worker already returns a magnitude field (check in Step 0's `/feed` inspection), use it.
- If not, add a client-side regex extraction from `whyItMatters` or `summary`:
  - Match patterns: `+?\d{1,4}(?:,\d{3})*\s?(MWh|MW|GWh|€/MWh|€/MW|%|bps|€M)` etc.
  - Also match negative numbers (`−`, `-`, `—` used inconsistently — normalize)
  - Extract the first numeric phrase and render as a chip
- If no magnitude found, no chip. Don't invent.
- Chip styling: DM Mono, sign-colored (green positive, warm-red negative, neutral for %), same visual weight as CategoryChip

Render order in the tag row: `[MagnitudeChip] [CategoryChip] · [HorizonChip] · [SourceTypeChip] [OfficialBadge]`

### WS5 — `whyItMatters` pull-quote treatment (Phase 3D.D)

**Goal:** `whyItMatters` should visually distinguish from the body summary — it's the editorial verdict, not descriptive text.

**Treatment:**
- Left vertical rule (2px, `var(--border-card)` or slightly darker)
- Cormorant Garamond (serif), italic, slightly larger than body (e.g., `var(--font-md)`)
- Padded left ~12px from the rule
- Color: `var(--text-primary)` (more prominent than the summary, not muted)
- Render below the title in featured items; render in expanded state only for standard items (keeps collapsed row tight)

### WS6 — Relative dates + temporal strip (Phase 3D.E)

**Relative dates:**
- New helper `formatRelativeDate(iso: string | null): string | null`
- <24h: "today" / "yesterday"
- <7 days: "N days ago"
- <30 days: "N weeks ago"
- <90 days: month + day ("28 Feb")
- ≥90 days: month + year ("Feb 2026")
- Replace `formatDate` call in `IntelRow` title row with this

**Timeline strip (stretch — implement if time permits after all other WS):**
- Thin horizontal bar above the feed showing item density by week for the last 12 weeks
- Each week is a small bar, height proportional to count
- Clicking a bar filters to that week (add `weekFilter` state alongside `activeFilter` and `countryFilter`)
- Purely visual — if the implementation is getting messy, skip it and log as backlog for Phase 3D-follow-up

### WS7 — Filter UX polish (Phase 3D.F)

- Filter chips always show counts: "Policy (3)", "Competition (4)", etc. Compute counts pre-filter so numbers reflect total available.
- Counts recalculate when country filter changes (e.g., selecting LT reduces each category's count to LT-only items)
- Active filters render above the feed as a removable chip row: `[× Policy] [× LT] Clear all`
- "Clear all" button when any filter active

---

## What NOT to do

- **No stock imagery.** Do not add generic storage/battery photos to items. Favicons only.
- **No emoji icons.** Stay within the three-font / color-only category system.
- **No infinite scroll.** Keep pagination/show-more as-is.
- **No new npm packages.** All work in existing stack. (Google favicon service is a remote URL, not a package — OK.)
- **No worker changes.** All transforms happen client-side. Log backlog items for worker-side enrichment improvements.
- **No redesign of `SEED_ITEMS`.** They're fine. Only the live `/feed` mapping and render path change.
- **No raw hex/rgba.** Use `var(--...)` tokens. If you need a new color (e.g., warning-muted for uncurated source chip), add a token to `globals.css` in both themes.
- **Don't break the Phase 3A defensive normalization.** The `normalizeFeedItem` rejector + `decodeHtmlEntities` stay. All new code operates on already-normalized items.

---

## Verification

### Build + typecheck
- `npx tsc --noEmit` — must be clean
- `npm run build` — must succeed
- Bundle size sanity: the intel feed route shouldn't balloon. Note the delta in the report.

### Visual verification (MCP screenshots if chrome-devtools tool is loaded)
Load all in:
- Dark 1440 — full intel feed section scrolled through
- Light 1440 — same
- Dark 1440 — featured item zoomed
- Dark 1440 — a standard item with magnitude chip zoomed
- Dark 1440 — filter chip row active, showing removable chips

If MCP isn't loaded, take plain puppeteer screenshots via `npx playwright` ad-hoc, or report that visual verification is deferred (same pattern as Phase 3A).

### Functional verification (browser)
- Featured item renders differently from standard
- Favicons load for all items with sourceUrl; letter-square fallback renders for items without
- Source type chips render correct class (test with at least one Litgrid item → OFFICIAL + primary chip)
- Magnitude chips appear on items where regex extraction succeeds, absent otherwise
- Relative dates show "today"/"N days ago" for recent, month+year for old
- Filter counts update on country toggle
- Clicking a category chip filters; the chip shows up in the active-filter row above; × removes it; "Clear all" clears everything

### Data verification
`curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | jq '.items[] | {title, source, impact: .impact_direction, magnitude: .magnitude, published_at}' | head -60` — sanity check the fields the code depends on

---

## Commit + PR

- Single commit: `phase3c-3d: intel feed rebuild — featured item, source credibility, magnitude chips, filter polish`
- Branch: `phase-3cd-intel-feed-rebuild`
- Push. Report the compare URL. Do NOT run `gh pr create`.

## End-of-session report (post-push)

Include in the report:
- Files changed + one-line change summary
- Featured-scoring algorithm final form (if you tuned the weights)
- Source classification coverage: of current `/feed` items, how many got classified primary vs trade_press vs company vs uncurated
- Magnitude-chip hit rate: of current `/feed` items, how many got a magnitude chip
- Timeline strip: implemented or deferred?
- Any new backlog items (expected: worker-side magnitude extraction, pre-baked monochrome source logos, timeline strip if deferred, any others)
- Proposed handover.md session log entry (don't commit handover yet — Kastytis does that after merge)
- Superpowers note

---

## Hard rules recap

- No worker changes
- No new npm packages
- No stock imagery
- No raw hex/rgba
- No rebuilding of seed items
- Drops-over-fallbacks philosophy (don't render a broken favicon — render the letter square)
- Don't push from Cowork (you're in Claude Code — fine)
- Don't run `gh pr create`
- Scope-lock: all changes in `app/components/IntelFeed.tsx`, `app/globals.css`, and at most one new small util file (e.g., `app/lib/sourceClassify.ts`)

---

## Reference

- Bucket 3 plan: `docs/phases/bucket3-rebuild-plan.md` (sections 4B–4F are this work)
- Phase 3A (just merged): `docs/phases/phase3a-prompt.md` — defensive normalization baseline to preserve
- Intel feed component: `app/components/IntelFeed.tsx` (~800 lines post-3A)
- Feed endpoint: https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed
- ADR-005 (design system): `docs/principles/decisions.md`
- Verification playbook: `docs/playbooks/verification.md`
- Tooling / Superpowers: `docs/playbooks/tooling.md`
