# Phase 37 batch-2 — private CRM (/fleet) + forecast wiring (37.C + 37.D)

**Branch:** `phase-37-batch-2` off latest main. **Semi-autonomous — one CP before any deploy.** ~2-3 h.
**Canonical scope:** `docs/phases/phase-37-arc.md` §37.C and §37.D. This prompt carries batch-1's findings and the constraints they imply; where the two differ, THIS file wins and the difference is called out at Pause A.

Read `docs/playbooks/failure-modes.md` first. At Pause A answer the four questions in one paragraph: (a) which premises here are HYPOTHESIS vs verified, (b) what consumes what this batch changes, (c) what fails silently in what it touches and how we would know, (d) at which layer and time success is verified.

---

## Step 0 — close batch-1's two open loops before building anything

1. **Deploy batch-1's additive worker changes** (132 insertions, 0 deletions) — origin-SHA equality check first, `git status` clean, `origin/main..main` empty, then `npx wrangler deploy`. Verify at the outermost layer: `/fleet`-adjacent routes and the existing public routes still serve; `/revenue`-class values are only comparable AFTER the hourly cron tick (B3 — state when your check is valid).
2. **Weekly digest proof run, then arm** — the B10 corollary this batch inherits. Run the dry-run path that sends nothing; paste its output. Only if the dry run is clean, arm the schedule in its own commit, and state explicitly what the first scheduled firing will do and when. If the dry run surfaces anything, STOP the arming and report — an unarmed digest is a fine end state for this batch.

## 37.C — operator-only fleet CRM at `/fleet`

Per arc §37.C. Constraints hardened by batch-1:

- **No public tier exists.** Unauthenticated = gate screen or 404-equivalent, zero fleet data, zero counts, zero "N projects" teasers.
- **Leak tests must be non-vacuous — this is the batch's headline gate.** Batch-1 found its own sweep asserting emptiness against `{"fleet":null}`. Every leak test here seeds a fleet WITH private overlay values present (synthetic, `example.invalid`), asserts those exact values absent from every unauthenticated response and every public route payload, AND carries a vacuity guard that fails if the fixture didn't load. Prove the tests can fail: inject a real leak, show both red, remove it, show green, worker byte-identical after — the batch-1 protocol, repeated at the UI layer too (rendered HTML/JSON, not just API).
- Working view per arc: filter (country / status / verification tier / developer / MW) · per-project drawer with evidence dossier links, status history, private overlay (mailto contacts, deal comments), inline comment edit via authed endpoint · map from the geocoded subset.
- **Surface batch-1's two data-quality realities in the UI, don't hide them:** the `apva_flag` renders as opaque private testimony with "not citable — TAM unblocker" on hover, never as a verification signal; hybrid rows carry the band, not a point MW.
- Density is a feature — this is a working tool. Site language, v5 drawer progressive-disclosure pattern.

## 37.D — forecast wiring

Per arc §37.D, with three hard constraints from batch-1:

1. **Private-only rows are EXCLUDED from every published and client-facing number.** Assert it in the payload tests, not just in code.
2. **The hybrid over-count is a BAND, never a correction.** `hybrid-band.json` (lower 11,975.7 / upper 16,020.4 MW, width 4,044.7) is the input; 37.D re-derives from that artifact and inherits the band — no re-computation from the private BESS-MW column, whatever its magnitude. The artifact declares its own incompleteness (24 of 45 known hybrids carry a public technology signal), so the band UNDERSTATES uncertainty: say so wherever the band is displayed. **Direction check — state it in the report:** a hybrid correction would move supply DOWN, sd_ratio down, cannibalisation down, IRR UP. Flattering-direction movements need the strongest evidence we have; we do not have it, which is exactly why this ships as a band.
3. **Verification tier → confidence weighting:** public-confirmed full STATUS_WEIGHT · corroborated haircut · private-only excluded (operator-view sensitivity only).

Reconciliation additions per arc §37.D.3, plus: retired-MW accounting ties (batch-1's LV near-miss — an untrimmed field marked 486,509 entities terminated, Latvenergo included — makes retirement arithmetic a first-class check, not a footnote).

## CP — before deploy of anything that moves a number

Signed delta table, 36.D CP-2 pattern: for each of gross Y1 / IRR / min DSCR / client portfolio NPV, the pre-state, post-state, absolute and % change, and the named cause. Three supply bases compared side by side (KKME-verified bottom-up · Litgrid L TrSc · pre-37 baseline). Baseline captured from a CLEAN worktree of the reference commit, never via stash (C6). No deploy until the operator signs.

## Gates
`docs/_private/` never staged (assertion script from batch-1 runs on every commit) · no contact/comment/APVA value in any commit, fixture, test output or payload · leak tests proven failable · suite green with new tests · worker changes additive-only unless the CP says otherwise · eslint clean.

## Wrap
Origin-SHA (branch + main) · digest armed or not, with the dry-run output · leak-test failability proof · the signed CP delta table · what 36.E1-E6 now inherits as the supply trajectory · PR URL.
