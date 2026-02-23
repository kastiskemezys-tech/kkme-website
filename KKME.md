# KKME — The Thesis
*Canonical document. Last updated: 2026-02-23. This is the source of truth. Change only when fundamental direction changes. Every build decision gets checked against this.*

---

## What KKME Actually Is

KKME is a personal infrastructure deal engine being built into a holding company — one asset, one project, one conviction at a time — at the intersection of European energy infrastructure, compute demand, and the technology transitions connecting them.

It operates in Baltic and Nordic markets, where grid bottlenecks, renewable surplus, cold-climate compute advantages, and a small, transparent, low-corruption market create a specific set of durable opportunities. Most players here follow. KKME is built to be ahead.

The website is three things simultaneously, each serving a different job:

**A personal intelligence instrument.** The daily operating surface. Signals, digest, technology tracking. Built for one person, calibrated to one person's way of reading markets.

**A reputation engine.** The thesis, written out with the conviction history visible. The track record of reading technology transitions correctly — hydrogen to LFP in 2021, LFP BESS to DC infrastructure before the Lithuanian market noticed — made permanent and public. Not a portfolio. Evidence of a specific kind of judgment operating over time.

**A dealflow attractor.** What draws in the right people: energy investors, infrastructure funds, technology companies looking for a European entry point, optimisers, traders, DC developers, asset owners. Not through SEO or content marketing. Through the quality of what's visible — the signals, the thesis, the sense that this operation has information asymmetry worth engaging with.

These three jobs live in the same site at different depths. You land on the thesis. You stay for the signals.

---

## The Audience

**Primary — Kastis.** Every element has one test: does this change what I think or do this week? If not, it doesn't belong.

**Secondary — The right outsider.** A senior partner at CIP, Macquarie, Meridiam, or similar. A technology company out of China or Europe looking for a Baltic/Nordic entry point. An optimiser or energy trader who understands what they're looking at. A DC developer who needs someone who knows the land, the grid, and the local politics.

These people arrive through referral or direct contact, not search. They open the site once, briefly. What they see either confirms something or doesn't. The confirmation: *this person operates at a different level, and they have access and relationships I don't.*

The site does not try to convert them. It does not explain itself. It does not have a contact form or a services list. It has the thesis, the signals, and a single point of contact.

---

## The Three Clocks

**The monthly clock — Signals S1–S5.** Market state. What are the structural conditions right now? Each signal runs at its natural cadence — some daily, some weekly, some monthly. Anchored in reference points: what is cheap, what is expensive, compared to historical baselines and comparable markets.

**The daily clock — LLM digest.** Anomaly detection. What shifted in how people are thinking and behaving? Clickable cards with links. The highly focused personal newsfeed of 2026. Lives visually adjacent to the signals.

**The 18-month clock — Technology Thesis Tracker.** Which technologies are crossing from science project to business idea? Updated when conviction changes, not on a schedule. The compounding judgment is the product.

Morning use: signal state in 90 seconds, digest in 5 minutes, thesis check when something moves. The site ends every session with one of three outcomes: nothing changed, act on something, or update a conviction.

---

## The Signals — Full Architecture

Every signal has reference anchors. Not just a number — but what is cheap, what is expensive, compared to what. PPA pricing comparables. Gas price context. Trailing indices. IRR potential as both pure math and sentiment from experts across LinkedIn, X, and news. The signal is only useful if it is grounded.

The site does not tell you what to do. It sets you on a short research path that might surface an idea or a business opportunity. It develops its own brain over time through corrections and additions.

---

### S1 — Baltic Price Separation
*ENTSO-E API | Daily*

LT day-ahead vs SE4 (Nordic reference), expressed as % spread with 90-day trailing context.

**Reference anchors:** Historical average separation 2020–present. NordBalt/LitPol Link utilisation as congestion proxy. LV/EE vs SE4 for comparison. Gas price overlay — when gas is high, the spread logic changes.

**IRR layer:** When S1 > 20%, the site computes indicative arbitrage value in €/MW-month for a standard 2h BESS, based on actual spread data. Directional, not a model.

**Thresholds:** Below 5% — low urgency. 5–20% — watch, congestion building. Above 20% sustained — act, real IRR in this corridor.

**Sentiment overlay:** LLM-scored mentions of Baltic price separation from the daily digest, scored on opportunity framing.

---

