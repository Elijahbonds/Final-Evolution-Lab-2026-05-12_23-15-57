// poseClip — body-independent clip authoring (ship pass 3, rung 1; owner
// sign-off 2026-09-03, RIG-ADJACENT).
//
// An authored clip used to store upper-arm/forearm quaternion OFFSETS solved
// on one body's bone axes; a new body invalidated all of them (18/24 rig tests
// failed on the MPFB2 candidate). A pose clip stores what the author actually
// meant: per key, TORSO rotations (euler degrees, body-independent) and where
// the HANDS and FEET are, in body-local metres. At build time, on the LIVE
// skeleton, each key's torso is posed, each hand/foot target is reached with
// the node-space two-bone solver we already ship, and the resulting LOCAL
// rotations become the quaternion keys. Targets scale with the body (Hips
// height), so a 1.66 m body and a 1.80 m body both make the same movement.
// Root translation is never carried — movement is code-driven.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from './boneLookup';
import { buildQuatClip, eulerQ, type QuatKeys } from './restPose';
import { armChain, reachArm } from './HandIK';
import { chainRotation, frameAbove } from './TwoBoneIK';
import { plantLeg } from './FootPlanting';

export type Deg3 = [number, number, number];
export interface PoseKey {
  t: number;
  /** Euler degrees per torso/leg bone (Hips, Spine, Spine1, Spine2, Neck, Head, LeftUpLeg, LeftLeg, …). Absolute, like eulerQ keys. */
  bones?: Record<string, Deg3>;
  /** Wrist targets, body-local metres (+x right, +y up, +z forward), authored for REF_HIPS_Y. */
  hands?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Elbow pole directions (body-local); default: out to the side and back. */
  poles?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Ankle targets, body-local metres. */
  feet?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Hips vertical offset (metres) — the only translation a clip carries. */
  hipsY?: number;
}
/** Hips height the targets were authored against (the forge hero). */
export const REF_HIPS_Y = 0.96;
/** Limb lengths the targets were authored against (the forge hero, measured 2026-09-03):
 *  shoulder→elbow→wrist 0.54 m, hip→knee→ankle 0.82 m. A body with shorter arms
 *  gets every hand target pulled toward its shoulder by the ratio, so the arm
 *  ends up in the same configuration instead of stretching short (the MPFB2
 *  candidate's arm is 0.486 m at 0.914 m hips: height alone under-shrinks). */
export const REF_ARM_LEN = 0.54;
export const REF_LEG_LEN = 0.82;

const ARM_BONES = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];
const LEG_BONES = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

