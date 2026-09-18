// THE SEATED DRIVER — a body in a kart (2026-09-13).
//
// Velocity Kart shipped with a kart and nobody in it: 0 skeletons in the scene. A visible vehicle driving
// itself is the most unfinished-looking thing a racing mode can do, and it sat against the owner's standing
// rule that every body in a scene is a humanoid that moves well.
//
// There is no sitting clip in the roster and no way to record one, so the pose is AUTHORED — the same route
// the dance floor's freezes and the golf address take (anim/poseClip.ts). Two traps this tree has already
// paid for, avoided here:
//
//   · `hands`/`feet` targets are solved on WORLD axes, so a body spawned at a yaw gets them 180° out (the
//     dunk pass found knees bent backward that way). The legs here are keyed as BONE EULERS, which go
//     through the shared bind frame and mean the same thing at any yaw; the hands use `handsRel`, which is
//     measured from the posed shoulder and was added for exactly this case.
//   · a pose clip is scaled by the ABSOLUTE hips height, so a body spawned on a podium bakes the podium
//     into the pose. The kart's driver is parented to the kart and posed in the kart's own space, so the
//     seat height is the kart's, not the world's.
//
// Sign conventions, read off the authored dance poses rather than guessed:
//   UpLeg[0] NEGATIVE raises the thigh toward the chest (the baby-freeze uses −100)
//   Leg[0]   POSITIVE bends the knee (that same freeze uses 110)
//   UpLeg[2] splays the knee outward, mirrored per side
//
// WHAT A KART DRIVER ACTUALLY DOES (revised after looking at the first attempt on screen). The first pass
// posed a CHAIR: thighs horizontal, shins straight down, 90° at the knee. That is how you sit at a desk, and
// it is wrong for every seat in this mode. A kart has no chair in it — the driver lies back in a floor pan
// inches off the tarmac with the legs stretched FORWARD to pedals at the nose, knees barely bent, which is
// why a kart's wheel is up at chest height instead of in the lap. The chair pose also read as "someone
// riding on the bodywork" because the knees came up into frame where the cockpit should be.
//
// Geometry that follows from the real posture, and that the kart is built around (VelocityKartMode):
//   hips pitched back 18° → a thigh at −72 lands HORIZONTAL in world, not −90
//   knee bent 26°, not 78 → the shin runs forward-and-slightly-down onto the pedals
//   the wheel sits where the hands land, ~0.3 m above the hips and just ahead of the chest

import type { Deg3, PoseKey } from '../poseClip';

/** How a driver sits IN a kart: reclined into the pan, legs forward to the pedals, wheel up at the chest. */
export const SEATED_BONES: Record<string, Deg3> = {
  // the pelvis is tipped back — the driver is lying into the seat, not perched on it
  Hips: [-18, 0, 0],
  // the spine comes back forward over the reclined pelvis so the chest faces the wheel rather than the sky
  Spine: [8, 0, 0],
  Spine1: [5, 0, 0],
  Spine2: [3, 0, 0],
  // eyes up the road: the neck undoes the rest of the recline so the driver is not staring at the canopy
  Neck: [-5, 0, 0],
  Head: [-7, 0, 0],
  // thighs horizontal in world (−18 hips + −72 here), knees a little apart to clear the steering column
  LeftUpLeg: [-72, 0, 10],
  RightUpLeg: [-72, 0, -10],
  // barely bent: the legs are stretched out to pedals at the nose, which is the whole silhouette of karting
  LeftLeg: [26, 0, 0],
  RightLeg: [26, 0, 0],
  // THE GRIP, as far as this rig can express one: the roster hero has no finger bones (22 bones, Hand is the
  // last joint on the arm), so the hand mesh is rigid and open. The arm solver leaves the wrist at bind,
  // which points the open palm straight down the forearm — hands that arrive at the rim and then reach past
  // it, fingers splayed at the camera. Rolling the wrist puts the palm ON the rim and the fingers down its
  // tangent, which is the closest thing to a grip available without a finger rig.
  LeftHand: [-52, 0, -18],
  RightHand: [-52, 0, 18],
};

/** The steering wheel's rim radius. A real kart's wheel is ~0.30 m across, and so is this one. */
export const WHEEL_RADIUS = 0.15;

/**
 * How far OUTBOARD of the shoulder each hand sits — and it is negative, which is the whole point.
 *
 * `handsRel` is measured from the POSED SHOULDER, not from the body's centre line. The first pass read it as
 * a centre-line offset and authored ±0.17 to match the rim; the shoulders are themselves ±0.164 out, so the
 * hands landed at ±0.30 and gripped thin air 13 cm outside the wheel (measured on the live rig, which is the
 * only reason this was ever found — the front view just looked "a bit wide").
 *
 * A kart wheel is NARROWER than a driver's shoulders. The hands come inboard to reach it. That is what the
 * negative sign says, and it is the same for any wheel in this codebase.
 */
export const HAND_OUTBOARD = -0.016;
export const WHEEL_HANDS = {
  // 0.38 forward of the shoulder is well short of REF_ARM_LEN's locked 0.54, which bends the elbows about
  // the right amount for a wheel held close — a driver with straight arms is a driver who cannot turn
  Left: [-HAND_OUTBOARD, -0.054, 0.38] as [number, number, number],
  Right: [HAND_OUTBOARD, -0.054, 0.38] as [number, number, number],
};

/** Elbows out and down, not tucked into the ribs. */
export const WHEEL_POLES = {
  Left: [-1, -0.35, -0.2] as [number, number, number],
  Right: [1, -0.35, -0.2] as [number, number, number],
};

/**
 * The seated pose as a one-key clip.
 *
 * A single key held for the duration: this is a STANCE, not a motion. The mode layers the steering lean on
 * the kart's own root, so the body does not need to animate for the driver to read as driving.
 */
export function seatedKeys(): PoseKey[] {
  return [{ t: 0, bones: SEATED_BONES, handsRel: WHEEL_HANDS, poles: WHEEL_POLES }];
}

/**
 * How far the driver leans into a corner, radians of roll, from the kart's steering.
 *
 * Small on purpose: a seated body is belted in and cannot lean like a rider on a board. It is the shoulders
 * following the corner, not the whole torso — 8° at full lock, against the boards' 22°.
 */
export const DRIVER_LEAN_MAX = 8 * Math.PI / 180;

/**
 * How far the wheel MESH turns at full lock — deliberately far short of a real 90°+.
 *
 * The hands are baked into the pose and cannot follow a spinning ring, so the honest ceiling is however far
 * the wheel can turn while the grip still reads as a grip. 30° is inside that, and against the body roll it
 * is plainly a driver steering; a full-lock 90° would leave the hands hanging in the air at the old clock
 * positions, which is worse than a wheel that does not move at all.
 */
export const STEER_LOCK_RAD = 30 * Math.PI / 180;
export function driverLean(steer: number, speed01: number): number {
  const s = Math.max(-1, Math.min(1, steer));
  return s * Math.max(0, Math.min(1, speed01)) * DRIVER_LEAN_MAX;
}
