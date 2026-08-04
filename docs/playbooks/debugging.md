# Debugging playbook — the defects that publish instead of throwing

**Status:** LOAD-BEARING. Compiled 2026-08-04 from Phase 49, whose five defects shared one signature. Companion to `docs/playbooks/failure-modes.md`: that page is about how prompts, execution and process go wrong; this one is about how *code* goes wrong in a way no exception surfaces.

The one-sentence version: **the dangerous defect is not the one that throws — it is the one that returns a plausible number.** An exception stops the pipeline and names itself. A plausible number is published, rendered, screenshotted, put in a deck, and believed.

Phase 49's five were: a parser that returned 190 values for a 96-slot day and averaged them; a solver that returned its own bracket bound as a rate; a fallback that emitted 19 fewer keys with a 200 status; a back-derivation that published €818/MWh as an observed input; five scheduled writers that could stop for a week unnoticed. **Not one of them raised an error. All five published.**

---

## The six rules

### 1. Prefer assertions on cardinality, shape, dimension and range over try/catch

`try/catch` catches what the runtime already knows is wrong. These defects are wrong in ways the runtime finds perfectly reasonable — 190 floats is a valid array, `2` is a valid number, a 59-key object is a valid object.

So assert the properties the *domain* requires, at admission:

| Property | The question | Phase 49 instance |
|---|---|---|
| **Cardinality** | how many values should this have? | a market day is 23, 24 or 25 hours; slots = span ÷ its own declared resolution. 190 is not a market day |
| **Shape** | which keys must be present? | a fallback payload declares every key the primary declares — null for what it cannot compute |
| **Dimension** | what are the units on both sides of this `*`? | `trading_fraction` is EUR/EUR and `da_mwh_per_mw_day` is MWh/MW/day; `workers/lib/units.js` declares both |
| **Range** | what values are possible at all? | an IRR outside [−99.99 %, +200 %] is a broken input, not a return |

Every series knows how many values it should have. Every payload knows its shape. Every ratio knows its bounds. Where the code does not know, that is the finding.

**Corollary — state what the guard cannot see.** Phase 49 deliberately did *not* assert a maximum forward-fill fraction on A44 days: a genuinely flat price day legitimately omits most of its positions under curveType A03, and the document alone cannot distinguish that from a broken one. A guard that overstates its reach is worse than none, because it converts "unchecked" into "checked" in the reader's mind.

### 2. An independent external control is the only reliable oracle

Two of our own components agreeing proves nothing (failure-modes B5). Both may share the error; frequently both *do*, because one was written from the other.

A control is independent when it is a different operator, a different API and a different transport. Elering versus ENTSO-E caught the A44 parse (2/96 slots agreement versus 96/96). The German TSOs' own CSV caught B-036. Known-terminated entities caught the registry detector.

**Name a control per data path**, and keep it standing rather than reaching for it once. The check that found the defect is the check that stops it coming back.

**And a control must discriminate** (B11). Before trusting a source, run a known-good probe and a nonsense probe and confirm they return *different* responses. Phase 49's S3 diagnosis rests on exactly this: the same URL and the same three headers returned HTTP 200 in 0.14 s from a laptop, HTTP 200 in 0.10 s from a Hetzner datacenter, and a 20-second hang from a Cloudflare Worker. Three networks, one difference — which is what narrowed the cause to the egress path and ruled out the upstream, the headers, and datacenter blocking in general.

### 3. Fallback and error paths are where defects live

They are exercised rarely and reviewed never. Every one of Phase 49's fallbacks was broken, and `/revenue` has three:

- the v6 fallback emitted 19 fewer top-level keys, with a 200 status;
- the capture back-derivation published a number 8.03× too high in a field named `signal_inputs`;
- the LCOS charge price silently substituted a constant for an observation.

**Assert shape-equality with the primary path.** **Test the fallback by FORCING it, not by waiting for it** — delete the input it depends on and run the real function. `fallbackShape.test.ts` does exactly that, twice, for two different fallbacks.

**And a degraded payload must say it is degraded.** Absence of provenance is an error state, never an innocent one (failure-modes B12). A fallback that is indistinguishable from a healthy response is worse than one that fails, because the failure is now silent *and* confident.

