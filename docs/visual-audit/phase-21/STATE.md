# Phase 21 — visual-audit state description (curl-derived)

**Why prose, not screenshots:** chrome-devtools-mcp browser-lock condition recurred
for the 3rd consecutive session (47 + 48 + 49); operator approved curl-only
verification path. In-browser visual confirmation owned by operator post-merge
via Cloudflare Pages preview deploy of the PR branch.

**Captured at:** 2026-05-07, against worker version `2b3c6bc5-e9a3-4819-9919-cd1ec3d85952`
+ local production build artifacts at `/Users/Kastis/kkme/out/`.

---

## 1. Worker `/s2` payload (production, cache-busted)

Live values feeding the S2 card today:

| Field | Value |
|---|---|
| `afrr_up_avg` (LT, up-only, 7d mean) | **7.91** €/MW/h |
| `afrr_down_avg` (LT, down-only, 7d) | 6.44 €/MW/h |
| `mfrr_up_avg` (LT) | 11.57 €/MW/h |
| `fcr_avg` (Baltic) | 8.37 €/MW/h |
| `imbalance_mean` | 68.36 MWh |
| `imbalance_p90` | 181.67 MWh |
| `pct_above_100` | 33.18% |
| `activation.lt.afrr_p50` (LT, combined, 3m) | 13.5 €/MW/h |
| `activation.lt.mfrr_p50` (LT, combined, 3m) | 14.5 €/MW/h |
| **`afrr_up_avg_90d_delta`** (NEW Phase 21) | **null** |

Null-on-first-ship is the by-design operator-honest behavior per discipline rule
#1: `s2_history` KV currently has 48 daily snapshots (oldest 2026-03-02);
function requires ≥60 days before emitting a number. **First real value
materializes ~12 days from today (~2026-05-19); full 90-day window reaches
~2026-06-18.** Until then the chip renders muted `Δ — / 90d` with explanatory
title tooltip.

---

## 2. S2 card — aFRR · LT view (default state, post-Phase-21)

Rendered top-to-bottom:

### 2.1 Header strip

```
S2 · BALANCING · LT/LV/EE  [LIVE pulse]  3h ago  [BTD]    [aFRR][mFRR][FCR] | [LT][lv][ee]
                                                                                      ↑     ↑↑
                                                                                  highlighted, disabled greyed
```

Country toggle: LT highlighted (canonical for aFRR per Phase 21); LV + EE
visually disabled at 0.45 opacity (mirrors FCR pattern).

### 2.2 Hero band

```
€7.91 ¹ /MW/h  LT · UP ONLY · 7D  [Δ — / 90d]  [n/a]  [aFRR · THICK · ≥100 MW]
─────  ─       ────────────────  ──────────  ─────  ─────────────────────────
hero   anchor  uppercase methodology   delta   rate   market thickness chip
                  hint label           chip   chip   (Phase 21 quantitative
                                       muted          anchor appended)
                                       (null)
```

— `€7.91/MW/h` rendered in serif Newsreader hairline (`clamp(56–88px)`), color
  `var(--text-primary)`, hover-underline anchor opens `what` drawer.
- Footnote anchor `¹` superscript next to hero number.
- `LT · UP ONLY · 7D` hint in mono-uppercase, `var(--font-2xs, 10px)`,
  `var(--text-tertiary)`, with `title=` tooltip explaining: "aFRR hero = BTD
  price_procured_reserves Lithuania up-direction column, 7-day rolling mean.
  This is the operationally honest revenue anchor for one-direction BESS
  bidding. Combined up+down P50 (the ENTSO-E auction-clearing methodology
  view, ~70% higher) is shown as a methodology disclosure on the next line."
- `[Δ — / 90d]` muted boxed chip; `var(--text-muted)`, transparent background,
  `var(--border-subtle)` border. `title=` tooltip: "30d-vs-60d directional delta
  — not yet computable. Worker requires ≥60 days of s2_history KV snapshots."
- `[n/a]` rate chip muted (no activation rate published for LT yet — pre-existing).
- `[aFRR · THICK · ≥100 MW]` per Phase 21 sub-item (c-2): level word preserved
  (institutional readers recognize THICK = price-taker assumption holds);
  quantitative depth anchor `≥100 MW` appended. Tooltip unchanged.

### 2.3 Methodology disclosure subline (replaces former "Baltic avg" mislabel)

