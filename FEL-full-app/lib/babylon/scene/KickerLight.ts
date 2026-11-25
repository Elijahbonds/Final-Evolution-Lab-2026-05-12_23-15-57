// KICKER LIGHT — the light that separates a player from the venue (visual-foundation A9.6, 2026-10-06).
//
// Every broadcast sport and every fighting game puts a second, harder light behind the athlete on the side away from the
// camera: it draws a bright edge down the silhouette (the "rim" or "kicker") so a body reads against a busy court or a
// dark stadium from across a room. That is exactly what a TV at ten feet needs, and the rig had none — one sun, one
// hemisphere, and a body in a dark kit dissolved into a night crowd.
//
// One DirectionalLight per scene, restricted to the PLAYERS (every skinned mesh: hero, rivals, the crowd bodies — the
// same test AnimeInk uses), so the floor, the scenery and the sky keep exactly the light they had; the pattern is
// racing/vehicleLight.ts's fill. It casts no shadow (no extra draws) and re-aims each frame from the active camera: behind
// the subject, a little to one side and above, travelling back toward the lens. Colour and strength are per mood.

import { Color3, DirectionalLight, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';
import type { VenueMood } from './moods';

export interface KickerDef { color: string; intensity: number }

/** Per-mood kicker. Warm rims under a warm sky, cool rims at night and at dusk (against the orange key). Look numbers,
 *  judged on the before/after frames. */
export const KICKER: Record<VenueMood, KickerDef> = {
  goldenHour:  { color: '#ffd0a0', intensity: 1.4 },
  daylight:    { color: '#ffffff', intensity: 0.9 },
  dojoWarm:    { color: '#ffcf9a', intensity: 1.2 },
  nightGame:   { color: '#a9c4ff', intensity: 1.8 },
  overcast:    { color: '#e8eef6', intensity: 0.9 },
  alpine:      { color: '#e2ecff', intensity: 1.0 },
  dusk:        { color: '#c4a6ff', intensity: 1.6 },
  indoorArena: { color: '#fff0dc', intensity: 1.3 },
};

/** How far behind (1), to the side (SIDE) and above (LIFT) the subject the kicker sits, relative to the camera's view. */
export const KICKER_SIDE = 0.45, KICKER_LIFT = 0.55;

/**
 * The kicker's travel direction for a camera looking along `forward` (any length; only its ground-plane heading counts).
 * Pure. The light sits BEHIND the subject as seen from the camera, so it travels back toward the camera: -forward on the
 * ground plane, plus a sideways part (camera right × SIDE) and a downward part (LIFT).
 */
export function kickerDirection(forward: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  let fx = forward.x, fz = forward.z;
  const l = Math.hypot(fx, fz);
  if (l < 1e-6) { fx = 0; fz = 1; } else { fx /= l; fz /= l; }   // a camera looking straight down: assume +z
  // camera right on the ground plane (left-handed Babylon: right = (fz, 0, -fx))
  const rx = fz, rz = -fx;
  const x = -fx + rx * KICKER_SIDE, y = -KICKER_LIFT, z = -fz + rz * KICKER_SIDE;
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
}

// ── depth pass phase 2 (lane depth-light, 2026-11-25): the rim from behind ───────────────────────────────────────────────────────────
// The rim did not show from the Dunk's behind-the-player camera (docs/DEPTH-PASS-AUDIT.md finding 3): from behind, the kicker lights the
// side of the body the camera cannot see and only a sliver of edge catches it. With `look.bodyFormLight` on (bodyFill.ts), the kicker's
// strength follows how much of the bodies' BACKS the camera sees: × (1 + KICKER_BACK_GAIN × backness), backness 0 (the camera sees
// their fronts or sides) .. 1 (straight behind them). Off, the kicker is exactly as before (the per-mood KICKER numbers are not edited).
/** How much stronger the kicker gets when the camera is straight behind the bodies (new; only with look.bodyFormLight on). */
export const KICKER_BACK_GAIN = 0.8;

/** Pure: how much of the bodies' backs the camera sees — the mean over bodies of max(0, cos) between the camera's ground heading and
 *  each body's ground facing (the rig faces +z at yaw 0). 0 with no body. */
export function kickerBackness(camForward: { x: number; z: number }, bodyForwards: readonly { x: number; z: number }[]): number {
  const cl = Math.hypot(camForward.x, camForward.z);
  if (cl < 1e-6 || !bodyForwards.length) return 0;
  let sum = 0, n = 0;
  for (const f of bodyForwards) {
    const fl = Math.hypot(f.x, f.z);
    if (fl < 1e-6) continue;
    sum += Math.max(0, (camForward.x * f.x + camForward.z * f.z) / (cl * fl)); n++;
  }
  return n ? sum / n : 0;
}

export interface KickerHandle {
  light: DirectionalLight;
  /** The meshes it lights (players only). */
  readonly meshes: readonly AbstractMesh[];
  /** depth pass phase 2: the last backness read (0 unless `followBacks` is on). */
  readonly backness: number;
  dispose(): void;
}

/** Mount the kicker. Players are found the way AnimeInk finds them: a mesh with a skeleton (checked a frame after it is
 *  added, because an instantiated character's skeleton attaches just after the mesh). */
export function mountKickerLight(scene: Scene, mood: VenueMood, opts: { followBacks?: boolean } = {}): KickerHandle {
  const K = KICKER[mood] ?? KICKER.goldenHour;
  const light = new DirectionalLight('fel_kicker', new Vector3(0, -KICKER_LIFT, -1), scene);
  light.diffuse = Color3.FromHexString(K.color);
  light.specular = Color3.FromHexString(K.color);
  light.intensity = K.intensity;
  // An EMPTY include list means "light everything" in Babylon — so the light stays off until the first player exists.
  light.setEnabled(false);
  const meshes: AbstractMesh[] = [];
  let dirty = false;
  const seen = new WeakSet<AbstractMesh>();
  const consider = (m: AbstractMesh): void => {
    if (seen.has(m) || !m.skeleton) return;
    seen.add(m); meshes.push(m); dirty = true;
  };
  for (const m of scene.meshes) consider(m);
  const added = scene.onNewMeshAddedObservable.add((m) => { scene.onBeforeRenderObservable.addOnce(() => consider(m)); });
  const removed = scene.onMeshRemovedObservable.add((m) => {
    const i = meshes.indexOf(m);
    if (i >= 0) { meshes.splice(i, 1); dirty = true; }
  });
  const apply = (): void => {
    if (!dirty) return;
    dirty = false;
    light.includedOnlyMeshes = meshes.slice();   // one resync per change, not one per mesh
    light.setEnabled(meshes.length > 0);
  };
  apply();
  let backness = 0;
  const roots: TransformNode[] = [];
  let rootsFor = -1;
  const facings: { x: number; z: number }[] = [];
  const aim: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    apply();
    const cam = scene.activeCamera;
    if (!cam || !light.isEnabled()) return;
    const f = cam.getDirection(Vector3.Forward());
    const d = kickerDirection(f);
    light.direction.set(d.x, d.y, d.z);
    if (!opts.followBacks) return;
    // the bodies' roots (the top of each skinned mesh's parent chain), refreshed when the body list changes
    if (rootsFor !== meshes.length) {
      rootsFor = meshes.length; roots.length = 0;
      for (const m of meshes) { let r: TransformNode = m; while (r.parent) r = r.parent as TransformNode; if (!roots.includes(r)) roots.push(r); }
    }
    facings.length = 0;
    for (const r of roots) if (r.isEnabled()) { const fw = r.forward; facings.push({ x: fw.x, z: fw.z }); }
    backness = kickerBackness({ x: f.x, z: f.z }, facings);
    light.intensity = K.intensity * (1 + KICKER_BACK_GAIN * backness);
  });
  return {
    light,
    get meshes() { return meshes; },
    get backness() { return backness; },
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onMeshRemovedObservable.remove(removed);
      scene.onBeforeRenderObservable.remove(aim);
      light.dispose();
    },
  };
}
