# KKME — Implementation Phases

Acceptance criteria for the full rebuild
The rebuild is successful only if all of these are true:
A first-time investor understands within 10 seconds what KKME is and what decision it helps make.
The page reads as one coherent narrative, not disconnected upgrades.
Signals are grouped into meaningful buckets with clear logic.
Structural drivers, competition, market design, and cost are separated cleanly.
The reference asset section becomes the translation layer instead of a promotional calculator.
Europe context is directional and credible, not a bragging leaderboard.
Market intelligence is curated and useful, not a raw feed.
The closing section is investor-first and high-trust.
Private intelligence improves interpretation without being dumped publicly.
The whole site feels like a serious infrastructure intelligence product, not a startup dashboard or a sales page.

One-line master instruction
Rebuild KKME as a coherent Baltic flexibility market intelligence platform centered on a 50MW reference asset, with a clear narrative from market regime to structural drivers, competition pressure, market design reality, cost direction, and reference asset economics, ending in an investor-first conversation CTA; prioritize credibility, data honesty, and premium clarity over visual noise, generic dashboards, or promotional tone.

Use this as the implementation-order prompt for Claude.

Read the full master architecture brief for KKME and implement the rebuild in a controlled sequence. Do not try to redesign and rewrite the whole site at once. The goal is to avoid chaos, regressions, and another visually polished but logically broken result.
Core implementation rule
Work in layers:
Information architecture first
Data/view-model structure second
Section skeletons third
Section content and charts fourth
Styling refinement fifth
Micro-interactions and polish last
Do not start with styling.
Do not start by tweaking old cards in place.
Do not preserve weak concepts just because components already exist.

Phase 0 — Audit and freeze
Goal
Understand what exists, what should be reused, and what must be rebuilt.
Tasks
Audit current page structure
Audit current component tree
Audit current data sources and current state flow
Identify which sections are:
reusable with refactor
partially reusable
should be deleted and rebuilt
Identify all places where:
business logic is mixed into presentation
labels are too insider-coded
stale/loading states are weak
cards are overloaded
Lithuania-only logic is falsely presented as Baltic-wide
Deliverable
Produce an internal build plan or code comments describing:
keep
refactor
rebuild
for every major section
Important
Do not make visual changes yet except if needed to inspect structure.

Phase 1 — Rebuild page-level architecture
Goal
Establish the correct page flow before improving individual sections.
Required page order
Implement or reorder the page into this sequence:
Hero / Market now
Revenue opportunity
Competition pressure
Structural market drivers
Market design & trading reality
Cost / bankability direction
Reference asset economics
Europe market map
Market intelligence
Closing CTA / conversation
Tasks
Build section wrappers and anchors
Establish a clean page grid and vertical rhythm
Normalize section headings, support copy, and metadata treatment
Remove or quarantine obsolete sections/cards that do not fit this architecture
Deliverable
A page with clean section placeholders/skeletons in the correct order, even before final content is wired
Important
This is where the site stops being “a pile of cards.”

Phase 2 — Build shared design and data primitives
Goal
Create reusable building blocks so the site stops reinventing logic in each section.
Required shared UI primitives
Build or normalize reusable components for:
Section header
Metric tile
Status / impact chip
Freshness / confidence badge
Compact source line
Expandable details block
Card shell
Pinned strip item
Intelligence card
Comparison card
Empty / stale / degraded state
Small thumbnail / source visual
Axis labels / chart legends
Tooltip or info disclosure
Required shared logic primitives
Build reusable handling for:
impact states:
strong positive
slight positive
mixed
slight negative
strong negative
low confidence
data classes:
observed
derived
modeled
proxy
reference
freshness classes:
live
recent
stale
reference
geography classes:
Baltic blended
LT-led
connected-market
Europe reference
Deliverable
A small internal system of reusable UI/data primitives used by all later sections
Important
Do this before section-level rebuilds so the page gains consistency.

Phase 3 — Hero / Market now
Goal
Get the first screen right before anything else.
Why first
If the first screen is still weak, the whole site still reads weak.
Tasks
Refactor hero into a decision-oriented investor-facing opening
Remove poster-like centered layout
Move to stronger asymmetric layout if appropriate
Clarify value proposition, freshness, and current market state
Reduce top metrics to 4–5 only
Add immediate “what changed / what it means” layer
Add clear methodology / freshness note
Acceptance criteria
a first-time investor understands what KKME is in under 10 seconds
top screen is readable and credible
no unexplained jargon in primary labels

