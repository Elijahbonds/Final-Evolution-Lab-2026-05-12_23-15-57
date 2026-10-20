// legSink — LOWER THE HIPS, KEEP THE FEET (hoops-dip, 2026-10-20). The one rig operation the dip (moveDip) and the stop / start accents
// (locoAccent) share: put the hips at a height over the root (their own x, z kept), then re-solve each leg with the foot planter's two-bone
// IK so its ankle stays where every layer before put it — less `excess` (a clip's rise over the body's own height, whose feet were drawn
// under that height), never under the ankle's floor height, never raised — the knee kept in its own bend plane (forward when straight),
// the foot's turn kept. Run on the after-animations pass, after the clips, moveLegs and FootPlanting.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { plantLeg } from './FootPlanting';

export interface SinkRig { hips: TransformNode; root: TransformNode; legs: { hip: TransformNode; knee: TransformNode; ankle: TransformNode }[] }

/** The bones the sink moves on this body, or null when it has no hips or not two legs. */
export function sinkRig(skeleton: Skeleton, root: TransformNode): SinkRig | null {
  const hips = findBone(skeleton, 'Hips')?.getTransformNode() ?? null;
  const legs: SinkRig['legs'] = [];
  for (const sd of ['Left', 'Right'] as const) {
    const hip = findBone(skeleton, `${sd}UpLeg`)?.getTransformNode(), knee = findBone(skeleton, `${sd}Leg`)?.getTransformNode(), ankle = findBone(skeleton, `${sd}Foot`)?.getTransformNode();
    if (hip && knee && ankle) legs.push({ hip, knee, ankle });
  }
  return hips && legs.length === 2 ? { hips, root, legs } : null;
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
/** The hips to `hipsOverRoot`, the legs re-solved to keep the feet (see the header). */
export function sinkHipsKeepFeet(r: SinkRig, hipsOverRoot: number, excess: number, ankleFloorY: number): void {
  const rootY = r.root.getAbsolutePosition().y;
  // the foot's turn below the hips: thigh · shin · foot (local chain; Babylon's a.multiply(b) is outer ∘ inner) — kept through the re-solve
  // without decomposing a world rotation (the importer's reflection: TwoBoneIK's note)
  const before = r.legs.map((l) => ({ p: l.ankle.getAbsolutePosition().clone(), chain: lq(l.hip).multiply(lq(l.knee)).multiply(lq(l.ankle)) }));
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
}