### S2 — Balancing Market Tension
*Litgrid / Nord Pool FCR-D | Weekly*

FCR-D capacity clearing price + aFRR activation frequency, 30-day rolling.

**Reference anchors:** 12-month price range. FCR-D prices in SE/FI/EE. PPA floor pricing for BESS — what revenue floor do optimisers need to make economics work.

**IRR layer:** At current S1 + S2 combined, estimated blended €/MW-month revenue for a standard BESS asset. The number that moves conversations with investors and developers.

**Thresholds:** Below €5/MW/h — marginal. €5–15 — viable. Above €15 sustained — push projects, equipment timing matters.

---

### S3 — Lithium Cell Price + China OEM Pulse
*Benchmark Mineral / Infolink / scraped OEM announcements | Weekly*

Two inseparable components.

**Price component:** LFP cell spot ($/kWh) 18-month chart. Lithium carbonate spot overlay as leading indicator (~60 day lag). "Last quote on file" reference line — the gap between market and current supplier terms.

**China OEM pulse — the tracker that doesn't exist elsewhere:**

Weekly mention velocity and sentiment across BYD, CATL, EVE Energy, Sungrow, Huawei FusionSolar. Sources: PV Tech, Energy Storage News, Electrive, LinkedIn, X, Chinese-language press via translation.

What it watches:
- Which companies are mentioned *more* than last month — early position shift signal
- New products approaching commercial readiness (sodium-ion, semi-solid, next-gen LFP)
- EU market entry signals — partnerships, certifications, distributor appointments
- Delivery or supply chain stress indicators

**EU alternatives watch:** When China sentiment turns negative (geopolitical, tariff, quality signals), the tracker surfaces EU manufacturers gaining ground. The window opens precisely when Chinese OEM trust degrades.

**Thresholds:** Cell price falling >5% over 60 days — no urgency. Stable at cycle low — push OEM conversations. Rising >5% over 30 days — close pending LOIs now. New OEM product near commercial — initiate contact before competitors.

---

### S4 — Baltic Grid Connection Scarcity
*VERT Leidimai Plėtoti + Litgrid reservation map + bond payments | Monthly (last day of month)*

**What gets scraped:** New VERT additions by technology type (solar, wind, BESS, hybrid, other). Litgrid capacity reserved vs available at 110kV nodes in target zones. Ketinimų protokolai bond payments — who committed real money.

**The analysis:** Pipeline MW by type vs current energy mix share and consumption growth. A formula-based overbuild indicator — when a category is becoming oversupplied relative to grid absorption capacity. Bond payment tracker: who paid, what technology, what zone — these are the projects that actually get built.

**Output:** Monthly state report. One scarcity score (1–5), change from last month, one-paragraph interpretation. Manual override field for private intel that adjusts the score.

**Thresholds:** 1–2 — connections available, originate. 3 — queue building, permits carry premium, flag to investors. 4–5 — scarcity is structural, acquisition and JV angle opens.

---

### S5 — DC Power Viability Index
*ENTSO-E (reused) + DataCenterDynamics + EU policy tracker | Monthly*

Not hype-driven. The basic inputs that make a data center worth considering — the numbers needed to go back to DC developers, investors, and offtakers with a grounded case.

**Core inputs:** Baltic all-in power cost (spot + grid tariff + taxes). PUE benchmark for cold-climate (1.15–1.25 for Lithuania). Effective compute power cost = power price × PUE × 720h. Same calculation for AMS/FRA/DUB as reference markets.

**Pipeline reality check:** Announced DC MW in LT/LV/EE vs confirmed under-construction. The gap between announced and building is the opportunity indicator. EU strategic infrastructure policy signals.

**Viability threshold:** Baltic compute cost < €70k/MW IT-month AND available grid connection → economics work, origination conversations warranted. Announced pipeline gap > 500MW AND under-construction < 30% of announced → capital is searching for execution.

**What this is not:** a hype tracker. No speculative projections. Only numbers a serious DC investor would use to decide whether to proceed.

---

## The Daily Intelligence Layer

Every day, a scraper pulls from a curated source list. An LLM processes through the KKME anomaly detection filter. Output: 5–8 signal cards with links. Lives visually adjacent to the signals.

