// Pure two-bone IK in world space, for planting a foot on linked-node rigs.
//
// Babylon's BoneIKController writes bone matrices directly and, on a glTF rig
// whose bones are linked to TransformNodes, the matrix it composes decomposes
// back into NON-UNIFORM SCALE on the leg (measured 0.94 / 0.85 / 0.91 on the
// forged hero, 2026-09-03) — the "exploded" feet. This solver never touches a
// matrix: it returns world-space rotation DELTAS for the hip and knee nodes,
// which the mount converts to local rotations. Geometry only; no scene.
import { Quaternion, Vector3 } from '@babylonjs/core';

export interface TwoBoneInput {
  /** Hip (root joint) world position. */
  root: Vector3;
  /** Knee (mid joint) world position. */
  mid: Vector3;
  /** Ankle (end effector) world position. */
  end: Vector3;
  /** Where the ankle should be. */
  target: Vector3;
  /** Optional world direction the knee should point toward (e.g. forward). */
  pole?: Vector3;
}

export interface TwoBoneSolution {
  /** World-space rotation delta for the hip node (aim + pole twist). */
  root: Quaternion;
  /** World-space rotation delta for the knee node (bend only, before the aim). */
  mid: Quaternion;
  /** 1 when the target is in reach; <1 when it had to be clamped to the leg's length. */
  reach: number;
}

const EPS = 1e-6;

function qFromTo(a: Vector3, b: Vector3): Quaternion {
  const an = a.normalizeToNew(), bn = b.normalizeToNew();
  const d = Vector3.Dot(an, bn);
  if (d > 1 - EPS) return Quaternion.Identity();
  if (d < -1 + EPS) {
    // opposite: rotate half a turn about any axis perpendicular to a
    let axis = Vector3.Cross(an, Vector3.Up());
    if (axis.lengthSquared() < EPS) axis = Vector3.Cross(an, Vector3.Right());
    return Quaternion.RotationAxis(axis.normalize(), Math.PI);
  }
  const axis = Vector3.Cross(an, bn).normalize();
  return Quaternion.RotationAxis(axis, Math.acos(Math.min(1, Math.max(-1, d))));
}

// Measured (vitest, 2026-09-03): Babylon's a.multiply(b) applies b FIRST, then a
// — the Hamilton order. applyRotationQuaternion mutates its receiver, hence ToRef.
function rotate(v: Vector3, q: Quaternion): Vector3 {
  return v.applyRotationQuaternionToRef(q, new Vector3());
}

/** Solve hip + knee rotation deltas so the ankle lands on `target`. */
export function solveTwoBone(input: TwoBoneInput): TwoBoneSolution {
  const { root, mid, end, target, pole } = input;
  const upper = mid.subtract(root), lower = end.subtract(mid);
  const L1 = upper.length(), L2 = lower.length();
  if (L1 < EPS || L2 < EPS) return { root: Quaternion.Identity(), mid: Quaternion.Identity(), reach: 1 };

  // 1) knee bend so the straight-line root→end length matches root→target
  const toTarget = target.subtract(root);
  const want = toTarget.length();
  const dMin = Math.abs(L1 - L2) + 1e-4, dMax = L1 + L2 - 1e-4;
  const d = Math.min(dMax, Math.max(dMin, want));
  const reach = want > EPS ? Math.min(1, d / want) : 1;
  const cosNeeded = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const thetaNeeded = Math.acos(Math.min(1, Math.max(-1, cosNeeded)));   // interior knee angle
  const toRoot = root.subtract(mid);
  const cosCur = Vector3.Dot(lower, toRoot) / (L2 * L1);
  const thetaCur = Math.acos(Math.min(1, Math.max(-1, cosCur)));
  // bend axis: the knee's own hinge; a straight leg bends toward the pole
  let axis = Vector3.Cross(lower, toRoot);
  if (axis.lengthSquared() < EPS) {
    const hint = pole && pole.lengthSquared() > EPS ? pole : Vector3.Forward();
    axis = Vector3.Cross(lower, hint);
    if (axis.lengthSquared() < EPS) axis = Vector3.Cross(lower, Vector3.Right());
  }
  axis.normalize();
  const qMid = Quaternion.RotationAxis(axis, thetaCur - thetaNeeded);   // + = bend more
  const endBent = mid.add(rotate(lower, qMid));

  // 2) aim the whole chain so the (bent) ankle direction points at the target
  let qRoot = qFromTo(endBent.subtract(root), toTarget.lengthSquared() > EPS ? toTarget : endBent.subtract(root));

  // 3) pole: twist about root→target so the knee faces the pole direction
  if (pole && pole.lengthSquared() > EPS && want > EPS) {
    const ax = toTarget.normalizeToNew();
    const knee = rotate(upper, qRoot);
    const kneePerp = knee.subtract(ax.scale(Vector3.Dot(knee, ax)));
    const polePerp = pole.subtract(ax.scale(Vector3.Dot(pole, ax)));
    // A straight leg has no knee direction: the perpendicular is noise, and a
    // twist about the leg's own axis moves nothing but the foot's toes. Fade
    // the pole in with the bend (measured: an unfaded twist picked a random
    // angle every solve on a leg pulled straight by an out-of-reach target).
    const bend = kneePerp.length() / L1;          // 0 straight … ~1 right angle
    const fade = Math.min(1, Math.max(0, (bend - 0.03) / 0.12));
    if (fade > 0 && polePerp.lengthSquared() > EPS) {
      // signed angle ABOUT THE AIM AXIS — never a from-to rotation, whose
      // opposite-vector branch picks an unrelated axis when the knee points
      // straight away from the pole (measured: a 1 m miss on the test chain)
      const angle = Math.atan2(Vector3.Dot(Vector3.Cross(kneePerp, polePerp), ax), Vector3.Dot(kneePerp, polePerp));
      const twist = Quaternion.RotationAxis(ax, angle * fade);
      qRoot = twist.multiply(qRoot);   // aim first, then the twist
    }
  }
  return { root: qRoot, mid: qMid, reach };
}

/** Forward kinematics for the solution — what the mount (and the tests) use
 *  to check where the knee and ankle land after both deltas are applied.
 *  The knee node inherits the hip's world delta, so its total is root∘mid. */
export function applySolution(input: TwoBoneInput, s: TwoBoneSolution): { mid: Vector3; end: Vector3 } {
  const upper = input.mid.subtract(input.root), lower = input.end.subtract(input.mid);
  const mid = input.root.add(rotate(upper, s.root));
  const end = mid.add(rotate(rotate(lower, s.mid), s.root));
  return { mid, end };
}

/** Convert a world-space rotation delta into the node's new LOCAL rotation.
 *  world = parentWorld.multiply(local) (local applied first); worldNew =
 *  delta.multiply(nodeWorld); so local = parentWorld⁻¹.multiply(worldNew). */
export function localAfterWorldDelta(parentWorld: Quaternion, nodeWorld: Quaternion, delta: Quaternion): Quaternion {
  const worldNew = delta.multiply(nodeWorld);
  return Quaternion.Inverse(parentWorld).multiply(worldNew);
}