export function buildPoseClip(scene: Scene, sk: Skeleton, name: string, duration: number, keys: PoseKey[]): AnimationGroup | null {
  // snapshot bind so every key is solved from the same start and the rig is left untouched
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) nodes.set(b.name.replace(/^mixamorig:?/, ''), n); }
  // Bind comes from the skeleton's REST matrices, not from where the bones
  // happen to be: a clip built while the rig is still posed by a previous clip
  // would otherwise bake that pose in as its zero (measured 2026-09-03: the
  // over-the-top pitch built after a follow-through reached 1.43 m, not 1.83).
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  for (const b of sk.bones) {
    const n = b.getTransformNode(); if (!n) continue;
    const p = new Vector3(), q = new Quaternion(), sc = new Vector3();
    if (b.getRestMatrix().decompose(sc, q, p)) bind.set(n, { p, q });
    else bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation)).clone() });
  }
  // World matrices refresh PARENT-FIRST. A forced compute on a node reads its
  // parent's CACHED matrix (the arm-solver lesson, 2026-09-03), so refreshing
  // in arbitrary order leaves the chest and shoulders stale under a new torso
  // pose and every reach lands short. No scene.render(): this runs at spawn.
  const hips = nodes.get('Hips'); if (!hips) return null;
  const top = (hips.parent as TransformNode | null) ?? hips;
  const refresh = () => { const walk = (n: TransformNode) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); }; walk(top); };
  const restore = () => { for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } refresh(); };
  const root = hips.parent as TransformNode | null;
  refresh();
  // Degrees are portable only if they mean the same thing on every rig. On the
  // forge hero every bone's bind rotation is identity, so writing eulerQ(deg)
  // into the local rotation rotated the bone about its parent's world-aligned
  // axes. The MPFB2 rig's bones carry bind orientations (measured 2026-09-03:
  // the same thigh degrees swung the kicking leg FORWARD), so a key is applied
  // as that same rotation — about the parent's bind axes, from bind — via the
  // bind chain rotations captured here, before any key moves anything.
  const frame = frameAbove(hips);
  const bindParentRot = new Map<TransformNode, Quaternion>();
  for (const n of nodes.values()) { const par = n.parent as TransformNode | null; bindParentRot.set(n, par && par !== frame ? chainRotation(par, frame) : Quaternion.Identity()); }
  const keyed = (n: TransformNode, deg: Deg3): Quaternion => {
    const b = bind.get(n)!.q; const Rp = bindParentRot.get(n)!;
    // Babylon: a.multiply(b) applies b first. Conjugate the delta into the parent's frame, then apply it after the bind rotation.
    const inParent = Rp.clone().invert().multiply(eulerQ(...deg)).multiply(Rp);
    return inParent.multiply(b);
  };
  const scale = hips.getAbsolutePosition().y / REF_HIPS_Y || 1;          // body height ratio
  // Targets are WORLD-AXIS offsets from the root's position — the same frame the
  // rig tests and the arm-solver tool always measured in (+x = the hero's right
  // at bind). The root's import matrix carries a handedness mirror, so pushing
  // targets through it would swap left and right (measured: the golf top landed
  // over the wrong shoulder).
  const rootPos = root ? root.getAbsolutePosition().clone() : Vector3.Zero();
  const toWorld = (v: [number, number, number]) => rootPos.add(new Vector3(v[0] * scale, v[1] * scale, v[2] * scale));
  const arms = { Left: armChain(sk, 'Left'), Right: armChain(sk, 'Right') };
  const legs = { Left: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], Right: ['RightUpLeg', 'RightLeg', 'RightFoot'] } as const;
  const dist = (a: TransformNode, b: TransformNode) => Vector3.Distance(a.getAbsolutePosition(), b.getAbsolutePosition());
  const armRatio = (side: 'Left' | 'Right') => { const a = arms[side]; return a ? (dist(a.shoulder, a.elbow) + dist(a.elbow, a.hand)) / REF_ARM_LEN : 1; };
  const legRatio = (side: 'Left' | 'Right') => { const [h, k, a] = legs[side].map((b) => nodes.get(b)); return h && k && a ? (dist(h, k) + dist(k, a)) / REF_LEG_LEN : 1; };
  const ratios = { arm: { Left: armRatio('Left'), Right: armRatio('Right') }, leg: { Left: legRatio('Left'), Right: legRatio('Right') } };
  // A limb target in reference proportions, re-expressed for this body: the
  // offset from the joint root (as the reference body would have had it, i.e.
  // this body's posed joint un-scaled by height) times the limb-length ratio.
  const forLimb = (tgt: [number, number, number], joint: TransformNode, ratio: number) => {
    joint.computeWorldMatrix(true);
    const j = joint.getAbsolutePosition();
    const jRef = rootPos.add(j.subtract(rootPos).scale(1 / scale));
    const authored = rootPos.add(new Vector3(...tgt));
    return j.add(authored.subtract(jRef).scale(ratio));
  };

  const out: QuatKeys = {}; const hipsY: [number, number][] = [];
  const push = (bone: string, t: number, q: Quaternion) => { (out[bone] ??= []).push([t, q.clone()]); };
  for (const key of keys) {
    restore();
    // 1) torso and any explicit bone keys
    for (const [bone, deg] of Object.entries(key.bones ?? {})) { const n = nodes.get(bone); if (n) n.rotationQuaternion = keyed(n, deg); }
    refresh();
    // 2) hands
    for (const side of ['Left', 'Right'] as const) {
      const tgt = key.hands?.[side]; const arm = arms[side]; if (!tgt || !arm) continue;
      const pole = key.poles?.[side] ?? [side === 'Left' ? -0.7 : 0.7, -0.2, -0.5];
      reachArm(arm, forLimb(tgt, arm.shoulder, ratios.arm[side]), new Vector3(...pole), 1);   // pole is a world direction too
      refresh();
    }
    // 3) feet
    for (const side of ['Left', 'Right'] as const) {
      const tgt = key.feet?.[side]; if (!tgt) continue;
      const [h, k, a] = legs[side].map((b) => nodes.get(b)); if (!h || !k || !a) continue;
      plantLeg(h, k, a, forLimb(tgt, h, ratios.leg[side]), Vector3.Forward());
      refresh();
    }
    // 4) read back local rotations for every bone the key touched
    const touched = new Set<string>(Object.keys(key.bones ?? {}));
    for (const side of ['Left', 'Right'] as const) { if (key.hands?.[side]) for (const b of ARM_BONES) if (b.startsWith(side)) touched.add(b); if (key.feet?.[side]) for (const b of LEG_BONES) if (b.startsWith(side)) touched.add(b); }
    for (const bone of touched) { const n = nodes.get(bone); if (n?.rotationQuaternion) push(bone, key.t, n.rotationQuaternion); }
    if (key.hipsY != null) hipsY.push([key.t, key.hipsY * scale]);
  }
  restore();
  return buildQuatClip(scene, sk, name, duration, out, hipsY.length ? hipsY : undefined);
}
