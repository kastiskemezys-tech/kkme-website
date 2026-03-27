# KKME Publication Gate Rules
# Every metric must pass before appearing on the public site.

## Gate computation

For each metric, compute:
- data_class: OBSERVED / DERIVED / PROXY / MODELED / REFERENCE / EDITORIAL
- confidence_grade: A / B / C / D / E
- inference_distance: 1 (raw) / 2 (one transform) / 3 (model chain) / 4+ (deep model)
- freshness: hours since last source update
- coverage: time × field × product (0-1)

## Publication decision

| Confidence | Inference dist | Coverage | Gate |
|-----------|---------------|----------|------|
| A-B | 1-2 | > 0.7 | PUBLIC_OK |
| A-B | 3+ | > 0.5 | PUBLIC_WITH_WARNING |
| C | 1-2 | > 0.5 | PUBLIC_WITH_WARNING |
| C | 3+ | any | INTERNAL_ONLY |
| D-E | any | any | INTERNAL_ONLY |
| any | any | < 0.3 | INTERNAL_ONLY |
| any | any | stale > 24h | PUBLIC_WITH_WARNING (add stale flag) |

## Override rules
- Kastis can override INTERNAL_ONLY → PUBLIC_WITH_WARNING with logged justification
- No override path from INTERNAL_ONLY → PUBLIC_OK
- Override log stored in ~/kkme/docs/OVERRIDE_LOG.md

## Current metric gates (based on today's coverage)

| Metric | Confidence | Inf. dist | Coverage | Gate |
|--------|-----------|-----------|----------|------|
| DA prices (S1 LT/SE4/PL) | A | 1 | 1.0 | PUBLIC_OK |
| DA spread (S1) | A | 2 | 1.0 | PUBLIC_OK |
| BESS capture (S1) | B | 2 | 0.9 | PUBLIC_OK |
| S/D ratio (S2) | C | 3 | 0.6 | PUBLIC_WITH_WARNING |
| Market phase (S2) | C | 3 | 0.6 | PUBLIC_WITH_WARNING |
| aFRR price est. | D | 4 | 0.3 | INTERNAL_ONLY |
| mFRR price est. | D | 4 | 0.3 | INTERNAL_ONLY |
| FCR price | D | 3 | 0.2 | INTERNAL_ONLY |
| Project IRR | D | 5 | 0.3 | INTERNAL_ONLY |
| Equity IRR | D | 5 | 0.3 | INTERNAL_ONLY |
| DSCR | D | 5 | 0.3 | INTERNAL_ONLY |
| Dispatch revenue | C | 3 | 0.5 | PUBLIC_WITH_WARNING |
| TTF gas (S7) | A | 1 | 1.0 | PUBLIC_OK |
| ETS carbon (S9) | A | 1 | 1.0 | PUBLIC_OK |
| Grid capacity (S4) | B | 1 | 0.8 | PUBLIC_OK |
| Euribor (S3) | A | 1 | 1.0 | PUBLIC_OK |
| Fleet operational MW | B | 2 | 0.7 | PUBLIC_OK |
| Fleet weighted MW | C | 3 | 0.5 | PUBLIC_WITH_WARNING |
| Fleet trajectory | C | 4 | 0.4 | INTERNAL_ONLY |
| Interconnector flows (S8) | A | 1 | 0.9 | PUBLIC_OK |
| Nordic hydro (S6) | A | 1 | 0.8 | PUBLIC_OK |
| CH benchmark | B | 1 | 1.0 | PUBLIC_OK |

## Key implications for UI design
- aFRR/mFRR/FCR prices: INTERNAL_ONLY → never hero metrics. Show only in detail drawers with explicit proxy labels.
- Project/Equity IRR: INTERNAL_ONLY → not hero. Show under "scenario screen" framing only.
- S/D ratio: PUBLIC_WITH_WARNING → can be hero but must have DataClassBadge + caveat.
- Dispatch revenue: PUBLIC_WITH_WARNING → show with caveats about fixed capacity factor.
- DA spread, TTF, ETS, Grid, Euribor: PUBLIC_OK → can be hero metrics without qualification.
