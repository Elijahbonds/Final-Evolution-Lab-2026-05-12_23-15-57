/**
 * Pure helpers for the audiobook stream player (components/press/audio-player.tsx). No React, no DOM, so the rules
 * (when a stream URL is stale, how far a skip goes, how a stream is requested) are testable without a browser.
 */

export const SKIP_SECONDS = 15;
export const SPEEDS = [1, 1.25, 1.5, 2] as const;
/** Ask for a fresh URL this long before the old one dies, so a play never starts on a URL about to expire. */
export const STREAM_REFRESH_MARGIN_SEC = 20;

export function nextSpeed(speed: number): number {
  const index = SPEEDS.findIndex((s) => s === speed);
  return SPEEDS[(index + 1) % SPEEDS.length];
}

/** Seek target for a skip of `delta` seconds, kept inside [0, duration]. */
export function skipPosition(current: number, delta: number, duration: number): number {
  const base = Number.isFinite(current) && current > 0 ? current : 0;
  const target = base + delta;
  const max = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(target, max));
}

/** Has the minted URL (or nearly) expired? A URL we never minted counts as stale. */
export function streamUrlStale(mintedAtMs: number | null, expiresInSec: number, nowMs: number): boolean {
  if (mintedAtMs == null) return true;
  return nowMs >= mintedAtMs + (expiresInSec - STREAM_REFRESH_MARGIN_SEC) * 1000;
}

export type StreamRequest =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; error: string; status: number };

const STREAM_ENDPOINT = '/api/books/stream';

/**
 * Ask the server for a fresh stream URL for one chapter. This is the ONLY place the player gets a URL: the page
 * source holds none before Play. The answer is never a file, and the endpoint never returns an attachment.
 */
export async function requestStreamUrl(
  fetchImpl: typeof fetch,
  bookSlug: string,
  fileId: string,
): Promise<StreamRequest> {
  let res: Response;
  try {
    res = await fetchImpl(STREAM_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookSlug, fileId }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, error: 'You look offline. Try again in a moment.' };
  }
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (res.ok && typeof body?.url === 'string') {
    const expiresIn = typeof body.expiresIn === 'number' && body.expiresIn > 0 ? body.expiresIn : 60;
    return { ok: true, url: body.url, expiresIn };
  }
  if (res.status === 401) return { ok: false, status: 401, error: 'Sign in to listen.' };
  if (res.status === 403 && body?.error === 'adults_only') {
    return { ok: false, status: 403, error: 'Audiobooks are for verified adults (18+).' };
  }
  if (res.status === 409 && body?.error === 'store_closed') {
    return { ok: false, status: 409, error: 'The library is unavailable right now.' };
  }
  const error = typeof body?.error === 'string' && body.error !== 'store_closed' ? body.error : 'That chapter is not available yet.';
  return { ok: false, status: res.status, error };
}
