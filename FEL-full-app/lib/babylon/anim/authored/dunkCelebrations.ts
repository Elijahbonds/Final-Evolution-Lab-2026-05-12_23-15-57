// dunkCelebrations — what a dunker does on the floor after the make (DUNK MOTION phase 12, 2026-09-24).
//
// Owner: "we need to add cinematic emotes after the dunks, specifically look up dunkers like brandon ruffin who do celebrations after
// the dunk which will add to the moment." Watched, not assumed:
//   · BRANDON "HighRize" RUFFIN (TNT's "he hit the Spider-Man and the splits", Shaq falling out of his chair): he lands, SCREAMS at the
//     crowd, drops into the Spider-Man — a deep wide crouch, one hand planted on the floor between his feet, the other thrown out
//     behind — and slides down into the SPLITS.
//   · VINCE CARTER, 2000: "IT'S OVER" — both arms waving across the chest, palms down, the umpire's wave-off: the contest is done.
//   · THE ROAR — the double-bicep flex ripped down into a scream, knees bent, chest out (Garnett's).
//   · TOO SMALL — the flat hand patted over the head: you are too small to guard this.
// Authored like the rest of the family (hands as body metres from the root, fitted by the two-bone solver; torso and legs in degrees
// about the parent's bind axes) and named `dunk_celeb_*` so the right-handed mirror (groupMirror) carries them with the dunks: the
// authored Right is the dunking hand.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';
type V3 = [number, number, number];

export const CELEB_SPIDERMAN_SEC = 2.6, CELEB_ITS_OVER_SEC = 2.0, CELEB_ROAR_SEC = 1.8, CELEB_TOO_SMALL_SEC = 1.6;

const STAND: Record<string, Deg3> = { LeftUpLeg: [-10, 0, 4], LeftLeg: [18, 0, 0], RightUpLeg: [-8, 0, -4], RightLeg: [16, 0, 0] };
const SIDES: { Right: V3; Left: V3 } = { Right: [0.24, 0.95, 0.06], Left: [-0.24, 0.95, 0.06] };
const OUT = { Right: [0.8, 0.2, -0.4] as V3, Left: [-0.8, 0.2, -0.4] as V3 };
/** A hand or foot target `v` given as its height above the floor, at a key whose Hips track sits at `hipsY` (dunkTakeoff's `foot`): the
 *  limbs are solved on an unlowered body and then lowered with the hips, so a floor height alone lands `hipsY` too low. */
const floorAt = (hipsY: number, v: V3): V3 => [v[0], v[1] - hipsY, v[2]];

/**
 * THE SPIDER-MAN SPLITS: the scream, the Spider-Man, the splits.
 *
 * HOTFIX (2026-09-24): the slide went THROUGH the court. Out of the crouch the knees straightened with the thighs still pointing down,
 * and the 1.35 key dropped the hips to 0.24 m under legs angled for a standing split — both ankles 0.33–0.37 m under the floor on every
 * body (rig-floor-tests, red in CI since phase 12). A first fix put the back knee down under the hips at 1.15, but a knee can only be
 * under the hips with the pelvis a thigh's length up, so the hips ROSE 17 cm out of the crouch and then fell (0.36 → 0.53 → 0.24 m
 * on the forge hero): a hop, not a slide. Now the hips only ever go down (0.36 → 0.30 → 0.23 → 0.12) and the legs make the room
 * instead: the front foot slides out under a knee still bent from the crouch, while the back foot is PLACED behind (the two-bone solver,
 * its floor height less the key's hipsY) with the knee turned out and down — a bent back leg under a low pelvis with its knee toward the
 * court puts the knee through it — and only faces the court once the leg is nearly straight. Measured on three distinct skeletons (the
 * procedural sweep body; the forge hero, whose joint heights the male kit and every athlete share; the female kit): the hips never rise
 * after 0.95 s, both feet run apart 0.01–0.11 m off the floor (−0.03 on the sweep body, whose crouch already sits at −0.02), the back
 * knee stays at or above 0.05 m and the front knee peaks at 0.42 m (0.53 in the hop). And the hands were floor heights under a Hips
 * track of up to −0.84, so the "arms up to the building" finished at 0.22 m, by the knees.
 *
 * Still to be WATCHED (unseen, measured only): the front knee comes UP 0.22 → 0.42 m out of the crouch (0.95–1.27 s) while the hips go
 * down. Both slide keys hold it there (the thigh flexed 140° / 125° under a hip joint ~0.25 m up), and lowering it is not a key tweak:
 * of 300 front thigh/knee pairs tried at 1.15 and 1.35 on the forge hero, every one that keeps the knee under 0.33 m puts the front
 * ankle 8–23 cm through the court, and the ones that stay on the floor keep it at 0.36 m or more — a foot on the floor under a hip that
 * low leaves a bent leg only UP to go. If the eye reads it as a pop, the front foot wants placing (feet.Left) rather than its angles
 * keying.
 */
