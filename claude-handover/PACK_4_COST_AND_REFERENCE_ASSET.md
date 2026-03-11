# PACK 4 — Cost and Reference Asset


## Project Cost Trend

KKME — Rebuild the current BESS Cost Stack into a Project Cost Trend module

Objective
Delete the current lithium-led cost stack card and rebuild it as a public-data-first Project Cost Trend module for Baltic utility-scale LFP BESS.
This module must answer:
Is full-project Baltic BESS CAPEX drifting up, down, or flat?
What is causing the move?
Which drivers are fast-moving versus slow-moving?
What does that mean for the 50MW Baltic reference asset?
This is not a live turnkey quote engine.
It is a directional cost-pressure module tied back to the reference asset.

Section title
Project cost trend
Subtitle
How battery supply, freight, financing, and electrical scope are shifting delivered Baltic utility-scale LFP BESS CAPEX.

Core product logic
This module tracks full project cost direction, not one commodity and not a fake current quote.
It should help an investor or developer understand:
whether procurement conditions are improving or worsening
which drivers matter most right now
whether the move is battery-led, freight-led, financing-led, or local electrical/EPC-led
what that means for the 50MW reference asset
It is not for:
precise real-time turnkey quote simulation
public disclosure of proprietary supplier intelligence
overfitting to one commodity
mixing LFP, sodium-ion, and other chemistries into one number

Required module structure
1. Top summary strip
Show one clean top-line conclusion:
Project cost trend: Improving / Flat / Worsening
30D move
90D move
one short explanation
Example:
Project cost trend: Slightly improving
Battery oversupply still offsets freight and electrical cost pressure
Also include:
confidence level
freshness note
This is the top-line conclusion, not lithium.

2. Driver decomposition
Show the main physical project cost buckets for the 50MW reference asset:
Battery system / DC block
PCS / inverter / transformer / electrical
Freight & logistics
BOS / civil / installation
Grid / HV connection allowance
Show financing pressure separately as a companion influence, not as if it were physical CAPEX.
Preferred visual:
ranked horizontal bars
or
clean decomposition stack
For each driver show:
direction: up / flat / down
confidence: high / medium / low
update class: live / recent / reference
Important:
These are driver buckets, not fake live project quotes.

3. What moved recently
Add a compact recent-move summary panel.
Examples:
Battery supply pressure: improving
Freight: slightly worse
Financing: unchanged
Electrical scope: still sticky
This should make the module feel current and readable without overloading the chart.

4. Tracked signals panel
Show the tracked public inputs feeding the module.
Split into two groups:
Fast / recent signals
lithium carbonate direction
China → North Europe freight direction
Euribor / financing direction
public ESS oversupply / manufacturing pressure signals
public transformer / electrical market pressure if grounded
Slow / structural signals
turnkey system benchmark direction
EPC / BOS pressure
grid / HV allowance direction
public tender or award hints
benchmark / industry report direction
Do not pretend all of these update daily.
This panel should show:
direction
freshness
confidence
source note if useful

5. Reference asset sensitivity
This bottom block is mandatory and must show:
Reference CAPEX range
Project IRR impact
Min DSCR impact
Display:
Reference CAPEX range: €X–Y/kWh
30D move: +/- %
Project IRR impact: +/- X.Xpp
Min DSCR impact: +/- X.XXx
Rules:
keep it simple
do not turn it into a sensitivity matrix
use conservative rounding
clearly tie it to the 50MW reference asset assumptions
if data is directional, present this as:
Indicative
Modeled sensitivity
not as hard observed fact
Suggested copy:
For the 50MW Baltic reference asset, recent cost pressure has shifted the indicative CAPEX range and slightly changed both return and bankability metrics.

Chemistry / technology handling
Main tracked chemistry
LFP utility-scale BESS only
Secondary watchlist
Add a small secondary watchlist only:
sodium-ion
flow / LDES
other emerging technologies
Purpose:
show technology direction without contaminating the LFP cost model.
Example:
Technology watch: Sodium-ion pricing improving, but not yet a primary input to Baltic utility-scale LFP reference assumptions.
This must remain visually minor.

Data rules
Public-data-first
Use only public, scrapeable, or benchmarkable signals.
Battery system pressure
Possible inputs:
lithium carbonate direction
public LFP cell / pack benchmark direction
Chinese ESS manufacturing oversupply / undersupply signals
public tender / award / trade references
Freight / logistics pressure
Possible inputs:
China → Europe freight direction
shipping disruption indicators
freight indices
Financing pressure
Possible inputs:
Euribor / ECB rates
inflation if relevant
Electrical / EPC pressure
Possible inputs:
public transformer / electrical equipment stress
copper only as secondary context
BOS / EPC directional notes
Important caution
Chinese internet / industrial sources may inform direction, but must not be treated as validated benchmark pricing automatically.
Use them to support:
direction
confidence
sourceNote
Do not surface them as hard price truth unless verified.

