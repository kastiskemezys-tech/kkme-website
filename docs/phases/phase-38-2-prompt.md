# Phase 38.2 — corrections sweep (7 mechanical · 5 copy · 2 number movements)

**Branch:** `phase-38-2-corrections` off latest main. **Semi-autonomous — CP before the number movements.** ~2-3 h.
**Input:** `docs/investigations/2026-08-02-phase-38-sync-audit.md` §5 fix queue, plus B-056. Everything here was confirmed at code level in the audit; nothing needs re-litigating, but every claim gets re-checked at execution time (A3).

Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Order is deliberate and must hold: mechanical → copy → numbers.** The corrections all cut in the unflattering direction, and shipping them before 38.3's IRR-raising cutover is what establishes the sweep cuts both ways. Each stage is its own commit.

---

## Stage 1 — mechanical (no public number moves, no copy changes)

The seven from §5, with the headline one first:

1. **The `/s4` 10-field whitelist drops `baltic_weighted_mw`.** 36.D's canonical S/D caption is guarded on that field, so it has never rendered — both call sites fall through to the generic string, and the quarantine tooltip reads "Includes 0 MW flagged _quarantine (Kruonis PSP, BSP Hertz 1, …). Strict-verified count: —". **A shipped, signed-off fix has been dark since 36.D.** Fix the whitelist, then prove BOTH surfaces render — this is a shipped-but-unreachable failure, so the test must assert the rendered output, not the field's presence (B13).
2. **ALL-N on the same shape (A7):** enumerate every field the assembler drops and every consumer guarded on a dropped field. One whitelist hid one fix; report whether it hid others, with the search command and count.
3-7. The remaining mechanical items per §5, each with its verification command in the commit message.

## Stage 2 — public copy (no number moves)

1. **`FLEX FLEET 782 MW (BESS + pumped hydro)`** — `fleet.countries` contains zero pumped-hydro entries; 547 + 99 + 135.5 = 781.5 is pure BESS. Correct the label in all three places.
2. **`Kruonis flex share 131 MW`** — computed as `max(0, 782 − 651)`: a fleet-tracker-over-registry gap relabelled as a 205 MW asset that appears in NEITHER population. **Rule #2 on a live public surface.** Remove it, or replace it with something the code actually computes and can name honestly. Do not invent a substitute metric to fill the slot.
3. **RenewableMix and ResidualLoad cite "ENTSO-E"; their payloads say `source: energy-charts.info`.** Fix the citations to match the payload (rule #3 — the citation names the source we actually read).
4-5. The remaining copy items per §5.

Locked design principles apply: no editorial state labels, sparse drawer prose, numbers first.

## Stage 3 — the two number movements (CP BEFORE these ship)

**3a · LV installed — reconcile, do not adopt by majority.** Four artifacts disagree: canonical `storage_by_country.LV.installed_mw` = 40 · `coverage_note` = 80 · `assets[]` sums to 80 · `fleet.countries.LV.operational_mw` = 99 · `metricRegistry.ts:52` says "Rēzekne (60) + Tume (20) = 80". Resolve against PRIMARY sources per asset with citations (rule #3), explain the 99, and state which population each number describes. The result propagates into `baltic_total` (651 today). Private-tier data plays no part: the 41 candidates and 105 private rows stay out.

**3b · B-056 — `updateHistory` never deduped.** `s1_history` is 90 rows over 8 distinct dates while `rollingStats` publishes `days_of_data: 90`; `swing_stats_90d` drives PeakForecastCard's dot colour and interpretation sentence. 38.1 stopped the stray-traffic half; the cron's own ~6 rows/day remains.
- **The enumeration is DONE (38.1) and it moved the target — read this before scoping.** The S1 card's "30-DAY TRAILING DISTRIBUTION … DAYS 30" is HONEST: it reads the deduped `s1_capture_history` (30 rows / 30 dates), so the hero P50 always sat on a real distribution. The live defect is elsewhere: **SpreadCaptureCard's "14D swing history" sparkline currently resolves to fourteen rows of a SINGLE date** — a rule-#2 defect on a rendered chart, not percentile drift. Fix that first and assert on the rendered series (distinct dates ≥ n), not on the row count.
- **State the intended semantic before implementing:** one row per market day, keep-last, is the obvious candidate for a 4-hourly cron, but it is a decision to declare, not to infer.
- Measured delta so far: `lt_swing` p25 142.83 → 147.04 · p50 153.10 → 157.47 · p75 204.22 → 208.15 · n 90 → 8. Re-measure at execution time; the numbers move as data lands.
- Backfill question to answer explicitly: does history get rebuilt from `raw:s1:<date>` where those keys survive, or does the series simply start being honest from here? Say which and why — a distribution whose n drops 90 → 8 is a credibility statement either way.

**CP:** delta table for both movements — pre, post, absolute, %, named cause, and which public surfaces change. I sign before they ship.

## Gates
`/revenue` 54/54 byte-identical for stages 1-2 (and for stage 3 except where the signed delta says otherwise) · every rendered-output claim asserted on rendered output, not field presence · `docs/_private/` never staged · no private-tier value in any public payload · suite green · eslint delta zero · deploy from main after origin-SHA equality, verified per C8.

## Wrap
Origin-SHA · the ALL-N whitelist enumeration · both dark surfaces proven rendering · the copy diffs · the `s1_history` figure enumeration with distinct-date counts · the signed delta table as shipped · PR URL.