```
Combined up+down (LT, 3m P50): €13.5/MW/h · down 7d: €6.44/MW/h
```

Mono, `var(--text-muted)`, `var(--font-2xs, 10px)`. **Quiet integrity fix** —
prior text said "(up only, Baltic avg)" but BTD `price_procured_reserves`
column 11 is Lithuania-only per `reference_btd_api.md`. Discipline rule #1
caught the mislabel during scope validation; fixed in same edit pass.

### 2.4 Imbalance tile row + interpretive connector (NEW Phase 21)

```
─── (top hairline) ────────────────────────────────────────────
IMB. MEAN          IMB. P90          % >100 MWH
68 MWh             182 MWh           33%
─── (bottom hairline) ─────────────────────────────────────────
Imbalance volume drives activation: more imbalance → more aFRR
called → activation revenue layers on top of the capacity
reservation above. Today's 33% >100 MWh ≈ 1-in-3 settlement
periods stressed.
```

Three TileButtons unchanged. Below the bottom hairline, **NEW** muted prose
line (mono, `var(--font-2xs, 10px)`, `var(--text-muted)`, `lineHeight: 1.5`,
`margin: -4px 0 12px`). Data-derived: `33%` from `pct_above_100`, `1-in-3`
from `Math.max(2, Math.round(100 / 33.18)) = 3`. Renders only when
`pct_above_100 != null && > 0`.

### 2.5 Trajectory chart (LT aFRR P50 monthly)

Unchanged from Phase 18.2.2. Small chart 170px height. Crosshair "+" + tightened
tooltip from Session 48.

### 2.6 Impact line (auto-corrects from hero swap)

```
At a 50 MW aFRR offer, today's clearing implies
€3,464k/year of reserved-capacity revenue.
```

Was **€5,913k/yr** pre-Phase-21 (`13.5 × 50 × 8760 / 1000`). Now **€3,464k/yr**
(`7.91 × 50 × 8760 / 1000`). Math expression unchanged at `S2Card.tsx:~308`;
swap is reframing not recalculation. The €3.46M/yr is the operationally honest
annualized number for one-direction BESS at 50 MW LT.

### 2.7 Footnote (aFRR-specific override)

```
¹ aFRR capacity-reservation price; BTD price_procured_reserves,
  Lithuania, up-direction column, rolling 7d mean. methodology.
```

Was: "aFRR capacity-reservation price; BTD price_procured_reserves, LT,
rolling 7d. Up + down direction combined. methodology."

Changes: explicit "Lithuania, up-direction column", drops "Up + down direction
combined" (replaced by methodology disclosure subline at 2.3), adds "mean"
(was implicit). mFRR + FCR footnotes unchanged.

### 2.8 Drawer "What this is" section (aFRR-specific prose fork)

```
Lithuania aFRR (up-direction only) clears at €7.91/MW/h on a
7-day rolling mean.

This is the operational revenue anchor for one-direction BESS
bidding. Combined up+down P50 (the ENTSO-E auction-clearing
methodology view) is ~70% higher; see the methodology disclosure
beneath the hero.

This is capacity payment — paid per MW offered per hour,
regardless of activation.
```

mFRR + FCR drawer prose unchanged.

---

## 3. S2 card — mFRR · LT view

- Hero remains `act.mfrr_p50` 3m combined (out of scope for Phase 21)
- StatusChip remains the original P50-self-comparison chip (broken / always
  ~0% pre-existing — out of scope; flagged in handover backlog for future phase)
- Country toggle ACTIVE; user can pick LT / LV / EE
- aFRR ↔ mFRR product flip preserves the user's prior LV / EE country selection
  via the new `effectiveCountry` derivation pattern (no useEffect setCountry
  cascade — passes lint react-hooks/set-state-in-effect)
- THICK chip becomes `mFRR · MEDIUM · 50–100 MW` (Phase 21 anchor) with
  caption "thinner market — bid-shading recommended" beneath

## 4. S2 card — FCR view

- Hero remains `data.fcr_avg` Baltic
- Country toggle remains DISABLED (pre-existing FCR pattern)
- Trajectory chart switches to `HistoryChart` (FCR daily 30d)
- StatusChip pre-existing (out of scope)
- THICK chip becomes `FCR · THIN · ≤50 MW` (Phase 21 anchor) with caption
  "very thin market — price-taker assumption breaks for >50 MW" beneath

---

## 5. Cross-card propagation check (rule #4)

