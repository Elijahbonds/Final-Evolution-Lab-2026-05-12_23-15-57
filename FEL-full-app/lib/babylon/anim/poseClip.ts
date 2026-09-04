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

const ARM_BONES = ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];
const LEG_BONES = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

export function buildPoseClip(scene: Scene, sk: Skeleton, name: string, duration: number, keys: PoseKey[]): AnimationGroup | null {
  // snapshot bind so every key is solved from the same start and the rig is left untouched
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) nodes.set(b.name.replace(/^mixamorig:?/, ''), n); }
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  for (const n of nodes.values()) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation)).clone() });
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

  const out: QuatKeys = {}; const hipsY: [number, number][] = [];
  const push = (bone: string, t: number, q: Quaternion) => { (out[bone] ??= []).push([t, q.clone()]); };
  for (const key of keys) {
    restore();
    // 1) torso and any explicit bone keys
    for (const [bone, deg] of Object.entries(key.bones ?? {})) { const n = nodes.get(bone); if (n) n.rotationQuaternion = eulerQ(...deg); }
    refresh();
    // 2) hands
    for (const side of ['Left', 'Right'] as const) {
      const tgt = key.hands?.[side]; const arm = arms[side]; if (!tgt || !arm) continue;
      const pole = key.poles?.[side] ?? [side === 'Left' ? -0.7 : 0.7, -0.2, -0.5];
      reachArm(arm, toWorld(tgt), new Vector3(...pole), 1);   // pole is a world direction too
      refresh();
    }
    // 3) feet
    for (const side of ['Left', 'Right'] as const) {
      const tgt = key.feet?.[side]; if (!tgt) continue;
      const [h, k, a] = legs[side].map((b) => nodes.get(b)); if (!h || !k || !a) continue;
      plantLeg(h, k, a, toWorld(tgt), Vector3.Forward());
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
