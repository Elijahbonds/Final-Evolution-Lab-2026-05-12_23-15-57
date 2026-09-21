// Board suite — the riding vocabulary for skate, surf and snowboard.
//
// WHY THIS EXISTS
// Every board clip in the game was an ALIAS onto a karate or basketball move:
//
//   board_ride_idle -> guard @0.6      the rider's whole stance was a karate guard
//   board_tuck      -> guard @1.25
//   board_grab      -> jumpshot @0.4
//   skate_kickflip  -> high_kick
//   skate_treflip   -> roundhouse
//   skate_bail      -> guard
//
// Nothing errored, because the alias table is a graceful-degradation net and
// every one of those names resolved to a real, playing clip. The rider simply
// stood in a martial-arts stance on a moving board — which is exactly what the
// first capture of Skate showed: bolt upright, arms at his sides, on a plank.
//
// These are authored against the same rig as every other suite, so `resolveClip`
// prefers them over the aliases automatically (exact name beats alias) and all
// three board modes pick them up with no mode changes.
//
// STANCE NOTES. A board rider is not a runner: the knees carry everything, the
// arms are out as a counterweight, turning is a LEAN rather than a step, and
// air is a tuck.
//
// THE ARMS ARE POSE TARGETS NOW (VENICE-SKATE-THPS, 2026-09-09). This suite used to key `LeftArm` / `LeftForeArm` as
// Euler degrees, and a clipBuilder key rotates a bone about its PARENT's bind axes — on this rig the upper arm's bind X
// is (near) the arm's own long axis, so `LeftForeArm: [.., 34, 0, 0]` was a TWIST and never bent an elbow. Half the
// clips (carve, air, grind, land, kickflip) did not key the forearm at all. Measured on the live Venice rider, per
// rendered frame: BOTH elbows held 169–170° for 1241 of 1241 frames across push, carve, ollie, kickflip and manual —
// a scarecrow riding a plank, which is what Elijah's eye called "arms stiff T-pose". karate.ts hit exactly this and
// solved it by authoring HAND TARGETS; the same fix here needed one addition, `PoseKey.handsRel` (poseClip.ts): a wrist
// target measured from the POSED SHOULDER rather than from the root, because a board stance has already yawed the hips
// 74° by the time the arms are solved. Its LENGTH is the elbow angle — |rel| = REF_ARM_LEN (0.54) is a locked straight
// arm, 0.50 ≈ 135°, 0.46 ≈ 117°, 0.42 ≈ 102°, 0.36 ≈ 84° — so every arm below reads as a number you can check.
//
// But the thing that reads first, before any of that, is that a rider stands
// ACROSS the deck. Feet point along the board, hips and shoulders square to it,
// and the head turns back over the leading shoulder to look down the line. The
// first version of these clips missed exactly that: they carried a 16-degree
// spine twist and nothing else, so the rider faced dead ahead, chest to the
// wind, like someone standing on a plank rather than riding it.
//
// The correction belongs in the HIPS, not the spine. The legs are keyed in the
// hips' local frame, so yawing the hips carries the feet across the deck with
// them and the knees bend toward the toe edge -- which is what they really do.
// The board itself is parented to the character root, not the skeleton, so the
// deck stays pointed down the direction of travel while the rider turns on top
// of it. The spine chain then counter-rotates to bring the eyes back forward.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';

/** Degrees the hips turn off the direction of travel. Regular stance. */
const STANCE_YAW = 74;
/**
 * Counter-twist spread up the spine so the head ends up looking down the line.
 * These sum to -72 against the hips' +74, leaving the gaze 2 degrees open --
 * a rider does look slightly across their own line, not straight over the nose.
 * Spreading it over four joints is what keeps it from reading as a broken neck.
 */
const COUNTER: Record<string, number> = { Spine: -16, Spine1: -16, Neck: -28, Head: -12 };

type Bones = Record<string, Deg3>;

/**
 * Turn a square-shouldered pose into a real board stance.
 *
 * `open` unwinds it for the bail: the rider is coming OFF the board, so the stance has to break rather than hold --
 * keeping a textbook stance through a crash is what makes a fall look like a dance move.
 */
function stanced(bones: Bones, open = 1): Bones {
  const out: Bones = { ...bones };
  const h = bones.Hips;
  out.Hips = [h?.[0] ?? 0, STANCE_YAW * open, h?.[2] ?? 0];
  for (const [bone, deg] of Object.entries(COUNTER)) {
    const cur = bones[bone];
    out[bone] = [cur?.[0] ?? 0, deg * open, cur?.[2] ?? 0];
  }
  return out;
}

