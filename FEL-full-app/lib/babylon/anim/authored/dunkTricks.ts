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

/**
 * AIR LEGS ARE HALF THE DUNK (dynamics pass, 2026-09-16).
 *
 * Owner: "make sure they are performing each dunk as dynamically as they could, it's a dunk contest." The audit that
 * found it: `AIR_LEGS` above — one symmetric tuck, both thighs −30°, both knees 45° — was spread across EVERY key of
 * the windmill, the tomahawk, the cradle, the lost & found and the hide & seek. Five of the ten named dunks flew from
 * takeoff to flush with legs that never moved and were mirror-identical, which is two things no dunker has ever done:
 * a one-foot take-off is asymmetric by construction (one knee drives, the other trails), and nobody holds a shape for
 * a second in the air — the legs are the loudest thing in a dunk photograph.
 *
 * So the legs get a vocabulary, and every named dunk gets legs that ACT: a shape at the take-off, a shape through the
 * trick that belongs to that trick, and the long body every dunk ends in. The names are what a dunker would call them.
 */
const AIR = {
  /** One-foot take-off: the lead knee drives up hard, the trail leg hangs behind. Nothing symmetric about it. */
  drive: (leadLeft = true): Record<string, Deg3> => leadLeft
    ? { LeftUpLeg: [-74, 0, 8], LeftLeg: [46, 0, 0], RightUpLeg: [16, 0, -6], RightLeg: [62, 0, 0] }
    : { LeftUpLeg: [16, 0, 6], LeftLeg: [62, 0, 0], RightUpLeg: [-74, 0, -8], RightLeg: [46, 0, 0] },
  /** THE SPREAD EAGLE: legs thrown wide and open. The shape of every tomahawk photograph ever taken. */
  spread: { LeftUpLeg: [-34, 0, 26], LeftLeg: [30, 0, 0], RightUpLeg: [-34, 0, -26], RightLeg: [30, 0, 0] } as Record<string, Deg3>,
  /** The trail leg kicked back and out — a windmill's counterweight to the arm coming over the top. */
  kickBack: { LeftUpLeg: [-52, 0, 14], LeftLeg: [40, 0, 0], RightUpLeg: [30, 0, -12], RightLeg: [86, 0, 0] } as Record<string, Deg3>,
  /** Both legs thrown forward and straight — the jackknife a double-clutch and a reveal open out of. */
  kickOut: { LeftUpLeg: [-62, 0, 10], LeftLeg: [14, 0, 0], RightUpLeg: [-58, 0, -10], RightLeg: [18, 0, 0] } as Record<string, Deg3>,
  /** Small: knees up and ankles crossed in. A body hiding something makes itself small. */
  cross: { LeftUpLeg: [-58, 0, -10], LeftLeg: [92, 0, 0], RightUpLeg: [-62, 0, 8], RightLeg: [88, 0, 0] } as Record<string, Deg3>,
  /** Tight through a turn: feet pulled in, because a spinning body tucks (and over a car the feet are what clears it). */
  tuckTight: { LeftUpLeg: [-55, 0, 6], LeftLeg: [80, 0, 0], RightUpLeg: [-55, 0, -6], RightLeg: [80, 0, 0] } as Record<string, Deg3>,
  /** THE FLUSH: the body a line under the arm, toes down, and still not symmetric. */
  long: { LeftUpLeg: [-16, 0, 5], LeftLeg: [14, 0, 0], RightUpLeg: [-6, 0, -5], RightLeg: [22, 0, 0] } as Record<string, Deg3>,
} as const;
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
/** The chain pieces (owner, 2026-09-16). The double eastbay is the long one: two passes have to fit inside it. */
export const BEHIND_BACK_SEC = 0.7, FAKE_BACK_SEC = 0.5, DOUBLE_EASTBAY_SEC = 0.95;
/** The whirlwind is the long one (a full arm circle under a full turn); the tap is the shortest thing in the mode. */
export const WINDMILL_360_SEC = 0.9, FAKE_EASTBAY_SEC = 0.55, TAP_SEC = 0.4;
/** The clip second the tap actually strikes the ball — the one frame the whole trick is about. */
export const TAP_STRIKE = 0.22;
/** The clip second each hand-off lands on — the ball rig swaps hands here, as it does for the eastbay. */
export const BEHIND_BACK_SWAP = 0.34, DOUBLE_EASTBAY_FIRST = 0.30, DOUBLE_EASTBAY_SECOND = 0.62;
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
    const r = (deg * Math.PI) / 180, x = side * 0.28, y = 0.38, z = 0.46;   // RIG-JOINT merge (2026-09-17): z 0.26 put the fists on the shoulders through the tuck (15° elbows); a forearm further out
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

