// dunkTricks — the named dunks (DUNK-CONTROL-JUICE, 2026-09-08): the runway beats and the in-air shapes the owner asked
// for by name. Pose targets like the rest of the suite (hands as world-axis metres from the root fitted by the two-bone
// solver, torso and legs in degrees about the parent's bind axes), so they play on any body that passes Gate 0.
//
// RUNWAY (played over the hold-run, the root keeps moving):
//   dunk_self_lob   — both hands take the ball up and toss it ahead (the ball leaves on SELF_LOB_CONTACT).
//   dunk_kick_up    — the ball is dropped to the foot and kicked up to self (the ball leaves on KICK_UP_CONTACT).
//   dunk_cartwheel  — a straddled cartwheel about the hips, hands to the floor at the inverted beat.
//   dunk_double_up  — the two-foot hop gather: feet together, a hop, and the landing crouch the launch clip starts from.
// AIR (the flight's own owner holds the last frame until feet-down):
//   dunk_scorpion   — chest down, head up, both legs kicked back over the body, the ball hand out to the rim.
//   dunk_lost_found — the ball hand swings it down behind the back, the other hand finds it there and carries it up.
//   dunk_hide_seek  — both hands hide the ball behind the head, a hip fake, the ball hand snaps it overhead.
//   dunk_360_spin   — the 360's body: ball to the chest through the turn, extended at the end (the turn is the mode's yaw layer).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

const UP = { Left: [-0.9, 0.1, -0.3] as V3, Right: [0.9, 0.1, -0.3] as V3 };
const AIR_LEGS: Record<string, Deg3> = { LeftUpLeg: [-30, 0, 6], LeftLeg: [45, 0, 0], RightUpLeg: [-30, 0, -6], RightLeg: [45, 0, 0] };
/** A running stride: one thigh forward, one back. */
const stride = (leftForward: boolean): Record<string, Deg3> => leftForward
  ? { LeftUpLeg: [-38, 0, 4], LeftLeg: [42, 0, 0], RightUpLeg: [24, 0, -4], RightLeg: [34, 0, 0] }
  : { LeftUpLeg: [24, 0, 4], LeftLeg: [34, 0, 0], RightUpLeg: [-38, 0, -4], RightLeg: [42, 0, 0] };

/** Clip-local seconds at which the ball leaves the hands / the foot. */
export const SELF_LOB_CONTACT = 0.3;
/** DUNK-GLASS-BOUNCE: the bounce throw lets go on this clip second (both hands drive the ball DOWN at the floor). */
export const BOUNCE_THROW_CONTACT = 0.3;
export const BOUNCE_THROW_SEC = 0.5;
export const KICK_UP_CONTACT = 0.32;
/** Clip-local second of the lost-and-found's behind-the-back transfer (ballRig parents the ball to the other hand). */
export const LOST_FOUND_HANDOFF = 0.32;
export const SELF_LOB_SEC = 0.5, KICK_UP_SEC = 0.55, CARTWHEEL_SEC = 0.8, DOUBLE_UP_SEC = 0.5;
export const SCORPION_SEC = 0.7, LOST_FOUND_SEC = 0.8, HIDE_SEEK_SEC = 0.8, SPIN_SEC = 0.8;

export function buildSelfLob(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_self_lob', SELF_LOB_SEC, [
    { t: 0,    bones: { Hips: [4, 0, 0], Spine: [10, 0, 0], ...stride(true) },  hands: { Right: [0.24, 0.95, 0.30], Left: [-0.22, 1.05, 0.30] } },   // the ball comes up to the chest in both hands
    { t: 0.15, bones: { Hips: [2, 0, 0], Spine: [4, 0, 0],  ...stride(false) }, hands: { Right: [0.16, 1.35, 0.32], Left: [-0.16, 1.35, 0.32] } },
    { t: SELF_LOB_CONTACT, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], Neck: [-14, 0, 0], ...stride(true) }, hands: { Right: [0.14, 1.98, 0.22], Left: [-0.14, 1.98, 0.22] }, poles: UP },   // the toss: both hands overhead, eyes on it
    { t: SELF_LOB_SEC, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], ...stride(false) }, hands: { Right: [0.26, 1.35, 0.25], Left: [-0.26, 1.35, 0.25] } },   // follow-through, arms settling
  ]);
}

/** DUNK-GLASS-BOUNCE: the bounce lob's throw — the ball up to the chest in both hands, a short lift, then both hands drive it
 *  DOWN and forward past the hips (the WDA bounce pass to yourself), the trunk folding with it, eyes following the ball. */
