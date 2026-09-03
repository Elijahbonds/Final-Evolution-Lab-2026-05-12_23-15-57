// FootPlanting — two-foot IK planting for every GLB hero.
//
// Ship pass, Phase 2 (owner decision 2026-09-02): movement stays code-driven
// (no root motion), so the honest fix for feet sliding under a moving root is
// to PIN each foot where it touched down for as long as the clip keeps it on
// the ground. The clip still decides when a foot is down; we only stop the
// planted one from skating.
//
// Contact is read from the clip's own ankle height above the character root
// (a pure state machine, unit-tested); the pin is a two-bone IK on the hip and
// knee NODES (UpLeg / Leg) toward the recorded world point, knee pole thrown
// forward so it never flips sideways. The lock releases when the clip lifts
// the foot or the leg would overstretch.
//
// 2026-09-03: this used Babylon's BoneIKController, which writes bone matrices
// directly; on this glTF rig (bones linked to TransformNodes) the composed
// matrix decomposed into NON-UNIFORM SCALE on thigh and shin (0.94/0.85/0.91)
// and the body flew apart. The solver is now pure and node-space
// (TwoBoneIK.ts): it returns world rotation deltas which land as local
// rotationQuaternions, so scale is never touched.

import { Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Bone, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { localAfterWorldDelta, solveTwoBone } from './TwoBoneIK';

export type Side = 'Left' | 'Right';

// ── pure contact logic ──────────────────────────────────────────────────────

export interface ContactParams {
  /** Ankle height above root at or below which the foot counts as down (m). */
  downAt: number;
  /** Ankle height above which a planted foot is released (m). Hysteresis. */
  upAt: number;
  /** Max distance the animated ankle may drift from the pin before we let go
   *  (the leg would overstretch — a slide beats a hyper-extended knee). */
  maxDrift: number;
}

export const DEFAULT_CONTACT: ContactParams = { downAt: 0.09, upAt: 0.15, maxDrift: 0.32 };

export interface ContactState {
  planted: boolean;
  /** Pin in world space (only meaningful while planted). */
  pin: { x: number; y: number; z: number };
}

/**
 * Advance one foot's contact state. `ankleHeight` is the clip-driven ankle
 * height above the root, `ankleWorld` its animated world position this frame.
 * Returns the new state; when `planted` is true the caller drives IK to `pin`.
 */
export function stepContact(
  s: ContactState,
  ankleHeight: number,
  ankleWorld: { x: number; y: number; z: number },
  p: ContactParams = DEFAULT_CONTACT,
): ContactState {
  if (!s.planted) {
    if (ankleHeight <= p.downAt) return { planted: true, pin: { ...ankleWorld } };
    return s;
  }
  if (ankleHeight >= p.upAt) return { planted: false, pin: s.pin };
  const dx = ankleWorld.x - s.pin.x, dz = ankleWorld.z - s.pin.z;
  if (Math.hypot(dx, dz) > p.maxDrift) return { planted: false, pin: s.pin };
  return s;
}

/** Blend weight for the pin: full while planted, eased in over the first
 *  few centimetres of drift so the pin never pops on the contact frame. */
export function pinWeight(driftM: number, maxDrift: number): number {
  if (driftM <= 0) return 1;
  const t = Math.min(1, driftM / maxDrift);
  return 1 - t * t * 0.35;   // still ≥0.65 at the release edge
}

// ── runtime ─────────────────────────────────────────────────────────────────

export interface FootPlantingOpts {
  /** Character root (moved by the movement model). */
  root: TransformNode;
  /** Intensity 0..1 — 0 disables (mobile can pass 0). Default 1. */
  intensity?: number;
  params?: ContactParams;
}

export interface FootPlantingHandle {
  dispose(): void;
  readonly debug: { left: ContactState; right: ContactState };
}

function bone(sk: Skeleton, name: string): Bone | undefined {
  return findBone(sk, name) ?? undefined;   // tolerant resolver (Gate 0 E1)
}

function parentRot(n: TransformNode): Quaternion {
  const p = n.parent as TransformNode | null;
  return p && 'absoluteRotationQuaternion' in p ? p.absoluteRotationQuaternion.clone() : Quaternion.Identity();
}

/** Apply a world-space rotation delta to a node as a LOCAL rotationQuaternion,
 *  blended by w. Never touches position or scale. */
export function applyWorldDelta(n: TransformNode, delta: Quaternion, w = 1): void {
  n.computeWorldMatrix(true);
  const local = localAfterWorldDelta(parentRot(n), n.absoluteRotationQuaternion.clone(), delta);
  const cur = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
  n.rotationQuaternion = w >= 1 ? local : Quaternion.Slerp(cur, local, w);
  n.computeWorldMatrix(true);
}

/** Solve and apply one leg: rotate hip and knee so the ankle lands on
 *  `target` (world), knee toward `pole`. Knee first — its delta is defined on
 *  the pre-aim pose — then the hip, which the knee inherits. Returns the
 *  ankle's remaining miss in metres. */
export function plantLeg(hip: TransformNode, knee: TransformNode, ankle: TransformNode, target: Vector3, pole: Vector3): number {
  hip.computeWorldMatrix(true); knee.computeWorldMatrix(true); ankle.computeWorldMatrix(true);
  const s = solveTwoBone({
    root: hip.getAbsolutePosition().clone(),
    mid: knee.getAbsolutePosition().clone(),
    end: ankle.getAbsolutePosition().clone(),
    target: target.clone(),
    pole: pole.clone(),
  });
  applyWorldDelta(knee, s.mid, 1);
  applyWorldDelta(hip, s.root, 1);
  ankle.computeWorldMatrix(true);
  return Vector3.Distance(ankle.getAbsolutePosition(), target);
}

export function mountFootPlanting(scene: Scene, skinned: AbstractMesh, skeleton: Skeleton, opts: FootPlantingOpts): FootPlantingHandle {
  void skinned;   // kept in the signature: callers pass it, and a per-mesh solver may want it again
  const intensity = opts.intensity ?? 1;
  const params = opts.params ?? DEFAULT_CONTACT;
  const debug = { left: { planted: false, pin: { x: 0, y: 0, z: 0 } }, right: { planted: false, pin: { x: 0, y: 0, z: 0 } } };
  if (intensity <= 0) return { dispose() { /* off */ }, debug };

  // The pin is stored in the ROOT's frame at plant time and rebuilt each frame
  // with the root's CURRENT yaw but its PLANT-TIME position: root translation
  // (the thing that makes feet skate) is resisted; code-driven turning in place
  // is not fought, or every facing change would wind the legs up.
  type Leg = { side: Side; hip: TransformNode; knee: TransformNode; ankle: TransformNode; pinLocal: Vector3; rootAtPlant: Vector3 };
  const legs: Leg[] = [];
  for (const side of ['Left', 'Right'] as Side[]) {
    const hip = bone(skeleton, `${side}UpLeg`)?.getTransformNode() ?? null;
    const knee = bone(skeleton, `${side}Leg`)?.getTransformNode() ?? null;
    const ankle = bone(skeleton, `${side}Foot`)?.getTransformNode() ?? null;
    if (!hip || !knee || !ankle) continue;
    legs.push({ side, hip, knee, ankle, pinLocal: new Vector3(), rootAtPlant: new Vector3() });
  }
  if (legs.length === 0) return { dispose() { /* no legs */ }, debug };

  const target = new Vector3();
  const obs = scene.onAfterAnimationsObservable.add(() => {
    opts.root.computeWorldMatrix(true);
    const rootPos = opts.root.getAbsolutePosition().clone();
    const rootRot = opts.root.absoluteRotationQuaternion.clone();
    for (const leg of legs) {
      leg.ankle.computeWorldMatrix(true);
      const ankle = leg.ankle.getAbsolutePosition().clone();
      const key = leg.side === 'Left' ? 'left' : 'right';
      const prev = debug[key];
      const next = stepContact(prev, ankle.y - rootPos.y, { x: ankle.x, y: ankle.y, z: ankle.z }, params);
      debug[key] = next;
      if (!next.planted) continue;
      if (!prev.planted) {
        // touchdown: remember where the foot is, in the root's frame
        leg.rootAtPlant.copyFrom(rootPos);
        ankle.subtract(rootPos).applyRotationQuaternionToRef(Quaternion.Inverse(rootRot), leg.pinLocal);
      }
      leg.pinLocal.applyRotationQuaternionToRef(rootRot, target).addInPlace(leg.rootAtPlant);
      target.y = ankle.y;   // the clip's height (a heel lift inside the window still reads)
      const drift = Math.hypot(ankle.x - target.x, ankle.z - target.z);
      const w = pinWeight(drift, params.maxDrift) * intensity;
      if (w <= 0.001 || drift < 0.002) continue;
      Vector3.LerpToRef(ankle, target, w, target);
      plantLeg(leg.hip, leg.knee, leg.ankle, target, opts.root.forward);
    }
  });
  return {
    debug,
    dispose() { scene.onAfterAnimationsObservable.remove(obs); },
  };
}
