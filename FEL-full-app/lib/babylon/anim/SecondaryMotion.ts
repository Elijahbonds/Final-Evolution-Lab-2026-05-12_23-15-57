// SecondaryMotion — the "alive" layer on top of authored clips.
//
// Ship pass, Phase 2 (owner decision 2026-09-02). Three things a still body
// does that a clip does not: it breathes, it shifts its weight, and its head
// tracks what matters. All three are ADDITIVE — applied after the animation
// system has written this frame's pose, on the bones' linked transform nodes —
// so they never fight a clip and cost no clip authoring.
//
//   breathing    — chest (Spine2) expands on a ~4 s cycle; scaled down while
//                  a fast clip plays so a sprint never looks like it is
//                  yawning.
//   weight shift — hips drift laterally on a slow ~7 s cycle while idle.
//   look-at      — Head yaw/pitch toward a target (ball, opponent, camera),
//                  clamped to a human range and smoothed. BoneLookController
//                  is not used because it overwrites the whole bone rotation;
//                  we blend a small delta onto the clip's head pose instead.
//
// Bone names are the LOCKED unprefixed spec (AvatarSkeletonSpec.md).

import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { AdditiveQuat, AdditiveScalar } from './AdditiveTrack';

export interface SecondaryMotionOpts {
  /** World-space point the head should track; null = none this frame. */
  lookTarget?: () => Vector3 | null;
  /** 0..1 how "busy" the body is (e.g. locomotion speed / max). Scales
   *  breathing and weight shift down. Default: 0 (idle). */
  activity?: () => number;
  /** Master intensity, e.g. 0 on mobile to skip the work. Default 1. */
  intensity?: number;
}

export interface SecondaryMotionHandle {
  dispose(): void;
  /** Point the head at something (the ball, the rival, the camera). null = stop. */
  setLookTarget(fn: (() => Vector3 | null) | null): void;
  /** 0..1 how busy the body is; scales breathing and weight shift down. */
  setActivity(fn: (() => number) | null): void;
  /** For probes: current breath phase 0..1 and applied look yaw in radians. */
  readonly debug: { breath: number; lookYaw: number; lookPitch: number };
}

// ── pure curves (unit-tested) ────────────────────────────────────────────────

/** Breath cycle 0..1 → chest expansion 0..1, asymmetric: quick-ish inhale,
 *  slower exhale, like a resting person. */
export function breathCurve(phase: number): number {
  const p = phase - Math.floor(phase);
  return p < 0.4 ? 0.5 - 0.5 * Math.cos((p / 0.4) * Math.PI)      // inhale over 40%
                 : 0.5 + 0.5 * Math.cos(((p - 0.4) / 0.6) * Math.PI); // exhale over 60%
}

/** Clamp a yaw/pitch pair to what a neck does without the torso turning. */
export const LOOK_MAX_YAW = 1.1;    // ~63°
export const LOOK_MAX_PITCH = 0.6;  // ~34°
export function clampLook(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return {
    yaw: Math.max(-LOOK_MAX_YAW, Math.min(LOOK_MAX_YAW, yaw)),
    pitch: Math.max(-LOOK_MAX_PITCH, Math.min(LOOK_MAX_PITCH, pitch)),
  };
}

/** Exponential smoothing toward a target, frame-rate independent. */
export function smoothTo(current: number, target: number, dt: number, halfLifeSec: number): number {
  const k = 1 - Math.pow(0.5, dt / Math.max(1e-4, halfLifeSec));
  return current + (target - current) * k;
}

// ── runtime ─────────────────────────────────────────────────────────────────

function nodeOf(skeleton: Skeleton, name: string): TransformNode | null {
  const b = findBone(skeleton, name);       // tolerant resolver (Gate 0 E1)
  return b?.getTransformNode() ?? null;
}