/**
 * SCORPION — and it is a NO-LOOK, BEHIND-THE-BACK jam (audit, 2026-09-16).
 *
 * Kilganon describes his own: he sets someone up under the rim, and as he goes over them he looks at the GROUND — never
 * at the basket — brings the ball behind him rather than over the shoulder, and ducks so that he is dunking it behind
 * his own back. The arch that gives the dunk its name (both legs whipped up over the body, like the tail) was the only
 * part ours had. Ours also had his head UP and the ball carried out in FRONT, which is the one thing the dunk is famous
 * for not doing.
 *
 * So: chin down through the arch (the no-look), the ball swung BEHIND the head, and the flush reaching back over the
 * top rather than punched forward.
 */
export function buildScorpion(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_scorpion', SCORPION_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.20, 1.90, 0.15], Left: [-0.22, 1.82, 0.15] }, poles: UP },   // off one foot — the arch that follows is symmetric, the take-off never is
    { t: 0.35, bones: { Hips: [18, 0, 0], Spine: [32, 0, 0], Neck: [26, 0, 0], LeftUpLeg: [58, 0, 8], LeftLeg: [112, 0, 0], RightUpLeg: [58, 0, -8], RightLeg: [112, 0, 0] }, hands: { Right: [0.22, 1.88, -0.34], Left: [-0.46, 1.26, -0.16] }, poles: { Right: [0.8, 0.3, -0.6], Left: [-0.9, -0.2, -0.5] }, hipsY: 0.1 },   // THE SCORPION: the tail goes up, the chin goes DOWN (he is looking at the floor), the ball swings BEHIND the head
    { t: 0.5,  bones: { Hips: [16, 0, 0], Spine: [28, 0, 0], Neck: [22, 0, 0], LeftUpLeg: [52, 0, 8], LeftLeg: [108, 0, 0], RightUpLeg: [52, 0, -8], RightLeg: [108, 0, 0] }, hands: { Right: [0.18, 1.94, -0.28], Left: [-0.44, 1.28, -0.14] }, poles: { Right: [0.8, 0.3, -0.6], Left: [-0.9, -0.2, -0.5] }, hipsY: 0.08 },   // still no-look, the ball behind him
    { t: SCORPION_SEC, bones: { Hips: [4, 0, 0], Spine: [6, 0, 0], Neck: [8, 0, 0], LeftUpLeg: [10, 0, 4], LeftLeg: [40, 0, 0], RightUpLeg: [10, 0, -4], RightLeg: [40, 0, 0] }, hands: { Right: [0.15, 2.00, 0.10], Left: [-0.30, 1.50, 0.10] }, poles: UP },   // the flush, reached back over the top — chin still down, because he never looks
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
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.30, 0.15] } },   // off one foot
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...AIR.tuckTight }, hands: { Right: [0.26, 0.90, -0.34], Left: [-0.34, 1.10, -0.05] }, poles: { Right: [0.9, -0.2, -0.3] } },   // lost: the ball goes behind the back as the turn starts — and the feet come in, because a spinning body tucks
    { t: LOST_FOUND_HANDOFF, bones: { Hips: [2, 0, 0], Spine: [6, 0, 0], ...AIR.tuckTight }, hands: { Right: [0.10, 0.92, -0.36], Left: [-0.08, 0.92, -0.36] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] } },   // found: both hands meet behind the back, back to the rim, still tucked
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], ...AIR.kickOut }, hands: { Left: [-0.52, 1.30, 0.05], Right: [0.40, 1.15, -0.10] }, poles: { Left: [-0.9, -0.2, -0.4] } },   // coming round with it: the tuck opens, which is what stops the turn
    { t: LOST_FOUND_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Left: [-0.14, 2.02, 0.26], Right: [0.36, 1.42, -0.10] }, poles: { Left: UP.Left } },   // extended to the rim, left-handed, body long
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
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.28, 1.58, 0.28], Left: [-0.30, 1.30, 0.14] } },   // off one foot: the lead knee is still up
    { t: 0.16, bones: { Hips: [0, -10, 0], Spine: [-6, -14, 4], Neck: [-4, 8, 0], ...AIR.kickBack }, hands: { Right: [0.72, 1.62, 0.02], Left: [-0.44, 1.18, -0.10] }, poles: { Right: [0.6, -0.6, -0.3] } },   // far out to the side at the shoulder, trail leg swinging back under it
    { t: CRADLE_ROUND, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [12, 0, 0], ...AIR.kickBack }, hands: { Right: [0.08, 2.00, -0.40], Left: [-0.50, 1.26, -0.04] }, poles: { Right: [0.7, 0.4, -0.5] } },   // round BEHIND the head — the top of the ring, the free arm counterweighting
    { t: 0.5,  bones: { Hips: [0, 12, 0], Spine: [-6, 16, -4], Neck: [2, -10, 0], ...AIR.spread }, hands: { Right: [-0.52, 1.72, -0.02], Left: [-0.46, 1.30, 0.06] }, poles: { Right: [-0.3, 0.5, -0.6] } },   // across to the far shoulder: the ring closes and the legs open out under it
    { t: 0.62, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], ...AIR.kickOut }, hands: { Right: [0.10, 1.62, 0.34], Left: [-0.38, 1.40, 0.16] } },   // back in front, loaded, legs thrown forward
    { t: CRADLE_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Right: [0.16, 2.02, 0.28], Left: [-0.34, 1.44, 0.06] }, poles: UP },   // hammered down through the rim, body long
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
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], Neck: [-6, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.20, 1.88, 0.26], Left: [-0.24, 1.80, 0.24] }, poles: UP },   // both hands already high, off one foot
    { t: 0.22, bones: { Hips: [-10, 0, 0], Spine: [26, 0, 0], Neck: [-20, 0, 0], ...FOLD }, hands: { Right: [0.16, 0.96, 0.40], Left: [-0.18, 0.96, 0.40] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] }, hipsY: 0.12 },   // folded: knees to the chest, the ball down between them
    { t: 0.34, bones: { Hips: [-12, 0, 0], Spine: [30, 0, 0], Neck: [-22, 0, 0], ...FOLD }, hands: { Right: [0.14, 0.90, 0.42], Left: [-0.16, 0.90, 0.42] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] }, hipsY: 0.13 },   // the clutch: held at the bottom
    { t: 0.52, bones: { Hips: [2, 0, 0], Spine: [-4, 0, 0], Neck: [-14, 0, 0], ...AIR_LEGS }, hands: { Right: [0.18, 1.70, 0.30], Left: [-0.22, 1.58, 0.28] } },   // opened long, driven back up
    { t: CLUTCH_SEC, bones: { Hips: [-6, 0, 0], Spine: [-14, 0, 0], Neck: [-16, 0, 0], ...AIR.long }, hands: { Right: [0.14, 2.06, 0.26], Left: [-0.28, 1.72, 0.20] }, poles: UP },   // the flush, higher than it started, body long
  ]);
}

