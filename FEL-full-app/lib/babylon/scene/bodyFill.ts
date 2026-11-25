// BODY FILL — a light side and a dark side on the players (depth pass phase 2, lane depth-light, 2026-11-25; docs/DEPTH-PASS-AUDIT.md
// finding 3).
//
// Bodies read flat on every tier: a shirt and the skin are lit almost evenly from all sides, so a torso has no light side and no dark
// side. The ambient adds up on a body — the mood's hemisphere fill (moods.ts hemiIntensity 0.55–0.95), the image light, the black-
// material floor — and the sun, which does the shaping, is mostly behind the camera. This changes the hemisphere's share on the
// BODIES only, with the kicker's pattern (KickerLight.ts): the scene's hemisphere leaves the skinned meshes out (its excluded list), and
// a copy of it — same direction, sky and ground colours — lights only them at `share` of its strength. The court, the set and the sky
// keep exactly the light they had. Per pixel only: no new material, no per-vertex work, no extra draw (the body still sees one
// hemisphere, so its light count does not change).
//
// MEASURED (2026-11-25, the static rig, Dunk and 1v1 at 1 / 0.6 / 0.3): the hemisphere alone barely moves a body — the bodies are PBR
// and most of their even fill is the IMAGE light (EnvironmentIBL: scene.environmentIntensity 0.85, every PBR material). So the share
// also scales each body material's own `environmentIntensity` (a uniform on the material it already has: no new material, no recompile,
// no cost), and puts it back on dispose. Skin and cloth only by construction: a body's materials are its own (skinShading per spawn).
//
// `look.bodyFormLight` (0 = today: no copy, the hemisphere lights the bodies at full strength). The copy follows the scene hemisphere's
// intensity every frame (a weather or a flash that dims the hemi dims the bodies' copy with it). Moods.ts is never edited.

import { HemisphericLight } from '@babylonjs/core';
import type { AbstractMesh, Material, Observer, Scene } from '@babylonjs/core';

/** look.bodyFormLight's shipped value: 0 = today (the hemisphere lights the bodies at full strength). */
export const BODY_FORM_LIGHT = 0;

/** Pure: the knob's value as the body copy's share of the hemisphere, or null for "off" (today). */
export function bodyFillShare(v: number): number | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.min(1, v);
}

/** Pure: is this mesh a body the fill lights? The kicker's rule (a mesh with a skeleton: hero, rivals, crowd bodies). */
export const isBody = (m: { skeleton?: unknown }): boolean => !!m.skeleton;

export interface BodyFillHandle {
  /** The bodies' copy of the hemisphere. */
  light: HemisphericLight;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

/** Mount the body fill beside the scene's hemisphere. Null when the knob is off (today). */
export function mountBodyFill(scene: Scene, hemi: HemisphericLight, value: number): BodyFillHandle | null {
  const share = bodyFillShare(value);
  if (share === null) return null;
  const light = new HemisphericLight('fel_body_hemi', hemi.direction.clone(), scene);
  light.diffuse.copyFrom(hemi.diffuse); light.groundColor.copyFrom(hemi.groundColor); light.specular.copyFrom(hemi.specular);
  light.intensity = hemi.intensity * share;
  // an EMPTY include list lights everything (Babylon): off until the first body exists
  light.setEnabled(false);
  const meshes: AbstractMesh[] = [];
  const seen = new WeakSet<AbstractMesh>();
  let dirty = false;
  // the image light's share on each body material (PBR's environmentIntensity), once per material, restored on dispose
  const envWas = new Map<Material, number>();
  const dimEnv = (mat: Material | null | undefined): void => {
    if (!mat || envWas.has(mat)) return;
    const m = mat as Material & { environmentIntensity?: number; subMaterials?: (Material | null)[] };
    if (m.subMaterials) { for (const sm of m.subMaterials) dimEnv(sm); return; }
    if (typeof m.environmentIntensity !== 'number') return;
    envWas.set(mat, m.environmentIntensity);
    m.environmentIntensity *= share;
  };
  const consider = (m: AbstractMesh): void => {
    if (seen.has(m) || !isBody(m)) return;
    seen.add(m); meshes.push(m); dirty = true;
    dimEnv(m.material);
  };
  for (const m of scene.meshes) consider(m);
  // an instantiated character's skeleton attaches just after the mesh: look a frame later (as the kicker does)
  const added = scene.onNewMeshAddedObservable.add((m) => { scene.onBeforeRenderObservable.addOnce(() => consider(m)); });
  const removed = scene.onMeshRemovedObservable.add((m) => { const i = meshes.indexOf(m); if (i >= 0) { meshes.splice(i, 1); dirty = true; } });
  const apply = (): void => {
    if (!dirty) return;
    dirty = false;
    light.includedOnlyMeshes = meshes.slice();
    hemi.excludedMeshes = meshes.slice();     // one resync per change, not one per mesh
    if ((meshes.length > 0) !== light.isEnabled()) light.setEnabled(meshes.length > 0);
  };
  apply();
  const tick: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    apply();
    for (const m of meshes) dimEnv(m.material);   // a material set after the body was found (skinShading, a kit change): one map lookup each
    light.intensity = hemi.intensity * share;
    const on = meshes.length > 0 && hemi.isEnabled();
    if (on !== light.isEnabled()) light.setEnabled(on);   // a toggle re-flags the bodies' materials: only on a change
  });
  return {
    light,
    get meshes() { return meshes; },
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      scene.onBeforeRenderObservable.remove(tick);
      try { hemi.excludedMeshes = []; } catch { /* the hemi went first */ }
      for (const [mat, v] of envWas) { try { (mat as Material & { environmentIntensity: number }).environmentIntensity = v; } catch { /* gone */ } }
      light.dispose();
    },
  };
}
