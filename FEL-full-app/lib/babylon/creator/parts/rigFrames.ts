// Where a part sits: each bone's frame at REST, measured off the rig (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2).
//
// WHY REST, AND WHY MEASURED. A part is placed once and then rides its bone, so its placement has to mean the same thing
// whatever pose the body is in when the doc changes (the Closet preview is mid-idle; a mode applies identity at spawn).
// So it is worked out from the rig's rest matrices, never the live pose. And a bone's own local axes are whatever the
// rig was bound with — accessories.ts learned that the hard way (a chain written in bone-local axes hung on everyone's
// back) — while the kit's root also carries the glTF handedness flip (determinant −1). So nothing here assumes an axis:
// right is read off the hips and shoulders, up off the spine, forward off the feet.
//
// THE FRAME (lib/creator/look/parts.ts says it for players): origin at the bone's joint; y down the bone to its next joint
// (the head and the end bones carry on in their parent's direction, the head straight up); z towards the body's front,
// or the top of the foot for the feet; x the third axis. Left and centre frames are proper rotations of the body's
// axes; a RIGHT bone's frame is reflected, the mirror image of its left twin, so the same numbers land in the mirrored
// place. The mirror copy of any part is the whole placement reflected through the body's midline (`mirror`).
//
// All of it is in ROOT space (the body root's local space), so it is independent of where the body stands or faces,
// computed once per skeleton, and pure maths once the rest matrices are read.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from '../../anim/boneLookup';
import { PART_BONES, type PartBone } from '../../../creator/look/doc';
import { basis } from './geometry';

export interface RigFrames {
  /** the bone's placement frame in root space (rows: x, y, z axes; translation: the joint) */
  frame: Map<PartBone, Matrix>;
  /** inverse of the bone node's rest matrix in root space: root space → the node's local space at rest */
  restInv: Map<PartBone, Matrix>;
  /** reflection through the body's midline, in root space */
  mirror: Matrix;
  /** the body's axes in root space (unit) and the midline point, for probes */
  axes: { right: Vector3; up: Vector3; fwd: Vector3; mid: Vector3 };
}

/** The joint each bone points at. The head and the end bones have none (they carry on, see `dirOf`). */
const CHILD: Partial<Record<PartBone, PartBone>> = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};
/** An end bone carries on in the direction of the bone before it. */
const CARRY: Partial<Record<PartBone, PartBone>> = {
  LeftHand: 'LeftForeArm', RightHand: 'RightForeArm', LeftToeBase: 'LeftFoot', RightToeBase: 'RightFoot',
};
const isFoot = (b: PartBone) => /Foot|ToeBase/.test(b);
const isRight = (b: PartBone) => b.startsWith('Right');

const cache = new WeakMap<Skeleton, RigFrames | null>();

/** The rest matrix of a bone in the space of the skeleton's top bone's parent. */
function restInSkeletonSpace(skeleton: Skeleton, name: string): Matrix | null {
  const b = findBone(skeleton, name);
  if (!b) return null;
  let m = b.getRestMatrix().clone();
  for (let p = b.getParent(); p; p = p.getParent()) m = m.multiply(p.getRestMatrix());
  return m;
}

/** Skeleton space (the top bone's parent node) → root space, from the static nodes in between. */
function skeletonToRoot(skeleton: Skeleton, root: TransformNode): Matrix {
  const top = skeleton.bones.find((b) => !b.getParent());
  const node = top?.getTransformNode() ?? null;
  const parent = node?.parent as TransformNode | null | undefined;
  if (!parent || parent === root) return Matrix.Identity();
  const pw = parent.computeWorldMatrix(true).clone();
  const rw = root.computeWorldMatrix(true).clone();
  return pw.multiply(rw.invert());
}

const norm = (v: Vector3) => { const l = v.length(); return l > 1e-9 ? v.scale(1 / l) : v.clone(); };
const reject = (v: Vector3, n: Vector3) => v.subtract(n.scale(Vector3.Dot(v, n)));

/** The rig's part frames, measured once per skeleton. Null on a rig without the joints a body frame needs. */
export function rigFrames(skeleton: Skeleton, root: TransformNode): RigFrames | null {
  if (cache.has(skeleton)) return cache.get(skeleton) ?? null;
  const toRoot = skeletonToRoot(skeleton, root);
  const rest = new Map<PartBone, Matrix>();
  for (const b of PART_BONES) {
    const m = restInSkeletonSpace(skeleton, b);
    if (m) rest.set(b, m.multiply(toRoot));
  }
  const J = (b: PartBone) => rest.get(b)?.getTranslation() ?? null;
  const need: PartBone[] = ['Hips', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
  if (need.some((b) => !J(b))) { cache.set(skeleton, null); return null; }
  let right = J('RightUpLeg')!.subtract(J('LeftUpLeg')!);
  if (J('RightArm') && J('LeftArm')) right = right.add(J('RightArm')!.subtract(J('LeftArm')!));
  right = norm(right);
  const up = norm(reject(J('Head')!.subtract(J('Hips')!), right));
  const toes = J('LeftToeBase')!.subtract(J('LeftFoot')!).add(J('RightToeBase')!.subtract(J('RightFoot')!));
  const fwd = norm(reject(reject(toes, right), up));
  // the handedness of root space relative to the body's own (right, up, forward): −1 under the glTF flip
  const hand = Math.sign(Vector3.Dot(right, Vector3.Cross(up, fwd))) || 1;
  const mid = J('LeftUpLeg')!.add(J('RightUpLeg')!).scale(0.5);

  const dirOf = (b: PartBone): Vector3 => {
    const j = J(b)!;
    const c = CHILD[b];
    if (c && J(c)) return norm(J(c)!.subtract(j));
    const from = CARRY[b];
    if (from && J(from)) return norm(j.subtract(J(from)!));
    return up.clone();   // the head
  };

  const frame = new Map<PartBone, Matrix>();
  const restInv = new Map<PartBone, Matrix>();
  for (const [b, m] of rest) {
    const y = dirOf(b);
    let hint = isFoot(b) ? up : fwd;
    if (Math.abs(Vector3.Dot(y, hint)) > 0.9) hint = isFoot(b) ? fwd : up;
    const z = norm(reject(hint, y));
    const x = norm(Vector3.Cross(y, z)).scale(hand * (isRight(b) ? -1 : 1));
    const j = J(b)!;
    frame.set(b, basis([x.x, x.y, x.z], [y.x, y.y, y.z], [z.x, z.y, z.z], [j.x, j.y, j.z]));
    restInv.set(b, m.clone().invert());
  }

  // reflection through the plane at `mid` with normal `right`: v' = v − 2((v − mid)·n)n
  const n = right, d = 2 * Vector3.Dot(mid, n);
  const mirror = Matrix.FromValues(
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
    d * n.x, d * n.y, d * n.z, 1,
  );
  const out: RigFrames = { frame, restInv, mirror, axes: { right, up, fwd, mid } };
  cache.set(skeleton, out);
  return out;
}
