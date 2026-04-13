# KKME — Data Model Rules


## Data Classes + Freshness + Geography + Impact + Degraded States

short confidentiality / trust note
premium CTA:
Start the conversation
Must not include
“Submit teaser”
broker-like tone
generic lead-form feel
mixed audience confusion

Cross-site translation layer
This is mandatory across the entire site.
Add a common “impact on reference asset” logic
Every important signal, card, or event should eventually resolve into:
Strong positive
Slight positive
Mixed
Slight negative
Strong negative
Low confidence where needed
Where relevant, show different impacts for:
2H
4H
This should appear:
per card where useful
per major section in summary form
in the reference asset section as the final translation layer
The site must stop presenting signals without economic interpretation.

Data honesty rules
Every metric / signal / card must clearly support a distinction between:
Observed
Derived
Modeled
Proxy
Reference
This must exist in the data model and appear in the interface where appropriate.
Do not pretend:
all data is live
all markets are equally covered
all revenue assumptions are equally bankable
all visible prices are equally monetizable
Credibility is the highest priority.

Baltic framing rules
Use:
Baltics with LT-led signal depth
Do not imply perfect Baltic symmetry where it does not exist.
Allowed patterns:
“Baltic blended signal”
“Lithuania-led proxy”
“Baltic-calibrated reference”
“Regional structural context”
This must be honest in copy and metadata.

Use of insider / private project data
Important:
The private dataset is a moat, but do not expose it bluntly in public cards.
Use it behind the scenes for:
competition pressure scoring
queue pressure interpretation
buildability outlook
COD wave estimation
future crowding logic
internal origination scoring
investor/pipeline discussion intelligence
Public-safe outputs only
Allowed public outputs:
pipeline pressure rising
competition tightening
queue acceleration
buildability open but tightening
country divergence
likely COD wave
Do not expose:
confidential project names
private term sheet dates
identifiable sensitive commercial details
Use the private dataset to improve interpretation, not to dump raw intelligence.

Design system / visual rules
Overall feel
premium
restrained
calm
high-trust
editorial + terminal, not sci-fi
modern but not flashy
Avoid
giant glow halos
fake “AI dashboard” styling
too many tiny labels
too many pills
nested debug-panel feeling
mystery bars and unexplained multipliers
giant percentages used like trophies
decorative motion
Prefer
hard alignment
strong hierarchy
meaningful spacing
larger charts, fewer charts
1 chart = 1 question
fewer but clearer metrics
visible source/freshness/context

Engineering rules for Claude
1. Stop patching blindly
Before changing code, audit:
current component structure
state flow
data dependencies
what should be reused
what is too entangled and needs clean rebuild
Prefer clean rebuilds over preserving bad architecture.
2. Build data-first, not JSX-first
Every major section needs its own clean view-model layer.
Do not hardcode business logic into presentational components.
3. Make the architecture expandable
Sections like: