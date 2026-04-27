# KKME Regulatory Feed — Handover for Website Claude Code

You are Claude Code working on Kastytis's website. Your job is to render Lithuanian BESS regulatory updates produced by KKME's weekly monitor. This document is the contract between the monitor (the producer) and the website (the consumer).

---

## 1. What this folder is

A small, publishable subset of KKME's internal regulatory monitor. It contains only what the website is allowed to read. Everything else under `_KKME/` (commitments, supplier data, contracts, commission models) is internal and **must not** be referenced by the website under any circumstances.

Files in this folder:

- `regulatory_feed.json` — the curated feed. **This is the only file you need to consume.**
- `HANDOVER.md` — this document. Read once, then build against the JSON contract.
- `CHANGELOG.md` — schema and feed-shape changes over time. Read before making rendering changes if `schema_version` has changed.

---

## 2. How updates land here

Kastytis runs a scheduled task (`lt-bess-regulatory-monitor`) every Monday at 09:00 Europe/Vilnius. The task scans Lithuanian and EU regulatory sources, classifies changes, and overwrites `regulatory_feed.json` in place. After each run, Kastytis pushes the updated file to the git repo this folder lives in.

Cadence: once per week. `feed_metadata.last_updated` and `feed_metadata.next_run` are authoritative — render those, do not assume.

---

## 3. Schema (v1.0)

Top-level keys:

- `schema_version` — string, semver. Treat as a hard contract; refuse to render if you see a major-version bump you haven't been updated for.
- `feed_metadata` — dict with `title`, `description`, `publisher`, `publisher_url`, `language`, `language_secondary`, `last_updated` (ISO 8601 with offset), `next_run`, `cadence`, `items_count`.
- `categories` — array of strings. The closed set of category values used in items.
- `impact_levels` — dict mapping `high` / `medium` / `low` to a human-readable explanation. Surface this as a tooltip or a legend.
- `items` — array of update items, sorted newest-first by `scan_date`.

Each item has:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable, dash-separated. Use as React `key` and as anchor URL fragment. |
| `scan_date` | YYYY-MM-DD | The Monday the item was surfaced by the monitor. Use this for grouping by week. |
| `event_date` | YYYY-MM-DD | When the regulatory event happened (or, if `event_date_qualifier` is `"deadline"`, when the deadline falls). |
| `event_date_qualifier` | string, optional | `"deadline"` for forward-looking deadlines. Absent for past events. |
| `title` | string | English headline. Render this. |
| `title_lt` | string, optional | Lithuanian headline. Show as a secondary line if the user's locale is `lt`. |
| `summary` | string | 1–4 sentences. Safe for public rendering. |
| `source` | string | Publisher name (e.g., "VERT", "Seimas / e-tar.lt"). |
| `source_type` | enum | One of: `lt_primary_legislation`, `lt_regulation`, `eu_regulation`, `news`, `enforcement`. |
| `source_url` | string | Authoritative external URL. Render as a "Read source" link. Open in new tab. |
| `act_reference` | string, optional | Formal act number / decision number. |
| `impact` | enum | `high` / `medium` / `low`. Use the `impact_levels` dict for the tooltip text. |
| `category` | enum | One of the values listed in top-level `categories`. |
| `tags` | array of strings | Free-form, lowercase, snake_case. Use for filtering. |

---

## 4. Rendering rules (recommended defaults)

These are starting points — adjust to match the rest of the site's design.

1. **Sort:** newest `scan_date` first. Within a scan date, sort by `impact` (high → medium → low) then by `event_date` descending.
2. **Group:** by `scan_date`. Each group header reads "Week of YYYY-MM-DD".
3. **Impact badge:** small coloured pill — red for high, amber for medium, grey for low. The `impact_levels` text becomes the tooltip.
4. **Card body:** title (h3), then a one-line metadata row (`event_date` · `source` · `category`), then `summary`, then a "Read source" link to `source_url`.
5. **Lithuanian title:** if present and user locale is `lt`, render `title_lt` as a subtitle under the English `title`. Otherwise hide it.
6. **Filtering UI:** expose `impact`, `category`, and `tags` as filter chips. Plus a date-range picker on `scan_date`.
7. **Empty state:** if `items.length === 0`, render `feed_metadata.description` and the next-run date.

---

## 5. What you MUST NOT do

- **Do not** read or reference any file outside this `public_feed/` folder. Other `_KKME/` files are confidential.
- **Do not** invent items, summaries, or impact ratings. If the feed is empty for a week, the empty state is the correct render.
- **Do not** scrape the source URLs to enrich items at render time. Trust the feed.
- **Do not** translate `summary` or `title` automatically. If you want LT/EN bilingual output, only use `title_lt` (which is human-curated). Auto-translation of LT statute language is high-risk.
- **Do not** present items as legal advice. The feed is informational. Add a footer line: "Informational only. Not legal advice. Speak to qualified counsel for any specific matter."
- **Do not** expose item `id`s containing `internal-` prefixes (none currently, but reserved).

---

## 6. Caching and freshness

- Fetch `regulatory_feed.json` at build time if the website is statically generated. Re-build at least weekly (Mondays after 11:00 Europe/Vilnius gives Kastytis a buffer to push).
- If the website is server-rendered, cache the JSON for at least 1 hour and at most 24 hours.
- Show `feed_metadata.last_updated` somewhere visible so readers can see how fresh the data is.

---

## 7. Failure modes

- **Feed missing or 404:** render the static description + a "Last successful update: <previously cached `last_updated`>" line. Do not hide the section silently.
- **Schema mismatch (major version bump):** stop rendering items, render a "Feed temporarily unavailable" message, and surface an error to Kastytis (build log or alert).
- **Item with unknown `category` or `source_type`:** still render it, but show the raw value as the category label and tag the item with `unknown-category` for monitoring.

---

## 8. Suggested file layout in your repo

```
website/
├── data/
│   └── regulatory_feed.json     ← copy of the file from this folder, refreshed weekly
├── lib/
│   └── regulatory.ts            ← small loader + zod schema validating against v1.0
├── components/
│   ├── RegulatoryFeed.tsx       ← list view
│   └── RegulatoryItem.tsx       ← single item card
└── app/
    └── regulatory/page.tsx      ← /regulatory route
```

The `data/regulatory_feed.json` copy can be auto-synced by a small CI step (e.g., GitHub Action) that pulls the latest from the KKME repo on a Monday cron.

---

## 9. Versioning

This document and the JSON schema are versioned together. Schema changes are recorded in `CHANGELOG.md`. Treat `schema_version` as the only authority — if it disagrees with this doc, follow the JSON and message Kastytis to update the doc.

Current schema version: **1.0**

---

## 10. Contact

Producer: Kastytis Kemežys, KKME Energy Advisory — kastytis@kkme.eu
Consumer: kkme.eu website (this Claude Code instance)

If the feed is producing surprises (impact ratings that don't match the site's tone, wording too technical, missing categories), file feedback against this folder and Kastytis will adjust the monitor's output rules — not the website.