/** Elbows point down and behind the rider — the counterweight shape, never a chicken wing. */
const POLE_L: [number, number, number] = [-0.62, -0.52, -0.58];
const POLE_R: [number, number, number] = [0.62, -0.52, -0.58];
const POLES = { Left: POLE_L, Right: POLE_R };

/**
 * THE FEET WERE NEVER KEYED (owner, 2026-09-15: "fix the glitched out legs … in skateboarding").
 *
 * Every key in this suite drove the thigh and the shin and stopped there, so each ankle kept its BIND rotation under a
 * shin the key had just pitched 28°, and the foot pointed at the floor like a ballet point. Measured live on the Venice
 * rider in board_ride_idle: ankles at y 0.01–0.03, but the body's lowest point at −0.12 — the toes hung 15 cm BELOW the
 * ankle and a quarter metre under the deck they were supposed to be standing on. That is the second half of the frame
 * the owner flagged; the first half was the board itself (see visual/deckMesh.ts).
 *
 * The rig binds standing, soles flat, and these keys rotate a bone about its PARENT's bind axes — so a foot's pitch in
 * the world is the sum of the chain's X keys. Cancel that sum on the ankle and the sole comes back level at any crouch
 * depth, for free. A key that wants a pointed toe names `LeftFoot` / `RightFoot` itself: an explicit key wins.
 */
function flatFeet(bones: Bones): Bones {
  const out: Bones = { ...bones };
  for (const side of ['Left', 'Right'] as const) {
    const thigh = bones[`${side}UpLeg`], shin = bones[`${side}Leg`];
    if (!thigh || !shin || bones[`${side}Foot`]) continue;
    out[`${side}Foot`] = [-(thigh[0] + shin[0]), 0, 0];
  }
  return out;
}

/**
 * How far the whole suite rides ABOVE where it was authored (metres, on the hips).
 *
 * These clips were written for a rider standing on the GROUND. He stands on a deck whose top face is 6 cm above the
 * board box's underside, and the crouch dropped the hips further than the knee bend lifted the feet — so the soles
 * ended up under the floor with the deck floating around his shins (measured: sole 0.21 m below the deck's top face on
 * the cruise). One constant, added to every key, buys the ride height back while keeping every authored relative depth:
 * the tuck deeper than the cruise, the ollie's load deeper still. For a key with planted feet it is purely the CROUCH —
 * the feet are pinned in the world, so the hips coming up is the knees straightening.
 */
const DECK_LIFT = 0.06;

/**
 * WHERE THE FEET GO ON THE DECK (2026-09-15). The thigh/shin degrees alone cannot say: they are keyed in the HIPS'
 * frame, and the stance has already yawed the hips 74°, so "both thighs forward" put the two feet side by side ACROSS a
 * 0.26 m deck — measured live, the back foot hung off the toe edge onto the ground while the front foot stood on the
 * board. A rider's feet sit OVER THE TRUCKS, a shoulder-and-a-half apart along the deck's length, which is a statement
 * about the board and therefore belongs in root-frame metres: ±0.22 m fore and aft, on the board's centre line, at the
 * deck's top face. Regular stance, so the LEFT foot is the front one (which is also the foot the push keys keep down).
 */
const DECK_ANKLE = 0.125;   // deck top (board box centre +0.03, box bottom on the trucks) plus the ankle's own height
const FOOT_FRONT: [number, number, number] = [0.01, DECK_ANKLE, 0.21];
const FOOT_BACK: [number, number, number] = [-0.01, DECK_ANKLE, -0.21];
const ON_DECK = { Left: FOOT_FRONT, Right: FOOT_BACK };
/** The manual's feet: the front foot pulls the nose up off its truck, the back foot stays loaded over the tail. */
const NOSE_UP = (lift: number) => ({ Left: [FOOT_FRONT[0], FOOT_FRONT[1] + 0.06 + lift, FOOT_FRONT[2]] as [number, number, number], Right: FOOT_BACK });

