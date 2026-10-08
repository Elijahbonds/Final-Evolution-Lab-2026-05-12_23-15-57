// A question used to dispose its venue and mount the next one from scratch. The first frames of every
// swap paid that build. A shelf mounts each venue once, hides the ones that are not on screen, and
// shows the one the card is asking about.
import type { Color3, Color4 } from '@babylonjs/core';

export interface ShelfNode {
  setEnabled(on: boolean): void;
}

export interface Shelved {
  root: ShelfNode;
  dispose(): void;
}

export function makeVenueShelf<T extends Shelved>(mount: (id: string) => T | null) {
  const cache = new Map<string, T>();
  let built = 0;
  return {
    /** How many venues were constructed. Showing one that is already on the shelf does not increase this. */
    built: () => built,
    has: (id: string) => cache.has(id),
    ensure(id: string): T | null {
      const hit = cache.get(id);
      if (hit) return hit;
      const v = mount(id);
      if (!v) return null;
      cache.set(id, v);
      built += 1;
      return v;
    },
    preload(ids: readonly string[]): void {
      for (const id of ids) this.ensure(id);
    },
    show(id: string): T | null {
      const v = this.ensure(id);
      for (const [k, h] of cache) h.root.setEnabled(k === id);
      return v;
    },
    /** IMPROVE (2026-10-06, #17): take one venue off the shelf and free it (a question that will not be asked again). */
    drop(id: string): boolean {
      const v = cache.get(id);
      if (!v) return false;
      v.dispose();
      cache.delete(id);
      return true;
    },
    /** IMPROVE (#17): keep only `ids` on the shelf — what a freshly drawn match will ask — and free every other venue. */
    retain(ids: readonly string[]): void {
      const keep = new Set(ids);
      for (const id of [...cache.keys()]) if (!keep.has(id)) this.drop(id);
    },
    ids: (): string[] => [...cache.keys()],
    dispose(): void {
      for (const h of cache.values()) h.dispose();
      cache.clear();
    },
  };
}

// ── IMPROVE (2026-10-06, #1): each venue's own sky and fog ───────────────────────────────────────────────────────────
//
// buildNexusScene writes the venue's sky colour and fog onto the SCENE (clearColor, fogMode, fogColor, fogDensity), not
// onto its root. The shelf builds every venue up front and then only toggles roots, so every question rendered under the
// LAST-built venue's sky and fog — and the look of the place is the clue. The shelf records what each venue wrote right
// after it is built and puts it back when that venue is shown.

/** The scene fields a venue build writes. Structural, so it is tested on a plain object. */
export interface SceneEnvHost {
  clearColor: Color4;
  fogMode: number;
  fogColor: Color3;
  fogDensity: number;
  fogStart: number;
  fogEnd: number;
}
export interface SceneEnv { clear: Color4; fogMode: number; fogColor: Color3; fogDensity: number; fogStart: number; fogEnd: number }

export function captureSceneEnv(s: SceneEnvHost): SceneEnv {
  return { clear: s.clearColor.clone(), fogMode: s.fogMode, fogColor: s.fogColor.clone(), fogDensity: s.fogDensity, fogStart: s.fogStart, fogEnd: s.fogEnd };
}

/** Put a captured environment back, copying into the scene's own colour objects (no allocation per question). */
export function applySceneEnv(s: SceneEnvHost, e: SceneEnv): void {
  s.clearColor.copyFrom(e.clear);
  s.fogMode = e.fogMode;
  s.fogColor.copyFrom(e.fogColor);
  s.fogDensity = e.fogDensity;
  s.fogStart = e.fogStart;
  s.fogEnd = e.fogEnd;
}
