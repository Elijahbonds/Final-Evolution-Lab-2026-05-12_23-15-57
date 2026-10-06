// Part placement maths (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2). Pure: matrices in, matrices out.
//
//   Q  = the part in its bone's frame: scale (the squash), then rotation (degrees, Babylon's x/y/z order), then pos.
//   P  = Q · frame(bone)              — the part in root space, at rest.
//   P' = P · mirror                   — its mirror image through the body's midline (the `mirror` copy).
//   L  = P · restInv(bone)            — the part in its bone NODE's local space: what is baked into the vertices, so the
//                                       merged mesh parented to the node needs no transform of its own and rides the bone.
// Row vectors throughout (Babylon's convention): a point is transformed as v · M.

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { mirrorBone, type CreatorPart, type PartBone } from '../../../creator/look/doc';
import type { RigFrames } from './rigFrames';

const DEG = Math.PI / 180;

/** The part's matrix in its bone's frame. */
export function partMatrix(p: Pick<CreatorPart, 'pos' | 'rot' | 'scale'>): Matrix {
  const q = Quaternion.RotationYawPitchRoll(p.rot[1] * DEG, p.rot[0] * DEG, p.rot[2] * DEG);
  return Matrix.Compose(new Vector3(p.scale[0], p.scale[1], p.scale[2]), q, new Vector3(p.pos[0], p.pos[1], p.pos[2]));
}

/** The bone a placement hangs on: its own, or the opposite side's for the mirror copy. */
export const placementBone = (p: Pick<CreatorPart, 'bone'>, mirrored: boolean): PartBone => (mirrored ? mirrorBone(p.bone) : p.bone);

/** The part (or its mirror copy) in root space, at rest; null when the rig lacks its bone. */
export function rootMatrix(p: Pick<CreatorPart, 'bone' | 'pos' | 'rot' | 'scale'>, frames: RigFrames, mirrored: boolean): Matrix | null {
  const f = frames.frame.get(p.bone);
  if (!f) return null;
  const P = partMatrix(p).multiply(f);
  return mirrored ? P.multiply(frames.mirror) : P;
}

/** The part (or its mirror copy) in its bone node's local space — what renderParts bakes. */
export function nodeMatrix(p: Pick<CreatorPart, 'bone' | 'pos' | 'rot' | 'scale'>, frames: RigFrames, mirrored: boolean): { bone: PartBone; m: Matrix } | null {
  const bone = placementBone(p, mirrored);
  const P = rootMatrix(p, frames, mirrored);
  const inv = frames.restInv.get(bone);
  if (!P || !inv) return null;
  return { bone, m: P.multiply(inv) };
}
