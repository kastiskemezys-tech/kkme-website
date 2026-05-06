# KKME — Combined Designer + Developer Specification

**Source:** External audit pasted by operator 2026-05-06. Saved to repo as a reference document for future phase prompts (7.7g-a-3, 7.7g-b reduced, 18.1, 18.2, Phase 20). Author treats it as audit + spec; KKME's discipline rule #1 (audit-triage) applies — verify each claim via code-grep + screenshot before scoping a fix.

**Reliability classification:** primary-source-with-citation tier (~95%) for the empirically-tested claims (button-clicked, URL-state-checked: P0-1 CAPEX selector, P0-2 duration toggle, breakpoint inventory). Visual-inference tier (~25%) for any claim about "looks like" or "appears to". The audit author appears to have instrumented the live page, so most claims should triangulate cleanly.

**Status:** input document, not roadmap. Operator decides per-section which claims fold into which phase.

---

A single working document. Each issue is one ticket: design intent on the left of your brain, implementation on the right. Severity uses the P0–P5 scale from the audit. Where I quote measurements, they were instrumented from the live page (current breakpoints in CSS: 520 / 720 / 768 / 900 / 1100 px; existing tokens include `--bg-page`, `--bg-card`, `--text-primary…faint`, `--accent`, `--teal`, `--amber`, `--rose`, `--blue`, `--violet`, `--font-mono`, `--font-serif`, `--font-display`).

Use this as both a Figma component brief and a ticket backlog. Each P0–P5 ticket is split into the same five-block structure:

> **Current** → **Designer** → **Developer** → **Acceptance** → **Depends on**

---

## 0. Cross-cutting deliverables (do these first)

These produce the tokens and primitives every later ticket consumes.

### CC-1 · Design tokens — type scale, colour roles, motion, spacing