**Sources (curated):** LinkedIn — Baltic/Nordic energy developers, TSO officials, infrastructure fund partners, OEM executives. X — energy traders, policy analysts, technology journalists. News — ENTSO-E, Litgrid, DataCenterDynamics, PV Tech, Energy Storage News, Recharge News, EU Commission energy/digital infrastructure, Chinese OEM press translated. Undecided.tech and similar long-form technology sources — the "is this becoming a business idea?" layer.

**The filter — behaviours, not topics:**
- Cross-sector actor showing unexpected interest
- Money committed but execution blocked
- Credible operator saying something out of character
- Someone who lost money here speaking carefully again
- New technology crossing from science project to commercial announcement
- Consensus forming with zero risk language (exit signal)
- All upside, no stress-testing (narrative, not a deal)

**Card format:** Source → Anomaly type → Why it matters → Which signal it connects to → Link

---

## Technology Thesis Tracker

A living conviction document. Not a research database. Not comprehensive coverage of every technology. A maintained set of bets — tracked because they could change what KKME builds, funds, or moves toward.

**The methodology:** LCOE and LCOES analysis as the primary filter. IEA, IRENA, and sector reports read with scepticism — checked against reliability signals: actual opex in deployed projects, capex trajectory, resource availability, supply chain maturity, grid integration reality. A technology is interesting when the LCOE curve is moving fast enough that the deployment window is visible within 36 months in Baltic/Nordic conditions.

**Per bet structure:**
- Thesis (one sentence — what it is and why it matters here)
- Conviction: Watching / Building / Committed / Fading
- What moved it to this state (specific, dated signal)
- The LCOE/cost inflection that changes the math
- Next signal to watch

**Technology categories tracked:**

*Energy storage (core)*
LFP batteries. Sodium-ion. Solid-state. Long-duration (iron-air, gravity, compressed air). Flow batteries. The question for each: is LCOES dropping fast enough to change project economics in Baltic markets within 24 months?

*Generation and grid*
Small Modular Reactors / Micro Modular Reactors — tracking real deployments vs announcements. Offshore wind (Baltic Sea, post-2027 lens). High-voltage infrastructure, cables, copper — the physical backbone of any grid expansion. Grid congestion signals from the Nordics as leading indicators for Baltic grid investment needs.

*Electrification signals*
Industrial heat pumps — where is the cost curve, which industries are crossing the threshold? Cooling technologies — data center cooling specifically, where efficiency improvements change DC economics. Anything signalling GO for industrial electrification in EU manufacturing recovery.

*Compute infrastructure*
AI hardware — not the models, the physical layer: power density per rack, cooling requirements, grid connection profiles. What the next generation of compute actually needs from infrastructure. Capital flow into EU sovereign compute as a leading indicator for land and power origination.

*EU economic signals*
Recovery metrics that indicate when industrial capex cycles restart. Energy intensity trends across EU industries. Policy signals that change what gets funded — REPowerEU, Net Zero Industry Act, defence infrastructure spending.

*Water and climate*
Desalination technology cost curves — watching for Baltic/Nordic relevance. Water scarcity signals and their infrastructure implications. Climate change indicators that are still driving real capital (not narrative capital). Where climate tech is crossing from policy-dependent to economically self-sustaining.

*Hydrogen*
Watching only. Green hydrogen below €2/kg at scale is the threshold. Electrolyser cost curves tracked. Not a 2026 play for this market.

**The history of conviction changes is visible.** When a technology moves states — from Watching to Building, or from Building to Fading — the date and the specific signal that moved it is recorded. This is the track record. The Vilnius BESS story starts here, in 2021, with a hydrogen bet that faded when LFP curves made it clear. That record is more valuable than any credentials page.

**Sources used:** IEA World Energy Outlook and special reports. IRENA cost data. BloombergNEF technology cost curves. Lazard LCOE analysis. Undecided.tech and similar long-form practitioners who track whether something is a science project or a real business. Chinese OEM announcements (feeding directly into S3). EU Commission policy documents. Direct conversations — suppliers, developers, researchers.

---

## Dealflow Architecture

No contact form. No services page. One direct email or LinkedIn link at the bottom of the thesis. The people worth reaching out will find it.

**What the site communicates without saying it:**
- I have information you don't have (signals are live, not mocked up)
- I have been right about timing before (thesis track record is dated and specific)
- I have relationships and execution capability rare in this market (biography, stated simply)
- I am already doing this (present tense, not aspirational)

