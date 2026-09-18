// HandIK — the carrying arm reaches for the ball (Phase 2, owner decision:
// "code-driven + IK planting + hand IK for the ball"). Same node-space solver
// as the feet: shoulder and elbow receive rotations only, blended by weight so
// the clip's arm still reads when the hand is waiting for the ball.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { solveChainInFrame } from './TwoBoneIK';

export interface ArmChain { shoulder: TransformNode; elbow: TransformNode; hand: TransformNode }

export function armChain(skeleton: Skeleton, side: 'Left' | 'Right'): ArmChain | null {
  const shoulder = findBone(skeleton, `${side}Arm`)?.getTransformNode() ?? null;
  const elbow = findBone(skeleton, `${side}ForeArm`)?.getTransformNode() ?? null;
  const hand = findBone(skeleton, `${side}Hand`)?.getTransformNode() ?? null;
  return shoulder && elbow && hand ? { shoulder, elbow, hand } : null;
}

/** Reach the hand (wrist) toward `target` (world), elbow toward `pole`
 *  (world direction: for a dribble, outward and back). Returns the miss. */
export function reachArm(arm: ArmChain, target: Vector3, pole: Vector3, weight = 1): number {
  // solved in the rig's own frame — see TwoBoneIK.solveChainInFrame (handedness)
  return solveChainInFrame(arm.shoulder, arm.elbow, arm.hand, target, pole, weight).miss;
}

// ── DUNK-SOFTS-NAMED (2026-09-08): a reach that stays continuous when the clip's arm points AWAY from the target ──
// The solver's aim is a from-to rotation and its pole a signed twist about the aim axis; both run to ±180° when the arm is
// wound up behind the shoulder (the mocap dunk's wind-up), and at a partial weight a slerp of a ±179° delta flips the arm by
// a full swing in one frame (measured: hand 3.40 → 2.92 m, elbow −0.26 m, one 17 ms frame). shapeReach moves the TARGET
// toward the arm so the aim delta never exceeds `aimCap`, and the POLE toward the elbow's current side so the twist never
// exceeds `poleCap`; both caps fade to nothing as the raw angle nears 180°, where the axis itself is ambiguous.
const DEG = Math.PI / 180;
const smooth = (a: number, b: number, x: number): number => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const angleBetween = (a: Vector3, b: Vector3): number => Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(a, b))));
/** Rotate unit `a` toward unit `b` by `theta` radians (≤ the angle between them), about their common perpendicular. */
function rotateToward(a: Vector3, b: Vector3, theta: number): Vector3 {
  if (theta <= 1e-6) return a.clone();
  let axis = Vector3.Cross(a, b);
  if (axis.lengthSquared() < 1e-8) { axis = Vector3.Cross(a, Vector3.Up()); if (axis.lengthSquared() < 1e-8) axis = Vector3.Cross(a, Vector3.Right()); }
  return a.applyRotationQuaternionToRef(Quaternion.RotationAxis(axis.normalize(), theta), new Vector3()).normalize();
}
export interface ReachShape { target: Vector3; pole: Vector3 }
/** The target and pole a partial-weight reach can follow without a flip: the aim from the arm's current line capped at
 *  `aimCap`, the pole from the elbow's current side capped at `poleCap`, both fading out between `fadeFrom` and 175°. */
export function shapeReach(shoulder: Vector3, elbow: Vector3, hand: Vector3, target: Vector3, pole: Vector3, aimCap = 150 * DEG, poleCap = 90 * DEG, fadeFrom = 120 * DEG, aimFadeFrom = 150 * DEG): ReachShape {
  const toT = target.subtract(shoulder); const dist = toT.length();
  const armDir = hand.subtract(shoulder);
  if (dist < 1e-4 || armDir.lengthSquared() < 1e-8) return { target: target.clone(), pole: pole.clone() };
  const tDir = toT.scale(1 / dist); armDir.normalize();
  const phi = angleBetween(armDir, tDir);
  const theta = Math.min(phi, aimCap * (1 - smooth(aimFadeFrom, 178 * DEG, phi)));
  const tDir2 = rotateToward(armDir, tDir, theta);
  const target2 = shoulder.add(tDir2.scale(dist));
  const elPerp = elbow.subtract(shoulder); elPerp.subtractInPlace(tDir2.scale(Vector3.Dot(elPerp, tDir2)));
  const polePerp = pole.subtract(tDir2.scale(Vector3.Dot(pole, tDir2)));
  if (elPerp.lengthSquared() < 1e-6 || polePerp.lengthSquared() < 1e-6) return { target: target2, pole: pole.clone() };
  elPerp.normalize(); polePerp.normalize();
  const psi = angleBetween(elPerp, polePerp);
  const th2 = Math.min(psi, poleCap * (1 - smooth(fadeFrom, 175 * DEG, psi)));
  return { target: target2, pole: rotateToward(elPerp, polePerp, th2) };
}