export function buildBounceThrow(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_bounce_throw', BOUNCE_THROW_SEC, [
    { t: 0,    bones: { Hips: [4, 0, 0], Spine: [8, 0, 0], ...stride(true) },  hands: { Right: [0.22, 1.05, 0.28], Left: [-0.22, 1.05, 0.28] } },   // the ball at the chest, two hands
    { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], ...stride(false) }, hands: { Right: [0.20, 1.40, 0.22], Left: [-0.20, 1.40, 0.22] } },   // a short lift to load the throw
    { t: BOUNCE_THROW_CONTACT, bones: { Hips: [18, 0, 0], Spine: [40, 0, 0], Neck: [20, 0, 0], ...stride(true) }, hands: { Right: [0.18, 0.60, 0.46], Left: [-0.18, 0.60, 0.46] }, poles: UP },   // the throw: both hands drive it down and out, the trunk folds, eyes on the floor
    { t: BOUNCE_THROW_SEC, bones: { Hips: [4, 0, 0], Spine: [6, 0, 0], Neck: [-12, 0, 0], ...stride(false) }, hands: { Right: [0.26, 1.10, 0.30], Left: [-0.26, 1.10, 0.30] } },   // up out of it, eyes up for the bounce
  ]);
}

export function buildKickUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const plant: Record<string, Deg3> = { LeftUpLeg: [-10, 0, 4], LeftLeg: [14, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_kick_up', KICK_UP_SEC, [
    { t: 0,    bones: { Hips: [16, 0, 0], Spine: [36, 0, 0], Neck: [-10, 0, 0], ...plant, RightUpLeg: [10, 0, -4], RightLeg: [20, 0, 0] },   hands: { Right: [0.24, 0.62, 0.40], Left: [-0.36, 1.00, 0.16] } },   // bent over: the ball goes down toward the foot
    { t: 0.15, bones: { Hips: [4, 0, 0], Spine: [8, 0, 0],  ...plant, RightUpLeg: [38, 0, -4], RightLeg: [62, 0, 0] },   hands: { Right: [0.36, 1.00, 0.10], Left: [-0.40, 1.10, 0.05] } },   // the leg loads back
    { t: KICK_UP_CONTACT, bones: { Hips: [-4, 0, 0], Spine: [-12, 0, 0], Neck: [-16, 0, 0], ...plant, RightUpLeg: [-78, 0, -4], RightLeg: [12, 0, 0] }, hands: { Right: [0.50, 1.20, -0.10], Left: [-0.50, 1.25, 0.10] } },   // the kick: foot up front, arms out for balance
    { t: KICK_UP_SEC, bones: { Hips: [2, 0, 0], Spine: [0, 0, 0], Neck: [-12, 0, 0], ...plant, RightUpLeg: [-22, 0, -4], RightLeg: [34, 0, 0] }, hands: { Right: [0.30, 1.30, 0.20], Left: [-0.30, 1.30, 0.20] } },   // the leg comes down, eyes on the ball
  ]);
}

/** A straddled cartwheel about the hips: the body rolls a full turn over its forward axis; the hands trace the roll so
 *  they reach the floor at the inverted beat, and the hips rise through it (a real cartwheel pivots over the hands). */
export function buildCartwheel(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hipsAt = 0.96;   // REF_HIPS_Y — the targets are authored for the forge hero and scaled per body by the builder
  const hand = (side: -1 | 1, deg: number): V3 => {
    const r = (deg * Math.PI) / 180, x = side * 0.30, y = 0.95;   // overhead, a little spread, relative to the hips (an arm's reach)
    return [x * Math.cos(r) + y * Math.sin(r), hipsAt - x * Math.sin(r) + y * Math.cos(r), 0.05];   // the rig rolls +z toward +x (measured)
  };
  const key = (t: number, roll: number, hipsY: number) => ({
    t, bones: { Hips: [0, 0, roll] as Deg3, Spine: [-4, 0, 0] as Deg3, Neck: [0, 0, 0] as Deg3, LeftUpLeg: [-6, 0, 48] as Deg3, LeftLeg: [6, 0, 0] as Deg3, RightUpLeg: [-6, 0, -48] as Deg3, RightLeg: [6, 0, 0] as Deg3 },
    hands: { Left: hand(-1, roll), Right: hand(1, roll) }, hipsY,
  });
  return buildPoseClip(scene, sk, 'dunk_cartwheel', CARTWHEEL_SEC, [
    key(0, 0, 0), key(0.2, 90, 0.14), key(0.4, 180, 0.25), key(0.6, 270, 0.14), key(CARTWHEEL_SEC, 360, 0),
  ]);
}

