import { NextResponse } from 'next/server';
import { fetchS1 } from '@/lib/signals/s1';
import { getEntsoeApiKey } from '@/lib/env';

// Worker read endpoint — returns current KV value without touching ENTSO-E.
// @cloudflare/next-on-pages doesn't yet support Next.js 16, so KV is read
// via the Worker's /read HTTP path instead of getRequestContext().
const WORKER_READ_URL = 'https://kkme-fetch-s1.kastis-kemezys.workers.dev/read';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET() {
  // 1. Try KV via Worker read endpoint (production — fast, no ENTSO-E call)
  try {
    const kvRes = await fetch(WORKER_READ_URL, { next: { revalidate: 3600 } });
    if (kvRes.ok) {
      const data = await kvRes.json();
      return NextResponse.json(data, { headers: CACHE_HEADERS });
    }
  } catch {
    // Worker unreachable — fall through to direct fetch
  }

  // 2. Validate API key before attempting direct ENTSO-E fetch
  try {
    getEntsoeApiKey();
  } catch {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 503 },
    );
  }

  // 3. Direct ENTSO-E fetch with 10s timeout (local dev + production fallback)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const data = await fetchS1({ signal: controller.signal });
    clearTimeout(timeoutId);
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (err) {
    clearTimeout(timeoutId);

    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      console.error('[S1] ENTSO-E fetch timed out after 10s');
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 });
    }

    console.error('[S1] fetch failed:', err);
    return NextResponse.json(
      { error: 'upstream error', detail: String(err) },
      { status: 502 },
    );
  }
}
