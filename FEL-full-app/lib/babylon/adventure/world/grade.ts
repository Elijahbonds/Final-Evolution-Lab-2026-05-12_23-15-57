/**
 * THE STORY'S LIGHT (look pass phase C1, lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 11).
 *
 * Measured before: the story's hub drew as a near-white floor under pale blue walls, though its palette is a dark slate floor
 * (#334155) and grey-blue walls (#94a3b8) (world/story/view.ts). The cause is the colour space, not the art: the shared post pipeline
 * (scene/LightRig.ts, DefaultRenderingPipeline) treats every material's colour as LINEAR light and gamma-encodes the frame at the end
 * (its image-processing pass has fromLinearSpace on), as physically based materials expect. The hoops sets give their colours in
 * linear (`Color3.FromHexString(hex).toLinearSpace()`); the story's own surfaces hand the sRGB hex straight in, so every one is
 * gamma-lifted a second time — dark slate reaches the screen as pale grey, and under the daylight mood's 2.6 sun, as white.
 *
 * `story.gradeV2` 1 reads the story's own surface colours as what they are (sRGB hex → linear), so the palette the worlds were given
 * is the one that shows, and leaves the mood (sun, sky, exposure, tone curve) exactly as the harness lit it. Colour is the owner's
 * call: SHIPS OFF, with the before/after sheet. 0 = every colour exactly as before.
 *
 * Which materials: the story view's (`story_*`: grounds, blocks, walls, decor, gates) and the dressing's (`dress_*`, when
 * `story.worldDressed` is on; its kit props take their palette in linear at load, dress.ts `linear`). Never the player, the partner,
 * the creatures, the sky or anything the harness made. Each material once (a second pass is a no-op), frozen materials refrozen.
 *
 * A textured surface (the dressing's ground and stone) is the one case a colour cannot fix exactly: a StandardMaterial samples its
 * map as stored (sRGB) and the pipeline lifts that too. `textureTintScale` brings the map's average back to its sRGB value — the tint
 * scaled by linear(mean) / mean, read once from the painted canvas — so the surface sits at the brightness it was painted at. The scale
 * goes on AFTER the tint is made linear (the dressing builds those materials in linear and marks them done): scaled first and lifted
 * after, the scale itself was raised to the 2.2 power, and World 1's grass went black (measured on the rig, the first sheet).
 */

import { Color3, StandardMaterial, type DynamicTexture, type Material, type Scene } from '@babylonjs/core';

/** story.gradeV2: 1 = the story's surface colours read as sRGB (the palette shows); 0 = as before. SHIPS OFF (colour is the owner's). */
export const STORY_GRADE_V2 = 0;

/** The story's own surfaces, by material name (world/story/view.ts `story_*`, world/dress.ts `dress_*`). */
export const STORY_SURFACE_MAT = /^(story_|dress_)/;

/** sRGB hex as the linear colour the pipeline expects (pure). */
export function storyLinear(hex: string): Color3 {
  return Color3.FromHexString(hex).toLinearSpace();
}

const done = new WeakSet<Material>();

/** Re-read one story surface's colours as sRGB. Returns whether it changed (false: not a story surface, or already done). */
export function gradeStoryMaterial(m: Material): boolean {
  if (done.has(m) || !STORY_SURFACE_MAT.test(m.name) || !(m instanceof StandardMaterial)) return false;
  const frozen = m.isFrozen;
  if (frozen) m.unfreeze();
  m.diffuseColor = m.diffuseColor.toLinearSpace();
  m.emissiveColor = m.emissiveColor.toLinearSpace();
  if (frozen) m.freeze();
  done.add(m);
  return true;
}

/** A material that was made in linear already (the dressing with story.gradeV2 on): the scene pass leaves it alone. */
export function markGraded(m: Material): void { done.add(m); }

/** Grade every story surface in the scene now (the view, the dressing's surfaces and trims). Returns how many changed. */
export function gradeStoryScene(scene: Scene): number {
  let n = 0;
  for (const m of scene.materials) if (gradeStoryMaterial(m)) n++;
  return n;
}

/** sRGB → linear for one channel in 0..1 (the exact curve, as Color3.toLinearSpace's 2.2 power). */
const toLin = (v: number): number => Math.pow(Math.max(0, v), 2.2);

/** The factor that brings a map of mean sRGB value `mean` (0..1) back to its painted brightness once the pipeline lifts it (pure). */
export function tintScaleForMean(mean: number): number {
  return mean > 1e-4 ? toLin(mean) / mean : 1;
}

/** A painted map's mean sRGB value (0..1), read once from its canvas; 1 (no change) when it cannot be read (a NullEngine). */
export function textureMean(tex: DynamicTexture | null): number {
  try {
    const ctx = tex?.getContext() as CanvasRenderingContext2D | undefined;
    if (!ctx || typeof ctx.getImageData !== 'function') return 1;
    const { width, height } = ctx.canvas;
    const d = ctx.getImageData(0, 0, width, height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 17) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
    return n ? sum / n : 1;
  } catch { return 1; }
}

/** The tint scale for a painted map (see the header): 1 when it cannot be read. */
export function textureTintScale(tex: DynamicTexture | null): number {
  return tintScaleForMean(textureMean(tex));
}
