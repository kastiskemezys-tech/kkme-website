# Phase 53 — B-076: the compression trajectory has been frozen since April

**Branch:** `phase-53-s2-activation`. **Semi-autonomous — CP before any number moves. Box 3-4 h.**
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

**Why this is the day's centrepiece.** `s2_activation` has been 105 days stale, feeding `deriveCompression`, so the compression trajectory sitting under the revenue projection has not moved since April. It was invisible until Phase 49 gave it a threshold and the follow-up made it ageable — a gate paying for itself inside a week.

**Direction is already established and it is the uncomfortable one: published projections are UNDERSTATED** — revenue, IRR and NPV low, LCOS high. This is the first correction in weeks that runs in our favour, which means it carries the highest evidential burden of anything shipped this month. **Slow is correct here.**

---

## 1 · The basis question comes FIRST, before any number

The previous session measured a controlled comparison (one aggregation, four months, same dataset and columns) and found the decline stopped: 6.92 → 3.46 (April, the bottom) → 5.00 → 5.00. It also found its own medians sit on a **~3× different basis** from the payload's series, and correctly refused to give a magnitude.

- Establish **which basis is right and why**, from `computeS2Activation`'s own parse over fresh BTD data. Not by scaling one side to meet the other (that is fitting, not measuring), and not by picking the one that looks familiar.
- State the basis explicitly: what is being averaged, over what population, in what units, at what resolution. If the payload's basis turns out to be wrong, that is a second finding and it gets its own delta.
- **Do not proceed to §3 until §1 is settled.** A 54-config delta computed on an unestablished basis is a number that will have to be withdrawn.

## 2 · Fix the path, so this cannot recur

BTD is reachable from a laptop (0.98 s) and from the VPS (0.15 s), and unreachable **only from the Cloudflare edge**. `s2` already works around this with a VPS leg; `s2_activation` has none, which is the entire reason 105 minutes became 105 days.

1. Give `s2_activation` the same VPS leg, through the admission rule that landed in #159 — one path, freshness and quality ranked, a failure payload losing to a good value.
2. The per-tick "keeping cached data" log was TRUE every time and became a 105-day stall. That is the silent-skip class: a staleness surface and a transition alert, thresholds derived from its own cadence.
3. Prove the fallback by forcing it, not by waiting for it.

## 3 · The measurement — a 54-config signed delta

Once §1 is settled and §2 is serving fresh data:

- Full delta across all 54 public configurations plus the client portfolio: gross Y1 · project IRR · equity IRR · min DSCR · LCOS · NPV, with the compression trajectory before and after.
- Baseline from a clean worktree of the reference commit against one frozen KV snapshot (C6 — never a stash; the one-process `git show <ref>:` probe is the established method).
- **Decompose:** how much of the movement is the data being fresh, versus the basis correction if §1 found one? Two causes in one number is how attribution dies.
- State the direction plainly at the top of the table. If IRR rises, lead with that.

## 4 · The modelling artefact worth naming

The frozen series **ends at the bottom of a decline and extrapolates ~15 %/yr forward from there**. That is a clean example of a stale input being worse than a missing one — a missing input fails loudly; a stale one silently asserts that April's trough is the permanent state of the market. When this ships, that goes in the methodology as its own line, because a lender's analyst will ask what happens when an input stops updating and "we would notice" is a weak answer without an example.

## STOP conditions
- The basis cannot be established from primary data → stop, report both candidates with their derivations, and do not ship a delta.
- The fresh series turns out to disagree with the controlled comparison's direction → stop. A reversal means one of the two measurements is wrong and guessing which is not available.
- Backfill would require reconstructing data BTD no longer serves → report the recoverable window in days.

## CP
The basis with its justification · the delta table with the two causes separated · the recovered series against the frozen one · what the methodology line will say.

## Gates
`/revenue` 54/54 byte-identical until the signed CP · fallback proven by forcing it · every new threshold and alert proven failable · gates declare preconditions and fail UNRUNNABLE when unmet (B14) · scanning gates run their positive control (B15) · `docs/_private/` never staged · NDA gate on every commit.

## Wrap
Origin-SHA · the basis finding · the decomposed delta · recoverable-window figure · the methodology line · PR URL.
