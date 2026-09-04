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
}

const cache = new WeakMap<Skeleton, BindFrame>();

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
    keyed(n, deg) {
      const b = bind.get(n)?.q ?? Quaternion.Identity(); const Rp = parentRot.get(n) ?? Quaternion.Identity();
      // Babylon: a.multiply(b) applies b first. Conjugate the delta into the parent's frame, then apply it after the bind rotation.
      return Rp.clone().invert().multiply(eulerQ(...deg)).multiply(Rp).multiply(b);
    },
  };
  cache.set(sk, bf);
  return bf;
}
