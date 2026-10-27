// CONTACT POSES INSIDE THE STANDOFF (lane/hoops-round2, HOP-04; owner 2026-10-20: "one standoff that matches the rules + contact poses
// (arm bar, forearm on hip, chest-to-chest)"; PLAN-HOOPS-MOTION-13PHASE §5 "No body inside another" and §10 "Hand-check: the forearm
// reaches toward the handler's hip").
//
// The rules' distance does not move (BODY_STANDOFF, the bodies' hard gap). What changes is what the two bodies DO at it: before, both
// played their own clips at 1.10 m as if the other were not there — a defender sliding with both hands in the air, a handler with his
// free arm hanging, chest to chest with no contact read. Now, weighted by the hand-check's eased contactK (hoops/handCheck):
//   FOREARM ON HIP — the defender's arm nearer the handler's ball-side hip reaches for it (the hand-check itself; at the rules' gap the
//                    hip is past an arm's length, so the forearm goes TOWARD it: an owner call in the lane report);
//   ARM BAR        — the handler's free arm (never the ball hand, never during a handle move) comes across in front of his chest,
//                    elbow out, between him and the defender;
//   CHEST TO CHEST — the defender's chest leans into the handler (chestLeanDeg at full contact).
// DRAWN ONLY. The layer writes after every other layer (it mounts last, on onAfterAnimationsObservable) and PUTS BACK every rotation it
// wrote after the frame is drawn (onAfterRenderObservable), so no clip, posture, reach or hinge layer ever reads its writes as a pose
// to build on, and nothing the game decides (contact, contest, steal) reads a bone it moved. Arms are picked by where the shoulders ARE
// (the runtime rig's bone names are mirrored: anim/groupMirror), never by name.
//
// RIG-ADJACENT. GATE 0 is contactPoses.rig.test.ts: the hero GLB through gateContainerRig (22 unprefixed bones), and every bone this
// layer drives found by name on it.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Nullable, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { armChain, type ArmChain } from '../anim/HandIK';
import { solveChainInFrame, frameAbove, chainRotationToRef, localAfterWorldDeltaToRef } from '../anim/TwoBoneIK';
import { boneNode } from '../anim/boneLookup';
import { feel } from '../../feel-panel/feel';   // feel-panel knob hoops.contactChestLeanDeg (lib/feel-panel/knobs.ts)

/** The defender's chest leans into the handler this much at full contact (deg). */
export const CHEST_LEAN_DEG = 7;
/** The hip's lateral offset from the Hips bone toward the ball side (m; the drawn hip, geometry). */
export const HIP_OUT_M = 0.16;
/** The arm bar's forearm sits this far in front of the chest, toward the defender (m; geometry). */
export const ARM_BAR_FWD_M = 0.3;