/** Hide & seek: both hands hide the ball behind the head, a hip fake, the ball hand snaps it overhead for the flush. */
export function buildHideSeek(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_hide_seek', HIDE_SEEK_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.30, 0.15] } },   // off one foot
    // THE LEGS SELL THE HIDE. A body concealing something makes itself SMALL — knees up, ankles crossed in — and then
    // the reveal is the whole body opening at once. Held in one tuck the trick was a pair of arms moving on a statue.
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [16, 0, 0], ...AIR.cross }, hands: { Right: [0.10, 1.66, -0.30], Left: [-0.10, 1.64, -0.32] }, poles: { Right: [0.9, 0.2, -0.3], Left: [-0.9, 0.2, -0.3] } },   // hidden behind the head, body small
    { t: 0.45, bones: { Hips: [0, 26, 0], Spine: [-4, 8, 0], Neck: [14, -10, 0], ...AIR.cross }, hands: { Right: [0.08, 1.66, -0.32], Left: [-0.12, 1.64, -0.30] }, poles: { Right: [0.9, 0.2, -0.3], Left: [-0.9, 0.2, -0.3] } },   // the fake: hips turn, the ball stays hidden
    { t: 0.65, bones: { Hips: [-4, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.spread }, hands: { Right: [0.18, 2.00, 0.12], Left: [-0.52, 1.36, -0.06] }, poles: { Right: UP.Right } },   // THE REVEAL: ball snapped overhead and the legs burst open with it
    { t: HIDE_SEEK_SEC, bones: { Hips: [-4, 0, 0], Spine: [-10, 0, 0], Neck: [-12, 0, 0], ...AIR.long }, hands: { Right: [0.14, 2.02, 0.30], Left: [-0.34, 1.45, 0.05] }, poles: { Right: UP.Right } },
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
    { t: 0.68, bones: { Hips: [-2, 0, 0], Spine: [-8, 0, 0], Neck: [-8, 0, 0], ...AIR.kickOut }, hands: { Right: [0.18, 1.82, 0.28], Left: [-0.30, 1.56, 0.14] }, poles: UP },   // THE SNAP: the tuck is thrown open and that is what kills the spin
    { t: SPIN_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Right: [0.16, 2.00, 0.28], Left: [-0.28, 1.60, 0.12] }, poles: UP },   // extended to the rim — and the TUCK OPENS, which is both what stops the turn and what the flush looks like (it used to finish still tucked, so the whole trick travelled 0.12 m of leg)
  ]);
}

