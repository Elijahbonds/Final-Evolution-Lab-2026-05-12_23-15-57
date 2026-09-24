// HandIK — the carrying arm reaches for the ball (Phase 2, owner decision:
// "code-driven + IK planting + hand IK for the ball"). Same node-space solver
// as the feet: shoulder and elbow receive rotations only, blended by weight so
// the clip's arm still reads when the hand is waiting for the ball.
import { Matrix, Quaternion, Space, Vector3 } from '@babylonjs/core';
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

// ── THE ELBOW'S SWING ROUND THE SHOULDER→HAND LINE (moved here from ballCarry, DUNK MOTION phase 5, 2026-09-23) ───────────
// A two-bone solve is not continuous where the arm nears straight: its pole twist fades in with the elbow's bend over a narrow
// band, so the elbow can jump to the other side of the shoulder→hand line in one frame while the hand holds still — the upper arm
// ROLLS 60–120° in a frame (CLOTHING-SOFT-RESIDUAL C4 found it on the dribble at every catch). The dunk's reach to the rim does
// the same thing near full extension: the motion probe's biggest remaining pops were a 100–110° RightArm roll in one frame with
// the hand and elbow within 2 cm (the eastbay, the clutch, the plain carry-up as the reach came on). After the solve, the
// elbow's swing round that line is limited to `rateDeg` per second from where it was drawn last frame (measured in the
// shoulder's parent frame, so the body's own turn is not a swing). A rotation about that line never moves the hand.
type SwingMemo = { side: Vector3; stamp: number };
const swingMemo = new WeakMap<TransformNode, SwingMemo>();
/** Forget an arm's last drawn elbow side (the reach let go; the next solve starts free). */
export function forgetElbowSwing(arm: ArmChain): void { swingMemo.delete(arm.shoulder); }
/** Call right after solving `arm`: limit the elbow's swing round the shoulder→hand line to `rateDeg`/s. `stamp` counts drawn
 *  frames (a gap of more than one frame starts free). */
export function limitElbowSwing(arm: ArmChain, dt: number, stamp: number, rateDeg: number): void {
  arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
  const parent = arm.shoulder.parent as TransformNode | null;
  const toParent = parent ? parent.getWorldMatrix().clone().invert() : null;
  const inP = (v: Vector3) => (toParent ? Vector3.TransformCoordinates(v, toParent) : v.clone());
  const S = inP(arm.shoulder.getAbsolutePosition()), E = inP(arm.elbow.getAbsolutePosition()), H = inP(arm.hand.getAbsolutePosition());
  const axis = H.subtract(S), al = axis.length();
  if (al < 1e-5) { swingMemo.delete(arm.shoulder); return; }
  axis.scaleInPlace(1 / al);
  const perp = (v: Vector3) => { const p = v.subtract(axis.scale(Vector3.Dot(v, axis))); return p.lengthSquared() > 1e-10 ? p.normalize() : null; };
  let side = perp(E.subtract(S));
  if (!side) { swingMemo.delete(arm.shoulder); return; }
  const memo = swingMemo.get(arm.shoulder), prev = memo && memo.stamp === stamp - 1 && dt > 0 ? perp(memo.side) : null;
  if (prev) {
    const ang = Math.atan2(Vector3.Dot(Vector3.Cross(prev, side), axis), Vector3.Dot(prev, side));
    const maxRad = rateDeg * Math.PI / 180 * dt;
    if (Math.abs(ang) > maxRad) {
      const back = -(ang - Math.sign(ang) * maxRad);
      const worldAxis = parent ? Vector3.TransformNormal(axis, parent.getWorldMatrix()).normalize() : axis;
      arm.shoulder.rotate(worldAxis, back, Space.WORLD);   // about the line through the shoulder and the hand: the hand stays put
      arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
      side = Vector3.TransformNormal(side, Matrix.RotationAxis(axis, back));
    }
  }
  swingMemo.set(arm.shoulder, { side, stamp });
}

// DUNK MOTION phase 8 (2026-09-23; owner: "fix the off arm on all the dunks" · "fix the orientation of the joints"). THE UPPER ARM
// ROLLED 90° ABOUT ITS OWN AXIS IN ONE FRAME with the elbow and the hand still (the off arm reaching across the body to the ball:
// 5600°/s). limitElbowSwing cannot see it — that is a turn about the shoulder→hand line, which moves the elbow; this is the bone
// spinning on itself while the forearm counter-turns so the hand stays, which reads as the skin twisting round the arm. The solver
// aims the arm with a from-to rotation, so its roll is whatever that minimal arc leaves, and the arc's axis flips when the pose it
// starts from points far from the target. After everything has written the arm: the upper arm's roll about its own bone is limited
// to `rateDeg`/s from last drawn frame, and the forearm is counter-turned by exactly the correction, so the elbow, the forearm and
// the hand are where they were drawn. Pure local-space math: qU' = qU ∘ R(axis, −excess), qF' = R(axis, excess) ∘ qF, where axis
// is where the forearm sits on the upper arm (its local position).
// MEASURED, NOT WIRED (p8f): limiting the roll alone moves the discontinuity to the ELBOW — the forearm takes up the difference
// locally and the skin twists there instead (off-forearm spikes 5000–8400°/s). The fix is a hinge: the elbow bends about its own
// axis only, and the roll lives in the upper arm and the forearm's pronation. This stays as that work's building block.
type TwistMemo = { q: Quaternion; stamp: number };
const twistMemo = new WeakMap<TransformNode, TwistMemo>();
/** The roll (radians) of `delta` about unit `axis`: the twist of a swing–twist decomposition. */
export function twistAbout(delta: Quaternion, axis: Vector3): number {
  let w = delta.w, v = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  if (w < 0) { w = -w; v = -v; }
  return 2 * Math.atan2(v, w);
}
/** Call after the arm's last writer this frame. `stamp` counts drawn frames (a gap starts free). Returns the roll removed (rad). */
export function limitArmTwist(arm: ArmChain, dt: number, stamp: number, rateDeg: number): number {
  const u = arm.shoulder, f = arm.elbow;
  const qU = u.rotationQuaternion, qF = f.rotationQuaternion;
  if (!qU || !qF) return 0;
  const memo = twistMemo.get(u);
  let removed = 0;
  if (memo && memo.stamp === stamp - 1 && dt > 0 && f.position.lengthSquared() > 1e-10) {
    const axis = f.position.clone().normalize();                       // the upper arm's own axis, in its local frame
    // this frame's local rotation against last frame's, expressed about the bone's own axis: d = qPrev⁻¹ ∘ qU (local delta)
    const d = Quaternion.Inverse(memo.q).multiply(qU);
    const roll = twistAbout(d, axis), maxRad = (rateDeg * Math.PI / 180) * dt;
    if (Math.abs(roll) > maxRad) {
      removed = roll - Math.sign(roll) * maxRad;
      const fix = Quaternion.RotationAxis(axis, -removed);
      qU.copyFrom(qU.multiply(fix));                                     // the bone turned back on itself: the elbow does not move
      qF.copyFrom(Quaternion.Inverse(fix).multiply(qF));                // the forearm keeps its world pose: the hand does not move
      u.computeWorldMatrix(true); f.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
    }
  }
  twistMemo.set(u, { q: qU.clone(), stamp });
  return removed;
}
/** Forget an arm's last drawn roll (a teleport, a respawn). */
export function forgetArmTwist(arm: ArmChain): void { twistMemo.delete(arm.shoulder); }
