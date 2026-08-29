// AnimeInk — NEW (M59). The third leg of the anime style pass: INK LINES
// and CEL MATERIALS. Babylon's outline renderer re-draws a mesh expanded
// along its normals behind itself — on characters that reads as the drawn
// contour line of cel animation. Plus a material flattening pass that kills
// photoreal specular shine (cel shading holds flat color; glints come from
// the rim light, not glossy materials).
//
// ZERO-WIRING DESIGN: autoInk(scene) watches new meshes and inks every
// SKINNED mesh automatically (skinned = a character, in every FEL mode).
// Venue/prop meshes keep their painted look — anime backgrounds are
// painterly, characters are inked, which is exactly the classic cel-over-
// background contrast.

import '@babylonjs/core/Rendering/outlineRenderer';     // side-effect: enables mesh.renderOutline
import { Color3 } from '@babylonjs/core';
import type { AbstractMesh, PBRMaterial, Scene, StandardMaterial } from '@babylonjs/core';

const INK_COLOR = Color3.FromHexString('#1a1230');      // deep indigo, softer than pure black
const INK_WIDTH = 0.015;

/** Ink one character's meshes + flatten their materials to cel. */
export function inkCharacter(meshes: AbstractMesh[]): void {
  for (const m of meshes) {
    m.renderOutline = true;
    m.outlineColor = INK_COLOR;
    m.outlineWidth = INK_WIDTH;
    const mat = m.material as (StandardMaterial & PBRMaterial) | null;
    if (!mat) continue;
    // cel flattening — no glossy hotspots; the rim light supplies the glint
    if ((mat as StandardMaterial).specularColor) (mat as StandardMaterial).specularColor = Color3.Black();
    if ((mat as PBRMaterial).metallic !== undefined) {
      (mat as PBRMaterial).metallic = 0;
      (mat as PBRMaterial).roughness = 0.95;
    }
  }
}

/** Mount once per scene (ModeHarness, right after scene creation): every
 *  skinned mesh that ever spawns — hero, rivals, mobs, the Yeti — gets
 *  inked automatically, existing and future. Returns a disposer. */
export function autoInk(scene: Scene): () => void {
  const seen = new WeakSet<AbstractMesh>();
  const tryInk = (m: AbstractMesh): void => {
    if (seen.has(m) || !m.skeleton) return;
    seen.add(m);
    inkCharacter([m]);
  };
  for (const m of scene.meshes) tryInk(m);
  const obs = scene.onNewMeshAddedObservable.add((m) => {
    // skeletons attach slightly after mesh add on instantiate — check next frame
    scene.onBeforeRenderObservable.addOnce(() => tryInk(m));
  });
  return () => scene.onNewMeshAddedObservable.remove(obs);
}

// WIRING (ModeHarness, once per mode load — one line):
//   const uninke = autoInk(scene);      // ... call uninke() on mode dispose
// Or, for explicit control, call inkCharacter(spawn.meshes) after each
// CharacterLibrary.spawn instead. Either path, not both (both is harmless
// but redundant).