/**
 * BEHIND THE BACK — the plain one (owner, 2026-09-16: "behind the back scorpion", "behind the back between the legs").
 *
 * The vocabulary had this motion only welded to a 360 inside LOST & FOUND, so neither chain the owner asked for could
 * be built out of it. On its own it is the simplest of the transfers and the one every other behind-the-back dunk is
 * made of: the ball hand takes it round the hip, both hands meet in the small of the back, the far hand comes out the
 * other side with it and carries it up. No turn — the body stays square to the rim, which is exactly what makes it
 * chainable: whatever comes next starts facing the right way.
 */
export function buildBehindBack(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_behind_back', BEHIND_BACK_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.32, 0.16] } },
    { t: 0.18, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0], Neck: [6, 0, 0], ...AIR.kickBack }, hands: { Right: [0.34, 1.02, -0.30], Left: [-0.36, 1.18, 0.04] }, poles: { Right: [0.9, -0.2, -0.3] } },   // round the hip
    { t: BEHIND_BACK_SWAP, bones: { Hips: [2, 0, 0], Spine: [8, 0, 0], Neck: [4, 0, 0], ...AIR.kickBack }, hands: { Right: [0.08, 1.00, -0.38], Left: [-0.10, 1.00, -0.38] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] } },   // both hands meet in the small of the back
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-6, 0, 0], ...AIR.spread }, hands: { Left: [-0.50, 1.34, 0.02], Right: [0.42, 1.16, -0.08] }, poles: { Left: [-0.9, -0.2, -0.4] } },   // out the far side, legs opening under it
    { t: BEHIND_BACK_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Left: [-0.14, 2.02, 0.26], Right: [0.36, 1.42, -0.06] }, poles: { Left: UP.Left } },   // carried up, left-handed
  ]);
}

