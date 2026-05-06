# Phase 18 — Baltic editorial visual identity ship

Self-contained prompt for Claude Code. Paste as the first message of a fresh CC session in `~/kkme`. Expected runtime: ~8–12 hours, single PR, three pause points (Pause A discovery, Pause B foundation, Pause C pre-commit). Frontend-only, no worker deploy. **Operator-surfaced 2026-05-06 in response to "looks AI-built, needs to read as human-designed."**

**Operator framing:** the cumulative effect of small AI-tells across the site (DM Mono workhorse, soft-rounded card corners, mint sentiment palette, symmetric layouts, no editorial scale contrast, no footnote discipline) reads as vibecoded. This phase ships the Baltic editorial direction researched against current best-in-class web design (Mercury, Bryter, Stripe Press, Pentagram editorial work, Order, Build in Amsterdam). Replaces what would have been Phase 7.7g-a-3 (accent consolidation) + 7.7g-a-4 (Cormorant migration) + parts of 7.7g-b (Card primitive).

The end-state visual reference is the Baltic-editorial-broadsheet mockup operator-approved 2026-05-06 (Plex Mono + Newsreader workhorse / serif pairing; Baltic-grounded palette; sharp corners + per-card-type top accent rule; broadsheet masthead with vol/issue/date; vertical labels on chapter sections; pixel-grid amplified site-wide; editorial-scale serif hero numbers with footnote anchors; bracket-notation source markers; italic deck/sub-line per card; pull-quote moments per chapter).

---

## What ships

8 sub-items spanning 3 pause-bracketed groups. Single PR.

### Foundation group (lands at Pause B)

1. **Typography swap** — DM Mono → IBM Plex Mono; Cormorant → Newsreader. Both via `next/font/google`. `--font-mono` and `--font-serif` token redirects in `app/globals.css`. 478 mono usages + 39 serif usages flow through CSS variables; should require zero per-component changes.

2. **Sentiment palette consolidation** — mint → Baltic deep teal `#1a3833`; drop coral; keep Baltic amber `#d4a574`; add brick `#a8324a` for live/critical only. Updates `--positive` / `--warning` / `--negative` semantic tokens + dependent rgba variants. Drops dead `--accent-rose` / `--accent-purple` if unused.

3. **Card primitive redesign** — sharp 0px corners site-wide; add per-card-type top accent rule (`border-top: 3px solid <accent>` per card class). Per-card-type accent map proposed in §2d for operator approval.

4. **Masthead row** — replace existing top section with broadsheet feel: pixel-KKME wordmark + italic Newsreader tagline + mono `Vol I · No NN · DD MMM YYYY` issue stamp on right + 0.5px Baltic-amber rule below.

5. **Background polish** — extend dotted pixel-grid site-wide (radial-gradient at ~8% opacity, 16px spacing); fix `HeroBalticMap` card-glued-on-map bug (full-bleed map background + cards layered with proper backdrop); marquee architectural ticks every ~50px on top edge.

### Editorial polish group (lands at Pause C)

6. **Hero number editorial scale** — RevenueCard / S1Card / S2Card / S4Card hero stats get serif Newsreader at 88–96px in hairline (200) or light (300) weight. Companion italic supporting line below + footnote anchor superscript.

7. **Footnote citation discipline** — every claim with a source gets a superscript anchor (¹ ² ³) tied to a footnote at the card's bottom citing methodology section + data source. Replaces / augments the current "Source: ..." plain text footer convention.

8. **Bracket-notation source markers** — `[src]`, `[as-of]`, `[t−2h]`, `[ live ]` format per the editorial mockup. `SourceFooter` primitive updated once; flows to all consumers.

`model_version` does NOT bump — engine is unchanged. No worker deploy.

---

## OUT of scope

