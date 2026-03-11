# PACK 2 — Competition and Buildability

overly optimistic default scenarios


Benchmark rule
The Clean Horizon benchmark can remain only as a contextual comparison.
It must be:
secondary

clearly labeled as external reference

not the framing device of the section

Do not let this section open with “against Clean Horizon” logic.
 Open with current Baltic reference asset economics.

Baltic framing rules
Move from Lithuania-first language to Baltics, but stay honest.
Where needed, explicitly label:
LT-led proxy

Baltic-calibrated reference

Lithuania signal used as regional directional input

Do not imply all values are equally Baltic-wide if they are not.

Revenue mix rules
Allowed categories:
FCR

aFRR

mFRR

Arbitrage

Optional only if grounded:
intraday as separate

Do not invent filler revenue categories.

Event-to-model rules
Every event must follow:
observed change

market interpretation

effect on model

Do not skip the middle step.

Macro-driver caution
Do not use weak macro signals casually.
Use caution with:
oil price as direct BESS driver

lithium as daily headline in this section

war headlines with deterministic revenue claims

Only include macro through real transmission mechanisms:
gas / thermal floor

logistics / CAPEX

volatility / interconnector stress

flexibility demand


Design rules
Overall feel
premium market console

restrained

editorial

serious

clear

Avoid
crypto dashboard look

hacker terminal look

startup landing page behavior

AI-fintech clichés

Layout
left-align content

strong grid

consistent spacing rhythm

one major chart + one secondary chart + compact event strip

no dense tables in the main body

Typography
no tiny labels

no washed-out low-contrast copy

large numbers only where earned

labels understandable to a smart outsider

Color
restrained palette

one accent

one positive

one negative

one warning

max 4 revenue colors plus neutral

Motion
Use animation only for:
case switch

2H/4H focus shift

chart transitions

delta updates

No decorative motion.

Engineering rules
Important
This section has been worked on for a long time.
 Do not patch the existing component blindly.
First do a structural audit
Inspect:
current Revenue Engine component tree

data dependencies

styling patterns

state location

what is reusable vs contaminated

Then decide:
refactor

or clean rebuild from new parent component

Prefer clean rebuild if entangled.
Suggested component structure
ReferenceAssetSection

ReferenceAssetHeader

ReferenceAssetControls

ReferenceAssetTopSummary

ReferenceAssetSummaryRow

DurationComparisonCards

RevenueMixChart

DriverImpactWaterfall

MarketEventsRail

DataConfidenceStrip

MethodologyDrawer

Do not keep everything in one monolithic component.
State model
Keep state minimal:
duration: 2h | 4h

case: base | conservative | stress

cod: 2027 | 2028 | 2029

capexMode: live | low | mid | high