/**
 * One key: torso/leg degrees, both wrists as shoulder-relative targets, the hips' ride height, and — for a key that
 * rides — where each foot is planted.
 *
 * THE FOOT TARGETS ARE PRE-COMPENSATED FOR `hipsY`. A pose clip solves its IK with the skeleton at BIND height and
 * carries the hips' drop as a separate translation track (poseClip.ts), so whatever the solver plants is then carried
 * down by that track at playback — a foot pinned to the deck rode 0.135 m below it, straight through the board, with
 * the legs nearly straight because the solver thought it was reaching for the floor. Authoring in deck metres and
 * subtracting the hips' own drop here is what makes `FOOT_FRONT`'s y mean the height it says, and it also hands the
 * crouch to the solver: hips down against planted feet IS knee bend, so the legs now fold by geometry.
 */
function key(
  t: number, bones: Bones, L: [number, number, number], R: [number, number, number], hipsY: number, open = 1,
  feet?: PoseKey['feet'],
): PoseKey {
  const hips = hipsY + DECK_LIFT;
  const lift = (v?: [number, number, number]) => (v ? [v[0], v[1] - hips, v[2]] as [number, number, number] : undefined);
  return {
    t, bones: stanced(flatFeet(bones), open), handsRel: { Left: L, Right: R }, poles: POLES, hipsY: hips,
    feet: feet ? { Left: lift(feet.Left), Right: lift(feet.Right) } : undefined,
  };
}

/** A key whose feet are planted on the deck — every clip the rider spends riding. */
function deckKey(t: number, bones: Bones, L: [number, number, number], R: [number, number, number], hipsY: number): PoseKey {
  return key(t, bones, L, R, hipsY, 1, ON_DECK);
}

/** The legs every ground ride shares: knees bent, weight forward, the front knee carrying more. */
function rideLegs(depth: number): Bones {
  return {
    LeftUpLeg: [-44 - depth, 0, 8], LeftLeg: [72 + depth * 1.4, 0, 0],
    RightUpLeg: [-40 - depth, 0, -10], RightLeg: [68 + depth * 1.4, 0, 0],
  };
}

// Cruising counterweight arms (SHARED-ANIM-BUS, 2026-09-14): LOW and a little out. These were [∓0.40, -0.14, …] — 0.14 m
// under the shoulder, so both wrists rode at shoulder height (measured live: front hand 0.03 m under its shoulder, back
// hand 0.33 m out, on 503/503 ride frames) and the rider cruised in the stiff-T the eye flagged. The balance acts
// (grind, manual) keep their arms out on purpose; the cruise and the push do not.
// ANIM-SURGICAL (2026-09-14): still a T from the chase cam. [∓0.30, -0.34, …] lowered the wrists but kept each one 0.27 m
// OUTBOARD of its shoulder, so from behind the hands sat 0.80 m apart across a 0.26 m shoulder line with both elbows
// winged out (forge rig, world x off the hips; live 1v1 of the eye's mid-push / mid-drive frames). A cruising rider's
// arms HANG: wrists by the hips, a hand's width off the body, soft elbows. Now 0.37 m apart, elbows 146° / 140°.
const CRUISE_L: [number, number, number] = [-0.08, -0.50, 0.10];
const CRUISE_R: [number, number, number] = [0.08, -0.50, 0.02];

/** Knees bent, arms low, spine twisted toward the nose. The base of everything. */
export function buildBoardRideIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 2.4;                                  // slow breathing loop
  const torso = (x: number): Bones => ({ Spine: [x, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] });
  return buildPoseClip(scene, sk, 'board_ride_idle', T, [
    deckKey(0, { ...rideLegs(0), ...torso(14) }, CRUISE_L, CRUISE_R, -0.26),
    deckKey(T / 2, { ...rideLegs(6), ...torso(17) }, [-0.07, -0.51, 0.12], [0.07, -0.51, 0.04], -0.29),
    deckKey(T, { ...rideLegs(0), ...torso(14) }, CRUISE_L, CRUISE_R, -0.26),
  ]);
}

/**
 * STANDING ON THE BOARD (ANIM-READABILITY, 2026-09-21). The tree's `idle` and `cruise` were the SAME clip, so a rider
 * waiting at the spawn sat in the full ride crouch, breathing, exactly as he does at 9 m/s — nothing on screen said
 * "stopped". A stopped rider stands UP on the deck: knees only soft (hips 0.12 m under bind against the ride's 0.26),
 * the chest nearly upright, the hands hanging, and the weight rocking slowly heel to toe, which is what anyone waiting
 * on a board actually does. Same stance yaw and the same feet over the trucks, so the first push folds down out of it
 * through the crossfade with the soles never leaving the deck.
 */
