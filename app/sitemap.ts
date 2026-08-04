import type { MetadataRoute } from 'next';

/**
 * Phase 45 — the sitemap `robots.txt` has been promising since it was written.
 *
 * `public/robots.txt` ends with `Sitemap: https://kkme.eu/sitemap.xml`, and
 * that URL returned **HTTP 404**. A declared-but-absent sitemap is worse than
 * no declaration: a crawler is told where the map is, fetches nothing, and has
 * to fall back to link discovery — which is exactly the case on a site whose
 * internal linking the Phase 38 audit already found thin.
 *
 * WHAT IS DELIBERATELY ABSENT, and why each:
 *
 *   /fleet          gated console. Already `noindex, nofollow, nocache`.
 *   /calculator     excluded here per the phase brief. NOT set to noindex —
 *                   see the phase wrap: the brief's premise is that it is
 *                   gated, and it is not. Its served HTML is a form shell with
 *                   no computed output and no 4-digit number in it (verified).
 *                   Making a public product page unindexable is a business
 *                   decision with a real traffic cost, so it is proposed rather
 *                   than applied. Keeping it out of the sitemap is the half
 *                   that is safe and reversible.
 *   /dev/*          internal tooling, now `noindex` via app/dev/layout.tsx.
 *
 * `lastModified` is deliberately omitted rather than stamped with the build
 * time. A build-time date claims every page changed whenever anything did,
 * which is a provenance claim that was never computed — rule #2, on a surface
 * that happens to be read by machines instead of people.
 */
/**
 * Required by `output: 'export'`. Without it the build fails outright:
 *
 *   Error: export const dynamic = "force-static" not configured on route
 *   "/sitemap.xml" with "output: export"
 *
 * Recorded because the failure is the useful part — the build refused rather
 * than silently emitting nothing, which is how a sitemap ends up declared in
 * robots.txt and absent from the site. Which is the state this file is fixing.
 */
export const dynamic = 'force-static';

const BASE = 'https://kkme.eu';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'hourly', priority: 1.0 },
    { url: `${BASE}/methodology`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/intel`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/regulatory`, changeFrequency: 'weekly', priority: 0.6 },
  ];
}
