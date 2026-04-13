# PACK 1 — Market Now and Revenue


## Hero / Market Now

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

## S1 — Baltic Price Separation

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

## S2 — Baltic Balancing Market

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