Scoring / normalization approach
Do not compute a fake “true live turnkey CAPEX.”
Instead create a cost pressure framework.
For each driver:
direction score
confidence
freshness
source note
Example:
type CostDriver = {
  id: string
  label: string
  direction: 'down' | 'flat' | 'up'
  magnitude: number
  confidence: 'high' | 'medium' | 'low'
  updateClass: 'live' | 'recent' | 'reference'
  lastUpdated: string
  sourceNote: string
}

Then derive:
overall project cost trend
reference CAPEX range shift
IRR sensitivity
DSCR sensitivity
Do not expose formulas on the card.

Remove from the current card
lithium placeholder as hero
broken feed dominating the card
static cost stack pretending to be dynamic
tiny hardcoded cost lines without context
debug-style notes in the main body
oversized emphasis on ECB pills
unexplained fixed total installed number

Visual rules
remove Explain / Data
strong hierarchy
top summary first
driver chart second
tracked signals third
reference asset sensitivity last
no dense debug-panel feel
no fake precision by tiny text
no giant static commodity placeholder

Acceptance criteria
This rebuild succeeds only if:
a visitor understands this is about full project cost direction, not lithium alone
the module shows drivers, not just one weak feed
the module clearly separates physical cost drivers from financing/context
the module ties cost movement back to the 50MW reference asset
the module clearly separates LFP core model from technology watch
the module remains credible even when some inputs are only directional or low-frequency

One-line instruction
Delete the current lithium-led cost stack and rebuild it as a Project Cost Trend module for Baltic utility-scale LFP BESS, focused on directional full-project CAPEX pressure, visible driver buckets, recent move summaries, tracked public signals, and a reference asset sensitivity block showing indicative CAPEX range plus IRR and DSCR impact.

## Reference Asset Economics (Revenue Engine rebuild)

KKME — Rebuild the Revenue Engine into a Baltic Reference Asset Economics section

Objective
Replace the current IRR-calculator-style block with a Baltic reference asset economics console.
This section must explain, not just calculate.
It must answer:
How are current Baltic market conditions affecting storage economics right now?

Is 2H or 4H more attractive under current conditions?

Where does the revenue come from?

What changed over 7D / 30D and how did that affect returns?

Which parts are observed, proxied, derived, or modeled?

This should feel like a premium market-intelligence surface, not a homemade calculator, pitch-deck screenshot, or AI-generated dashboard.

Concept shift
Old behavior
user picks scenario

model prints large IRR numbers

benchmark sits on top

causality is hidden

revenue mix is buried

optimistic outputs dominate

New behavior
fixed Baltic reference asset

2H and 4H directly comparable

base / conservative / stress visible

revenue mix visible

recent market changes translated into economics

confidence and data quality exposed

credibility prioritized over configurability

This section is not primarily a calculator.
 It is the economics translation layer for the site.

Reference asset defaults
Use a fixed public reference asset for comparability:
Power: 50 MW fixed

Duration: 2H / 4H

Region: Baltics

Default case: Base

Case toggle: Base / Conservative / Stress

COD toggle: 2027 / 2028 / 2029

CAPEX mode: Live / Low / Mid / High

Duration definitions:
2H = 50MW / 100MWh

4H = 50MW / 200MWh

Important
Do not expose freeform MW/MWh input boxes at the top.
 Too many inputs make the section feel arbitrary, cheap, and non-comparable.

Section purpose
This section should sit as the point where the whole site resolves into:
market regime

competition pressure

structural drivers

market design reality

cost direction

→ into one understandable reference asset view.

Required UI structure
1. Section header
Use a clear title and support copy.
Title:
 Baltic reference asset returns
Support copy:
 Track how spreads, reserve markets, fleet buildout, interconnectors, renewables, market design, and financing conditions are changing Baltic storage economics.
Metadata row:
Region: Baltics

Asset: 50MW

Inputs: observed + proxy + modeled

Methodology

2. Top summary strip
Before detailed controls or charts, show one compact summary of what the market is doing to the reference asset.
Must include:
Net direction: improving / tightening / mixed

Main driver

Which duration is favored now: 2H / 4H / mixed

Example:
Net effect: slightly negative vs 30D

Main driver: reserve compression from new fleet

Current edge: 2H

This should be the first read, not giant raw IRRs.
3. Control strip
Compact, one-row, disciplined.
Controls:
Duration: 2H | 4H

Case: Base | Conservative | Stress

COD: 2027 | 2028 | 2029

CAPEX: Live | Low | Mid | High

Optional:
Use current market state badge

Rules:
no pill explosion

no oversized segmented controls

no more than one row on desktop

no decorative icons

4. Summary row — top outputs
Display 4 primary outputs:
Project IRR

EBITDA / MW / yr

Min DSCR

Hurdle status

Display 1 secondary output:
Equity IRR — visibly demoted

For primary outputs show:
current value

7D delta

30D delta

tiny helper label

Examples:
Project IRR

14.8%

7D: -0.3pp

30D: -1.2pp

