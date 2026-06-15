# Phase 33.A — Baltic allowlist + reject-on-flag + purge endpoint — EVIDENCE

**Branch:** `phase-33-a-baltic-allowlist` · **Commit:** `7619785` · **Worker deploy:** `2306c828-8728-4e97-b2b6-525e3b4b79a2` · **Date:** 2026-06-15 (Session 79)

No PNGs — change is data/worker-side; map renders fewer dots but nothing visually restyled.

---

## 1. Polluter inventory (Pause A, pre-deploy `/s4`)

196 projects total; **26 non-Baltic polluters** (re-verified, matches Cowork count):

```
LT:147  EE:21  <blank>:8  CL:6  SA:2  AU:2  BG:2  LV:2  RO:1  AT:1  MD:1  PL:1  SE:1  HU:1
```

All 26 share `source: "esn · …"` + mislabeled `tso: "Litgrid"`. All 8 blank-country rows
individually inspected = foreign ESN scraper output (Meralco PH, US Tenaska/TVA/MLGW,
N. Macedonia Oslomej, Chile) — none a legit Baltic project with a missing field, so
`BALTIC_COUNTRIES.has('') === false` drops them safely.

---

## 2. Purge endpoint — `POST /admin/purge-non-baltic-fleet`

```
$ curl -X POST .../admin/purge-non-baltic-fleet -H "X-Update-Secret: ***"
{ "purged": 26, "remaining": 170,
  "sample_purged": [
    {"id":"meralco-terra-solar-mterra-solar","name":"Meralco Terra Solar (MTerra Solar)","country":""},
    {"id":"al-leeth-bess-isp-sa","name":"Al-Leeth BESS ISP","country":"SA"},
    {"id":"samha-bess-isp-sa","name":"Samha BESS ISP","country":"SA"},
    {"id":"central-oasis-monte-guila-cl","name":"Central Oasis - Monte Águila","country":"CL"},
    {"id":"victorian-big-battery-au","name":"Victorian Big Battery","country":"AU"} ] }

# auth guard (no secret):  HTTP 401
# idempotency (re-run):     { "purged": 0, "remaining": 170 }
```

196 − 26 = **170** ✓

---

## 3. `/s4` after purge

```
projects: 170 (was 196)
country mix: { LT:147, EE:21, LV:2 }   non-Baltic remaining: 0   ✓
```

---

## 4. Live ingest gate — synthetic PH POST (non-destructive: 170 real + 1 PH)

```
$ curl -X POST .../s2/fleet  (171 entries: 170 Baltic + 1 synthetic PH)
{ "ok": true, "accepted": 170, "dropped_non_baltic": 1, "dropped_flagged": 0,
  "sd_ratio": 1.86, "phase": "MATURE", "n": 170 }
# /s4 after: 170 projects, synthetic-ph-test present: False   ✓
```

---

## 5. `/revenue` — second-order finding (PROMPT PREMISE CORRECTED)

Prompt expected "v7.3 / IRR 18.5%, allowlist doesn't touch revenue." **The premise is wrong.**

```
                       BEFORE purge (196)   AFTER purge (170)
model_version          v7.3                 v7.3            ✓ unchanged
baltic_operational_mw  331                  331             ← polluters never leaked into operational supply
baltic_pipeline_mw     19034                14067           ← −4967 MW (= Σ of all 26 purged, all 'announced')
sd_ratio               2.39                 1.86
cpi                    0.30                 0.33
project_irr            ~18.5%               20.0%
```

**Causation (not daily drift):** pipeline delta `19034 − 14067 = 4967` MW == sum of the 26
purged entries' MW exactly. `baltic_operational_mw` unchanged (331) → operational supply /
spread inputs untouched. The foreign projects were inflating the Baltic **pipeline**, which
feeds `sd_ratio` → trajectory CPI → IRR. Removing them yields a truer (tighter) Baltic
pipeline and a more accurate IRR. **This is the purge improving a polluted revenue input —
a correct, desirable consequence, not a regression.** The pollution was never merely cosmetic
map dots; it was corrupting the supply/demand model.

---

## 6. Local verification (pre-deploy)

```
tsc --noEmit ............... clean
vitest run ................. 63 files / 941 tests passed (incl. fleetAllowlist.test.ts 10/10)
lint:no-raw-spacing ........ clean
lint:no-editorial-chips .... clean
npm run build .............. 7 routes compile
smoke-test ................. 5 routes + 8 chunk URLs all 200
```

## 7. Origin-SHA guard (Session 74 discipline)

```
local  7619785abeeb73ed1038509c0370cf8a0ac9a92f
remote 7619785abeeb73ed1038509c0370cf8a0ac9a92f   MATCH ✓ (verified before deploy)
```
