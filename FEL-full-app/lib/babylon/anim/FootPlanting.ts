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
import { localAfterWorldDelta, solveChainInFrame } from './TwoBoneIK';

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
  /** HOOPS-DEPTH S7: the clip's SWING speed (m/s) — how fast it carries the foot FORWARD relative to the body, along the body's
   *  travel (or at all, when the body is still) — at or below which a low foot may plant, and above which a planted one is
   *  let go. A stance foot goes back under the body or stays put; a swing foot goes forward past it. */
  plantSpeed?: number;
  liftSpeed?: number;
}

/**
 * HOOPS-DEPTH S7 (2026-09-23): THE FEET POPPED. Contact was read from the ankle's HEIGHT alone, and a defensive shuffle
 * keeps both feet low: the swing foot was pinned like the stance foot, held while the body moved on (7 cm a frame in a
 * live 1v1 slide), and let go at the drift limit — where the pin still had 0.65 of its weight, so the foot jumped
 * 30–43 cm back to the clip in ONE frame, every step (foot-plant probe: planted-foot travel p90 29 cm a frame; the clip on
 * its own never moves a foot more than 14 cm a frame at the live rate). Now: a foot plants only when the clip is not
 * swinging it forward (`plantSpeed`), a swung one is let go (`liftSpeed`), and the pin's weight reaches 0 AT the drift limit.
 * (A foot the clip holds still relative to the body is a STANCE foot: it is pinned, and a clip that never steps still
 * slides smoothly at the drift limit instead of popping.)
 */
export const DEFAULT_CONTACT: ContactParams = { downAt: 0.09, upAt: 0.15, maxDrift: 0.32, plantSpeed: 0.6, liftSpeed: 1.5 };

/** The clip's swing speed for one foot this frame (pure): its motion RELATIVE TO THE ROOT, along the root's travel when the root
 *  is moving (a stance foot sweeps back under the body: negative), its whole relative speed when the root is still. m/s. */
export function swingSpeed(rootStep: { x: number; z: number }, relStep: { x: number; z: number }, dt: number): number {
  if (!(dt > 0)) return 0;
  const rs = Math.hypot(rootStep.x, rootStep.z);
  if (rs / dt > 0.3) return (relStep.x * rootStep.x + relStep.z * rootStep.z) / rs / dt;
  return Math.hypot(relStep.x, relStep.z) / dt;
}

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
  /** The clip's swing speed this frame (m/s, swingSpeed); omitted = height alone decides, as before. */
  clipSpeed?: number,
): ContactState {
  const moving = (lim: number | undefined) => clipSpeed !== undefined && lim !== undefined && Number.isFinite(clipSpeed) && clipSpeed > lim;
  if (!s.planted) {
    if (ankleHeight <= p.downAt && !moving(p.plantSpeed)) return { planted: true, pin: { ...ankleWorld } };
    return s;
  }
  if (ankleHeight >= p.upAt || moving(p.liftSpeed)) return { planted: false, pin: s.pin };
  const dx = ankleWorld.x - s.pin.x, dz = ankleWorld.z - s.pin.z;
  if (Math.hypot(dx, dz) > p.maxDrift) return { planted: false, pin: s.pin };
  return s;
}

/** Blend weight for the pin: full up to half the drift limit, then eased to NOTHING at the limit, so the release there is
 *  continuous. (It used to hold ≥ 0.65 at the edge, which is the one-frame pop HOOPS-DEPTH S7 measured.) */
