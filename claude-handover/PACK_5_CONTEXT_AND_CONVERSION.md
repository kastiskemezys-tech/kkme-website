# PACK 5 — Context and Conversion

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


KKME — Rebuild current COD compression bars into a Baltic Market Pressure module

Objective
Delete the current unexplained COD compression bars (2027 / 2028 / 2029, 0.88x / 0.95x / 1.10x, COMPRESS / MATURE).
Replace them with a Baltic Market Pressure module that explains one real idea:
More BESS online tends to compress revenues, but growing system need for flexibility from renewables, load growth, balancing needs, and cross-border stress can offset some of that pressure.
This module must not simplify the story to:
 later COD = worse.
It must feel like a real Baltic market-intelligence module, not an AI-decorated internal formula.

What this module must answer
Is Baltic battery competition rising?

Is system need for flexibility also rising?

What does that net out to for a 50MW reference asset by COD window?

This is not a precise forecast panel.
 It is a pressure balance panel.

Section title
Baltic market pressure
Support copy
Battery revenues tighten as more storage comes online, but renewables growth, demand growth, balancing needs, and cross-border constraints can increase system need for flexibility.
Meta row
Region: Baltics · Updated from pipeline + market signals · Methodology

Core layout
Render three year cards side by side for:
2027

2028

2029

Treat these as COD windows, not exact predictions.
Each card must have three layers:
A. Battery competition
Public label: Battery competition
This is the negative force.
Show:
paired bar / filled meter

one supporting metric underneath, such as:

Weighted BESS pipeline: XXX MW

or Competition score: 62 / 100

short note if useful:

Rising

Accelerating

B. System need for flexibility
Public label: System need for flexibility
This is the offsetting force.
Show:
paired bar / filled meter

one supporting metric underneath, such as:

Flexibility support score: 48 / 100

this score can be built from:

renewables growth

load / demand growth

balancing context

cross-border stress / spread opportunity

congestion / interconnector conditions

C. Net market effect
This is the conclusion layer.
Show:
one short label:

Supportive

Balanced

Tightening

Compressed

one short explanation line

one explicit reference-asset implication line

Examples:
Net effect: Tightening

Storage growth is outpacing system flexibility demand

Implication for 50MW reference asset: lower ancillary support, more selective merchant upside

Do not use:
COMPRESS

MATURE

mystery multipliers

internal jargon


Visual rules
Must do
one clean year card per COD window

paired bars with clear labels

readable without hover

one short conclusion sentence

one short reference-asset implication line

visible labels, not color-only meaning

Must not do
long unexplained bars

hidden axes

tiny faint text on dark background

internal model states in all caps

numeric clutter pretending to be rigor


Data model
Use two internal composite indices plus a net effect score.
Internal only
Do not expose formulas on the card itself.
1. batteryCompetitionScore
0–100 scale
Built from:
operational BESS MW

under-construction BESS MW

likely COD pipeline MW

weighted by confidence and year relevance

2. flexibilityDemandScore
0–100 scale
Built from:
renewable penetration / growth

load / demand growth

spread persistence / volatility

balancing demand proxies

cross-border / congestion stress

3. netPressureScore
Derived from competition vs flexibility demand balance.
Translate to public labels:
Supportive

Balanced

Tightening

Compressed

Do not expose internal formulas in the main UI.

Recommended data inputs
A. Battery competition
From your Baltic pipeline / project database:
operational projects

under construction

connection agreement / reserved-capacity stage

applications with lower weight

optional announced projects at very low weight

Required project fields:
country

project name

owner / parent group

MW

MWh if available

status

expected COD

confidence weight

last verified date

source

Suggested status weights:
operational = 1.0

under construction = 0.9

connection agreement = 0.6

application = 0.3

announced = 0.1

These are methodology choices, not facts. Keep them documented.
B. System need for flexibility
Use:
load / demand

wind generation / share

That is not a coherent driver map.
The rebuilt section must separate:
system-balance drivers

thermal-floor support drivers

future strategic-demand ideas that do not belong here