Quantitative anchor field on `MarketThicknessSpec` propagates to:

- `S2Card.tsx:249` — `<MarketThicknessChip product={prod} showCaption />` (3 products)
- `TradingEngineCard.tsx:497-499` — `<MarketThicknessChip product="afrr|mfrr|fcr" showCaption />` (3 chips)

Both surfaces inherit the new `· {anchor}` rendering automatically. No engine
math change; chip is purely declarative metadata.

`afrr_up_avg` cross-card consumers unchanged in count (5 frontend + 1 engine
math input), but S2Card hero now reads it directly (was reading
`act.afrr_p50` which is 3m P50 combined LT from activation feed). All other
sites continue rendering 7d-mean LT up-only €7.91 (precision standardized to
2dp in Phase 12.11; not changed here).

---

## 6. Local-build smoke-test summary

- `npm run build` → ✓ 7 routes (Compiled in 4.8s, all 9/9 pages generated)
- `out/_next/static/chunks/` — 28 chunks, 4.5 MB total raw
- `index.html` references **20 chunks**; all 20 return HTTP 200 at localhost:3101
- Phase-21 literals confirmed embedded in static chunks:
  - `afrr_up_avg_90d_delta` field name
  - `up only` + `Lithuania, up-direction column` footnote text
  - Quantitative anchors `100 MW` / `50 MW`

**18.1.1 ChunkLoadError class structurally absent.** Bundle delta from new
component + edits is below the noise floor (~+50 lines source).

---

## 7. Worker deploy + curl verification

```
Uploaded kkme-fetch-s1 (12.90 sec)
Deployed kkme-fetch-s1 triggers (7.81 sec)
Current Version ID: 2b3c6bc5-e9a3-4819-9919-cd1ec3d85952
Total upload: 346.46 KiB / gzip: 84.40 KiB
4 cron triggers preserved
```

```bash
curl -s -H 'Cache-Control: no-cache' \
  "https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2?_cb=$(date +%s)" \
  | jq '. | {afrr_up_avg, afrr_up_avg_90d_delta, has_delta_key: (has("afrr_up_avg_90d_delta"))}'

→ {
    "afrr_up_avg": 7.91,
    "afrr_up_avg_90d_delta": null,
    "has_delta_key": true
  }
```

Field present on `/s2` with explicit `null` per null-safety branch (window
underfilled). Frontend chip renders muted `Δ — / 90d` until threshold met.

---

## 8. Files touched (7 total)

- `app/components/S2Card.tsx`
- `app/components/MarketThicknessChip.tsx`
- `app/lib/financialDefinitions.ts`
- `app/lib/metricRegistry.ts`
- `app/lib/__tests__/metricRegistry.test.ts`
- `app/lib/__tests__/marketThicknessChip.test.tsx`
- `workers/fetch-s1.js`

---

## 9. What operator should hard-refresh-check post-merge

1. **Hover S2 hero** at 1440px desktop and 360px mobile — confirm:
   - `€7.91/MW/h` (NOT €13.5) reads as primary
   - `LT · UP ONLY · 7D` mono uppercase hint visible to right of hero
   - `Δ — / 90d` muted chip visible (not omitted)
   - `aFRR · THICK · ≥100 MW` chip with quantitative anchor (not just THICK)
2. **Toggle aFRR ↔ mFRR ↔ FCR** — confirm:
   - aFRR: country toggle greys out, LT highlighted
   - mFRR: country toggle re-activates with whatever country was last picked
   - FCR: country toggle stays greyed (pre-existing)
3. **IMB row** — confirm interpretive line beneath the 3 tiles reads:
   "Imbalance volume drives activation: more imbalance → more aFRR called →
    activation revenue layers on top of the capacity reservation above.
    Today's 33% >100 MWh ≈ 1-in-3 settlement periods stressed."
4. **Light + dark theme** — confirm chip + interpretive line both render
   readably in both themes (they use `var(--text-muted)` + `var(--border-subtle)`
   which are theme-aware tokens)
5. **Drawer "What this is"** for aFRR — confirm new 3-paragraph prose with
   "Lithuania aFRR (up-direction only)" + "operational revenue anchor" framing
6. **Footnote** at card bottom — confirm aFRR reads "Lithuania, up-direction
   column, rolling 7d mean" (not "LT, rolling 7d. Up + down direction combined")
7. **Footer** "**€3,464k/year**" (NOT €5,913k) — auto-corrects from hero swap
