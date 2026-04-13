# /s4 Operational BESS — Project Reality Check

**Date:** 2026-04-10
**Source:** GET /s4 → projects where status=operational

## 8 Operational Entries from /s4

| # | Name | Country | MW | Geocode Source | Location | Issue? |
|---|------|---------|-----|----------------|----------|--------|
| 1 | BSP Hertz 1 (Kiisa) | EE | 100 | manual | Kiisa substation, SW Tallinn | OK |
| 2 | Eesti Energia BESS (Ida-Viru) | EE | 26.5 | manual | Auvere, NE Estonia | OK |
| 3 | E energija | LT | 60 | manual | Elektrėnai power plant | OK |
| 4 | **Kruonis PSP** | LT | **205** | manual | Kruonis near Kaunas | **NOT BESS — pumped hydro** |
| 5 | **Energy Cells (Kruonis)** | LT | **200** | manual | Kruonis PSP location | **WRONG location — see below** |
| 6 | AST BESS (Rēzekne + Tume) | LV | 80 | manual | Rēzekne (60 of 80 MW) | Acceptable simplification |
| 7 | Utilitas Wind Targale BESS | LV | 10 | manual | Ventspils region | OK |
| 8 | AJ Power BESS portfolio (3 sites) | LV | 9 | manual | Valmiera (largest site) | Acceptable simplification |

## Critical Issues

### Issue 1: Kruonis PSP is NOT a battery
**Kruonis PSP** (205 MW) is Ignitis Gamyba's **pumped-storage hydroelectric** plant, not a BESS.
It should be **excluded from the hero map** as this map tracks battery energy storage only.
The /s4 scraper includes it because VERT/Litgrid classify it as "flexibility," but it's not BESS.

**Recommendation:** Filter out Kruonis PSP from the hero dot rendering. Either:
- Add a `type` filter in the component (exclude if name contains "PSP")
- Or mark it in project-geocodes.json with `"isBess": false`

### Issue 2: Energy Cells location is wrong
**Energy Cells (Kruonis)** at 200 MW is placed at Kruonis PSP coordinates (54.78, 24.07).
Energy Cells is a separate company that does NOT operate at Kruonis. The "(Kruonis)" in the /s4
name appears to be a scraper artifact — possibly conflating the company with the nearby PSP.

Energy Cells actually operates **4 distributed BESS sites** across Lithuania, none at Kruonis.
The /s4 data aggregates them into one 200 MW entry with a misleading name.

**Current overrides in lib/project-overrides.ts:**
```
'energy-cells-kruonis-': {
    lat: 54.7806, lng: 24.0689,  // <-- Same coordinates as Kruonis PSP!
    note: 'Energy Cells (Kruonis) — TSO-owned at Kruonis PSP',
}
```

**Recommendation:** Kastis needs to provide correct Energy Cells location(s).
Options:
1. Place the aggregate dot at Energy Cells HQ or their largest site
2. Split into separate dots if individual site locations are known
3. Use a Lithuanian centroid as a fallback with a "multiple sites" label

### Issue 3: baltic-places.ts has stale hardcoded data
`lib/baltic-places.ts` line 75 has a hardcoded `PROJECT_SUBSTATIONS` array with 9 entries
including "Energy Cells Kruonis." This array is NOT used by the hero component (it uses /s4
data + geocodes), but it should be cleaned up to avoid confusion.

## Correctly Geocoded (look reasonable)

1. **BSP Hertz 1 (Kiisa)** — 100 MW, EE — Kiisa substation near Tallinn. Major operational BESS, location well-known.
2. **Eesti Energia BESS** — 26.5 MW, EE — Auvere, Ida-Viru. Co-located with Auvere power plant.
3. **E energija** — 60 MW, LT — Elektrėnai. Known BESS at legacy thermal plant complex.
4. **AST BESS** — 80 MW, LV — Placed at Rēzekne (60 of 80 MW). Acceptable for an aggregate.
5. **Utilitas Targale** — 10 MW, LV — Ventspils region. Wind+BESS hybrid.
6. **AJ Power portfolio** — 9 MW, LV — Placed at Valmiera (largest of 3 sites). Acceptable.

## Decisions Needed from Kastis

1. **Kruonis PSP (205 MW):** Exclude from hero? (It's hydro, not BESS)
2. **Energy Cells (200 MW):** What is the correct location? Is it one site or multiple?
   - If one aggregate: what lat/lng?
   - If multiple: provide site names + approximate locations
3. **Energy Cells name:** Should the label say "Energy Cells" (no Kruonis)?

## Impact on Hero

If Kruonis PSP is excluded and Energy Cells is relocated:
- Current top 3 by MW: Kruonis PSP (205), Energy Cells (200), BSP Hertz 1 (100)
- Corrected top 3: Energy Cells (200), BSP Hertz 1 (100), AST BESS (80)
- Total operational MW drops by 205 (Kruonis PSP) to ~486 MW
  - But wait — the fleet total comes from /s4/fleet, not from summing projects.
    The fleet endpoint may already exclude PSP. Need to verify.
