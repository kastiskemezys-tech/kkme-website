# KKME Interaction Architecture

Canonical rules for how the site behaves, not how it looks.
Every section rebuild must pass against this document.

---

## 1. Core interaction principles

1. Default visible layer must stay concise. Show only what answers: what is this, why it matters, what it says now, what it means for the reference asset.
2. Core meaning must never depend on hover alone. Hover may enhance, never gate.
3. Supporting detail appears on explicit click/expand. The user opts in.
4. Methodology and caveats live one layer deeper than supporting detail.
5. Anything styled as clickable must do something. No decorative pointers, underlines, or teal-colored text that goes nowhere.
6. Anything that does nothing must not look interactive. No pointer cursors on static labels, no hover effects on inert elements.
7. Interactions must reduce cognitive load, not increase it. If adding an interaction makes the section feel busier, remove it.
8. Mobile behavior is first-class, not a degraded fallback. Every interaction must work on touch without workaround.
9. Motion explains state change, not decorates. Rotation on expand, fade on content reveal, slide on drawer open. Nothing loops except the LIVE pulse.
10. One primary action per surface. A card has one detail trigger. The hero has one CTA. A nav item has one target.

---

## 2. Information layers

Every section on the site organizes content into three mandatory layers and one optional layer.

### Layer A: Fast scan (default visible)

What belongs here:
- Section/card title and one-line subtitle
- Hero metric with unit and geography qualifier
- Status tag (plain-language state)
- One interpretation sentence
- Primary visualization (chart, bar, map)
- Reference-asset impact line
- Source/freshness footer
- One detail trigger ("Signal detail and methodology")

What must NOT belong here:
- Methodology explanations
- Supporting/secondary metrics (unless 1-2 that directly reinforce the hero)
- Fleet lists, price comparison tables, raw data grids
- Disclaimers, caveats, data provenance notes
- Multiple competing CTAs

Typical UI: Card body with visible content, collapsed DetailsDrawer at bottom.

### Layer B: Expanded detail (inline drawer)

What belongs here:
- Supporting metrics (arbitrage capture, median spread, percentile, capacity references)
- Price breakdown tables
- Fleet composition lists
- Comparison data (vs CH benchmarks, vs prior period)
- Tomorrow/forward-looking previews
- Section sub-labels (e.g., "Price detail", "Fleet composition", "Supporting metrics")

