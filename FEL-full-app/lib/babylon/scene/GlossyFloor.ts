// GLOSSY FLOORS (vis-foundation-2, A9.7 second half, 2026-10-13) — desktop and high.
//
// A9.7's first half gave the glossy materials one capture of the venue (VenueReflection: a 256 px cube, taken once). A
// sealed gym floor or a dance stage is a different thing: what it shows is the PLAYERS, upside down at their feet, moving
// — the read every indoor broadcast has. A cube taken once at load cannot show a body that moves. So the named glossy
// floors get a planar MirrorTexture: the floor's material goes to a varnished roughness, and a reflection of the bodies,
// the fixtures and the tall props near the play area is rendered into it every frame at a reduced resolution and blurred.
//
// Named floors only (the audit: the dance stage, the gym, the Brain Brawl stage): a mode in GLOSSY_FLOOR_MODES, or any
// place whose ground is a wooden court ('court' in the place looks — the volleyball Gym). The render list is bounded
// (bodies, fixtures, props within MIRROR_RADIUS of the play area, capped), so the cost is a few dozen draws, not a second
// scene. Mounted once after load(); never toggled; never on phones.

import { MirrorTexture, Plane, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, PBRMaterial, Scene } from '@babylonjs/core';
import type { QualityTier } from './QualityTier';
import { sceneModeId, wave2Look } from './lookPolicy';
import { readPlaceLook } from '../nexus/placeLooks';

/** Modes whose floor is always a glossy stage. */
export const GLOSSY_FLOOR_MODES: ReadonlySet<string> = new Set(['dance', 'brainbrawl']);
/** vis-hoops-dunk (2026-10-14): modes whose glossy floor is a painted court plane laid over the venue's ground (the Venice street court:
 *  `vb_court_paint`, PBR) — the mirror goes on that plane, which is what the eye reads as the floor. Absent here = `venue_ground`. */
export const GLOSSY_FLOOR_MESH: Readonly<Record<string, string>> = { dunk: 'vb_court_paint', dunkduel: 'vb_court_paint', threepoint: 'vb_court_paint' };
/** The varnish: the floor's roughness under the mirror (a sealed hardwood, a lacquered stage). */
export const VARNISH_ROUGHNESS = 0.32;
/** How much of the mirror the floor shows (on top of PBR's own fresnel). */
export const MIRROR_LEVEL = 1;
/** Only what stands within this of the play area is reflected. */
export const MIRROR_RADIUS = 28;
export const MIRROR_CAP = 160;
export function mirrorRatio(tier: QualityTier): number { return tier === 'high' ? 0.6 : 0.4; }

/** Pure: does this mode's floor take the mirror? A named stage mode, or a place whose ground is a wooden court. */
export function glossyFloorWanted(tier: QualityTier, modeId: string | null, placeGroundKind: string | null | undefined, off = false): boolean {
  if (tier === 'mobile' || off || !modeId || !wave2Look(modeId)) return false;
  return GLOSSY_FLOOR_MODES.has(modeId) || modeId in GLOSSY_FLOOR_MESH || placeGroundKind === 'court';
}

/** Pure: does this mesh belong in the floor's reflection? Bodies, fixtures and props standing near the play area; never the
 *  floor itself, the sky, a decal or an effect quad. */
export function mirrors(m: { name: string; skeleton?: unknown; isVisible: boolean; isEnabled(): boolean }, distToPlay: number): boolean {
  if (!m.isVisible || !m.isEnabled()) return false;
  if (/^(venue_ground|venue_apron|fel_|juice_|fx_|burst|trail|spark|player_ring|player_tag|ring_|ProxyMesh|hoops_|tp_aprons)|_contact$|shadow|_pool$/i.test(m.name)) return false;   // (hoops_ / _pool / tp_aprons: vis-hoops-dunk's flat additive light on the floor)
  // the room itself: the sky / ceiling dome and the walls — anything the mirror does not draw reflects as black, and a
  // floor whose reflection is black reads DARKER than the matte floor it replaced (measured on the Gym's first cut)
  if (/^(nexus_sky|bk_dome|venue_box|wall_)/i.test(m.name)) return true;
  if (m.skeleton) return true;
  return distToPlay <= MIRROR_RADIUS;
}

export interface GlossyFloorHandle { readonly mirror: MirrorTexture; readonly floor: AbstractMesh; dispose(): void }

export function mountGlossyFloor(scene: Scene, tier: QualityTier, at: Vector3 | null, off = false): GlossyFloorHandle | null {
  const modeId = sceneModeId(scene);
  let kind: string | undefined;
  try { kind = modeId ? readPlaceLook(modeId)?.ground?.kind : undefined; } catch { kind = undefined; }
  if (!glossyFloorWanted(tier, modeId, kind, off)) return null;
  const floor = scene.getMeshByName((modeId && GLOSSY_FLOOR_MESH[modeId]) || 'venue_ground');
  const mat = floor?.material as PBRMaterial | null | undefined;
  if (!floor || !mat || mat.getClassName() !== 'PBRMaterial') return null;
  const y = floor.computeWorldMatrix(true).getTranslation().y;
  let mirror: MirrorTexture;
  try {
    mirror = new MirrorTexture('fel_floor_mirror', { ratio: mirrorRatio(tier) }, scene, true);
  } catch (e) {
    console.warn('[FEL-MIRROR] mirror unavailable:', e);
    return null;
  }
  mirror.mirrorPlane = new Plane(0, -1, 0, y + 0.002);   // the floor's own plane (a hair above: no self z-fight)
  mirror.adaptiveBlurKernel = tier === 'high' ? 18 : 24;   // a varnish, not a looking-glass
  mirror.level = MIRROR_LEVEL;
  const centre = at ?? Vector3.Zero();
  const list = mirror.renderList!;
  const consider = (m: AbstractMesh): void => {
    if (m === floor || list.length >= MIRROR_CAP || list.includes(m)) return;
    let d = Infinity;
    try { d = Vector3.Distance(m.getBoundingInfo().boundingSphere.centerWorld, centre); } catch { /* not renderable */ }
    if (mirrors(m, d)) list.push(m);
  };
  for (const m of scene.meshes) consider(m);
  const added: Observer<AbstractMesh> = scene.onNewMeshAddedObservable.add((m) => { if (m.skeleton) consider(m); });   // a body spawned later
  const prev = { roughness: mat.roughness, reflection: mat.reflectionTexture };
  mat.roughness = VARNISH_ROUGHNESS;
  mat.reflectionTexture = mirror;
  console.info(`[FEL-MIRROR] ${modeId} floor mirrors ${list.length} meshes at ×${mirrorRatio(tier)}`);
  return {
    mirror, floor,
    dispose() {
      scene.onNewMeshAddedObservable.remove(added);
      try { mat.roughness = prev.roughness; mat.reflectionTexture = prev.reflection; } catch { /* gone */ }
      mirror.dispose();
    },
  };
}
