// CrowdLod — a crowd body far from the camera costs what it shows (visual-foundation A9.9, 2026-10-06).
//
// WHY. Onlookers are full roster bodies (8 per bank, ~6–10 skinned meshes each), and every one of those meshes is drawn
// three times a frame: the body, its ink hull (the outline renderer's inverted hull — a second draw), and its depth into
// the shadow map (skinned, so it can never be in the cached static shadows — ShadowCache.ts measured the dunk's onlookers
// as most of what is still drawn into the map per frame). At the back of a boardwalk rail a body is a few dozen pixels
// tall: its contour line is under a pixel and its shadow is a smudge the contact disc under its feet already paints.
//
// WHAT. Past CROWD_FAR_M from the active camera a crowd body drops its ink hull and stops casting into the shadow map;
// inside CROWD_NEAR_M it gets both back (the gap is hysteresis, so a body on the line does not flicker). The contact
// disc under the feet stays — that is the shadow that reads at that size. On the phone tier the crowd never casts into
// the map at all: there every skinned caster is a per-frame shadow draw on the GPU that can least afford it.
// Checked every few frames, not every frame: a crowd stands still, the camera moves smoothly.
//
// Toggling renderOutline and shadow-caster membership compiles nothing (the outline pass and the shadow depth shader are
// already built for these meshes), so the switch is free at the frame it happens.

import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';

/** Past this a crowd body drops its ink and its cast shadow… */
export const CROWD_FAR_M = 14;
/** …and inside this it gets them back. */
export const CROWD_NEAR_M = 11;
/** Frames between distance checks. */
export const CROWD_CHECK_EVERY = 6;

/** Pure: is this body in its far state, given where it is and where it was? */
export function crowdIsFar(distance: number, wasFar: boolean): boolean {
  if (!Number.isFinite(distance)) return wasFar;
  return wasFar ? distance > CROWD_NEAR_M : distance > CROWD_FAR_M;
}

interface ShadowGen { addShadowCaster(m: AbstractMesh, includeDescendants?: boolean): unknown; removeShadowCaster(m: AbstractMesh, includeDescendants?: boolean): unknown }
interface Body { root: TransformNode; meshes: AbstractMesh[]; far: boolean | null; ink: Map<AbstractMesh, boolean> }
interface Lod { bodies: Body[]; obs: unknown; frame: number }

function sunShadows(scene: Scene): ShadowGen | null {
  const sun = scene.getLightByName('fel_sun') as unknown as { getShadowGenerator?(): ShadowGen | null } | null;
  return sun?.getShadowGenerator?.() ?? null;
}

const lodOf = (scene: Scene): Lod => {
  const md = (scene.metadata ??= {}) as { felCrowdLod?: Lod };
  if (md.felCrowdLod) return md.felCrowdLod;
  const lod: Lod = { bodies: [], obs: null, frame: 0 };
  md.felCrowdLod = lod;
  lod.obs = scene.onBeforeRenderObservable.add(() => {
    if (++lod.frame % CROWD_CHECK_EVERY !== 0 || !lod.bodies.length) return;
    const cam = scene.activeCamera;
    if (!cam) return;
    const eye = cam.globalPosition;
    const phone = (scene.metadata as { felTier?: string } | null)?.felTier === 'mobile';
    const gen = sunShadows(scene);
    for (let i = lod.bodies.length - 1; i >= 0; i--) {
      const b = lod.bodies[i];
      if (b.root.isDisposed()) { lod.bodies.splice(i, 1); continue; }
      const p = b.root.getAbsolutePosition();
      const far = crowdIsFar(Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z), b.far ?? false);
      if (far === b.far) continue;
      b.far = far;
      for (const m of b.meshes) {
        if (m.isDisposed()) continue;
        if (!b.ink.has(m)) b.ink.set(m, m.renderOutline);   // what the ink pass gave it, restored when it comes near
        m.renderOutline = far ? false : b.ink.get(m)!;
        if (!gen || !m.skeleton) continue;
        if (far || phone) gen.removeShadowCaster(m, false);
        else gen.addShadowCaster(m, false);
      }
    }
  });
  scene.onDisposeObservable.addOnce(() => { scene.onBeforeRenderObservable.remove(lod.obs as never); lod.bodies = []; delete md.felCrowdLod; });
  return lod;
};

/** A crowd body (Onlookers) joins the distance rule. Its skinned meshes are read now: call once it has spawned. */
export function registerCrowdBody(scene: Scene, root: TransformNode): void {
  const meshes = root.getChildMeshes(false);
  lodOf(scene).bodies.push({ root, meshes, far: null, ink: new Map() });
}
