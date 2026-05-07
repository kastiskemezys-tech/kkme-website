# Phase 7.7g-a-3 — Typography rationalization + spacing residuals + per-side CI extension

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~1–2 days, single PR (or split if Pause A scope review warrants), three pause points (Pause A discovery + scope confirmation, Pause B foundation gates + local-build smoke-test, Pause C visual + commits). Frontend-only, no worker deploy.

**Operator framing:** operator hard-refresh feedback after the Phase 18.x cluster — *"lots of small issues with the fonts, some still old some new, very all over the place too."* That feedback has been deferred since the chart-UX cluster started; addressing it closes the typography polish gap and produces the broadest visual quality lift.

This phase combines four threads from earlier roadmap entries:
1. **9-step modular type scale** (spec CC-1) — current `globals.css` has 6 type tokens; spec wants 9 with explicit display + body + label + mono separation
2. **Restrict Unbounded → wordmark only** (spec P3-1) — currently `--font-display` (Unbounded) used in 17 files; should be 1 (the KKME masthead wordmark)
3. **Spacing residuals** — Phase 7.7g-a-2 shipped the canonical 8-value `--space-*` scale + value-aware CI gate, but missed: shorthand-expansion sites (`padding: '4px 8px'` style; ~131 occurrences in 34 files), off-scale residuals (6/10/14/18 px), 16 sites in intel/regulatory/layout.tsx not in 7.7g-a-2's component sweep
4. **Per-side CI gate extension** — current `lint:no-raw-spacing` only matches shorthand `padding`/`margin`/`gap`; doesn't cover `paddingLeft`/`paddingTop`/`marginInline`/etc.

**Spec references** (`docs/specs/2026-05-06-designer-developer-spec.md`):
- **CC-1** — full 9-step type scale + 4-step neutral text scale + 4-step motion scale + spacing token scale
- **P3-1** — Unbounded → wordmark only; subset Plex + Newsreader; preload pair

---

## What ships

7 sub-items, single PR (or split per Pause A judgment).

**(a) 9-step modular type scale** (~30-45 min) — extend `globals.css` `:root` to add the spec's 9-step type scale per CC-1:
```css
--type-display-2xl: 64 / 72 line height (hero number)
--type-display-xl:  48 / 56 (section H1)
--type-display-lg:  32 / 40 (card hero number)
--type-display-md:  24 / 32 (card subtitle number)
--type-body-lg:     16 / 24 (body)
--type-body-md:     14 / 20 (dense card body)
--type-body-sm:     12 / 18 (meta, tickers)
--type-label:       11 / 14 uppercase tracking +0.06em (KPI labels)
--type-mono-xs:     10 / 14 (provenance only)
```
Map existing 6 tokens (`--font-xs`/`--font-sm`/`--font-base`/`--font-lg`/`--font-xl`/`--font-2xl`) to the new scale OR keep both temporarily during migration. Decide at Pause A.

Acceptance per spec CC-1: `getComputedStyle()` shows ≤9 distinct font-sizes rendered on the homepage.

**(b) Drop ad-hoc font sizes** (~20-30 min) — Cowork-grepped 3 production sites with off-scale fontSize values (likely 13/13.5 from Phase 18.2.2 tooltip tightening era — `BalticStorageIndexCard.tsx`, `ChartTooltip.tsx`, others). Migrate each to the new 9-step scale OR document deliberate exception in Pause A. Spec CC-1 wants drop of 8/8.8/9/9.6/13/15/15.2/17/17.6/28/40 px values from rendered output.

**(c) Restrict Unbounded → wordmark only** (~1-2h) — Cowork-grep found 17 files use `--font-display` (currently bound to Unbounded). Per spec P3-1, only the KKME masthead wordmark should use Unbounded; all other `--font-display` consumers migrate to `--font-serif` (Newsreader, editorial) or `--font-mono` (Plex Mono, data/labels) per per-site judgment.

Approach options at Pause A:
- (i) Keep `--font-display` token bound to Unbounded, audit 17 consumers per-site, decide each migrates to `--font-serif` or `--font-mono`
- (ii) Rebind `--font-display` to system fallback (or Newsreader), allow consumers to keep using token; introduce `--font-wordmark` for the masthead
- (iii) Hybrid — keep `--font-display` for masthead, force-migrate all current consumers explicitly