export const CELEB_SPIDERMAN_KEYS: PoseKey[] = [
  { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], Neck: [0, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
  { t: 0.28, bones: { Hips: [-2, 0, 0], Spine: [-10, 0, 0], Neck: [-28, 0, 0], LeftUpLeg: [-30, 0, 8], LeftLeg: [45, 0, 0], RightUpLeg: [-28, 0, -8], RightLeg: [42, 0, 0] }, hands: { Right: floorAt(-0.12, [0.34, 1.35, 0.18]), Left: floorAt(-0.12, [-0.34, 1.35, 0.18]) }, poles: OUT, hipsY: -0.12 },   // THE SCREAM at the crowd
  { t: 0.62, bones: { Hips: [38, 0, 0], Spine: [26, 0, 0], Neck: [-44, 0, 0], LeftUpLeg: [-104, 0, 40], LeftLeg: [130, 0, 0], RightUpLeg: [-104, 0, -40], RightLeg: [130, 0, 0] }, hands: { Left: floorAt(-0.6, [-0.08, 0.02, 0.5]), Right: floorAt(-0.6, [0.45, 0.8, -0.35]) }, hipsY: -0.6 },   // THE SPIDER-MAN: a hand on the floor, the other thrown back, head up
  { t: 0.95, bones: { Hips: [38, 0, 0], Spine: [26, 0, 0], Neck: [-46, 0, 0], LeftUpLeg: [-104, 0, 40], LeftLeg: [130, 0, 0], RightUpLeg: [-104, 0, -40], RightLeg: [130, 0, 0] }, hands: { Left: floorAt(-0.6, [-0.08, 0.02, 0.5]), Right: floorAt(-0.6, [0.48, 0.85, -0.36]) }, hipsY: -0.6, hold: true },
  { t: 1.15, bones: { Hips: [22, 0, 0], Spine: [12, 0, 0], Neck: [-28, 0, 0], LeftUpLeg: [-140, 0, 50], LeftLeg: [140, 0, 0] }, feet: { Right: floorAt(-0.66, [0.18, 0.11, -0.32]) }, kneePoles: { Right: [1, -0.4, -0.5] }, hipsY: -0.66 },   // the front foot sliding out, the back knee turned out and down, its foot behind
  { t: 1.35, bones: { Hips: [8, 0, 0], Spine: [0, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-125, 0, 20], LeftLeg: [90, 0, 0] }, feet: { Right: floorAt(-0.72, [0.12, 0.11, -0.78]) }, kneePoles: { Right: [1, -0.6, 0] }, hands: { Right: floorAt(-0.72, [0.62, 0.58, 0.1]), Left: floorAt(-0.72, [-0.62, 0.58, 0.1]) }, poles: OUT, hipsY: -0.72 },   // sliding down…
  { t: 1.7, bones: { Hips: [4, 0, 0], Spine: [-4, 0, 0], Neck: [-16, 0, 0], LeftUpLeg: [-90, 0, 4], LeftLeg: [0, 0, 0], RightUpLeg: [88, 0, -4], RightLeg: [0, 0, 0] }, hands: { Right: floorAt(-0.84, [0.78, 0.66, 0.08]), Left: floorAt(-0.84, [-0.78, 0.66, 0.08]) }, poles: OUT, hipsY: -0.84 },   // THE SPLITS, arms out
  { t: CELEB_SPIDERMAN_SEC, bones: { Hips: [4, 0, 0], Spine: [-8, 0, 0], Neck: [-20, 0, 0], LeftUpLeg: [-90, 0, 4], LeftLeg: [0, 0, 0], RightUpLeg: [88, 0, -4], RightLeg: [0, 0, 0] }, hands: { Right: floorAt(-0.84, [0.56, 1.02, 0.1]), Left: floorAt(-0.84, [-0.56, 1.02, 0.1]) }, poles: OUT, hipsY: -0.84, hold: true },   // …and the arms up to the building
];
export function buildCelebSpidermanSplits(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'dunk_celeb_spiderman_splits', CELEB_SPIDERMAN_SEC, CELEB_SPIDERMAN_KEYS);
}

