// Base clips — run, walk, guard, jab, hook, uppercut, roundhouse, high_kick,
// jumpshot — the nine gameplay clips the forge bakes into fel-hero.glb
// (scripts/avatar/forge.mts), now ALSO built at spawn on the live skeleton so
// any Gate-0 body plays them (ship pass 3, rung 1 close-out: the MPFB2
// candidate carries no animations and reported them MISSING).
//
// A pose is bone → WORLD-space rotation delta from rest, composed parent-first,
// exactly the forge's authoring (`chain(a, b)` = "b, then a"; a rotation about
// a limb's own bind axis is an invisible twist, so drop the arm about z first,
// then swing it about x). bindFrame.keyedQ applies such a delta about the
// parent's bind axes from bind: identical to the baked clip on the shipped
// hero (identity binds), the same movement on a rig whose bones carry bind
// rotations. Registry-name hits beat the baked clips, so this file is the one
// source of truth for the nine at runtime.
import { Animation, AnimationGroup, Quaternion, Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from '../boneLookup';
import { bindFrame } from '../bindFrame';

const FPS = 30, D2R = Math.PI / 180;
type Pose = Record<string, Quaternion>;
type V3 = [number, number, number];

const qAxis = (axis: 'x' | 'y' | 'z', deg: number): Quaternion => { const h = deg * D2R / 2, s = Math.sin(h), c = Math.cos(h); return axis === 'x' ? new Quaternion(s, 0, 0, c) : axis === 'y' ? new Quaternion(0, s, 0, c) : new Quaternion(0, 0, s, c); };
/** Compose world deltas: the product applies the RIGHT factor first, so chain(a, b) = "b, then a". */
const chain = (...qs: Quaternion[]): Quaternion => qs.reduce((acc, q) => acc.multiply(q).normalize(), Quaternion.Identity());
const qFromTo = (a: V3, b: V3): Quaternion => {
  const u = Vector3.FromArray(a).normalize(), v = Vector3.FromArray(b).normalize(); const d = Vector3.Dot(u, v);
  if (d < -0.9999) return new Quaternion(0, 0, 1, 0);
  const c = Vector3.Cross(u, v); return new Quaternion(c.x, c.y, c.z, 1 + d).normalize();
};
const PARENT: Record<string, string | null> = { Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };
const worldOf = (pose: Pose, name: string): Quaternion => { const p = PARENT[name]; const pw = p ? worldOf(pose, p) : Quaternion.Identity(); return pw.multiply(pose[name] ?? Quaternion.Identity()).normalize(); };
/** Point `bone` (bind axis `axis`: arms +x left, −x right) at a WORLD direction under the pose's upstream deltas. Torso first, then upper arm, then forearm. */
const aimBone = (pose: Pose, bone: string, axis: V3, dir: V3): Pose => { const p = PARENT[bone]; const pw = p ? worldOf(pose, p) : Quaternion.Identity(); pose[bone] = pw.invert().multiply(qFromTo(axis, dir)).normalize(); return pose; };
const LX: V3 = [1, 0, 0], RX: V3 = [-1, 0, 0];

const armsDown: Pose = { LeftArm: qAxis('z', -75), RightArm: qAxis('z', 75), LeftForeArm: qAxis('z', -12), RightForeArm: qAxis('z', 12) };

interface ClipKey { t: number; pose: Pose }
function locomotion(duration: number, thighDeg: number, kneeBase: number, kneeAmp: number, armSwing: number, elbowFlex: number, sway: number): ClipKey[] {
  const keys: ClipKey[] = []; const N = 8;
  for (let k = 0; k <= N; k++) {
    const t = (duration * k) / N, phi = (2 * Math.PI * k) / N, s = Math.sin(phi);
    const kneeL = kneeBase + kneeAmp * (1 - Math.cos(phi)), kneeR = kneeBase + kneeAmp * (1 - Math.cos(phi + Math.PI));
    keys.push({ t, pose: {
      ...armsDown,
      Spine: qAxis('x', 5), Spine2: qAxis('z', sway * s), Hips: qAxis('y', sway * 1.4 * s), Head: qAxis('x', -4),
      LeftUpLeg: qAxis('x', -thighDeg * s), RightUpLeg: qAxis('x', thighDeg * s),
      LeftLeg: qAxis('x', kneeL), RightLeg: qAxis('x', kneeR),
      LeftFoot: qAxis('x', -kneeL * 0.4 + thighDeg * 0.3 * s), RightFoot: qAxis('x', -kneeR * 0.4 - thighDeg * 0.3 * s),
      // RUN ARMS (Dunk play tip 2026-09-07). Two defects made the gait read dead: (1) both arms were keyed on the SAME
      // phase (+armSwing·s), no opposition; (2) the swing was composed BEFORE the drop — chain(a, b) is "b, then a", so
      // chain(z, x) twisted the T-pose arm about its own axis and then dropped it: measured elbow travel ±5 mm against
      // the legs' ±300 mm. Drop first, then swing (the guard pose's own order), and the right arm takes the opposite
      // sign: the left arm goes back as the left thigh (−thighDeg·s) comes forward, the right arm comes forward with it.
      // (3) The elbow flex was the same twist — about the forearm's own bind axis. It bends about y in the T (forearm
      // toward +z) before the drop carries it down: a bent, pumping elbow instead of a straight arm.
      LeftArm: chain(qAxis('x', armSwing * s), qAxis('z', -75)), RightArm: chain(qAxis('x', -armSwing * s), qAxis('z', 75)),
      LeftForeArm: chain(qAxis('z', -12), qAxis('y', -elbowFlex)), RightForeArm: chain(qAxis('z', 12), qAxis('y', elbowFlex)),
    } });
  }
  return keys;
}

// A fighting guard: upper arms hang near the torso and swing a little forward;
// forearms come up so the fists sit at chin height in front of the face.
const guardArmL = chain(qAxis('x', -32), qAxis('z', -64)), guardArmR = chain(qAxis('x', -32), qAxis('z', 64));
const guardPose: Pose = {
  ...armsDown, LeftArm: guardArmL, RightArm: guardArmR,
  LeftForeArm: guardArmL.invert().multiply(qFromTo(LX, [-0.25, 0.62, 0.74])).normalize(),
  RightForeArm: guardArmR.invert().multiply(qFromTo(RX, [0.25, 0.62, 0.74])).normalize(),
  LeftUpLeg: qAxis('y', 10), RightUpLeg: qAxis('y', -10), Spine: qAxis('x', 4),
};

export const BASE_CLIPS = ['run', 'walk', 'guard', 'jab', 'hook', 'uppercut', 'roundhouse', 'high_kick', 'jumpshot'] as const;

const CLIPS: { name: string; duration: number; keys: ClipKey[] }[] = [
  { name: 'run', duration: 0.6, keys: locomotion(0.6, 42, 18, 22, 26, 30, 3.5) },
  { name: 'walk', duration: 1.0, keys: locomotion(1.0, 24, 8, 10, 13, 14, 2) },
  { name: 'guard', duration: 1.2, keys: [0, 0.3, 0.6, 0.9, 1.2].map((t) => ({ t, pose: { ...guardPose, Spine: qAxis('x', 4 + 2.5 * Math.sin(2 * Math.PI * t / 0.6)) } })) },
  { name: 'jab', duration: 0.5, keys: [
    { t: 0, pose: guardPose },
    { t: 0.15, pose: (() => { const P: Pose = { ...guardPose, Hips: qAxis('y', -12), Spine2: qAxis('y', -8) }; aimBone(P, 'LeftArm', LX, [-0.12, 0.12, 0.98]); aimBone(P, 'LeftForeArm', LX, [-0.06, 0.06, 1.0]); return P; })() },
    { t: 0.5, pose: guardPose },
  ] },
  { name: 'hook', duration: 0.6, keys: [
    { t: 0, pose: guardPose },
    { t: 0.2, pose: (() => { const P: Pose = { ...guardPose, Hips: qAxis('y', 10) }; aimBone(P, 'RightArm', RX, [-0.85, 0.15, -0.5]); aimBone(P, 'RightForeArm', RX, [-0.3, 0.2, 0.93]); return P; })() },
    { t: 0.35, pose: (() => { const P: Pose = { ...guardPose, Hips: qAxis('y', -16), Spine2: qAxis('y', -10) }; aimBone(P, 'RightArm', RX, [-0.35, 0.1, 0.93]); aimBone(P, 'RightForeArm', RX, [0.9, 0.05, 0.43]); return P; })() },
    { t: 0.6, pose: guardPose },
  ] },
  { name: 'uppercut', duration: 0.7, keys: [
    { t: 0, pose: guardPose },
    { t: 0.22, pose: (() => { const P: Pose = { ...guardPose, Hips: qAxis('y', 12), Spine: qAxis('x', 12), LeftUpLeg: qAxis('x', -18), RightUpLeg: qAxis('x', -18), LeftLeg: qAxis('x', 42), RightLeg: qAxis('x', 42) }; aimBone(P, 'RightArm', RX, [-0.3, -0.85, -0.45]); aimBone(P, 'RightForeArm', RX, [-0.1, -0.2, 0.97]); return P; })() },
    { t: 0.42, pose: (() => { const P: Pose = { ...guardPose, Spine: qAxis('x', -4), Hips: qAxis('y', -14), Spine2: qAxis('y', -8) }; aimBone(P, 'RightArm', RX, [-0.15, 0.35, 0.92]); aimBone(P, 'RightForeArm', RX, [0.0, 0.8, 0.6]); return P; })() },
    { t: 0.7, pose: guardPose },
  ] },
  { name: 'roundhouse', duration: 0.8, keys: [
    { t: 0, pose: armsDown },
    { t: 0.25, pose: { ...armsDown, RightUpLeg: chain(qAxis('x', -80), qAxis('y', 25)), RightLeg: qAxis('x', 95), LeftArm: chain(qAxis('z', -45), qAxis('x', -20)), RightArm: chain(qAxis('z', 55), qAxis('x', 15)), Spine: qAxis('x', 6) } },
    { t: 0.45, pose: { ...armsDown, RightUpLeg: chain(qAxis('x', -85), qAxis('y', -65)), RightLeg: qAxis('x', 12), LeftArm: chain(qAxis('z', -55), qAxis('x', -25)), RightArm: chain(qAxis('z', 60), qAxis('x', 20)), Hips: qAxis('y', -25), Spine: qAxis('x', 8) } },
    { t: 0.8, pose: armsDown },
  ] },
  { name: 'high_kick', duration: 0.7, keys: [
    { t: 0, pose: armsDown },
    { t: 0.28, pose: { ...armsDown, RightUpLeg: qAxis('x', -108), RightLeg: qAxis('x', 6), RightFoot: qAxis('x', 20), Spine: qAxis('x', 10), LeftArm: chain(qAxis('z', -40), qAxis('x', -15)), RightArm: chain(qAxis('z', 40), qAxis('x', -15)) } },
    { t: 0.7, pose: armsDown },
  ] },
  { name: 'jumpshot', duration: 0.9, keys: [
    { t: 0, pose: armsDown },
    { t: 0.25, pose: { ...armsDown, LeftUpLeg: qAxis('x', -22), RightUpLeg: qAxis('x', -22), LeftLeg: qAxis('x', 55), RightLeg: qAxis('x', 55), LeftFoot: qAxis('x', -25), RightFoot: qAxis('x', -25), Spine: qAxis('x', 8), LeftArm: chain(qAxis('z', -60), qAxis('x', -25)), RightArm: chain(qAxis('z', 60), qAxis('x', -25)) } },
    // release: both arms OVERHEAD. The baked clip keyed z −160 / +150 here — the
    // arms-down direction continued past straight down, so the hands crossed low
    // in front of the hips (measured 2026-09-04: 1.35 m, head at 1.60). From the
    // T (+x left / −x right), +z raises the left arm, −z the right; ~100° is just
    // past vertical, converging over the head; x swings forward.
    { t: 0.5, pose: { LeftArm: chain(qAxis('z', 100), qAxis('x', -20)), RightArm: chain(qAxis('z', -96), qAxis('x', -28)), LeftForeArm: qAxis('z', 18), RightForeArm: chain(qAxis('z', -12), qAxis('x', -40)), Spine: qAxis('x', -6), Head: qAxis('x', -6) } },
    { t: 0.65, pose: { LeftArm: chain(qAxis('z', 92), qAxis('x', -35)), RightArm: chain(qAxis('z', -88), qAxis('x', -50)), LeftForeArm: qAxis('z', 10), RightForeArm: qAxis('z', -8), Spine: qAxis('x', -4) } },
    { t: 0.9, pose: armsDown },
  ] },
];

/** Build one clip from world-delta poses; every bone any key touches is keyed at every key (identity where unset), like the forge. */
function buildDeltaClip(scene: Scene, sk: Skeleton, name: string, duration: number, keys: ClipKey[]): AnimationGroup | null {
  const bf = bindFrame(sk);
  const bones = new Set<string>(); for (const k of keys) for (const b of Object.keys(k.pose)) bones.add(b);
  const group = new AnimationGroup(name, scene); let added = 0;
  for (const bone of bones) {
    const node: TransformNode | null = boneNode(sk, bone); if (!node) continue;
    const anim = new Animation(`${name}.${bone}.rotq`, 'rotationQuaternion', FPS, Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
    anim.setKeys(keys.map((k) => ({ frame: k.t * FPS, value: bf.keyedQ(node, k.pose[bone] ?? Quaternion.Identity()) })));
    group.addTargetedAnimation(anim, node); added++;
  }
  group.normalize(0, duration * FPS);
  if (!added) { group.dispose(); return null; }
  return group;
}

export function buildBaseClips(scene: Scene, sk: Skeleton): AnimationGroup[] {
  const out: AnimationGroup[] = [];
  for (const c of CLIPS) { const g = buildDeltaClip(scene, sk, c.name, c.duration, c.keys); if (g) out.push(g); }
  return out;
}