Recommend (iii) for clean intent expression. Operator-pick at Pause A.

**(d) Subset + preload Plex + Newsreader** (~30 min) — per spec P3-1, network panel should show ≤4 font files; total font weight <120 KB; Plex 400/500 + Newsreader 400 only. Drop Unbounded weights other than the one needed for wordmark (probably 600 or 700). Use `font-display: swap`.

Currently fonts are loaded via `@fontsource` imports + Next 15 next/font Cormorant→Newsreader / DM_Mono→IBM_Plex_Mono. Audit at Pause A which weights are imported and trim.

**(e) Spacing shorthand-expansion residuals** (~3-4h) — Cowork-grep found ~131 occurrences across 34 files of `padding: '4px 8px'` style 2-value shorthand patterns. Phase 7.7g-a-2's `lint:no-raw-spacing` was conservative (single-value shorthand only). Migrate each to per-side `var(--space-*)` OR keep shorthand but with the values being valid scale entries (`var(--space-2xs) var(--space-xs)`).

Recommend: migrate to explicit per-side properties (`paddingTop: var(--space-2xs); paddingRight: var(--space-xs); ...`) for consistency with the per-side CI gate extension in (g).

**(f) Off-scale spacing + missed top-level pages** (~1-2h) — Phase 7.7g-a-2 deferred:
- Sites using non-canonical px values (6/10/14/18 px) that don't map to the 8-value scale — snap to nearest scale value OR add justified design exception with comment
- 16 raw-px sites in `intel/regulatory/layout.tsx` not in 7.7g-a-2's component sweep

Address both at Pause A grep, decide per-site at Pause B implementation.

**(g) Per-side CI gate extension** (~30 min) — extend `lint:no-raw-spacing` regex to cover `paddingLeft`/`paddingTop`/`paddingRight`/`paddingBottom`/`marginLeft`/`marginTop`/`marginRight`/`marginBottom`/`marginInline`/`marginBlock`/`paddingInline`/`paddingBlock`. Currently only matches shorthand `padding`/`margin`/`gap`. After (e) lands, the gate enforces this dimension going forward.

`model_version` does NOT bump. No worker, no engine, no test logic changes. Possibly +1-3 specs if new font-loading helper or type-scale-assertion test added.

---

## OUT of scope

