# Report intake checklist

The questionnaire that makes a report *tailored* rather than *generic*. Run it before
anything is generated.

**Three answer states, and the third is the one that matters:**

| state | meaning |
|---|---|
| **required** | the report cannot be produced without it |
| **optional** | improves the report; absence changes nothing else |
| **defaults-with-disclosure** | a documented default is used **and the report says so, on the page where the number appears** — not in an appendix |

The third state exists because the alternative is a report that looks fully specified and
is not. A default silently applied is indistinguishable from a client-supplied figure once
it is printed, and the reader has no way to tell which numbers they told us.

**Section E drives which sections are emitted at all.** A report written for a lender and
a report written for an internal investment committee are not the same document with a
different cover.

---

## A · Project & sponsor

| # | Item | State | Notes |
|---|---|---|---|
| A1 | Project name / working title | **required** | Appears on the cover |
| A2 | Sponsor / developer legal entity | **required** | Named entities need a registry-traceable source (discipline rule #3) |
| A3 | Site location — country, TSO/DSO connection point | **required** | Determines which market's data applies |
| A4 | Development stage | **required** | Permit / connection agreement / FID / under construction |
| A5 | Target COD | **required** | Drives escalation and the price-curve vintage |
| A6 | Ownership structure, equity split | optional | |
| A7 | Prior transactions or comparable assets held | optional | |

## B · Technical

| # | Item | State | Notes |
|---|---|---|---|
| B1 | Power rating (MW) | **required** | |
| B2 | Energy capacity (MWh) / duration | **required** | 2h and 4h are the characterised anchors |
| B3 | Cell chemistry and supplier | defaults-with-disclosure | Defaults to the Tier-1 LFP warranty envelope |
| B4 | Round-trip efficiency at BOL | defaults-with-disclosure | Defaults to the NREL ATB / warranty envelope value for the duration |
| B5 | Degradation warranty — cycles, SOH floor, term | defaults-with-disclosure | **Below 1.0 cycles/day the model is extrapolating outside its characterised range** (B-064). If the operating profile implies less, say so in the report rather than quoting a curve |
| B6 | Auxiliary consumption | defaults-with-disclosure | |
| B7 | Availability / planned outage assumption | defaults-with-disclosure | |
| B8 | Grid connection capacity and any curtailment terms | **required** | |

## C · Commercial & offtake

| # | Item | State | Notes |
|---|---|---|---|
| C1 | Route to market — merchant, tolling, floor | **required** | Changes the revenue model, not just its inputs |
| C2 | Any contracted revenue: term, indexation, counterparty | **required if it exists** | **Contracted figures and counterparty names never leave the private tier** |
| C3 | Balancing-market participation — which products | **required** | FCR / aFRR / mFRR / DA arbitrage |
| C4 | BRP and route-to-market fee structure | defaults-with-disclosure | |
| C5 | Ancillary qualification status | optional | |

## D · Financing

| # | Item | State | Notes |
|---|---|---|---|
| D1 | Total CAPEX, and what is in scope | **required** | State whether grid connection and land are included |
| D2 | Grant or support-scheme award | **required if it exists** | |
| D3 | Target gearing | defaults-with-disclosure | |
| D4 | Debt tenor and amortisation profile | defaults-with-disclosure | |
| D5 | Margin, base rate, hedging | defaults-with-disclosure | Base rate defaults to the live 3M Euribor with its as-of date shown |
| D6 | Covenant package — DSCR, LLCR, lock-up | defaults-with-disclosure | Drives the covenant line on the DSCR chart |
| D7 | Required equity return | optional | |

## E · Audience & purpose — **this section decides what gets written**

| # | Item | State | Notes |
|---|---|---|---|
| E1 | Primary reader | **required** | Lender · equity IC · board · counterparty. Sets the whole register |
| E2 | Decision the report supports | **required** | Credit approval reads differently from a screening memo |
| E3 | Sections to include / exclude | **required** | Drives which `{{SECTION:...}}` slots are emitted |
| E4 | Sensitivity set the reader expects | **required** | A lender's downside case is not our stress scenario unless they say it is |
| E5 | Confidentiality marking | **required** | Printed on every page |
| E6 | Delivery format and date | **required** | |

## F · Data provided by the client

| # | Item | State | Notes |
|---|---|---|---|
| F1 | Financial model, if one exists | optional | If provided, reconcile and **report the differences** rather than silently adopting either |
| F2 | Technical DD or OEM quotes | optional | Supersede B3–B7 defaults where present |
| F3 | Grid connection agreement | optional | Supersedes B8 |
| F4 | Term sheets | optional | Supersede D3–D6 |
| F5 | Permission to cite any of the above | **required if F1–F4 provided** | Determines what can appear in the report versus what informs it privately |

---

## Before generating

- [ ] Every **required** item answered, or the report is not generated.
- [ ] Every **defaults-with-disclosure** item that fell back to a default is listed, and the
      disclosure appears **on the page where the number appears**.
- [ ] Section E answered — the emitted section list is derived from it, not assumed.
- [ ] Nothing from C2 or F1–F4 is in the repo, the build output, or any chart's source line.
- [ ] Every chart's `source` argument names a real dataset with an as-of date. The chart kit
      throws without one; that is a floor, not a check.
