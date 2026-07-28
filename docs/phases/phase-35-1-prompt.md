# Phase 35.1 — Worker /calculate endpoint + calculator auth + scenario port

**Branch:** `phase-35-batch-1` off latest main (batch mode with 35.2).
**Estimate:** ~1 day. **Risk class: MEDIUM — real worker changes (new endpoints, new secret, two new scenario constant-sets). Public `/revenue` byte-identity (54/54) remains the hard gate.**

## Context

Operator pivot (2026-07-28): the Phase-34 consultancy engine becomes a productised tool — **"BESS Revenue Calculator"** at kkme.eu/calculator. Two tiers: public sample (Y1 headline + 8-line bridge, watermarked, lead-gen CTA) and operator-private full analysis (password → token). Prosperus becomes the first prospect, not the commissioning client. Batch-3 (34.6/34.7 Excel+PDF generators) parks — it becomes the paid-service delivery workflow later.

## Scope

### 1. `POST /calculate`
Body: `{mw, mwh, cod_year, capex_eur_kwh}` + optional `{availability_pct, cycles_efc_yr, warranty_efc_yr, operating_months_y1, scenario}`.
- **Validation** (reject 400 with honest messages): mw 1–1000, mwh 1–4000 with 0.5h ≤ duration ≤ 8h, cod_year 2026–2035, capex 80–400 €/kWh. Derive `duration_h = mwh/mw` (round to engine-supported; if engine only supports 2h/4h — batch-1 knowledge says `dur_h` param exists, verify what values it accepts and clamp/interpolate honestly, document).
- **No auth → SAMPLE tier:** `{tier:'sample', inputs_echo, headline: {gross_y1, net_y1, ebitda_y1, prefin_cf_y1, ebitda_margin_pct}, bridge_y1: [8 summary lines only], sample_note, upsell}` — no 20-yr, no scenarios, no sensitivity, no sub-line detail. `upsell` carries the CTA copy (single source: a `CALC_COPY` constant).
- **Auth → FULL tier:** everything the batch-1/2 runner path produces for one project: bridge with sub-line detail + formulas, `bridge_20yr`, `capex_schedule`, NPV/MOIC, all three client scenarios, sensitivity table, reconciliation summary. Reuse the existing per-project compute path — do NOT fork the math (rule #4).
- **Sample rate-limit:** per-IP counter in KV (`calc_rate:<ip>:<date>`, TTL 24h), 10 sample runs/day. 429 with polite copy after that. Full tier unlimited.

### 2. Auth
- `POST /calculator/login` `{password}` → constant-time compare vs `env.CALC_SECRET` (NEW secret — never reuse UPDATE_SECRET; the admin secret must never be typed into a browser) → returns `{token, expires}` where token = HMAC-SHA256(`calc:<expiry-ts>`, CALC_SECRET) + the expiry, 30-day validity.
- `/calculate` full tier: `Authorization: Bearer <token>` verified by recomputing the HMAC. No user DB, no sessions — one operator.
- **Graceful degradation:** if `env.CALC_SECRET` is unset (pre-deploy-secret state), login returns 503 `{error: 'calculator auth not configured'}`; sample tier works regardless.

### 3. Client scenario port (the batch-2 finding, closed properly)
Batch-2's `scenario-overlay.mjs` substitutes module constants at Node level — unusable inside the running worker. Port the two client scenario constant-sets (`client_downside`, `client_upside` — exact values from `tools/consultancy/scenarios.json`) into the worker's scenario-selection modules as named sets alongside base/conservative/stress. Central ≡ existing base (assert — batch-2 proved this; keep the assertion as a test). The 2 zero-impact drivers (spread_growth, cpi_floor) port anyway for honesty (they set their constants; they still move nothing — that's the documented finding).
**Overlay parity test:** worker-computed client_downside/upside for the 3 Prosperus configs must equal batch-2's overlay outputs exactly. If they don't, the port is wrong — fix the port, never touch the overlay.

### 4. Gates
- Regression 54/54 byte-identical on `/revenue` (endpoints are additive).
- vitest: validation cases, auth (bad password, expired token, missing secret), rate-limit, tier shapes, scenario parity, sample-tier field-absence (assert the sample response CANNOT contain 20-yr/sensitivity keys — leak test).
- tsc, lints.

## Autonomous decision rules
- Duration support ambiguity: clamp to nearest supported with `inputs_echo.duration_note`. Conservative.
- Anything threatening `/revenue` byte-identity: runner/endpoint-level solution, never shared-path edits.

## Commit
`phase 35.1: /calculate endpoint (sample+full tiers) + calculator auth + client scenario port` → push → origin-SHA check → **NO DEPLOY YET** (deploy happens once, after 35.2, operator-initiated) → continue to 35.2.
