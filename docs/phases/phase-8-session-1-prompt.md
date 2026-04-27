# Phase 8 — Foundation Sprint (Session 1: tokens + typography)

**For:** fresh Claude Code session, YOLO mode (`--dangerously-skip-permissions --model claude-opus-4-7`)
**Branch:** new `phase-8-foundation` off main (after Phase 7.6 merges into main).
**Estimated runtime:** 1.5–2 hours of focused work, then handoff. Don't carry past 80% context.

**Why parallel with Phase 7.7 (decision B):** the user has decided to ship design and bankability in parallel, alternating CC sessions. Phase 8 has minimal data-binding dependency; Phase 7.7 has minimal design dependency. They can interleave without merge conflicts if each phase keeps to its own files.

**Read first, before anything else:**
1. `CLAUDE.md` — repo conventions
2. `docs/phases/upgrade-plan.md` — master roadmap. §1 (locked principles P1–P7), §1b (cross-cutting numerical rules N-1 through N-11), §2 Phase 8 (tokens, typography, primitives, microbrand)
3. `docs/handover.md` — Session 13 most-recent entry should describe Phase 7.6 close-out
4. `app/globals.css` — existing CSS variables / token state. End-to-end. This is where 8.1 work lands.
5. `app/layout.tsx` — current font setup (Cormorant + DM_Mono + Unbounded via next/font/google). 8.2 work changes this.

**One-sentence brief (P4 brand position):** *"Engineering schematic meets Baltic modernist editorial. Pixel/dot-grid as motif. Mono and serif as twin voices. Numbers are the heroes; everything else is supporting cast."*

**Scope (this session — 8.1 + 8.2 only):**
- 8.1 Complete semantic token layer
- 8.2 Three-voice typography system

8.3 onward (extending existing primitives + adding new visual atoms) is **explicitly Session 2** of Phase 8. Don't start it. Hand off cleanly.

---

## 0. Session-start protocol

