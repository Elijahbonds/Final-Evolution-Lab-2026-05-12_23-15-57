// A bodyweight squat, built in 3-D and filmed through the app's own virtual webcam (MIRROR-COACH P1, 2026-09-25).
//
// Shared by rules/squat-audit.test.ts (the knee and arm reads, noise-free) and scripts/probes/_mirror-valgus-jitter-p1.ts
// (the same squat under the synth's landmark jitter). lib/pose/synth.ts's synthesize() refuses a mirrored source
// (assertHandedness), so a fixture built here cannot quietly mirror the subject the way scripts/mirror-coach-tests.ts's
// hand-built frame did before this pass.
//
// Synth world: metres, Y up, the subject facing +Z (the camera), the subject's LEFT on +X — so, filmed, the left side
// lands on the image's right, as on the Mirror's real (non-mirrored) stream.
import { synthesize, restPose, type Joints, type JointClip, type V3, type SynthOptions } from '@/lib/pose/synth';
import { MIRROR_INDEX, type PoseFrame as LibPoseFrame } from '@/lib/pose/landmarks';
import type { PoseFrame } from '../../pose/mediapipe-adapter';

export interface SquatShape {
  /** Each knee's sideways travel at the bottom (m): + = OUTWARD for that leg, − = inward (caving). */
  shiftL?: number;
  shiftR?: number;
  /** Extra forward lean of the upper body at the bottom (m, toward the camera). */
  lean?: number;
  /** The upper body sideways at the bottom (m, +X = the subject's left). */
  sideways?: number;
  /** How far the pelvis drops at the bottom (m; default 0.42, which stays above the audit's standing knee line). */
  drop?: number;
  /**
   * The whole body turned about the vertical through the pelvis (degrees). 0 faces the camera; −90 is side-on with the
   * LEFT shoulder to the camera (screen.ts TURN_CUE.side), +90 the right. MIRROR-COACH P1 review (2026-09-25): the
   * knee read on a turned squat.
   */
  turnDeg?: number;
}

/** One squat frame at depth `d` (0..1). */
export function squatJoints(d: number, shape: SquatShape = {}): Joints {
  const j = restPose();
  const drop = (shape.drop ?? 0.42) * d, back = 0.22 * d;
  const move = (p: V3, dy: number, dz: number, dx = 0): V3 => [p[0] + dx, p[1] + dy, p[2] + dz];
  // the pelvis sits down and back; the trunk leans a little over the feet and rides down with it
  for (const k of ['Hips', 'LeftUpLeg', 'RightUpLeg'] as const) j[k] = move(j[k], -drop, -back);
  for (const k of ['Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'] as const) {
    j[k] = move(j[k], -drop, (0.05 + (shape.lean ?? 0)) * d, (shape.sideways ?? 0) * d);
  }
  // the knees travel forward over the toes, and sideways by the shift (outward is +X for the left, −X for the right)
  j.LeftLeg = move(j.LeftLeg, -0.04 * d, 0.22 * d, (shape.shiftL ?? 0) * d);
  j.RightLeg = move(j.RightLeg, -0.04 * d, 0.22 * d, -(shape.shiftR ?? 0) * d);
  return shape.turnDeg ? turn(j, shape.turnDeg) : j;
}

/** Rotate every joint about the vertical through the standing pelvis: + turns the body's front (+Z) toward +X. */
function turn(j: Joints, deg: number): Joints {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const [px, , pz] = restPose().Hips;
  const out = {} as Joints;
  for (const k of Object.keys(j) as (keyof Joints)[]) {
    const [x, y, z] = j[k], dx = x - px, dz = z - pz;
    out[k] = [px + dx * c + dz * s, y, pz - dx * s + dz * c];
  }
  return out;
}

/** Stand 1 s (the audit calibrates), descend 0.7 s, hold 0.4 s, rise 0.7 s, stand 0.4 s — at 30 fps. */
export function squatClip(shape: SquatShape = {}): JointClip {
  const frames: Joints[] = [];
  const push = (n: number, depthAt: (i: number) => number) => { for (let i = 0; i < n; i++) frames.push(squatJoints(depthAt(i), shape)); };
  push(30, () => 0);
  push(21, (i) => (i + 1) / 21);
  push(12, () => 1);
  push(21, (i) => 1 - (i + 1) / 21);
  push(12, () => 0);
  return { fps: 30, frames };
}

/** lib/pose's frame → the Mirror adapter's frame (the only difference is the field names). */
export const toMirrorFrame = (f: LibPoseFrame): PoseFrame => ({
  present: f.present, timestampMs: f.t,
  landmarks: f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.v })),
});

/** A selfie stream: flip x AND swap the left/right labels — what a mirrored camera does to MediaPipe's output. */
export const mirrorFrame = (f: PoseFrame): PoseFrame => ({
  ...f, landmarks: f.landmarks.map((_, i) => { const s = f.landmarks[MIRROR_INDEX[i]]; return { ...s, x: 1 - s.x }; }),
});

/** Noise-free and nothing dropped: the geometry alone. */
export const CLEAN: SynthOptions = { noise: false, dropRate: 0, missRate: 0, frameJitterMs: 0 };

/** Film one squat as the Mirror's adapter would hand it over. */
export function filmSquat(shape: SquatShape = {}, opt: SynthOptions = CLEAN, mirrored = false): PoseFrame[] {
  const frames = synthesize(squatClip(shape), opt).frames.map(toMirrorFrame);
  return mirrored ? frames.map(mirrorFrame) : frames;
}
