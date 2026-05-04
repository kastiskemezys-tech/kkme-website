# Phase 12.10 — Data discrepancy hot-fix bundle

**For:** fresh Claude Code session, YOLO with chrome-devtools MCP available (`--dangerously-skip-permissions --model claude-opus-4-7`).
**Branch:** new `phase-12-10-data-discrepancy` off main (after PR for `phase-12-10-0-entity-purge` has merged — already merged at commit `85ec7f8`).
**Estimated runtime:** ~6-8 hours total. Largest remaining Tier 0 phase. Multi-commit (worker + frontend + methodology + content sanitization).
**Predecessors:** Phase 4F (intel-feed quality gate). Phase 12.8.0 (Tier 0 hot-fix bundle). Phase 12.10.0 (Saulėtas Pasaulis purge).
**Successors:** Phase 12.8.1 (backtest caption clarification, ~30-60 min). Then Phase 12.9 (worker + header KPI bundle). Then Phase 4G. Then Phase 12.10a (CLAUDE.md discipline patch).

---

## Why this phase exists

Two independent fact-check audits (audit #4 + audit #5, both 2026-05-03) cross-checked KKME numbers against primary sources (Litgrid, AST, Elering/Evecon, Energy-Charts, BTD, Trading Economics). Multiple primary-source-contradicted values + cross-card internal contradictions + a 2× revenue methodology mislabel + multiple unsourced model-confidence claims that look LLM-generated.

For a market-intelligence product whose positioning IS data accuracy, wrong numbers bounce every domain expert who fact-checks — the audience that pays. Phase 12.10.0 closed the worst single offender (Saulėtas Pasaulis fabricated entity). Phase 12.10 closes the broader bundle.

**Verified findings (Cowork-side curl confirmed, Sessions 28-29):**

- **LT installed storage stale by 41 days.** `s4_buildability` returns `installed_storage_lt_mw: 484` from "Litgrid 2026-03-23"; Litgrid current is **506 MW** (353 transmission + 153 distribution).
- **LT cross-card contradiction.** `storage_by_country.LT.installed_mw: 484` (buildability hardcode) vs `fleet.countries.LT.operational_mw: 596` (fleet tracker, includes Kruonis PSP 205 + 7 Litgrid Kaupikliai 331 + E energija 60). Without Kruonis: 391 MW BESS-only. **Both KKME numbers disagree with Litgrid 506.** ~115 MW gap suggests fleet tracker missing distribution-grid storage Litgrid counts.
- **LV cross-card contradiction.** `storage_by_country.LV: 40` vs `fleet.countries.LV: 99` (Utilitas Targale 10 + AST Rēzekne+Tume 80 + AJ Power 9 = 99). Buildability hardcode 40 is stale; fleet tracker is right.
- **EE possibly stale.** `installed_storage_ee_mw: 127`; per Evecon press, Hertz 1 may be 100 vs 200 MW (sources conflict).
- **Quarantine flags ignored.** Fleet tracker flags Hertz 1, Eesti Energia BESS, Utilitas Targale, AJ Power, Kruonis PSP as `_quarantine: true` ("Operational status without TSO/operational evidence") but they're STILL counted in `operational_mw` totals at the worker level. The flag is decorative.
- **aFRR P50 is 2× the one-direction value.** Headline `€13.5/MW/h` ≈ `afrr_up_avg (7.98) + afrr_down_avg (5.15)`. Card description says "capacity payment — paid per MW offered per hour, regardless of activation" which describes a one-direction product. **2× revenue overstatement risk** for downstream readers sizing a one-direction BESS offer.
- **Peak/trough hour labels hardcoded.** Peak Forecast card displays "Peak h10 EET / Trough h3 EET €98.8". 2h Capture card displays "Peak h21 EET €140 / Trough h14 EET €5". Same instant, same day, totally different numbers. Energy-Charts confirms today's actual LT max was **h22 EEST at €158.81** — Peak Forecast has the right peak value but wrong hour label; trough display €98.8 doesn't match actual day's min €4.99.
- **DA capture marquee €133 vs 2h card €140.** Same metric two values, no explanation.
- **EUA carbon ~3% lag.** KKME €73.9/t vs Energy-Charts €71.80/t. Borderline (could be fresher quote).
- **"7.0% Project IRR" caption mislabel** under 30D capture sparkline. The sparkline shows capture trend, not IRR.
- **Unsourced model-confidence language:** "Calibrated against Tier 1 LFP integrator consensus", "Cross-supplier consensus" 0.20pp/yr RTE decay, "Canonical" dispatch model, "KKME proprietary supply-stack model" — none cited.
- **Unverifiable claims** flagged by audit #5: connection guarantee €25/kW reduction, APVA "1,545 MW / 3,232 MWh / €45M budget", "Effective demand 752 MW / Free grid 3,600 MW" marquee, three legal references (XV-779, XV-687, VERT O3-189). Plausible-looking but unverified.
- **Carry-forward from Phase 12.10.0 Session 29:** VERT.lt item #3 ("Lithuanian balancing cost allocation shifts — producers cover 30%") generic-URL marker — content plausible, source URL generic. Verify-or-remove in this phase per audit #5 unverifiable-claims category.
- **Positive datapoint to surface:** Elering's €74M Baltic frequency-reserve cost for 2025 (per 4 Feb 2026 press release). Strongest macro anchor available; audit #5 explicitly recommends adding.

---

## What ships in this session

Single coordinated branch, six commits + handover. Worker deploy required. No `model_version` bump (this is data accuracy + display, not engine logic).

**Commit split (each independently revertable):**

1. **Worker — buildability refresh + quarantine enforcement + Litgrid reconciliation note** (~3 worker functions touched)
2. **Worker — surface Elering €74M anchor** (new field on `/s2` or new `/macro` endpoint)
3. **Frontend — Baltic fleet metric rename + tooltip + as-of date** (HeroBalticMap, SignalBar, S4Card, RevenueCard composition labels)
4. **Frontend — peak/trough hour-of-day computed from data** (PeakForecastCard + 2h Capture card both)
5. **Frontend — DA capture marquee/2h-card reconciliation + "7.0% Project IRR" mislabel fix**
6. **Methodology + copy sanitization** (aFRR direction disclosure, unsourced claims sanitized, IRR/DSCR/CAPEX assumptions footnote, unverifiable-claims verify-or-remove pass)

Plus commit 7: handover Session 30 entry.

---

## What's explicitly OUT of scope

- **Phase 12.12 (data integrity infrastructure).** That's the structural prevention — schema validation at fetch boundary, freshness gates with staleness chips, daily reconciliation cron, named-entity verification, quarantine flag enforcement at SCHEMA level. This phase is the immediate fix to current data; 12.12 is the long-term prevention.
- **Phase 12.13 (outage data + chart annotations).** Different concern, depends on Phase A's `<Chart>` primitive.
- **Phase 12.14 (forward-looking platform tracker).** Tier 5 feature, not bug fix.
- **Phase 12.8.1 (backtest caption).** Separate next phase, ~30-60 min.
- **Engine changes / `model_version` bump.** This is data accuracy + display, not engine logic.
- **`gh pr create`.** Operator opens PRs via GitHub web UI per `CLAUDE.md`.
- **Roadmap edits.** Per Session 28 backlog #2 protocol: CC reports needed roadmap changes via handover; operator applies via Cowork.
- **The OPS-1 secret hygiene cleanup** (UPDATE_SECRET in plaintext). Operator-side housekeeping; doesn't block this phase.

---

## 0. Session-start protocol

### 0.1 Read

1. `CLAUDE.md`
2. `docs/handover.md` Sessions 28 + 29 (most recent shipped). Note the audit-credibility taxonomy + roadmap-edit protocol.
3. `docs/phases/_post-12-8-roadmap.md` — Phase 12.10 entry (this prompt is its prompt) + Phase 12.12 entry (the structural follow-up that depends on this phase's findings)
4. `docs/principles/decisions.md` — ADR-002 (KV not D1), ADR-005 (typeface system)
5. `workers/fetch-s1.js` — DO NOT cat (8000+ lines). Grep for the specific spots:
   ```bash
   grep -nE "installed_storage_lt_mw|installed_storage_lv_mw|installed_storage_ee_mw|under_construction_storage_ee_mw|s4_buildability|baltic_total|baltic_operational_mw|fleetWeightedMw|_quarantine" workers/fetch-s1.js | head -40
   grep -nE "afrr_up_avg|afrr_down_avg|p_high_avg|p_low_avg|hourly_lt|fetchPeakForecast|peak_hour|trough_hour" workers/fetch-s1.js | head -30
   ```
   Read each match in 30-line windows.
6. `app/components/HeroBalticMap.tsx` lines around the side-rail metrics (~750+) and SignalBar at `app/components/SignalBar.tsx`
7. `app/components/PeakForecastCard.tsx` (full read — likely <300 lines)
8. `app/components/S1Card.tsx` lines around the 2h Capture card peak/trough display + the 30D capture sparkline IRR-mislabel
9. `app/components/S4Card.tsx` lines around `storage_by_country` rendering
10. `app/components/RevenueCard.tsx` — find the unsourced model-confidence sentences ("Tier 1 LFP integrator consensus", "Cross-supplier consensus", "canonical", "proprietary")

### 0.2 Verify the symptoms

```bash
# Endpoint health baseline
bash scripts/diagnose.sh

# LT/LV/EE installed storage cross-card
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | python3 -c "
import json, sys
d = json.load(sys.stdin)
sbc = d.get('storage_by_country', {})
fl = d.get('fleet', {}).get('countries', {})
print('=== storage_by_country (s4_buildability hardcode) ===')
for c in ['LT', 'LV', 'EE']:
    print(f'  {c}: installed_mw={sbc.get(c,{}).get(\"installed_mw\")}')
print('=== fleet.countries (live tracker) ===')
for c in ['LT', 'LV', 'EE']:
    cd = fl.get(c, {})
    print(f'  {c}: operational_mw={cd.get(\"operational_mw\")}  pipeline_mw={cd.get(\"pipeline_mw\")}  weighted_mw={cd.get(\"weighted_mw\")}')
print(f'  baltic_operational_mw: {d.get(\"fleet\",{}).get(\"baltic_operational_mw\")}')
print(f'  baltic_total.installed_mw: {d.get(\"baltic_total\",{}).get(\"installed_mw\")}')
print(f'  storage_reference (LT alone): {d.get(\"storage_reference\",{}).get(\"installed_mw\")}, source: {d.get(\"storage_reference\",{}).get(\"source\")}')
"

# aFRR direction reconciliation
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('afrr_up_avg:', d.get('afrr_up_avg'))
print('afrr_down_avg:', d.get('afrr_down_avg'))
print('Sum:', (d.get('afrr_up_avg',0) or 0) + (d.get('afrr_down_avg',0) or 0))
print('mfrr_up_avg:', d.get('mfrr_up_avg'))
print('mfrr_down_avg:', d.get('mfrr_down_avg'))
"

# Peak/trough hour labels — what's actually in /s1 hourly data
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s1 | python3 -c "
import json, sys
d = json.load(sys.stdin)
hourly = d.get('hourly_lt', [])
print(f'p_high_avg: {d.get(\"p_high_avg\")}')
print(f'p_low_avg: {d.get(\"p_low_avg\")}')
print(f'hourly_lt length: {len(hourly)}')
print(f'updated_at: {d.get(\"updated_at\")}')
if hourly:
    last24 = hourly[-24:]
    if last24:
        max_v = max(last24)
        min_v = min(last24)
        max_h = last24.index(max_v)
        min_h = last24.index(min_v)
        print(f'Last 24h slice: max €{max_v} at idx {max_h}, min €{min_v} at idx {min_h}')
"

# Quarantine flag enumeration
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | python3 -c "
import json, sys
d = json.load(sys.stdin)
fl = d.get('fleet', {}).get('countries', {})
total_quarantined = 0
for c in fl:
    entries = fl[c].get('entries', [])
    q = [e for e in entries if e.get('_quarantine')]
    if q:
        print(f'== {c} quarantined ({sum(e.get(\"mw\",0) for e in q)} MW) ==')
        for e in q:
            print(f'    {e.get(\"name\")}: {e.get(\"mw\")} MW, status={e.get(\"status\")}')
        total_quarantined += sum(e.get('mw',0) for e in q)
print(f'TOTAL QUARANTINED MW counted in operational_mw: {total_quarantined}')
"
```

### 0.3 Pause A — investigation report + scope confirmation

**Wait for explicit "proceed".** Report:

1. **Confirmed baselines** — current values for each finding, with as-of timestamps. Document discrepancies vs primary sources you can verify (Litgrid current installed via web search if needed).
2. **Quarantine MW total** — how many MW of "operational" totals will drop when the flag is enforced? Need this number for the handover (it's a non-trivial number that affects every fleet-MW display on the site).
3. **LT 506 MW reconciliation strategy** — preferred:
   - **Option A:** add 7-8 distribution-grid Litgrid Kaupikliai entries to the fleet tracker so KKME's BESS-only sum matches Litgrid's 506
   - **Option B:** note the gap in `storage_reference.coverage_note` ("Includes TSO-grid storage only; +153 MW distribution-grid storage tracked by Litgrid not yet in KKME fleet tracker; refresh 2026-Q3")
   - Pick A if Litgrid's distribution-grid list is publicly enumerable; Option B otherwise
4. **aFRR methodology disclosure decision** — two paths:
   - **Path 1:** Label headline "aFRR up+down combined" + add halved one-direction sub-line
   - **Path 2:** Halve headline to one-direction P50 + explain in tooltip that downstream readers should add the down-direction value if their BESS offers both
   - **My recommendation:** Path 1 (less disruptive to existing displays; clearer disclosure)
5. **Per-claim verify-or-remove decisions** for:
   - Connection guarantee €25/kW reduction (search VERT decisions feed + Energetikos ministerija public consultations)
   - APVA "1,545 MW / 3,232 MWh / €45M budget" (apva.lt grant-call summary page)
   - "Effective demand 752 MW / Free grid 3,600 MW" marquee (cite Litgrid/VERT methodology if findable)
   - Three legal references XV-779 / XV-687 / O3-189 (e-tar.lt search)
   - VERT.lt item #3 carry-forward from Phase 12.10.0 (audit #5 deferred for this phase)
   - For each: REPORT verification result + propose retain/reword/remove
6. **Elering €74M anchor placement** — proposed location on the page. Recommended: foot of Chapter 5 ("What's moving") OR in S2 card as macro-context tile. Operator picks at Pause A.
7. **Final commit split + sequencing** — confirm the 7-commit plan (or propose adjustments).

If autonomous-YOLO: AUTO-PROCEED if findings match the prompt's hypothesis cleanly + verify-or-remove decisions are clear. If 3+ unverifiable claims need operator judgment OR the LT 506 reconciliation requires architectural change, halt for explicit operator confirmation.

---

## 1. Worker — buildability refresh + quarantine enforcement + Litgrid reconciliation (Commit 1)

### 1.1 Refresh stale buildability assertions

Two paths:

**Path A** (preferred — cleaner): use existing `POST /s4/buildability` endpoint with the new values:

```bash
curl -s -X POST https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4/buildability \
  -H "Content-Type: application/json" \
  -H "x-update-secret: ${UPDATE_SECRET}" \
  -d '{
    "assertions": {
      "installed_storage_lt_mw": {
        "value": 506,
        "as_of_date": "2026-04-23",
        "source_url": "https://www.litgrid.eu/index.php/perdavimo-tinklas/elektros-energetikos-rinkos-statistika/irengtoji-galia/3257"
      },
      "installed_storage_lt_gen_mw": {
        "value": 353,
        "as_of_date": "2026-04-23",
        "source_url": "https://www.litgrid.eu/index.php/perdavimo-tinklas/elektros-energetikos-rinkos-statistika/irengtoji-galia/3257",
        "note": "Transmission-grid only (353 of 506 total). Distribution-grid +153 MW not yet in fleet tracker."
      },
      "installed_storage_lv_mw": {
        "value": 80,
        "as_of_date": "2025-10",
        "source_url": "https://www.ast.lv/...",
        "note": "AST commissioned: Rēzekne 60 + Tume 20. Excludes commercial behind-the-meter (~19 MW per fleet tracker)."
      }
    }
  }' | python3 -m json.tool
```

**Path B** (if Path A insufficient): edit the worker default constants directly in `workers/fetch-s1.js` and redeploy.

Verify EE current value vs Evecon press releases at Pause A; refresh if necessary.

### 1.2 Enforce quarantine flag in totals

In `workers/fetch-s1.js`, find the function that computes `fleet.baltic_operational_mw` and per-country `operational_mw`. Likely in `processFleet` or similar. Modify:

```js
function computeOperationalMw(entries) {
  const eligible = entries.filter(e => e.status === 'operational' && !e._quarantine);
  return eligible.reduce((sum, e) => sum + (Number(e.mw) || 0), 0);
}

function computeQuarantinedMw(entries) {
  const quarantined = entries.filter(e => e.status === 'operational' && e._quarantine);
  return quarantined.reduce((sum, e) => sum + (Number(e.mw) || 0), 0);
}
```

Then in the country loop:

```js
fleet.countries[country] = {
  operational_mw: computeOperationalMw(entries),
  quarantined_mw: computeQuarantinedMw(entries),  // NEW companion field
  pipeline_mw: ...,
  weighted_mw: ...,
  entries,  // unchanged
};
```

Frontend can choose whether to display the quarantined count separately or just exclude.

### 1.3 LT 506 reconciliation note

In `processFleet` or wherever `storage_reference` is assembled, add the coverage note:

```js
storage_reference: {
  ...existing,
  coverage_note: 'Includes TSO-grid storage only (Litgrid \"Įrengtoji galia\" 353 MW transmission). Distribution-grid storage (+153 MW per Litgrid) not yet enumerated in fleet tracker; refresh planned 2026-Q3 once Litgrid publishes per-DSO breakdown.',
}
```

If you pick Option A (enumerate distribution-grid sites in fleet tracker), instead add the missing entries with proper attribution and skip the coverage_note.

### 1.4 Tests

Add `app/lib/__tests__/fleetMw.test.ts`:

```ts
describe('quarantine flag enforcement', () => {
  it('excludes quarantined entries from operational_mw', () => {
    const entries = [
      { mw: 100, status: 'operational', _quarantine: false },
      { mw: 200, status: 'operational', _quarantine: true },
      { mw: 50, status: 'under_construction', _quarantine: false },
    ];
    expect(computeOperationalMw(entries)).toBe(100);
    expect(computeQuarantinedMw(entries)).toBe(200);
  });

  it('returns 0 for empty array', () => { ... });
  it('handles missing _quarantine field as not-quarantined', () => { ... });
});
```

Mirror the worker helpers into `app/lib/fleetMw.ts` for testability (same pattern as `app/lib/feedSourceQuality.ts`).

---

## 2. Worker — surface Elering €74M anchor (Commit 2)

Audit #5: *"Baltic frequency-reserve cost €74M for 2025 — confirmed by Elering's 4 Feb 2026 press release. KKME doesn't currently cite this — it's a number worth adding because it's the strongest macro anchor available."*

Add as a static reference field. Two options:

**Option A:** new field on `/s2` payload:
```js
{
  ...existing,
  macro_context: {
    baltic_frequency_reserve_cost_2025_eur: 74_000_000,
    source: "Elering 2026-02-04 press release",
    source_url: "https://elering.ee/en/news/baltic-frequency-reserve-cost-74m-2025"
  }
}
```

**Option B:** new `/macro` endpoint (separate concern; future-proof for other macro anchors like Eurostat HDD/CDD). Probably overkill for one number; pick A.

Frontend renders it where the operator wants (Pause A decision).

---

## 3. Frontend — Baltic fleet metric rename + composition disclosure (Commit 3)

### 3.1 Rename "Baltic Fleet 822 MW" displays

Currently the side-rail / SignalBar shows "FLEX FLEET 822 MW" (already disambiguated per Phase 7.6.3 — see Session 11 handover). But the LT/LV/EE breakdown displays still mix "BESS installed" semantics with "BESS + pumped hydro + construction" semantics.

Touch (verify line numbers via grep):
- `app/components/HeroBalticMap.tsx` — side-rail "BALTIC FLEET 822 MW · LT 596 · LV 99 · EE 127"
- `app/components/S4Card.tsx` — "Baltic installed storage 651 MW · LT 484 · LV 40 · EE 127"
- `app/components/S2Card.tsx` if it surfaces fleet numbers

Rename pattern:

| Current | New |
|---|---|
| "Baltic Fleet 822 MW" | "Baltic flexibility fleet · 822 MW operational (incl. Kruonis PSP 205 MW)" with hover tooltip showing breakdown by tech |
| "Baltic installed storage 651 MW" | "Baltic BESS installed · 651 MW (TSO-tracked)" with hover tooltip "Litgrid + AST + Elering registry. +153 MW distribution-grid storage in LT not yet enumerated" |
| "LT 484" / "LT 596" | Single "LT 506 MW" sourced from refreshed `installed_storage_lt_mw` (or fleet tracker if path A added the missing entries). With as-of date in tooltip. |
| "LV 40" / "LV 99" | Single "LV 80 MW (TSO) + ~19 MW commercial" |

The rename is the main visible-to-reader change. Architecture note: declare a single "canonical source" per metric in a small registry file (`app/lib/metricRegistry.ts`) so Phase 12.12 #5 (cross-card consistency CI test) has something concrete to validate against.

### 3.2 Add as-of date next to every refreshed figure

Tiny `(verified 2026-04-23)` label after each storage figure — uses the new `last_verified_at` field from §1.1's buildability refresh.

---

## 4. Frontend — peak/trough hour-of-day computed from data (Commit 4)

### 4.1 Find the hardcoded hour labels

```bash
grep -nE "h10 EET|h3 EET|h21 EET|h14 EET|peak_hour|trough_hour|EET|EEST" app/components/PeakForecastCard.tsx app/components/S1Card.tsx
```

Two cards affected: `PeakForecastCard` and the 2h Capture card in `S1Card.tsx`.

### 4.2 Replace with computed hour-of-day from data

The worker `/s1` endpoint exposes `hourly_lt` (187-element array of last 7+ days). Need to scope to "today" (the latest 24-hour window) before computing `Math.argmax`:

```ts
function computeTodayPeakTrough(hourly_lt: number[], updated_at: string): {
  peak_hour: number;  // hour of day in operator's timezone (EEST)
  peak_value: number;
  trough_hour: number;
  trough_value: number;
} | null {
  if (!Array.isArray(hourly_lt) || hourly_lt.length < 24) return null;
  // Today = last 24 entries, assuming hourly resolution
  const today = hourly_lt.slice(-24);
  const max_v = Math.max(...today);
  const min_v = Math.min(...today);
  const max_h = today.indexOf(max_v);
  const min_h = today.indexOf(min_v);
  // Convert idx to clock hour — offset by `updated_at`'s hour-of-day
  const updatedDate = new Date(updated_at);
  const updatedHour = updatedDate.getUTCHours() + 3; // EEST = UTC+3
  // Today slice ends at updatedHour; idx 0 = updatedHour - 23
  const peak_hour = (updatedHour - 23 + max_h + 24) % 24;
  const trough_hour = (updatedHour - 23 + min_h + 24) % 24;
  return { peak_hour, peak_value: max_v, trough_hour, trough_value: min_v };
}
```

Render as `Peak h${peak_hour} EEST €${peak_value}` instead of the hardcoded labels.

**EEST vs EET caveat:** Lithuania observes EEST (UTC+3) in summer, EET (UTC+2) in winter. Either label both with the actual current zone OR drop the timezone label and just show "Peak hour: 22 (€158.81)". Simpler.

### 4.3 Apply to BOTH Peak Forecast card AND 2h Capture card

The auditor flagged both. Same fix function for both — extract to `app/lib/peakTrough.ts` and import.

### 4.4 Tests

Standard pattern — fail-then-pass:

```ts
describe('computeTodayPeakTrough', () => {
  it('finds peak hour 22 in real LT data sample', () => {
    // Use today's actual hourly_lt slice as fixture
    const sample = [4.99, 5.0, ..., 158.81, ...];  // last 24
    const result = computeTodayPeakTrough(sample, '2026-05-04T01:00:00Z');
    expect(result?.peak_hour).toBe(22);
    expect(result?.peak_value).toBe(158.81);
  });
  
  it('returns null for empty array', () => { ... });
  it('returns null for less than 24 entries', () => { ... });
});
```

---

## 5. Frontend — DA capture marquee/2h-card reconciliation + IRR mislabel fix (Commit 5)

### 5.1 DA capture marquee €133 vs 2h card €140

Find both source fields:

```bash
grep -nE "DA CAPTURE|Net capture|bess_net_capture|capture_2h|gross_2h" app/components/S1Card.tsx app/components/SignalBar.tsx
```

Two paths:
- **Option A:** label both with explicit names ("DA spread €133" in marquee, "Net 2h capture €140" in card) — preserves both metrics, removes confusion
- **Option B:** display from one source — pick the most relevant

Recommend Option A. The metrics ARE different (DA spread = peak-trough; net capture = post-RTE/SoC); both are useful; the bug is the shared "capture" noun.

### 5.2 "7.0% Project IRR" caption mislabel

```bash
grep -nB 2 -A 2 "7.0% Project IRR\|Project IRR" app/components/S1Card.tsx
```

Find the 30D capture sparkline and change the caption from "7.0% Project IRR" to "30D capture trend" or whatever the sparkline actually represents.

### 5.3 Tests

Caption-text canary spec:

```ts
describe('S1Card 30D sparkline caption', () => {
  it('does not mislabel the sparkline as Project IRR', () => {
    // Source-text grep on the rendered output
    expect(s1CardSource).not.toContain('Project IRR');
  });
});
```

---

## 6. Methodology + copy sanitization (Commit 6)

### 6.1 aFRR direction disclosure

In `app/components/S2Card.tsx` (or wherever the aFRR P50 headline renders), add the direction disclosure per Pause A decision (Path 1 or Path 2).

If Path 1: rename headline to "aFRR P50 (up+down combined) €13.5/MW/h" + add sub-line "One-direction (up only): €7.98/MW/h".

If Path 2: change worker payload to expose `afrr_p50_up_one_direction` (= `afrr_up_avg`) as the headline; add tooltip "Sum of up + down: €13.13/MW/h."

### 6.2 Sanitize unsourced model-confidence claims

For each phrase, find via grep and apply the fix:

```bash
grep -rn "Tier 1 LFP integrator consensus\|Cross-supplier consensus\|canonical\|KKME proprietary" app/ 2>/dev/null
```

| Current | Replacement |
|---|---|
| "Calibrated against Tier 1 LFP integrator consensus + public market research" | "Calibrated against [NREL Annual Technology Baseline 2026](https://atb.nrel.gov/electricity/2026/utility-scale_battery_storage) (open, peer-reviewed) + operator overlay from public market research" |
| "Decays 0.20pp/yr per cross-supplier consensus" | "Decays 0.20pp/yr per [NREL ATB 2026 LFP RTE projection](https://atb.nrel.gov/electricity/2026/utility-scale_battery_storage); operator validation against public manufacturer warranty data (BYD, Samsung SDI, CATL Tier-1 published curves)" |
| "Dispatch model · ISP-level allocation, SoC-aware · canonical" | "Dispatch model · ISP-level allocation, SoC-aware" — drop "canonical" |
| "KKME proprietary supply-stack model" | "KKME supply-stack model — methodology in /methodology drawer" (link to the methodology section once Phase A consolidates it inline) |

If NREL ATB doesn't actually publish a 2026 ATB by today's date, use the most recent year's ATB and date-stamp accordingly.

### 6.3 Verify-or-remove unverifiable claims

Per Pause A research, for each:
- Connection guarantee €25/kW reduction proposal
- APVA 1,545/3,232/€45M tuple
- Effective demand 752 / Free grid 3,600 marquee
- Three legal references (XV-779, XV-687, O3-189)
- VERT.lt item #3 carry-forward

Apply the verify-or-remove disposition decided at Pause A. If verified: add specific source URL inline. If unverifiable: remove or weaken to "operator estimate, pending verification."

### 6.4 Add IRR/DSCR/CAPEX assumptions footnote

In RevenueCard, find where IRR/DSCR/CAPEX are displayed. Add a small footnote (collapsible) showing the input assumptions: discount rate, debt fraction, debt cost, Euribor reference, scenario. Makes model outputs replicable.

```tsx
<p className="assumptions-footnote">
  Assumptions: Discount {wacc}% · Debt {debt_fraction*100}% @ {debt_cost}% · 
  Euribor {euribor}% · Scenario: {scenario} · v{model_version} ({calibrated_date})
</p>
```

---

## 7. Verification gates (before any commit)

```bash
npx tsc --noEmit                     # 0 errors
npm run lint                         # 40 errors / 129 warnings — identical to baseline (no new errors)
npm test                             # 893 → ~920+ (each commit adds ~5-10 tests)
npm run build                        # exits 0, 8 static pages
node --check workers/fetch-s1.js     # clean
```

### 7.1 Visual verification (chrome-devtools MCP)

For each commit, capture screenshot showing the change. Particularly important:
- Side-by-side: pre-fix vs post-fix Baltic fleet metrics (single-source-of-truth visible)
- Pre-fix vs post-fix peak/trough hour labels (computed from actual data)
- Pre-fix vs post-fix DA capture marquee (no longer confused with 2h card)
- Pre-fix vs post-fix IRR mislabel (sparkline caption corrected)
- Methodology footnote rendered with assumptions visible

Capture to `docs/visual-audit/phase-12-10-fix/`.

---

## 8. Pause B — diff review

Per-commit summary:
- Files changed per commit (worker / frontend / methodology each their own commit)
- Quarantine MW total now excluded from operational counts (number)
- LT/LV/EE values now: __ / __ / __ (post-refresh)
- aFRR direction disclosure path chosen + headline value(s)
- Verify-or-remove dispositions for each unverifiable claim
- All gates green
- Visual audit screenshots committed

Wait for explicit "proceed" before §9 worker deploy.

---

## 9. Worker deploy + post-deploy verification

```bash
cd workers && npx wrangler deploy && cd ..
sleep 5

# Verify buildability refresh stuck
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | python3 -c "
import json, sys
d = json.load(sys.stdin)
sr = d.get('storage_reference', {})
print(f'LT installed: {sr.get(\"installed_mw\")} (expect 506)')
print(f'Source: {sr.get(\"source\")} (expect updated date)')
print(f'Coverage note: {sr.get(\"coverage_note\")}')
"

# Verify quarantine enforcement
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s4 | python3 -c "
import json, sys
d = json.load(sys.stdin)
fl = d.get('fleet', {}).get('countries', {})
print(f'LT operational_mw: {fl.get(\"LT\",{}).get(\"operational_mw\")} (should drop ~205 MW for Kruonis PSP)')
print(f'LT quarantined_mw: {fl.get(\"LT\",{}).get(\"quarantined_mw\")} (NEW field)')
"

# Verify Elering anchor
curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | python3 -c "
import json, sys
d = json.load(sys.stdin)
mc = d.get('macro_context', {})
print(f'Baltic frequency-reserve cost 2025: €{mc.get(\"baltic_frequency_reserve_cost_2025_eur\")}')
print(f'Source: {mc.get(\"source\")}')
"
```

---

## 10. Pause C — final commit + handover

### 10.1 Commit + push

The commits should already be made before deploy (one logical change per commit per CLAUDE.md). After deploy + post-deploy verification, push:

```bash
git push -u origin phase-12-10-data-discrepancy
```

### 10.2 Handover Session 30 entry

Append to `docs/handover.md`:
- Worker deploy version ID
- Quarantine MW total (the "non-trivial number that affects every fleet-MW display")
- LT/LV/EE refreshed values + as-of dates
- aFRR direction disclosure path chosen
- Per-claim verify-or-remove dispositions (before/after table)
- Elering €74M anchor surfaced — where on the page
- Test count delta (893 → final)
- Visual audit dir
- **Roadmap delta needed** — operator to apply Cowork-side after merge:
  - Move Phase 12.10 to Shipped appendix
  - Update Currently-active "Next CC job" to Phase 12.8.1 (backtest caption clarification)
  - Note: Phase 12.12 #1 (schema validation) and #5 (cross-card consistency CI test) now have a `app/lib/metricRegistry.ts` to validate against — extends 12.12 scope slightly with concrete starting point
- **Backlog discovered this session** — anything that came up during the audit work
- **Next CC job: Phase 12.8.1** (backtest caption clarification, ~30-60 min)

Open PR via GitHub web UI per `CLAUDE.md`.

---

## 11. Rollback plan

If buildability refresh creates downstream cascade (e.g. Frontend renders break against new field shape):

```bash
# Revert just the worker buildability commit
git revert <buildability-commit-sha>
git push
cd workers && npx wrangler deploy
```

If quarantine enforcement drops total MW too aggressively (e.g. 822 → 600 visible regression):

```bash
# Revert quarantine commit; keep buildability + frontend rename
git revert <quarantine-commit-sha>
```

Each commit independent — that's why they're split.

If aFRR direction disclosure breaks downstream readers' expectations (someone has automation reading the headline):

```bash
git revert <aFRR-commit-sha>
```

The numerical accuracy is more important than backward-compatibility for headline format, so push back if you get pressure to revert this one.

---

## 12. Reference files

- `workers/fetch-s1.js` — DO NOT cat. Grep for `s4_buildability`, `processFleet`, `computeOperational`, `_quarantine`, `installed_storage_*`, `afrr_up_avg`, `hourly_lt`, `p_high_avg`
- `app/components/HeroBalticMap.tsx` — side-rail metrics
- `app/components/SignalBar.tsx` — header KPI strip
- `app/components/S1Card.tsx` — DA capture, 2h Capture card, 30D sparkline IRR mislabel
- `app/components/S2Card.tsx` — aFRR P50 headline
- `app/components/S4Card.tsx` — storage_by_country rendering
- `app/components/PeakForecastCard.tsx` — peak/trough hour labels
- `app/components/RevenueCard.tsx` — unsourced model-confidence claims, IRR/DSCR/CAPEX assumptions footnote
- `docs/handover.md` — Sessions 28 + 29 most recent
- `docs/phases/_post-12-8-roadmap.md` Phase 12.10 entry
- `docs/principles/decisions.md` — ADR-002 (KV not D1), ADR-005 (typeface)

---

## 13. Cowork-side authoring notes (delete before final commit)

Authored 2026-05-04 from Cowork after Phase 12.10.0 PR #49 merged. The verified findings table is fresh per Session 28-29 Cowork curls; if the underlying values change between authoring and execution (e.g. Litgrid publishes a new figure tomorrow), refresh §0.2 baselines accordingly.

Three operator-judgment moments at Pause A:
1. LT 506 reconciliation strategy (Option A enumerate vs Option B note)
2. aFRR direction disclosure path (Path 1 dual vs Path 2 halve)
3. Per-claim verify-or-remove decisions (5 unverifiable claims — at least 1-2 likely need operator's domain knowledge)

The 7-commit split is bigger than typical phases. If it feels unwieldy, collapse into 4 commits:
- Worker (buildability + quarantine + Elering)
- Frontend metrics (rename + as-of dates + peak/trough hours + DA marquee)
- Methodology + copy (aFRR + sanitize + verify-or-remove + assumptions footnote)
- Handover

Either commit split is fine; the 7-commit version makes individual reverts easier.

The metricRegistry.ts file (§3.1) is a small architecture seed for Phase 12.12 #5 (cross-card consistency CI test). Worth introducing here even if the CI test isn't built yet — gives 12.12 something concrete to validate against rather than asking it to invent the registry from scratch.

**End of prompt.**
