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
/**
 * BETWEEN THE LEGS (2026-09-14) — the hardest trick in the list, and until today it had no body of its own.
 *
 * `DUNK_TRICKS.betweenlegs` pointed at `dunk_360_fake_eastbay`, which `clipAliases` resolves straight to
 * `dunk_360_eastbay` — the EASTBAY's clip. Two tricks, two names, two difficulties (3.4 and 3.8), two
 * buttons, and one animation: a player throwing the hardest dunk in the game watched the one they had
 * already seen. Eight names, seven bodies.
 *
 * The shape is the real one: the ball goes DOWN and THROUGH the gap the split legs make, changes hands
 * under the lead thigh, and comes up the other side. That is why the legs split rather than tuck — the gap
 * is the trick, and a body that keeps AIR_LEGS has nothing for the ball to pass through.
 */
export const BETWEEN_LEGS_SEC = 0.8;
/** Rock the cradle: the ball circles the head on a bent arm, then is driven down. */
export const CRADLE_SEC = 0.75;
/** Double clutch: the ball is brought all the way down to the waist at the apex and thrown back up. */
export const CLUTCH_SEC = 0.7;
/** Clip-local second the cradle's ball passes closest to the head — the rig keeps it in the one hand. */
export const CRADLE_ROUND = 0.34;
/** Clip-local second the ball changes hands under the thigh (DunkMode reparents it here, as it does for lost & found). */
export const BETWEEN_LEGS_HANDOFF = 0.34;

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

/**
 * THE BACK HANDSPRING (owner, 2026-09-16: "make the cartwheel more of a back handspring").
 *
 * It was a straddled CARTWHEEL — a roll about the body's FORWARD axis, the wheel turning sideways toward the rim, which
 * is a gymnastic move nobody has ever put in front of a dunk. A handspring goes over BACKWARDS: the chest opens, the
 * hands reach back over the head and plant, the hips drive up over the hands, the legs whip over the top, and the feet
 * come down under a body that never stopped facing the rim. That last part is why it belongs on a dunk runway and the
 * cartwheel never did — you land looking at the basket, still running at it.
 *
 * So the rotation is a PITCH about the body's right axis (Hips x), keyed in quarter turns so each interpolation is
 * unambiguous, and the hands trace that pitch: overhead at the arch, down behind the head at the plant, pushing off as
 * the legs come over. The legs stay long through the whip — a tucked handspring is a back tuck, a different move.
 */
export function buildBackHandspring(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hipsAt = 0.96;   // REF_HIPS_Y — the targets are authored for the forge hero and scaled per body by the builder
  /** A hand carried around the BACKWARD pitch: overhead at 0, behind and down at the plant, under the body at 180. */
  const hand = (side: -1 | 1, deg: number): V3 => {
    const r = (deg * Math.PI) / 180, x = side * 0.26, y = 0.92, z = 0.06;
    // pitching backwards about +x carries the reach from overhead (+y) toward BEHIND (−z) and then under (−y)
    return [x, hipsAt + y * Math.cos(r) - z * Math.sin(r), -(y * Math.sin(r) + z * Math.cos(r)) + z];
  };
  const key = (t: number, pitch: number, hipsY: number, legWhip: number) => ({
    t,
    bones: {
      Hips: [-pitch, 0, 0] as Deg3,                       // negative x = the chest opening backwards on this rig
      Spine: [-14, 0, 0] as Deg3, Neck: [-16, 0, 0] as Deg3,   // the head leads the arch, eyes back for the floor
      LeftUpLeg: [-4 + legWhip, 0, 7] as Deg3, LeftLeg: [10, 0, 0] as Deg3,
      RightUpLeg: [-4 + legWhip, 0, -7] as Deg3, RightLeg: [10, 0, 0] as Deg3,
    },
    hands: { Left: hand(-1, pitch), Right: hand(1, pitch) }, hipsY,
  });
  return buildPoseClip(scene, sk, 'dunk_back_handspring', CARTWHEEL_SEC, [
    key(0, 0, 0, 0),              // stand tall, chest opening
    key(0.18, 70, 0.06, -18),     // the reach back — hands going for the floor behind, hips leading
    key(0.36, 165, 0.30, -34),    // the plant: inverted over the hands, legs long overhead
    key(0.56, 255, 0.26, 26),     // the whip: legs come over the top, the push off the hands
    key(CARTWHEEL_SEC, 360, 0, 0),   // feet down, still facing the rim, still running at it
  ]);
}

