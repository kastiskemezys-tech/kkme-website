# Phase 3A — Intel Feed Data Quality Cleanup

Self-contained prompt for Claude Code. Paste as the first message of a fresh Claude Code session started in `~/kkme`. Expected duration: 45–60 minutes. Three pause points.

This is blocker work for Bucket 3. The feed currently renders "Invalid Date", raw HTML entities (`&#039;`, `&amp;`), and bare URLs as titles. These ship to production and are the single biggest credibility hit on kkme.eu. Nothing else in Bucket 3 should start until this is clean.

Investor-first priority (per bucket3-rebuild-plan.md section 8 Q1): polish and credibility over operator depth. This phase is pure trust recovery.

---

## Step 0: Context loading

1. `bash scripts/diagnose.sh` — worker + site healthy
2. Read `docs/handover.md` — current state, backlog
3. Read `docs/phases/bucket3-rebuild-plan.md` section 4 Phase A — the scope of this session
4. `git status && git log --oneline -5` — clean tree
5. `git checkout main && git pull origin main && git checkout -b phase-3a-intel-data-quality`

State scope understanding. Wait for "proceed" before any Edit.

## Superpowers interaction rules

- Pause-point playbook is the outer workflow.
- Use **verification-before-completion** before each pause.
- Use **brainstorming** only if you hit a judgement call on item-rejection policy (e.g., "should we silently drop items with no date or show them with 'date unknown'?").
- Skip **subagent-driven-development** — this is a single-surface fix.
- Skip **TDD** — presentational fix with visible verification.
- End-of-session note: "Superpowers: [helped/neutral/hindered] — [one line]". Still building the 2-session evaluation per ADR-006.

---

## Scope — four data quality defects

### Defect 1: "Invalid Date"

**Where:** `app/components/IntelFeed.tsx` line 220–226, `formatDate()`. Feeds items through `new Date(iso).toLocaleString(...)`. When `iso` is empty or malformed, this returns "Invalid Date" and ships it to the DOM.

**Root cause:** Line 586 maps the worker's `published_at` field to the React state with `String(item.published_at || '')` — empty string falls through to `formatDate`.

**Fix:**
- Add a strict `parseDate(iso: string): Date | null` helper that returns null for empty/invalid input.
- Update `formatDate` to accept `string | null | undefined` and return null if unparseable.
- At the call site (line 376), render nothing (or a subtle `—`) when date is null rather than "Invalid Date".
- At the mapping call site (line ~576), drop items entirely where `published_at` is missing or unparseable. An item without a real date is untrustworthy and should not surface. Log the drop count for diagnostic visibility.

### Defect 2: HTML entity leaks (`&#039;`, `&amp;`, `&quot;`, `&lt;`, `&gt;`, `&nbsp;`)

**Where:** Title and summary fields coming from the worker enrichment pipeline. The worker likely pulls these from RSS/OpenGraph/HTML and passes the raw entity-encoded strings through.

