# PACK 3 — Structural Drivers and Market Reality


## Structural Market Drivers

Core objective
Build a Structural Market Drivers section that explains the slower system forces shaping Baltic flexibility and storage value over weeks, months, and years.
This section must answer three things clearly:
What structural conditions are changing in the Baltic power system?

Which of those conditions support or weaken flexibility value for storage?

How are connected markets like Sweden, Finland, and Poland influencing Baltic economics through interconnectors and cross-border coupling?

This section is a translation layer between raw market signals and the 50MW Baltic reference asset.
It must feel like a serious market-structure module, not a leftover row of miscellaneous cards.

Big concept change
The current section fails because it mixes unlike concepts:
regional hydro context

gas / carbon floor support

interconnector flows

future data-centre thesis

thin standalone numbers with weak explanation

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

## Market Design & Trading Reality

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
high-trust
cautious

New section title
Market design & trading reality
Support copy
Prices alone do not tell the full story. Baltic storage revenues also depend on market depth, balancing rules, and how much liquidity is actually usable.
Optional secondary line:
This section separates posted market outcomes from practical trading conditions.
Add one small visible concept line:
Posted price vs usable revenue
That phrase should be visible, not buried.

Section structure
Build this section as three modules in this order:
Module A — Balancing market usability
Primary / most important
Module B — Market regime
Explains architecture and transition state
Module C — Reference asset confidence
Translates the first two into model confidence

Module A — Balancing market usability
Purpose
This is the hero module of the section.
It must show whether the visible balancing market is:
deep enough
liquid enough
clean enough
to support meaningful storage monetization
It must answer:
Are aFRR and mFRR opportunities supported by real depth?
Are prices being set by meaningful volume or fragile marginal clears?
Is the market usable, thin, fragile, or distorted?

Module title
Balancing market usability
Required outputs
1. Usability status
Show one clear top-line status:
Usable
Thin
Fragile
Distorted
Improving
This is the main state.
2. Liquidity quality summary
Show a compact summary of:
offered volume
accepted volume
marginal-clearing clue or thinness signal
recent trend over 7D / 30D
Do not overload the UI with too many raw numbers.
This module should show only enough to answer:
is this a robust market or a brittle one?
3. Plain-language interpretation
Examples:
Visible aFRR prices remain high, but usable depth is still limited.
mFRR opportunity exists, but small marginal clears can still distort price signals.
This line is required.

Preferred visual
Use a depth / usability bar or thinness gauge.
Preferred layout:
one row for aFRR
one row for mFRR
Each row should include:
recent price reference
accepted volume
usability state
optional thinness cue
Do not use a generic line chart if it does not explain usability.

Data expectations
Design this module for future ingestion from:
Baltic Transparency Dashboard
accepted vs offered capacity / energy
activation volumes
clearing data
Baltic balancing exports
The view model must support:
offered volume
accepted volume
recent price reference
marginal-clearing clue
thin-market flags
recent trend
Do not hardcode assumptions into JSX.

Important honesty rule
Do not pretend to calculate perfect “usable liquidity.”
This module should present:
observed facts where available
directional thinness / fragility interpretation where needed
confidence levels where certainty is lower

Module B — Market regime
Purpose
Explain the architecture of the market in simple terms.
This module should answer:
What balancing environment are we actually trading inside?
This is not a legal explanation.
It is a selective market-structure explainer.

Module title
Market regime
Must show
A compact set of active regime facts such as:
balancing products active
platform participation (PICASSO / MARI if relevant)
settlement / granularity
daily auction structure
cross-zonal balancing context
current transition state
rule-change watch

Preferred visual
Use one of:
3–5 compact regime tiles
a short regime strip
a simple current-state timeline
Examples:
Balancing products: aFRR and mFRR active
Settlement: 15-minute granularity
Cross-zonal balancing: expanding influence on liquidity and price formation
Transition state: post-sync regime still normalizing
Rule watch: current structure still evolving
Keep it concise.
Do not paste rulebook text.

Important rule
This module explains:
structure
regime
transition
It does not attempt to teach the full market manual.