/**
 * THE BACKFLIP (owner, 2026-09-16: "add back flip dunks").
 *
 * The real ones are thrown on the APPROACH, not over the rim: the ball goes up ahead of you, you flip under it, land
 * running, catch it and go. So this is the handspring's rotation with the hands taken OUT of it — nothing to plant on,
 * so the tuck is what gets you round: knees to the chest, arms pulled in tight, the whole body a smaller wheel that
 * turns faster. The hips carry a real arc (up through the rotation, down onto the landing) because a flip that spins on
 * the spot at a constant height reads as a cartoon.
 *
 * Landing FACING THE RIM matters as much as it does for the handspring — the flight that follows is a run-up, and a
 * dunker who lands backwards has thrown the ball away.
 */
export const BACKFLIP_SEC = 0.9;
export function buildBackflip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  /** Arms pulled in through the tuck: at the chest, a little forward, riding the rotation. */
  const hand = (side: -1 | 1, deg: number): V3 => {
    const r = (deg * Math.PI) / 180, x = side * 0.20, y = 0.42, z = 0.26;
    return [x, 0.96 + y * Math.cos(r) - z * Math.sin(r), -(y * Math.sin(r) + z * Math.cos(r)) + z];
  };
  const key = (t: number, pitch: number, hipsY: number, tuck: number) => ({
    t,
    bones: {
      Hips: [-pitch, 0, 0] as Deg3, Spine: [-8 - tuck * 0.3, 0, 0] as Deg3, Neck: [-14, 0, 0] as Deg3,
      LeftUpLeg: [-tuck, 0, 6] as Deg3, LeftLeg: [tuck * 1.25, 0, 0] as Deg3,
      RightUpLeg: [-tuck, 0, -6] as Deg3, RightLeg: [tuck * 1.25, 0, 0] as Deg3,
    },
    hands: { Left: hand(-1, pitch), Right: hand(1, pitch) }, hipsY,
  });
  return buildPoseClip(scene, sk, 'dunk_backflip', BACKFLIP_SEC, [
    key(0, 0, -0.12, 18),              // the load: a dip, the ball already leaving
    key(0.16, 55, 0.22, 74),           // drive: hips up, knees snapping to the chest
    key(0.38, 170, 0.34, 96),          // inverted, tucked tight — the top of the flip
    key(0.60, 280, 0.20, 78),          // coming round, the tuck starting to open
    key(0.78, 340, 0.02, 34),          // legs reaching for the floor
    key(BACKFLIP_SEC, 360, -0.10, 22), // landed, knees soft, running at the rim again
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

/**
 * LOST & FOUND — and it is a 360 (audit, 2026-09-16).
 *
 * Kilganon's own, and the thing that makes it the dunk it is: he throws the ball behind his own back — a self-oop to
 * nowhere — turns a full 360 under it, finds it on the way round and jams it. ESPN's description when he debuted it in
 * 2015 is "a self-alley-oop behind his own back with a 360 spin".
 *
 * Ours had the behind-the-back part and neither of the others: no turn, and the clip keyed its own little hip yaw
 * (18°, 30°, −8°) which is exactly what a spinThrough trick must NOT do — the mode drives whole turns as a yaw LAYER on
 * the hips (DunkSpin) so a crossfade can never cut a turn half-way, and a clip that also yaws fights it. Hips yaw is 0
 * on every key here now; the layer owns the 360, the arms own the lost-and-found.
 *
 * The hand-off is timed to the turn: the ball goes behind the back as the body starts round, both hands meet at
 * LOST_FOUND_HANDOFF with the back to the rim, and it comes out overhead on the far side as the turn resolves.
 */
export function buildLostFound(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_lost_found', LOST_FOUND_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], ...AIR_LEGS }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.30, 0.15] } },
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...AIR_LEGS }, hands: { Right: [0.26, 0.90, -0.34], Left: [-0.34, 1.10, -0.05] }, poles: { Right: [0.9, -0.2, -0.3] } },   // lost: the ball goes behind the back as the turn starts
    { t: LOST_FOUND_HANDOFF, bones: { Hips: [2, 0, 0], Spine: [6, 0, 0], ...AIR_LEGS }, hands: { Right: [0.10, 0.92, -0.36], Left: [-0.08, 0.92, -0.36] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] } },   // found: both hands meet behind the back, back to the rim
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], ...AIR_LEGS }, hands: { Left: [-0.52, 1.30, 0.05], Right: [0.40, 1.15, -0.10] }, poles: { Left: [-0.9, -0.2, -0.4] } },   // coming round with it
    { t: LOST_FOUND_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], LeftUpLeg: [-26, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-14, 0, -4], RightLeg: [18, 0, 0] }, hands: { Left: [-0.14, 2.02, 0.26], Right: [0.36, 1.42, -0.10] }, poles: { Left: UP.Left } },   // extended to the rim, left-handed
  ]);
}