New section title
Structural market drivers
Support copy
The slower system forces shaping Baltic flexibility value beyond today’s spreads.
Optional secondary line:
Wind, solar, demand, interconnectors, and thermal floor support all influence how much value storage can capture over time.

Required section structure
Primary row — system-balance drivers
Build four primary cards:
Wind generation

Solar generation

Demand / load

Interconnectors & connected markets

These are the dominant structural drivers and should be visually primary.
Secondary row — thermal-floor support
Build two secondary cards:
TTF gas

EU ETS carbon

These matter, but they are supporting signals rather than the main story.
Remove from this section
DC power viability must be removed entirely from this section

Nordic hydro must be removed or heavily demoted into a minor contextual note only

balancing liquidity / distortion / usable depth must not be forced into this section; that belongs in a separate future module focused on market design and trading reality


Important connected-market rule
Do not model this section as “Baltics only” in an isolated sense.
This section must explicitly acknowledge that Baltic structural drivers are influenced by connected-market conditions via:
Sweden / SE4

Finland

Poland

These matter through:
cross-border price coupling

import/export dependence

renewable oversupply in neighboring zones

demand and scarcity conditions in connected markets

interconnector outages or deratings

cross-zonal capacity constraints

So the interconnector card is not just about Baltic wire status. It is also about imported system conditions.
Example logic:
strong Swedish wind or low SE4 demand can push cheaper energy toward the Baltics when NordBalt is available

Finnish scarcity or EstLink issues can tighten Baltic conditions

Polish conditions matter through LitPol and broader Continental linkage

This must be reflected in copy, data model, and interpretation.

Card-by-card requirements
1. Wind generation card
Purpose:
 Show how Baltic wind conditions affect low-price windows, volatility, charging opportunities, and renewable pressure.
Must show:
current Baltic wind generation or wind share

7D and 30D comparison versus recent baseline

one plain-language interpretation line

one small impact tag for the reference asset

Optional secondary stat:
negative-price pressure proxy

curtailment-pressure proxy
 but only if reliable enough

Interpretation examples:
High wind is increasing low-price charging windows but suppressing some hours

Low wind is reducing cheap charging opportunity and weakening some arbitrage setups

Impact examples:
Impact on 2H: mixed

Impact on 4H: slight positive

Important:
 Do not merge wind and solar. They shape spreads differently.

2. Solar generation card
Purpose:
 Show how solar affects midday price suppression, intraday shape, charging windows, and negative-price risk.
Must show:
current Baltic solar generation or solar share

7D and 30D comparison

one plain-language interpretation line

one small reference-asset impact tag

Optional secondary stat:
midday negative-price pressure

solar-overgeneration proxy

Interpretation examples:
Rising solar output is deepening midday price pressure and improving charging windows

Weak solar reduces midday suppression and narrows some intraday spreads

Impact examples:
Impact on 2H: slight positive

Impact on 4H: positive


3. Demand / load card
Purpose:
 Show whether Baltic system demand is strengthening or weakening the need for flexibility.
Must show:
Baltic total load / demand

recent trend over 7D / 30D and, if useful, YoY

one interpretation line

one small reference-asset impact tag

In details layer, allow:
LT / LV / EE split

notes on demand drivers if available

Interpretation examples:
Demand remains supportive for flexibility value

Soft industrial load is easing system tightness

Electrification is gradually increasing structural flexibility demand

Important:
 This card should reflect not only current demand but the fact that future flexible demand can come from EVs, heat pumps, industrial electrification, and later large loads.
Do not overclaim future data-centre impact here; keep that as future context only.

4. Interconnectors & connected markets card
Purpose:
 This is the most important redesign in the section.
This card must show that Baltic system conditions are shaped by:
interconnector availability

cross-border flow regime

connected-market conditions in Sweden, Finland, and Poland

outage or derating events

cross-zonal coupling constraints

This card should replace the weak current flow card with something much more explanatory.
Must show:
current interconnector state summary

regime tag such as:

Balanced

Import-supported

Constrained

Dislocated

one plain-language interpretation line

one small reference-asset impact tag