Module C — Reference asset confidence
Purpose
Translate market design and liquidity reality into confidence levels for the 50MW reference asset.
This module answers:
what parts of the revenue stack are more trustworthy
what parts are more fragile
where model confidence should be lower

Module title
Reference asset confidence
Must show
A compact confidence breakdown for:
Arbitrage
aFRR
mFRR
FCR if still relevant
optional emerging products only if actually used in the model
For each revenue type show:
confidence:
High
Medium
Low
short reason:
Observed and repeated
Thin market
Proxy-heavy
Transitional
Distorted by limited depth
short implication for model reliability
Examples:
Arbitrage — High confidence
aFRR — Medium confidence
mFRR — Medium / low confidence
FCR — Lower future confidence as market saturates

Preferred visual
Use a compact confidence matrix or stacked confidence row.
Do not use a dense table.
This should be readable in a few seconds.

Site-wide concept to make visible
This section must explicitly teach:
Posted price vs usable revenue
Make this visible in copy.
The visitor should leave understanding:
a visible price spike does not automatically equal bankable revenue
thin markets can produce dramatic prices on small volume
historical results in transitional markets may not be repeatable
confidence in modeled returns should vary by revenue stream
This is the most important conceptual output of the section.

Relationship to the rest of the site
This section must sit:
after Structural Market Drivers
before or adjacent to the Reference Asset section
Reason:
Structural Market Drivers explain the physical/system context
Market Design & Trading Reality explains commercial/institutional filters
Reference Asset economics then translates both into returns
That sequence is important.

Data model guidance
Build this section data-first.
Suggested conceptual structures:
type MarketUsabilityMetric = {
  product: 'afrr' | 'mfrr' | 'fcr'
  usabilityStatus: 'usable' | 'thin' | 'fragile' | 'distorted' | 'improving'
  offeredVolume?: number
  acceptedVolume?: number
  recentPrice?: number
  marginalSignal?: number | string
  thinnessFlag?: boolean
  confidence: 'high' | 'medium' | 'low'
  interpretation: string
  sourceLabel: string
  lastUpdated: string
}

type MarketRegimeState = {
  label: string
  value: string
  interpretation: string
}

type RevenueConfidenceItem = {
  revenueType: 'arbitrage' | 'afrr' | 'mfrr' | 'fcr'
  confidence: 'high' | 'medium' | 'low'
  reason: string
  impactOnModel: string
}

Keep business logic out of presentation components.

Visual rules
This section should feel:
institutional
restrained
cautious
analytical
high-trust
Do not use:
oversized glows
decorative trader-terminal styling
tiny unreadable labels
raw rule text
dense main-view tables
dramatic language
The section should look calmer and more serious than a typical dashboard row.

Copy rules
Prefer:
Usable liquidity
Thin market
Price supported by limited depth
Transitional regime
Reference asset confidence
Posted price vs usable revenue
Avoid:
anomaly
crazy
broken
gold rush
unexplained internal shorthand

What to remove from elsewhere once this exists
Once this section is built:
do not force liquidity/distortion caveats into Structural Market Drivers
do not overload the Balancing Market card with full market-design nuance
do not leave the Reference Asset section carrying all confidence disclaimers alone
This section becomes the correct home for that logic.

Degraded-state rule
If one usability input is missing:
keep the section readable
show partial confidence / partial data state
use last good value where appropriate
do not collapse the whole section into placeholders
Examples:
Awaiting fresh volume reference
Using last confirmed usability state
Partial update

Acceptance criteria
The rebuild succeeds only if:
A visitor understands that visible balancing prices are not the same as guaranteed monetizable opportunity.
The section clearly distinguishes:
price
usable depth
design / rule context
confidence
The site becomes more credible because it openly acknowledges thinness and distortion.
The Reference Asset section can use this as a confidence filter instead of pretending all revenues are equally robust.
The section is understandable without reading a market-rule document.

One-line instruction
Add a new standalone Market Design & Trading Reality section that explains Baltic balancing-market usability, thinness, and regime context, and translates those conditions into a confidence layer for the 50MW reference asset so the site clearly distinguishes posted prices from truly usable revenue opportunity.