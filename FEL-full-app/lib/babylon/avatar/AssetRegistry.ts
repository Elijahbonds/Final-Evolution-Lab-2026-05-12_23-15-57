// AssetRegistry — the single entry point for loading. Nothing else in the
// codebase should call SceneLoader / LoadAssetContainerAsync directly; one
// loading path means one cache, one error surface, one place to enforce
// budgets.
//
// Load once → AssetContainer cached → instantiate many. Concurrent requests
// for the same URL share one promise (no duplicate network fetches).
// IndexedDB persistence is keyed by url+version so a version bump
// invalidates cleanly.

import '@babylonjs/loaders/glTF';
import { SceneLoader, Texture } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Scene, Skeleton } from '@babylonjs/core';

export interface InstantiatedAsset {
  meshes: AbstractMesh[];
  skeleton: Skeleton | null;
  dispose(): void;
}

const DB_NAME = 'fel_assets';
const STORE = 'containers';

function splitUrl(url: string): { rootUrl: string; filename: string } {
  const i = url.lastIndexOf('/');
  return i < 0 ? { rootUrl: './', filename: url } : { rootUrl: url.slice(0, i + 1), filename: url.slice(i + 1) };
}

/** Tiny IndexedDB blob cache. Falls back to no-op when unavailable. */
class BlobCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> | null {
    if (typeof indexedDB === 'undefined') return null;
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.open()?.catch(() => null);
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => resolve((tx.result as Blob) ?? null);
      tx.onerror = () => resolve(null);
    });
  }

  async put(key: string, blob: Blob): Promise<void> {
    const db = await this.open()?.catch(() => null);
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
      tx.onsuccess = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export class AssetRegistry {
  private containers = new Map<string, Promise<AssetContainer>>();
  private textures = new Map<string, Texture>();
  private cache = new BlobCache();
  private bytes = 0;

  constructor(private version = '1') {}

  /** Load (or reuse) an AssetContainer for a GLB url. */
  container(url: string, scene: Scene): Promise<AssetContainer> {
    let p = this.containers.get(url);
    if (p) return p;
    p = this.loadContainer(url, scene).catch((e: unknown) => {
      this.containers.delete(url);                     // let a retry work
      throw new Error(`[FEL-ASSET] failed to load "${url}": ${(e as Error)?.message ?? e}`);
    });
    this.containers.set(url, p);
    return p;
  }

  private async loadContainer(url: string, scene: Scene): Promise<AssetContainer> {
    const key = `${url}@${this.version}`;
    const cached = await this.cache.get(key);
    if (cached) {
      const objUrl = URL.createObjectURL(cached);
      try {
        // the '.glb' hint tells the loader which plugin to use for a blob url
        return await SceneLoader.LoadAssetContainerAsync(objUrl, '', scene, undefined, '.glb');
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
    // fetch ourselves so the bytes can be cached, then hand the blob to Babylon
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        this.bytes += blob.size;
        void this.cache.put(key, blob);
        const objUrl = URL.createObjectURL(blob);
        try {
          return await SceneLoader.LoadAssetContainerAsync(objUrl, '', scene, undefined, '.glb');
        } finally {
          URL.revokeObjectURL(objUrl);
        }
      }
    } catch {
      /* fall through to the direct path below */
    }
    const { rootUrl, filename } = splitUrl(url);
    return SceneLoader.LoadAssetContainerAsync(rootUrl, filename, scene);
  }

  /** Instantiate a cached container into the scene. */
  async instantiate(url: string, scene: Scene): Promise<InstantiatedAsset> {
    const container = await this.container(url, scene);
    const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const root = inst.rootNodes[0];
    const meshes = (root && 'getChildMeshes' in root
      ? (root as unknown as AbstractMesh).getChildMeshes()
      : []) as AbstractMesh[];
    return {
      meshes: meshes.length ? meshes : (inst.rootNodes as unknown as AbstractMesh[]),
      skeleton: inst.skeletons[0] ?? null,
      dispose: () => inst.dispose(),
    };
  }

  /** Shared texture loader — mask textures are reused across many meshes. */
  async texture(url: string, scene: Scene): Promise<Texture> {
    const existing = this.textures.get(url);
    if (existing) return existing;
    const tex = new Texture(url, scene, false, false);
    this.textures.set(url, tex);
    return tex;
  }

  /** Warm a set of assets ahead of time (loading screen). */
  async preload(urls: string[], scene: Scene, onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    await Promise.all(urls.map(async (u) => {
      await this.container(u, scene).catch((e) => console.warn(e));
      onProgress?.(++done, urls.length);
    }));
  }

  getLoadedBytes(): number { return this.bytes; }

  dispose(): void {
    this.containers.clear();
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}
