# Phase 7.5-F — Resume prompt v3 (finish screenshots + push)

**For:** fresh Claude Code session, YOLO mode
**Branch:** `phase-7-5-F-card-redesign` (already checked out; do NOT re-branch)
**State:** F4 part 2 committed at `3000e7e`. 3 of 11 screenshots captured, 8 remaining.
**Full plan:** `docs/phases/phase7-5-F-card-redesign-plan.md` — §F4 is done code-wise; only docs/push remain.
**Prior prompt:** `docs/phases/phase7-5-F-resume-prompt-v2.md` — §2 (screenshots) and §3 (push) still govern. §1 (F4 S2 build) is complete.

v2 session stopped at ~83% context mid-drawer-shot batch. Clean commit
boundary is 3000e7e — the S2 clickable face + country-scoped drawer
bridge is live and verified (tsc + next build both green).

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/handover.md` (Session 9 + current phase)
3. `git log --oneline -4` — top should be `3000e7e phase-7-5-F(cards): F4 part 2 …`
4. `bash scripts/diagnose.sh` — confirm prod still green
5. `ls docs/visual-audit/phase-7-5-F/` — confirm 3 PNGs already present:
   - `s1-face-dark.png` (clean — pulse dot + 7h ago + source chip all visible, hero €141, TIGHTENING chip)
   - `s2-face-dark.png` (clean — 27m ago, BTD chip, hero €13.5, STABLE chip, LT aFRR `n/a` rate muted, imbalance tiles)
   - `s1-drawer-what.png` (**imperfect** — scroll landed such that the "WHAT THIS IS" section title row may not be visible at the top; re-shoot or accept)

Report state, pause for "go" before editing.

---

## 1. Screenshot batch — 8 remaining (+ optional re-shoot of s1-drawer-what)

**Dir:** `docs/visual-audit/phase-7-5-F/`
**Viewport:** 1440×900
**Dev server:** already running at http://localhost:3000 (confirmed via curl 200). Spawn a fresh chrome-devtools-mcp if the prior session left a lock; `pkill -f "chrome-devtools-mcp/chrome-profile"` clears it.

### Known-good workflow that worked for the 3 captured

1. `new_page` → `http://localhost:3000`
2. `resize_page 1440 900`
3. `evaluate_script`: find `article` with `innerText.startsWith('S1')` (or S2), scroll so `article.getBoundingClientRect().top + window.scrollY - 80` = target scrollY via `window.scrollTo({ top: …, behavior: 'instant' })`
4. `take_screenshot` → `/tmp/kkme-<name>.png`
5. Crop with Pillow (macOS DPR = 2, raw image is 2880px wide). S1 crop `(140, 60, 688, 585)` at CSS px; S2 crop `(742, 60, 1290, 555)` at CSS px. Multiply by 2 before passing to PIL `.crop()`.

Script helper already proven (paste into python3):
```python
from PIL import Image
img = Image.open(src); scale = img.size[0] / 1440
def px(v): return int(round(v * scale))
img.crop((px(x0), px(y0), px(x1), px(y1))).save(dst)
```

### Drawer captures — the tricky part

`drawerRef` is component-scoped. Don't add a debug hook. Two working patterns:

- **`what` anchor**: click the hero button (`article.querySelector('button[aria-label*="gross capture"]')` for S1 / `[aria-label*="balancing capacity"]` for S2). Drawer opens and auto-scrolls to `what`. Wait ~700ms for the transition + scrollIntoView timer.
- **`how` anchor**: click hero first (to open drawer if closed), wait ~500ms, then manually scroll `[data-anchor="how"]` into view inside the same article:
  ```js
  const anchor = article.querySelector('[data-anchor="how"]');
  const pageY = anchor.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: pageY - 80, behavior: 'instant' });
  ```

**Critical polish note from v2 session:** for `drawer-what` shots, make sure the section-title row ("WHAT THIS IS" for S1, same for S2 — uppercase, letter-spaced, muted) is visible at the top of the crop. The v2 attempt on `s1-drawer-what.png` landed the anchor top at viewport y=52 but the crop started at y=40 — the section title is right on the edge. Target anchor top at viewport y ≈ 100 so the section title breathes above the first prose paragraph. Adjust the `- 80` offset to `- 100` or higher.

### Required captures — exact filenames

Order that minimizes page reloads (user-confirmed):

**Dark faces (start here):**
- ~~`s1-face-dark.png`~~ ✅ captured
- ~~`s2-face-dark.png`~~ ✅ captured

**Dark drawers:**
- `s1-drawer-what.png` — re-shoot with section title visible (~~existing is imperfect~~)
- `s1-drawer-how.png` — section title "HOW WE COMPUTE THIS" at top
- Close S1 drawer (click the "▸ Reading this card" toggle).
- `s2-drawer-what.png` — section title "WHAT THIS IS" visible, showing country-scoped opening paragraph
- `s2-drawer-how.png` — section title "HOW WE COMPUTE THIS" at top

**Dark country/product (clear any pinned dot before each):**
- `s2-country-lv.png` — click LV toggle, verify hero updates to LV P50, RateChip muted `n/a` if LV activation rate is null. Spot-check with `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/s2 | jq '.activation.lv'`.
- `s2-country-ee.png` — click EE, same checks.
- `s2-product-fcr.png` — click FCR toggle; LT/LV/EE country buttons should render disabled (opacity 0.45, `cursor: not-allowed`, muted text). The imbalance-tile row also disappears because FCR doesn't have a per-country activation rate — expected.

**Light theme (toggle via header nav button "Switch to light theme"):**
- `s1-face-light.png`
- `s2-face-light.png`

### Eyeball checklist per shot

- **Dark faces**: pulse dot visible (green `--teal`, not flash-amber), timestamp in primary-weight color, source chip readable, **no hover underline on the hero** (don't move the mouse over the card between scroll and capture).
- **Country shots**: RateChip should read `n/a` muted for LV/EE if the worker reports null. Sanity-check the hero value against `jq '.activation.lv.afrr_p50'` on the live worker response.
- **FCR**: country toggle visibly disabled; "activation rate n/a" is not rendered (FCR path skips the chip).
- **Drawer shots**: section title row visible at top; you shouldn't see the tail end of a previous section bleeding in above it.

---

## 2. Push (after all 11 PNGs land)

```
git add docs/visual-audit/phase-7-5-F/
git commit -m "docs(phase7-5-F): F4 part 2 screenshots + v3 resume hand-off"
git push -u origin phase-7-5-F-card-redesign
```

Report to Kastytis:
- Branch URL on GitHub (construct manually, **no `gh` CLI**)
- Suggested PR title: `phase-7-5-F: S1/S2 card face redesign — live-data signal, prose→drawer, country toggle, clickable face`
- Suggested PR body covering F1/F2/F3/F4 (both parts). Paste screenshot paths. Include the verification quotes: `grep "capacity clearing at" S2Card.tsx` → 0, `grep "sitting" S1Card.tsx` → 0, tsc clean, next build 18.2s/6-pages-static.

**Stop at Pause 3.** Do not open PR. Do not merge. Wait for
"merged" confirmation before any handover/session-log writes.

---

## 3. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- No scope creep beyond finishing screenshots + pushing.
- Pre-commit lint errors in `workers/fetch-s1.js` + two `no-direct-set-state-in-use-effect` errors in S1Card/S2Card remain out of scope. `npx next build` is the release gate; ignore `npm run lint` noise.
- If budget gets tight again (>80%), commit what's captured + this same v3 prompt (bump to v4 and note which shots remain).