export function buildBoardStandIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 3.2;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-20 - d, 0, 8], LeftLeg: [34 + d * 1.4, 0, 0],
    RightUpLeg: [-17 - d, 0, -10], RightLeg: [30 + d * 1.4, 0, 0],
  });
  const torso = (x: number, r: number): Bones => ({ Spine: [x, 0, r], Spine1: [2, 0, r * 0.5], Neck: [-3, 0, 0] });
  const HANG_L: [number, number, number] = [-0.06, -0.52, 0.04];
  const HANG_R: [number, number, number] = [0.06, -0.52, 0.00];
  return buildPoseClip(scene, sk, 'board_stand_idle', T, [
    deckKey(0, { ...legs(0), ...torso(5, 0) }, HANG_L, HANG_R, -0.12),
    deckKey(T * 0.3, { ...legs(2), ...torso(7, 2) }, [-0.07, -0.51, 0.07], [0.06, -0.52, 0.02], -0.135),      // onto the toes
    deckKey(T * 0.7, { ...legs(1), ...torso(4, -2) }, [-0.05, -0.52, 0.02], [0.07, -0.51, -0.03], -0.125),   // back on the heels
    deckKey(T, { ...legs(0), ...torso(5, 0) }, HANG_L, HANG_R, -0.12),
  ]);
}

// HOLD LOOPS (ANIM-READABILITY, 2026-09-07). The carve, the tuck and the grab were keyed as one-way transitions —
// stance at t=0, the pose at t=T — and played as LOOPS, so every cycle snapped the rider back upright: measured on the
// snowboard baseline as a 0.60 m hand jump every 0.6 s for the whole run (the tuck is the throttle there), 0.5 s on a
// held carve, 0.7 s on a held grab. The way IN is the animator's crossfade; the loop itself starts in the pose, breathes
// a hair deeper at the midpoint and returns, so its wrap is seamless.

/** Lean into the turn. `sign` is +1 for a toeside/right carve, -1 for heelside. Held pose, loops clean. */
function carve(scene: Scene, sk: Skeleton, name: string, sign: number): AnimationGroup | null {
  const T = 0.8;
  const roll = 22 * sign;
  const legs = (depth: number): Bones => ({
    LeftUpLeg: [-52 - depth, 0, 8 + 5 * sign], LeftLeg: [84 + depth * 1.5, 0, 0],
    RightUpLeg: [-48 - depth, 0, -10 + 5 * sign], RightLeg: [80 + depth * 1.5, 0, 0],
  });
  const torso = (x: number, r: number): Bones => ({ Spine: [x, 0, r], Spine1: [6, 0, r * 0.5], Neck: [-4, 0, r * 0.3] });
  // the arm on the OUTSIDE of the turn reaches across the arc; the inside arm drops toward the edge it is riding
  const lead: [number, number, number] = sign > 0 ? [-0.30, -0.05, 0.34] : [-0.36, -0.26, -0.10];
  const trail: [number, number, number] = sign > 0 ? [0.36, -0.28, -0.12] : [0.30, -0.02, 0.34];
  const dip = (v: [number, number, number], k: number): [number, number, number] => [v[0], v[1] - k, v[2] + k * 0.4];
  return buildPoseClip(scene, sk, name, T, [
    deckKey(0, { ...legs(0), ...torso(16, roll) }, lead, trail, -0.32),
    deckKey(T / 2, { ...legs(4), ...torso(18, roll * 1.15) }, dip(lead, 0.03), dip(trail, 0.03), -0.34),
    deckKey(T, { ...legs(0), ...torso(16, roll) }, lead, trail, -0.32),
  ]);
}
export const buildBoardCarveLeft = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_left', -1);
export const buildBoardCarveRight = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_right', 1);

/** Speed tuck — folded up small, hands low and back by the hips. Held pose, loops clean (the fold-in is the crossfade). */
export function buildBoardTuck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.2;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-58 - d, 0, 7], LeftLeg: [86 + d * 1.5, 0, 0],
    RightUpLeg: [-54 - d, 0, -9], RightLeg: [82 + d * 1.5, 0, 0],
  });
  const torso = (x: number): Bones => ({ Spine: [x, 0, 0], Spine1: [16, 0, 0], Neck: [-26, 0, 0] });
  return buildPoseClip(scene, sk, 'board_tuck', T, [
    deckKey(0, { ...legs(0), ...torso(46) }, [-0.22, -0.34, -0.14], [0.22, -0.34, -0.14], -0.34),
    deckKey(T / 2, { ...legs(4), ...torso(49) }, [-0.20, -0.36, -0.16], [0.20, -0.36, -0.16], -0.37),
    deckKey(T, { ...legs(0), ...torso(46) }, [-0.22, -0.34, -0.14], [0.22, -0.34, -0.14], -0.34),
  ]);
}

