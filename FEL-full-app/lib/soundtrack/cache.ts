// lib/soundtrack/cache.ts — CREATOR SOUNDTRACK piece M: keep the last few tracks on the device.
//
// The Cache API works from the page (no service worker needed). The last 6 tracks heard, under 25 MB in all, are kept,
// so a menu → game → menu loop does not download the same song three times. Never on data saver (the soundtrack is off
// there anyway). Every step is guarded: a browser without the Cache API, a full disk or a private window just streams.
//
// The LRU bookkeeping (lruPlan) is pure and tested; the Cache API calls around it are thin.

export const CACHE_NAME = 'fel-soundtrack-v1';
export const CACHE_MAX_TRACKS = 6;
export const CACHE_MAX_BYTES = 25 * 1024 * 1024;
const INDEX_KEY = 'fel-soundtrack-cache';

export interface CacheEntry { url: string; bytes: number; at: number }

/** After touching `url` (size `bytes`) at `now`: the index to keep and the URLs to evict. Most recent first. */
export function lruPlan(index: CacheEntry[], touch: CacheEntry, maxTracks = CACHE_MAX_TRACKS, maxBytes = CACHE_MAX_BYTES):
  { keep: CacheEntry[]; evict: string[] } {
  const rest = index.filter((e) => e.url !== touch.url).sort((a, b) => b.at - a.at);
  const keep: CacheEntry[] = touch.bytes <= maxBytes ? [touch] : [];
  const evict: string[] = touch.bytes <= maxBytes ? [] : [touch.url];
  let total = keep.reduce((s, e) => s + e.bytes, 0);
  for (const e of rest) {
    if (keep.length < maxTracks && total + e.bytes <= maxBytes) { keep.push(e); total += e.bytes; } else evict.push(e.url);
  }
  return { keep, evict };
}

function readIndex(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && typeof e.url === 'string' && typeof e.bytes === 'number') : [];
  } catch { return []; }
}
function writeIndex(v: CacheEntry[]): void { try { localStorage.setItem(INDEX_KEY, JSON.stringify(v)); } catch { /* the session still streams */ } }

const hasCache = (): boolean => typeof caches !== 'undefined' && typeof caches.open === 'function';
const objectUrls = new Map<string, string>();

/**
 * The address to play `url` from: a local object URL when the track is cached (no network, and no cross-origin audio for
 * WebAudio to silence), else the URL itself, with the track fetched into the cache in the background for next time.
 */
export async function cachedSrc(url: string, opts: { saveData?: boolean } = {}): Promise<string> {
  if (!hasCache() || opts.saveData) return url;
  try {
    const known = objectUrls.get(url);
    if (known) { touchIndex(url, null); return known; }
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      const obj = URL.createObjectURL(blob);
      objectUrls.set(url, obj);
      touchIndex(url, blob.size);
      return obj;
    }
    void (async () => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) return;
        const bytes = Number(res.headers.get('content-length')) || (await res.clone().blob()).size;
        if (bytes > CACHE_MAX_BYTES) return;
        await cache.put(url, res);
        const evicted = touchIndex(url, bytes);
        for (const u of evicted) { await cache.delete(u); const o = objectUrls.get(u); if (o) { URL.revokeObjectURL(o); objectUrls.delete(u); } }
      } catch { /* streaming still works */ }
    })();
  } catch { /* no cache this session */ }
  return url;
}

function touchIndex(url: string, bytes: number | null): string[] {
  const idx = readIndex();
  const prior = idx.find((e) => e.url === url);
  const { keep, evict } = lruPlan(idx, { url, bytes: bytes ?? prior?.bytes ?? 0, at: Date.now() });
  writeIndex(keep);
  return evict;
}