**Current.** 21 distinct font-sizes are rendered (including 8.8 / 9.6 / 15.2 / 17.6 px artefacts). Body text uses 5 alphas of the same beige (#e8e2d9 at 0.15 / 0.45 / 0.55 / 0.65 / 0.92). Existing tokens are good but inconsistent (`--text-primary` is 0xeb but `--text-tertiary` is 0x8c — non-monotonic).

**Designer.** Lock a 9-step modular type scale, 4-step neutral text scale, semantic colour roles, 4-step elevation, 4-step motion scale. Document in Figma as `Tokens / *`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--type-display-2xl` | 64 / 72 line | same | hero number |
| `--type-display-xl` | 48 / 56 | same | section H1 |
| `--type-display-lg` | 32 / 40 | same | card hero number |
| `--type-display-md` | 24 / 32 | same | card subtitle number |
| `--type-body-lg` | 16 / 24 | same | body |
| `--type-body-md` | 14 / 20 | same | dense card body |
| `--type-body-sm` | 12 / 18 | same | meta, tickers |
| `--type-label` | 11 / 14 uppercase tracking +0.06em | same | KPI labels |
| `--type-mono-xs` | 10 / 14 | same | provenance only |

Drop sizes 8 / 8.8 / 9 / 9.6 / 13 / 15 / 15.2 / 17 / 17.6 / 28 / 40 px.

| Text role | Light | Dark | Min contrast |
|---|---|---|---|
| `--text-primary` | rgba(10,10,15,.92) | rgba(232,226,217,.92) | 7:1 |
| `--text-secondary` | rgba(10,10,15,.72) | rgba(232,226,217,.72) | 4.5:1 |
| `--text-muted` | rgba(10,10,15,.55) | rgba(232,226,217,.55) | 3:1 (large only) |
| `--text-disabled` | rgba(10,10,15,.32) | rgba(232,226,217,.32) | not for body |

| Semantic colour | Use |
|---|---|
| `--color-positive` (teal `#00b4a0`) | values better-for-asset |
| `--color-negative` (rose `#d65858`) | values worse-for-asset |
| `--color-warning` (amber `#d4a03c`) | needs attention / forecast |
| `--color-info` (blue `#4d7cb5`) | neutral context |
| `--color-future` (violet `#7b5ea7`) | future / non-realised |

Motion scale: `--motion-instant: 80ms`, `--motion-fast: 160ms`, `--motion-base: 240ms`, `--motion-slow: 400ms`, all with `--ease-standard: cubic-bezier(.2,.8,.2,1)`.

Spacing: 4-px base, scale `4 8 12 16 24 32 48 64 96`. Drop ad-hoc 6 / 10 / 14 / 18.

**Developer.** Replace the dual `:root` / `[data-theme]` block with one tokens file. Generate a single `tokens.css` exported from a Style Dictionary or vanilla `:root` definition. Delete unused alphas from the current 5-alpha text system.

**Acceptance.** `getComputedStyle()` shows ≤9 distinct font-sizes and ≤4 distinct text colours rendered on the homepage. Figma library named `KKME / Tokens` exists, all tokens match the CSS file 1:1.

**Depends on.** Nothing.

**KKME phase mapping:** Phase 7.7g-a-3 (type scale + alpha reduction) + Phase 7.7g-c (CI gate). Phase 18 already shipped sentiment palette consolidation; this spec's color roles broadly align (positive=teal, warning=amber, negative=rose) but the violet `--color-future` is new — proposing for forecast-only surfaces.

---

### CC-2 · Component library

**Current.** Buttons exist in 5 inconsistent flavours (filled chip, outlined ghost, uppercase ribbon, status pill, link). Expanders use 3 different glyphs (`▸`, `▸▸`, `▼`). Cards are bespoke per section.

**Designer.** Define and document these primitives in Figma:

1. **Button** — variants: `primary`, `secondary`, `ghost`, `link`. Sizes: `sm 28h`, `md 36h`, `lg 44h`. All `lg` for mobile. States: rest, hover, active (scale .97 + 70% opacity), focus-ring (2 px `--accent`), disabled (32% opacity, `aria-disabled`).
2. **Pill / Toggle** — segmented control, 36 h on mobile / 28 h on desktop. Selected = filled `--accent` + `--text-primary`; rest = ghost. Min-tap area 44×44 via padding even when visual size is smaller.
3. **Status chip** — small uppercase 11 px label with colour role: `positive` / `negative` / `warning` / `future` / `neutral`. Used for "investable", "uneconomic", "RECENT", "OBSERVED", "FORECAST".
4. **Freshness chip** — `<time>` + relative age, colour driven by age bucket: green `<1h`, amber `1–6h`, red `>6h`, slate `daily/weekly/monthly`. Tooltip shows ISO timestamp + source URL.
5. **KPI tile** — 1 label + 1 value + 1 delta. Standard width tokens for desktop / mobile.
6. **Card** — header (title + freshness chip + source chip), body, footer slot for "How is this computed? →" single-link affordance (replaces all per-card provenance dumps).
7. **Expander** — uses `<details><summary>` with one glyph (`▸` collapsed, `▾` expanded). Smooth-height transition.
8. **Chart wrapper** — wraps SVGs with a uniform tooltip/crosshair, axis labels, and an `aria-label`.

**Developer.** Build as headless React components (or whatever the stack is) with class hooks. Sample contract:

```tsx
<Pill.Group value={dur} onChange={setDur} aria-label="Duration">
  <Pill value="2h">2h</Pill>
  <Pill value="4h">4h</Pill>
</Pill.Group>
```

All interactive components MUST: (a) call `onChange` synchronously, (b) update URL via `history.replaceState`, (c) emit a `data-loading` attribute while the model recomputes, (d) tween numeric values with `requestAnimationFrame`-driven count-up over 240 ms.

**Acceptance.** `<Button>`, `<Pill>`, `<StatusChip>`, `<FreshnessChip>`, `<KPI>`, `<Card>`, `<Expander>`, `<ChartFrame>` exist as exports and pass Storybook visual tests. The homepage uses zero bespoke button/pill/expander HTML.

**Depends on.** CC-1.

**KKME phase mapping:** Phase 7.7g-b reduced (Stat / Badge / Chart / Drawer + worker URL centralization). Phase 18 already shipped Card primitive; this spec is the contract for the remaining four. **The `useScenario()` hook + URL-sync pattern (see P0-1/P0-2) is the architectural fix that prevents future toggle-doesn't-recompute bugs — bake into 7.7g-b prompt.**

---

### CC-3 · Information architecture & footer

**Current.** Single-page everything. Footer is one line. 11 inline `[src]`, 11 `[as-of]`, 16 `methodology` repetitions inside cards.

**Designer.** Define a 4-column footer plus reduce homepage cards to summaries.

```
Product           Data              Company         Legal
─────────         ─────────         ─────────       ─────────
Today's issue     Methodology       About           Privacy
Daily archive     Data sources      Team / contact  Terms
API & pricing     Glossary          Press kit       Imprint
Changelog (v7.3)  References        Newsletter      Cookies
                  Engine notes      LinkedIn
```

Every cluster is its own route (`/methodology`, `/sources`, `/glossary`, `/references`, `/changelog`, `/archive`, `/about`, `/api`, `/press`, `/privacy`, `/terms`, `/imprint`, `/issue/2026-05-06`).

**Developer.** Add a `Footer.tsx` and stub routes. Refactor every per-card `[src]/[as-of]/[observed]/methodology` token into a single `<Card.Sources>` slot rendering one line: `Source · 12 min ago · how is this computed?` where the last is a `<Link to="/methodology#gross-capture">`.

**Acceptance.** Homepage DOM contains `[src]` token ≤1 time (only in the global "Sources & freshness" panel). Lighthouse SEO audit recognises an `<address>` and structured links to legal pages.

**Depends on.** CC-2.

**KKME phase mapping:** Phase 20 (NEW; was queued mentally as audit-v2 P4 gap, now has concrete IA spec). Pre-decided 13 routes + 4-column structure. Phase 11 (glossary) and Phase 12.14 (forward calendar / changelog) integrate as sub-routes of `/glossary` and `/changelog` respectively.

---

## P0 — Credibility-breaking (week 1)

### P0-1 · CAPEX selector doesn't recompute

**Current.** Click `€120` → URL becomes `capex=low`, on-screen description still reads `€164/kWh`, every IRR / payback / DSCR stays identical. Click `€262` → URL stays `capex=mid`, but description and values change to `€120/kWh` figures. Three desynchronised states (URL, button highlight, description, model output) all disagree.

**Designer.** While the model recomputes (≥120 ms), show: (a) button in `pressed` state, (b) all dependent KPIs in a 70%-opacity `data-loading` shimmer, (c) tween values to new numbers over 240 ms `--ease-standard`. The CAPEX subtitle text (`€460–560/kW @ POI…`) must always match the selected capex tier.

**Developer.** Single source of truth: a `useScenario()` hook returning `{ dur, capex, cod, scenario }`. All toggles dispatch to the same reducer; all displays read from it. Bug is most likely a stale closure or two parallel state trees. Suggested:

```ts
const [scenario, dispatch] = useReducer(scenarioReducer, parseUrl());
useEffect(() => syncUrl(scenario), [scenario]);
const model = useMemo(() => recompute(scenario), [scenario]);
```

Then bind every IRR / payback / LCOS card to `model.*`.

**Acceptance.** Cypress test: click each of `€120 / €164 / €262` and assert (a) URL `capex=` updates, (b) headline IRR changes by ≥1pp, (c) description string contains the chosen `€/kWh`, (d) `aria-pressed="true"` on exactly one button.

**Depends on.** CC-2.

**KKME phase mapping:** **CRITICAL — likely needs to fold into Phase 12.11 before PR or queue Phase 12.11.1 immediately.** This is a different bug from what Phase 12.11 currently scopes (CC interpreted audit-v2's "CAPEX low/high mismatch" as tornado-bar consistency and ruled it NOT REPRODUCIBLE). The empirical claim here is the toggle button itself doesn't trigger a recompute. Verify via CC grep `useState\|useReducer.*scenario\|useScenario` + manual click in localhost.

---

### P0-2 · Duration toggle in Reference Asset is dead

**Current.** Click `4H` → URL becomes `dur=4h`, but description reads `200 MWh (4H)` (correct) yet headline IRR keeps showing the 2h value (12.8%) while the optimizer below shows correct 4h value (6.0%). Two displays disagree.

**Designer.** Headline IRR must always reflect the selected duration. The optimizer below should highlight which duration is selected (currently only labels both).

**Developer.** The bug is almost certainly that `headlineIRR` reads from a hard-coded `model.irr2h`. Replace with `model.irrByDur[scenario.dur]`. Add a unit test for the recombination matrix `dur × capex × cod × scenario`.

**Acceptance.** Same headline value as the optimizer cell, for all 24 combinations. Selected duration card in the optimizer carries `data-selected="true"` and a 2-px border-bottom.

**Depends on.** P0-1.

**KKME phase mapping:** Same as P0-1 — likely needs Phase 12.11 scope extension or 12.11.1.

---

### P0-3 · COD 2027 is aliased to COD 2028

**Current.** All IRR / DSCR / LCOS values are pixel-identical for 2027 vs 2028. 2029 differs.

**Designer.** N/A (it's a model-data bug).

**Developer.** Inspect the COD lookup table — likely a missing 2027 row falling back to 2028. Either populate 2027 with real values from the engine or remove the button and explain "COD 2027 closed for new applications" if that's the truth.

**Acceptance.** 2027 vs 2028 IRR differ by ≥0.3pp OR the 2027 button is removed with an inline note.

**Depends on.** None.

**KKME phase mapping:** Phase 12.11 ruled this NOT REPRODUCIBLE in current scope (live `/revenue` matrix emits cod=2027 rows with distinct IRR values 0.2116). Spec's empirical claim conflicts. Re-verify; if pixel-identical 2027/2028 visible in UI but distinct in API, that's a frontend matrix-pivot bug.

---

### P0-4 · "[LIVE]" badge over 12-hour-old data

**Current.** Top-of-page "[LIVE]" badge while DA arbitrage card is timestamped "12h ago" and labelled "TODAY". Inconsistent freshness across cards (5min / 20min / 1h / 3h / 4h / 12h / daily / weekly / monthly).

**Designer.** Replace masthead "[LIVE]" with a real **freshness indicator** in the top-right: `Updated 11:06 UTC · next refresh in 14m`. Each card gets a `<FreshnessChip>` from CC-2 keyed by age bucket. The "TODAY" badge reads honestly: `Today · refreshed 12h ago` if that's the real cadence.

Mockup:
```
┌────────────────────────────────────────────────────────────┐
│ KKME · Baltic flexibility, daily      ⏱ 11:06 UTC · 14m   │
│                                       Live ⬤ Hourly ⬤ Daily│
└────────────────────────────────────────────────────────────┘
```

Three coloured dots in the masthead show the slowest data point per cadence band.

**Developer.**
```tsx
type FreshnessBucket = 'live' | 'hourly' | 'daily' | 'monthly';
function bucket(ageMs: number): FreshnessBucket { ... }
```

Replace masthead `[LIVE]` span with `<FreshnessSummary cards={cards} />` that aggregates all card timestamps and renders the worst-case age. Each card receives `<FreshnessChip ts={card.asOf} />`.

**Acceptance.** No element in the page contains the literal string "[LIVE]" unless the underlying data is <60 s old. Each card has exactly one freshness chip in its header (not body).

**Depends on.** CC-2.

**KKME phase mapping:** Partly addressed by Phase 12.11 freshness logic fix (TODAY → calendar-today-EET). The masthead `[LIVE]` rework + FreshnessSummary primitive is broader — file as input to Phase 7.7g-b reduced (FreshnessChip primitive), with masthead disambiguation as Phase 18.4 candidate.

---

### P0-5 · Imbalance stats never change between LT/LV/EE

**Current.** IMB MEAN 60 MWh, IMB P90 177 MWh, % >100 MWh 28% are pixel-identical for all three countries.

**Designer.** Either honest country-specific numbers, or hide these tiles with a tooltip "Country-specific imbalance breakdown coming Q3" — never show the same number under different labels.

**Developer.** Wire `imbalanceStats[country]` to actual country data; if missing, render `<KPI value="—" muted tooltip="Not yet ingested for {country}" />`.

**Acceptance.** Switching LT↔LV↔EE changes at least 2 of the 3 imbalance numbers by ≥5%.

**Depends on.** None.

**KKME phase mapping:** Not in Phase 12.11 scope. Verify in CC; if pixel-identical, queue as Phase 12.11.2 or fold into 12.11.

---

### P0-6 · LV / EE Trading rates table is empty

**Current.** Only LT row has values (€284, €307); LV and EE rows are all `—`.

**Designer.** Either remove the empty rows entirely with a clear "Lithuania first; Latvia and Estonia in calibration" subtitle, or fill them. Don't leave a 2/3-empty matrix on a "Baltic" page.

**Developer.** If LV/EE genuinely aren't ready, render a single-row table with a `<Tag>Latvia & Estonia in calibration → /methodology#country-rollout</Tag>`.

**Acceptance.** Table either has all cells populated or the empty rows are replaced with a single, legible status note.

**Depends on.** None.

**KKME phase mapping:** Phase 12.11 Bug #7 addresses this via inline footnote anchor + explicit "Coverage pending Phase 29.1 — engine extension queued" message. May want to evaluate the spec's row-collapse alternative in Phase 29.1.

---

### P0-7 · Fleet number contradiction (822 MW vs 651 MW)

**Current.** Hero says "Baltic Flex Fleet 822 MW", deeper section says "Baltic BESS installed (TSO-tracked) 651 MW". User can't reconcile.

**Designer.** Two clearly distinct labels with a tiny info-icon explaining the difference: `Flex fleet (BESS + pumped hydro) 822 MW` vs `BESS installed (TSO-tracked) 651 MW`.

**Developer.** Add tooltips driven by `data-info-id="flex-fleet"` linking to glossary anchors `/glossary#flex-fleet` and `/glossary#bess-installed`.

**Acceptance.** Hover on either number opens a tooltip explaining its scope. Both numbers carry `<sup class="info">i</sup>` markers.

**Depends on.** CC-3.

**KKME phase mapping:** Phase 12.11 Bug #1 addresses via inline subscript "(BESS + pumped hydro)". Glossary anchor link approach (`/glossary#flex-fleet`) is a Phase 11 + Phase 20 enhancement once those routes exist.

---

## P1 — Mobile (week 1–2)

### P1-1 · Horizontal overflow & broken hero on phones

**Current.** At 410-px viewport, `document.scrollWidth` is 556 px (140 px overflow). Interconnector MW values disappear on mobile, only `•` separators remain. Map is invisible in dark mode below 600 px. The masthead theme toggle renders at 0×0 px.

**Designer.** Mobile-first layout for the hero:
```
┌─────────────────────────┐ <360-768px>
│ KKME             ☰      │
├─────────────────────────┤
│ Today's BESS rate       │
│ €346 /MW/day            │ <-- type-display-xl, not 72px
│ ↓ 26% vs base           │
├─────────────────────────┤
│ Flex fleet · 822 MW     │
│ S/D 1.81× · CPI 0.34    │
├─────────────────────────┤
│ Interconnectors (5)  →  │ <-- collapsed; tap to drawer
└─────────────────────────┘
```

The map becomes either a static SVG simplified for mobile (drop the 6,000 ASCII dots) or a `<details>` opt-in below 600 px.

**Developer.** Add a `<360px` guard: hide the map (`display: none`), render interconnectors as a horizontally scrollable carousel (`overflow-x: auto; scroll-snap-type: x mandatory`). Force `min-width: 0` on flex children to prevent overflow. Audit any `width: Npx` and replace with `max-width: 100%`. Theme toggle: replace 0×0 anchor with a 44×44 `<Button size="lg" icon-only>`.

**Acceptance.** At 360 / 390 / 414 / 768 px viewports: zero horizontal scroll (`scrollWidth === clientWidth`); every interconnector value is visible without panning; theme toggle is tappable (≥44 px).

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.1 mobile foundation pass — concrete viewport-mockup + interconnector-drawer recipe ready to implement.

---

### P1-2 · KPI ticker reflow

**Current.** 6 columns squeezed into ~410 px → labels and values both wrap to 2 lines.

**Designer.** Below 720 px: 2 rows × 3 columns. Below 520 px: horizontal scroll snap. Each tile keeps min-width 100 px.

**Developer.**
```css
.kpi-ticker { display: grid; gap: 12px; grid-template-columns: repeat(6, 1fr); }
@media (max-width: 900px) { .kpi-ticker { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 520px) { .kpi-ticker { grid-auto-flow: column; grid-auto-columns: minmax(120px, 1fr); overflow-x: auto; scroll-snap-type: x mandatory; } .kpi-ticker > * { scroll-snap-align: start; } }
```

**Acceptance.** No tile wraps its label or its value text at any of 360 / 414 / 768 / 1024 / 1440 px.

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.1.

---

### P1-3 · Touch targets & native press feedback

**Current.** 2h/4h pills 32×25 px; LT/LV/EE 32×25 px; FCR 39×25 px; "Reading this card" 19 px tall. `-webkit-tap-highlight-color: rgba(0,0,0,0)` on every button with no `:active` substitute. Buttons have `transition: all` (anti-pattern).

**Designer.** All interactive controls minimum 44×44 px on mobile. `:active` state = `transform: scale(.97)` + `opacity .85` for 80 ms (`--motion-instant`). Focus-visible ring 2 px `--accent`.

**Developer.**
```css
.btn, .pill, .toggle { min-block-size: 44px; min-inline-size: 44px; }
@media (pointer: fine) { .btn, .pill, .toggle { min-block-size: 32px; min-inline-size: auto; } }
.btn:active, .pill:active { transform: scale(.97); opacity: .85; transition: transform var(--motion-instant), opacity var(--motion-instant); }
.btn { transition: background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast); } /* not "all" */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

**Acceptance.** Every interactive element passes WCAG 2.5.5 (Target Size 44×44 on mobile). On real iOS Safari, taps produce a visible scale animation. No element uses `transition: all`.

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.1 (touch targets + transitions) + Phase 19 a11y MVP (focus-visible).

---

### P1-4 · Mobile breakdown bars collapse to 1 px

**Current.** DC block / BOS+civil / PCS / HV grid / EPC bars render as 1-px vertical lines.

**Designer.** On <720 px the breakdown becomes a vertical stack (one row per cost line) with a horizontal mini-bar that fills its row. Or convert to a sparkline-stacked bar.

**Developer.** Make the bar component responsive width-by-percentage instead of fixed pixel scale.

**Acceptance.** At 360 px viewport every cost line still shows a visually meaningful bar (≥40% of row width when value is meaningful).

**Depends on.** None.

**KKME phase mapping:** Phase 18.1.

---

### P1-5 · Smooth scroll & contained overscroll

**Current.** `scroll-behavior: auto`, `overscroll-behavior: auto`. Anchor-jump nav hard-cuts. iOS pull-to-refresh fires unintentionally during deep scrolls.

**Developer.**
```css
html { scroll-behavior: smooth; scroll-padding-top: 96px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { overscroll-behavior-y: contain; }
```

**Acceptance.** Clicking "Build" in nav animates over ~300 ms to the section. iOS test device: pull down at the top no longer triggers refresh during normal scrolling.

**Depends on.** None.

**KKME phase mapping:** Phase 18.1.

---

## P2 — Tactile / animation (week 2)

### P2-1 · Apply the dormant keyframes

**Current.** 11 keyframe animations defined (`pulse`, `shimmer`, `skeleton-shimmer`, `water-shimmer`, `live-pulse`, `cardFadeIn`, `hero-mount`, `hero-pulse`, `fadeOut`, `claude-pulse`, `tickerScroll`). Only `live-pulse` and `tickerScroll` actually run.

**Designer.** Apply these mounts:
- Hero mount: `hero-mount` 600 ms `--ease-standard` on first paint.
- Card mount: `cardFadeIn` 240 ms staggered 40 ms per card on viewport-enter.
- KPI value-change: count-up tween 240 ms.
- Skeleton: `skeleton-shimmer` while `data-loading="true"`.

**Developer.**
```tsx
// useCountUp.ts
function useCountUp(target: number, ms = 240) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current, to = target, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    prev.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
```

Use `IntersectionObserver` to add `data-mounted="true"` and trigger the card-fade keyframe.

**Acceptance.** Lighthouse Performance score does not drop below 85; visual regression suite shows fade-in on cards entering viewport; switching scenarios produces a count-up tween, not a hard cut. Honour `prefers-reduced-motion`.

**Depends on.** CC-1.

**KKME phase mapping:** Phase 18.3 (NEW — animation activation, candidate). Concrete useCountUp implementation provided.

---

### P2-2 · Chart tooltips & crosshair

**Current.** 15 SVG charts rendered, none have hover handlers, none have aria-labels, the sensitivity tornado has `pointer-events: none`.

**Designer.** Every chart gets:
1. A vertical crosshair line on hover (mobile: drag).
2. A tooltip card showing X label + every series value + delta.
3. An accessible summary as `aria-label` (e.g. "30-day price distribution: mean €113, P90 €203, max €218").
4. A small "📋 Copy data" affordance in the chart header.

**Developer.** Build `<ChartFrame>` (CC-2) wrapping any SVG with a transparent overlay `<rect>` capturing pointer events, computing nearest-x via binary search. Use the same component for every chart so tooltip styling is uniform. Remove `pointer-events: none` from the tornado.

**Acceptance.** Every visible chart responds to hover/touch with a tooltip; every chart has a non-empty `aria-label`; QA test "tab into chart, press →/← keys" moves the focus marker.

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.2 (chart polish) + Phase 7.7g-b (Chart primitive). Tornado pointer-events fix is one-line.

---

### P2-3 · Copy-button feedback

**Current.** 📋 emoji button (18×22 px) with no tooltip, no success state.

**Designer.** Replace emoji with a 16-px clipboard icon. On click: 2-step animation — press scale + check-mark swap, plus a 1.5-second toast "Range copied".

**Developer.**
```tsx
<button onClick={async () => {
  await navigator.clipboard.writeText(formatRange());
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}} aria-label="Copy range" data-copied={copied}>
  {copied ? <CheckIcon/> : <ClipboardIcon/>}
</button>
```

**Acceptance.** Click triggers visual change within 100 ms, screen reader announces "Range copied".

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.3 (animation/feedback) or Phase 7.7g-b primitive integration.

---

### P2-4 · Card hover lift

**Current.** Cards are static.

**Designer.** Cards with drill-in (Returns, Build, Trading) get on hover: `translateY(-2px)` + `box-shadow: 0 8px 24px rgba(0,0,0,.18)` over 160 ms. Pure-display cards do not lift.

**Developer.** Use a `<Card interactive>` boolean prop driving a class.

**Acceptance.** Only cards with an `href`/`onClick` hover-lift. Reduced-motion users see no transform.

**Depends on.** CC-2.

**KKME phase mapping:** Phase 18.3 + Phase 7.7g-b Card primitive interactive prop.

---

## P3 — Typography & visual (week 2–3)

### P3-1 · Cut to two display families

**Current.** IBM Plex Mono (1,400 nodes), Newsreader serif (94), Unbounded display (46), system fallback (1).

**Designer.** Keep IBM Plex Mono for body/data and Newsreader for editorial headlines. Restrict Unbounded to the `KKME` wordmark only. Subset all fonts to Latin + ext-A; preload only Plex 400/500 and Newsreader 400.

**Developer.** Replace `<link rel="stylesheet">` with a self-hosted woff2 + preload pair. Drop Unbounded weights other than 400. Use `font-display: swap`.

**Acceptance.** Network panel shows ≤4 font files; total font weight <120 KB; Newsreader and Plex are the only families on >99% of nodes.

**Depends on.** CC-1.

**KKME phase mapping:** Phase 7.7g-a-3 (type scale + typography rationalization). Restrict Unbounded → wordmark only is a small surgical fix; can ship before broader 7.7g-a-3.

---

### P3-2 · Modular type scale audit

**Current.** 21 distinct sizes including 8.8, 9.6, 15.2, 17.6 px.

[Document was truncated in operator paste at this point. Subsequent P3-2 content + any P3-3+ / P4 / P5 sections to be collected when available.]

---

## How to use this spec

- **Phase prompt authors:** read the relevant CC-/P-section at scope time; the "KKME phase mapping" lines tell you which pre-decided design choices to copy verbatim into your prompt's §0 context block instead of re-deriving.
- **Discipline rule #1 still applies:** even though most claims are primary-source-with-citation tier, re-verify each via grep + screenshot before committing to a fix. Spec's empirical claim and current code state can diverge.
- **Discipline rule #5:** this spec is a reference document, not roadmap. Don't fold its sections into roadmap entries wholesale; let operator decide per-section which claims warrant phase scope.
- **Future spec updates:** if operator pastes more of this audit (P3-2 onward, P4, P5), append here in the same section structure. Don't fragment across multiple files.
