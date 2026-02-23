import { NextResponse } from 'next/server';
import { fetchS1 } from '@/lib/signals/s1';

// Cache response for 1 hour; Next.js revalidates in background
export const revalidate = 3600;

export async function GET() {
  // TODO (Step 2 — Cloudflare Pages connected):
  // Replace direct fetch with KV read for production:
  //
  //   import { getRequestContext } from '@cloudflare/next-on-pages';
  //   export const runtime = 'edge';
  //
  //   const { env } = getRequestContext();
  //   const raw = await env.KKME_SIGNALS.get('s1');
  //   if (raw) return NextResponse.json(JSON.parse(raw));
  //
  // Worker writes to KV daily; this route serves the cached value.
  // Fall through to direct fetch if KV is empty on first deploy.

  try {
    const data = await fetchS1();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'S1 fetch failed', detail: String(err) },
      { status: 500 },
    );
  }
}
