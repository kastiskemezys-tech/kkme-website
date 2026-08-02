// The one place a mature-market `manifest.json` is written. 36.E0.2.
//
// WHY THIS MODULE EXISTS. Every fetcher used to build its manifest object from scratch and write
// it with a bare `fs.writeFile`, and the orchestrator then read that file back and re-wrote it
// through `preserveAcquisitionMetadata()`. That works only when the orchestrator runs. Run any
// fetcher directly — which is how each of them is developed and re-probed — and the from-scratch
// object lands on disk unmediated, taking whatever the previous manifest knew with it.
//
// What it takes is the point. `coverage_verification` is E0's record of HOW a source lies (the
// Swedish "absence served as zero" verdict, the Austrian resting-zero judgement); it is acquisition
// -time evidence that a windowed re-fetch cannot re-derive and therefore must not overwrite. And
// `last_successful_refresh` is the field the staleness surface AGES — so a write that drops it does
// not raise an alarm, it EXEMPTS the source from the alarm permanently. That is the B12 hazard:
// damage that disables its own detector. It was banked as latent rather than evidenced (B-048
// closed as not-a-defect — nothing was lost), and this module is what keeps it latent.
//
// THE RULE: provenance is append-only. A write may add provenance and may update `retrieved_at`.
// A write may never remove a provenance key. Keys the caller does not carry are carried forward
// from the manifest on disk; if one is still missing after that, the write FAILS rather than
// silently shipping a manifest that knows less than its predecessor.
//
// NOT BUILT, DELIBERATELY: absence of provenance is not treated as an error state in itself. A
// dataset acquired by hand and never refreshed has no `last_successful_refresh` and is being
// honest about that; a check keyed on mere key presence would have false-alarmed on exactly such
// an artifact (B-048). What is gated here is the TRANSITION — present, then absent — which is a
// real loss regardless of what the keys mean.

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Keys that record where the data came from, how it was verified, and when it was last
 * successfully refreshed — as opposed to keys describing the current run's payload.
 *
 * `retrieved_at` is deliberately NOT here: every run legitimately restamps it.
 */
export const PROVENANCE_KEYS = Object.freeze([
  'licence',
  'source',
  'source_urls',
  'coverage_verification',
  'acquisition_retrieved_at',
  'last_successful_refresh',
  'refresh_cadence_months',
]);

const isEmpty = (v) => v === undefined || v === null
  || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

/**
 * OMISSION vs DESTRUCTION — the distinction the whole module turns on.
 *
 * A from-scratch fetcher does not MENTION `last_successful_refresh`; it has no opinion about it,
 * because the orchestrator owns that stamp. That is an omission, and the right response is to
 * carry the previous value forward — repair, silently, every time.
 *
 * A writer that sets the key to null/{}/'' is asserting something different: that this provenance
 * no longer exists. That is a claim, it is a loss, and it fails.
 *
 * Collapsing the two was the first version's bug. Carry-forward ran first and filled every gap,
 * so the assert could never fire — a gate that cannot fail, which is the exact shape of the
 * problem this module exists to prevent. Caught by its own test.
 */
const isOmitted = (o, k) => !(k in o) || o[k] === undefined;
const isDestroyed = (o, k) => (k in o) && o[k] !== undefined && isEmpty(o[k]);

/**
 * Preserve acquisition-time manifest metadata across a windowed refresh.
 *
 * A windowed fetcher rewrites the WHOLE manifest from the window it fetched — not just `files`,
 * but `coverage_verification` too. Refreshing Sweden from 2026-01 replaced a `per_month` block
 * covering 2020-2026 with one covering 2026, and dropped `all_zero_rows_dropped: 5137`,
 * `per_product_leading_absence` and the "absence served as zero" verdict. Destroying that would be
 * worse than not refreshing, because the numbers would still be right and the reason they are
 * trustworthy would be gone.
 *
 * So for a WINDOWED source the previous manifest is the base and the run overlays only what it
 * legitimately learned — file entries, row count, retrieval time — while its own windowed metadata
 * is kept beside it under `last_refresh` rather than on top of it. For a FULL source the new
 * manifest genuinely describes everything and replaces the old one.
 *
 * IDEMPOTENT. The fetcher writes through this module and the orchestrator re-writes through it
 * again after reconciling shards, so this runs twice per orchestrated refresh. `last_refresh` is
 * therefore destructured out of the windowed capture — without that, the second application would
 * nest the first run's block inside its own `windowed_metadata` and keep doing so every month.
 */
