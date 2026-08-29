// restPose — solves the E25 "everything looks T-posed" finding at its real
// source, and does it WITHOUT guessing rotation signs.
//
// THE FINDING (live-verified, M63 sweep): skeletal animation works fine —
// the charge pose is visibly different from idle. What looks like a T-pose
// is the AUTHORED IDLE: `idle_stand` keys the arms only ~8-10° away from
// this rig's arms-out bind pose, so standing still is nearly identical to
// bind. It's a content problem, not a pipeline problem.
//
// THE PROBLEM WITH JUST WRITING "arms down = +72° on Z": which axis and
// which sign brings an arm DOWN is rig-dependent, and guessing wrong makes
// the arms swing UP instead — worse than shipping nothing. So this module
// MEASURES it on the live skeleton instead:
//   solveArmsDown() tries a rotation about each principal axis in both
//   directions, actually applies it, recomputes world matrices, and reads
//   the resulting hand height. The candidate that lowers the hand most (and
//   keeps it out of the torso) wins. The original pose is always restored.
// Deterministic, rig-agnostic, ~1ms once per character spawn.

import { Animation, AnimationGroup, Quaternion, Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';

const D2R = Math.PI / 180;
const FPS = 30;

/** Local-space quaternions, keyed by bone name, that pose the arms naturally. */
export type RestPose = Map<string, Quaternion>;

function nodeOf(skeleton: Skeleton, boneName: string): TransformNode | null {
  return skeleton.bones.find((b) => b.name === boneName)?.getTransformNode() ?? null;
}

/** Measure a node's world position after forcing a matrix refresh. */
function worldPosAfterRefresh(node: TransformNode, root: TransformNode): Vector3 {
  root.computeWorldMatrix(true);
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
}

/**
 * Find the local rotation that swings `armBone` down toward the body.
 * Returns null when the bones aren't present (rig mismatch — caller falls
 * back to the old authored pose rather than breaking).
 */
function solveOneArm(
  skeleton: Skeleton, armName: string, tipName: string, degrees: number, outwardSign: number,
): Quaternion | null {
  const arm = nodeOf(skeleton, armName);
  const tip = nodeOf(skeleton, tipName);
  if (!arm || !tip) return null;

  // walk to a stable ancestor so computeWorldMatrix refreshes the chain
  let root: TransformNode = arm;
  while (root.parent) root = root.parent as TransformNode;

  const original = arm.rotationQuaternion
    ? arm.rotationQuaternion.clone()
    : Quaternion.FromEulerVector(arm.rotation);

  const before = worldPosAfterRefresh(tip, root);
  const rad = degrees * D2R;

  let bestQ: Quaternion | null = null;
  let bestDrop = 0;

  const axes: [string, Vector3][] = [
    ['x', new Vector3(1, 0, 0)],
    ['y', new Vector3(0, 1, 0)],
    ['z', new Vector3(0, 0, 1)],
  ];
  for (const [, axis] of axes) {
    for (const sign of [1, -1]) {
      const delta = Quaternion.RotationAxis(axis, sign * rad);
      // local rotation applied on top of the bind local rotation
      arm.rotationQuaternion = original.multiply(delta);
      const after = worldPosAfterRefresh(tip, root);
      const drop = before.y - after.y;                 // positive = hand went DOWN
      // reject candidates that pull the hand through the body midline
      const inwardOvershoot = Math.sign(before.x) !== 0
        && Math.sign(after.x) !== Math.sign(before.x);
      if (!inwardOvershoot && drop > bestDrop) {
        bestDrop = drop;
        bestQ = original.multiply(delta);
      }
    }
  }

  arm.rotationQuaternion = original;                   // always restore
  worldPosAfterRefresh(tip, root);

  if (!bestQ || bestDrop < 0.05) {
    console.warn(`[FEL-ANIM] restPose: no arms-down solution found for "${armName}" — keeping bind pose`);
    return null;
  }
  // a touch of outward spread so the arms don't clip the ribs
  const spread = Quaternion.RotationAxis(new Vector3(0, 1, 0), outwardSign * 6 * D2R);
  return bestQ.multiply(spread);
}

/**
 * Solve a natural standing pose for this skeleton. `degrees` is how far the
 * upper arms swing from bind toward the body — 72° reads as relaxed on a
 * T-pose rig. Bones absent from the rig are simply skipped.
 */
export function solveArmsDown(skeleton: Skeleton, degrees = 72): RestPose {
  const pose: RestPose = new Map();
  const left = solveOneArm(skeleton, 'LeftArm', 'LeftHand', degrees, +1)
    ?? solveOneArm(skeleton, 'LeftArm', 'LeftForeArm', degrees, +1);
  const right = solveOneArm(skeleton, 'RightArm', 'RightHand', degrees, -1)
    ?? solveOneArm(skeleton, 'RightArm', 'RightForeArm', degrees, -1);
  if (left) pose.set('LeftArm', left);
  if (right) pose.set('RightArm', right);

  // a soft, natural elbow break — small enough to be sign-safe either way
  for (const [fore, sign] of [['LeftForeArm', 1], ['RightForeArm', -1]] as const) {
    if (!nodeOf(skeleton, fore)) continue;
    const n = nodeOf(skeleton, fore)!;
    const base = n.rotationQuaternion ? n.rotationQuaternion.clone() : Quaternion.FromEulerVector(n.rotation);
    pose.set(fore, base.multiply(Quaternion.RotationAxis(new Vector3(0, 1, 0), sign * 14 * D2R)));
  }
  console.info(`[FEL-ANIM] restPose solved for ${pose.size} bone(s): ${[...pose.keys()].join(', ')}`);
  return pose;
}

/** Quaternion offset helper — layer a small Euler wobble onto a rest quat. */
export function withOffset(q: Quaternion, xDeg: number, yDeg: number, zDeg: number): Quaternion {
  return q.multiply(Quaternion.FromEulerAngles(xDeg * D2R, yDeg * D2R, zDeg * D2R));
}

/** Euler degrees → quaternion (matches clipBuilder's convention). */
export function eulerQ(xDeg: number, yDeg: number, zDeg: number): Quaternion {
  return Quaternion.FromEulerAngles(xDeg * D2R, yDeg * D2R, zDeg * D2R);
}

export type QuatKeys = Record<string, [number, Quaternion][]>;

/**
 * Build an AnimationGroup from quaternion keys — the same targeting model as
 * clipBuilder (targets resolved from the LIVE skeleton, so bone-name
 * mismatch is impossible), but it accepts absolute quaternions so a measured
 * rest pose can be used directly.
 */
export function buildQuatClip(
  scene: Scene, skeleton: Skeleton, name: string, durationSec: number, bones: QuatKeys,
  hipsY?: [number, number][],
): AnimationGroup | null {
  const group = new AnimationGroup(name, scene);
  let added = 0;

  for (const [boneName, keys] of Object.entries(bones)) {
    const node = nodeOf(skeleton, boneName);
    if (!node) {
      console.warn(`[FEL-ANIM] buildQuatClip(${name}): bone "${boneName}" not in skeleton`);
      continue;
    }
    const anim = new Animation(
      `${name}.${boneName}.rotq`, 'rotationQuaternion', FPS,
      Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    anim.setKeys(keys.map(([t, q]) => ({ frame: t * FPS, value: q })));
    group.addTargetedAnimation(anim, node);
    added++;
  }

  if (hipsY) {
    const hips = nodeOf(skeleton, 'Hips');
    if (hips) {
      const base = hips.position.clone();
      const anim = new Animation(
        `${name}.Hips.pos`, 'position', FPS,
        Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      anim.setKeys(hipsY.map(([t, y]) => ({ frame: t * FPS, value: new Vector3(base.x, base.y + y, base.z) })));
      group.addTargetedAnimation(anim, hips);
      added++;
    }
  }

  group.normalize(0, durationSec * FPS);
  if (added === 0) { group.dispose(); return null; }
  return group;
}
