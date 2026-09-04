// Neuro-Mechanic Mirror (v1) — highlight-zone binding
//
// Binds a low-poly set of "highlight zone" meshes to the EXISTING FEL rig bones
// (brief §2.2). These are simple capsule meshes with emissive shader states —
// NOT deformable anatomical geometry (explicitly out of scope for v1).
//
// CRITICAL RIG NOTE: FEL's skeleton uses UNPREFIXED bone names (Hips, Spine,
// Spine2, Neck, LeftShoulder, RightShoulder, …) — see lib/babylon/characters/
// proceduralRig.ts and the M65 AvatarSkeletonSpec. The Abacus brief's
// "mixamorig:" prefix does NOT apply to this repo, so zones bind to the real
// unprefixed names. No second skeleton is created — we attach to the rig that is
// already spawned.

import {
  Color3, Mesh, MeshBuilder, Scene, Skeleton, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import { ZONE_STATE_COLOR, type ZoneState } from '../rules/config';
import { PATTERN_ZONES, type ZoneId } from '../patterns/split-stance-press-row';

/** Which unprefixed bone each highlight zone rides on, plus a local placement. */
interface ZonePlacement {
  bone: string;
  /** Local offset from the bone origin (metres, rig space). */
  offset: [number, number, number];
  /** Capsule dimensions (metres). */
  height: number;
  radius: number;
  /** Optional local rotation (radians) so a capsule lies along the right axis. */
  rotation?: [number, number, number];
}

// Placements are approximate anatomical regions on the FEL rig. They are visual
// highlight volumes, not measured anatomy.
const ZONE_PLACEMENT: Record<ZoneId, ZonePlacement> = {
  posterior_chain: { bone: 'Spine',   offset: [0, 0.02, -0.12], height: 0.34, radius: 0.11, rotation: [0, 0, 0] },
  lat_rhomboid:    { bone: 'Spine2',  offset: [0, 0.00, -0.10], height: 0.26, radius: 0.13, rotation: [0, 0, Math.PI / 2] },
  upper_traps:     { bone: 'Neck',    offset: [0, -0.02, -0.02], height: 0.20, radius: 0.09, rotation: [0, 0, Math.PI / 2] },
  rib_thoracic:    { bone: 'Spine2',  offset: [0, 0.00, 0.10],  height: 0.24, radius: 0.12, rotation: [0, 0, 0] },
  lumbo_pelvic:    { bone: 'Hips',    offset: [0, 0.04, 0.00],  height: 0.18, radius: 0.14, rotation: [0, 0, 0] },
};

export interface BoundZone {
  id: ZoneId;
  mesh: Mesh;
  material: StandardMaterial;
}

/**
 * Attach one highlight capsule per zone to the given skeleton's bones. Returns
 * the bound zones so the compositor can recolour them per frame. Any zone whose
 * bone is missing is skipped with a warning (never silently guessed).
 */
export function bindHighlightZones(scene: Scene, skeleton: Skeleton, root: TransformNode): BoundZone[] {
  const bound: BoundZone[] = [];
  for (const id of PATTERN_ZONES) {
    const place = ZONE_PLACEMENT[id];
    const node = skeleton.bones.find((b) => b.name === place.bone)?.getTransformNode();
    if (!node) {
      console.warn(`[FEL-MIRROR] zone "${id}" — bone "${place.bone}" not found on rig; skipped`);
      continue;
    }
    const mesh = MeshBuilder.CreateCapsule(
      `mirror_zone_${id}`, { height: place.height, radius: place.radius }, scene);
    const mat = new StandardMaterial(`mirror_zoneMat_${id}`, scene);
    mat.disableLighting = true;
    mat.alpha = 0.55;
    mat.emissiveColor = Color3.FromHexString(ZONE_STATE_COLOR.unavailable);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.parent = node;
    mesh.position = new Vector3(place.offset[0], place.offset[1], place.offset[2]);
    if (place.rotation) mesh.rotation = new Vector3(place.rotation[0], place.rotation[1], place.rotation[2]);
    // Keep the highlight a stable visual size regardless of any bone scaling.
    bound.push({ id, mesh, material: mat });
  }
  return bound;
}

/** Recolour a bound zone to reflect its current estimated state. */
export function applyZoneState(zone: BoundZone, state: ZoneState): void {
  zone.material.emissiveColor = Color3.FromHexString(ZONE_STATE_COLOR[state]);
  // Fault reads slightly more opaque so it draws the eye; unavailable fades back.
  zone.material.alpha = state === 'fault' ? 0.72 : state === 'unavailable' ? 0.28 : 0.55;
}

export function disposeZones(zones: BoundZone[]): void {
  for (const z of zones) { z.mesh.dispose(); z.material.dispose(); }
}
