// A canvas texture that survives a scene with no canvas (vis-court, wave 2).
//
// Every court visual paints a small texture in code. A NullEngine scene with no OffscreenCanvas (the headless mode tests, a
// server render) throws on `new DynamicTexture`; a mode's load() must never die for a picture, so the painters go through this:
// a texture, or null when the engine cannot make one (the caller then uses its plain colour). Painting that throws leaves the
// texture blank rather than failing the mode.

import { DynamicTexture } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

export function makeTexture(scene: Scene, name: string, w: number, h: number, paint?: (g: CanvasRenderingContext2D) => void, mipmaps = true): DynamicTexture | null {
  let t: DynamicTexture;
  try { t = new DynamicTexture(name, { width: w, height: h }, scene, mipmaps); } catch { return null; }
  if (paint) { try { paint(t.getContext() as unknown as CanvasRenderingContext2D); t.update(); } catch { /* blank */ } }
  return t;
}

/** Repaint an existing texture (a card that changes). A texture that cannot be painted is left as it was. */
export function repaint(t: DynamicTexture | null, paint: (g: CanvasRenderingContext2D) => void): void {
  if (!t) return;
  try { paint(t.getContext() as unknown as CanvasRenderingContext2D); t.update(); } catch { /* as it was */ }
}
