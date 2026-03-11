# PACK 2 — Competition and Buildability


## Baltic Market Pressure (COD windows)

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

solar generation / share

balancing market context

interconnector / congestion / spread conditions

Good source classes:
ENTSO-E

BTD / balancing ingest

Litgrid / AST / Elering where useful

your existing connected-market flow logic

Optional:
gas / carbon floor as secondary support only

large demand nodes only if grounded and not overclaimed

Do not use:
oil

lithium

random macro noise


Scoring rules
Keep the scoring simple, documented, and internal.
Competition
For each COD window:
include projects with COD <= that year

sum weighted MW

normalize to reference band

clamp 0–100

Flexibility need
Combine weighted signals such as:
renewables

load growth

spread / volatility persistence

balancing demand proxies

cross-border stress

Net effect
Net pressure = competition minus flexibility support
Public translation:
Supportive

Balanced

Tightening

Compressed

This is a directional framework, not a claim of precise forecasting.

Copy rules
Good
Battery competition rising faster than system flexibility demand

Renewables and cross-border stress partly offset revenue compression

Later COD faces tighter ancillary support

Implication for reference asset: more merchant selectivity required

Bad
COMPRESS

MATURE

0.88x

S/D at delivery

unexplained abbreviations

overconfident deterministic wording


Degraded-state rules
If one demand-side input is missing:
keep the card visible

mark Partial flexibility model

use last good value where reasonable

show stale marker

do not collapse into placeholders


Suggested components
MarketPressureSection

MarketPressureHeader

MarketPressureYearCard

PressureBalanceBars

PressureMethodologyNote


Acceptance criteria
This rebuild succeeds only if:
A first-time user can understand in 5–10 seconds that the module compares battery competition versus system need for flexibility by COD window.

An expert can see that the module does not pretend later COD is automatically worse.

Each year card clearly ends in a reference-asset implication, not just an abstract label.

The module feels like real Baltic market intelligence, not internal logic painted as UI.


One-line instruction
Delete the current COD compression bars and rebuild them as a Baltic Market Pressure module with 2027/2028/2029 COD-window cards, each showing battery competition versus system need for flexibility as paired bars, a net market-effect label, and a short implication for the 50MW reference asset, using Baltic pipeline data and market-demand proxies from load, renewables, balancing, and cross-border conditions.

Here’s the rewritten Claude Code brief for the EU/Baltics comparison block, using a 2-axis map and making freshness part of the design instead of pretending false precision.

## Grid Access & Buildability

KKME — Rebuild the current Grid Connection Scarcity card into a Grid Access & Buildability module


Objective
Refactor the current card into a focused buildability card.
This card must answer in one glance:
Can a new Baltic storage project still get built?

Is access tightening because of reserved capacity and queue behavior, not just physical grid limits?

What is the practical implication for the 50MW reference asset and for new project origination?

This is a structural support / buildability card, not a pipeline-intelligence or competition-pressure module.

Important boundary
A much richer private/scraped infrastructure dataset exists behind the scenes, including:
BESS

wind

solar

hybrids

other infrastructure

term sheet and reservation timing

development status

grid constraints

ongoing updates

Do not dump that raw intelligence into this card.
Use it only to improve:
interpretation

queue-pressure read

buildability status

policy effect context

country / node pressure hints where safe

The public card must remain:
aggregated

public-safe

narrow

readable

The richer intelligence belongs in a separate future module such as:
Baltic Pipeline Intelligence

Competition Pressure

Project Pipeline


Rename
Change:
Grid Connection Scarcity

To:
Grid access and buildability

Subtitle if needed:
 Public capacity, reservation pressure, and policy signals affecting whether new Baltic storage projects can still move.
Do not use “scarcity” unless the data clearly justifies it.

Core narrative
This card must communicate a simple buildability truth:
indicative grid capacity still exists on paper

reserved / queue pressure may tighten real access faster than the headline suggests

policy changes may accelerate queue formation

buildability remains open, but timing matters

That is the correct tone.

Required card structure
1. Headline block
Show one strong top-line metric:
3020 MW

label: Indicative available capacity

Directly under it, show a visible geography qualifier such as:
Lithuania public grid snapshot

