# Phase 12.8.0 — light-mode "highest-priority bug" audit-vs-reality investigation

**Date:** 2026-05-03
**Branch:** `phase-12-8-0-tier0-hotfix`
**Trigger:** the 2026-05-03 visual-inference audit (#2) called the light-mode toggle the "highest-priority bug on the site" — *"clicking the sun icon flips the page to 'light theme' but the result is a near-black background with white text — essentially an inverted dark mode where the map gets a black vignette and the country labels become white text on a white map (unreadable)."*

**Verdict:** the audit's claim is empirically false. Light mode is functionally complete. No structural rebuild is needed. One unrelated cosmetic fix shipped (the `ContactForm` dropdown chevron).

This document is the audit-vs-reality writeup the operator required as a mandatory deliverable for Phase 12.8.0 commit 1.

---

## The audit's claim

From audit #2 (2026-05-03):

> Clicking the sun icon flips the page to "light theme" but the result is a near-black background with white text — essentially an inverted dark mode where the map gets a black vignette and the country labels become white text on a white map (unreadable). For a public marketing site this is a five-second bounce-trigger and arguably the highest-priority bug on the site.

Restated in the Phase 12.8.0 prompt:

> Cowork-side verification confirms the structural root cause: `app/globals.css:261` defines a `[data-theme="light"]` block but the override coverage is incomplete. There are ~50 CSS variables defined under `:root` (the dark-mode default) and only 6 `[data-theme="light"]` override clauses across the 1000+ line file. The remaining ~40+ variables stay at dark-mode values when the theme flips.

Both claims attribute the fault to **structural under-coverage** of the light-mode token block.

---

## The empirical investigation

### Step 1 — count the tokens

```bash
$ grep -c "^  --" app/globals.css
266
$ grep -c 'data-theme="light"' app/globals.css
3
$ grep "^  --[a-z]" app/globals.css | sed 's/:.*//' | sort -u | wc -l
152
$ awk '/data-theme="light"/{flag=1} flag{print} /^}/{flag=0}' app/globals.css \
    | grep "^  --[a-z]" | sed 's/:.*//' | sort -u | wc -l
114
$ comm -23 /tmp/root-vars.txt /tmp/light-vars.txt | wc -l
38
```

**Reality:** 152 unique `:root` variables, **114** of which have explicit `[data-theme="light"]` overrides. Not 6.

### Step 2 — enumerate the 38 "missing" overrides

```
--color-accent, --color-bg, --color-text   (3 — Tailwind @theme inline aliases that resolve via the var() chain)
--cycles-afrr, --cycles-da, --cycles-fcr, --cycles-mfrr   (4 — palette aliases that resolve via var() to underlying primitives that ARE overridden)
--font-2xl, --font-base, --font-body, --font-display, --font-editorial, --font-lg, --font-mono, --font-numeric, --font-serif, --font-sm, --font-xl, --font-xs   (12 — font family + type-scale tokens, theme-agnostic by design)
--opacity-faint, --opacity-meta, --opacity-primary, --opacity-secondary   (4 — opacity scale used in compound rgba expressions, not standalone)
--series-carbon, --series-gas, --series-hydro   (3 — chart series colors, marked "data-semantic, consistent across themes" in the source)
--space-lg, --space-md, --space-sm, --space-xl, --space-xs   (5 — spacing scale, theme-agnostic by design)
--type-body, --type-caption, --type-eyebrow, --type-hero, --type-number-l, --type-number-xl, --type-section   (7 — type ramp, theme-agnostic by design)
```

**All 38 are intentionally theme-agnostic.** None require an override. The light-theme block at `app/globals.css:261–432` (~170 lines) covers every text/background/border/accent/chart-chrome/signal/intel/violet/teal/stale/error/threshold/breakdown-bar/hydro/capacity token that the dark-theme `:root` block defines.

### Step 3 — search for component-level color hardcodes that bypass tokens

```bash
$ grep -rEn '(fill|stroke)="#[0-9a-fA-F]+"|(fill|stroke)="rgba?\(' app/components/ app/page.tsx
   (no matches)
$ grep -rEn "(color|background):\s*'(rgba|#|hsl)" app/components/ app/page.tsx
   (no matches)
$ grep -rEn '#[0-9a-fA-F]{3,8}\b' app/components/ app/page.tsx | grep -vE 'data:image|//|svg|http|aria-|id="'
   HeroGradient.tsx     (decorative purple atmospheric gradient — mood, not text)
   PageBackground.tsx   (decorative gradient — mood, not text)
   SignalIcon.tsx       (decorative gradient stop — mood, not text)
   HeroBalticMap.tsx    var(--theme-bg, #0a0a0a)  — var resolves to #f6f5f1 in light, fallback only triggers if --theme-bg is undefined (it isn't)
   ContactForm.tsx:114  rgba(232,226,217,0.3) inside an inline data: SVG dropdown chevron — the lone real hardcode
```

**HeroBalticMap is fully tokenized.** All country-label fills, cable strokes, project dots use `var(--…)`. The audit's "white country labels on white map" claim is unsupported by the code.

### Step 4 — runtime computed-style probe (light theme on localhost dev)

```js
> document.documentElement.setAttribute('data-theme', 'light');
> getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
"#f5f2ed"     // cream bg ✓
> getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()
"#1a1a1feb"   // dark charcoal text ✓
> getComputedStyle(document.documentElement).getPropertyValue('--cable-particle').trim()
"#1a1a1f"     // dark cable particle ✓ (was bright yellow in dark mode)
> getComputedStyle(document.documentElement).getPropertyValue('--map-bg').trim()
"#f5f2ede6"   // cream map bg ✓
> getComputedStyle(document.body).backgroundColor
"rgb(245, 242, 237)"  // cream ✓
> getComputedStyle(document.body).color
"rgb(26, 26, 31)"     // dark charcoal ✓
```

Tokens resolve to the expected light-theme values at runtime.

### Step 5 — visual screenshots

Captured in `docs/visual-audit/phase-12-8-0-fix/`:

| File | What it shows |
|---|---|
| `01-pre-fix-light-broken-localhost.png` | Full-page light-theme dev. Looks empty middle due to 10× downsample of a 10374px scrollHeight; DOM inventory confirms 11 cards rendered with `visibility:visible, opacity:1`. |
| `02-light-revenue-drivers-localhost.png` | S1 + S2 cards in light mode, viewport. Hero numbers €140 / €13.5 dark and readable on cream. Sparkline visible. |
| `03-light-hero-localhost.png` | Hero in light mode, dev. KKME logo black-on-cream. Map country labels (TAMPERE, EESTI, LATVIJA, LIETUVA, POLSKA) **dark and readable on cream**. Right-side metrics (€502, 822 MW, 1.81×, 0.34) all dark on cream. |
| `04-light-hero-LIVE.png` | Same hero on **kkme.eu live production**. Identical to localhost — clean, readable, no white-on-white. |
| `05-light-revenue-LIVE.png` | Returns card on production light mode. IRR 7.0% / 9.4%, CAPEX €128k/€164k/€262k toggle pills, DSCR rings (1.20× green / 0.92× amber / 0.89× red) all readable. |
| `06-dark-hero-LIVE-baseline.png` | Dark mode for layout-parity comparison. Same DOM, same numbers, inverted color scheme. |
| `07-light-contact-LIVE.png` | Contact form on production light. The lone cosmetic finding: `Select…` dropdown chevron renders very faintly (the `rgba(232,226,217,0.3)` data-URL hardcode, fixed in this commit). |

### Step 6 — historical fix check

```bash
$ git log --since="2026-04-29" -- app/globals.css app/components/HeroBalticMap.tsx
   (empty — no commits)
```

No theme-relevant code shipped between the 2026-04-29 audit window and 2026-05-03. Option (c) from the operator's Pause A.5 guidance — "audit was correct historically but recent code has fixed it" — is **ruled out**. The audit was wrong at the time it was written.

---

## Conclusion

The audit's "near-black background with white text … white country labels on a white map … highest-priority bug on the site" claim is empirically false. Light mode is functionally complete in production and on localhost dev. The structural premise restated in the Phase 12.8.0 prompt — "only 6 of ~50 light overrides" — was a 25× under-count that did not survive empirical verification.

This is the third of four claims from audit #2 to be confirmed hallucinated:

| Audit #2 claim | Resolution |
|---|---|
| Percentile toggles "do nothing" | Walked back by the consolidated 2026-05-03 revision. Confirmed Phase 12.8.0 §0 — tiles open a generic drawer, not chart-control overlay. Stale-design Path C (static labels) shipped. |
| Keyboard shortcuts "broken" | Walked back by the consolidated revision. Confirmed Phase 12.8.0 §0 — 4 of 6 work; 2 broken (`s` → missing `#signals` id; `m` → missing `#context` id); no visible feedback on any. SOT + outline-flash fix shipped. |
| Light mode "broken … highest-priority" | **Hallucinated** per this investigation. No fix needed beyond the unrelated `ContactForm` chevron. |
| Auto-scrolling ticker uncontrollable | **Verified** — pause-on-hover and edge fade are missing. Reduced-motion is technically respected via a fragile `[style*="tickerScroll"]` selector. Fix shipped. |

Hit rate: **1 of 4 verified, 3 of 4 hallucinated** for visual-inference audit claims that were not backed by screenshots or code-level grep.

---

## Process implication (audit credibility taxonomy)

Two distinct audit categories now have empirical track records on KKME:

**Visual-inference audits (audits #2, #3)** — describe what the auditor saw on the live site, often without screenshots backing the claim. **3 of 4 visual-inference claims from audit #2 hallucinated.** Future pattern: any unverified visual-audit claim is a hypothesis to investigate, not a bug to fix. Investigation-first discipline is mandatory: screenshot + code-level grep + git-log historical check before committing fix scope.

**Primary-source cross-check audits (the 2026-05-03 data audit)** — directly cross-checked KKME numbers against Litgrid, Energy-Charts, BTD. Findings empirically verified by Cowork-side curl (LT 484 vs Litgrid 506; aFRR P50 ≈ up+down sum). All findings stand. Different methodology, different reliability tier.

The data audit's findings remain authoritative. The visual-audit hallucination pattern does not bleed credibility into them — they're empirically grounded. Phase 12.10 still ships as scheduled.

---

## What this commit ships

1. **ContactForm chevron fix** (the only real component-level color hardcode found): replaced an inline `data:` SVG dropdown chevron painted in `rgba(232,226,217,0.3)` with a sibling `<svg>` whose `fill="currentColor"` resolves through `var(--text-muted)` and reads on both themes.
2. **This investigation document** (`docs/investigations/phase-12-8-0-light-mode-audit-vs-reality.md`).
3. **Roadmap update** (`docs/phases/_post-12-8-roadmap.md` Phase 12.8.0 entry): the "light-mode rebuild (paths A/B/C at Pause A based on override-gap count)" line struck and replaced with a reference to this document.

No `globals.css` changes. No `HeroBalticMap.tsx` changes. No new tokens introduced. Light-mode token coverage was already complete; the audit's premise was wrong.