/** The two-foot hop gather: feet together, a hop, and the loaded landing crouch the launch clip starts from. */
export function buildDoubleUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const together = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 5], LeftLeg: [knee, 0, 0], RightUpLeg: [thigh, 0, -5], RightLeg: [knee, 0, 0] });
  return buildPoseClip(scene, sk, 'dunk_double_up', DOUBLE_UP_SEC, [
    { t: 0,    bones: { Hips: [4, 0, 0], Spine: [10, 0, 0], ...stride(true) },       hands: { Right: [0.26, 0.95, 0.20], Left: [-0.26, 1.00, 0.10] }, hipsY: 0 },
    { t: 0.12, bones: { Hips: [8, 0, 0], Spine: [24, 0, 0], ...together(-42, 62) },  hands: { Right: [0.26, 0.82, -0.30], Left: [-0.26, 0.82, -0.30] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.18 },   // feet together, loaded, arms back
    { t: 0.3,  bones: { Hips: [-2, 0, 0], Spine: [-4, 0, 0], ...together(-22, 36) },  hands: { Right: [0.30, 1.32, 0.32], Left: [-0.30, 1.32, 0.32] }, hipsY: 0.24 },   // the hop
    { t: DOUBLE_UP_SEC, bones: { Hips: [4, 0, 0], Spine: [30, 0, 0], ...together(-55, 80) }, hands: { Right: [0.28, 0.85, -0.30], Left: [-0.28, 0.85, -0.30] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.22 },   // the landing crouch = dunk_launch's first key
  ]);
}

/** Scorpion: chest down, head up, both legs kicked back over the body, the ball hand out to the rim. */
export function buildScorpion(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_scorpion', SCORPION_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [0, 0, 0], ...AIR_LEGS }, hands: { Right: [0.20, 1.90, 0.15], Left: [-0.22, 1.82, 0.15] }, poles: UP },
    { t: 0.35, bones: { Hips: [18, 0, 0], Spine: [32, 0, 0], Neck: [-30, 0, 0], LeftUpLeg: [58, 0, 8], LeftLeg: [112, 0, 0], RightUpLeg: [58, 0, -8], RightLeg: [112, 0, 0] }, hands: { Right: [0.18, 1.96, 0.42], Left: [-0.46, 1.30, -0.10] }, poles: { Right: UP.Right, Left: [-0.9, -0.2, -0.5] }, hipsY: 0.1 },   // the scorpion
    { t: 0.5,  bones: { Hips: [16, 0, 0], Spine: [28, 0, 0], Neck: [-26, 0, 0], LeftUpLeg: [52, 0, 8], LeftLeg: [108, 0, 0], RightUpLeg: [52, 0, -8], RightLeg: [108, 0, 0] }, hands: { Right: [0.16, 1.98, 0.40], Left: [-0.44, 1.32, -0.08] }, poles: { Right: UP.Right, Left: [-0.9, -0.2, -0.5] }, hipsY: 0.08 },
    { t: SCORPION_SEC, bones: { Hips: [4, 0, 0], Spine: [6, 0, 0], Neck: [-8, 0, 0], LeftUpLeg: [10, 0, 4], LeftLeg: [40, 0, 0], RightUpLeg: [10, 0, -4], RightLeg: [40, 0, 0] }, hands: { Right: [0.15, 1.92, 0.36], Left: [-0.30, 1.50, 0.10] }, poles: UP },   // the flush
  ]);
}

/** Lost & found: the ball hand takes it down behind the back, the other hand finds it there and carries it up to the rim. */
export function buildLostFound(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_lost_found', LOST_FOUND_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], ...AIR_LEGS }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.30, 0.15] } },
    { t: 0.2,  bones: { Hips: [0, 18, 0], Spine: [4, 14, 0], ...AIR_LEGS }, hands: { Right: [0.26, 0.90, -0.32], Left: [-0.34, 1.10, -0.05] }, poles: { Right: [0.9, -0.2, -0.3] } },   // lost: the ball swings down behind the hip
    { t: LOST_FOUND_HANDOFF, bones: { Hips: [2, 30, 0], Spine: [6, 22, 0], ...AIR_LEGS }, hands: { Right: [0.10, 0.92, -0.34], Left: [-0.08, 0.92, -0.34] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] } },   // found: both hands meet behind the back
    { t: 0.5,  bones: { Hips: [0, -8, 0], Spine: [-4, -10, 0], ...AIR_LEGS }, hands: { Left: [-0.52, 1.30, 0.05], Right: [0.40, 1.15, -0.10] }, poles: { Left: [-0.9, -0.2, -0.4] } },   // the other hand carries it out and up
    { t: LOST_FOUND_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], LeftUpLeg: [-26, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-14, 0, -4], RightLeg: [18, 0, 0] }, hands: { Left: [-0.14, 2.02, 0.26], Right: [0.36, 1.42, -0.10] }, poles: { Left: UP.Left } },   // extended to the rim, left-handed
  ]);
}

