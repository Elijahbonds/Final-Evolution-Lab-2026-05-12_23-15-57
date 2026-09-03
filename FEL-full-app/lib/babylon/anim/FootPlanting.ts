// FootPlanting — two-foot IK planting for every GLB hero.
//
// Ship pass, Phase 2 (owner decision 2026-09-02): movement stays code-driven
// (no root motion), so the honest fix for feet sliding under a moving root is
// to PIN each foot where it touched down for as long as the clip keeps it on
// the ground. The clip still decides when a foot is down; we only stop the
// planted one from skating.
//
// Contact is read from the clip's own ankle height above the character root
// (a pure state machine, unit-tested); the pin is a two-bone IK on the shin
// (LeftLeg / RightLeg) toward the recorded world point, with the knee pole
// target thrown forward so the knee never flips sideways. The lock releases
// when the clip lifts the foot or the leg would overstretch.

import { BoneIKController, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Bone, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { MeshBuilder } from '@babylonjs/core';
import { findBone } from './boneLookup';

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

export function mountFootPlanting(scene: Scene, skinned: AbstractMesh, skeleton: Skeleton, opts: FootPlantingOpts): FootPlantingHandle {
  const intensity = opts.intensity ?? 1;
  const params = opts.params ?? DEFAULT_CONTACT;
  const debug = { left: { planted: false, pin: { x: 0, y: 0, z: 0 } }, right: { planted: false, pin: { x: 0, y: 0, z: 0 } } };
  if (intensity <= 0) return { dispose() { /* off */ }, debug };

  type Leg = { side: Side; shin: Bone; foot: TransformNode; target: TransformNode; pole: TransformNode; ik: BoneIKController };
  const legs: Leg[] = [];
  for (const side of ['Left', 'Right'] as Side[]) {
    const shin = bone(skeleton, `${side}Leg`);
    const footNode = bone(skeleton, `${side}Foot`)?.getTransformNode() ?? null;
    if (!shin || !footNode) continue;
    const target = MeshBuilder.CreateBox(`__plant_${side}`, { size: 0.01 }, scene);
    target.isVisible = false; target.isPickable = false;
    const pole = MeshBuilder.CreateBox(`__plantPole_${side}`, { size: 0.01 }, scene);
    pole.isVisible = false; pole.isPickable = false;
    const ik = new BoneIKController(skinned, shin, { targetMesh: target, poleTargetMesh: pole, poleAngle: 0 });
    legs.push({ side, shin, foot: footNode, target, pole, ik });
  }
  if (legs.length === 0) return { dispose() { /* no legs */ }, debug };

  const tmp = new Vector3();
  const obs = scene.onAfterAnimationsObservable.add(() => {
    opts.root.computeWorldMatrix(true);
    const rootY = opts.root.getAbsolutePosition().y;
    for (const leg of legs) {
      leg.foot.computeWorldMatrix(true);
      const ankle = leg.foot.getAbsolutePosition();
      const key = leg.side === 'Left' ? 'left' : 'right';
      const next = stepContact(debug[key], ankle.y - rootY, { x: ankle.x, y: ankle.y, z: ankle.z }, params);
      debug[key] = next;
      if (!next.planted) continue;
      // pin at the recorded point, at the CLIP's current height (so a heel
      // lift inside the contact window still reads), forward pole for the knee
      const drift = Math.hypot(ankle.x - next.pin.x, ankle.z - next.pin.z);
      const w = pinWeight(drift, params.maxDrift) * intensity;
      tmp.set(next.pin.x, ankle.y, next.pin.z);
      Vector3.LerpToRef(ankle, tmp, w, tmp);
      leg.target.position.copyFrom(tmp);
      const fwd = opts.root.forward;
      leg.pole.position.copyFrom(ankle).addInPlace(fwd.scale(0.6)).addInPlace(Vector3.Up().scale(0.5));
      leg.ik.update();
    }
  });
  return {
    debug,
    dispose() {
      scene.onAfterAnimationsObservable.remove(obs);
      for (const l of legs) { l.target.dispose(); l.pole.dispose(); }
    },
  };
}