/** Between the legs: the ball dropped through the split, swapped under the lead thigh, and carried up the far side. */
export function buildBetweenLegs(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // The split: the LEAD (left) thigh drives up and the trail leg kicks back, which is what opens the gap.
  // AIR_LEGS is deliberately not used here — a tucked body has nowhere to put the ball.
  const SPLIT: Record<string, Deg3> = { LeftUpLeg: [-86, 0, 10], LeftLeg: [58, 0, 0], RightUpLeg: [34, 0, -8], RightLeg: [64, 0, 0] };
  const SPLIT_WIDE: Record<string, Deg3> = { LeftUpLeg: [-98, 0, 14], LeftLeg: [44, 0, 0], RightUpLeg: [44, 0, -10], RightLeg: [78, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_between_legs', BETWEEN_LEGS_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR_LEGS }, hands: { Right: [0.26, 1.62, 0.30], Left: [-0.30, 1.32, 0.14] } },
    // the knees come up and the trunk folds over them — the dunker makes the gap before the ball goes near it
    { t: 0.18, bones: { Hips: [14, 0, 0], Spine: [20, 0, 0], Neck: [-18, 0, 0], ...SPLIT }, hands: { Right: [0.22, 1.20, 0.34], Left: [-0.26, 1.22, 0.22] }, hipsY: 0.06 },
    // THROUGH: the ball hand takes it down past the lead thigh, eyes down on it
    { t: 0.28, bones: { Hips: [20, 0, 0], Spine: [26, 0, 0], Neck: [-26, 0, 0], ...SPLIT_WIDE }, hands: { Right: [0.16, 0.86, 0.30], Left: [-0.30, 1.06, 0.18] }, poles: { Right: [0.9, -0.3, -0.2] }, hipsY: 0.1 },
    // the swap, under the thigh: both palms meet on the ball, which is what makes the transfer read
    { t: BETWEEN_LEGS_HANDOFF, bones: { Hips: [20, 0, 0], Spine: [26, 0, 0], Neck: [-28, 0, 0], ...SPLIT_WIDE }, hands: { Right: [0.06, 0.84, 0.32], Left: [-0.10, 0.84, 0.32] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] }, hipsY: 0.1 },
    // up the far side: the legs close, the trunk opens out of the fold, the left hand carries it
    { t: 0.52, bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0], LeftUpLeg: [-44, 0, 8], LeftLeg: [54, 0, 0], RightUpLeg: [4, 0, -6], RightLeg: [46, 0, 0] }, hands: { Left: [-0.46, 1.28, 0.20], Right: [0.38, 1.10, 0.06] }, poles: { Left: [-0.9, -0.1, -0.4] }, hipsY: 0.04 },
    // the flush, left-handed, the body long — the same shape lost & found finishes in, because both end the same way
    { t: BETWEEN_LEGS_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], LeftUpLeg: [-24, 0, 4], LeftLeg: [28, 0, 0], RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] }, hands: { Left: [-0.14, 2.02, 0.26], Right: [0.36, 1.40, -0.08] }, poles: { Left: UP.Left } },
  ]);
}

/**
 * ROCK THE CRADLE — the ball swung in a circle around the head on one bent arm, then hammered down.
 *
 * One hand the whole way, which is what separates it from lost & found and between the legs: those are
 * TRANSFERS and this is a carry. The circle is keyed as four hand positions around the head rather than as
 * a bone rotation, because the arm's shape through it is the trick and a wrist spin would not read.
 */