- Engine changes (engine v7.3 unchanged)
- Worker changes (frontend-only)
- 5-primitive system migration (this phase only redoes the Card layer; Stat / Badge / Chart / Drawer stay in Phase 7.7g-b)
- Spacing token rollout (Phase 7.7g-a-2 stays queued; uses current inline-px patterns in this phase)
- rgba/hex regression cleanup + CI gate (Phase 7.7g-c stays queued)
- Worker URL centralization (Phase 7.7g-b #6, stays queued)
- Mobile responsive review (separate phase later)
- Phase 12.12 data-integrity infrastructure
- Roadmap edits — operator/Cowork-owned per discipline rule #5; CC reports needed deltas via handover

---

## Read first

1. `CLAUDE.md` — six discipline rules + audit-credibility taxonomy
2. `docs/handover.md` Sessions 38–41 (most recent)
3. `docs/phases/_post-12-8-roadmap.md` "Currently active" section — confirm Phase 29 shipped
4. `docs/methodology.md` — voice reference for editorial copy + footnote text
5. `app/layout.tsx` — current `next/font` loads (Cormorant, DM Mono, Unbounded — post-Phase-7.7g-a-1)
6. `app/globals.css:1-50` — token declarations
7. `app/globals.css` accent color section — locate `--accent-purple/green/teal/rose/amber` declarations and rgba variants
8. `app/components/RevenueCard.tsx` — current hero treatment, baseline for editorial-scale upgrade
9. `app/components/S1Card.tsx`, `S2Card.tsx`, `S4Card.tsx` — chip + hero patterns
10. `app/components/HeroBalticMap.tsx` — for hero-glued-on-map fix; understand current map+cards layering
11. `app/components/primitives/SourceFooter.tsx` — for footnote/bracket-marker integration
12. `app/components/BalticStorageIndexCard.tsx` (Phase 29) — newest card, follow-on from latest patterns

Memory references:
- `project_design_principles.md` — locked principles + P1 clarification (no editorial chips)
- `feedback_drawer_prose.md` — drawer voice
- `reference_card_inventory.md` — recent card list with chip semantics
- `feedback_cowork_sandbox_limits.md` — recurring-error notes (verify-before-act with `__tests__` included)

---

## 0. Session-start protocol

```bash
git switch main
git pull --ff-only origin main
git log --oneline -5
git status
bash scripts/diagnose.sh
```

Expected: HEAD on main at the post-Phase-29-merge commit. State understanding (one paragraph). Wait for "proceed".

---

## 1. Branch + baseline

```bash
git checkout -b phase-18-baltic-editorial
npx tsc --noEmit       # 0 errors
npx vitest run          # 919+ baseline (post-Phase-29; may be 920+ if Phase 29 added tests)
npm run lint            # 126 baseline (post-Phase-29 .wrangler/tmp cleanup)
npm run build           # 9 routes (post-Phase-29 includes /methodology)
```

Capture exact baseline numbers. Pre-commit must match (no new errors introduced).

---

## 2. Pause A — Discovery + scope confirmation

After §0 reads, do this audit and report findings before any code change.

### 2a. Typography audit

```bash
grep -rEn "var\(--font-(mono|serif|display)\)" app/components/ app/lib/ 2>&1 | wc -l
grep -rEn "fontFamily:\s*'[A-Za-z]" app/components/ 2>&1 | grep -v "var(--font" | head -30
grep -rEn "'Cormorant'|'DM Mono'|'Unbounded'" app/components/ 2>&1 | head -20
```

Confirm: are there any direct font-family declarations bypassing CSS variables? If yes, list them — they'll need component edits beyond the token swap. Per Phase 7.7g-a-1's verify-before-act discipline rule, **drop the `grep -v __tests__` filter** — tests can pin font tokens.

### 2b. Sentiment palette audit

```bash
grep -rEn "--accent-(green|teal|rose|amber|purple)|--positive|--warning|--negative" app/components/ app/lib/ app/globals.css 2>&1 | head -30
grep -rEn "rgba\(74,\s*222,\s*128|rgba\(0,\s*180,\s*160" app/components/ 2>&1 | head -10
```

Identify component-level direct rgba refs (mint and teal raw) that won't be auto-migrated by the token swap.

### 2c. Card corner radius audit

```bash
grep -rEn "borderRadius|border-radius" app/components/ app/globals.css 2>&1 | head -30
```

Identify the sites where corner radius is currently set (CSS or inline). Determine sharp-0px migration points.

### 2d. Per-card top accent decision

Propose a per-card-type accent color map. Recommendation:

| Card type | Accent | Rationale |
|---|---|---|
| RevenueCard, methodology drawer, BalticStorageIndexCard | deep teal `#1a3833` | primary brand, revenue-economics |
| S2Card (balancing), S2 activation | Baltic amber `#d4a574` | secondary brand, "support cast" |
| S1Card (capture), S4Card (pipeline), domain cards (Wind/Solar/Load/etc.) | neutral 0.5px black border, no accent rule | quieter, lets data speak |
| Live indicators / S5 (DC news, urgent items only) | brick `#a8324a` | sparingly, "currently happening" |

Operator confirms or overrides. CC defaults to recommendation if no override.

### 2e. Masthead content decision

Current top strip in `HeroBalticMap.tsx` (or equivalent): KKME wordmark + "Baltic flexibility market, live" + LIVE · ENTSO-E · LITGRID · AST · ELERING. Replace with broadsheet feel:

- Left: KKME pixel SVG (kept as-is)
- Italic Newsreader tagline beside (recommend: "Baltic flexibility, daily" — falls naturally with daily editorial cadence)
- Right: mono Plex `Vol I · No NN · DD MMM YYYY`
  - Vol I = first year of publication (KKME launched in 2026)
  - No NN = day-of-publication count since launch (auto-derived from Date.now() and a launch-date constant; recommend launch date `2025-12-30` so `No 127 ≈ 06 May 2026`)
  - DD MMM YYYY = current date (auto)
- Below: 0.5px Baltic-amber rule (`#d4a574`)
- Below the rule: existing source row `[ live ]  entso-e  litgrid  ast  elering` reformatted as bracket-notation

Operator confirms tagline + launch-date constant for issue numbering, OR overrides.

### 2f. Footnote citation pattern per card

For each major card, list 1–3 claim-bearing values that warrant footnote anchors. Example for S2 card:
- Hero `€13.5/MW/h` → ¹ "BTD price_procured_reserves, LT, 7d rolling"
- Chip `+45% / P50` → ² "Rolling 30d distribution; see /methodology#calculation"
- aFRR direction note → ³ "up + down combined; one-direction values in sub-stats per Phase 30 disclosure"

CC drafts this list for every major card and surfaces at Pause A. Operator approves before §6.

### 2g. Pull-quote moments per chapter

Each chapter section header (Chapter 1 Live, Chapter 4 Economics, Chapter 5 What's Moving) gets ONE editorial pull-quote in italic Newsreader at 16–18px, line-height 1.5, max 2 lines. CC drafts text from existing methodology paper or card prose; operator approves.

Recommended pull-quotes:
- Ch 1 (Live): *"Baltic flexibility, on the hour. Markets, fleet, dispatch — every five minutes."*
- Ch 4 (Economics): *"Today's gross 2h capture is €<X>/MWh, in the p25–p50 band of the rolling 30-day distribution."*
- Ch 5 (What's Moving): *"Pipeline movements, regulatory shifts, balancing reserve developments — week-to-week."*

Operator approves OR overrides.

### Pause A report

Halt + report:

1. Typography audit results (any direct font-family bypassing tokens, count of fixes needed)
2. Palette audit results (count of components needing direct-rgba edits beyond token swap)
3. Card corner radius migration sites
4. Per-card-type accent map (proposed, recommend approve)
5. Masthead text (tagline, issue-number launch date)
6. Per-card footnote citations (full list, drafted)
7. Per-chapter pull-quote text (drafted, recommend approve)
8. Refined estimate (vs the prompt's ~8–12h)
9. Any unforeseen scope risks (e.g., hardcoded fonts in chart libraries, third-party component theming)

Wait for explicit operator "proceed" with chosen paths before §3.

---

## 3. Foundation — typography + palette + tokens

(post-Pause-A, lands before Pause B)

### 3a. Install fonts

```bash
npm install @fontsource/ibm-plex-mono @fontsource/newsreader
```

(Or use `next/font/google` for IBM_Plex_Mono and Newsreader — preferred since the rest of the layout already uses next/font. Same pattern as Cormorant/DM_Mono/Unbounded.)

### 3b. Update `app/layout.tsx`

Replace the Cormorant + DM_Mono `next/font/google` imports with IBM_Plex_Mono + Newsreader. Keep Unbounded. Update className concatenation:

```tsx
import { Newsreader, IBM_Plex_Mono, Unbounded } from "next/font/google";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["200", "400", "500"],
  style: ["normal", "italic"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// (Unbounded loader stays)

// className: ${newsreader.variable} ${ibmPlexMono.variable} ${unbounded.variable}
```

### 3c. Update `app/globals.css` token declarations

```css
--font-mono: var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
--font-serif: var(--font-newsreader), 'Newsreader', 'Iowan Old Style', Georgia, serif;
--font-display: var(--font-unbounded), 'Unbounded', sans-serif;
```

Drop dead `--font-cormorant` reference if any chain still references it. Drop `--font-dm-mono` raw token reference. (Per the next/font pattern, `--font-newsreader` and `--font-ibm-plex-mono` resolve to next/font CSS variables Next.js auto-generates.)

### 3d. Sentiment palette consolidation

In `app/globals.css`:

```css
/* Was: --positive resolved to mint */
--positive: #1a3833;     /* Baltic deep teal */
--warning: #d4a574;       /* Baltic amber, kept */
--negative: #a8324a;      /* Brick, was coral */

/* Drop: --accent-rose, --accent-teal (redundant), --accent-purple (unused) */
/* Update rgba variants of --positive and --negative accordingly */
```

Per §2b audit, also handle component-level direct rgba refs that bypass tokens.

### 3e. Verify post-token-swap

```bash
npx tsc --noEmit       # 0 errors
npm run dev            # local renders without console errors
npx vitest run          # baseline preserved
```

Manual visual: open the local dev server, check that DM Mono → Plex Mono swap rendered correctly across cards (478 mono usages); Cormorant → Newsreader on tier3-interp prose (39 usages).

If Plex Mono or Newsreader render unexpectedly (e.g., missing italic variant, weight not loading), fall back to Iowan Old Style / SF Mono and report at Pause B.

---

## 4. Layout transformations — cards + masthead + background + hero-glued

(post-§3, lands before Pause B)

### 4a. Card primitive — sharp corners + per-card-type accent

Update card container CSS:
- `border-radius: 0` everywhere
- Add per-card-type CSS class for top accent rule

```css
.card { background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 0; padding: ...; }
.card--revenue { border-top: 3px solid var(--positive); }   /* deep teal */
.card--balancing { border-top: 3px solid var(--warning); }   /* amber */
.card--neutral { border: 0.5px solid var(--border); border-top: 0.5px solid var(--border); }
.card--live { border-top: 3px solid var(--negative); }       /* brick, sparingly */
```

Migrate all card components to use the new classes per §2d map.

### 4b. Masthead row

Refactor `HeroBalticMap.tsx` (or wherever the existing hero strip lives) to:

```tsx
<div className="masthead">
  <div className="masthead__left">
    <KkmePixelLogo />
    <span className="masthead__tagline">Baltic flexibility, daily</span>
  </div>
  <div className="masthead__right">
    <span className="masthead__issue">{`Vol I · No ${dayCount} · ${dateStr}`}</span>
  </div>
</div>
<div className="masthead__rule" />  // 0.5px Baltic-amber
<div className="masthead__source-row">
  <span className="src-bracket">[ live ]</span>  ENTSO-E  LITGRID  AST  ELERING
</div>
```

### 4c. Background polish

In `app/globals.css`:

```css
body {
  background: var(--bg);
  background-image: radial-gradient(circle, var(--text-tertiary-low-alpha) 1px, transparent 1px);
  background-size: 16px 16px;
  background-position: 0 0;
}
```

Use a CSS variable `--text-tertiary-low-alpha` set to `rgba(<text rgb>, 0.06)` so it auto-adapts to dark/light mode. Verify the dotted-grid is barely visible — should NOT compete with the map's existing dot pattern; this is connective tissue, not decoration.

### 4d. Hero-glued-on-map fix

`HeroBalticMap.tsx` currently has the right-rail `50 MW · 4H · DA · €X` card overlapping the map. Fix:

1. Map becomes full-bleed background of the hero section (extend its width to span the whole hero region)
2. Right-rail cards get explicit `background: var(--bg-card-elevated)` and proper `z-index` so they sit above the map cleanly
3. Verify in dark + light mode that backdrop is opaque enough to make text readable

### 4e. Marquee architectural ticks

On the bottom marquee strip's top edge:

```tsx
<div className="marquee-ticks">
  {Array.from({ length: 12 }).map((_, i) => (
    <div key={i} className="marquee-ticks__tick" />
  ))}
</div>
<div className="marquee">{...}</div>
```

```css
.marquee-ticks { display: flex; justify-content: space-between; padding: 0 1rem; }
.marquee-ticks__tick { width: 1px; height: 4px; background: var(--text-secondary); }
```

---

## 5. Pause B — Foundation gates + screenshot diff

(post-§3+§4, before §6 editorial polish)

Run gates:
- tsc 0 errors
- vitest 919+ all green
- lint baseline preserved (126 from Phase 29)
- build 9 routes
- `npm run dev` — full home page + /methodology renders correctly

Capture screenshots:
- Home page hero in dark + light
- One sample card with new corner + accent treatment (RevenueCard recommended) in dark + light
- /methodology page in dark + light (Newsreader font swap visible)
- Save to `docs/visual-audit/phase-18/foundation/`

Halt + report:
- Foundation diff vs operator's mockup expectation (paste screenshots referenced)
- Any unexpected breakage (typography rendering, color regressions, layout shifts)
- Bundle size delta from font swap (`npm run build` reports route + chunk sizes)
- Estimate remaining for §6 editorial polish

Wait for explicit operator "proceed" with editorial polish.

---

## 6. Editorial polish — hero scale + footnotes + pull-quotes + bracket markers

(post-Pause-B)

### 6a. Hero number editorial scale

For RevenueCard / S1Card / S2Card / S4Card hero numbers (and any card with a primary stat), wrap in serif Newsreader at 88–96px, weight 200 (hairline) or 300 (light). Companion italic Newsreader supporting line at 13–15px below + footnote anchor superscript:

```tsx
<div style={{ fontFamily: 'var(--font-serif)', fontSize: 88, fontWeight: 200, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 0.95 }}>
  €{value.toFixed(1)}
  <sup style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, marginLeft: 6, color: 'var(--text-secondary)' }}>¹</sup>
</div>
<div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
  {supportingLine}
</div>
```

Apply to: RevenueCard hero, S1Card hero, S2Card hero, S4Card hero, BalticStorageIndexCard primary (LT 2h or LT 4h) display.

### 6b. Footnote citation discipline

For each card with hero / chip / claim-bearing data, add a footnote section above the source footer (or replacing it):

```tsx
<div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
  <div><span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text-secondary)' }}>¹</span> BTD price_procured_reserves, LT, 7d rolling.</div>
  <div><span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text-secondary)' }}>²</span> Rolling 30d distribution; <a href="/methodology#calculation">methodology §3</a>.</div>
</div>
```

Per §2f-approved per-card map.

### 6c. Pull-quote moments

For each chapter section header (Chapter 1, Chapter 4, Chapter 5), add a centered editorial pull-quote:

```tsx
<div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 0', textAlign: 'center', borderTop: '0.5px solid var(--accent-amber)', borderBottom: '0.5px solid var(--accent-amber)', marginTop: 32, marginBottom: 32 }}>
  <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
    {pullQuoteText}
  </p>
</div>
```

Per §2g-approved per-chapter map.

### 6d. Bracket-notation source markers

Update `app/components/primitives/SourceFooter.tsx` to render bracket-notation:

```tsx
<div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
  <span>[src]</span>&nbsp;{sourceName}&nbsp;&middot;&nbsp;<span>[as-of]</span>&nbsp;{asOfRel}
</div>
```

Where `asOfRel` is relative time like `t-2h`, `t-15m`, etc.

Flows to all SourceFooter consumers across the site.

### 6e. Optional micro-touches

If time permits at the end of §6:
- Vertical "S · II" archival stamp on chapter side rails
- Tiny brick-red live indicator dot beside `[ live ]` markers
- Ornament dingbats (`° ° °`) before marquee strip and other section breaks

These are 30-min nice-to-haves; defer if Pause C is approaching.

---

## 7. Pause C — Pre-commit verification

(post-§6, before commits + push)

Run gates:
- tsc 0 errors
- vitest baseline + any new tests for new SourceFooter / Card variant rendering
- lint baseline preserved
- build 9 routes
- `npm run build` reports bundle size delta (capture for handover)

Capture full-page screenshots in dark + light mode:
- Hero section (with masthead + map + cards layered cleanly)
- Each chapter section
- One detail card with footnotes visible (RevenueCard recommended)
- /methodology with footnote anchors
- Save to `docs/visual-audit/phase-18/full/`

Halt + report:
- Final diff vs operator mockup (link screenshots in handover)
- Any production-blocking regressions
- Bundle size impact (Plex Mono + Newsreader bundle costs vs DM Mono + Cormorant baseline)
- Backlog discovered: any third-party component theming that bypasses tokens, any card that didn't migrate cleanly, any pull-quote text the operator wants to revise

Wait for explicit operator "proceed" before commits + push.

---

## 8. Commits + push

Suggested 6-commit structure:

```bash
# Commit 1: Foundation — fonts + palette + token redirects
git add package.json package-lock.json app/layout.tsx app/globals.css
git commit -F /tmp/phase-18-c1-foundation.txt
# Body: IBM Plex Mono + Newsreader installed via next/font; --font-mono and
# --font-serif redirected; sentiment palette consolidated to Baltic-grounded
# (mint→teal, drop coral, keep amber, add brick); --accent-rose / --accent-purple
# dropped per audit.

# Commit 2: Card primitive — sharp corners + per-card-type accent rules
git add app/components/RevenueCard.tsx app/components/S*.tsx app/components/*Card.tsx app/globals.css
git commit -F /tmp/phase-18-c2-cards.txt
# Body: sharp 0px corners site-wide; per-card-type top accent rule (teal/amber/
# brick/neutral map per §2d); border-radius 0 enforced via .card class.

# Commit 3: Masthead + background + hero-glued fix
git add app/components/HeroBalticMap.tsx app/page.tsx app/globals.css
git commit -F /tmp/phase-18-c3-layout.txt
# Body: broadsheet masthead (vol/issue/date stamp); site-wide pixel-grid; map
# becomes full-bleed background of hero with cards layered cleanly (fixes
# hero-glued bug); marquee architectural ticks.

# Commit 4: Hero scale editorial typography
git add app/components/RevenueCard.tsx app/components/S1Card.tsx app/components/S2Card.tsx app/components/S4Card.tsx app/components/BalticStorageIndexCard.tsx
git commit -F /tmp/phase-18-c4-hero.txt
# Body: editorial-scale serif hero numbers (Newsreader 200, 88-96px) + italic
# supporting lines + footnote anchors per §2f.

# Commit 5: Footnotes + bracket markers + pull-quotes
git add app/components/primitives/SourceFooter.tsx app/components/*Card.tsx app/page.tsx
git commit -F /tmp/phase-18-c5-editorial.txt
# Body: footnote citation discipline + bracket-notation source markers ([src]
# [as-of]) + pull-quote moments per chapter; SourceFooter reformatted once.

# Commit 6: Handover Session 42
git add docs/handover.md docs/visual-audit/phase-18/
git commit -F /tmp/phase-18-c6-handover.txt
# Body: Session 42 entry with all per-card decisions, screenshots, bundle size
# delta, supersedes-7.7g-a-3-and-7.7g-a-4 note.

git push -u origin phase-18-baltic-editorial
```

Use `git commit -F` with messages dropped to /tmp first to avoid multi-line `-m` paste corruption (recurring-error memory). Print the PR-creation URL.

---

## 9. Handover Session 42

Full entry per Session 30 / 40 / 41 structure:

- Headline: Baltic editorial visual identity ship — typography swap (Plex Mono + Newsreader), Baltic-grounded palette, sharp corners + per-card-type accent, broadsheet masthead, editorial-scale hero numbers, footnote citation discipline
- Branch + base
- Pause A / B / C reports (paste literally)
- Per-card-accent map applied (table)
- Masthead final text (tagline + launch-date constant + sample issue stamp)
- Per-card footnote map
- Pull-quote text per chapter
- Verification gates (paste actual numbers)
- Bundle size delta (Plex Mono + Newsreader cost vs DM Mono + Cormorant baseline)
- Backlog discovered (any third-party theming risk, any cards that didn't migrate cleanly, any operator-pending text revisions)
- Out of scope (per prompt)
- **Tier 1 sequence:** Phase 18 ✅ → Phase 7.7g-a-3 (accent consolidation) and Phase 7.7g-a-4 (Cormorant migration) **SUPERSEDED by Phase 18**; Phase 7.7g-b reduced scope (Card primitive done; Stat / Badge / Chart / Drawer remain); Phase 7.7g-a-2 (spacing) + Phase 7.7g-c (rgba CI gate) still pending
- Next operator action: open PR via web UI; apply roadmap delta Cowork-side after merge

---

## 10. Roadmap delta needed (operator-side, post-merge)

CC does NOT commit roadmap. Report needed deltas in handover. Expected:

- **Phase 18 → Shipped appendix** with full description
- **Phase 7.7g-a-3 (accent consolidation)** marked SUPERSEDED by Phase 18 — strikethrough the entry, add note pointing to Phase 18 commit
- **Phase 7.7g-a-4 (Cormorant migration)** marked SUPERSEDED by Phase 18 (Cormorant migrated to Newsreader, not just dropped to system fallback)
- **Phase 7.7g-b** scope reduced — Card primitive done; remaining sub-items (Stat, Badge, Chart, Drawer primitives + worker URL centralization + source-into-drawer reconsidered per Phase 18's bracket markers) updated
- **Currently-active** updates: Phase 18 in-flight → shipped; next CC across (7.7g-a-2 / 12.12 / 7.7g-b reduced scope)
- Operator-action-items: methodology destination decision (#4) marked closed by Phase 29 (`/methodology` route shipped)

---

## 11. If discovery contradicts assumptions (Pause A / B halts)

Particularly relevant for:

- **Typography rendering:** if Plex Mono or Newsreader fail to load via next/font, fall back to system stacks and report — don't ship with broken rendering
- **Cormorant fallback chains in third-party libraries:** if a chart library or rich-text component hardcodes Cormorant references, it bypasses the token swap; surface to operator for separate fix
- **Sentiment palette references in chart components:** Chart.js / d3 components often hardcode color via JavaScript, bypassing CSS variables; identify any such cases at §2b and decide whether to migrate now or defer
- **Bundle size shock:** if Newsreader hairline (200) + italic + light + bold variants total > 200 KB, recommend dropping italic or reducing weights
- **Hero-glued fix complexity:** if the map+cards layering requires architectural refactor beyond the prompt scope, halt and escalate

Same audit-triage / verify-before-act discipline that caught Phase 7.7g-a-1's typography.test.ts and Phase 4G's cp1257 premise. **Don't unilaterally extend scope.**

---

## 12. Bundle size budget (informational)

Reference numbers from current state:
- DM Mono (400 + 500): ~32 KB
- Cormorant (300 + 400 + 600): ~88 KB
- Unbounded (400 + 600): ~44 KB
- **Current total: ~164 KB**

Estimate post-Phase-18:
- IBM Plex Mono (400 + 500): ~38 KB
- Newsreader (200 + 400 + 500 + 400-italic): ~92 KB (variable axis font, slightly heavier)
- Unbounded (400 + 500): ~38 KB (drop weight 600 if unused)
- **Estimated total: ~168 KB** (within 5% of baseline)

If bundle size delta exceeds 30 KB unexpectedly, investigate at Pause B.
