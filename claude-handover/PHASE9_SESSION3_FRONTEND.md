# Phase 9, Session 3: Frontend Rebuild — Structural Market Drivers

## Prerequisites

- Session 2 complete: `/s_wind`, `/s_solar`, `/s_load` endpoints returning data
- Existing endpoints unchanged: `/s7`, `/s8`, `/s9`, `/s6`

---

## Section specification

### Section ID: `structural`
### Section title: "Structural Market Drivers"
### Section subtitle: "Wind, solar, demand, and interconnector conditions that shape Baltic price spreads and storage economics"

### Layout: Two-tier grid

**Primary row (4 cards, `grid-2` or 4-col on wide screens):**
1. Baltic Wind Generation — `/s_wind`
2. Baltic Solar Generation — `/s_solar`
3. Baltic Demand — `/s_load`
4. Interconnectors & Connected Markets — `/s8` (enhanced)

**Secondary row (2 cards, smaller, `card-tier3` styling):**
5. TTF Gas — `/s7` (existing S7Card, possibly restyled)
6. EU ETS Carbon — `/s9` (existing S9Card, possibly restyled)

### Removed from section:
- S5 (DC Power Viability) — remove from this section entirely. Future: dedicated buildability sub-signal or standalone module.
- S6 (Nordic Hydro) — remove from primary display. Could appear as a supporting metric inside S8 drawer (Nordic connected market context) or be dropped entirely.

---

## Files to create

### 1. `app/components/WindCard.tsx` (~120-150 lines)

**Fetches:** `/s_wind` via useSignal
**Hero metric:** Baltic wind generation, current MW
**Sub-metric:** % of installed capacity (penetration)
**Viz:** Compact bar showing current vs installed, or 24h min/max range bar
**Status:** HIGH / MODERATE / LOW
**Interpretation:** One line connecting wind level to price spreads
**Impact line:** "50MW reference asset: High wind widens arbitrage spreads" / similar
**Drawer:** Per-country breakdown (LT/EE/LV), 24h stats, methodology
**Source footer:** energy-charts.info · Updated every 4h
**Data class:** Observed (aggregated TSO generation data)

### 2. `app/components/SolarCard.tsx` (~120-150 lines)

**Fetches:** `/s_solar` via useSignal
**Hero metric:** Baltic solar generation, current MW
**Sub-metric:** % of installed, or daylight/night indicator
**Status:** HIGH / MODERATE / LOW / NIGHT
**Interpretation:** One line on solar's role in charging economics
**Impact line:** "50MW reference asset: Solar peak = lowest-cost charging window"
**Drawer:** Per-country breakdown, peak vs current, methodology
**Source footer:** energy-charts.info · Updated every 4h
**Data class:** Observed

### 3. `app/components/LoadCard.tsx` (~100-130 lines)

**Fetches:** `/s_load` via useSignal
**Hero metric:** Baltic system demand, current MW
**Sub-metric:** 24h range (min–max)
**Status:** PEAK / NORMAL / LOW
**Interpretation:** One line on demand level and price implications
**Impact line:** "50MW reference asset: Peak demand supports discharge revenue"
**Drawer:** Per-country breakdown, 24h pattern, methodology
**Source footer:** energy-charts.info · Updated every 4h
**Data class:** Observed

### 4. Modify `app/components/S8Card.tsx` (enhance, ~30-50 lines net addition)

**Enhanced title:** "Interconnectors & Connected Markets" (was "Interconnector Flows")
**Add:** EstLink data if available from Session 2
**Add:** Net Baltic position summary
**Keep:** Existing NordBalt + LitPol display
**Drawer enhancement:** Add connected market price context if S1 KV data is available
**Do NOT add:** New fetch calls from S8Card. All data should come from /s8 endpoint.

---

## Files to modify

### `app/page.tsx`

Replace the current `id="context"` section with:

