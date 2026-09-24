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
import { frameAbove } from './TwoBoneIK';
import { bindFrame } from './bindFrame';
import { plantLeg } from './FootPlanting';
import { smoothByDefault, smoothQuatKeys, smoothScalarKeys, type Q4 } from './smoothKeys';

export type Deg3 = [number, number, number];
export interface PoseKey {
  t: number;
  /** Euler degrees per torso/leg bone (Hips, Spine, Spine1, Spine2, Neck, Head, LeftUpLeg, LeftLeg, …). Absolute, like eulerQ keys. */
  bones?: Record<string, Deg3>;
  /** Wrist targets, body-local metres (+x right, +y up, +z forward), authored for REF_HIPS_Y. */
  hands?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /**
   * Wrist targets measured FROM THE POSED SHOULDER, body-local metres, in REF_ARM_LEN proportions (VENICE-SKATE-THPS,
   * 2026-09-09). `hands` is absolute-from-the-root, which is right for a reach at a fixed thing in the world (the rim,
   * the ball) — but wrong for a stance, where the author means "hands out to the sides", and the shoulder has already
   * been carried somewhere else by the torso keys (the board stance yaws the hips 74°). Authoring the offset makes the
   * elbow angle a direct function of its LENGTH: |rel| = REF_ARM_LEN is a locked straight arm, and each 0.04 m shorter
   * bends it roughly another 10°. Wins over `hands` for the same side when both are given.
   */
  handsRel?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Elbow pole directions (body-local); default: out to the side and back. */
  poles?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Ankle targets, body-local metres. */
  feet?: { Left?: [number, number, number]; Right?: [number, number, number] };
  /** Hips vertical offset (metres) — the only translation a clip carries. */
  hipsY?: number;
  /** A smooth clip eases to a stop on this key (zero velocity in and out): the top of a wind-up, a held accent. */
  hold?: boolean;
}
export interface PoseClipOpts {
  /** Resample the keys as a joint-space cubic (smoothKeys). Default: the dunk family (smoothByDefault). */
  smooth?: boolean;
  /** [1 2 1] passes over the keys first (a capture's jitter). Default: from smoothByDefault. */
  prefilter?: number;
}
/** The sample rate a smoothed clip is written at. */
export const SMOOTH_FPS = 30;
/** Hips height the targets were authored against (the forge hero). */
export const REF_HIPS_Y = 0.96;
/** The forge hero's hip JOINTS (mean UpLeg height) at bind — the span a body is sized by (rig-measured 0.910). */
export const REF_HIP_JOINT_Y = 0.91;
/** Limb lengths the targets were authored against (the forge hero, measured 2026-09-03):
 *  shoulder→elbow→wrist 0.54 m, hip→knee→ankle 0.82 m. A body with shorter arms
 *  gets every hand target pulled toward its shoulder by the ratio, so the arm
 *  ends up in the same configuration instead of stretching short (the MPFB2
 *  candidate's arm is 0.486 m at 0.914 m hips: height alone under-shrinks). */
export const REF_ARM_LEN = 0.54;
export const REF_LEG_LEN = 0.82;

const ARM_BONES = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];
const LEG_BONES = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

