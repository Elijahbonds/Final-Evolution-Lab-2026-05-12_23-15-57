// FIRST-DUNK-BUDGET (2026-10-17): a track comes down ONCE.
//
// AM's /try runs fetched /audio/songs/battle/preview.mp3 three times a run: the walk-out's own element, the soundtrack deck's
// element (handed the URL on a cache miss) and the cache fill fetched beside it. On a miss the one fetch now fills the cache and
// is what plays, and two players asking for the same track at once share it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_A = '/audio/songs/battle/preview.mp3';
let fetches: string[] = [];
let stored: Map<string, Response>;

beforeEach(() => {
  vi.resetModules();
  fetches = []; stored = new Map();
  const cache = {
    match: async (u: string) => stored.get(u)?.clone(),
    put: async (u: string, r: Response) => { stored.set(u, r); },
    delete: async (u: string) => stored.delete(u),
  };
  vi.stubGlobal('caches', { open: async () => cache });
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    fetches.push(u);
    return new Response(new Uint8Array(400_000), { status: 200, headers: { 'content-length': '400000' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('cachedSrc: one download per track', () => {
  it('two players asking at once (the walk-out and the deck) share one fetch, and play the same local copy', async () => {
    const { cachedSrc } = await import('./cache');
    const [a, b] = await Promise.all([cachedSrc(URL_A), cachedSrc(URL_A)]);
    expect(fetches).toEqual([URL_A]);
    expect(a).toBe(b);
    expect(a.startsWith('blob:')).toBe(true);   // the fetched copy plays: the element does not stream the URL a second time
  });
  it('the same track later on the page plays from memory, with no request', async () => {
    const { cachedSrc } = await import('./cache');
    await cachedSrc(URL_A);
    await cachedSrc(URL_A);
    expect(fetches).toHaveLength(1);
  });
  it('a track already in the device cache is not fetched at all (control: the hit path is unchanged)', async () => {
    stored.set(URL_A, new Response(new Uint8Array(10)));
    const { cachedSrc } = await import('./cache');
    expect((await cachedSrc(URL_A)).startsWith('blob:')).toBe(true);
    expect(fetches).toHaveLength(0);
  });
  it('on data saver, or a failed fetch, it streams the URL as before', async () => {
    const { cachedSrc } = await import('./cache');
    expect(await cachedSrc(URL_A, { saveData: true })).toBe(URL_A);
    expect(fetches).toHaveLength(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await cachedSrc('/audio/songs/gone/preview.mp3')).toBe('/audio/songs/gone/preview.mp3');
  });
});
