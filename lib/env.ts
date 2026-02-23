/**
 * lib/env.ts — single source of truth for environment variables.
 * All API routes import from here instead of process.env directly.
 * Required vars throw with a clear message at call time.
 */

export function getEntsoeApiKey(): string {
  const v = process.env.ENTSOE_API_KEY;
  if (!v) throw new Error('[env] ENTSOE_API_KEY is not set — add it to .env.local');
  return v;
}

/** Optional until Step 5 (LLM digest). Returns undefined if not set. */
export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}
