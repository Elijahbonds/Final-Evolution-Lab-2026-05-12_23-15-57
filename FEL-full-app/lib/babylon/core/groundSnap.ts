// groundSnap — puts characters ON the court instead of IN it.
//
// WHAT THE LIVE PLAYTEST FOUND
// In Dunk Contest and 1v1, characters render sunk into the court surface —
// cut off around the hip, no feet, no contact shadow. The console is clean;
// spawn reports success:
//     [FEL-SPAWN] dunk: OK (32 meshes, hero at {X: 0 Y: 0 Z: 8.5})
// Y: 0 is the giveaway. The spawn code places the character ROOT at y=0 and
// assumes the model's origin sits at the feet. On this rig it does not — the
// origin is at the hips, so "root at 0" means "hips at 0", which buries the
// legs. It became visible now because M64's ocean court replaced the flat
// venue floor with a surface that actually reads as a plane you can be under.
//
// WHY MEASURE INSTEAD OF SUBTRACTING A CONSTANT
// The obvious fix is `root.position.y += 0.9`. That is a guess tied to one
// rig's proportions, and it silently breaks the moment a taller avatar, a
// crouching pose, or a rescaled character shows up — which is precisely what
// the M65 avatar builder is going to produce. This measures the character's
// actual world-space lowest point and moves the root by the difference, so
// it is correct for any rig, any scale, any pose, with no constant to
// maintain.

import type { AbstractMesh, TransformNode } from '@babylonjs/core';

export interface GroundSnapResult {
  /** How far the character was moved. ~0 means it was already correct. */
  offsetY: number;
  /** Measured world-space lowest point BEFORE the correction. */
  measuredMinY: number;
  ok: boolean;
}

/**
 * Sit `root` on `groundY` by measuring where its skinned meshes actually
 * bottom out.
 *
 * `applySkeleton` matters: a skinned mesh's default bounding box is the BIND
 * pose box, not the posed one. Without it a character in a crouch would be
 * measured as if standing and float. Refreshing with the skeleton costs a
 * few tenths of a millisecond and is done once per spawn.
 */
export function snapToGround(
  root: TransformNode,
  meshes: AbstractMesh[],
  groundY = 0,
  opts: { maxCorrection?: number } = {},
): GroundSnapResult {
  const maxCorrection = opts.maxCorrection ?? 3;

  const skinned = meshes.filter((m) => m.getTotalVertices?.() > 0);
  if (skinned.length === 0) {
    console.warn('[FEL-SPAWN] groundSnap: no renderable meshes to measure — left as-is');
    return { offsetY: 0, measuredMinY: NaN, ok: false };
  }

  root.computeWorldMatrix(true);
  let minY = Number.POSITIVE_INFINITY;
  for (const m of skinned) {
    try {
      m.computeWorldMatrix(true);
      // Babylon 6 AbstractMesh signature is positional (applySkeleton, applyMorph),
      // not the options-object form. applySkeleton:true measures the POSED box.
      m.refreshBoundingInfo(true, true);
      const y = m.getBoundingInfo().boundingBox.minimumWorld.y;
      if (Number.isFinite(y)) minY = Math.min(minY, y);
    } catch {
      // A mesh that refuses to report bounds must not abort the whole snap —
      // the remaining meshes still give a usable measurement.
    }
  }

  if (!Number.isFinite(minY)) {
    console.warn('[FEL-SPAWN] groundSnap: could not measure bounds — left as-is');
    return { offsetY: 0, measuredMinY: NaN, ok: false };
  }

  const offsetY = groundY - minY;

  // A correction bigger than a body height means we measured something wrong
  // (a stray mesh, a bad parent). Refuse rather than teleport the character
  // somewhere absurd — a visibly sunk character is a much smaller bug than
  // one flung out of the venue.
  if (Math.abs(offsetY) > maxCorrection) {
    console.warn(`[FEL-SPAWN] groundSnap: computed ${offsetY.toFixed(2)}m correction — `
      + `beyond the ${maxCorrection}m sanity limit, so NOT applied. Check for a stray mesh under this root.`);
    return { offsetY: 0, measuredMinY: minY, ok: false };
  }

  root.position.y += offsetY;
  root.computeWorldMatrix(true);
  if (Math.abs(offsetY) > 0.01) {
    console.info(`[FEL-SPAWN] groundSnap: "${root.name}" lifted ${offsetY.toFixed(3)}m `
      + `(feet were at y=${minY.toFixed(3)}, ground y=${groundY})`);
  }
  return { offsetY, measuredMinY: minY, ok: true };
}

// WIRING — CharacterLibrary.spawn(), as the LAST step, after the root is
// positioned and the rest pose is applied (pose affects the bounds):
//
//   import { snapToGround } from '../core/groundSnap';
//   snapToGround(rootNode, meshes, courtY);   // courtY is 0 in every venue today
//
// Do it once at spawn, not per frame: the offset is a property of the rig,
// and re-measuring every frame would fight the jump/dunk vertical motion.