/**
 * Skate push (one-shot): the back foot comes off the deck, drops to the ground, shoves behind and steps back on. The
 * torso stays low and open in the stance and the arms hold the counterweight — the front arm swings forward with the
 * shove, the back arm sweeps behind it. This replaces the alias onto the walk cycle, whose arms hung and swung at the
 * rider's sides — measured 40 arms-down frames across two pushes on the baseline.
 */
export function buildBoardPush(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.42;
  const front = (d: number): Bones => ({ LeftUpLeg: [-44 - d, 0, 8], LeftLeg: [72 + d * 1.4, 0, 0] });
  return buildPoseClip(scene, sk, 'board_push', T, [
    deckKey(0, { ...front(0), RightUpLeg: [-40, 0, -10], RightLeg: [68, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      CRUISE_L, CRUISE_R, -0.26),
    // back leg off the deck, straight down to the ground
    key(T * 0.25, { ...front(4), RightUpLeg: [-8, 0, -14], RightLeg: [14, 0, 0], Spine: [20, 0, -3], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.07, -0.49, 0.14], [0.10, -0.48, -0.02], -0.20, 1, { Left: FOOT_FRONT, Right: [-0.18, 0.02, -0.16] }),
    // the shove: the foot drives behind, the arms answer it with a small swing (low — a swing, not a wing. ANIM-SURGICAL:
    // handsRel is measured in the HIPS frame, and the stance has yawed the hips 74°, so its z is SIDEWAYS on the chase
    // cam — the old 0.28 m 'reach forward' threw the front hand 0.26 m outboard on a locked 166° elbow every push)
    key(T * 0.6, { ...front(6), RightUpLeg: [24, 0, -14], RightLeg: [8, 0, 0], Spine: [22, 0, -4], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.06, -0.48, 0.17], [0.11, -0.47, -0.05], -0.22, 1, { Left: FOOT_FRONT, Right: [-0.20, 0.02, -0.42] }),
    deckKey(T, { ...front(0), RightUpLeg: [-40, 0, -10], RightLeg: [68, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      CRUISE_L, CRUISE_R, -0.26),
  ]);
}

/** Reach down and hold the board — the shape every board sport shares in the air. Held pose, loops clean. */
export function buildBoardGrab(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-70 - d, 0, 12], LeftLeg: [92 + d, 0, 0],
    RightUpLeg: [-58 - d, 0, -12], RightLeg: [84 + d, 0, 0],
  });
  const torso = (x: number): Bones => ({ Spine: [x, 0, 4], Spine1: [10, 0, 2], Neck: [-2, 0, 0] });
  // lead hand DOWN onto the deck (the legs come up to meet it — that is what a grab is), trailing arm up and back
  return buildPoseClip(scene, sk, 'board_grab', T, [
    key(0, { ...legs(0), ...torso(40) }, [-0.18, -0.44, 0.16], [0.30, 0.30, -0.16], -0.28),
    key(T / 2, { ...legs(4), ...torso(44) }, [-0.17, -0.46, 0.15], [0.31, 0.32, -0.17], -0.30),
    key(T, { ...legs(0), ...torso(40) }, [-0.18, -0.44, 0.16], [0.30, 0.30, -0.16], -0.28),
  ]);
}

/** Loose air pose — legs gathered, arms wide and soft, used for spins. */
export function buildBoardAir(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-44 - d, 0, 9], LeftLeg: [66 + d * 1.3, 0, 0],
    RightUpLeg: [-40 - d, 0, -11], RightLeg: [62 + d * 1.3, 0, 0],
  });
  return buildPoseClip(scene, sk, 'board_air', T, [
    key(0, { ...legs(0), Spine: [18, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.44, 0.02, 0.10], [0.44, 0.04, -0.08], -0.22),
    key(T / 2, { ...legs(8), Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.43, 0.06, 0.12], [0.43, 0.08, -0.10], -0.22),
    key(T, { ...legs(0), Spine: [18, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.44, 0.02, 0.10], [0.44, 0.04, -0.08], -0.22),
  ]);
}

/** Grinding a rail: knees bent over the deck, arms working the balance — one up, one out, and they trade. */
export function buildBoardGrind(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.0;
  const legs: Bones = { LeftUpLeg: [-24, 0, 8], RightUpLeg: [-20, 0, -10] };
  return buildPoseClip(scene, sk, 'board_grind', T, [
    deckKey(0, { ...legs, LeftLeg: [46, 0, 0], RightLeg: [42, 0, 0], Spine: [10, 0, 4], Spine1: [4, 0, 2], Neck: [-4, 0, 0] },
      [-0.38, 0.16, 0.14], [0.36, -0.06, -0.24], -0.18),
    deckKey(T / 2, { ...legs, LeftLeg: [52, 0, 0], RightLeg: [48, 0, 0], Spine: [12, 0, -4], Spine1: [4, 0, -2], Neck: [-4, 0, 0] },
      [-0.34, -0.06, 0.24], [0.38, 0.16, -0.14], -0.18),
    deckKey(T, { ...legs, LeftLeg: [46, 0, 0], RightLeg: [42, 0, 0], Spine: [10, 0, 4], Spine1: [4, 0, 2], Neck: [-4, 0, 0] },
      [-0.38, 0.16, 0.14], [0.36, -0.06, -0.24], -0.18),
  ]);
}

/**
 * Manual (VENICE-SKATE-THPS, 2026-09-09): the back trucks only. Weight goes BACK over the tail, the front foot lifts
 * the nose, the chest stays up and the arms hold the wire — this is a balance act, so both hands are out and low and
 * they never stop moving. There was no manual clip at all before: the tree pointed the manual state at board_ride_idle,
 * so the one THPS link that makes a line a line looked exactly like coasting.
 */
export function buildBoardManual(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.1;
  // front leg straightens as it lifts the nose; back leg loads under the tail
  const legs = (lift: number): Bones => ({
    LeftUpLeg: [-30 + lift, 0, 10], LeftLeg: [38 - lift, 0, 0],
    RightUpLeg: [-56 - lift, 0, -12], RightLeg: [88 + lift, 0, 0],
  });
  const torso = (x: number, r: number): Bones => ({ Spine: [x, 0, r], Spine1: [-4, 0, r * 0.4], Neck: [-10, 0, 0] });
  return buildPoseClip(scene, sk, 'board_manual', T, [
    key(0, { ...legs(0), ...torso(-8, 3) }, [-0.42, -0.10, 0.10], [0.42, -0.12, 0.06], -0.30, 1, NOSE_UP(0)),
    key(T / 2, { ...legs(5), ...torso(-11, -4) }, [-0.40, 0.02, 0.16], [0.41, -0.20, -0.02], -0.32, 1, NOSE_UP(0.03)),
    key(T, { ...legs(0), ...torso(-8, 3) }, [-0.42, -0.10, 0.10], [0.42, -0.12, 0.06], -0.30, 1, NOSE_UP(0)),
  ]);
}

/**
 * Ollie (VENICE-SKATE-THPS): plant, pop, hang. The back foot SNAPS down on the tail while the front foot drags up the
 * deck and levels out at the top — the sticky beat the pop was missing (the mode used to go straight from the ride idle
 * into the air tuck, so the pop had no body at all).
 */
export function buildSkateOllie(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.4;
  return buildPoseClip(scene, sk, 'skate_ollie', T, [
    // plant: load down into the tail
    key(0, { LeftUpLeg: [-62, 0, 8], LeftLeg: [96, 0, 0], RightUpLeg: [-58, 0, -10], RightLeg: [92, 0, 0], Spine: [30, 0, 0], Spine1: [8, 0, 0], Neck: [-14, 0, 0] },
      [-0.34, -0.28, 0.22], [0.36, -0.26, 0.14], -0.44),
    // pop: the back foot drives the tail down, the body extends up
    key(T * 0.3, { LeftUpLeg: [-30, 0, 8], LeftLeg: [42, 0, 0], RightUpLeg: [-6, 0, -10], RightLeg: [18, 0, 0], Spine: [8, 0, 0], Spine1: [2, 0, 0], Neck: [-4, 0, 0] },
      [-0.42, 0.08, 0.14], [0.42, 0.06, 0.02], -0.06),
    // hang: the front foot drags up and levels the deck, knees come to the chest
    key(T * 0.65, { LeftUpLeg: [-72, 0, 10], LeftLeg: [96, 0, 0], RightUpLeg: [-62, 0, -12], RightLeg: [88, 0, 0], Spine: [26, 0, 0], Spine1: [8, 0, 0], Neck: [-10, 0, 0] },
      [-0.38, -0.10, 0.20], [0.40, -0.04, 0.06], -0.30),
    key(T, { LeftUpLeg: [-52, 0, 9], LeftLeg: [76, 0, 0], RightUpLeg: [-46, 0, -11], RightLeg: [70, 0, 0], Spine: [20, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.42, -0.02, 0.14], [0.43, 0.00, -0.02], -0.24),
  ]);
}

/** Compress on landing, then ride it out. */
export function buildBoardLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.42;
  return buildPoseClip(scene, sk, 'board_land', T, [
    deckKey(0, { LeftUpLeg: [-34, 0, 7], LeftLeg: [52, 0, 0], RightUpLeg: [-30, 0, -9], RightLeg: [48, 0, 0], Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-6, 0, 0] },
      [-0.42, 0.06, 0.10], [0.42, 0.04, -0.06], -0.14),
    deckKey(T * 0.35, { LeftUpLeg: [-66, 0, 7], LeftLeg: [98, 0, 0], RightUpLeg: [-62, 0, -9], RightLeg: [94, 0, 0], Spine: [40, 0, 0], Spine1: [12, 0, 0], Neck: [-16, 0, 0] },
      [-0.28, -0.30, 0.24], [0.30, -0.28, 0.18], -0.40),
    deckKey(T, { LeftUpLeg: [-26, 0, 7], LeftLeg: [42, 0, 0], RightUpLeg: [-22, 0, -9], RightLeg: [38, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.38, -0.16, 0.16], [0.39, -0.18, 0.10], -0.16),
  ]);
}

/**
 * THE SKETCHY LANDING (ANIM-READABILITY, 2026-09-21). The tree had two landing states and one clip, so a landing the
 * judge called sketchy — and docked — looked exactly like a stomped one: the score said something the body did not. A
 * sketchy landing is the one where the rider is NOT over the board: the compression goes deeper and lasts longer, the
 * chest is thrown toward the nose and pitched off to the toe side, and the arms windmill — back arm up and behind, front
 * arm out low, then they trade as he fights it back. The feet stay on the trucks throughout (he rode away), and the last
 * key is the clean landing's last key, so both landings hand the ride the same pose.
 */
export function buildBoardLandSketchy(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.62;
  return buildPoseClip(scene, sk, 'board_land_sketchy', T, [
    deckKey(0, { LeftUpLeg: [-34, 0, 7], LeftLeg: [52, 0, 0], RightUpLeg: [-30, 0, -9], RightLeg: [48, 0, 0], Spine: [24, 0, 6], Spine1: [6, 0, 3], Neck: [-6, 0, 0] },
      [-0.42, 0.06, 0.10], [0.42, 0.04, -0.06], -0.14),
    // the slam: deeper than the clean land, the chest dumped forward and off to the toe side, arms thrown out to catch it
    deckKey(T * 0.25, { LeftUpLeg: [-72, 0, 9], LeftLeg: [106, 0, 0], RightUpLeg: [-66, 0, -11], RightLeg: [100, 0, 0], Spine: [50, 0, 16], Spine1: [14, 0, 8], Neck: [-18, 0, 0] },
      [-0.44, -0.12, 0.26], [0.34, 0.30, -0.22], -0.46),
    // the fight: the body swings back past centre to the heel side, the arms trade
    deckKey(T * 0.55, { LeftUpLeg: [-56, 0, 6], LeftLeg: [84, 0, 0], RightUpLeg: [-52, 0, -8], RightLeg: [80, 0, 0], Spine: [26, 0, -14], Spine1: [6, 0, -7], Neck: [-8, 0, 0] },
      [-0.36, 0.28, -0.16], [0.44, -0.14, 0.20], -0.34),
    deckKey(T * 0.8, { LeftUpLeg: [-38, 0, 7], LeftLeg: [58, 0, 0], RightUpLeg: [-34, 0, -9], RightLeg: [54, 0, 0], Spine: [20, 0, 5], Spine1: [5, 0, 2], Neck: [-6, 0, 0] },
      [-0.42, -0.04, 0.16], [0.40, -0.08, 0.04], -0.22),
    deckKey(T, { LeftUpLeg: [-26, 0, 7], LeftLeg: [42, 0, 0], RightUpLeg: [-22, 0, -9], RightLeg: [38, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.38, -0.16, 0.16], [0.39, -0.18, 0.10], -0.16),
  ]);
}

/** Kickflip: a sharp flick from the front foot, body compact over the board, arms tucked in tight. */
export function buildSkateKickflip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.5;
  return buildPoseClip(scene, sk, 'skate_kickflip', T, [
    key(0, { LeftUpLeg: [-52, 0, 7], LeftLeg: [78, 0, 0], RightUpLeg: [-48, 0, -9], RightLeg: [74, 0, 0], Spine: [30, 0, 0], Spine1: [8, 0, 0], Neck: [-10, 0, 0] },
      [-0.30, -0.16, 0.28], [0.32, -0.18, 0.20], -0.20),
    // the flick: the front foot snaps out to the edge, the body opens over it
    key(T * 0.3, { LeftUpLeg: [-30, 0, 26], LeftLeg: [34, 0, 0], RightUpLeg: [-66, 0, -9], RightLeg: [96, 0, 0], Spine: [12, 0, 0], Spine1: [4, 0, 0], Neck: [-4, 0, 0] },
      [-0.26, -0.04, 0.34], [0.34, -0.08, 0.24], -0.06),
    key(T * 0.6, { LeftUpLeg: [-58, 0, 10], LeftLeg: [82, 0, 0], RightUpLeg: [-52, 0, -9], RightLeg: [80, 0, 0], Spine: [24, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.32, -0.18, 0.26], [0.34, -0.20, 0.18], -0.16),
    key(T, { LeftUpLeg: [-44, 0, 8], LeftLeg: [62, 0, 0], RightUpLeg: [-42, 0, -9], RightLeg: [64, 0, 0], Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.38, -0.10, 0.20], [0.40, -0.12, 0.12], -0.18),
  ]);
}

/** Where a slammed rider's ankles end up: splayed, on the ground, the back leg thrown wider than the front. */
const SLAM_FEET = { Left: [-0.26, 0.07, 0.16] as [number, number, number], Right: [0.30, 0.07, -0.18] as [number, number, number] };

/** Bail — the board is gone and so is the rider. The stance BREAKS: the hips unwind and the arms flail out straight,
 *  which is the one place in this suite where a locked elbow is the truth. */
export function buildSkateBail(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.75;
  return buildPoseClip(scene, sk, 'skate_bail', T, [
    key(0, { LeftUpLeg: [-30, 0, 7], LeftLeg: [46, 0, 0], RightUpLeg: [-26, 0, -9], RightLeg: [42, 0, 0], Spine: [20, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.40, -0.10, 0.18], [0.40, -0.12, 0.12], -0.16, 1),
    key(T * 0.4, { LeftUpLeg: [-76, 0, 34], LeftLeg: [30, 0, 0], RightUpLeg: [-18, 0, -30], RightLeg: [88, 0, 0], Spine: [58, 0, 26], Spine1: [14, 0, 10], Neck: [10, 0, 0] },
      [-0.28, 0.36, -0.16], [0.31, 0.33, -0.20], -0.10, 0.5),
    // RIG-FLOOR (2026-09-18): the landing half of the bail was keyed in thigh/shin degrees only, and the hips fell 0.53 m
    // over the last 0.4 s while those degrees held — so both ankles were carried 0.14 m THROUGH the ground on the way
    // down, which is the one thing a crash must not do (it reads as the rider sinking into the pitch, not hitting it).
    // The rest of this suite already solves its stance by PLANTING the feet and letting the hips' drop become knee bend;
    // the bail gets the same treatment, with the feet splayed where a rider's actually end up after a slam.
    key(T * 0.78, { LeftUpLeg: [-48, 0, 44], LeftLeg: [104, 0, 0], RightUpLeg: [-70, 0, -38], RightLeg: [74, 0, 0], Spine: [66, 0, 32], Spine1: [20, 0, 16], Neck: [22, 0, 0] },
      [-0.40, 0.22, -0.24], [0.42, 0.18, -0.27], -0.40, 0, SLAM_FEET),
    key(T, { LeftUpLeg: [-52, 0, 44], LeftLeg: [126, 0, 0], RightUpLeg: [-74, 0, -38], RightLeg: [104, 0, 0], Spine: [74, 0, 34], Spine1: [24, 0, 18], Neck: [26, 0, 0] },
      [-0.40, 0.10, -0.26], [0.42, 0.06, -0.29], -0.62, 0, SLAM_FEET),
  ]);
}