export function buildPoseClip(scene: Scene, sk: Skeleton, name: string, duration: number, keys: PoseKey[], opts: PoseClipOpts = {}): AnimationGroup | null {
  // snapshot bind so every key is solved from the same start and the rig is left untouched
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) nodes.set(b.name.replace(/^mixamorig:?/, ''), n); }
  // Bind (rest matrices) and the meaning of a degree key come from the shared bind frame — see bindFrame.ts.
  const bf = bindFrame(sk);
  const bind = bf.bind;
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
  const frame = frameAbove(hips);
  const keyed = (n: TransformNode, deg: Deg3): Quaternion => bf.keyed(n, deg);
  // Body height ratio = the hips' height ABOVE THE ROOT. This read the hips' absolute y, so a body spawned above y = 0 built
  // every clip over-scaled: the dancer stands on a 0.7 m podium and every hand target came out 1.73× — the idle's hanging
  // hands sat at its face for the whole routine (ANIM-READABILITY creative, 2026-09-07). Identical for a body at y = 0.
  const rootY = root ? root.getAbsolutePosition().y : 0;
  // EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): the body is sized by its HIP JOINTS (the UpLeg bones the legs hang from),
  // not the Hips bone. The female kit body — and nova / ember / frost / sage, baked from it — puts the Hips bone 8 cm lower
  // than the male's over IDENTICAL legs (Hips 0.878 vs 0.958, UpLegs 0.910 on both, leg 0.844 on both; rig-measured),
  // so every clip on a female body was built at 0.915× and its crouch landed the ankles 9 cm under the floor. On the
  // forge hero, the male kit and the scan the two measures agree (0.910 / 0.910 = 0.958 / 0.96 within 0.2%).
  const upLegs = ['LeftUpLeg', 'RightUpLeg'].map((n) => nodes.get(n)).filter((n): n is TransformNode => !!n);
  const scale = upLegs.length
    ? (upLegs.reduce((a, n) => a + n.getAbsolutePosition().y, 0) / upLegs.length - rootY) / REF_HIP_JOINT_Y || 1
    : (hips.getAbsolutePosition().y - rootY) / REF_HIPS_Y || 1;
  // Targets are WORLD-AXIS offsets from the root's position — the same frame the
  // rig tests and the arm-solver tool always measured in (+x = the hero's right
  // at bind). The root's import matrix carries a handedness mirror, so pushing
  // targets through it would swap left and right (measured: the golf top landed
  // over the wrong shoulder).
  const rootPos = root ? root.getAbsolutePosition().clone() : Vector3.Zero();
  const arms = { Left: armChain(sk, 'Left'), Right: armChain(sk, 'Right') };
  const legs = { Left: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], Right: ['RightUpLeg', 'RightLeg', 'RightFoot'] } as const;
  const dist = (a: TransformNode, b: TransformNode) => Vector3.Distance(a.getAbsolutePosition(), b.getAbsolutePosition());
  // DUNK-POSTURE-LEGS (2026-09-08): the targets are BODY-frame metres (+x = the hero's right, +z = his front), and the
  // body's frame is read off the rig at bind — the hip line for RIGHT, the toes for FRONT, world up for UP — not assumed
  // to be the world axes. A spawn that yaws the root before the clips build (every mode that faces the hero at −z:
  // yawRad π) had put every hand and foot target on WORLD +z = BEHIND the body, and the leg solver's knee pole behind it
  // with them: measured on the live dunk hero, the mocap's ankles landed at the authored z NEGATED (a heel kick authored
  // behind the body hung in front, the knees bent BACKWARD through the whole flight), the gather's "arms swung back"
  // swung forward, the finishes' "crunch down and through" went behind the head. The node rig tests (no yaw, the
  // importer's mirror still on the root) resolve to the identity frame, so their convention is unchanged.
  const bodyFrame = (() => {
    const up = Vector3.Up();
    const lul = nodes.get('LeftUpLeg'), rul = nodes.get('RightUpLeg');
    let right = lul && rul ? rul.getAbsolutePosition().subtract(lul.getAbsolutePosition()) : new Vector3(1, 0, 0);
    right.y = 0; if (right.lengthSquared() < 1e-6) right = new Vector3(1, 0, 0); right.normalize();
    const det = frame.getWorldMatrix().determinant();
    let front = Vector3.Cross(up, right).scale(det < 0 ? -1 : 1);   // a right-handed body: up × right = front, mirrored under a reflected root
    const toes: Vector3[] = [];
    for (const side of ['Left', 'Right'] as const) { const f = nodes.get(`${side}Foot`), t = nodes.get(`${side}ToeBase`); if (f && t) { const d = t.getAbsolutePosition().subtract(f.getAbsolutePosition()); d.y = 0; if (d.lengthSquared() > 1e-4) toes.push(d.normalize()); } }
    if (toes.length) { const toe = toes.reduce((a, b) => a.add(b), Vector3.Zero()).normalize(); if (Vector3.Dot(toe, front) < 0) front = front.scale(-1); }   // the toes settle the sign; the cross product settles the axis
    front.normalize();
    return { right, up, front };
  })();
  /** A body-frame offset (or direction) expressed in world axes. */
  const inBody = (v: [number, number, number]) => bodyFrame.right.scale(v[0]).addInPlace(bodyFrame.up.scale(v[1])).addInPlace(bodyFrame.front.scale(v[2]));
  const toWorld = (v: [number, number, number]) => rootPos.add(inBody([v[0] * scale, v[1] * scale, v[2] * scale]));
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
    const authored = rootPos.add(inBody(tgt));
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
      const rel = key.handsRel?.[side]; const tgt = key.hands?.[side]; const arm = arms[side];
      if (!arm || (!rel && !tgt)) continue;
      const pole = key.poles?.[side] ?? [side === 'Left' ? -0.7 : 0.7, -0.2, -0.5];
      let world: Vector3;
      if (rel) {
        const r = ratios.arm[side];
        arm.shoulder.computeWorldMatrix(true);
        world = arm.shoulder.getAbsolutePosition().add(inBody([rel[0] * r, rel[1] * r, rel[2] * r]));
      } else world = forLimb(tgt as [number, number, number], arm.shoulder, ratios.arm[side]);
      reachArm(arm, world, inBody(pole), 1);   // the pole is a body-frame direction too
      refresh();
    }
    // 3) feet
    for (const side of ['Left', 'Right'] as const) {
      const tgt = key.feet?.[side]; if (!tgt) continue;
      const [h, k, a] = legs[side].map((b) => nodes.get(b)); if (!h || !k || !a) continue;
      plantLeg(h, k, a, forLimb(tgt, h, ratios.leg[side]), bodyFrame.front);   // the knee toward the body's front
      refresh();
    }
    // 4) read back local rotations for every bone the key touched
    const touched = new Set<string>(Object.keys(key.bones ?? {}));
    for (const side of ['Left', 'Right'] as const) { if (key.hands?.[side] || key.handsRel?.[side]) for (const b of ARM_BONES) if (b.startsWith(side)) touched.add(b); if (key.feet?.[side]) for (const b of LEG_BONES) if (b.startsWith(side)) touched.add(b); }
    for (const bone of touched) { const n = nodes.get(bone); if (n?.rotationQuaternion) push(bone, key.t, n.rotationQuaternion); }
    if (key.hipsY != null) hipsY.push([key.t, key.hipsY * scale]);
  }
  restore();
  // DUNK MOTION phase 2: the joint-space cubic between the poses (slow-in / slow-out, velocity continuous through a key,
  // a pose reached and never overshot) instead of Babylon's constant-speed slerp from key to key
  const byDefault = smoothByDefault(name);
  if (opts.smooth ?? byDefault != null) {
    const so = { fps: SMOOTH_FPS, duration, holds: keys.filter((k) => k.hold).map((k) => k.t), prefilter: opts.prefilter ?? byDefault ?? 0 };
    for (const bone of Object.keys(out)) {
      const dense = smoothQuatKeys(out[bone].map(([t, q]) => ({ t, q: [q.x, q.y, q.z, q.w] as Q4 })), so);
      out[bone] = dense.map((k) => [k.t, new Quaternion(k.q[0], k.q[1], k.q[2], k.q[3])]);
    }
    if (hipsY.length > 1) { const dense = smoothScalarKeys(hipsY.map(([t, v]) => ({ t, v })), so); hipsY.length = 0; for (const k of dense) hipsY.push([k.t, k.v]); }
  }
  return buildQuatClip(scene, sk, name, duration, out, hipsY.length ? hipsY : undefined);
}
