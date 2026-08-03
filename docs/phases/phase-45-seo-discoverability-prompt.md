# Phase 45 — technical SEO and discoverability

**Branch:** `phase-45-seo-discoverability`. **Autonomous, box 2 h. No deploy. PR open, no merge.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in the DECISIONS entry.

**Why.** kkme.eu is the public argument for everything behind the gate, and its discoverability has never had a deliberate pass — the canonical-tag fix earlier this year was reactive, prompted by a Search Console screenshot. A site whose whole value is being the reference for Baltic storage economics should be findable when someone searches for exactly that.

**Constraint that overrides every SEO instinct: nothing gated becomes indexable, and no editorial claim gets invented for a meta description.** Locked design principles apply to anything a human will read.

---

## 1 · Audit first, fix second (verdict per item, with the evidence command)

- **Indexability:** `robots.txt`, `sitemap.xml` (does it exist, is it current, is it referenced), canonical tags per route (the earlier fix was per-route — verify it held), `noindex` where required.
- **The gate:** `/calculator` and `/fleet` must be `noindex, nofollow` and absent from the sitemap. **Verify no gated payload is reachable to a crawler** — this is a leak test, not an SEO check, and it is the one item here that is a defect if wrong.
- **Metadata:** title and description per route — unique, accurate, no invented claims. Report every route sharing a title or missing a description.
- **Structured data:** `Organization`, `WebSite`, and — where honestly applicable — `Dataset` for the published market series. Dataset markup is the highest-leverage item on this list for a market-intelligence site, but only for series we actually publish with a stated licence and update cadence. **Do not mark up something we do not really publish.**
- **Open Graph / social cards:** per route, with an image. A link to kkme.eu pasted into Slack or LinkedIn currently renders as what?
- **Internal linking:** the Phase 38 audit found structure → returns has no bridge and the reference asset never mentions the calculator. Report the link graph and the orphan pages.
- **Core Web Vitals** measured, not assumed: LCP, CLS, INP on the heaviest route (the hero map and chart canvases are the suspects). Report numbers with the method used.
- **Crawl reality:** what does a crawler actually see on a client-rendered route? Fetch as a plain HTTP client and report whether the content is in the HTML or only after JS.

## 2 · Content-shaped findings (report, do not write)

List the pages that *should* exist for the queries this site should own — Baltic BESS revenue stacking, aFRR/mFRR/FCR mechanics, LT/LV/EE fleet status, connection queues, imbalance settlement — and which of those we already have material for in the methodology, drawers or evidence base. **Do not write the pages.** The output is a prioritised list with the existing source material named, so the operator can decide voice and scope.

## 3 · AI discoverability

`llms.txt` (or the current equivalent — verify the convention rather than assuming) describing what the site publishes, its update cadence, and its citation preference. For a data-publishing site this is the analogue of a sitemap for model-driven readers, and it is cheap. Include an explicit statement of what may be cited and how we would like to be attributed.

## 4 · Search Console hygiene
List what would need checking in Search Console (coverage, enhancements, manual actions) as an operator checklist — you cannot log in, and should not try.

## STOP conditions
- Any gated content is discoverable → **stop everything and report it immediately at the top of the night's report**; treat it as the highest-severity finding of the run.
- A fix would change rendered copy a human wrote → propose it, do not apply it.

## Gates
No gated route indexable · no invented claim in any metadata · `/revenue` untouched · rendered-output assertions for the tags you add (not just field presence) · `docs/_private/` never staged.

## PR body
The audit table with verdicts, the CWV numbers with method, what was fixed vs proposed, and the prioritised content list with existing source material named.