/** The hand-check arm reaches this share of its length toward a hip it cannot touch (a soft elbow; geometry). */
export const REACH_FRAC = 0.92;
/** The bones the layer drives (GATE 0 checks each on the hero rig). */
export const CONTACT_BONES = ['Hips', 'Spine1', 'Spine2', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const;

export interface ContactBody { skeleton: Skeleton; root: TransformNode }
export interface ContactPair {
  defender: ContactBody;
  handler: ContactBody;
  /** 0..1 — the hand-check's eased contact weight. */
  k: number;
  /** The handler's ball hand as a RIG side ('Left' = rig LeftHand), or null when he has no free arm to bar with (a move, no carry). */
  ballRig: 'Left' | 'Right' | null;
}

interface Rig { arms: ArmChain[]; hips: TransformNode; spine: TransformNode | null; chest: TransformNode | null }
const rigCache = new WeakMap<Skeleton, Rig | null>();
function rigOf(sk: Skeleton): Rig | null {
  if (rigCache.has(sk)) return rigCache.get(sk)!;
  const l = armChain(sk, 'Left'), r = armChain(sk, 'Right'), hips = boneNode(sk, 'Hips');
  const rig = l && r && hips ? { arms: [l, r], hips, spine: boneNode(sk, 'Spine1'), chest: boneNode(sk, 'Spine2') } : null;
  rigCache.set(sk, rig);
  return rig;
}
const wpos = (n: TransformNode, out: Vector3): Vector3 => { n.computeWorldMatrix(true); return out.copyFrom(n.getAbsolutePosition()); };

/** One pose pass on a pair (exported for the rig test). Returns the nodes it wrote (the caller restores them after the draw). */
export function poseContact(p: ContactPair, wrote: TransformNode[] = [], leanDeg = feel('hoops.contactChestLeanDeg', CHEST_LEAN_DEG)): TransformNode[] {
  const k = Math.max(0, Math.min(1, p.k));
  if (k <= 1e-3) return wrote;
  const D = rigOf(p.defender.skeleton), H = rigOf(p.handler.skeleton);
  if (!D || !H) return wrote;
  const dRoot = wpos(p.defender.root, new Vector3()), hRoot = wpos(p.handler.root, new Vector3());
  const toH = hRoot.subtract(dRoot); toH.y = 0; if (toH.lengthSquared() < 1e-6) return wrote; toH.normalize();
  // 1. CHEST TO CHEST — the defender's upper back pitches toward the handler (solved in the rig's frame: no handedness trap)
  if (D.spine && D.chest && leanDeg > 0) {
    const sp = D.spine, frame = frameAbove(sp);
    const inv = frame.getWorldMatrix().clone().invert();
    const a = Vector3.TransformCoordinates(wpos(sp, new Vector3()), inv), b = Vector3.TransformCoordinates(wpos(D.chest, new Vector3()), inv);
    const up = b.subtract(a).normalize(); const dir = Vector3.TransformNormal(toH, inv).normalize();
    const axis = Vector3.Cross(up, dir);
    if (axis.lengthSquared() > 1e-8) {
      const delta = Quaternion.RotationAxis(axis.normalize(), (leanDeg * Math.PI / 180) * k);
      const parent = sp.parent as TransformNode;
      const pRot = parent && parent !== frame ? chainRotationToRef(parent, frame, new Quaternion()) : Quaternion.Identity();
      const nRot = chainRotationToRef(sp, frame, new Quaternion());
      sp.rotationQuaternion = localAfterWorldDeltaToRef(pRot, nRot, delta, new Quaternion());
      sp.computeWorldMatrix(true); wrote.push(sp);
    }
  }
  // the handler's ball-side hip: the hips, out toward the ball hand's shoulder (or toward the defender's side with no ball hand)
  const hip = wpos(H.hips, new Vector3());
  const ballArm = p.ballRig ? H.arms[p.ballRig === 'Left' ? 0 : 1] : null;
  const offArm = p.ballRig ? H.arms[p.ballRig === 'Left' ? 1 : 0] : null;
  let side = new Vector3(-toH.z, 0, toH.x);
  if (ballArm && offArm) { const s = wpos(ballArm.shoulder, new Vector3()).subtract(wpos(offArm.shoulder, new Vector3())); s.y = 0; if (s.lengthSquared() > 1e-6) side = s.normalize(); }
  const hipT = hip.add(side.scale(HIP_OUT_M)).subtract(toH.scale(0.06));   // on the hip's surface, the defender's side of it
  // 2. FOREARM ON HIP — the defender's arm whose shoulder is nearer that hip
  const d0 = wpos(D.arms[0].shoulder, new Vector3()), d1 = wpos(D.arms[1].shoulder, new Vector3());
  const dArm = Vector3.DistanceSquared(d0, hipT) <= Vector3.DistanceSquared(d1, hipT) ? D.arms[0] : D.arms[1];
  const dOut = (dArm === D.arms[0] ? d0.subtract(d1) : d1.subtract(d0)); dOut.y = 0; if (dOut.lengthSquared() > 1e-6) dOut.normalize();
  // At the rules' gap the hip is past an arm's length (measured on the hero: shoulder → hip 1.14 m at BODY_STANDOFF 1.10, the arm
  // 0.48 m to the wrist): the forearm reaches TOWARD it, the elbow kept soft at REACH_FRAC of the arm, never a locked pole of an arm.
  const sh = dArm === D.arms[0] ? d0 : d1;
  const armLen = Vector3.Distance(sh, wpos(dArm.elbow, new Vector3())) + Vector3.Distance(wpos(dArm.elbow, new Vector3()), wpos(dArm.hand, new Vector3()));
  const toHip = hipT.subtract(sh); const far = toHip.length();
  const reachT = far > armLen * REACH_FRAC ? sh.add(toHip.scale(armLen * REACH_FRAC / far)) : hipT;
  solveChainInFrame(dArm.shoulder, dArm.elbow, dArm.hand, reachT, dOut.scale(0.6).add(new Vector3(0, -1, 0)).normalize(), k);
  wrote.push(dArm.shoulder, dArm.elbow);
  // 3. ARM BAR — the handler's free arm across his chest toward the defender, elbow out
  if (offArm && H.chest) {
    const chest = wpos(H.chest, new Vector3());
    const offOut = wpos(offArm.shoulder, new Vector3()).subtract(wpos(ballArm!.shoulder, new Vector3())); offOut.y = 0; if (offOut.lengthSquared() > 1e-6) offOut.normalize();
    const barT = chest.subtract(toH.scale(ARM_BAR_FWD_M)).add(new Vector3(0, -0.12, 0)).add(offOut.scale(0.04));
    solveChainInFrame(offArm.shoulder, offArm.elbow, offArm.hand, barT, offOut.scale(0.8).add(new Vector3(0, -0.4, 0)).normalize(), k * 0.85);
    wrote.push(offArm.shoulder, offArm.elbow);
  }
  return wrote;
}

/**
 * Mount the layer: every frame after the animations (and after every layer mounted before it), pose each pair the mode reports;
 * after the frame is drawn, put every written rotation back. `pairs` is read once a frame.
 */
export function mountContactPoses(scene: Scene, pairs: () => readonly ContactPair[]): { dispose(): void } {
  const saved: { n: TransformNode; ref: Nullable<Quaternion>; q: Quaternion }[] = [];
  const wrote: TransformNode[] = [];
  const pre = scene.onAfterAnimationsObservable.add(() => {
    saved.length = 0;
    const ps = pairs(); if (!ps.length) return;
    for (const p of ps) {
      if (p.k <= 1e-3) continue;
      // remember what is there before the pass writes (a node is saved once, the first time)
      const D = rigOf(p.defender.skeleton), H = rigOf(p.handler.skeleton); if (!D || !H) continue;
      for (const n of [D.spine, D.arms[0].shoulder, D.arms[0].elbow, D.arms[1].shoulder, D.arms[1].elbow, H.arms[0].shoulder, H.arms[0].elbow, H.arms[1].shoulder, H.arms[1].elbow]) {
        if (!n || saved.some((s) => s.n === n)) continue;
        const ref = n.rotationQuaternion; saved.push({ n, ref, q: (ref ?? Quaternion.FromEulerVector(n.rotation)).clone() });
      }
      wrote.length = 0; poseContact(p, wrote);
    }
  });
  const post: Nullable<Observer<Scene>> = scene.onAfterRenderObservable.add(() => {
    for (const s of saved) { if (s.ref) { s.ref.copyFrom(s.q); s.n.rotationQuaternion = s.ref; } else s.n.rotationQuaternion = null; }
    saved.length = 0;
  });
  return { dispose() { scene.onAfterAnimationsObservable.remove(pre); scene.onAfterRenderObservable.remove(post); } };
}
