import { NextResponse } from 'next/server';
import { fetchS1 } from '@/lib/signals/s1';
import { getEntsoeApiKey } from '@/lib/env';

// TODO (Step 2 — Cloudflare Pages connected):
// Switch to KV read instead of direct ENTSO-E fetch:
//
//   import { getRequestContext } from '@cloudflare/next-on-pages';
//   export const runtime = 'edge';
//
//   const { env } = getRequestContext();
//   const raw = await env.KKME_SIGNALS.get('s1');
//   if (raw) return cached response with Cache-Control header;
//   // fall through to direct fetch on first deploy / empty KV

export async function GET() {
  // 1. Validate API key before attempting any network call
  try {
    getEntsoeApiKey();
  } catch {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 503 },
    );
  }

  // 2. Fetch with explicit 10-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const data = await fetchS1({ signal: controller.signal });
    clearTimeout(timeoutId);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
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
