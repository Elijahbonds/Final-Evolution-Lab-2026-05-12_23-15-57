// FROZEN REFERENCE (dunk-garbage, 2026-10-16): DunkMode's posture-copy frame-space helpers exactly as they stood at dc8e9db7, before
// the allocation fix — `ppDelta`, `frameYawOf`, `frameForwardOf` and `rotateInFrame`, with the closure's `ppFrame` made a parameter
// and its scratch (`_ppQ`, `_ppD`, `_ppV`, `_ppInv`) made module state here. lib/babylon/core/DunkFrameSpace.test.ts runs it beside
// lib/babylon/core/DunkFrameSpace.ts and demands the same quaternions bit for bit. Never edit it to make a test pass.
import { Quaternion, Vector3, type TransformNode } from '@babylonjs/core';
import { chainRotation } from '@/lib/babylon/anim/TwoBoneIK';

export const _ppQ = Quaternion.Identity(), _ppD = Quaternion.Identity(), _ppV = new Vector3();
const _ppInv = Quaternion.Identity();

/** chain rotation × bind⁻¹ into `_ppD`, without allocating the inverse. */
export const ppDelta = (n: TransformNode, ppFrame: TransformNode, bindChain: Quaternion): void => { chainRotation(n, ppFrame!).multiplyToRef(Quaternion.InverseToRef(bindChain, _ppInv), _ppD); };
/** The frame-space yaw of a node's rotation `local` against its bind chain (the clip's own turn: 0 at bind). */
export function frameYawOf(n: TransformNode, local: Quaternion, bindChain: Quaternion, ppFrame: TransformNode): number {
  const par = n.parent as TransformNode | null; const Rp = par && par !== ppFrame ? chainRotation(par, ppFrame!) : Quaternion.Identity();
  Rp.multiplyToRef(local, _ppQ); _ppQ.multiplyToRef(Quaternion.Inverse(bindChain), _ppD);
  Vector3.Forward().rotateByQuaternionToRef(_ppD, _ppV);
  return Math.atan2(_ppV.x, _ppV.z);
}
/** The frame-space forward of a node NOW against its bind chain: x/z = the yaw, y = the elevation. */
export function frameForwardOf(n: TransformNode, bindChain: Quaternion, out: Vector3, ppFrame: TransformNode): Vector3 {
  chainRotation(n, ppFrame!).multiplyToRef(Quaternion.Inverse(bindChain), _ppD);
  return Vector3.Forward().rotateByQuaternionToRef(_ppD, out);
}
/** Rotate a node by `rho` in frame space (q' = Rp⁻¹ ∘ ρ ∘ Rp ∘ q). */
export function rotateInFrame(n: TransformNode, rho: Quaternion, ppFrame: TransformNode): void {
  const par = n.parent as TransformNode | null; const Rp = par && par !== ppFrame ? chainRotation(par, ppFrame!) : Quaternion.Identity();
  const q = n.rotationQuaternion!;
  Quaternion.Inverse(Rp).multiply(rho).multiply(Rp).multiplyToRef(q, _ppQ); q.copyFrom(_ppQ);
}