1. `cat CLAUDE.md`
2. `cat docs/phases/upgrade-plan.md` — re-read §1, §1b, §2 Phase 8
3. `cat docs/handover.md` — confirm Phase 7.6 closed; Phase 7.10 (regulatory feed) is on a separate branch
4. `git log --oneline -5` — confirm you're on a fresh `phase-8-foundation` branch off main
5. `git status` — clean working tree
6. `bash scripts/diagnose.sh` — confirm prod still green
7. `npm test` — establish current spec baseline (should be 107 + Phase 7.10's 28 = 135 if 7.10 also merged; otherwise 107)
8. `npx tsc --noEmit` — clean

Read these files end-to-end:
- `app/globals.css` — full CSS (where 8.1 lands)
- `app/layout.tsx` — font setup (where 8.2 lands)
- `app/components/primitives/StatusChip.tsx` — example of how existing primitives consume tokens (do NOT modify in this session; reference only)
- `app/components/primitives/MetricTile.tsx` — same; reference only

Report state, pause for "go" before editing.

---

## 1. 8.1 — Complete semantic token layer (~45 min)

**Current state inventory (audit before adding):** `app/globals.css` already defines:
- `--accent: #7b5ea7`, `--teal: rgb(0,180,160)`, `--amber: rgb(212,160,60)`, `--accent-purple`, `--accent-green`, `--accent-teal`, `--accent-rose`, `--accent-amber`
- `--border-card`, `--border-highlight`, `--border-subtle`
- `--teal-strong/medium/subtle/bg`, `--amber-strong/subtle/bg`, etc.
- `[data-theme="light"]` block at line 191 with light-mode counterparts

**What's missing per P1 (locked):** bare semantic tokens. Renderer code that reaches for `--success`, `--danger`, `--mint`, `--coral`, `--lavender`, `--sky`, `--ink`, `--paper` returns nothing.

**Task: add named aliases over existing primitives. Do NOT introduce new color values for now.**

In `app/globals.css`, add a new section near the top (after the existing `--teal` / `--amber` definitions):

```css
/* ─── Semantic palette aliases (Phase 8.1) ─────────────────────────── */
:root {
  /* Data-state colors per P1 — descriptive, not editorial */
  --mint:     var(--teal);            /* expansive / wide / observed */
  --amber-semantic: var(--amber);     /* tight / compressed / warning  */
  --coral:    var(--accent-rose);     /* extreme / stress / red flag   */
  --lavender: var(--accent-purple);   /* modelled / forecast / structural */
  --sky:      var(--accent-green);    /* informational / connected     */

  /* Status aliases — used by chips and renderer code */
  --success:  var(--teal);
  --warning:  var(--amber);
  --danger:   var(--accent-rose);

  /* Ink / paper — text and surface aliases */
  --ink:           var(--text-primary);
  --ink-muted:     var(--text-secondary);
  --ink-subtle:    var(--text-tertiary);
  --paper:         var(--surface-1);
  --paper-elevated: var(--surface-2);
}

[data-theme="light"] {
  /* Light-mode pairs — mostly inherit but document the intent */
  --mint:     var(--teal);
  --amber-semantic: var(--amber);
  --coral:    var(--accent-rose);
  --lavender: var(--accent-purple);
  --sky:      var(--accent-green);
  --success:  var(--teal);
  --warning:  var(--amber);
  --danger:   var(--accent-rose);
  --ink:           var(--text-primary);
  --ink-muted:     var(--text-secondary);
  --ink-subtle:    var(--text-tertiary);
  --paper:         var(--surface-1);
  --paper-elevated: var(--surface-2);
}
```

**Why not introduce new color values yet:** the design system already works in dark mode with the existing palette. Phase 11 (Layout / mobile / light theme) is where the LIGHT theme gets a real designed palette overhaul (paper-cream, deeper accent, retuned chart series). This session only puts the SEMANTIC NAMES in place so future renderer code stops hitting empty `var(--danger)` reads.

**Verification spec — `lib/__tests__/tokens.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf-8');

const required = [
  '--mint', '--amber-semantic', '--coral', '--lavender', '--sky',
  '--success', '--warning', '--danger',
  '--ink', '--ink-muted', '--ink-subtle', '--paper', '--paper-elevated',
];

describe('semantic token layer (Phase 8.1)', () => {
  for (const token of required) {
    it(`defines ${token}`, () => {
      expect(css).toMatch(new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*:`));
    });
  }
});
```

**Acceptance:**
- `:root` block contains all 13 new tokens.
- `[data-theme="light"]` block contains the same 13.
- `npm test` passes the new spec.
- `npx tsc --noEmit` clean.
- `npx next build` clean.

Commit: `phase-8(8.1): semantic token layer — aliases over existing palette`.

**Do NOT:**
- Replace existing `--teal` / `--amber` usages across cards in this session. That's a per-card cleanup pass for Phase 10.
- Introduce new color values (different hex). Phase 11 owns the light-mode palette redesign.
- Audit hardcoded hex colors site-wide. That's also Phase 11.

---

## 2. Pause B — checkpoint

After 8.1 commits clean:
- Re-run `npm test` to confirm 8.1 spec is green.
- `npx tsc --noEmit` clean.
- Eyeball `app/globals.css` to confirm no syntax errors.
- Pause for "go" before 8.2.

This pause exists because 8.2 is a bigger lift (font swap) and we want a clean checkpoint before another change lands.

---

## 3. 8.2 — Three-voice typography system (~45 min)

**Current state:** `app/layout.tsx` loads three Google fonts via `next/font/google`:
- `Cormorant` (serif body)
- `DM_Mono` (mono numbers)
- `Unbounded` (display)

**Per P4 brand position, the canonical three voices are:**
- **Display / editorial** — characterful contemporary serif. Recommended: **Fraunces** (open-source, has optical-size axis, Google Fonts hosted). Used for section headings, hero number unit, pull quotes, plate copy.
- **Mechanical / numeric** — geometric mono. **JetBrains Mono** (open-source, Google Fonts hosted). Used for all numbers, tickers, source attributions, timestamps, eyebrow text.
- **Body / voice** — neutral humanist sans. **Inter** (open-source, Google Fonts hosted, hyper-stable). Used for body text, descriptions, drawer prose.

**Task:**

In `app/layout.tsx`, replace the font imports:

```ts
import { Fraunces, JetBrains_Mono, Inter } from "next/font/google";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  axes: ["opsz"],   // optical-size axis for display sizes
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});
```

Update `<html>` className to include `${fraunces.variable} ${jetbrainsMono.variable} ${inter.variable}`. Keep existing `Cormorant`, `DM_Mono`, `Unbounded` references for backward compatibility — DON'T break existing cards. Add the new font variables alongside the old.

In `app/globals.css`, add the type-ramp tokens near the top (after the typography-related rules already there):

```css
/* ─── Typography ramp (Phase 8.2) ──────────────────────────────────── */
:root {
  /* Active voice variables — point at the new three-voice system */
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-numeric: var(--font-jetbrains-mono), ui-monospace, "SF Mono", monospace;
  --font-body:    var(--font-inter), system-ui, sans-serif;

  /* Type ramp (P2 locked: 56px middle-ground for hero numbers) */
  --type-hero:        clamp(40px, 6vw, 64px) / 0.95 var(--font-display);
  --type-number-xl:   clamp(40px, 5vw, 56px) / 1.0  var(--font-numeric);
  --type-number-l:    clamp(28px, 3.5vw, 40px) / 1.0 var(--font-numeric);
  --type-section:     clamp(24px, 2.5vw, 32px) / 1.15 var(--font-display);
  --type-eyebrow:     11px / 1.4 var(--font-numeric);   /* uppercase, letter-spacing 0.08em */
  --type-body:        16px / 1.55 var(--font-body);
  --type-caption:     12px / 1.4 var(--font-numeric);

  /* Tabular numerals globally on numeric font */
}