- Engine / worker changes
- Card layout restructuring (Tier 2 territory)
- Component primitives (Phase 7.7g-b)
- `rgba`/hex regression cleanup (Phase 7.7g-c)
- New CSS variables beyond the 9-step type scale + per-side spacing
- Color token reconciliation (Phase 18.2.1 — Baltic palette retune is separate)
- Animation activation (Phase 18.3)
- A11y additions (Phase 19)
- Roadmap edits (operator/Cowork-owned per discipline rule #5)
- Mobile breakpoint rationalization (separate concern, deferred per Phase 18.1 scope notes)

---

## Read first

1. `CLAUDE.md` — discipline rules (load-bearing this phase: #1 audit-triage, #4 cross-card consistency, #5 roadmap edit-conflict, #6 no-editorial-state-label)
2. `docs/handover.md` Sessions 43 (Phase 7.7g-a-2) + 44+ for typography context
3. **`docs/specs/2026-05-06-designer-developer-spec.md`** [LOAD-BEARING] — section CC-1 (full 9-step type scale + 4-step text scale + 4-step motion scale) + section P3-1 (Unbounded → wordmark; Plex + Newsreader subset; preload pair)
4. `docs/phases/_post-12-8-roadmap.md` Phase 7.7g-a-3 entry — roadmap source-of-truth for scope
5. `app/globals.css:219-225` — current 6-token type scale (--font-xs through --font-2xl)
6. `app/globals.css:227-232` — canonical 8-value `--space-*` scale (Phase 7.7g-a-2)
7. `app/layout.tsx` — current font-loading pattern (next/font + @fontsource)
8. `package.json` lint:no-raw-spacing — current CI regex (Phase 7.7g-a-2 baseline)
9. `app/components/HeroBalticMap.tsx` — Phase 18 broadsheet masthead (the wordmark site that should retain Unbounded)
10. Spec acceptance criteria: `getComputedStyle()` ≤9 distinct font-sizes; ≤4 distinct text alpha colors; ≤4 font files; total font weight <120 KB; Newsreader + Plex are >99% of nodes

Memory references (Cowork-side):
- **`reference_designer_dev_spec.md`** [LOAD-BEARING] — points at the saved spec
- **`feedback_local_build_verification.md`** [LOAD-BEARING] — Pause B local-build smoke-test gate REQUIRED for any phase touching font-loading + bundle composition + chunk emission; Phase 18.1.1 ChunkLoadError lesson
- `feedback_tailwind_v4_silent_drop.md` — hoist new @media rules into fresh blocks
- `feedback_pr_workflow_minimal.md` — operator opens PR + clicks merge

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -10
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-21.2-merge commit. State understanding (one paragraph): which sub-items you'll tackle in what order, expected blast radius, font-loading risk class. Wait for "proceed".

### Cowork-grepped baseline (verify at Pause A per discipline rule #1)

| Concern | Location | Current state |
|---|---|---|
| Type scale tokens | `globals.css:219-224` | 6 tokens (--font-xs/sm/base/lg/xl/2xl); spec wants 9 |
| Unbounded consumers | 17 files | `--font-display` consumed widely; spec wants wordmark-only (1 site) |
| Off-scale fontSize inline | 3 files (BalticStorageIndexCard, ChartTooltip, ColorTuner) | values like 13 from Phase 18.2.2 tooltip era |
| Shorthand spacing patterns | ~131 occurrences in 34 files | `padding: '4px 8px'` style not caught by 7.7g-a-2 regex |
| Spacing scale tokens | `globals.css:227-232` | 8-value canonical scale shipped Phase 7.7g-a-2 |
| Off-scale px values | TBD at Pause A | 6/10/14/18 px residuals; 16 in intel/regulatory/layout.tsx |
| `lint:no-raw-spacing` regex | `package.json` | shorthand only; needs per-side extension |

---

## 1. Branch + baseline

```bash
git checkout -b phase-7-7g-a-3-typography-rationalization
npx tsc --noEmit       # 0 errors
npx vitest run          # 925/925 baseline (post-21.2)
npm run lint            # 127 baseline
npm run lint:no-raw-spacing  # exit 0
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes
```

Capture exact numbers. Run `npm run build` once to capture bundle size baseline (chunks dir total + index.html chunk references) for delta comparison at Pause B.

---

## 2. Pause A — Discovery + scope confirmation

Per discipline rule #1, re-verify each Cowork-grepped baseline claim before scoping fixes. This phase has the largest scope of any in the recent chain — split-into-multiple-PRs decision happens here.

### 2a. Type scale audit (sub-item a + b)

```bash
grep -nE "fontSize:\s*['\"]?[0-9]" app/components/ app/lib/ | grep -v __tests__ | wc -l
grep -nE "fontSize:\s*['\"]?[0-9]" app/components/ app/lib/ | grep -v __tests__ > /tmp/fontsize-sites.txt
cat /tmp/fontsize-sites.txt | head -40
```

Extract distinct values. Compare to current 6-token scale + spec's 9-step scale. Identify:
- Off-scale residuals (likely 13, 13.5, 9.5, 17, etc.)
- Sites using inline numeric vs `var(--font-*)` token
- Strategy: rename existing 6 tokens to fit new 9-step OR add 3 new tokens (display-2xl/display-xl/display-md or whatever fills the gap)

Recommend: extend (add new tokens) for lower migration cost; rename only if existing values don't align with new scale.

### 2b. Unbounded consumer audit (sub-item c)

```bash
grep -rnE "var\(--font-display\)|fontFamily.*Unbounded|font-family.*Unbounded" app/ --include='*.tsx' --include='*.css'
```

Read the 17 sites end-to-end. Categorize each:
- KKME wordmark (1 site) → KEEP Unbounded
- Editorial display heading → MIGRATE to `--font-serif` (Newsreader)
- Data/numeric label → MIGRATE to `--font-mono` (Plex Mono)
- Already wrong (e.g., body text on Unbounded) → MIGRATE to appropriate token

Propose pick (i)/(ii)/(iii) approach. Recommend (iii) — keep `--font-display` for wordmark, force-migrate other consumers.

### 2c. Font subsetting audit (sub-item d)

```bash
grep -rnE "@fontsource|next/font|fontFamily|font-display" app/layout.tsx app/globals.css
```

Identify current font weights loaded for each family:
- Plex Mono: which weights?
- Newsreader: which weights?
- Unbounded: which weights?

Spec target: Plex 400/500 + Newsreader 400 + 1 Unbounded weight = 4 fonts total. Drop everything else.

Verify with `npm run build` post-fix: network panel / bundle should show 4 font files; sum <120 KB.

### 2d. Spacing shorthand-expansion audit (sub-item e)

```bash
grep -rnE "padding:\s*['\"]?[0-9]+(\.[0-9]+)?p?x?\s+[0-9]" app/components/ app/lib/ | grep -v __tests__ | wc -l
grep -rnE "margin:\s*['\"]?[0-9]+(\.[0-9]+)?p?x?\s+[0-9]" app/components/ app/lib/ | grep -v __tests__ | wc -l
```

Confirm Cowork's ~131 count. Sample 10 sites — verify the values are 8-value-scale-compatible (e.g., `'4px 8px'` is fine since both are scale values; `'6px 10px'` is off-scale and needs decision).

Strategy options:
- (1) Migrate all to per-side properties (`paddingTop: var(--space-2xs); paddingRight: var(--space-xs); ...`) — verbose but scale-clean
- (2) Migrate to shorthand with var() values (`padding: 'var(--space-2xs) var(--space-xs)'`) — terser but harder to lint
- (3) Drop the shorthand entirely; use Tailwind utility classes — biggest scope change

Recommend (1) for CI clarity. Operator-pick at Pause A.

### 2e. Off-scale + missed-pages audit (sub-item f)

```bash
grep -rnE "padding(Left|Right|Top|Bottom|Inline|Block)?:\s*['\"]?[0-9]" app/intel app/regulatory app/layout.tsx app/page.tsx app/methodology/ | grep -v __tests__
grep -rnE "(padding|margin):\s*['\"]?(6|10|14|18)px" app/components/ | head -20
```

List all hits. Per-site decisions: snap to scale OR add justified comment.

### 2f. Per-side CI gate audit (sub-item g)

```bash
cat package.json | grep -A1 lint:no-raw-spacing
cat scripts/lint-no-raw-spacing.sh 2>/dev/null
```

Read current regex. Design extension to cover all per-side variants. Test new regex against post-fix codebase.

### 2g. Split-vs-monolithic decision

Sub-items grouped by surface:
- **Group X — Typography:** (a) + (b) + (c) + (d) — type scale + Unbounded migration + font subsetting (~3-4h)
- **Group Y — Spacing:** (e) + (f) + (g) — shorthand expansion + off-scale + per-side CI (~5-7h)

Two paths:
- **Path A (single PR):** ship X + Y together; one merge, one verification cycle
- **Path B (two PRs):** 7.7g-a-3a (typography) + 7.7g-a-3b (spacing); cleaner per-PR verification

Recommend at Pause A based on: Path A if bundle delta is small + visual changes are minimal + CC has uninterrupted attention budget; Path B if either side has surprising risk surface.

### Pause A report

Halt + report:

1. **Per-baseline verification** — VERIFIED / REFINED / NOT REPRODUCIBLE per Cowork table
2. **Type scale strategy** — extend existing 6 tokens OR rename to fit 9-step + migration shape
3. **Unbounded migration shape** — pick (i)/(ii)/(iii); list per-site target tokens (`--font-serif` vs `--font-mono`) for the 17 consumers
4. **Font subsetting plan** — current weights → target weights → bundle size delta estimate
5. **Spacing shorthand strategy** — pick (1)/(2)/(3); estimated touched-files count
6. **Off-scale + missed-page list** — per-site decisions
7. **CI gate regex** — proposed extension; test against current codebase pre-fix
8. **Split-vs-monolithic** — Path A or Path B recommendation; rationale
9. **Refined estimate** vs prompt's ~1-2 days
10. **Local-build risk pre-check** — font subsetting changes touch network bundle directly; same risk class as Phase 18.1.1; Pause B verification gate REQUIRED

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Implement fixes

Per Pause A approval, apply fixes. Suggested order (lowest-risk → highest-risk per Phase 18.1.1 lesson):

1. **(g) CI gate regex extension** — package.json/script change only; no source diff; runs clean against pre-fix code (some violations expected — those become migration targets)
2. **(a) Type scale tokens** — `globals.css` `:root` additions; non-breaking; existing tokens stay
3. **(d) Font subsetting** — `app/layout.tsx` `next/font` + `@fontsource` import trim; bundle delta visible at build
4. **(b) Off-scale fontSize migration** — 3 sites; assign to new scale tokens
5. **(c) Unbounded migration** — 16 sites (excl wordmark); per-site `--font-display` → `--font-serif` or `--font-mono`
6. **(f) Off-scale + missed-pages** — small per-site fixes
7. **(e) Shorthand spacing migration** — biggest chunk; use scriptable approach (Python regex) similar to Phase 7.7g-a-2's pattern

For each:
- Read file end-to-end first (don't grep+sed)
- Verify no visual regression at desktop ≥900px (most Phase-18 cards heavy on Unbounded for hero numbers)
- For (c) Unbounded migration: verify each migration site visually post-edit; the cards' typographic identity changes meaningfully

---

## 4. Pause B — Foundation gates + LOCAL PRODUCTION BUILD

### 4a. Run all gates

```bash
npx tsc --noEmit       # 0 errors
npx vitest run          # 925 + N if specs added
npm run lint            # 127 baseline (or +/- per impact)
npm run lint:no-raw-spacing  # exit 0 (with extended per-side regex)
npm run lint:no-editorial-chips  # exit 0
npm run build           # 7 routes; capture chunk count + bundle sizes
```

### 4b. **REQUIRED: Local production build smoke-test** (per `feedback_local_build_verification.md`)

This phase touches font-loading, bundle composition, and chunk emission. Phase 18.1.1's ChunkLoadError lesson is fresh.

```bash
npm run build && npx serve@latest out -l 3100
```

Verify (curl-based, since chrome MCP recurring lock):
- Home page returns HTTP 200
- All JS chunks referenced in HTML return HTTP 200 (no 18.1.1-class ChunkLoadError)
- Font files served correctly (`/_next/static/media/*.woff2`)
- **Bundle size delta** — fonts directory should drop measurably (target: ≤4 font files, sum <120 KB per spec)

Specifically for font subsetting:
```bash
ls -la out/_next/static/media/*.woff2 2>/dev/null || ls -la out/_next/static/media/*.{woff,woff2,otf,ttf}
# Count files; sum sizes
```

Compare to pre-fix baseline (capture during §1).

### 4c. Visual verification (curl-only OR chrome MCP)

If chrome MCP available:
- Open localhost:3100 at 360px AND 1440px
- Hero (HeroBalticMap masthead): Unbounded retained on KKME wordmark — confirm visually
- Cards (RevenueCard, S2Card, BalticStorageIndexCard): hero numbers in Newsreader (was Unbounded for some) — confirm visual identity preserved
- Typography sample of body text: should render with Plex Mono or Newsreader per spec
- Light + Dark theme switching unchanged

If chrome MCP locked: prose state-description doc at `docs/visual-audit/phase-7-7g-a-3/STATE.md` describing rendered typography per surface; reference comparable Phase 18 screenshots for pre-fix baseline.

### 4d. Cross-card consistency check (rule #4)

```bash
grep -rnE "var\(--font-display\)|fontFamily.*Unbounded" app/ --include='*.tsx'
# Expected post-fix: 1 hit (HeroBalticMap masthead wordmark)
```

If >1 hit: list and decide per-site.

```bash
grep -rnE "fontSize:\s*['\"]?[0-9]" app/components/ app/lib/ | grep -v __tests__ | wc -l
# Expected: significantly reduced from baseline
```

### Pause B halt + report

- Per-sub-item status: SHIPPED / DEFERRED-with-reason
- Bundle size delta (fonts dir, JS chunks total)
- Local-build smoke-test: PASS / FAIL
- Cross-card consistency: post-fix Unbounded site count = 1
- Visual audit status (chrome MCP vs prose state doc)
- New CI gate (`lint:no-raw-spacing` extended) exit code

Wait for explicit operator "proceed" before §5.

---

## 5. Pause C — Visual + commits

### 5a. Final visual audit

Capture screenshots at `docs/visual-audit/phase-7-7g-a-3/` if chrome MCP available; OR prose state doc per Phase 21.2 precedent.

### 5b. Commits + push

Suggested commit structure (adjust per Pause A path A vs B decision):

If Path A (single PR):

```bash
git add app/globals.css
git commit -m "phase-7-7g-a-3(tokens): 9-step modular type scale per spec CC-1; 6 → 9 tokens"

git add app/layout.tsx package.json
git commit -m "phase-7-7g-a-3(fonts): subset Plex 400/500 + Newsreader 400 + Unbounded 1-weight per spec P3-1"

git add app/components/ app/lib/
git commit -m "phase-7-7g-a-3(migration): Unbounded → wordmark only (16 sites migrated to --font-serif/--font-mono); off-scale fontSize → scale tokens (3 sites); shorthand spacing → per-side var(--space-*) (~131 sites)"

git add scripts/ package.json
git commit -m "phase-7-7g-a-3(ci): lint:no-raw-spacing extended to per-side variants (paddingLeft/marginInline/etc.)"

git add docs/handover.md docs/visual-audit/phase-7-7g-a-3/
git commit -m "phase-7-7g-a-3(handover): Session 52 + visual audit captures"

git push -u origin phase-7-7g-a-3-typography-rationalization
```

If Path B (two PRs): split typography commits into one branch, spacing commits into another. Ship typography first; address spacing in 7.7g-a-3b after operator confirms typography landed cleanly.

Print PR creation URL.

---

## 6. Handover Session 52

Mirror Session 51 structure. Specific items:
- Headline: typography rationalization; 9-step modular scale + Unbounded → wordmark only + Plex/Newsreader subsetting + spacing residuals + per-side CI extension
- Branch + base
- Pause A audit results (per-claim VERIFIED / REFINED / NOT REPRODUCIBLE per Cowork baseline)
- Pause B verification gates (paste actual numbers + bundle size delta)
- Per-sub-item description + count of touched sites
- Bundle size delta summary
- Visual audit status
- Out of scope reminder
- Tier 1 sequence: 7.7g-a-3 ✅ → next CC pick across (18.3 / 19 / 12.12 #1+#2 / 7.7g-b reduced / 18.2.4 / 18.2.5 / 18.2.1 / 20 / 18.1.1.1 / 21.1 / 18.1.2 / chrome MCP investigation)
- Next operator action: open PR; merge; hard-refresh kkme.eu mobile + desktop dark + light; verify hero wordmark in Unbounded; verify hero numbers in Newsreader; verify body text in Plex Mono; verify no font sprawl

---

## 7. Roadmap delta needed (operator-side after merge)

CC does NOT commit roadmap (discipline rule #5). Report needed deltas in handover. Expected:

- Phase 7.7g-a-3 → Shipped appendix
- Currently-active update: 7.7g-a-3 SHIPPED; next CC across remaining Tier 1 queue
- If Phase 7.7g-a-3 split into 7.7g-a-3a + 7.7g-a-3b: shipped 3a; 3b queued

Operator applies via Cowork.

---

## 8. Notes on judgment calls

- **Discipline rule #1 above all else.** Cowork-grepped baseline is starting point; verify each at Pause A. Spec acceptance criteria (≤9 font-sizes, ≤4 alphas, ≤4 font files, <120 KB total) are testable post-fix.
- **Discipline rule #4 (cross-card consistency).** Unbounded migration must result in exactly ONE site retaining Unbounded (the masthead wordmark). Anything else needs justification.
- **Discipline rule #6.** No editorial-chip-style typography reasoning. The spec's "use this for X, that for Y" rules are quantitative-by-purpose; don't introduce font choices that read as editorial.
- **Local-build verification at Pause B is REQUIRED** — Phase 18.1.1 lesson. Font-loading + bundle composition is exactly the risk surface that broke prod last time.
- **Tailwind v4 silent-drop pattern** — if any new `@media` rules added in `globals.css`, hoist into fresh blocks per memory. Same applies to multi-selector @media (memory v2).
- **Out-of-scope drift risk.** Color tokens (Phase 18.2.1), card layout (Tier 2), primitives (7.7g-b), rgba cleanup (7.7g-c) all close-feeling but separate. Don't silently extend.
- **Operator workflow:** open PR → click merge; no PR body draft, no branch delete.
- **Path A vs Path B**: pick at Pause A. If picking Path B, 7.7g-a-3a ships typography first; 7.7g-a-3b ships spacing residuals after; same prompt structure with reduced scope.

End of prompt.