**Fix (frontend normalization — defensive, fast):**
- Add a `decodeHtmlEntities(s: string): string` helper in IntelFeed.tsx (or a shared util if one exists — grep `lib/` first).
- Handle at minimum: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`, `&apos;`, `&nbsp;`. Use a DOM-based decode (`const t = document.createElement('textarea'); t.innerHTML = s; return t.value;`) wrapped in an SSR guard — this is a client component (`'use client'` at top of file) so it's fine, but add a regex fallback for safety.
- Apply to `title`, `summary`, `consequence`, `whyItMatters` at the mapping site (line ~580–598) so downstream code stays clean.

**Do NOT fix at the worker yet.** Frontend defense is the right first move — we don't know the full fan-out of where the worker writes these strings, and a worker-side fix risks breaking other consumers. Add a backlog item for worker-side normalization instead.

### Defect 3: Bare URL titles

**Where:** Some items have titles like `"https://www.mckinsey.com/industries/..."` — the enrichment pipeline failed to scrape a real title and fell back to the URL.

**Fix:**
- At the mapping site, detect `title.startsWith('http://') || title.startsWith('https://')`.
- Option A (preferred): drop these items entirely. A feed item without a curated title is below the feed's quality bar.
- Option B (fallback if we find too many dropped): show the domain name as title with "(title unavailable)" suffix — last-resort only.

Start with Option A. Report the drop count at Pause 2. If >20% of live items get dropped, pause and discuss Option B before proceeding.

### Defect 4: Missing/malformed source name

**Where:** `sourceName: String(item.source || '')` — empty string renders a blank source attribution.

**Fix:** At the mapping site, drop items where `source` is missing/empty. No-source items are untrustworthy.

---

## Implementation pattern

All four defects are fixed at or near the same call site (IntelFeed.tsx lines ~570–602, the `fetch('/feed')` mapping). Centralize the rejection/normalization logic:

```ts
// Pseudocode, adjust to actual types
function normalizeFeedItem(raw: Record<string, unknown>): IntelItem | null {
  // Reject: no title, no source, no date, bare-URL title
  const rawTitle = String(raw.title || '');
  const rawSource = String(raw.source || '');
  const rawDate = String(raw.published_at || '');

  if (!rawTitle || !rawSource || !rawDate) return null;
  if (/^https?:\/\//i.test(rawTitle)) return null;
  const parsedDate = parseDate(rawDate);
  if (!parsedDate) return null;

  return {
    id: ...,
    title: decodeHtmlEntities(rawTitle),
    summary: decodeHtmlEntities(String(raw.consequence || '')),
    sourceName: rawSource,
    publishedAt: parsedDate.toISOString(),
    // ...rest
  };
}
```

Then the mapping becomes `raw.map(normalizeFeedItem).filter((x): x is IntelItem => x !== null)`.

Log drop counts at mount time via a single `console.info` (kept — this is a diagnostic signal we want visible in dev):
```
console.info(`[IntelFeed] kept ${kept}/${total} items (dropped ${dropped})`)
```

---

## What NOT to do

- **No visual redesign.** Phases 3B/3C do that. This is data hygiene only.
- **No worker changes.** Log a backlog item for worker-side entity decoding. Do not touch `workers/fetch-s1.js`.
- **No seed-item changes.** The hardcoded `SEED_ITEMS` in IntelFeed.tsx are fine — they have valid dates and no entity leaks. Leave alone.
- **No new dependencies.** `he` or `html-entities` packages would be cleaner but this is a ~30-line util; stay dependency-free.
- **No silent fallbacks that hide bad data.** Drops over fallbacks. The feed should shrink before it should lie.

---

## Verification

### Build + typecheck
- `npx tsc --noEmit` clean
- `npm run build` succeeds

### Data verification (curl + cross-reference)
1. `curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed | python3 -m json.tool | head -200` — raw worker output. Count items, scan for entity leaks, empty sources, bare URLs.
2. Start dev: `npm run dev`. Open browser console. Confirm the `[IntelFeed] kept X/Y items` log fires.
3. Visual pass: scroll the intel feed section. Look for:
   - Zero "Invalid Date"
   - Zero `&#039;`, `&amp;`, etc. in rendered text (right-click inspect a title to confirm it's decoded in DOM, not just visually)
   - Zero items whose title is a URL
   - Every visible item has a source name
4. Ratio check: if the drop count exceeds 30% of total worker items, pause before commit and discuss — something may be broken upstream.

### MCP screenshots (if chrome-devtools MCP is available)
- Dark 1440 — full intel feed section
- Light 1440 — same
- One zoomed shot of a single item — confirm proper apostrophes/quotes in DOM

---

## Pause points

### Pause 1: After discovery (10–15 min)

Before writing any code, report:
- Actual count of defective items in current `/feed` response (Invalid Date count, entity-leak count, bare-URL count, missing-source count)
- Whether `decodeHtmlEntities` already exists anywhere in the repo (grep result)
- Proposed file changes (should be 1 file: IntelFeed.tsx)
- Any surprises

Wait for "proceed".

### Pause 2: After build, before commit (30–40 min)

Report:
- Changed files + one-line summary each
- `tsc --noEmit` and `npm run build` output (both clean)
- Drop count stats: `before: X items, after: Y items, dropped: Z (reasons: A missing date, B bare URL, C no source, D entity-only... wait that last one doesn't drop)`
- MCP screenshots
- Any items that looked borderline — decide to keep or drop at this pause

Wait for "proceed" before commit.

### Pause 3: After verification, before push (45–55 min)

- Proposed commit message
- Proposed handover.md session log entry
- New backlog items discovered:
  - Expected: B-0XX "Worker-side HTML entity decoding in enrichment pipeline" (P2, tech-debt)
  - Expected: B-0XX "Worker feed item schema validation — reject incomplete items at ingest not at render" (P2, tech-debt)
  - Anything else surfaced during implementation

Wait for "proceed" before push.

---

## Commit discipline

- Single commit: `phase3a: intel feed data quality — drop invalid items, decode html entities`
- Branch: `phase-3a-intel-data-quality` off main
- Push, open PR via GitHub web UI (don't use `gh` — Kastytis merges manually)

## Post-merge

Update `docs/handover.md`:
- "What's shipped" gains a Phase 3A one-liner
- "What's queued" rotates: next is Phase 3C (intel feed hierarchy + source signaling). Prompt will be authored by Cowork after 3A merges.
- New backlog items logged
- Session log entry with scope, shipped, deferred, findings, Superpowers note

Commit handover update as docs-only on main (or quick docs branch). Push.

---

## Hard rules

- No pause-point skips without explicit override
- No worker changes
- No visual redesign
- No new dependencies
- Drops over fallbacks
- Don't commit without the drop-count diagnostic in console
- Don't push from Cowork

---

## Reference

- Bucket 3 plan: `docs/phases/bucket3-rebuild-plan.md` (section 4 Phase A is this work)
- Handover: `docs/handover.md`
- Intel feed component: `app/components/IntelFeed.tsx` (785 lines, single file — all fixes land here)
- Worker feed endpoint: https://kkme-fetch-s1.kastis-kemezys.workers.dev/feed
- Verification playbook: `docs/playbooks/verification.md`
- Pause-points playbook: `docs/playbooks/pause-points.md`
- Tooling / Superpowers playbook: `docs/playbooks/tooling.md`
