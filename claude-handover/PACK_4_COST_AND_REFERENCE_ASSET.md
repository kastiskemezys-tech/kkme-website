# PACK 4 — Cost and Reference Asset

Do not pretend you have the same level of live coverage.
Use a mix of:
public market reports
benchmark references
known structural characteristics
periodically refreshed market notes
public articles / reports you can parse into directional scores
your own manually verified structural summaries
Important
Design the data model so these countries can gradually become more current over time.
Do not hardwire them as fixed text in the frontend.

Data architecture Claude should implement
Create a market map config / dataset
Do not encode point positions directly in JSX.
Create a structured dataset, e.g. marketMapData.
Suggested shape
type MarketMapPoint = {
  id: string
  label: string
  region: string
  crowdingScore: number
  revenueOpportunityScore: number
  updateClass: 'live' | 'recent' | 'reference'
  lastUpdated: string
  revenueProfile: {
    balancing: number
    arbitrage: number
    policy: number
  }
  regimeLabel: string
  description: string
  whyHere: string[]
  sourceNote: string
}

All positions and copy should come from this dataset.

Required implementation rule
Make it easy to update / enrich later.
This means:
no baked-in copy inside component logic
no fixed x/y positions in UI code
no hardcoded flags and percentages in JSX
no mixing presentational code with scoring logic

Visual design rules
Must do
big enough plotting area
readable country labels
subtle Baltic emphasis, not trophy styling
light connecting grid if useful
hover/click tooltips
right-side detail panel
visible axes with plain language
Must not do
rank numbers
giant percentage badges
“best market” framing
overglow or terminal cosplay
tiny unreadable annotations
false precision

Copy rules
Good
Transition market with rising competition
Mature market with deeper optimisation and tighter economics
Ancillary-heavy support, but more crowded
Merchant upside exists, but depends on structure and policy
Bad
#1
Best
Gold rush
post-sync anomaly
ref
live
without explanation

Interaction rules
Default state
Show all countries plotted.
Selected default:
Baltics
Why:
This gives the visitor an anchor.
On hover / click
Open detail panel for selected country.
In detail panel show
regime label
short description
crowding status
opportunity status
revenue profile bar
why this market sits here
update class + timestamp
source note

Expandability
The user explicitly noted that EU has more countries.
So build for expansion.
Do not lock this to 6 markets only
Initial markets can be:
Baltics
Ireland
Great Britain
Italy
Germany
Belgium
But the system should support adding:
Spain
Netherlands
France
Nordics
Poland
others
without redesigning the component.

How to keep it recent as often as possible
Implementation strategy
Use a layered freshness model:
Layer 1 — live market logic
For Baltics:
update from live KKME sources
Layer 2 — refreshed structural scores
For other markets:
maintain country score records in a data file / DB
refresh them on schedule
attach lastUpdated
attach updateClass
Layer 3 — editorial override
Allow manual adjustment when an important market shift happens faster than the full scoring pipeline can catch it.
This matters because EU market structure changes are not always machine-readable in real time.

Why this matters professionally
Because otherwise the module will drift into one of two bad outcomes:
Bad outcome 1
It becomes a static decorative map that ages badly.
Bad outcome 2
It pretends to be live everywhere, which a serious user will immediately distrust.
This architecture gives:
live where you can be live
structured recency where you cannot
honesty everywhere
That is professional.

Engineering instructions for Claude
Step 1 — delete ranking mindset
Do not convert the old ranking list into a prettier ranking list.
This is a full concept change.
Step 2 — build data-driven market map
Create the market point dataset first.
Step 3 — build plotting component
Use a reusable chart / SVG / D3-friendly approach.
Prefer a simple, clean scatter-map style.
Step 4 — build selected-market detail panel
This is mandatory. The map alone is not enough.
Step 5 — add freshness layer
Every point needs update metadata.
Step 6 — add regime explanations
The value of this module is explanation, not dots in space.

Acceptance criteria
The rebuild succeeds only if:
A first-time visitor understands that BESS revenue conditions differ by country and change over time.
The module does not look like a promotional ranking.
Baltics are shown clearly but not boastfully.
Each country has visible freshness / methodology context.
The component is data-driven and expandable to more EU markets later.

One-line instruction for Claude
Replace the current EU ranking list with a data-driven 2-axis European BESS market map plotting countries by crowding versus revenue opportunity, with Baltic live logic where available, refreshed structural reference scores for other markets, per-country freshness metadata, and a selected-market detail panel that explains why each market sits where it does.
Additional rules
The map is directional, not a precise ranking or like-for-like modeled comparison.
Add a visible small note under the section or in the detail panel:
Directional market positioning, not a like-for-like ranked model.
Every market must have:
phase
why it sits here
update class
source note
The Baltics must use a Baltic blended view with LT-led signal depth, not silently default to Lithuania.
If a country’s placement is partly editorial or structurally inferred, that must be reflected in:
updateClass
sourceNote
and not hidden behind false precision
Do not render point positions as if they are exact measured facts when they are composite scores.
Add one field to the data model:
phase: 'emerging' | 'transition' | 'mature' | 'compressed'
Add to tooltip / detail panel
For each market show:
market name
phase
short regime description
crowding status
revenue support status
why it sits here
update class
last updated
source note

KKME — Rebuild the Baltic Price Separation / S1 card


Objective
Refactor the current S1 card into a clean single-story market signal card.
This card must answer in one glance:
Are Baltic spreads helping storage arbitrage right now?
Is today unusual versus recent history?
What is the practical implication for the 50MW Baltic reference asset?
Do not patch visually around the current layout. Simplify the structure.

Core concept
This card is not a mini terminal or debug panel.

no decorative analysis language

no metric without unit, geography, and scope

no giant empty dark space


What I would add now that was missing before
Add a reference-asset translation
The hero should not only show market stats. It should also answer:
What does this mean for the reference asset right now?
Even if it is just one small line like:
Net effect on 50MW 2H case: slightly positive this week
 or

Reference asset outlook: tightening, but still buildable

That would make the hero much stronger.
Add geography honesty
Because we later decided on Baltics with LT-led signal depth, the hero should explicitly say that somewhere small but visible.
Example:
Baltic blended view · LT-led signal depth


Professional credibility check — still correct, but refine it
Keep, but clarify
aFRR price 35 €/MW/h
 Keep only if clearly marked as reference, proxy, or observed depending on truth.

Fleet op 375 MW
 Keep only if scope is explicit:

Baltic or mixed

operational only or weighted

whether pipeline is separate

Grid free 3.0 GW
 Keep only if clearly qualified as:

public snapshot

indicative available capacity

not directly equal to easy BESS buildability

Change
Market compressing
 Still too hand-wavy. Replace with something observable:

New committed fleet is increasing revenue pressure

Supply / demand ratio has moved from scarcity toward compression

Better remove from hero unless clearly evidenced
any hard market conclusion without visible method

any metric mixing manual inputs, proxies, and live data without a quality marker

any giant “buildable” style label unless it is clearly explained


What a serious market person will question immediately
This part is exactly right and should stay:
Is this observed data, derived estimate, or model output?

Is the geography Lithuania, Baltics, or mixed?

Is the value current, rolling average, or forecast?

Does “grid free” mean transmission headroom, queue estimate, legal availability, or practical connectionability?

That distinction must be visible on the screen, not hidden in code.

NEXT:


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
---
## Screenshots of Current State
Upload the corresponding screenshot images alongside this pack for visual reference.
Relevant screenshots: screenshot_07.png (Cost Stack), screenshot_02.png (Revenue Engine)