/**
 * FAKE BEHIND THE BACK — the ball goes round and comes straight back to the same hand.
 *
 * The whole trick is the LIE, so it has to be shaped like the real one for the first third and then betray it: the ball
 * takes the identical path round the hip to the same depth the real swap reaches, the free hand comes to meet it — and
 * then never takes it. The ball hand whips it back out the way it went in and goes up alone. Short, because a fake that
 * dwells is not a fake.
 */
export function buildFakeBack(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_fake_back', FAKE_BACK_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.60, 0.30], Left: [-0.30, 1.32, 0.16] } },
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [8, 0, 0], Neck: [8, 0, 0], ...AIR.kickBack }, hands: { Right: [0.30, 1.00, -0.34], Left: [-0.26, 1.06, -0.22] }, poles: { Right: [0.9, -0.2, -0.3], Left: [-0.9, -0.2, -0.3] } },   // the lie: the same path, the far hand coming to meet it
    { t: 0.26, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], Neck: [4, 0, 0], ...AIR.kickBack }, hands: { Right: [0.22, 1.06, -0.30], Left: [-0.16, 1.04, -0.30] }, poles: { Right: [0.9, -0.3, -0.2], Left: [-0.9, -0.3, -0.2] } },   // close enough to look like the swap
    { t: 0.36, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-8, 0, 0], ...AIR.kickOut }, hands: { Right: [0.44, 1.40, 0.10], Left: [-0.44, 1.20, 0.10] }, poles: { Right: [0.9, -0.1, -0.4] } },   // …and it never happened: back out the way it went in
    { t: FAKE_BACK_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-12, 0, 0], ...AIR.long }, hands: { Right: [0.16, 2.02, 0.26], Left: [-0.34, 1.46, 0.06] }, poles: { Right: UP.Right } },   // up alone, SAME hand it started in
  ]);
}

/**
 * DOUBLE EASTBAY — two passes through the legs in one jump.
 *
 * The Team Flight Brothers staple, and the piece the owner's "360 double eastbay" needs. It is not the eastbay played
 * twice: there is only one jump's worth of air, so each pass is faster and tighter than a single, and the split has to
 * re-open for the second one having just closed. Right hand down through the gap to the left, and immediately left back
 * through to the right — the ball crosses the body twice and finishes in the hand it started in, which is the tell that
 * it was two passes and not one.
 */
