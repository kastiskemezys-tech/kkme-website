# Phase 37.A — Pause A investigation

**Date:** 2026-07-31 · **Branch:** `phase-37-batch-1` off `origin/main` @ `e05f757`
**Governing docs:** `docs/phases/phase-37-arc.md` (privacy architecture) · `docs/phases/phase-37-a-prompt.md` · `docs/playbooks/failure-modes.md`

Everything below was produced by running commands in this environment on 2026-07-31. Figures quoted from the prompt or arc are marked as such and re-derived where load-bearing (A9). Per B9, findings here carry hypothesis status until 37.A's own wrap evidence lands; the ones re-derived from the file itself are marked `file-verified` and are as solid as this phase gets.

---

## 0. Privacy assertion (the non-negotiable)

```
$ git check-ignore -v docs/_private/fleet-intel/DS1-service-workbook-FULL-2026-07-30.xlsx
.gitignore:99:docs/_private/	docs/_private/fleet-intel/DS1-service-workbook-FULL-2026-07-30.xlsx

$ git ls-files docs/_private/
(empty — nothing under docs/_private/ has ever been tracked)

$ git diff --cached --name-only | grep docs/_private
(empty)
```

`docs/_private/` is ignored at `.gitignore:99`; zero files under it are tracked. This assertion is re-run at every commit in this phase and is wired into the gate script (§7).

Both probe scripts read the workbook with a hard redaction rule: columns matching `/kontakt|komentar|comment|e-?mail|phone|tel/i` are **counted and shape-described, never printed**. No contact or comment value appears in this document, in any script output, in any fixture, or in any commit. Probe scripts live in the session scratchpad, outside the repo.

---

## 1. The four playbook questions

**(a) Which premises are HYPOTHESIS vs verified?**

Five prompt premises are contradicted by the file itself. All five are `file-verified` against the xlsx via `probe-workbook.mjs` / `probe-numerics.mjs`:

| Prompt premise | Reality | Class |
|---|---|---|
| "**143 projects total** (verified by Cowork read 2026-07-30)" | **141** — LT 84 + LV 42 + EE 15. The per-sheet numbers in the prompt are each correct; the total is not | A9 |
| LT has "separate **MWH** + BESS-MW columns" — implying both carry data | `MWH` is **empty on all 84 LT rows** (0/84). The only energy column in the workbook is absent | A1 |
| The APVA column is possibly "APVA scheme/application **identifiers**… a direct public-register cross-check" | APVA is a **binary flag**: exactly 2 distinct values, `Gavo` ×55 / `Negavo` ×29 (received / did not receive). There is no identifier to look up. Full analysis in §3 | A1/A4 |
| "Power columns remain unit-chaotic **per sheet**" — implying pervasive chaos | Chaos is **bounded to 24 cells out of 141 rows** and is absent from LT's two power columns except 7 decimal-comma cells. LT is essentially clean; LV and EE carry the compound strings | A8 |
| "polite UA" is a candidate **AST WAF workaround** | AST returns **403 to both** a polite identifying UA and a browser UA — Cloudflare bot-management with CAPTCHA. Not a UA problem, not workaroundable. §4 | A5 |

