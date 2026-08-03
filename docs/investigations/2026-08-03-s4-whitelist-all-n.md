# The `/s4` fleet whitelist — ALL-N enumeration (Phase 38.2, stage 1)

**Question asked (A7):** the audit found ONE signed-off fix left dark by the `/s4` assembler's
10-field whitelist. Did the same whitelist hide others?

**Answer: it hid one fix completely, degraded two further surfaces, and three of the dropped
fields have no consumer at all.** Full enumeration below, with the commands and the counts.

Measured 2026-08-03 against `main` = `5eac48a` and the live worker; every figure re-derived at
execution time rather than quoted from the 2026-08-02 audit (A3).

---

## 1 · Every field the assembler dropped

The producer is `processFleet()` (`workers/fetch-s1.js:772-801`), whose output is stored verbatim
as the `s4_fleet` KV value by `POST /s2/fleet` (`:8891-8905`). The consumer was a hand-maintained
10-key projection at `:10417-10428`.

```
$ curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/fleet | python3 -c 'keys'   # producer
$ curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4       | python3 -c 'keys'   # consumer
```

| stored in `s4_fleet` | published on `/s4` (pre-fix) | live value at check |
|---|---|---|
| `countries` | ✅ | 3 countries |
| `sd_ratio` | ✅ | 2.91 |
| `phase` | ✅ | — |
| `cpi` | ✅ | — |
| `trajectory` | ✅ | — |
| `baltic_operational_mw` | ✅ | 782 |
| `baltic_pipeline_mw` | ✅ | 15,239 |
| `eff_demand_mw` | ✅ | 752 |
| `product_sd` | ✅ | — |
| `updated_at` → `updated` | ✅ | — |
| **`baltic_weighted_mw`** | ❌ **DROPPED** | 2385 |
| **`baltic_weighted_net_mw`** | ❌ **DROPPED** | 2185 |
| **`absorption_mw`** | ❌ **DROPPED** | 200 |
| **`baltic_operational_mw_strict`** | ❌ **DROPPED** | 782 |
| **`baltic_quarantined_mw`** | ❌ **DROPPED** | 0 |
| **`non_commercial_mw`** | ❌ **DROPPED** | 80 |
| **`demand_basis`** | ❌ **DROPPED** | `{demand-forecast-module, v1.0.0, 2026}` |
| **`quarantined`** | ❌ **DROPPED** | `[]` |
| `demand` | ❌ dropped (correctly — operator override, never a display field) | `null` |
| `raw_entries` | ❌ dropped from `fleet` (correctly — republished as `d.projects`) | — |

**N = 8 wrongly dropped fields**, plus 2 correctly excluded.

## 2 · Every consumer guarded on a dropped field

```
$ grep -rnE "(absorption_mw|baltic_operational_mw_strict|baltic_quarantined_mw|baltic_weighted_mw\
|baltic_weighted_net_mw|demand_basis|non_commercial_mw)" app/ --include="*.ts" --include="*.tsx" \
  | grep -v __tests__ | wc -l
26      # across 5 files: SignalBar.tsx, HeroBalticMap.tsx, S4Card.tsx, sdRatio.ts, fleet.ts
```

The drop only darkens a surface that is fed by `/s4`. Which endpoint each surface reads turned out
to be the discriminating fact, and it is **not** what the audit assumed:

| # | Surface | Reads | Field it needs | State before this fix |
|---|---|---|---|---|
| 1 | S4Card canonical S/D caption (`S4Card.tsx:684` pre-fix) | `/s4` | `baltic_weighted_mw` | **DARK** — whole block rendered `''` |
| 2 | KPI-ticker S/D tooltip (`SignalBar.tsx:59` pre-fix) | `/s4` | `baltic_weighted_mw` | **DARK** — generic fallback sentence |
| 3 | Hero S/D tooltip (`HeroBalticMap.tsx:873` pre-fix) | **`/s4/fleet`** | `baltic_weighted_mw` | **RENDERING CORRECTLY** |
| 4 | KPI-ticker FLEX FLEET tooltip (`SignalBar.tsx:98-99`) | `/s4` | `..._strict`, `..._quarantined_mw` | **PARTIAL** — 2 of 5 sentences silently omitted |
| 5 | Hero quarantine tooltip (`HeroBalticMap.tsx:785`) | `/s4/fleet` | same two | rendering, `0 MW` / `782 MW` |
| 6 | Hero "N MW awaiting TSO confirmation" (`:853`) | `/s4/fleet` | `baltic_quarantined_mw` | correctly hidden — the live value **is** 0 |
| 7 | `baltic_weighted_net_mw` | — | — | **no consumer** (type declaration only, `S4Card.tsx:126`) |
| 8 | `non_commercial_mw` | — | — | **no consumer** anywhere in `app/` |
| 9 | `demand_basis` | — | — | **no consumer** anywhere in `app/` (36.D built it; never surfaced) |
| 10 | `quarantined` (the named list) | — | — | **no consumer** — and see the correction below |