Derived outputs should come from one memoized selector layer.
View-model shape
Use a normalized section view model.
Conceptually:
type ReferenceAssetViewModel = {
 config: {...},
 topSummary: {
   netDirection: 'improving' | 'tightening' | 'mixed'
   mainDriver: string
   favoredDuration: '2h' | '4h' | 'mixed'
 },
 summary: {
   projectIrr: number,
   projectIrrDelta7d: number,
   projectIrrDelta30d: number,
   ebitdaPerMw: number,
   ebitdaDelta7d: number,
   ebitdaDelta30d: number,
   minDscr: number,
   minDscrDelta7d: number,
   minDscrDelta30d: number,
   hurdleStatus: 'pass' | 'borderline' | 'fail',
   equityIrr?: number
 },
 comparison: {
   twoHour: {...},
   fourHour: {...}
 },
 revenueMix: {
   twoHour: RevenueSegment[],
   fourHour: RevenueSegment[]
 },
 driverImpact: DriverContribution[],
 events: MarketEvent[],

It is a market interpretation card.
It should explain one simple story:
When Baltic prices detach from nearby markets, storage arbitrage may improve — but the signal needs context, not just a raw spread number.

Problems to fix
card is too tall with too much dead space
chart is too small and decorative
too many tiny low-priority stats are visible
BESS capture is too insider-coded
Explain / Data buttons clutter the card
significance of the main spread number is unclear
the card is not clearly tied back to the reference asset

Rebuild with this hierarchy
1. Header
Title:
Baltic price separation
Subtitle:
How far Baltic day-ahead prices are diverging from nearby markets. Wider spreads can improve storage arbitrage.
Add a small methodology qualifier if needed:
Lithuania-led Baltic proxy
or similar, if the signal is primarily LT vs SE4
Do not imply perfect Baltic-wide symmetry if the signal is LT-led.

2. Main metric
Show one large spread number, for example:
+0.5 €/MWh
Under it show:
comparison label, e.g. Today vs SE4
one status tag derived from stable thresholds and recent baseline:
Weak
Neutral
Slightly supportive
Supportive
The tag must be based on real threshold logic, not decorative copy.

3. Hero chart
Make the chart the main visual element.
Requirements:
clean 30D line chart for spread history
clear zero line
current point highlighted
optional faint 30D average or median reference line
enough size to actually show whether today is unusual
no tiny sparkline pretending to be a chart
The chart must answer:
stable or unstable?
above or below normal?
recent spike or not?

4. Supporting metrics row
Show only 3 supporting metrics:
Battery arbitrage capture
30D median spread
30D percentile or similarly strong contextual metric
Do not show all of these in the main body:
trend
LT avg
SE4 avg
raw spread table
timestamps
model notes
tomorrow preview
Keep the main card minimal.

5. Reference asset impact line
Add one short line explicitly translating the signal into the reference asset logic.
Examples:
Reference asset impact: slightly positive for 2H and 4H arbitrage
Reference asset impact: positive, but not an exceptional spread regime
This is required so the card fits the overall site architecture.

6. Interpretation line
Add one plain-language interpretation sentence.
Example:
Baltic spreads are slightly positive today, keeping arbitrage open but not exceptional.
This should sit below the supporting metrics, not buried in footnotes.

7. Footer
Use a compact source/freshness line only.
Example:
Source: ENTSO-E A44 · Updated 04:00 UTC
Keep footer clean and small.

Move into collapsible details
Hide these from the default main card view:
LT avg
SE4 avg
spread breakdown table
model input mapping
tomorrow DA preview
raw publication notes
methodological detail on capture calculation
Put them in a clean details drawer or expand area.

Rename for clarity
BESS capture → Battery arbitrage capture
In methodology/details, clarify that this is:
a day-ahead directional arbitrage metric
likely derived from top/bottom price spread logic
net of RTE if that is true
not the same as guaranteed realized project revenue
Do not leave the term ambiguous.

Visual rules
remove Explain and Data from the primary layout
reduce nested-box feeling
increase internal padding
left-align content
remove decorative dead space
no tiny unreadable labels
no debug-panel styling
no false sense of precision through tiny dense text
This card should feel editorial, premium, and readable.

Data / logic rules
be explicit about the benchmark used
main number must have context, not just raw value
status tag must use stable threshold logic tied to recent norm
keep the default card understandable to a smart outsider
round sensibly; avoid debug-style precision in the primary view
If the signal is LT-led but used as Baltic directional context, say so honestly.

Acceptance criteria
The rebuild succeeds only if:
the chart is clearly the hero
only 3 supporting stats remain visible
the main spread number is understandable with a status label
the card explains why the signal matters for storage
the card clearly connects to the 50MW reference asset
the card no longer feels cramped, terminal-like, or debug-oriented

One-line instruction
Rebuild the current Baltic Price Separation card as a single-story market signal card with one large spread metric, one large 30D history chart, three supporting stats, a clear status label, a short interpretation line, and an explicit reference-asset impact note; move all low-priority breakdown data into a collapsible details layer and keep the framing honest if the signal is LT-led rather than fully Baltic-wide.

KKME — Rebuild the Balancing Stack / S2 card


Objective
Refactor the current S2 card into a cleaner market pressure + revenue support card.
The card must answer in one glance:
Is the Baltic balancing market still supportive for storage revenues?
How much competitive pressure is coming from new BESS fleet?
What does that mean for the 50MW Baltic reference asset?
Do not preserve the current card as a denser analyst widget. Simplify it.

Core concept
This card is not a raw balancing dashboard.
It is a market support card that explains whether the Baltic balancing market is still monetizable and how fast competition is starting to compress that opportunity.
It should sit inside the site as part of revenue opportunity, while the deeper liquidity / distortion logic lives later in Market Design & Trading Reality.

Problems to fix
too many tiny numbers and labels fighting for attention
0.65 S/D COMPRESS is too internal and cryptic
fleet list is too detailed for the default card
aFRR / mFRR bars are hard to interpret
revenue numbers float without enough context
right-side chart is weak and unclear
P90 imbalance spike and extra footnotes overload the card
Explain / Data buttons clutter the layout
overall card feels like a compressed terminal instead of a clear signal

Rebuild with this hierarchy
1. Header
Title:
Baltic balancing market
Subtitle:
How supportive reserve and balancing markets are for storage, and how fast rising battery competition is starting to compress them.
If needed, add a small qualifier:
Baltic blended view with LT-led signal depth
Do not imply perfect uniformity across all Baltic markets if the underlying depth is not fully symmetric.

2. Main signal
Replace the current 0.65 S/D COMPRESS treatment with a clearer primary block.
Show:
large main number: e.g. 0.65x
label: Battery competition vs balancing demand
one plain-language status tag:
Supportive
Tightening
Competitive
Compressed
Do not use COMPRESS as the user-facing state.
Add one short interpretation line, for example:
Battery competition is rising, but the balancing market still supports meaningful storage revenues.

3. Two key revenue outputs
Keep only two prominent revenue outputs visible:
aFRR reference
mFRR reference
These must be clearly labeled.
If the numbers represent modeled or annualized values, label them explicitly, for example:
Indicative annual revenue per MW
Modeled reference value
Reference annualized support
---
## Screenshots of Current State
Upload the corresponding screenshot images alongside this pack for visual reference.
Relevant screenshots: screenshot_03.png (COD/Market Pressure), screenshot_08.png (Grid)