export function buildDoubleEastbay(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const SPLIT: Record<string, Deg3> = { LeftUpLeg: [-92, 0, 12], LeftLeg: [52, 0, 0], RightUpLeg: [38, 0, -10], RightLeg: [70, 0, 0] };
  const SPLIT2: Record<string, Deg3> = { LeftUpLeg: [40, 0, 10], LeftLeg: [72, 0, 0], RightUpLeg: [-92, 0, -12], RightLeg: [52, 0, 0] };   // the legs SWAP for the second pass
  return buildPoseClip(scene, sk, 'dunk_double_eastbay', DOUBLE_EASTBAY_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.62, 0.30], Left: [-0.30, 1.32, 0.14] } },
    { t: 0.18, bones: { Hips: [10, 0, 0], Spine: [22, 0, 0], Neck: [18, 0, 0], ...SPLIT }, hands: { Right: [0.10, 0.92, 0.34], Left: [-0.28, 1.16, 0.22] }, poles: { Right: [0.9, -0.3, 0.3] } },   // first gap open, ball driven down into it
    { t: DOUBLE_EASTBAY_FIRST, bones: { Hips: [10, 0, 0], Spine: [24, 0, 0], Neck: [20, 0, 0], ...SPLIT }, hands: { Right: [-0.04, 0.86, 0.36], Left: [-0.12, 0.86, 0.36] }, poles: { Right: [0.9, -0.3, 0.3], Left: [-0.9, -0.3, 0.3] } },   // PASS ONE: right to left under the lead thigh
    { t: 0.46, bones: { Hips: [4, 0, 0], Spine: [10, 0, 0], Neck: [8, 0, 0], ...AIR.kickOut }, hands: { Left: [-0.36, 1.22, 0.24], Right: [0.34, 1.20, 0.12] } },   // the legs close and swap — the only moment between the two passes
    { t: DOUBLE_EASTBAY_SECOND, bones: { Hips: [10, 0, 0], Spine: [24, 0, 0], Neck: [20, 0, 0], ...SPLIT2 }, hands: { Left: [0.04, 0.86, 0.36], Right: [0.12, 0.86, 0.36] }, poles: { Left: [-0.9, -0.3, 0.3], Right: [0.9, -0.3, 0.3] } },   // PASS TWO: left back to right, the other leg up
    { t: 0.78, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-6, 0, 0], ...AIR.spread }, hands: { Right: [0.42, 1.46, 0.16], Left: [-0.44, 1.26, 0.10] } },   // out of the second gap, legs thrown open
    { t: DOUBLE_EASTBAY_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Right: [0.16, 2.04, 0.26], Left: [-0.34, 1.46, 0.04] }, poles: { Right: UP.Right } },   // finished in the hand it started in
  ]);
}

/**
 * 360 WINDMILL — a windmill turned all the way round.
 *
 * (I first built this believing it was the WHIRLWIND, off press write-ups of Aaron Gordon's spinning dunk. The owner
 * corrected it: the whirlwind is a 360 TAP, which lives in SIGNATURE_DUNKS as a chain. This body was never a whirlwind
 * — it was always this, and a 360 windmill is worth its own press.)
 *
 * The arm sweeps its full circle WHILE the body turns, so
 * the ball is travelling one way round the shoulder and the shoulder is travelling the other way round the floor. The
 * turn is the spin layer's (facing `spinThrough`, and so hips yaw is 0 on every key here, like the 360 and the lost &
 * found); this clip owns the circle and the counterweight — the trail leg kicks back under the arm exactly as it does
 * in the plain windmill, because that is what keeps the shoulder line under a swinging arm.
 */
export function buildWindmill360(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_360_windmill', WINDMILL_360_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.30, 0.82, -0.28], Left: [-0.22, 1.84, 0.14] }, poles: { Right: [0.8, 0.2, -0.5], Left: UP.Left } },   // cocked low and behind
    { t: 0.22, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [-4, 0, 0], ...AIR.kickBack }, hands: { Right: [0.66, 1.34, -0.14], Left: [-0.26, 1.88, 0.14] }, poles: { Right: [0.4, -0.3, -0.9], Left: UP.Left } },   // out to the side
    { t: 0.44, bones: { Hips: [0, 0, 0], Spine: [-14, 0, 0], Neck: [-10, 0, 0], ...AIR.tuckTight }, hands: { Right: [0.16, 2.06, -0.02], Left: [-0.24, 1.86, 0.16] }, poles: { Right: UP.Right, Left: UP.Left } },   // over the top, feet in: the body is turning under it
    { t: 0.66, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-4, 0, 0], ...AIR.kickOut }, hands: { Right: [-0.24, 1.66, 0.22], Left: [-0.34, 1.60, 0.18] }, poles: { Right: [-0.2, 0.4, -0.7] } },   // down the far side, the tuck opening as the turn resolves
    { t: WINDMILL_360_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Right: [0.14, 2.02, 0.32], Left: [-0.30, 1.52, 0.10] }, poles: UP },   // slammed forward and down, square again
  ]);
}

