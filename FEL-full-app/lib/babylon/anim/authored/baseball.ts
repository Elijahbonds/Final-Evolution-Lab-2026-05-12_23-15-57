// Baseball packages (Phase 6, 2026-09-03) — RE-AUTHORED as pose targets (ship
// pass 3, rung 1): torso and legs in degrees about the parent's bind axes,
// hands as world-axis metres from the root, fitted at build time by the
// two-bone solver so one authoring plays on any body that passes Gate 0.
// Targets are the positions the previous offset-authored form was solved to.
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD
// (+z). A right-handed batter's load and a pitcher's leg lift are closed
// (right shoulder back), so they key NEGATIVE yaw; contact and release open.
//
//   baseball_stance      — bat up by the back shoulder, knees loaded (loop)
//   baseball_swing       — hips lead, hands sweep through the zone, follow-through
//   baseball_pitch_over  — over-the-top: fastball and changeup (same look)
//   baseball_pitch_side  — three-quarter: the slider's arm slot
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const BASEBALL_CLIPS = ['baseball_stance', 'baseball_swing', 'baseball_pitch_over', 'baseball_pitch_side'] as const;
type V3 = [number, number, number];

// Both hands up by the back shoulder, IN FRONT of the chest. SHARED-ANIM-BUS (2026-09-14): this was [0.30, 1.45, -0.25] —
// behind the root and wide of the back shoulder, so the lead arm had to reach 0.47 m across the chest and locked straight
// (178°) with both hands 0.13–0.15 m behind the chest plane on every stance frame (the eye's "arms locked behind"). Now
// 0.19 m in front, lead elbow ~93°, rear ~47° (tucked, the way a batter's back elbow is): LocoBus ARM_LIMITS.stance.
const BAT_LOAD: V3 = [0.28, 1.32, 0.18];
const LOADED_LEGS: Record<string, Deg3> = { LeftUpLeg: [-24, 0, 12], RightUpLeg: [-24, 0, -12], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] };
const BACK_POLES = { Right: [0.8, -0.2, -0.6] as V3, Left: [0.2, -0.6, -0.8] as V3 };

/**
 * ONE GRIP, ONE ELBOW SIDE (grip sweep, 2026-09-16). Two fists on one handle cannot solve to
 * mirrored elbow poles: the hands share a point, so the arms share a plane, and the elbows
 * trail that plane together as the body turns. This clip used to alternate — BACK_POLES at
 * the load, NO poles at t=0.15 (so the solver's mirrored default), MIRRORED poles at contact
 * ([-0.7,…] left against [+0.7,…] right), then same-side again at the wrap. buildPoseClip
 * solves IK per key and interpolates the resulting BONE ROTATIONS between them, so two arms
 * that keep swapping configuration send their wrists on different paths in between: measured,
 * the fists opened from 0.03 m to 0.57 m at t=0.75 — as far apart as a fighting guard, with
 * the bat held by nobody through the follow-through.
 *
 * `swingPoles` keeps both elbows on the same side and rolls that side through the turn, so
 * the pair reads as one grip for the whole swing.
 */
const swingPoles = (x: number, y: number, z: number) => ({
  Right: [x, y, z] as V3,
  Left: [x - 0.3, y - 0.15, z - 0.1] as V3,   // the trailing fist, just inside the lead elbow
});

/** Right-handed batter: hands together up by the back (right) shoulder. */
export function buildBatStance(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 1.2;
  const key = (t: number, spine: number, hipsY: number) => ({ t, bones: { Hips: [0, -18, 0] as Deg3, Spine: [spine, -14, 0] as Deg3, ...LOADED_LEGS }, hands: { Left: BAT_LOAD, Right: BAT_LOAD }, poles: BACK_POLES, hipsY });
  return buildPoseClip(scene, sk, 'baseball_stance', D, [key(0, 16, -0.05), key(D / 2, 18, -0.06), key(D, 16, -0.05)]);
}