```tsx
{/* ═══ STRUCTURAL MARKET DRIVERS ═══ */}
<div className="section" id="structural">
  <div style={{ marginBottom: '32px' }}>
    <h2 className="section-header" style={{ marginBottom: '6px' }}>Structural Market Drivers</h2>
    <p style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>
      Wind, solar, demand, and interconnector conditions shaping Baltic price spreads
    </p>
  </div>

  {/* Primary row — 4 structural drivers */}
  <div className="grid-2" style={{ marginBottom: '24px' }}>
    <div className="card card-tier2">
      <CardBoundary signal="wind"><WindCard /></CardBoundary>
    </div>
    <div className="card card-tier2">
      <CardBoundary signal="solar"><SolarCard /></CardBoundary>
    </div>
    <div className="card card-tier2">
      <CardBoundary signal="load"><LoadCard /></CardBoundary>
    </div>
    <div className="card card-tier2">
      <CardBoundary signal="S8"><S8Card /></CardBoundary>
    </div>
  </div>

  {/* Secondary row — commodity price drivers */}
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '24px',
  }}>
    <div className="card card-tier3">
      <CardBoundary signal="S7"><S7Card /></CardBoundary>
    </div>
    <div className="card card-tier3">
      <CardBoundary signal="S9"><S9Card /></CardBoundary>
    </div>
  </div>
</div>
```

### Import changes in page.tsx:
- Add: `import { WindCard }` , `import { SolarCard }`, `import { LoadCard }`
- Remove: `import { S5Card }` , `import { S6Card }` (no longer in section)
- Keep: S7Card, S8Card, S9Card imports

### StickyNav update:
- Change nav link from "Market" → "Structure" (or keep "Market" if it maps better)
- Target: `#structural` instead of `#context`

---

## Files to delete (or just remove from page.tsx)

### Option A: Remove imports only (safer)
- Remove S5Card and S6Card from page.tsx imports and JSX
- Keep the component files for potential future use

### Option B: Delete component files
- Delete `app/components/S5Card.tsx`
- Delete `app/components/S6Card.tsx`
- Risk: may break if any other file imports them

**Recommendation:** Option A for Session 3. Clean up files in a later pass after confirming nothing references them.

---

## Card build rules (apply to all 3 new cards)

Per CLAUDE.md and INTERACTION_ARCHITECTURE.md:

### Layer A (default visible, ≤9 elements):
1. Card title (mono, uppercase, small)
2. One-line subtitle
3. Hero metric (Unbounded font)
4. Status chip
5. Sub-metric (1 max)
6. Interpretation line (Cormorant Garamond)
7. Impact line (teal, mono)
8. Source footer
9. Drawer trigger

### Layer B (drawer):
- Per-country breakdown
- 24h statistics
- Installed capacity references

### Layer C (drawer, bottom):
- Data source and update frequency
- Data classification explanation
- Methodology notes

### Typography:
- Hero numbers: Unbounded
- Data, labels, source: DM Mono
- Interpretation line: Cormorant Garamond, font-sm, text-secondary

### Sizing:
- Card-tier2 borders (--border-card)
- 24px internal padding
- Max card height ~400px when closed

---

## Verify checklist

```bash
# After all changes:
npx tsc --noEmit
npm run build

# Check no broken imports
grep -r "S5Card\|S6Card" app/ --include="*.tsx" --include="*.ts"

# Check section exists
grep "structural" app/page.tsx

# Check new imports
grep "WindCard\|SolarCard\|LoadCard" app/page.tsx

# Diff stats
git diff --stat
```

---

## What NOT to do in Session 3

- Do NOT modify the worker
- Do NOT modify RevenueCard, S1Card, S2Card, S3Card, S4Card
- Do NOT add new endpoints
- Do NOT create a separate section for S5 or S6 — just remove them from this section
- Do NOT add chart libraries (D3 etc.) — use CSS bars/simple SVG only
- Do NOT add tabs, toggles, or multi-view controls within cards
- Do NOT exceed 150 lines per new card component
- Do NOT add history charts (future feature)

---

## Risk assessment

| Risk | Mitigation |
|------|-----------|
| /s_wind etc. endpoints empty (Session 2 incomplete) | Check endpoint availability before starting. Show loading/unavailable state gracefully. |
| S5/S6 removal breaks other imports | Grep for all references before removing |
| 4 primary cards too wide on mobile | grid-2 wraps to 1-col on mobile by default |
| Wind/solar at night shows 0 MW | Solar: show NIGHT state. Wind: show current value regardless (wind blows at night). |
| Installed capacity references stale | Flag as "reference" data class, show approximate year |