**Who comes through this channel:** Senior capital allocators wanting Baltic/Nordic project sourcing or leadership. Technology companies wanting a European pioneer who already has the relationships to introduce them credibly. Optimisers and traders wanting a market-connected structuring partner. Asset owners and developers with a stuck project.

---

## Design Brief — Non-Negotiable

**The four references: Overfinch Heritage restomod, Scandinavian furniture, Italian Tuscan manor houses, David Lynch / Twin Peaks.**

**What they share:**
Nothing tries to impress you, but everything does. Function is the aesthetic. Materials have age and weight — patina, stone, things that look like they have been here longer than you. There is always something operating just beneath the surface that you cannot quite name. The room knows more than it is showing.

**The feeling at 5 seconds:** *This person has information I don't have.* And a slight unease — as if you found something that wasn't made for you to find.

**Typography (locked):**
- Cormorant — the primary voice. Age, weight, Tuscan stone. Not an accent. The dominant type for anything carrying meaning.
- DM Mono — data, numbers, timestamps. Precise, cold, honest.
- Unbounded — sparingly. Headings only. The modern tension against aged Cormorant.

**Colour (locked):**
- Background: `#07070a` — near-black with depth, not pure black
- Primary text: `#e8e2d9` — warm off-white, aged paper not screen
- Accent: `#7b5ea7` — purple, neither warm nor cold
- Data states: muted, not traffic-light. CALM in grey-green, WATCH in amber, ACT in deep warning red
- No gradients on data. No glow effects.

**Motion (Lynch principle):** Animation only on state changes. Numbers count up on load, once, slowly. Digest cards appear one at a time with a pause, as if being placed. Nothing pulses unless it is telling you something changed. The site watches the market — it does not perform.

**The Overfinch principle:** Every element that exists has a job. Materials exceptional. Nothing decorative. If you removed it, something functional would be missing.

**Built to change.** The site is not a launch-and-forget project. It is used daily, which means it will be corrected daily. The architecture must make updating signals, adding a technology bet, adjusting a threshold, or rewording the statement a 5-minute job, not a deployment event. Components are modular. Content is separated from structure. As AI coding tools improve, the site improves with them — this is a company website built for the way software is actually developed now, not how it was built five years ago.

**Modern and of this moment.** The site should be visually datable to 2026 — not in a trend-chasing way, but in the way that a well-built object always reflects when it was made. This means: fluid typography that responds to viewport. Subtle grain and texture layers that signal craft, not template. Real-time data that visibly refreshes. An LLM digest that is clearly generated by AI, not mimicking a human editor. Micro-interactions that feel considered — not decorative animation, but feedback that confirms the site is alive and working. The kind of details that make a technically literate visitor think: whoever built this knows what is possible right now and chose it deliberately.

**What the site does not have:** Navigation beyond core sections. About page. Services list. Case studies. Contact form. Mobile-first layout (desktop instrument; mobile readable). Template DNA.

---

## Site Structure

**One page. Public. No password.**

The console IS the homepage. Anyone who visits kkme.eu sees the signals, the digest, the technology tracker, what KKME is working on today. Not a brochure — the actual instrument, running live, in public. The boldest possible statement: I have nothing to hide and everything to show.

**Page flow, top to bottom:**
1. The KKME statement
2. S1–S5 signals with reference anchors and IRR context
3. Daily digest cards with links
4. Technology thesis tracker with conviction history
5. Contact — direct email and LinkedIn, nothing else

**No other pages. No navigation. One URL.**

*The KKME statement:*
KKME builds infrastructure Europe actually needs — energy storage, grid capacity, compute, the physical layer underneath everything. Operating in Baltic and Nordic markets where the bottlenecks are real and most people are still waiting for someone else to go first. New technologies get used when they work, not when they're fashionable. The thesis compounds. The assets grow.

---

## What Not to Build

Database before all 5 signals are live. Separate homepage. More than 5 signals. Authentication system (unlisted URL is enough). Any copy that explains KKME to someone who needs explaining.

---

## The Arc

Short term: console live with real data, digest running, thesis public.

Medium term: the instrument itself is the proof-of-work.

Long term: a holding company with assets. Equity in data centers, BESS projects, grid infrastructure, technology companies. Built by being the person who sees the ripe moment first and has the execution capability to move on it, in a market where most people wait for someone else to go first.

The website is the operating surface. The thesis is the reputation. The signals are the edge.

---

*End of thesis. When in doubt, come back here before changing anything.*