export function buildCradle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // RECOGNISABLE ON SIGHT (2026-09-15): the first circle hugged the head and photographed as a windmill from the rim camera.
  // The cradle's read is a BIG ring around the head at shoulder height on a bent arm, with the trunk turning to follow it:
  // far out to the side, round behind the head, across to the far shoulder, then hammered down.
  return buildPoseClip(scene, sk, 'dunk_cradle', CRADLE_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR_LEGS }, hands: { Right: [0.28, 1.58, 0.28], Left: [-0.30, 1.30, 0.14] } },
    { t: 0.16, bones: { Hips: [0, -10, 0], Spine: [-6, -14, 4], Neck: [-4, 8, 0], ...AIR_LEGS }, hands: { Right: [0.72, 1.62, 0.02], Left: [-0.34, 1.32, 0.10] }, poles: { Right: [0.6, -0.6, -0.3] } },   // far out to the side at the shoulder
    { t: CRADLE_ROUND, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [12, 0, 0], ...AIR_LEGS }, hands: { Right: [0.08, 2.00, -0.40], Left: [-0.34, 1.34, 0.08] }, poles: { Right: [0.7, 0.4, -0.5] } },   // round BEHIND the head — the top of the ring
    { t: 0.5,  bones: { Hips: [0, 12, 0], Spine: [-6, 16, -4], Neck: [2, -10, 0], ...AIR_LEGS }, hands: { Right: [-0.52, 1.72, -0.02], Left: [-0.40, 1.24, 0.10] }, poles: { Right: [-0.3, 0.5, -0.6] } },   // across to the far shoulder: the ring closes
    { t: 0.62, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], ...AIR_LEGS }, hands: { Right: [0.10, 1.62, 0.34], Left: [-0.34, 1.36, 0.12] } },   // back in front, loaded
    { t: CRADLE_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], LeftUpLeg: [-22, 0, 4], LeftLeg: [26, 0, 0], RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] }, hands: { Right: [0.16, 2.02, 0.28], Left: [-0.34, 1.44, 0.06] }, poles: UP },   // hammered down through the rim
  ]);
}

/**
 * DOUBLE CLUTCH — the ball taken all the way DOWN to the waist at the top of the flight and thrown back up.
 *
 * The whole read is vertical travel of the ball against a body that is still rising, so the keys are about
 * the HANDS moving a long way in y while the trunk barely changes. A shallow version of this is just a
 * dunk; the depth is the trick.
 */
export function buildDoubleClutch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // RECOGNISABLE ON SIGHT (2026-09-15): the clutch kicked the legs BACK (thighs +42°) and from the rim camera it was a
  // scorpion without the arch. A double clutch is a body folded FORWARD around the ball: knees up to the chest, the ball
  // pulled all the way down between them, then the whole body opens long and the ball goes back up.
  const FOLD: Record<string, Deg3> = { LeftUpLeg: [-78, 0, 10], LeftLeg: [104, 0, 0], RightUpLeg: [-78, 0, -10], RightLeg: [104, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_double_clutch', CLUTCH_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], Neck: [-6, 0, 0], ...AIR_LEGS }, hands: { Right: [0.20, 1.88, 0.26], Left: [-0.24, 1.80, 0.24] }, poles: UP },   // both hands already high
    { t: 0.22, bones: { Hips: [-10, 0, 0], Spine: [26, 0, 0], Neck: [-20, 0, 0], ...FOLD }, hands: { Right: [0.16, 0.96, 0.40], Left: [-0.18, 0.96, 0.40] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] }, hipsY: 0.12 },   // folded: knees to the chest, the ball down between them
    { t: 0.34, bones: { Hips: [-12, 0, 0], Spine: [30, 0, 0], Neck: [-22, 0, 0], ...FOLD }, hands: { Right: [0.14, 0.90, 0.42], Left: [-0.16, 0.90, 0.42] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] }, hipsY: 0.13 },   // the clutch: held at the bottom
    { t: 0.52, bones: { Hips: [2, 0, 0], Spine: [-4, 0, 0], Neck: [-14, 0, 0], ...AIR_LEGS }, hands: { Right: [0.18, 1.70, 0.30], Left: [-0.22, 1.58, 0.28] } },   // opened long, driven back up
    { t: CLUTCH_SEC, bones: { Hips: [-6, 0, 0], Spine: [-14, 0, 0], Neck: [-16, 0, 0], LeftUpLeg: [-22, 0, 4], LeftLeg: [26, 0, 0], RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] }, hands: { Right: [0.14, 2.06, 0.26], Left: [-0.28, 1.72, 0.20] }, poles: UP },   // the flush, higher than it started
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