### Correction to the audit — surface 3

The 2026-08-02 audit stated that *"both call sites fall through to the generic string"* and that the
hero's quarantine tooltip reads *"Strict-verified count: — MW"*. Re-checked at execution time
(A3), **that is wrong for the hero**: `HeroBalticMap` fetches `/s4/fleet` (`:151`), which returns
the stored KV value unprojected (`workers/fetch-s1.js:8986-8991`), so it has always had every
dropped field. The two dark call sites are **S4Card and the ticker**, not the ticker and the hero.

This does not change the fix or its priority — 36.D's caption was still dark on two of three
surfaces for two arcs — but it changes what "prove both surfaces render" means, and it is recorded
because an interim finding relayed as fact is still a hypothesis (B9).

### The named-list defect the enumeration surfaced

`HeroBalticMap.tsx:785` renders a hardcoded roll-call — *"(Kruonis PSP, BSP Hertz 1, Eesti Energia
BESS, Utilitas Targale, AJ Power)"* — beside a computed `0 MW`. The worker computes the actual
list as `quarantined[]`, and it is **empty**. So the tooltip names five assets as quarantined when
none is. That is discipline rule #2 on a live surface (a label asserting *what* against a value
computed separately), it is public copy, and it is therefore routed to **stage 2**, not fixed here.

## 3 · The fix, and why it is not "widen the whitelist"

A whitelist fails by omission: no error, no null, no log (B8). Adding four names to it would fix
today's four and leave the next `processFleet` aggregate to be dropped in silence exactly the same
way. The projection is inverted instead — everything `processFleet` computes is published unless
explicitly excluded, and the exclusion list is the two keys that must not appear (`raw_entries`,
republished as `d.projects`; `demand`, the operator override).

Asserted by `app/components/__tests__/sdCaptionReachesBrowser.test.tsx`, on rendered output:
the SSR markup of the component the reader sees, and the byte-for-byte tooltip strings the ticker
and hero set as `title`. Proven failable by inject-then-revert (B13) — restoring the 10-field
whitelist turns 4 of 5 specs red with `expected '' to contain 'sd-formula-caption'`, and leaves
the `/s4/fleet` spec green, reproducing the production asymmetry exactly.

## 4 · Same shape, different assembler — the duplicated-fallback enumeration

The audit's §5 item 7 named two hardcoded `1545`s. Enumerated properly, the frontend carries
**six** literals that duplicate a worker default, which is the same failure family (a silent
pipeline renders a plausible number instead of a dash):

```
$ grep -nE "\?\? (1545|3232|45000000|3204|1395|3700|484)" app/components/S4Card.tsx
```

| literal | site | disposition |
|---|---|---|
| `?? 1545` ×3 | APVA applied MW | **removed** — display-only, `formatMW(null)` → `—` |
| `?? 3232` | APVA applied MWh | **removed** — display-only |
| `?? 45000000` | APVA budget | **removed** — new `formatEurM()` returns `—` |
| `?? 3204` ×2 | TSO reserved MWh | **removed** — display-only |
| `?? 1395` | `tsoReservedMw` | **left** — feeds arithmetic (`tsoReservedMw / installedMw`, `pipelineSentiment`); nulling it changes degraded-state rendering, so it is a scoped change, not a mechanical one |
| `?? 3700` | `intentionMw` | **left** — same reason |
| `?? 484` | `ltMw` | **left** — same reason |

No rendered value changes today: the live `/s4` supplies `apva_applied_mw: 1545`,
`apva_applied_mwh: 3232`, `apva_budget_eur: 45000000` and `tso_reserved_mwh: 3204`, so every
removed fallback was already unreachable. The three left standing are logged here rather than
silently skipped.

### And a finding underneath it

`s4_buildability`'s assertion set is what supplies those values, and the worker's own fallback for
LV is **80**, not the 40 the site publishes:

```
workers/fetch-s1.js:10348   const lvMw = getVal('installed_storage_lv_mw', 80);
live /s4                    storage_by_country.LV.installed_mw = 40, as_of 2025-10-01
                            (code's own as_of fallback is null → the value comes from an assertion)
```

So **LV 40 is pushed into KV by an assertion writer, not hardcoded in the worker** — correcting it
in `fetch-s1.js` alone would be overwritten by the next push. `scripts/vps/fetch_entsoe_installed_capacity.py:207-228`
POSTs `{assertions: {...}}` built **from scratch** with only `*_live` keys, and the worker `put`s
the body wholesale (`:10224`) — i.e. a successful A68 run would delete every non-`_live` assertion
in the key. That is the B12 shape (one canonical writer per artifact) on a second artifact. It is
not in this stage's scope; it is material to stage 3a and is raised at the checkpoint.

KV could not be read directly to confirm the writer's identity — `wrangler kv key get --remote`
returned **401 Unauthorized** in this session, so the above is derived from the live payload
against the code's own fallbacks, which is sufficient for the direction and not sufficient to name
the writer.