/** VINCE CARTER: "IT'S OVER" — the wave-off across the chest, palms down. */
export function buildCelebItsOver(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const wide = { Right: [0.7, 1.28, 0.28] as V3, Left: [-0.7, 1.28, 0.28] as V3 };
  const crossed = { Right: [-0.18, 1.22, 0.4] as V3, Left: [0.18, 1.27, 0.36] as V3 };
  const bones: Record<string, Deg3> = { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-12, 0, 0], ...STAND };   // chin up at the crowd
  const k = (t: number, hands: typeof wide, bounce: number, hold = false) => ({ t, bones, hands, poles: OUT, hipsY: bounce, hold });
  return buildPoseClip(scene, sk, 'dunk_celeb_its_over', CELEB_ITS_OVER_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
    k(0.25, wide, -0.03), k(0.5, crossed, 0), k(0.75, wide, -0.03), k(1.0, crossed, 0), k(1.25, wide, -0.03, true),
    { t: CELEB_ITS_OVER_SEC, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-14, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
  ]);
}

/** THE ROAR: the double-bicep flex ripped down into the scream. */
export function buildCelebRoar(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const bent: Record<string, Deg3> = { LeftUpLeg: [-48, 0, 12], LeftLeg: [70, 0, 0], RightUpLeg: [-45, 0, -12], RightLeg: [66, 0, 0] };
  return buildPoseClip(scene, sk, 'dunk_celeb_roar', CELEB_ROAR_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
    { t: 0.2, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-10, 0, 0], ...STAND }, hands: { Right: [0.42, 1.62, 0.02], Left: [-0.42, 1.62, 0.02] }, poles: { Right: [0.6, 0.6, -0.4], Left: [-0.6, 0.6, -0.4] }, hipsY: 0 },   // the double bicep
    { t: 0.45, bones: { Hips: [10, 0, 0], Spine: [18, 0, 0], Neck: [-30, 0, 0], ...bent }, hands: { Right: [0.28, 1.0, 0.22], Left: [-0.28, 1.0, 0.22] }, poles: OUT, hipsY: -0.2 },   // ripped down: THE SCREAM
    { t: 0.9, bones: { Hips: [10, 0, 0], Spine: [18, 0, 0], Neck: [-32, 0, 0], ...bent }, hands: { Right: [0.3, 0.98, 0.24], Left: [-0.3, 0.98, 0.24] }, poles: OUT, hipsY: -0.2, hold: true },
    { t: 1.3, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], Neck: [-18, 0, 0], LeftUpLeg: [-15, 0, 6], LeftLeg: [25, 0, 0], RightUpLeg: [-12, 0, -6], RightLeg: [22, 0, 0] }, hands: { Right: [0.1, 1.35, 0.18], Left: [-0.5, 1.2, 0.1] }, hipsY: -0.05 },   // the fist on the chest
    { t: CELEB_ROAR_SEC, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [-8, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
  ]);
}

/** TOO SMALL: the flat hand patted over the head. */
export function buildCelebTooSmall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up = { Right: [0.06, 1.84, 0.1] as V3, Left: [-0.3, 1.0, -0.02] as V3 };     // (in reach: the arm's top is ~1.81 on the reference body)
  const down = { Right: [0.06, 1.7, 0.1] as V3, Left: [-0.3, 1.0, -0.02] as V3 };   // …patting down to just over the head
  const bones = { Hips: [0, 0, 0] as Deg3, Spine: [-6, 0, 0] as Deg3, Neck: [-14, 0, 0] as Deg3, ...STAND };
  const pole = { Right: [0.8, 0.3, 0.2] as V3, Left: [-0.8, -0.2, -0.5] as V3 };
  return buildPoseClip(scene, sk, 'dunk_celeb_too_small', CELEB_TOO_SMALL_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...STAND }, hands: SIDES, hipsY: 0 },
    { t: 0.25, bones, hands: up, poles: pole }, { t: 0.45, bones, hands: down, poles: pole },
    { t: 0.65, bones, hands: up, poles: pole }, { t: 0.85, bones, hands: down, poles: pole },
    { t: 1.05, bones, hands: up, poles: pole },
    { t: CELEB_TOO_SMALL_SEC, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], Neck: [-8, 0, 0], ...STAND }, hands: SIDES },
  ]);
}
