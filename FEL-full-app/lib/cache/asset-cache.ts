/**
 * Asset Caching Strategy for FEL
 * Uses SWR (stale-while-revalidate) pattern for models, textures, mocap data.
 * Integrates with browser IndexedDB for offline support.
 */

import { useCallback } from 'react';
import useSWR from 'swr';

const ASSET_CACHE_VERSION = 'fel-v1';
const CACHE_DB = 'fel_assets';
const CACHE_STORE = 'assets';
const STALE_TIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Open IndexedDB for asset cache.
 */
async function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'url' });
      }
    };
  });
}

/**
 * Fetch asset with cache-first strategy.
 */
async function fetchAssetCached(url: string): Promise<Blob> {
  // Try cache first
  try {
    const db = await openAssetDb();
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const store = tx.objectStore(CACHE_STORE);
    const cached = await new Promise<any>((resolve, reject) => {
      const req = store.get(url);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

    if (cached && Date.now() - cached.timestamp < STALE_TIME_MS) {
      return cached.blob;
    }
  } catch (e) {
    console.warn('[ASSET-CACHE] Failed to read from cache', e);
  }

  // Fetch from network
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const blob = await response.blob();

  // Store in cache (fire-and-forget)
  try {
    const db = await openAssetDb();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put({
      url,
      blob,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn('[ASSET-CACHE] Failed to write to cache', e);
  }

  return blob;
}

/**
 * React hook for cached asset loading (SWR pattern).
 */
export function useAsset(url: string | null) {
  const fetcher = useCallback(async (u: string) => {
    const blob = await fetchAssetCached(u);
    return URL.createObjectURL(blob);
  }, []);

  const { data, error, isLoading } = useSWR(
    url ? `${ASSET_CACHE_VERSION}:${url}` : null,
    url ? () => fetcher(url) : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
      focusThrottleInterval: 300000, // 5 minutes
    }
  );

  return {
    url: data,
    loading: isLoading,
    error: error?.message,
  };
}

/**
 * Batch asset preloader (for level/scene startup).
 */
export async function preloadAssets(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const blob = await fetchAssetCached(url);
        results.set(url, URL.createObjectURL(blob));
      } catch (e) {
        console.warn(`[ASSET-CACHE] Failed to preload ${url}`, e);
      }
    })
  );

  return results;
}

/**
 * Clear entire cache (for debugging/dev).
 */
export async function clearAssetCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(CACHE_DB);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Cache statistics (for admin dashboards).
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalSizeBytes: number;
}> {
  try {
    const db = await openAssetDb();
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const entries = await new Promise<any[]>((resolve, reject) => {
      const req = tx.objectStore(CACHE_STORE).getAll();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });

    const totalSizeBytes = entries.reduce(
      (sum, e) => sum + (e.blob?.size ?? 0),
      0
    );

    return {
      totalEntries: entries.length,
      totalSizeBytes,
    };
  } catch (e) {
    console.error('[ASSET-CACHE] Failed to get stats', e);
    return { totalEntries: 0, totalSizeBytes: 0 };
  }
}
