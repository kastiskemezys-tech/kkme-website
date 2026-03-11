# PACK 3 — Structural Drivers and Market Reality

Do not let €148k /MW/yr and €111k /MW/yr appear like hard observed fact unless they truly are.
If this is too ambiguous, lower the prominence or rewrite.

4. Market support bars
Keep the aFRR and mFRR bars, but make them much clearer.
For each bar show:
current value
reference line (target / 30D average / useful range)
one short interpretation label
Examples:
aFRR price reference: 35 €/MW/h
Near long-term support level
Bars must be understandable without tiny footnotes.

5. Fleet pressure summary
Do not show the full fleet list in the main card.
Replace it with one compact summary block:
Operational fleet
Committed pipeline
Pressure trend
Example:
Operational: 375 MW
Committed: 541 MW
Trend: rising
Move full project list into a collapsible details drawer only.

6. Trend chart
Replace the weak small right-side chart with one clean trend chart.
Preferred chart:
supply / demand ratio over time
Do not try to show multiple stories at once.
Purpose:
This chart should explain whether competition pressure is increasing or stabilizing.
Do not use a decorative revenue line chart instead.

7. Reference asset impact line
Add one short explicit line that connects the signal back to the 50MW reference asset.
Examples:
Reference asset impact: balancing revenues remain supportive, but future compression risk is rising
Reference asset impact: reserve-heavy 2H case still works, but less comfortably than before
This is required so the card fits the whole site logic.

8. Watchout strip
Keep one simple watchout line near the bottom of the main card.
Example:
Reserve revenues remain supportive, but new fleet additions should be monitored for compression risk.
Optionally add a mild caveat:
Posted prices remain supportive, though monetizable depth may still be thinner than they imply.
Do not turn this into a full market-design module here.

9. Footer
Use a compact source/freshness line only.
Example:
Source: Baltic balancing references + fleet tracker · Updated 18:00 UTC

Move into collapsible details
Hide these from the default main view:
full fleet project list
P90 imbalance spike detail
scenario math
forecast notes
methodological footnotes
auction timing notes
extra market stress numbers
P90 and similar thin-market details should live in the later Market Design & Trading Reality section if needed.

Rename / simplify labels
S/D → Supply / demand
COMPRESS → plain-language status tag
Baltic BESS fleet → Battery fleet pressure
clearly define the meaning of the revenue numbers
No unexplained abbreviations in the main card.

Visual rules
remove Explain and Data from primary layout
increase spacing and font size
reduce debug/terminal feel
use stronger hierarchy:
market status
revenue support
competition pressure
detail
no tiny labels carrying core meaning
no long fleet list in main body
no decorative chart that explains nothing

Data / logic rules
main number must clearly represent battery competition vs balancing demand
revenue figures must be explicitly labeled as reference / indicative / modeled if not hard observed
fleet pressure must be summarized, not dumped
keep visible distinction between:
observed
derived
modeled
manual
use Baltic blended framing with LT-led or source-specific depth where necessary
do not imply full Baltic uniformity if the underlying data is more local or asymmetric

Acceptance criteria
The rebuild succeeds only if:
a first-time visitor can understand what the balancing-market signal means
the main status is readable without knowing internal abbreviations
only the most important revenue and pressure metrics remain visible by default
the fleet list is moved out of the main view
the card clearly connects balancing revenues to competition pressure
the card clearly connects to the 50MW reference asset
the card no longer feels cramped, cryptic, or terminal-like

One-line instruction
Rebuild the current Balancing Stack card as a clear Baltic balancing market signal card showing supply/demand pressure, aFRR and mFRR revenue support, summarized fleet pressure, a supply/demand trend chart, and a short reference-asset implication, while moving detailed fleet lists and thin-market diagnostics into collapsible details or later market-design modules.

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

the module remains credible even when some inputs are only directional or low-frequency

One-line instruction
Delete the current lithium-led cost stack and rebuild it as a Project Cost Trend module for Baltic utility-scale LFP BESS, focused on directional full-project CAPEX pressure, visible driver buckets, recent move summaries, tracked public signals, and a reference asset sensitivity block showing indicative CAPEX range plus IRR and DSCR impact.

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
---
## Screenshots of Current State
Upload the corresponding screenshot images alongside this pack for visual reference.
Relevant screenshots: screenshot_09.png (Structural Drivers)