Strongly preferred additional structure:
 Show a compact summary of the three most relevant connected influences:
SE4 / NordBalt

Finland / EstLink

Poland / LitPol

Not with full complexity, but enough to indicate whether the Baltics are being:
supported by cheap imports

isolated by outages / constraints

tightened by neighboring scarcity

dislocated from surrounding zones

Examples:
Cheap imports from Sweden are limiting Baltic price dislocation

Reduced Finland link support is increasing Baltic stress

Cross-border constraints are widening local volatility

This card should explicitly make the user understand:
 Baltic storage value is partly imported through interconnector physics and neighboring market conditions.

5. TTF gas card
Purpose:
 Show thermal-floor support.
Must show:
current TTF level

recent trend

regime tag:

Low

Elevated

High

one interpretation line

one reference-asset impact tag

Examples:
Higher gas keeps thermal peak pricing more supportive

Weaker gas floor reduces some peak discharge support

This card should be smaller and visually secondary to the system-balance cards.

6. EU ETS carbon card
Purpose:
 Show carbon contribution to thermal marginal-cost support.
Must show:
current EUA / ETS level

recent trend

regime tag

one interpretation line

one reference-asset impact tag

Examples:
Carbon cost continues to support fossil marginal pricing

Carbon remains a secondary but supportive floor signal

This card should visually pair with gas.

Nordic hydro
Do not keep Nordic hydro as a standalone primary card.
If retained at all, it must be:
a small contextual note

folded into a minor “Nordic context” detail

or used behind the scenes in interpretation logic

It does not deserve equal visual weight with wind, solar, demand, or interconnectors.

DC power viability
Remove this card from the section completely.
It belongs in a separate future module such as:
Large demand / strategic infrastructure watch

Future flexibility demand

Do not leave it in Structural Market Drivers.

Missing-driver treatment
Add negative-price / curtailment pressure as a secondary metric inside Wind and Solar first.
Do not create a separate standalone curtailment card unless:
the data quality is solid

the section still remains clean

This is enough for now.

Impact-on-reference-asset layer
This is required.
Every card in this section must not only show a driver. It must also show whether that driver is:
Positive for IRR

Negative for IRR

Mixed

Low confidence

Prefer a 5-state system:
strong positive

slight positive

mixed

slight negative

strong negative

and optionally a confidence marker:
high

medium

low

Where relevant, allow different impacts for:
50MW 2H

50MW 4H

Example:
solar up → more positive for 4H than for 2H

gas up → slight positive for both

interconnector outage → mixed but often positive for volatility, negative for import smoothing

Do not make this childish. It should be a restrained market-intelligence badge, not a gaming arrow.

Visual layout rules
Do not rebuild this as one flat row of tall skinny cards.
Preferred layout:
Top row — dominant system-balance layer
Wind

Solar

Demand / load

Interconnectors & connected markets

Bottom row — supporting thermal-floor layer
TTF gas

EU ETS carbon

The bottom row can be slightly smaller / visually subordinate.
The interconnector card may need to be wider than the others if necessary because it carries cross-border logic.

Interaction rules
Remove Explain / Data buttons from the card chrome

default state must be readable without interaction

if extra detail is needed, use one clean expand action or hover details

avoid nested debug-panel feel


Data and freshness rules
Design the data model so each card can clearly distinguish:
observed

proxy

derived

reference

Suggested freshness classes:
Wind / solar / demand / interconnectors → Live or Recent

TTF / ETS → Recent

Nordic context if retained → Reference

Do not imply all cards update at the same frequency.

Data-source expectations for future scraper integration
This section should be built so it can later consume data from:
ENTSO-E for generation by type, load, and cross-border exchanges

Nord Pool UMM / REMIT or equivalent event sources for outages and major interconnector events

BTD / Baltic TSO materials only where relevant to structural interpretation

TTF and ETS public feeds for thermal-floor support

local TSO sources where they improve regional fidelity

Important:
 The interconnector card must be built with the expectation that Sweden, Finland, and Poland conditions will be represented indirectly through:
price spreads

flow / capacity state

outage state

import/export orientation