/** Hide & seek: both hands hide the ball behind the head, a hip fake, the ball hand snaps it overhead for the flush. */
export function buildHideSeek(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_hide_seek', HIDE_SEEK_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR_LEGS }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.30, 0.15] } },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [16, 0, 0], ...AIR_LEGS }, hands: { Right: [0.10, 1.66, -0.30], Left: [-0.10, 1.64, -0.32] }, poles: { Right: [0.9, 0.2, -0.3], Left: [-0.9, 0.2, -0.3] } },   // hidden behind the head
    { t: 0.45, bones: { Hips: [0, 26, 0], Spine: [-4, 8, 0], Neck: [14, -10, 0], ...AIR_LEGS }, hands: { Right: [0.08, 1.66, -0.32], Left: [-0.12, 1.64, -0.30] }, poles: { Right: [0.9, 0.2, -0.3], Left: [-0.9, 0.2, -0.3] } },   // the fake: hips turn, the ball stays hidden
    { t: 0.65, bones: { Hips: [-4, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR_LEGS }, hands: { Right: [0.18, 2.00, 0.12], Left: [-0.42, 1.40, 0.00] }, poles: { Right: UP.Right } },   // the reveal: snapped overhead
    { t: HIDE_SEEK_SEC, bones: { Hips: [-4, 0, 0], Spine: [-10, 0, 0], Neck: [-12, 0, 0], LeftUpLeg: [-20, 0, 4], LeftLeg: [26, 0, 0], RightUpLeg: [-14, 0, -4], RightLeg: [18, 0, 0] }, hands: { Right: [0.14, 2.02, 0.30], Left: [-0.34, 1.45, 0.05] }, poles: { Right: UP.Right } },
  ]);
}

/** The 360: the BODY of the turn — the ball gathered to the chest through the middle of the spin, extended to the rim at
 *  the end, the legs tucked. The turn itself is NOT keyed here (DUNK-BIOMECH, 2026-09-08): the mode drives a whole-turn
 *  yaw layer on the hips from the trick's cue (DunkSpin), resolved rim-facing by the carry-up whatever the flight has
 *  left. Authored into the clip, a crossfade into the finish (or a second trick) cut the turn half-way — a slam frame
 *  with the chest to the crowd and a hips slerp through nowhere. Hips yaw 0 on every key: the layer owns it. */
export function buildSpin360(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // the knees tucked the whole turn (a real 360 pulls the feet up; over a car the feet are what clears it — the flat AIR_LEGS
  // hung the feet 0.15 m under the mocap's own tuck and caught the near door at +0.4 s), let down for the extension
  const TUCK: Record<string, Deg3> = { LeftUpLeg: [-55, 0, 6], LeftLeg: [80, 0, 0], RightUpLeg: [-55, 0, -6], RightLeg: [80, 0, 0] };
  const TUCK_IN: Record<string, Deg3> = { LeftUpLeg: [-46, 0, 6], LeftLeg: [66, 0, 0], RightUpLeg: [-46, 0, -6], RightLeg: [66, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_360_spin', SPIN_SEC, [
    { t: 0,    bones: { Hips: [-4, 0, 0], Spine: [-8, 0, 0], Neck: [-6, 0, 0], ...TUCK_IN },  hands: { Right: [0.20, 1.92, 0.12], Left: [-0.26, 1.72, 0.10] }, poles: UP },
    { t: 0.3,  bones: { Hips: [2, 0, 0], Spine: [6, 0, 0], Neck: [4, 0, 0], ...TUCK },    hands: { Right: [0.16, 1.28, 0.30], Left: [-0.16, 1.28, 0.30] }, poles: { Left: [-0.8, -0.3, -0.5], Right: [0.8, -0.3, -0.5] } },   // the ball gathered to the chest through the turn
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-4, 0, 0], ...TUCK },  hands: { Right: [0.18, 1.62, 0.26], Left: [-0.24, 1.50, 0.18] }, poles: UP },   // coming out of the turn: the ball rises
    { t: SPIN_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR_LEGS }, hands: { Right: [0.16, 2.00, 0.28], Left: [-0.28, 1.60, 0.12] }, poles: UP },   // extended to the rim
  ]);
}