export function preserveAcquisitionMetadata(window, before, after) {
  if (window === 'full' || !before || !after) return after;
  const { files, rows, retrieved_at: retrievedAt, requested_span: span, ...rest } = after;
  // `last_refresh` is dropped from the windowed capture rather than destructured into an unused
  // binding: without dropping it, a second application would nest the previous run's block inside
  // its own `windowed_metadata` and keep burying it one level deeper every month.
  const windowed = { ...rest };
  delete windowed.last_refresh;
  return {
    ...before,
    files, rows,
    retrieved_at: retrievedAt ?? before.retrieved_at,
    acquisition_retrieved_at: before.acquisition_retrieved_at ?? before.retrieved_at,
    last_refresh: {
      window: span ?? null,
      retrieved_at: retrievedAt ?? null,
      note: 'Metadata from the most recent WINDOWED refresh. The top-level coverage_verification is acquisition-time evidence about how this source behaves and is deliberately not overwritten by a partial window.',
      windowed_metadata: windowed,
    },
  };
}

/**
 * Carry forward any provenance key the incoming manifest does not set.
 *
 * This is what makes the append-only rule a repair rather than only an alarm. A `full`-window
 * fetcher run directly does not know about `last_successful_refresh` — the orchestrator stamps
 * that — so without this it would drop the field on every direct run and quietly exempt its source
 * from the staleness surface forever.
 *
 * Mutates `next` in place; returns the keys it carried.
 */
export function carryForwardProvenance(before, next) {
  const carried = [];
  if (!before || !next) return carried;
  for (const key of PROVENANCE_KEYS) {
    if (isEmpty(before[key])) continue;
    // Only OMISSIONS are repaired. A key the caller explicitly emptied is left as it is, so the
    // assert below can see it and refuse the write.
    if (!isOmitted(next, key)) continue;
    next[key] = before[key];
    carried.push(key);
  }
  return carried;
}

/**
 * The gate: a write may never remove a provenance key that the manifest on disk already had.
 *
 * Throws rather than returning a verdict. A manifest that has lost provenance must not reach the
 * disk at all — a returned false would depend on every caller remembering to check it, which is
 * the property that let the from-scratch writers exist in the first place.
 */
export function assertProvenanceAppendOnly(before, next, { dataset = 'unknown' } = {}) {
  if (!before || !next) return;
  const removed = PROVENANCE_KEYS.filter((k) => !isEmpty(before[k])
    && (isDestroyed(next, k) || isOmitted(next, k)));
  if (!removed.length) return;
  throw new Error(
    `manifest write for "${dataset}" would REMOVE provenance: ${removed.join(', ')}. `
    + 'Provenance is append-only — a manifest may not come to know less than its predecessor. '
    + 'If a key is genuinely being renamed or retired, do it deliberately and update PROVENANCE_KEYS '
    + 'in tools/consultancy/mature-markets/manifest-writer.mjs in the same commit.',
  );
}

/**
 * Write a dataset manifest. The ONLY sanctioned path to `manifest.json`.
 *
 * @param {object}  opts
 * @param {string}  opts.dir       directory holding manifest.json
 * @param {object}  opts.manifest  the manifest this run built
 * @param {string}  opts.window    'full' | 'current_year' | 'current_year_number' — how much of the
 *                                 series this run actually fetched. Windowed runs do not get to
 *                                 overwrite acquisition-time evidence.
 * @param {string} [opts.dataset]  name used in error messages
 * @param {string} [opts.file]     manifest filename. Defaults to `manifest.json`; the calendar
 *                                 source's manifest IS `structural-breaks.json`, so this is not
 *                                 decoration — hardcoding the default would write the wrong file.
 * @returns {Promise<{written: string, carried: string[]}>}
 */
export async function writeManifest({ dir, manifest, window, dataset, file: fileName = 'manifest.json' }) {
  if (!dir) throw new Error('writeManifest: dir is required');
  if (!manifest || typeof manifest !== 'object') throw new Error('writeManifest: manifest object is required');
  if (!window) throw new Error('writeManifest: window is required — a writer that does not declare its window cannot be told whether it may overwrite acquisition evidence');

  const file = path.join(dir, fileName);
  const name = dataset ?? path.basename(dir);

  let before = null;
  try { before = JSON.parse(await fs.readFile(file, 'utf8')); } catch { before = null; }

  const next = preserveAcquisitionMetadata(window, before, manifest);
  const carried = carryForwardProvenance(before, next);
  assertProvenanceAppendOnly(before, next, { dataset: name });

  await fs.writeFile(file, JSON.stringify(next, null, 1) + '\n');
  return { written: file, carried };
}