/** The swing: hips open first, hands come through the zone, full follow-through. */
export function buildBatSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_swing', 0.55, [
    { t: 0,    bones: { Hips: [0, -18, 0], Spine: [16, -14, 0], ...LOADED_LEGS }, hands: { Left: BAT_LOAD, Right: BAT_LOAD }, poles: BACK_POLES, hipsY: -0.05 },
    { t: 0.15, bones: { Hips: [0, 10, 0],  Spine: [12, 20, 0],  LeftUpLeg: [-18, 0, 10], RightUpLeg: [-26, 0, -9], LeftLeg: [24, 0, 0], RightLeg: [30, 0, 0] }, hands: { Left: [0.25, 1.20, 0.15], Right: [0.30, 1.22, 0.05] }, poles: swingPoles(0.70, -0.35, -0.60), hipsY: -0.07 },
    // contact: extended through the zone in front
    { t: 0.3,  bones: { Hips: [0, 55, 0],  Spine: [8, 50, 0],   LeftUpLeg: [-10, 0, 8],  RightUpLeg: [-30, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Left: [0.10, 1.15, 0.55], Right: [0.14, 1.15, 0.52] }, poles: swingPoles(0.25, -0.60, -0.65), hipsY: -0.06 },
    // mid follow-through: the fists are still together, and without this key the 0.3 -> 0.55
    // rotation interpolation was free to walk them apart across the fastest part of the swing.
    { t: 0.42, bones: { Hips: [0, 57, 0], Spine: [7, 52, 0], LeftUpLeg: [-11, 0, 8], RightUpLeg: [-30, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Left: [-0.13, 1.35, 0.33], Right: [-0.08, 1.35, 0.33] }, poles: swingPoles(-0.10, -0.55, -0.63), hipsY: -0.04 },
    // wrapped high on the left
    { t: 0.55, bones: { Hips: [0, 60, 0],  Spine: [6, 55, 0],   LeftUpLeg: [-12, 0, 8],  RightUpLeg: [-30, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Left: [-0.35, 1.55, 0.10], Right: [-0.30, 1.55, 0.14] }, poles: swingPoles(-0.45, -0.50, -0.60), hipsY: -0.02 },
  ]);
}

// ── THE BAT'S LINE (ANIM-SURGICAL, 2026-09-14) ──────────────────────────────────────────────────────────────────────────
// The derby bat was a child of the RightHand bone with ONE grip solved from that bone's world rotation after 8 stance
// frames. Two things broke it, measured on dev :3061 and in the eye's prod frames: the rig root is x-mirrored against the
// node, so the hand's decomposed world rotation is not the rotation the barrel should be solved in (the bat hung DOWN
// through the fists on the kit body), and a fixed hand-local grip turns with the right wrist alone — the lead hand was
// nowhere near the handle on the scan body, and the swing carried the barrel wherever the wrist bone's axes pointed.
// A two-handed bat is not a hand prop. Its handle runs through BOTH fists and its barrel points where the swing says,
// so the mode places it every frame from the two hand positions and this track. Root frame, the same axes the hand
// targets above use: +x the batter's right (the catcher's side), +y up, +z toward the plate.
export const BAT_SWING_SEC = 0.55;
/** [t, direction knob→barrel]: loaded up and back over the rear shoulder, laid back as the hips fire, round behind the
 *  hands, flat through the zone at contact (perpendicular to the pitch, over the plate), wrapped round to the pitcher's
 *  side and finished behind the back over the lead shoulder. The in-betweens keep neighbouring keys < 120° apart so a
 *  normalised blend never folds through zero. */
export const BAT_LINE: ReadonlyArray<readonly [number, V3]> = [
  [0, [0.38, 0.86, -0.34]],
  [0.15, [0.80, 0.45, -0.40]],
  [0.22, [0.70, 0.10, 0.70]],
  [0.30, [0.0, -0.05, 1.0]],
  [0.42, [-0.95, 0.10, 0.25]],
  [0.49, [-0.55, 0.05, -0.83]],
  [BAT_SWING_SEC, [0.35, -0.15, -0.92]],
];
/** Seconds the finished barrel takes to come back up into the load once the swing has settled into the stance. */
export const BAT_RECOVER_SEC = 0.35;

/** ANIM-RESIDUAL (2026-09-14): which way the batter's RIGHT lies along the root's +x axis — the axis BAT_LINE is authored
 *  in, (cos yaw, 0, −sin yaw) in world space. On the runtime rig it is the NEGATIVE side (the rig is mirrored against the
 *  node), so a barrel laid off along +x crossed the batter's face. `across` is RightArm − LeftArm in world space, read on
 *  the stance; returns ±1, or 0 while the shoulders are too square-on to tell (|along| ≤ 0.12 m). */
export function batRightSign(acrossX: number, acrossZ: number, yaw: number): -1 | 0 | 1 {
  const along = acrossX * Math.cos(yaw) - acrossZ * Math.sin(yaw);
  return Math.abs(along) > 0.12 ? (along > 0 ? 1 : -1) : 0;
}

