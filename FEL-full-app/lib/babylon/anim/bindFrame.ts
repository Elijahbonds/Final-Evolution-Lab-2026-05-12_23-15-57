// bindFrame — what a rotation key MEANS on a rig.
//
// Every authored clip in FEL writes degrees. On the shipped hero every bone's
// bind rotation is identity and its frame is world-aligned, so writing
// eulerQ(deg) into a bone's local rotation rotated it about its parent's
// world-aligned axes. The MPFB2 candidate's bones carry bind rotations up to
// 180° (measured 2026-09-03), so the same write means something else there.
//
// `bindKeyer(sk)` returns a function that turns degrees into the local
// quaternion that rotates the bone by those degrees ABOUT ITS PARENT'S BIND
// AXES, FROM BIND. On the shipped hero this is exactly eulerQ(deg); on any
// other Gate-0 rig it is the same movement. Bind comes from the skeleton's rest
// matrices, so it does not matter what pose the rig is in when a clip is built.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { chainRotation, frameAbove } from './TwoBoneIK';

export type Deg3 = [number, number, number];
const D2R = Math.PI / 180;
export const eulerQ = (x: number, y: number, z: number): Quaternion => Quaternion.FromEulerAngles(x * D2R, y * D2R, z * D2R);

export interface BindFrame {
  /** local bind rotation and position per node (from the rest matrices) */
  bind: Map<TransformNode, { p: Vector3; q: Quaternion }>;
  /** rotation of each node's PARENT relative to the frame node, at bind */
  parentRot: Map<TransformNode, Quaternion>;
  /** degrees → local quaternion, about the parent's bind axes, from bind */
  keyed(n: TransformNode, deg: Deg3): Quaternion;
  /** a world-space delta from rest (the forge's pose vocabulary) → the same local quaternion */
  keyedQ(n: TransformNode, delta: Quaternion): Quaternion;
  /** keyed into `out`, no garbage (the per-frame form). `out` must be the caller's own quaternion. */
  keyedToRef(n: TransformNode, deg: Deg3, out: Quaternion): Quaternion;
  /** keyedQ into `out`, no garbage (the per-frame form). `out` must not be `delta`. */
  keyedQToRef(n: TransformNode, delta: Quaternion, out: Quaternion): Quaternion;
}

const cache = new WeakMap<Skeleton, BindFrame>();
// RIG-PERF (2026-10-16): the ToRef forms' scratches. keyedQToRef is keyedQ's arithmetic step for step: Rp.clone().invert() is
// Quaternion.invert — the conjugate, scaled by 1/|Rp|² unless that is 0 or 1 — then × delta × Rp × bind, left to right.
const IDENTITY: Readonly<Quaternion> = Quaternion.Identity();
const _e = new Quaternion(), _i = new Quaternion(), _a = new Quaternion(), _b = new Quaternion();

export function bindFrame(sk: Skeleton): BindFrame {
  const hit = cache.get(sk); if (hit) return hit;
  const nodes: TransformNode[] = [];
  const bind = new Map<TransformNode, { p: Vector3; q: Quaternion }>();
  for (const b of sk.bones) {
    const n = b.getTransformNode(); if (!n) continue; nodes.push(n);
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    if (b.getRestMatrix().decompose(s, q, p)) bind.set(n, { p, q });
    else bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation)).clone() });
  }
  // chainRotation reads the nodes' CURRENT locals; evaluate it with bind locals in place
  const saved = nodes.map((n) => [n, n.rotationQuaternion?.clone() ?? null] as const);
  for (const n of nodes) n.rotationQuaternion = bind.get(n)!.q.clone();
  const frame = nodes.length ? frameAbove(nodes[0]) : null;
  const parentRot = new Map<TransformNode, Quaternion>();
  for (const n of nodes) { const par = n.parent as TransformNode | null; parentRot.set(n, par && frame && par !== frame ? chainRotation(par, frame) : Quaternion.Identity()); }
  for (const [n, q] of saved) n.rotationQuaternion = q;
  const bf: BindFrame = {
    bind, parentRot,
    keyed(n, deg) { return bf.keyedQ(n, eulerQ(...deg)); },
    keyedQ(n, delta) {
      const b = bind.get(n)?.q ?? Quaternion.Identity(); const Rp = parentRot.get(n) ?? Quaternion.Identity();
      // Babylon: a.multiply(b) applies b first. Conjugate the delta into the parent's frame, then apply it after the bind rotation.
      return Rp.clone().invert().multiply(delta).multiply(Rp).multiply(b);
    },
    keyedToRef(n, deg, out) { return bf.keyedQToRef(n, Quaternion.FromEulerAnglesToRef(deg[0] * D2R, deg[1] * D2R, deg[2] * D2R, _e), out); },
    keyedQToRef(n, delta, out) {
      const b = bind.get(n)?.q ?? IDENTITY; const Rp = parentRot.get(n) ?? IDENTITY;
      Rp.conjugateToRef(_i); const ls = Rp.lengthSquared(); if (!(ls == 0 || ls == 1)) _i.scaleInPlace(1 / ls);
      _i.multiplyToRef(delta, _a); _a.multiplyToRef(Rp, _b);
      return _b.multiplyToRef(b, out);
    },
  };
  cache.set(sk, bf);
  return bf;
}
