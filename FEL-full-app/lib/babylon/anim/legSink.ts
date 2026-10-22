// legSink — LOWER THE HIPS, KEEP THE FEET (hoops-dip, 2026-10-20). The one rig operation the dip (moveDip) and the stop / start accents
// (locoAccent) share: put the hips at a height over the root (their own x, z kept), then re-solve each leg with the foot planter's two-bone
// IK so its ankle stays where every layer before put it — less `excess` (a clip's rise over the body's own height, whose feet were drawn
// under that height), never under the ankle's floor height, never raised — the knee kept in its own bend plane (forward when straight),
// the foot's turn kept. The HANDS stay where they were too (each arm re-solved from its lowered shoulder, the hand's turn kept): the ball's
// path is the carry's and root-relative, so a hand drawn lower with the body sat in the rising ball's way before the carry's reach took it
// (measured on the rig, dip without this: 1–3 frames of wrist in the ball on a crossover and a momentum cross, −6.4 / −10.5 cm; none at #375).
// Run on the after-animations pass, after the clips and moveLegs, before FootPlanting and the carry.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { plantLeg } from './FootPlanting';
import { armChain, reachArm, type ArmChain } from './HandIK';

export interface SinkRig { hips: TransformNode; root: TransformNode; legs: { hip: TransformNode; knee: TransformNode; ankle: TransformNode }[]; arms: ArmChain[] }

/** The bones the sink moves on this body, or null when it has no hips or not two legs. */
export function sinkRig(skeleton: Skeleton, root: TransformNode): SinkRig | null {
  const hips = findBone(skeleton, 'Hips')?.getTransformNode() ?? null;
  const legs: SinkRig['legs'] = [];
  for (const sd of ['Left', 'Right'] as const) {
    const hip = findBone(skeleton, `${sd}UpLeg`)?.getTransformNode(), knee = findBone(skeleton, `${sd}Leg`)?.getTransformNode(), ankle = findBone(skeleton, `${sd}Foot`)?.getTransformNode();
    if (hip && knee && ankle) legs.push({ hip, knee, ankle });
  }
  const arms = (['Left', 'Right'] as const).map((sd) => armChain(skeleton, sd)).filter((a): a is ArmChain => !!a);
  return hips && legs.length === 2 ? { hips, root, legs, arms } : null;
}

/** Where an ankle goes (its height over the root, pure): where the layers before put it, less the clip's rise over the base (`excess` ≥ 0
 *  only), never under the ankle's floor height — and never raised. */
export function ankleTarget(ankleY: number, excess: number, ankleFloorY: number): number {
  return Math.min(ankleY, Math.max(ankleFloorY, ankleY - Math.max(0, excess)));
}

/** The hips' height and the lower ankle's, over the root, now. */
export function sinkRead(r: SinkRig): { rootY: number; hipsY: number; lowAnkleY: number } {
  r.root.computeWorldMatrix(true); r.hips.computeWorldMatrix(true);
  const rootY = r.root.getAbsolutePosition().y;
  for (const l of r.legs) l.ankle.computeWorldMatrix(true);
  return { rootY, hipsY: r.hips.getAbsolutePosition().y - rootY, lowAnkleY: Math.min(...r.legs.map((l) => l.ankle.getAbsolutePosition().y - rootY)) };
}

const lq = (n: TransformNode): Quaternion => n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
/** The hips to `hipsOverRoot`, the legs re-solved to keep the feet, the arms to keep the hands (see the header). */
export function sinkHipsKeepFeet(r: SinkRig, hipsOverRoot: number, excess: number, ankleFloorY: number): void {
  const rootY = r.root.getAbsolutePosition().y;
  // the foot's turn below the hips: thigh · shin · foot (local chain; Babylon's a.multiply(b) is outer ∘ inner) — kept through the re-solve
  // without decomposing a world rotation (the importer's reflection: TwoBoneIK's note)
  const before = r.legs.map((l) => ({ p: l.ankle.getAbsolutePosition().clone(), chain: lq(l.hip).multiply(lq(l.knee)).multiply(lq(l.ankle)) }));
  const hands = holdHands(r);
  const hp = r.hips.getAbsolutePosition().clone(); hp.y = rootY + hipsOverRoot; r.hips.setAbsolutePosition(hp); r.hips.computeWorldMatrix(true);
  const yaw = r.root.absoluteRotationQuaternion ? r.root.absoluteRotationQuaternion.toEulerAngles().y : r.root.rotation.y;
  const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  r.legs.forEach((l, i) => {
    for (const n of [l.hip, l.knee, l.ankle]) n.computeWorldMatrix(true);
    const p0 = before[i].p;
    const tgt = new Vector3(p0.x, rootY + ankleTarget(p0.y - rootY, excess, ankleFloorY), p0.z);
    const hipP = l.hip.getAbsolutePosition(), kneeP = l.knee.getAbsolutePosition();
    const bend = kneeP.subtract(hipP.add(tgt).scale(0.5));
    plantLeg(l.hip, l.knee, l.ankle, tgt, bend.lengthSquared() > 1e-4 ? bend.normalize() : fwd);
    // the foot keeps its turn (the hips only moved, so its turn under the hips is its turn in the world)
    l.ankle.rotationQuaternion = Quaternion.Inverse(lq(l.hip).multiply(lq(l.knee))).multiply(before[i].chain);
    l.ankle.computeWorldMatrix(true);
  });
  restoreHands(r, hands, true);
}

export interface HandHold { p: Vector3; chain: Quaternion }
/** Where each hand is now, and its turn under the shoulder (restoreHands puts them back). */
export function holdHands(r: SinkRig): HandHold[] {
  return r.arms.map((a) => { a.hand.computeWorldMatrix(true); return { p: a.hand.getAbsolutePosition().clone(), chain: lq(a.shoulder).multiply(lq(a.elbow)).multiply(lq(a.hand)) }; });
}
/** Each hand back where holdHands found it: the arm re-solved from wherever its shoulder is now, the elbow kept in its own bend plane (back
 *  when straight). `keepTurn`: the hand's turn under the shoulder too — its world turn as well when the frame above the shoulder has only
 *  moved (the sink); after a turn of the chest (a lean) the hand turns with it. */
export function restoreHands(r: SinkRig, held: HandHold[], keepTurn: boolean): void {
  const yaw = r.root.absoluteRotationQuaternion ? r.root.absoluteRotationQuaternion.toEulerAngles().y : r.root.rotation.y;
  const back = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  r.arms.forEach((a, i) => {
    const h = held[i]; if (!h) return;
    for (const n of [a.shoulder, a.elbow, a.hand]) n.computeWorldMatrix(true);
    const sP = a.shoulder.getAbsolutePosition(), eP = a.elbow.getAbsolutePosition();
    const bend = eP.subtract(sP.add(h.p).scale(0.5));
    reachArm(a, h.p, bend.lengthSquared() > 1e-4 ? bend.normalize() : back, 1);
    if (keepTurn) a.hand.rotationQuaternion = Quaternion.Inverse(lq(a.shoulder).multiply(lq(a.elbow))).multiply(h.chain);
    a.hand.computeWorldMatrix(true);
  });
}