/**
 * FAKE EASTBAY — the between-the-legs that never goes through.
 *
 * There was a `dunk_360_fake_eastbay` entry in the clip alias table pointing at the real eastbay's clip: a name for a
 * dunk that had never been authored. This is it. Everything about the first half is the eastbay — the lead knee drives
 * up, the gap opens, the ball dives at it, the far hand comes under the thigh to take it — and then it does not go
 * through. The ball hand pulls it back out the near side and takes it up alone, and the legs snap shut early, which is
 * the tell: a real eastbay holds the split until the ball is out the far side.
 */
export function buildFakeEastbay(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const SPLIT: Record<string, Deg3> = { LeftUpLeg: [-88, 0, 12], LeftLeg: [56, 0, 0], RightUpLeg: [34, 0, -8], RightLeg: [66, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_fake_eastbay', FAKE_EASTBAY_SEC, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [0, 0, 0], ...AIR.drive(true) }, hands: { Right: [0.26, 1.62, 0.30], Left: [-0.30, 1.32, 0.14] } },
    { t: 0.16, bones: { Hips: [10, 0, 0], Spine: [22, 0, 0], Neck: [16, 0, 0], ...SPLIT }, hands: { Right: [0.12, 0.94, 0.34], Left: [-0.26, 1.10, 0.28] }, poles: { Right: [0.9, -0.3, 0.3] } },   // the lie: the gap opens and the ball dives at it
    { t: 0.26, bones: { Hips: [10, 0, 0], Spine: [22, 0, 0], Neck: [16, 0, 0], ...SPLIT }, hands: { Right: [0.04, 0.88, 0.36], Left: [-0.14, 0.94, 0.34] }, poles: { Right: [0.9, -0.3, 0.3], Left: [-0.9, -0.3, 0.3] } },   // the far hand comes under the thigh for it
    { t: 0.36, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], Neck: [-6, 0, 0], ...AIR.kickOut }, hands: { Right: [0.36, 1.32, 0.18], Left: [-0.42, 1.24, 0.12] }, poles: { Right: [0.9, -0.1, -0.4] } },   // …and it comes back out the NEAR side, legs shutting early
    { t: FAKE_EASTBAY_SEC, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.long }, hands: { Right: [0.16, 2.02, 0.28], Left: [-0.32, 1.48, 0.06] }, poles: { Right: UP.Right } },   // up alone, same hand
  ]);
}

/**
 * THE TAP — the only dunk in the list with no grip in it.
 *
 * A tap is not a carry: the hand meets the ball above the ring and puts it through with one strike, palm open, and is
 * past it before the arm has finished travelling. So the shape is the opposite of every other trick here — there is no
 * gather and no cock-back, the arm goes UP early and waits, and the whole trick is one wrist. It is the shortest clip
 * in the mode for the same reason; a tap that dwells is a carry.
 */
export function buildTap(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_tap', TAP_SEC, [
    { t: 0,    bones: { Hips: [-4, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.kickOut }, hands: { Right: [0.20, 1.96, 0.18], Left: [-0.30, 1.70, 0.12] }, poles: UP },   // the arm is ALREADY up: no gather, nothing to wind
    { t: 0.12, bones: { Hips: [-8, 0, 0], Spine: [-16, 0, 0], Neck: [-18, 0, 0], ...AIR.spread }, hands: { Right: [0.18, 2.12, 0.10], Left: [-0.32, 1.78, 0.10] }, poles: UP },   // reaching at the ball, eyes on it, body opening
    { t: TAP_STRIKE, bones: { Hips: [-6, 0, 0], Spine: [-12, 0, 0], Neck: [-14, 0, 0], ...AIR.spread }, hands: { Right: [0.16, 2.06, 0.30], Left: [-0.32, 1.74, 0.12] }, poles: UP },   // THE STRIKE: one wrist, forward and down through the ring
    { t: TAP_SEC, bones: { Hips: [-4, 0, 0], Spine: [-8, 0, 0], Neck: [-10, 0, 0], ...AIR.long }, hands: { Right: [0.16, 1.88, 0.36], Left: [-0.30, 1.58, 0.14] }, poles: UP },   // past it already
  ]);
}