export function pinWeight(driftM: number, maxDrift: number): number {
  if (!(maxDrift > 0) || driftM <= maxDrift * 0.5) return 1;
  const t = Math.min(1, (driftM - maxDrift * 0.5) / (maxDrift * 0.5));
  return 1 - t * t * (3 - 2 * t);
}
/** A pin let go by the clip (a lift, a swing) fades out over this long instead of dropping in one frame. */
export const RELEASE_FADE_SEC = 0.1;

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
  // solved in the rig's own frame — see TwoBoneIK.solveChainInFrame (handedness)
  return solveChainInFrame(hip, knee, ankle, target, pole, 1).miss;
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
  type Leg = { side: Side; hip: TransformNode; knee: TransformNode; ankle: TransformNode; pinLocal: Vector3; rootAtPlant: Vector3;
    prevClip: Vector3 | null; prevRoot: Vector3 | null; fadeLeft: number; fadeW: number; fadeTarget: Vector3 };
  const legs: Leg[] = [];
  for (const side of ['Left', 'Right'] as Side[]) {
    const hip = bone(skeleton, `${side}UpLeg`)?.getTransformNode() ?? null;
    const knee = bone(skeleton, `${side}Leg`)?.getTransformNode() ?? null;
    const ankle = bone(skeleton, `${side}Foot`)?.getTransformNode() ?? null;
    if (!hip || !knee || !ankle) continue;
    legs.push({ side, hip, knee, ankle, pinLocal: new Vector3(), rootAtPlant: new Vector3(), prevClip: null, prevRoot: null, fadeLeft: 0, fadeW: 0, fadeTarget: new Vector3() });
  }
  if (legs.length === 0) return { dispose() { /* no legs */ }, debug };

  const target = new Vector3();
  const obs = scene.onAfterAnimationsObservable.add(() => {
    opts.root.computeWorldMatrix(true);
    const rootPos = opts.root.getAbsolutePosition().clone();
    const rootRot = opts.root.absoluteRotationQuaternion.clone();
    const dt = Math.min(0.1, Math.max(1e-4, scene.getEngine().getDeltaTime() / 1000));
    for (const leg of legs) {
      leg.ankle.computeWorldMatrix(true);
      const ankle = leg.ankle.getAbsolutePosition().clone();   // the CLIP's ankle (the pin below is written after the clips, and they overwrite it next frame)
      const pc = leg.prevClip, pr = leg.prevRoot;
      const rootStep = pr ? { x: rootPos.x - pr.x, z: rootPos.z - pr.z } : null;
      const clipSpeed = pc && pr && rootStep ? swingSpeed(rootStep, { x: (ankle.x - rootPos.x) - (pc.x - pr.x), z: (ankle.z - rootPos.z) - (pc.z - pr.z) }, dt) : undefined;
      const jumped = !!rootStep && Math.hypot(rootStep.x, rootStep.z) > 2;   // a teleport (a reset)
      leg.prevClip = pc ?? new Vector3(); leg.prevClip.copyFrom(ankle); leg.prevRoot = pr ?? new Vector3(); leg.prevRoot.copyFrom(rootPos);
      if (jumped) { debug[leg.side === 'Left' ? 'left' : 'right'] = { planted: false, pin: { x: ankle.x, y: ankle.y, z: ankle.z } }; leg.fadeLeft = 0; continue; }   // a teleport: nothing to hold
      const key = leg.side === 'Left' ? 'left' : 'right';
      const prev = debug[key];
      const next = stepContact(prev, ankle.y - rootPos.y, { x: ankle.x, y: ankle.y, z: ankle.z }, params, clipSpeed);
      debug[key] = next;
      if (!next.planted) {
        // let go by the clip: the pin FADES instead of dropping — a planted foot the clip lifts or swings eases onto the clip
        if (prev.planted) leg.fadeLeft = RELEASE_FADE_SEC;
        if (leg.fadeLeft > 0 && leg.fadeW > 0.001) {
          leg.fadeLeft = Math.max(0, leg.fadeLeft - dt);
          const w = leg.fadeW * (leg.fadeLeft / RELEASE_FADE_SEC);
          if (w > 0.001) { target.copyFrom(leg.fadeTarget); target.y = ankle.y; Vector3.LerpToRef(ankle, target, w, target); plantLeg(leg.hip, leg.knee, leg.ankle, target, opts.root.forward); }
        }
        continue;
      }
      leg.fadeLeft = 0;
      if (!prev.planted) {
        // touchdown: remember where the foot is, in the root's frame
        leg.rootAtPlant.copyFrom(rootPos);
        ankle.subtract(rootPos).applyRotationQuaternionToRef(Quaternion.Inverse(rootRot), leg.pinLocal);
      }
      leg.pinLocal.applyRotationQuaternionToRef(rootRot, target).addInPlace(leg.rootAtPlant);
      target.y = ankle.y;   // the clip's height (a heel lift inside the window still reads)
      const drift = Math.hypot(ankle.x - target.x, ankle.z - target.z);
      const w = pinWeight(drift, params.maxDrift) * intensity;
      leg.fadeW = w; leg.fadeTarget.copyFrom(target);   // what a release fades out from
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