export function mountSecondaryMotion(scene: Scene, skeleton: Skeleton, opts: SecondaryMotionOpts = {}): SecondaryMotionHandle {
  const intensity = opts.intensity ?? 1;
  const chest = nodeOf(skeleton, 'Spine2');
  const hips = nodeOf(skeleton, 'Hips');
  const head = nodeOf(skeleton, 'Head');
  const debug = { breath: 0, lookYaw: 0, lookPitch: 0 };
  let lookTarget = opts.lookTarget ?? null;
  let activity = opts.activity ?? null;
  const noop: SecondaryMotionHandle = {
    dispose() { /* nothing mounted */ }, debug,
    setLookTarget(fn) { lookTarget = fn; }, setActivity(fn) { activity = fn; },
  };
  if (intensity <= 0 || (!chest && !hips && !head)) return noop;
  let t = Math.random() * 10;   // desync crowd members / opponents from the hero
  const tmpQ = new Quaternion();
  const tmpV = new Vector3();
  // Additive on top of the clip WITHOUT compounding on bones the clip leaves
  // alone (measured 2026-09-03: the Closet idle keys neither Spine2 nor Hips and
  // the body drifted apart into blocks). See AdditiveTrack.
  const chestRot = new AdditiveQuat(), chestScaleX = new AdditiveScalar(), chestScaleY = new AdditiveScalar();
  const hipsRot = new AdditiveQuat(), hipsX = new AdditiveScalar();
  const headRot = new AdditiveQuat();
  const applyQuat = (node: TransformNode, track: AdditiveQuat, delta: Quaternion): void => {
    const q = node.rotationQuaternion!;
    const b = track.baseFor(q.x, q.y, q.z, q.w);
    const out = new Quaternion(b[0], b[1], b[2], b[3]).multiplyInPlace(delta);
    q.copyFrom(out); track.wrote(out.x, out.y, out.z, out.w);
  };
  const obs = scene.onAfterAnimationsObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    const busy = Math.max(0, Math.min(1, activity?.() ?? 0));
    const calm = (1 - busy * 0.85) * intensity;

    // breathing: chest scale + a hair of forward pitch on the inhale
    if (chest) {
      const b = breathCurve(t / 4.0);
      debug.breath = b;
      const sx = chestScaleX.baseFor(chest.scaling.x) * (1 + 0.025 * b * calm);
      const sy = chestScaleY.baseFor(chest.scaling.y) * (1 + 0.015 * b * calm);
      chest.scaling.set(sx, sy, sx); chestScaleX.wrote(sx); chestScaleY.wrote(sy);
      if (chest.rotationQuaternion) {
        Quaternion.RotationAxisToRef(Vector3.Right(), -0.02 * b * calm, tmpQ);
        applyQuat(chest, chestRot, tmpQ);
      }
    }
    // weight shift: hips sway laterally on a slow cycle, idle only
    if (hips) {
      const w = Math.sin(t / 7.0 * Math.PI * 2);
      const hx = hipsX.baseFor(hips.position.x) + 0.012 * w * calm;
      hips.position.x = hx; hipsX.wrote(hx);
      if (hips.rotationQuaternion) {
        Quaternion.RotationAxisToRef(Vector3.Forward(), 0.015 * w * calm, tmpQ);
        applyQuat(hips, hipsRot, tmpQ);
      }
    }
    // look-at: blend a clamped yaw/pitch delta onto the clip's head pose
    if (head && head.rotationQuaternion) {
      const target = lookTarget?.() ?? null;
      let wantYaw = 0, wantPitch = 0;
      if (target) {
        head.computeWorldMatrix(true);
        const headPos = head.getAbsolutePosition();
        // target in the head's parent space so yaw/pitch are relative to the neck
        const parent = head.parent as TransformNode | null;
        const inv = parent ? parent.getWorldMatrix().clone().invert() : null;
        const local = inv ? Vector3.TransformCoordinates(target, inv) : target.subtract(headPos);
        const headLocal = inv ? Vector3.TransformCoordinates(headPos, inv) : Vector3.Zero();
        local.subtractToRef(headLocal, tmpV);
        // the forge faces +z: yaw about +y, pitch about +x
        wantYaw = Math.atan2(tmpV.x, tmpV.z);
        wantPitch = -Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
        ({ yaw: wantYaw, pitch: wantPitch } = clampLook(wantYaw, wantPitch));
      }
      debug.lookYaw = smoothTo(debug.lookYaw, wantYaw * intensity, dt, 0.12);
      debug.lookPitch = smoothTo(debug.lookPitch, wantPitch * intensity, dt, 0.12);
      Quaternion.RotationYawPitchRollToRef(debug.lookYaw, debug.lookPitch, 0, tmpQ);
      applyQuat(head, headRot, tmpQ);
    }
  });
  return {
    debug,
    setLookTarget(fn) { lookTarget = fn; },
    setActivity(fn) { activity = fn; },
    dispose() { scene.onAfterAnimationsObservable.remove(obs); },
  };
}