const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mix = (a: V3, b: V3, k: number): V3 => nrm([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);

/** The barrel's direction (unit, root frame) `sec` seconds after the swing started; null = no swing (the load). Past the
 *  follow-through the barrel recovers into the load over BAT_RECOVER_SEC. */
export function batLineAt(sec: number | null): V3 {
  if (sec == null || sec <= 0) return nrm(BAT_LINE[0][1] as V3);
  if (sec >= BAT_SWING_SEC) return mix(BAT_LINE[BAT_LINE.length - 1][1] as V3, BAT_LINE[0][1] as V3, Math.min(1, (sec - BAT_SWING_SEC) / BAT_RECOVER_SEC));
  for (let i = 1; i < BAT_LINE.length; i++) {
    const [t1, d1] = BAT_LINE[i];
    if (sec <= t1) { const [t0, d0] = BAT_LINE[i - 1]; return mix(d0 as V3, d1 as V3, (sec - t0) / (t1 - t0)); }
  }
  return nrm(BAT_LINE[BAT_LINE.length - 1][1] as V3);
}

const PITCH_LEGS = {
  set:  { LeftUpLeg: [-10, 0, 6] as Deg3, LeftLeg: [12, 0, 0] as Deg3, RightUpLeg: [-8, 0, -6] as Deg3, RightLeg: [10, 0, 0] as Deg3 },
  lift: { LeftUpLeg: [-80, 0, 8] as Deg3, LeftLeg: [70, 0, 0] as Deg3, RightUpLeg: [-12, 0, -6] as Deg3, RightLeg: [16, 0, 0] as Deg3 },
  land: { LeftUpLeg: [-30, 0, 10] as Deg3, LeftLeg: [20, 0, 0] as Deg3, RightUpLeg: [-6, 0, -6] as Deg3, RightLeg: [8, 0, 0] as Deg3 },
  done: { LeftUpLeg: [-20, 0, 10] as Deg3, LeftLeg: [20, 0, 0] as Deg3, RightUpLeg: [-4, 0, -6] as Deg3, RightLeg: [6, 0, 0] as Deg3 },
};
/**
 * The glove hand, OUT IN FRONT OF THE CHEST (joint sweep, 2026-09-16). These targets used to sit
 * 0.12-0.15 m in front of the body at shoulder height — which is on top of the shoulder itself,
 * about 0.16 m from the joint, far inside the arm. `hands` is absolute-from-the-root, so the
 * solver can only reach it by folding the elbow shut: measured, the left elbow closed to 11 deg
 * on the side-arm and 16 deg over the top, which is the forearm passing through the bicep. A
 * pitcher's glove rides out in front, not tucked into the armpit.
 */
const GLOVE = { set: [-0.22, 1.08, 0.32] as V3, lift: [-0.24, 1.30, 0.34] as V3, land: [-0.30, 1.12, 0.40] as V3, done: [-0.26, 1.02, 0.30] as V3 };
const OVER_POLE: V3 = [0.9, 0.1, -0.3];

/** Over-the-top delivery: the arm goes high behind, then whips over and forward. */
export function buildPitchOver(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_pitch_over', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [6, 0, 0],     ...PITCH_LEGS.set },  hands: { Right: [0.20, 1.05, -0.25], Left: GLOVE.set }, hipsY: -0.02 },
    // leg lift, arm back and up
    { t: 0.25, bones: { Hips: [0, -15, 0], Spine: [-12, -20, 0], ...PITCH_LEGS.lift }, hands: { Right: [0.20, 1.25, -0.40], Left: GLOVE.lift }, poles: { Right: [0.8, 0.3, -0.5] }, hipsY: 0.02 },
    // over the top, nearly overhead
    { t: 0.42, bones: { Hips: [0, 5, 0],   Spine: [10, 0, 0],    ...PITCH_LEGS.land }, hands: { Right: [0.25, 2.00, -0.05], Left: GLOVE.land }, poles: { Right: OVER_POLE }, hipsY: -0.04 },
    // release forward and down
    { t: 0.7,  bones: { Hips: [0, 20, 0],  Spine: [24, 25, 0],   ...PITCH_LEGS.done }, hands: { Right: [0.30, 1.50, 0.45], Left: GLOVE.done }, poles: { Right: [0.8, 0.2, 0.2] }, hipsY: -0.06 },
  ]);
}

/** Three-quarter delivery (the slider): the same wind-up, a lower arm slot at release. */
export function buildPitchSide(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_pitch_side', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [6, 0, 0],     ...PITCH_LEGS.set },  hands: { Right: [0.20, 1.05, -0.25], Left: GLOVE.set }, hipsY: -0.02 },
    { t: 0.25, bones: { Hips: [0, -15, 0], Spine: [-8, -22, 0],  ...PITCH_LEGS.lift }, hands: { Right: [0.20, 1.25, -0.40], Left: GLOVE.lift }, poles: { Right: [0.8, 0.3, -0.5] }, hipsY: 0.02 },
    // side-top: the arm comes through lower and wider
    { t: 0.42, bones: { Hips: [0, 5, 0],   Spine: [8, 5, 6],     ...PITCH_LEGS.land }, hands: { Right: [0.58, 1.66, -0.10], Left: GLOVE.land }, poles: { Right: [0.6, 0.6, -0.5] }, hipsY: -0.04 },
    // release from the three-quarter slot: shoulder height, out to the side
    { t: 0.7,  bones: { Hips: [0, 20, 0],  Spine: [22, 30, 6],   ...PITCH_LEGS.done }, hands: { Right: [0.58, 1.30, 0.35], Left: GLOVE.done }, poles: { Right: [0.8, -0.2, 0.3] }, hipsY: -0.06 },
  ]);
}
