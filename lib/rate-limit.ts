/**
 * lib/rate-limit.ts
 *
 * Minimal fixed-window in-memory rate limiter for route handlers.
 *
 * IMPORTANT (production note): this limiter is per-server-instance. On the
 * Abacus platform the app runs as a standalone Next.js server, so a single
 * instance makes this effective in practice — but if the deployment ever
 * scales horizontally, replace the Map store with a shared store
 * (Upstash Redis / the platform KV) behind the same `rateLimit()` signature.
 * The call sites (signup, coach) will not need to change.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Opportunistic cleanup so the map does not grow unbounded.
const MAX_STORE_SIZE = 10_000;

function sweep(now: number): void {
  if (store.size < MAX_STORE_SIZE) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets — suitable for a Retry-After header. */
  retryAfterSec: number;
}

/**
 * Fixed-window limiter.
 *
 * @param key      unique bucket, e.g. `signup:${ip}` or `coach:${profileId}`
 * @param limit    max requests per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  return {
    ok: entry.count <= limit,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

/** Best-effort client identifier for anonymous endpoints (signup). */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
