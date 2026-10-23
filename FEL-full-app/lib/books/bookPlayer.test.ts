import { describe, expect, it } from 'vitest';
import { nextSpeed, requestStreamUrl, skipPosition, SKIP_SECONDS, SPEEDS, STREAM_REFRESH_MARGIN_SEC, streamUrlStale } from './bookPlayer';

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('player rules', () => {
  it('skips 15 seconds and stays inside the chapter', () => {
    expect(SKIP_SECONDS).toBe(15);
    expect(skipPosition(100, 15, 600)).toBe(115);
    expect(skipPosition(100, -15, 600)).toBe(85);
    expect(skipPosition(5, -15, 600)).toBe(0);
    expect(skipPosition(595, 15, 600)).toBe(600);
    expect(skipPosition(Number.NaN, 15, Number.NaN)).toBe(15);
  });

  it('speed cycles through the list and returns to 1', () => {
    let speed = 1;
    const seen: number[] = [];
    for (let i = 0; i < SPEEDS.length; i += 1) { speed = nextSpeed(speed); seen.push(speed); }
    expect(seen).toEqual([1.25, 1.5, 2, 1]);
    expect(nextSpeed(0.75)).toBe(1);
  });

  it('a URL is stale before it dies (with a margin), and one we never minted is stale', () => {
    const t0 = 1_000_000;
    expect(streamUrlStale(null, 300, t0)).toBe(true);
    expect(streamUrlStale(t0, 300, t0 + 1000)).toBe(false);
    expect(streamUrlStale(t0, 300, t0 + (300 - STREAM_REFRESH_MARGIN_SEC) * 1000 - 1)).toBe(false);
    expect(streamUrlStale(t0, 300, t0 + (300 - STREAM_REFRESH_MARGIN_SEC) * 1000)).toBe(true);
    expect(streamUrlStale(t0, 300, t0 + 400_000)).toBe(true);
  });
});

describe('requestStreamUrl: the only place the player gets a URL', () => {
  it('posts the chapter to /api/books/stream, uncached, and returns the URL', async () => {
    const f = fakeFetch(200, { url: 'https://storage.googleapis.com/x.mp3?sig', expiresIn: 300 });
    const r = await requestStreamUrl(f.impl, 'blueprint', 'audio-03');
    expect(r).toEqual({ ok: true, url: 'https://storage.googleapis.com/x.mp3?sig', expiresIn: 300 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('/api/books/stream');
    expect(f.calls[0].init.method).toBe('POST');
    expect(f.calls[0].init.cache).toBe('no-store');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ bookSlug: 'blueprint', fileId: 'audio-03' });
  });

  it.each([
    [401, { error: 'unauthorized' }, /sign in/i],
    [403, { error: 'adults_only' }, /18\+/],
    [409, { error: 'store_closed', message: 'Checkout is not available right now.' }, /unavailable/i],
    [503, { error: 'Library is unavailable right now.' }, /unavailable/i],
    [403, { error: 'You do not own this file.' }, /do not own/i],
  ])('status %s is explained, never a URL', async (status, body, text) => {
    const r = await requestStreamUrl(fakeFetch(status, body).impl, 'blueprint', 'audio-03');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(text);
  });

  it('a network failure is a message, not a throw', async () => {
    const r = await requestStreamUrl((async () => { throw new Error('offline'); }) as unknown as typeof fetch, 'b', 'f');
    expect(r.ok).toBe(false);
  });

  it('a 200 without a url is not success', async () => {
    const r = await requestStreamUrl(fakeFetch(200, {}).impl, 'b', 'f');
    expect(r.ok).toBe(false);
  });
});