Content rules
Every card must answer:
what changed

why it matters

whether it supports or weakens Baltic flexibility value

what it means for the 50MW reference asset

Use plain language.
Prefer:
Supports charging windows

Weakens flexibility value

Widens Baltic dislocation

Supports thermal floor

Positive for 4H

Mixed for 2H

Avoid:
cryptic internal abbreviations

unexplained market shorthand

giant isolated numbers with tiny notes


Acceptance criteria
This rebuild is successful only if:
A first-time visitor understands why these drivers belong together.

The section clearly shows that Baltic storage value is shaped not only by Baltic conditions, but also by connected-market influence from Sweden, Finland, and Poland.

Wind, solar, demand, and interconnectors become the primary structural driver layer.

Gas and ETS are visibly supporting signals, not the headline story.

DC power viability is removed from this section.

Nordic hydro is demoted or removed.

Each card visibly translates into an impact on the reference asset rather than just showing a market fact.

The section feels like a coherent system map, not a pile of miscellaneous cards.


One-line instruction
Rebuild the current “Baltic Power Market” row as a Structural Market Drivers section centered on wind, solar, demand/load, and interconnectors plus connected-market influence from Sweden, Finland, and Poland, with TTF gas and EU ETS as secondary thermal-floor support cards, and add a restrained per-card impact layer showing whether each driver is positive, negative, or mixed for the 50MW Baltic reference asset.
Additional implementation rules
Add one explicit line in the section support copy stating that Baltic flexibility value is influenced by both local Baltic system conditions and connected-market conditions in Sweden, Finland, and Poland.

Each primary card must have:

one main state or headline metric

one baseline comparison

one plain-language interpretation line

one reference-asset impact tag

Do not overload cards with multiple competing mini-metrics.

The Interconnectors & connected markets card may span extra width if needed and should be treated as the most explanatory card in the section.

The Demand / load card should separate:

current load trend

structural demand support
 even if the second part is only a small note.

If a driver’s effect on the reference asset is ambiguous, use Mixed rather than forcing a directional label.

Do not keep Nordic hydro in the main visible layout. Use only behind the scenes or in details if necessary.
Yes. The logic is right, but I’d tighten it so Claude doesn’t turn this into either a rulebook dump or a fake market-microstructure panel.
The biggest improvements are:
make Module A the clear hero
make “posted price vs usable revenue” the visible headline concept
force public-safe simplification
keep confidence impact tied directly to the reference asset, not as a side note
stop Claude from overbuilding detailed auction mechanics into the UI

KKME — Add a new standalone section: Market Design & Trading Reality
Objective
Add a new standalone section called Market Design & Trading Reality.
This section must be separate from Structural Market Drivers.
Do not merge them.
This section exists to explain one core truth:
Posted prices are not the same as repeatable, monetizable revenues. Market design and usable liquidity matter.
The site currently risks implying that Baltic BESS economics are explained only by:
spreads
balancing prices
fleet growth
wind / solar / demand
interconnectors
That is incomplete.
Baltic BESS economics are also shaped by:
market design
balancing auction structure
liquidity quality
accepted vs offered depth
thin or distorted clears
transitional post-synchronization effects
differences between visible price spikes and bankable revenue opportunity
This section is essential for credibility.

Core purpose
This section must answer:
Is the Baltic balancing market deep or thin right now?
Are visible balancing prices supported by real depth or by small marginal clears?
Are there design quirks or transitional effects that make naive backtests misleading?
What does this mean for confidence in the 50MW Baltic reference asset?
This is the site’s market-reality layer.
It should make the platform feel like it understands how the market actually works, not just how charts look.

What this section is not
Do not turn this into:
a live dispatch terminal
a raw trading blotter
a microstructure simulator
a legal/rulebook dump
a dense methodology wall
This section must remain:
public-facing
selective
intelligible
---
## Screenshots of Current State
Upload the corresponding screenshot images alongside this pack for visual reference.
Relevant screenshots: screenshot_04.png (EU Ranking), screenshot_10.png (Intel Feed), screenshot_11.png (CTA)