Verified and unchanged: LT 84 / LV 42 / EE 15 row counts; contact-column populations (LT 71 with `@`, LV 38, both matching the prompt); the xlsx has **no mojibake** in any non-redacted column (the CSV's cp1257 damage is genuinely absent — parse from the xlsx, as instructed); EE contains `Auvere` and `Zirgu/Tsirguliina`, the promised known-good match cases.

**(b) What consumes what this phase changes?** — §6 (A7 enumeration). Short version: 37.A is **purely additive**. It creates a new KV namespace with zero existing readers and adds authenticated endpoints. It does not write `s4_fleet`, which has 6 writers and 9 readers and is 37.D's problem, not this batch's.

**(c) What fails silently in what this phase touches?** Four paths, each getting a surface rather than a hope:

1. **The evidence engine scoring zero and reporting "verified: 0" as a clean result.** A source that starts returning 403/empty produces "no evidence found", which is indistinguishable from "no evidence exists". Countermeasure: every dossier records `source_reachable` separately from `evidence_found`, and the coverage report fails loudly if any source's reachability rate drops below its Pause-A baseline recorded in the viability table.
2. **Parse-confidence silently defaulting to high.** A cell shape not in the 24 known cases must land as `low` confidence, never as a silent 0 or a silent pass. Asserted by a test that feeds an unknown shape and requires `parse_confidence: 'low'` plus `raw_power_text` retained.
3. **The private/public boundary failing open.** A row with no citation silently entering the public tier is the worst failure available here. Countermeasure: the tier is computed from the evidence array, never assigned; a row with zero public sources is `private-only` by construction, asserted by leak tests at API level from birth.
4. **B10 — provenance destroyed by a refresh.** Re-running intake must not blank an existing dossier's evidence. Countermeasure: intake is merge-not-overwrite on the evidence array, with a row-count monotonicity assert on the private namespace.

**(d) At which layer and time is success verified?** At the **outermost layer** (B2): unauthenticated `curl` against every fleet-adjacent public route asserted free of private fields — not just unit tests over the serializer. Timing (B3): the private KV push is synchronous, so verification is valid immediately post-push; no cron tick is involved in 37.A. Nothing in this batch is deploy-gated on a refresh cycle.

---

## 2. Git state — a divergence found before any work (C1)

`main` was **diverged** on arrival: 1 local unpushed commit, 5 unmerged origin commits.

```
$ git rev-list --left-right --count origin/main...main
5	1
```

- **Ahead (local only):** `dabb549` — "B-036 + 36.E0.1 roadmap delta + playbook B9/B10 + queue step 0 closed". Its content is **not** on origin. Notably this commit is what adds **playbook rows B9 and B10** — so `origin/main`'s copy of `failure-modes.md` currently lacks both.
- **Behind:** 5 commits including PRs #117/#118 (mature-markets refresh automation, settled DE activation source).

The working tree also held 11 modified tracked files and 26 untracked files colliding with `origin/main` paths. I compared **every one** byte-for-byte before touching anything: 9 of 11 tracked and 23 of 26 untracked were **already identical to `origin/main`** (the operator's local runs reproducing merged work). Only 5 files carried unique local content — `summary-table.json`, `mature-market-summary-table.md`, two 2026 activation `.ndjson.gz`, and the activation `manifest.json` — consistent with the known B-043 fetcher-churn.

All 37 files were tarred to the session scratchpad, then the branch was created off `origin/main` and the 5 unique-content files replayed on top. Verified afterwards: all 5 `PRESERVED` byte-for-byte, 0 mismatches among the other 32, `dabb549` still intact on `main`.

**Left for the operator (rule #5 — `_post-12-8-roadmap.md` is operator-owned, and `dabb549` edits it):** `dabb549` is still unpushed on local `main`. I did not rebase, cherry-pick, or otherwise move it. **B9/B10 will be missing from `origin/main` until you land it.** Recommended: land `dabb549` separately from this phase's PR so the roadmap edit stays in your hands.

---

## 3. The APVA column — dedicated investigation (no schema assumption made)

**What it is (`file-verified`):** column 8 of the LT sheet, populated on **all 84 rows**, with exactly **two** distinct values — `Gavo` ×55, `Negavo` ×29. Lithuanian for *received* / *did not receive*. It is a **binary award flag, not an identifier.** The prompt's hypothesis that it might hold "APVA scheme/application identifiers" giving "a direct public-register cross-check" is **false** — there is nothing to look up.

**Can the flag be verified against a public register? On today's evidence, no.**

APVA is the *Aplinkos projektų valdymo agentūra* (Environmental Projects Management Agency, under the Ministry of Environment). Two independent checks:

1. **APVA's own published schemes are household-scale.** Its EU-project and active-call listings are dominated by `Fizinių asmenų … namų ūkiuose` (natural persons, in households): household solar (calls 03-008/014/026/029/033-J-0001) and **household** storage devices (03-017-J-0001, 03-031-J-0001). The Modernisation Fund page does list electricity-storage investment among its priority areas, but publishes **no beneficiary or funded-project list** — confirmed by fetch. Household schemes are a poor referent for a table of 24–300 MW SPVs.
2. **The national EU-beneficiary register cannot discriminate the flag.** `esinvesticijos.lt/projektu-sritis/projektu-sarasas` is the official searchable register (€6.63 bn total funding indexed) and its result **count** is server-rendered, so a plain GET answers "does this entity appear". I ran a **balanced 14-row sample** — 8 `Gavo` and 6 `Negavo`, querying both the SPV and the parent org:

   ```
   Gavo:   n=8  SPV found 0/8   ORG found 0/8
   Negavo: n=6  SPV found 0/6   ORG found 0/6
   ```

   Zero hits on **both arms**. The register is working (`kaupimo` → 57 results, `Ignitis` → 3), so this is not a broken query — these entities are simply not in it under these names. A source that returns the same answer for `Gavo` and `Negavo` has **zero discriminating power** and cannot verify the column.

**Decision taken (needs no operator input, and is forced by the arc's own rules):** APVA is **operator testimony with no public corroboration**. Under the privacy architecture — *"a row that only exists in the private table stays private-only until a public source corroborates it"* — the flag is stored **opaquely in the private tier only**, as `apva_flag: "Gavo" | "Negavo"`, with **no** semantic interpretation baked into the schema, and it is **never published** and never contributes to a verification tier. This is the safe reading and it does not block the build.

**Open question for the checkpoint (one sentence from you resolves it):** *which* APVA scheme does `Gavo` refer to? If it is a business/utility-scale call whose results are published somewhere I have not found, APVA becomes a genuine per-project evidence source and 55 LT rows gain a citation. If it refers to a household scheme, an internal DS1 assessment, or an application not yet awarded, it stays private testimony permanently. I have made no assumption either way — the field is opaque until you answer.

---

## 4. Source-viability table (built BEFORE engine design, as instructed)

Probed from this environment on 2026-07-31. "Entity probe" = an actual company/record lookup, not a homepage ping.

| Source | Country | HTTP | Entity probe | Verdict | Notes |
|---|---|---|---|---|---|
| **esinvesticijos.lt** project register | LT | 200 | counts work; **rows are XHR** | **Partial — use for counts** | Server-rendered `Rezultatai: N` via plain `?query=`. Boolean "does entity appear" works today. Row detail needs a one-time XHR-endpoint spike |
| **registrucentras.lt** JAR search | LT | 200 | MATCH (search form served) | **Viable** | Official LT legal-entity register; public search page is server-rendered |
| **rekvizitai.lt** | LT | 404 on my guessed path | — | **Unknown** | Homepage 200/407 kB. My search-path guess was wrong; needs 10-min path discovery, not written off |
| **apva.lrv.lt** (+ APVIS, GIS) | LT | 200 | schemes are household-scale | **Not viable as a verifier** | See §3. No beneficiary list published for the Modernisation Fund |
| **Lursoft** company search | LV | 200 | MATCH (returns a result page + LV reg-number) | **Viable, extraction unconfirmed** | Free tier serves results; clean row extraction needs one build-time spike |
| **firmas.lv** | LV | 404 on my guessed path | — | **Unknown** | Homepage 200. Same situation as rekvizitai — path discovery pending |
| **data.gov.lv** open-data catalogue | LV | 200 | MATCH | **Viable, promising** | Official open-data portal reachable and searchable. An open-data UR extract would beat scraping Lursoft entirely — worth a spike |
| **SPRK** decisions index | LV | 200 | MATCH | **Viable** | 251 kB decisions index served, server-rendered |
| **BIS** public construction search | LV | 200 | MATCH | **Viable — 33.A.2.b premise corrected** | The source **does** serve data. 33.A.2.b found a *resolver* gap, not a data gap, exactly as the prompt suspected. Extractor is worth building |
| **em.gov.lv** permit lists | LV | 404 on my guessed path | — | **Unknown** | Site 200. The 2020-stale finding is **not** re-confirmed either way — my URL guess missed |
| **AST** | LV | **403** | — | **NOT VIABLE by scraping** | Cloudflare bot-management + CAPTCHA (`cf-ray` present). **403 to a polite identifying UA and to a browser UA alike.** `robots.txt` is served, so it is a deliberate rule on HTML pages. I did **not** attempt to evade it. Route: the direct AST relationship (the sent email) |
| **ariregister.rik.ee** open data | EE | 200 | MATCH | **Viable — best of the three** | Estonia publishes **free bulk open data** downloads. No scraping needed at all |
| **ariregister** entity search | EE | 500 | — | **Use open data instead** | Live search erroring; the bulk export makes it moot |
| **Developer sites** — Enery, ib vogt, European Energy, Evecon, Green Genius | — | 200 | MATCH | **Viable** | 5 of 6 serve project/portfolio content |
| **Developer site** — SUNLY | — | **403** | — | **Blocked** | WAF |

**Engine design follows this table, not hope:** EE resolves via bulk open data (strongest), LV via Lursoft + SPRK + BIS with a data.gov.lv spike that may replace the scraping, LT via registrucentras + esinvesticijos counts. AST and SUNLY are excluded from the automated pass and flagged as manual/relationship routes. The four `Unknown` rows are path-discovery tasks, not dead sources — I am not recording them as failures.

---

## 5. Parse surface — exact, from the file (`file-verified`)

Only **24 cells across 141 rows** need string parsing. Everything else is a native numeric cell.

| Sheet | Rows | Cols | Power-column shapes |
|---|---|---|---|
| **LT** | 84 | 10 | `Max power MW`: 81 native + 3 decimal-comma (`8,5` `111,6` `106,4`) · `Bess (MW)`: 80 native + 4 decimal-comma · `MWH`: **empty ×84** |
| **LV** | 42 | 7 | `Max power MW`: 33 native + 4 decimal-comma + 3 compound (`10MWh BESS / 4.4 MWp PV`, `10MWh BESS / 4 MWp PV`, `20MW Bess / 10 MWp PV`) + 2 value+unit (`40 MWh` ×2) |
| **EE** | 15 | 7 | `Max power MW`: 7 native + 7 compound (`100 MW / 200 MWh` ×3, `26.5 MW / 53.1 MWh`, `25MW/600MWh`, `90MW/ 220MWh`, `1.7 MW / 2 MWh`) + 1 decimal-comma (`113,5`) |

**LT gives hybrid decomposition for free** — a genuinely useful finding the prompt did not anticipate. Cross-tabulating `Max power MW` against `Bess (MW)` by plant type:

```
BESS                       equal=39 different=0
SUN and WIND E with BESS   equal=0  different=22
WIND E with BESS           equal=2  different=12
SUN E with BESS            equal=1  different=7
Sun, wind with BESS        equal=0  different=1
```

For all 39 pure-BESS rows the two columns agree exactly; for hybrids they diverge. So on LT, `Bess (MW)` **is** the storage component and `Max power MW` the site total — no string parsing needed for decomposition. The **3 anomalies** (2 `WIND E with BESS` + 1 `SUN E with BESS` where the columns are equal despite a hybrid type) get a `low` parse-confidence flag rather than a silent assumption.

**Unit trap to guard:** LV's two `40 MWh` cells sit in a column labelled *Max power MW* — an **energy** value in a **power** column. Parsed naively that is a 40 MW project that does not exist. These land as `bess_mwh: 40, bess_mw: null, parse_confidence: 'low'`.

**Match-engine hazard the prompt did not flag:** the `SPV` column is **not uniformly a legal entity**. LV rows include `BESS & PV Hybrid Livani`, `BESS Riga Tornkalns` — project descriptors with no company to look up. LV's `Vieta` column frequently holds AST substation-construction descriptions (`Construction of a new substation LNr.425 "Grobiņa - Ventspils"`) rather than a place. EE mixes entities (`Evecon Solar 432 OÜ`) with descriptors (`Auvere BESS`, `Hertz 1 BESS`). **Registry lookup is therefore only applicable to the subset of rows whose SPV is an actual legal entity** — the engine must detect this per row and route non-entity rows to name/location matching only, or the LV registry pass will report a false 0%. LT is the cleanest: 82 distinct SPVs across 84 rows, nearly all `UAB "…"` form (2 duplicate names — stable IDs must not key on name alone).

---

## 6. A7 — ALL-N enumeration (commands + counts)

```
$ grep -c "KKME_SIGNALS.put('s4_fleet'" workers/fetch-s1.js      → 6   writers
$ grep -c "KKME_SIGNALS.get('s4_fleet'" workers/fetch-s1.js      → 9   readers
$ grep -rn 's4_fleet' app/ lib/ --include=*.ts --include=*.tsx    → 0   (no frontend reader; it flows via the worker's response)
$ grep -rn 's4_fleet' tools/ scripts/                             → 1   (tools/consultancy/kv-snapshot.mjs)
$ grep -rn 'fleet_private' --exclude-dir=node_modules             → 2   (both in phase-37 docs — zero code references)
$ grep -rn 'fleet_dossier' --exclude-dir=node_modules             → 0
```

**`s4_fleet`: 6 writers + 9 readers + 1 tool = 16 in-repo sites.** Plus **one out-of-repo writer** the grep cannot see: `kkme_sync.py` in the `kkme-control-center` repo POSTs `s4_fleet` to `POST /s2/fleet`, stored verbatim. **True writer count is 7, not 6** — precisely the A7 failure mode (36.C's third writer was the only live one). 37.D must treat the external writer as first-class; 37.A does **not** write `s4_fleet` at all.

**New namespaces created by 37.A have zero existing consumers** (`fleet_private:*` → 0 code refs, dossier keys → 0). Every reader will be one I write, so the ALL-N count for them is exact by construction and re-asserted in the wrap.

KV binding: `KKME_SIGNALS` (`wrangler.toml:39`). Auth pattern reused: `X-Update-Secret` / `env.UPDATE_SECRET`, the same gate as the existing 12+ `/admin/*` endpoints including `POST /admin/add-fleet-entry` (`workers/fetch-s1.js:8520`). The calculator's stricter pattern (`CALC_SECRET`, HMAC-signed token, `timingSafeEqual`) is the model 37.C will need for the browser-facing CRM; 37.A's endpoints are machine-to-machine and use `X-Update-Secret` as the prompt specifies.

---

## 7. Gate wired from birth

`scripts/assert-no-private-staged.sh` (added this commit) fails the build if anything under `docs/_private/` is staged or tracked. It runs before every commit in this phase and is part of the gate set in the wrap.

---

## 8. Carried into the build

1. Parser handles 24 known cell shapes; anything else → `parse_confidence: 'low'` + `raw_power_text` retained. No silent coercion.
2. LT hybrid decomposition reads the two columns directly; the 3 type/value anomalies flagged low.
3. Match engine detects entity-vs-descriptor SPVs per row and routes accordingly.
4. Evidence engine covers only sources marked Viable/Partial; AST and SUNLY excluded with reason recorded.
5. `apva_flag` opaque, private-tier, never published, never scored — pending the operator's one sentence.
6. Verification tier computed from the evidence array, never assigned. Zero public sources ⇒ `private-only` by construction.
7. Leak tests at API level from the first commit, not retrofitted.