Phase 4 — Rebuild the core signal sections
Do these in this order.

Phase 4A — Revenue opportunity
Includes
Baltic price separation
Baltic balancing market
immediate monetization signals
Why this comes first
This is closest to the investor’s immediate question:
is the market monetizable now?
Tasks
Rebuild price separation card as single-story signal card
Rebuild balancing market card as market pressure + revenue support card
Ensure both cards show:
what changed
why it matters
impact on reference asset
clear freshness and confidence
Important
Do not overload with detailed breakdowns in primary view.

Phase 4B — Competition pressure
Includes
fleet pressure
pipeline pressure
timing pressure / COD wave
any future pipeline intelligence hooks
Why here
This is the natural counterweight to revenue opportunity.
Tasks
replace mystery bars and internal labels with clearer competition-pressure logic
keep queue/pipeline intelligence separate from grid-access card
use private dataset behind the scenes only for public-safe outputs
Important
This section should explain future revenue compression risk clearly.

Phase 4C — Structural market drivers
Includes
wind
solar
demand/load
interconnectors & connected markets
TTF
ETS
Why after competition
Because this is the slower “why” layer.
Tasks
completely replace the old Baltic power market row
remove DC power viability from this section
demote/remove Nordic hydro
make Sweden/Finland/Poland influence explicit in interconnectors card
add impact-on-reference-asset layer to every card
Important
This is a section rebuild, not a card cleanup.

Phase 4D — Market design & trading reality
Includes
balancing market usability
thinness / distortion
rule regime
confidence translation
Why now
Because after users see opportunity and drivers, they need to understand what is actually usable.
Tasks
build new standalone section
do not merge into structural drivers or balancing card
create the “posted price vs usable revenue” layer
add confidence implications for the reference asset
Important
This is the credibility section. Keep it calm and serious.

Phase 4E — Cost / bankability direction
Includes
project cost trend
driver buckets
public-data directional model
reference CAPEX / IRR / DSCR sensitivity
Why after market design
Because this is the other major non-revenue constraint on bankability.
Tasks
remove lithium-led placeholder logic
rebuild around full-project CAPEX direction
create driver decomposition
add tracked public signals
add reference asset sensitivity panel
Important
Keep LFP as core model, alternatives as secondary watchlist only.

Phase 5 — Reference asset economics section
Goal
Now that the market and credibility layers are in place, rebuild the economics section properly.
Why not earlier
If you do this before the upstream logic is clear, you will just create another flashy calculator.
Tasks
rebuild as Baltic reference asset economics console
fixed 50MW anchor
2H vs 4H comparison
base / conservative / stress
visible revenue mix
driver contribution waterfall
what changed strip
project IRR / EBITDA / DSCR primary
equity IRR secondary
confidence labels tied to upstream sections
Acceptance criteria
the section explains itself
revenue mix is visible
2H vs 4H is instantly comparable
outputs feel credible, not salesy

Phase 6 — Europe context section
Goal
Add directional positioning without breaking trust.
Tasks
replace ranking with 2-axis market map
add selected-market detail panel
add freshness per market
make Baltics highlighted subtly
keep other markets as recent/reference if not truly live
Important
This comes after the economics section because it is context, not the core argument.

Phase 7 — Market intelligence section
Goal
Turn the feed into a curated intelligence layer.
Tasks
rebuild as intelligence board
add pinned “this week’s market movers”
create card-based items
add thumbnail/source visuals
add why-it-matters, impact, horizon
rebuild filter system to match site architecture
support internal states: pinned, reviewed, watchlist, archived
Important
Do not leave this as a raw feed at any point after this phase.

Phase 8 — Closing CTA / conversation
Goal
Convert the site into actual investor-first conversation flow.
Tasks
remove broker-like deal-flow framing
rebuild as investor-first closing section
keep project-owner path secondary
use adaptive short form
add confidentiality/trust note
use premium CTA wording
Important
This should be implemented late because it depends on the overall tone of the rebuilt site.

Phase 9 — Cross-site polish and consistency
Goal
Only now refine visuals and interactions.
Tasks
tighten spacing
unify typography hierarchy
normalize chart sizing and padding
improve contrast and scanability
reduce dead space
remove leftover glow / fintech noise
add subtle motion only where it clarifies state change
review mobile and tablet responsiveness
fix footer / nav consistency
ensure each section still makes sense in isolation
Important