// athleteSide — THE one answer to "which hand is on the athlete's right" and "which hand is away from X" (HOOPS MOTION phase 3,
// 2026-09-25; owner round 2: "right-handed everywhere").
//
// Two frames disagreed. The side pickers (pickLayupSide, pickHookSide, reverseSide, the 1v1 move's "away from him", the rival's
// crossover side) each built the body's right from the root's yaw — (cos yaw, 0, −sin yaw), which IS the right the athlete is
// drawn with (the probe's feet-facing right agrees, AUD) — while every ball attach said rig 'RightHand'. The spawn resets the
// importer's (1, 1, −1) root, so every body renders as its model's mirror image and rig RightHand draws on the athlete's LEFT
// (groupMirror.ts). So a layup "from the right" finished with the inside hand and a hook "away from him" shot with the hand nearer
// him (phase 1: hero ball drawn right on 16 % of held frames). The side is decided HERE, in the drawn frame, and the rig hand that
// renders on that side is read off the rig itself — never assumed from a bone's name.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from './boneLookup';

export type AthleteSide = 'left' | 'right';
export type RigHand = 'LeftHand' | 'RightHand';

/** On the runtime rig (the import's mirror reset at spawn) the rig's LEFT hand renders as the athlete's right. The fallback when a
 *  rig cannot be read (no arms, both shoulders on the centre line). */
export const RIG_HAND_ON_RIGHT: RigHand = 'LeftHand';

export const otherSide = (s: AthleteSide): AthleteSide => (s === 'right' ? 'left' : 'right');
export const otherHand = (h: RigHand): RigHand => (h === 'RightHand' ? 'LeftHand' : 'RightHand');

/** The athlete's right, in the world, for a body whose root faces `yaw` (root rotation.y): the root's +x turned by the yaw. */
export function athleteRight(yaw: number): Vector3 { return new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); }

/** Which side of the athlete a planar world vector points to (+ along athleteRight = right). */
export function sideOfVector(yaw: number, v: { x: number; z: number }): AthleteSide {
  const r = athleteRight(yaw);
  return v.x * r.x + v.z * r.z > 0 ? 'right' : 'left';
}
/** How far to the athlete's right a world point is (metres, − = left), for a body at `pos` facing `yaw`. */
export function lateralOf(pos: { x: number; z: number }, yaw: number, point: { x: number; z: number }): number {
  const r = athleteRight(yaw);
  return (point.x - pos.x) * r.x + (point.z - pos.z) * r.z;
}
/** Which side of the athlete a world point is on. */
export function sideOfPoint(pos: { x: number; z: number }, yaw: number, point: { x: number; z: number }): AthleteSide {
  return lateralOf(pos, yaw, point) > 0 ? 'right' : 'left';
}
/** The side AWAY from a point: the hand that keeps the body between the ball and X. */
export function sideAwayFrom(pos: { x: number; z: number }, yaw: number, point: { x: number; z: number }): AthleteSide {
  return otherSide(sideOfPoint(pos, yaw, point));
}

/**
 * Which rig hand renders on the athlete's `side`. Read ONCE per skeleton off the rig — the arm whose shoulder sits on that side
 * of the root at the first read (a spawn stands square, facing its root's +z) — and cached on the skeleton, so a body turned
 * inside a spin later never re-reads it.
 */
export function rigHandOnSide(skeleton: Skeleton, root: TransformNode, side: AthleteSide): RigHand {
  const onRight = rigHandOnRight(skeleton, root);
  return side === 'right' ? onRight : otherHand(onRight);
}
/** The rig hand drawn on the athlete's right (see rigHandOnSide). */
export function rigHandOnRight(skeleton: Skeleton, root: TransformNode): RigHand {
  if (!skeleton) return RIG_HAND_ON_RIGHT;
  const md = (skeleton.metadata ??= {}) as { felRigHandOnRight?: RigHand };
  if (md.felRigHandOnRight) return md.felRigHandOnRight;
  const read = readRigHandOnRight(skeleton, root);
  if (read) md.felRigHandOnRight = read;
  return read ?? RIG_HAND_ON_RIGHT;
}
/** The athlete's side a rig hand renders on. */
export function sideOfRigHand(skeleton: Skeleton, root: TransformNode, hand: RigHand): AthleteSide {
  return rigHandOnRight(skeleton, root) === hand ? 'right' : 'left';
}

/** The read itself: each shoulder's x in the root's frame. Null when neither shoulder is clearly off the centre line. */
export function readRigHandOnRight(skeleton: Skeleton, root: TransformNode): RigHand | null {
  if (typeof root?.computeWorldMatrix !== 'function' || !Array.isArray(skeleton?.bones)) return null;   // a stub body: no rig to read
  root.computeWorldMatrix(true);
  const inv = Quaternion.Inverse(root.absoluteRotationQuaternion ?? Quaternion.Identity());
  const rp = root.getAbsolutePosition();
  const xOf = (bone: string): number | null => {
    const n = boneNode(skeleton, bone); if (!n) return null;
    n.computeWorldMatrix(true);
    return n.getAbsolutePosition().subtract(rp).applyRotationQuaternion(inv).x;
  };
  const l = xOf('LeftArm'), r = xOf('RightArm');
  if (l == null && r == null) return null;
  const d = (l ?? 0) - (r ?? 0);   // + = the rig's left shoulder is further toward the root's +x (the athlete's right)
  if (Math.abs(d) < 0.02) return null;
  return d > 0 ? 'LeftHand' : 'RightHand';
}
