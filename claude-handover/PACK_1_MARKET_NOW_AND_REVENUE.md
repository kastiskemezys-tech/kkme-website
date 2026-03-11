# PACK 1 — Market Now and Revenue Opportunity

Do not let polish obscure logic.

Phase 10 — Data honesty and QA pass
Goal
Make sure the rebuilt site is hard to attack.
Required QA checks
For every major section confirm:
Is the main question of the section obvious?
Is the geography honest?
Is the data type honest?
Is the freshness honest?
Is the impact on the reference asset clear?
Is the confidence level appropriate?
Would a serious market participant call this sloppy or overclaimed?
Does this section duplicate another section?
Does this section fit the page narrative?
Does it degrade gracefully when one feed fails?
Specific attack-surface review
Check for:
overconfident point estimates
hidden Lithuania-only assumptions presented as Baltic
raw prices presented as monetizable revenue without caveat
thin-market outputs overstated as repeatable
market comparisons presented as rankings
generic news items masquerading as intelligence

What must not be missed
These are mandatory and easy to forget:
Mandatory concept layers
impact on reference asset
confidence / data-type labels
freshness classes
connected-market influence from Sweden / Finland / Poland
distinction between structural drivers and market design
distinction between public-safe outputs and private dataset intelligence
posted price vs usable revenue
investor-first final CTA
intelligence board as curation, not ingestion
Mandatory removals / separations
no DC viability inside structural drivers
no Nordic hydro as equal-weight main card
no queue intelligence stuffed into buildability card
no ranking table for Europe context
no raw Telegram/news table
no generic teaser form

Working method rule for Claude
At the end of each phase:
stop
verify the section/page logic still holds
do not immediately rush into the next phase if the previous one remains structurally weak
If needed, prefer:
deleting obsolete code
rewriting components cleanly
over:
patching around a bad concept

Deliverable expectation
The finished site should feel like:
one coherent intelligence product
not ten upgraded components
investor-first
serious enough for infra capital
useful enough for Baltic developers and owners
honest enough to build trust
distinctive because of its market structure and pipeline intelligence, not because of styling tricks

One-line instruction
Implement the KKME rebuild in strict phases: first fix page architecture and shared primitives, then rebuild sections in narrative order from market now through drivers, market design, cost, economics, Europe context, intelligence, and investor-first CTA, and only then do final polish and data-honesty QA.

Now I’ll post ecery section of the current website and what needs to be changed generally: 


Claude / coding-agent fix brief — Hero
Replace the centered hero with a two-column investor-facing opening.
Left column
KKME wordmark

one-line value proposition

short support copy explaining that KKME tracks Baltic flexibility/storage market regime and translates it into reference-asset economics

CTA row

Right column
Build a Market Now card, not just a KPI strip.
It should show:
current market regime / state

4–5 key metrics max

one short plain-language interpretation line

one small note on impact for the 50MW reference asset

freshness / methodology row

Add
tooltip/info icon to every KPI label

last full refresh timestamp

source latency note

methodology link

visible distinction between:

observed

derived

proxy

modeled

Rewrite KPI labels
BESS Capture → Day-ahead arbitrage capture

S/D Ratio → Balancing supply / demand ratio

Grid Free → Indicative grid capacity available

Fleet Op → Operational BESS fleet

Remove
vague interpretation text unless backed by visible logic

centered body copy blocks except very short headings

decorative microcopy

visual effects used instead of structure

Anti-cheap rules
no oversized glow halos

no tiny pale text pretending to be premium

no unexplained abbreviations in hero

no generic AI-dashboard tropes

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
Relevant screenshots: screenshot_01.png (Hero), screenshot_02.png (Revenue Engine), screenshot_05.png (S1), screenshot_06.png (S2)