Rule
Do not make equity IRR visually equal to project IRR.
5. 2H vs 4H comparison block
This is a core visual and must stay visible at the same time.
Render two side-by-side comparison cards:
50MW / 2H

50MW / 4H

Each card must show:
Project IRR

EBITDA / MW / yr

Min DSCR

Revenue mix mini-visual

One short interpretation line

Examples:
More reserve-driven, lower CAPEX intensity

More spread-sensitive, stronger deep-volatility capture

Rule
Do not force the user to toggle just to compare 2H and 4H.
6. Revenue mix visual
This is mandatory and one of the primary visuals.
Show the current revenue composition using:
FCR

aFRR

mFRR

Arbitrage

Only add intraday separately if it is truly grounded. Otherwise keep it inside arbitrage.
Preferred layout:
one stacked bar for 2H

one stacked bar for 4H

Optional comparison:
current vs 30D average
 or

base vs conservative

For each segment show:
label

share %

restrained color

absolute contribution on hover or inline legend

Rules:
readable without hover

no donut/pie chart

no rainbow palette

no more than 5 revenue colors

7. Driver impact chart
Build a waterfall / contribution bridge chart showing how recent changes moved returns.
Best output:
contribution to Project IRR in pp

Suggested factors:
arbitrage spreads

FCR pricing

aFRR pricing

mFRR pricing

fleet pressure / supply-demand compression

CAPEX trend

rates / financing

optional interconnector / renewables effect if already translated upstream

Example:
Arbitrage +0.8pp

aFRR -1.1pp

Fleet pressure -0.9pp

CAPEX +0.4pp

Rates -0.2pp

Net -1.0pp

Rules:
no fake precision

round sensibly

label period basis clearly (vs 30D avg or similar)

8. “What changed” event rail
This bridges news and economics.
Show 3–5 recent items only.
 Each item must include:
event title

observed move

why it matters

direction of impact

Examples:
LT–SE4 spread widened

+18% vs 30D avg

Supports arbitrage capture

Positive for 4H

Other valid event types:
Baltic wind share changed

new BESS MW committed

NordBalt / EstLink / LitPol shift

TTF moved higher

Rules:
not a generic news feed

only events tied to model logic

every item must map:

observed change

interpretation

model effect

9. Data confidence strip
Mandatory.
Show visible quality classes for the section:
Observed

Proxy

Derived

Manual

Examples:
Arbitrage capture: Observed / Derived

aFRR reference: Proxy

Fleet pressure: Manual + Derived

CAPEX live mode: Market-informed / Manual

Rules:
users must see what is hard data vs modeling

do not bury this only in methodology


Public-facing tone rules
This section must default to conservative credibility, not upside marketing.
Requirements
Base case should be realistic, not promotional

Conservative case should be genuinely harsher

Stress case should be visibly uncomfortable but plausible

Do not default to the highest-return scenario

Do not let big numbers dominate before explanation

Remove from prominence
giant equity IRR hero

thin benchmark strip pretending to validate everything

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
 confidence: ConfidenceItem[]
}
Chart components must not derive business logic themselves.

Fallback / stale-data rules
This section must degrade gracefully.
Required
last good value retention where reasonable

stale badge if source is old

section still readable if one feed is missing

charts remain structured where possible

confidence strip reflects degraded state

Bad
—

Fetching...

Computing...
 everywhere

Good
Awaiting fresh balancing reference

Using last confirmed value

Stale

Partial update


Content rules
Rename wherever needed:
capture → arbitrage capture

S/D → supply / demand

grid free → indicative grid capacity

No unexplained acronyms in primary labels unless standard and tooltipped.

Do not do
do not keep giant equity IRR as hero

do not expose freeform scenario inputs at top

do not bury revenue mix in a small table

do not add decorative widgets

do not overuse glow / gradients

do not hide data quality

do not imply Baltic-wide coverage where the number is only LT without disclosure


Acceptance criteria
The rebuild is successful only if:
A new visitor understands within 10 seconds:

this is a Baltic reference asset

2H and 4H are being compared

where revenue comes from

whether current conditions improved or worsened returns

A market professional can see:

what is observed vs proxied vs modeled

what changed in the market

how that translated into returns

The section no longer feels like:

a pitch-deck screenshot

a generic calculator

an AI-made dashboard

The section stays visually premium even when one data source is stale.


Build order
audit current section and data flow

define new view model

build static layout skeleton

build controls

build top summary strip

build summary row

build 2H/4H comparison cards

build revenue mix chart

build driver waterfall

build event rail

build confidence strip

wire data

handle degraded states

remove or demote all old calculator-first behavior


One-line instruction
Rebuild the current Revenue Engine into a Baltic reference asset economics console centered on a 50MW asset, visible 2H vs 4H comparison, revenue mix, recent market-driven return changes, and explicit confidence labeling; make it an economics interpretation layer, not a calculator hero, and prioritize credibility, causality, and premium clarity over configurability or flashy outputs.