Baltic interpretation layer applied

Do not present the number as if it were a pure Baltic-wide buildability fact.
Add one status tag:
Open but tightening

Moderately available

Tightening

Constrained

This tag may use private interpretation behind the scenes, but must remain public-safe.

2. Main visual
Use one strong stacked horizontal bar as the main visual.
Show clearly:
Connected

Reserved

Indicative available

Make it:
large

legible

clearly labeled

Do not use circles as core visuals.
 Do not mix too many small visual treatments.
Optional:
small note versus prior month / quarter if reliable


3. Reservation / queue pressure summary
Add one compact interpretation block.
Use 2–3 public-safe lines such as:
Reserved pressure: rising / stable / falling

Queue pressure: accelerating / stable / easing

Buildability outlook: open / tightening / constrained

Important:
Reserved pressure = current reserved share / reservation load

Queue pressure = speed and direction of incoming pipeline pressure

Do not expose private project-level detail.
Examples of allowed safe statements:
Live pipeline suggests tightening faster than headline headroom implies

Reservation churn may reopen limited access

Pressure is rising faster in LT than in LV/EE
 only if true and safe


4. Policy watch block
Keep one clean integrated policy block.
Example:
 Policy watch
 Proposed guarantee reduction from €50 to €25/kW may lower entry barriers and accelerate queue growth.
Add one short effect line:
 Possible effect: quicker depletion of available headroom
Do not make policy sound settled if still pending.

5. Reference asset / origination implication
Add one explicit line near the bottom tying the card to the site logic.
Examples:
Reference asset implication: buildability remains open, but connection timing risk is rising

Origination implication: viable, but queue acceleration matters more than headline headroom alone

This is required.

6. Interpretation line
Add one short plain-language takeaway.
Examples:
Public grid headroom remains open on paper, but reservation pressure could tighten project access quickly.

Buildability is still viable, but queue acceleration matters more than the headline capacity number alone.

This is the most important sentence in the card.

7. Footer
Use a compact source / freshness line only.
Example:
 Source: public grid capacity data + KKME interpretation layer · Updated 04:00 UTC
If LT-led public data is being used with Baltic interpretation, say so honestly.

Move into details
Hide from the primary layout:
permit circles

permit counts unless unusually strong and clear

parsing / validation notes

model input notes

ArcGIS technical notes

baseline/debug copy

monthly permit caveats

any project-level view

If permit data is useful, place it in details or a later deeper module.

Private/scraped data rules
Use the private dataset only behind the scenes for:
interpreting whether public headroom is being consumed faster than visible

estimating reserved pressure

estimating queue acceleration

flagging churn / expiry pressure

improving buildability status

improving country / node interpretation

Do not display:
owner groups

project-by-project tables

term sheet dates

confidential stage detail

commercial relevance scoring

supplier / optimizer opportunity logic

Those belong elsewhere.

Visual rules
one strong number

one strong bar

one clean policy block

one short takeaway

one reference asset / origination implication line

no overloaded sub-elements

no tiny labels carrying core meaning

no nested debug-panel feeling

no mixed visual language

This card should feel calm, adult, and useful.

Data / state rules
use public headroom as headline

use private dataset only to improve interpretation

keep geography honest

keep language public-safe

If data is stale:
keep last known value

show stale badge if needed

do not collapse into blanks or placeholders


Acceptance criteria
The rebuild succeeds only if:
a first-time visitor understands the headline number is public indicative capacity, not guaranteed immediate buildability

the card clearly separates:

public headroom

reserved pressure

queue pressure

policy effect

the private dataset improves interpretation without being exposed directly

the card stays narrow and readable instead of becoming a pipeline dump

the card includes a clear implication for the reference asset or project origination

the main takeaway is obvious: buildability is still open, but tightening can happen faster than the headline number suggests


One-line instruction
Rebuild the current grid card as a narrow Grid Access & Buildability module showing indicative available capacity, reserved and queue pressure, policy watch, and a clear public-safe implication for the 50MW reference asset or new project origination, while using the private infrastructure dataset only behind the scenes to improve interpretation rather than exposing raw project intelligence.