* {
  font-feature-settings: "tnum" 1;   /* tabular-nums everywhere */
}

[data-font="numeric"], code, kbd, samp, pre {
  font-variant-numeric: tabular-nums;
}
```

**Why keep Cormorant/DM_Mono/Unbounded loaded for now:** existing cards reference `var(--font-cormorant)`, `var(--font-dm-mono)`, `var(--font-unbounded)` directly. Phase 10 (card system overhaul) is where every card migrates to the new `--font-display / --font-numeric / --font-body` triplet. Until then, keep both sets loaded so nothing breaks.

**Verification spec — `lib/__tests__/typography.test.ts`:**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf-8');
const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf-8');

describe('three-voice typography (Phase 8.2)', () => {
  it('layout imports Fraunces, JetBrains_Mono, Inter from next/font/google', () => {
    expect(layout).toMatch(/import.*\{.*Fraunces.*\}.*from.*next\/font\/google/);
    expect(layout).toMatch(/import.*\{.*JetBrains_Mono.*\}.*from.*next\/font\/google/);
    expect(layout).toMatch(/import.*\{.*Inter.*\}.*from.*next\/font\/google/);
  });

  it('globals.css defines --font-display, --font-numeric, --font-body', () => {
    expect(css).toMatch(/--font-display:/);
    expect(css).toMatch(/--font-numeric:/);
    expect(css).toMatch(/--font-body:/);
  });

  it('globals.css defines the type ramp', () => {
    for (const t of ['--type-hero', '--type-number-xl', '--type-number-l', '--type-section', '--type-eyebrow', '--type-body', '--type-caption']) {
      expect(css).toMatch(new RegExp(t.replace(/[-]/g, '\\-')));
    }
  });

  it('tabular-nums applied globally', () => {
    expect(css).toMatch(/font-feature-settings.*tnum/);
  });
});
```

**Acceptance:**
- New fonts load without breaking existing cards.
- Type ramp tokens defined.
- Tabular numerals applied globally.
- Both old and new font CSS variables coexist.
- `npm test` passes both new specs (8.1 + 8.2).
- `npx tsc --noEmit` clean.
- `npx next build` clean.
- `npm run dev` and visit `localhost:3000`. Eyeball: page should look identical to before (existing cards still using old fonts; new fonts loaded but unused yet).

Commit: `phase-8(8.2): three-voice typography ramp — Fraunces / JetBrains Mono / Inter`.

---

## 4. Pause C — final report + handoff

After both commits land:
- `git log --oneline -3` — show 8.1 + 8.2 commits.
- `npm test` final tally.
- `npx tsc --noEmit` clean.
- `npx next build` time + size.
- `npm run dev` snapshot description: confirm visual identity preserved.
- Push branch: `git push -u origin phase-8-foundation`.
- Report to Kastytis.

**Stop here.** Phase 8 Session 2 picks up 8.3 (extend existing primitives) onward. Author Session 2 prompt at `docs/phases/phase-8-session-2-prompt.md` only if context budget allows; otherwise leave for next CC handoff.

---

## 5. Hard stops

- No `gh` CLI.
- No `--force`, no `reset --hard`, no `rebase -i`, no `--amend` after push.
- **No primitive changes in this session.** `MetricTile`, `StatusChip`, `FreshnessBadge`, `DataClassBadge`, etc. — read for reference, do NOT modify. Session 2 of Phase 8 owns primitive extension.
- **No card migrations.** Don't replace `var(--font-cormorant)` with `var(--font-display)` in any card. Phase 10 owns that.
- **No new color values.** This session puts NAMES in place; Phase 11 owns the light-mode palette redesign.
- **No icon sprite, no logo system, no /brand /style /visuals /colophon pages, no microbrand details.** Those are Phase 8 Sessions 3–4.
- The pre-existing items in working tree (`logs/btd.log`, `.claude/skills/`, etc.) are out of scope. `npx next build` is the release gate.
- If budget gets tight (>80%), commit at a clean boundary and write a continuation prompt at `phase-8-session-1b-prompt.md`.
- **Numerical reconciliation rule N-10:** every formula change ships with a spec. This session has no formula changes (it's design tokens), but the two new specs (`tokens.test.ts`, `typography.test.ts`) are guard-rails so future drift gets caught.
