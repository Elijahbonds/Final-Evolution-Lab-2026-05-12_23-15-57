// VENUE-QUALITY v1 (box overlay, 2026-10-31; PM relay of Elijah 12:35 PM "keep improving the quality of the models, stages and venues").
// Every lift is OFF by default and has its own feel knob (harness: window.__vq.* / ?vq=ibl,freeze,venice).
//   venue.iblEnvV1   — prefiltered .env IBL per mood (CC0 Poly Haven HDRIs, prefiltered offline in the box harness), replaces the
//                      procedural cube from EnvironmentIBL.ts; falls back to it when the mood has no file or the fetch fails.
//   venue.freezeV1   — static venue: material.freeze(), mesh.freezeWorldMatrix() on non-skinned, non-animated meshes, and
//                      (scene.freezeActiveMeshes() is NOT used: players, ball and crowd move in and out of view every frame).
//   venue.veniceHoopsV1 — 1v1 / 3v3 / carnival: the dunk's Venice (sand for the lawn planes, kit lollipop palms / bushes / grass hidden,
//                      env2 dressing mounted). Code from ENV-LOOK-AUDIT Fix A.
//   venue.stageLmV1  — mini-arena stage pieces (karate VS / combat / dojo courtyard) load the Blender AO-baked copies in
//                      public/models/props/mini-arena-lm-v1/ (static lighting in the texture; no extra light or shadow cost).
// No GLB is edited or re-saved. No new dependency (CubeTexture.CreateFromPrefilteredData is core Babylon).
import { CubeTexture } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';
import type { VenueMood } from './moods';
const q = (k: string): boolean => { try { return typeof location !== 'undefined' && new URLSearchParams(location.search).get('vq')?.split(',').includes(k) === true; } catch { return false; } };
export const VQ = {
  ibl: (): boolean => feel('venue.iblEnvV1', 0) >= 0.5 || q('ibl'),
  freeze: (): boolean => feel('venue.freezeV1', 0) >= 0.5 || q('freeze'),
  stageLm: (): boolean => feel('venue.stageLmV1', 0) >= 0.5 || q('lm'),
  venice: (): boolean => feel('venue.veniceHoopsV1', 1)   /* SWITCH-ON 2026-11-03: default on */ >= 0.5 || q('venice'),
};
/** mood -> prefiltered env (public/env/*.env, 128 px faces, ~0.3-0.5 MB each). Moods without a file keep the procedural cube. */
export const IBL_ENV: Partial<Record<VenueMood, { url: string; intensity: number; rotY: number }>> = {
  goldenHour: { url: '/env/venice_sunset_1k.env', intensity: 0.9, rotY: 0 },
  daylight: { url: '/env/spiaggia_di_mondello_1k.env', intensity: 0.85, rotY: 0 },
  dusk: { url: '/env/venice_sunset_1k.env', intensity: 0.6, rotY: 0 },
  overcast: { url: '/env/kloofendal_48d_partly_cloudy_puresky_1k.env', intensity: 0.8, rotY: 0 },
  alpine: { url: '/env/kloofendal_48d_partly_cloudy_puresky_1k.env', intensity: 0.9, rotY: 0 },
  // round 2 (CC0 Poly Haven, 1k -> prefiltered 128 px)
  indoorArena: { url: '/env/gym_01_1k.env', intensity: 0.8, rotY: 0 },
  nightGame: { url: '/env/satara_night_1k.env', intensity: 0.7, rotY: 0 },
  dojoWarm: { url: '/env/wooden_lounge_1k.env', intensity: 0.75, rotY: 0 },
};
/** Mount the prefiltered IBL for this mood if the knob is on and a file exists; otherwise run `fallback` (procedural). Returns a disposer. */
export function mountVenueIBL(scene: Scene, mood: VenueMood, fallback: () => () => void): () => void {
  const e = VQ.ibl() ? IBL_ENV[mood] : undefined; if (!e) return fallback();
  let disposeFb: (() => void) | null = fallback();   // procedural first frame; swapped when the .env is ready (no black flash)
  const env = CubeTexture.CreateFromPrefilteredData(e.url, scene); env.rotationY = e.rotY;
  env.onLoadObservable.addOnce(() => { disposeFb?.(); disposeFb = null; scene.environmentTexture = env; scene.environmentIntensity = e.intensity; });
  return () => { disposeFb?.(); if (scene.environmentTexture === env) scene.environmentTexture = null; env.dispose(); };
}
/** Freeze the static venue. Call after the venue + props have loaded. Skinned / animated / instanced-with-motion meshes stay live. */
export function freezeStaticVenue(scene: Scene, isStatic: (m: AbstractMesh) => boolean = () => true): { mats: number; meshes: number } {
  if (!VQ.freeze()) return { mats: 0, meshes: 0 };
  const animated = new Set<unknown>(); for (const g of scene.animationGroups) for (const t of g.targetedAnimations) animated.add(t.target);
  const moving = (m: AbstractMesh): boolean => { for (let n: any = m; n; n = n.parent) if (animated.has(n)) return true; return false; };
  let meshes = 0; const mats = new Set<string>();
  for (const m of scene.meshes) {
    if (m.skeleton || moving(m) || !isStatic(m) || m.billboardMode) continue;
    m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; meshes++;
    const mt = m.material; if (mt && !mats.has(mt.uniqueId + '') && !(mt as any).getAlphaTestTexture?.()) { mt.freeze(); mats.add(mt.uniqueId + ''); }
  }
  return { mats: mats.size, meshes };
}