What must NOT belong here:
- The hero metric (that's Layer A)
- Interpretation text (that's Layer A)
- Full methodology write-ups (that's Layer C)

Typical UI: DetailsDrawer with organized sections and compact section labels.

### Layer C: Methodology and trust

What belongs here:
- Data source details and update frequency
- Calculation methodology and assumptions
- Data classification explanation (why proxy vs observed)
- Known limitations and caveats
- Links to external data sources

What must NOT belong here:
- Live data values (those belong in A or B)
- Interpretation or recommendations
- Marketing copy

Typical UI: Bottom section of DetailsDrawer, below a "Methodology" label. Or a dedicated methodology link/page for complex sections.

### Layer D: Deep analysis (optional, future)

What belongs here:
- Dedicated signal page with full history
- Downloadable data or methodology PDF
- Interactive scenario explorer
- Multi-year trend analysis

Typical UI: Separate route (/signals/s1, /methodology), linked from Layer C.

---

## 3. Allowed interaction patterns

### Standard patterns (use these)

**Anchor-scroll navigation**
StickyNav links scroll smoothly to section anchors. Every nav item maps to a real DOM element. Dead links are hidden, not disabled.

**Card-level details drawer**
One DetailsDrawer per card, triggered by a single text button. Contains Layer B + Layer C content organized with section labels.

**Compact tooltip**
For term clarification, acronym expansion, or short caveats only. Must show on hover AND focus (keyboard accessible). Must not contain essential information. Max ~30 words.

**Chart hover inspection**
Lightweight value readout on chart hover. Native `title` attributes for simple cases, custom tooltip overlay for rich charts. Falls back cleanly on mobile (values shown in drawer or static labels).

**Active nav state**
StickyNav highlights the current section based on scroll position. Uses IntersectionObserver, not scroll offset calculations.

**Source/method detail**
Source footer text may link to the methodology section within the same card's DetailsDrawer. One click to reach trust details from any visible data point.

### Prohibited patterns (do not use without explicit approval)

- **Tabs within cards.** Cards are single-story. Use drawer for depth, not tabs for branching.
- **Nested accordions.** One level of expand/collapse per card. Never accordion-inside-accordion.
- **Tooltip-dependent core meaning.** If removing all tooltips breaks understanding, the Layer A design is wrong.
- **Fake clickable cards.** A card that looks like a link but has no destination. If a card should be clickable, it must go somewhere.
- **Modal overlays.** No modals for data display. Modals only for destructive confirmations (e.g., form submission).
- **Hover-only disclosure.** Any content gated behind hover must also be accessible via click/tap or visible in the drawer.
- **Infinite scroll / lazy-load sections.** All sections render on page load. Progressive enhancement for data, not for layout.
- **Toggle switches for view modes.** No Explain/Data toggles, no "simple/advanced" view switches. One default view with one depth path.

---

## 4. Hero interaction rules

The hero (HeroMarketNow) is the orientation surface. It routes and frames, it does not analyze.

1. **One primary CTA.** Ghost-style, scrolls to the first content section. Text: contextual ("View signals", "See the numbers"). Not "Submit" or "Contact."
2. **Market Now card is read-only by default.** One subtle detail action maximum (e.g., expand methodology). No interactive controls, no toggles, no scenario pickers.
3. **Hero metrics do not link to individual sections** unless the mapping is unambiguous and tested. A wrong anchor is worse than no anchor.
4. **Source/freshness line may open trust detail** if a simple expand mechanism exists. Otherwise, it stays static.
5. **No competing actions.** If the CTA says "View signals", there should not be a second button saying "Contact us" at equal visual weight.
6. **Hero loads fast.** Data fetching must not block initial render. Show structure immediately, populate data when ready.

---

## 5. Signal card interaction rules

Signal cards (S1-S9 and future equivalents) are the evidence layer. Each tells one story.

1. **Default view = Layer A only.** Title, hero metric, status, chart, interpretation, impact line, source footer. That is the card.
2. **One detail trigger per card.** Text: "Signal detail and methodology" or section-specific variant. Styled as font-xs, text-tertiary, with pointer cursor.
3. **Supporting metrics move to Layer B** (inside DetailsDrawer) unless they are essential to the hero's story. "Essential" means: removing them makes the card's conclusion unclear.
4. **Fleet lists, price tables, methodology notes = Layer B/C.** Never visible by default.
5. **Tooltips allowed for:**
   - Acronym expansion (e.g., "aFRR" → "automatic Frequency Restoration Reserve")
   - Data class explanation (e.g., "proxy" → "Baltic-calibrated estimate, not observed clearing price")
   - Short caveats (e.g., "net of 87% round-trip efficiency")
   - Maximum 30 words per tooltip.
6. **Charts support hover inspection when feasible.** Native `title` attributes on chart elements as minimum. Custom tooltip overlay as enhancement. If hover requires >30 minutes of implementation, skip and note it.
7. **Interpretation line stays in Layer A.** It is the plain-language bridge between the number and the reference-asset impact. Never hide it.
8. **Reference-asset impact line stays in Layer A.** It anchors every signal to the 50MW throughline. Never hide it.
9. **DetailsDrawer content is organized with section labels.** Use uppercase mono labels: "Supporting metrics", "Price breakdown", "Fleet composition", "Methodology". Not just a wall of text.

---

## 6. Navigation rules

1. **Every visible nav item goes to a real section.** Check DOM existence on mount. Hide items whose target does not exist.
2. **Anchor scrolling uses `scrollIntoView({ behavior: 'smooth' })`.** Prevent default on anchor clicks. Do not use `window.scrollTo` with manual offset math.
3. **Active section highlight.** Use IntersectionObserver with `threshold: 0.3` or similar. Highlight the nav item whose section occupies the most viewport space.
4. **Section IDs are stable.** Once a section has an ID (e.g., `#revenue-drivers`, `#build`, `#conversation`), do not rename it without updating all references including StickyNav, hero CTAs, and any internal links.
5. **Nav CTA is ghost-style.** The StickyNav "Get in touch" button uses outline/ghost styling (border: var(--border-card), color: var(--text-tertiary)). Not amber, not filled.
6. **KKME wordmark in nav scrolls to top.** `scrollTo({ top: 0, behavior: 'smooth' })`.

---

## 7. Clickability and affordance rules

1. **`cursor: pointer` only on actionable elements.** Buttons, links, drawer triggers, interactive chart elements. Never on static text, labels, or decorative elements.
2. **Hover states are subtle but clear.** Text brightens from text-tertiary to text-secondary. Borders may shift from border-card to border-highlight. No color changes, no scale transforms, no shadows.
3. **Focus states are visible.** All interactive elements must show a visible outline on keyboard focus. Use `outline: 1px solid var(--border-highlight)` as baseline.
4. **Clickable text looks intentionally actionable.** DetailsDrawer triggers use the `>` chevron prefix. Links use teal color. Buttons use border. There must be a visual signal beyond just the pointer cursor.
5. **Static labels must not look like links.** No teal color on non-clickable text. No underlines on non-clickable text. No pointer cursor on non-clickable text.
6. **Consistency over cleverness.** If DetailsDrawer triggers look one way in S1, they must look the same way in S2, S3, and every future card. Do not invent per-card interaction styles.

---

## 8. Density management rules

1. **Default view answers four questions only:**
   - What is this signal? (title + subtitle)
   - What does it currently say? (hero metric + status)
   - What does it mean? (interpretation line)
   - What does it mean for the reference asset? (impact line)
2. **Support evidence is allowed but subordinate.** A chart supports the hero. A fleet summary supports the S/D ratio. These stay in Layer A only if they directly reinforce the hero's story.
3. **Methodology is never default-dominant.** Data provenance, calculation notes, and caveats belong in Layer B/C. They exist for trust, not for scanning.
4. **If a card feels text-heavy, move content down a layer before deleting it.** Information is valuable. Visibility is the problem, not existence.
5. **Preserve depth through disclosure.** The DetailsDrawer exists so that cards can be simultaneously simple (default) and deep (on demand). Use it aggressively.
6. **Three supporting metrics maximum in Layer A.** If a card needs more than 3 secondary data points visible by default, the card's story is too complex. Split or restructure.
7. **Section labels inside drawers.** When a drawer contains multiple content types (metrics + tables + methodology), separate them with compact uppercase labels. This prevents the "wall of text" feeling.

---

## 9. Mobile interaction rules

1. **No hover-dependent critical meaning.** Everything accessible via hover must also be accessible via tap, drawer content, or static labels.
2. **DetailsDrawer works on touch.** Tap the trigger to expand, tap again to collapse. No swipe gestures required.
3. **Tap targets >= 44px.** Buttons, drawer triggers, nav items must have at least 44px touch target height. Padding counts toward touch target.
4. **No horizontal overflow.** Cards, charts, tables, and drawers must fit within viewport width. Use responsive layouts, not horizontal scroll.
5. **Stacked sections preserve hierarchy.** On mobile, cards stack vertically. Section headers remain visible. The reading order must still make sense top-to-bottom.
6. **Charts resize responsively.** Sparklines and bar charts use `width="100%"` or parent-constrained sizing. Fixed pixel widths are not allowed.
7. **Nav collapses cleanly.** StickyNav may need a hamburger or truncated link set on narrow viewports. Do not let nav items wrap to multiple lines.
8. **Source/method interactions remain accessible.** DetailsDrawer trigger must be visible and tappable on mobile without scrolling horizontally.

---

## 10. Accessibility and trust rules

1. **Keyboard focus visible.** All interactive elements (buttons, links, drawer triggers) must show a visible focus indicator when navigated via keyboard.
2. **Interactive controls have clear labels.** DetailsDrawer buttons use descriptive text ("Signal detail and methodology"), not just icons.
3. **Data classification is understandable.** "Observed", "derived", "proxy", "modeled", "reference" must be self-explanatory or tooltip-explained. Do not use abbreviations without expansion available.
4. **Stale/fresh state is not color-only.** A stale badge must include text ("stale" or "last updated X hours ago"), not just a color change from green to amber.
5. **Trust details reachable in one click.** From any visible data point, the user can reach methodology/provenance within one interaction (open the card's DetailsDrawer).
6. **Screen reader considerations.** Section headings use semantic HTML (`h2`, `h3`). Cards use `article` elements. DetailsDrawer button uses `button` element (not styled `div`).
7. **Color is never the sole indicator.** Status (teal/amber/rose) is always paired with text labels ("Supportive", "Tightening", "Compressed").

---

## 11. Component mapping

How these rules translate to reusable UI patterns. These are naming suggestions for future implementation.

| Rule area | Suggested component | Purpose |
|---|---|---|
| Card depth | `DetailsDrawer` | Single expand/collapse per card. Already exists. |
| Section navigation | `StickyNav` / `SectionAnchorNav` | Smooth scroll + active state. Already exists (partial). |
| Active section tracking | `ActiveSectionTracker` | IntersectionObserver hook returning current section ID. |
| Term clarification | `MetricHelpTooltip` | Hover+focus tooltip for acronyms and short caveats. |
| Drawer organization | Section labels (not a component) | Uppercase mono labels inside DetailsDrawer. Convention, not component. |
| Source trust path | `SourceFooter` with optional `onMethodClick` | Footer that can open drawer to methodology section. Already exists (partial). |
| Chart inspection | Per-chart hover handler | Native `title` attrs or custom overlay. Not a shared component. |
| Compact secondary row | `MetricTile` at `size="compact"` | Already exists. Used inside drawers for Layer B metrics. |

---

## 12. Card implementation checklist (mandatory for every card)

Before considering a card done, verify ALL of these:

### Default state
- [ ] Default view has ≤9 elements (per strict list in CLAUDE.md "Card build rules")
- [ ] No supporting metrics visible in default view
- [ ] No methodology visible in default view
- [ ] No sublabels visible (except one critical exception per card)
- [ ] "derived"/"proxy" never appears as inline label text
- [ ] Interpretation is commercially specific, not technical
- [ ] Impact line uses "50MW reference asset:" format
- [ ] Card height ≤450px when closed (excluding chart)

### Drawer state
- [ ] Drawer content grouped with uppercase subheads
- [ ] 24px gaps between groups
- [ ] Three hierarchy levels (evidence > notes > methodology)
- [ ] No divider-line overuse (max 1)
- [ ] If >4 groups, least critical is in nested drawer

### Interaction
- [ ] Drawer trigger uses standard wording ("View signal breakdown" / "View market detail")
- [ ] Card title opens drawer on click
- [ ] Source footer opens drawer on click
- [ ] All clickable elements have cursor: pointer + hover feedback
- [ ] Nothing looks clickable that isn't

### Copy
- [ ] All labels readable by outsider investor
- [ ] No insider abbreviations in default view
- [ ] Interpretation passes the "3 seconds" test
- [ ] No AI-smell phrases ("supports returns", "requires revalidation")

---

## 13. Section build checklist

Every section must pass this checklist before it is considered done.

- [ ] **Layer A is concise.** Default view answers: what, why, what now, what it means for reference asset.
- [ ] **One detail path.** There is exactly one obvious way to see more (DetailsDrawer or equivalent).
- [ ] **No hover-gated essentials.** Removing all hover states does not break understanding.
- [ ] **Clickable = actionable.** Every element with pointer cursor does something on click.
- [ ] **Source/method reachable.** Data provenance is accessible within one interaction from the card.
- [ ] **Mobile valid.** Card renders correctly on 375px viewport. Touch interactions work. No horizontal overflow.
- [ ] **Calmer, not busier.** The section feels less cluttered after interaction design, not more.
- [ ] **Drawer organized.** If DetailsDrawer has >2 content types, they are separated with section labels.
- [ ] **Consistent with other sections.** Interaction patterns match the rest of the site. No one-off inventions.
- [ ] **Keyboard accessible.** All interactive elements reachable and operable via keyboard.