### 4. Every solver must distinguish converged from bounded

Returning a bound as a value is the numerical analogue of catching an exception and returning a default.

A bisection is only valid inside a bracket that **straddles** a sign change. Assert that before iterating; return null with a reason when it does not. Then assert the *result* independently — a root is where the residual is zero, checked against the problem's own scale. Two assertions, one about the input and one about the output, so a defect has to defeat both (B13).

Distinguish these, because they are different facts and must not share a label:

- **no solution exists** (no sign change at all)
- **a solution exists outside the domain we search** (record which edge)
- **multiple solutions exist** and there is no such thing as "the" answer
- **converged**, and here is the residual

Phase 49's cost was the failure to distinguish them: `irr_status: 'uneconomic'` on 47 of 54 configurations meant "the solver ran to its lower bound", not "this project loses money". A claim about the world was being made by a claim about the arithmetic.

**Enumerate every solver in the codebase, and include the ones that pass.** A guard that is only a list of things to fix teaches nothing about what right looks like. `sizeDebt` returns its upper bound too — and it is correct, because that bound is a meaningful answer ("the cash flows service the whole capex") and it is reported as `binding_constraint`.

### 5. A failure payload must never satisfy a freshness check

Writing "I failed" is not writing data. If the failure path stamps a fresh timestamp, the staleness clock resets on every failure and the key can never age — the damage disables its own detector while the monitor reassures (B12).

Freshness therefore needs two independent signals: **age** and **self-reported degradation**, composed. Either alone would have missed Phase 49's live S3 failure, which was 0.6 hours old and completely broken.

Generalise it: **enumerate every key a scheduled job writes and assert each has (a) a staleness threshold derived from its own cadence and (b) an alert wired to it.** Report the ones with neither — Phase 49 found five, four of them backing the homepage. A threshold copied from a weekly key onto an hourly one passes a "has a threshold" check and is useless, so assert that an hourly key goes stale in hours.

### 6. Reproduce before fixing; capture pre-state before reproducing

C3, every time, and in that order.

The pre-state is a **committed artifact** produced from a **clean worktree of the reference commit** against **one frozen fixture** — never a `git stash` round trip (C6), never conversational memory (C4). Later deltas are then a subtraction from a file, not a claim in a handover.

**And re-measure at execution time.** Every figure inherited from a prior run is a hypothesis (A3, A9). Phase 49's prompt predicted `lt_avg` 75.43 → 65.32; measured, the corrected value is 69.15 on the market-day basis and 73.67 on the UTC-day basis, and *on the day the fix ran the movement was zero* because that day's document happened to be clean. The €-level defect is intermittent; the two-hour error in the hour labels, which nobody had predicted, is not.

---

## The tell

If you are looking for defects of this class and want somewhere to start, look for these shapes:

```
??  something                  a bound used as a fallback value
|| 0                           null coerced to a number
Math.round(x * 1000) / 10      NaN or 0 when x is null
lo = mid; ... return lo        bisection with no bracket precondition
prices.length                  a count nothing compares against a calendar
catch { return DEFAULT }       an error path that produces data
timestamp: new Date()          stamped on the failure path too
idx * 24 / N                   an index treated as a clock
```

Each one is a place where the code answers a question it does not have the information to answer. That is the whole class.

---

## What Phase 49 did not close

Honest limits, so the next reader does not mistake the page for a finished job:

- **B-072** — the TE scrape's hang from Cloudflare egress is narrowed to the egress path with a three-network control, and the mechanism is *not* established. A fix without a mechanism is a guess with tests.
- **B-069** — the `computeBaseYear` unit residue is scoped and measured but not fixed; it moves a published diagnostic and needs its own signed delta.
- **B-075** — `computeHistorical` pairs two bidding zones by array index across 30-day ranges. Found while scoping item 1 and deliberately left out of it, so the two deltas stay attributable.
- The **root-multiplicity scan** detects root pairs separated by more than its step (0.005 in rate). Closer pairs are not detected. It finds ambiguity; it does not prove uniqueness.
