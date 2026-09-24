// party — the quiz podium's body language (BRAINBRAWL-MAJOR, 2026-09-24).
//
// Measured on the live /dev/brainbrawl (base b6d66d5): the contestant stood in `idle_stand` through every question (645
// of 645 answer-window frames) and every finish (95 of 95), and the only verdicts were borrowed from other sports — the
// dunk contest's crouch-and-flex for a right answer, the fighter's flinch for a wrong one. A spectator could not tell
// thinking from waiting, a locked answer from an empty podium, or the winner from the loser. The benchmark is Mario Party:
// who is winning must read in three seconds, from the couch.
//
// So the podium gets the game show's own vocabulary, every one a gesture a stranger reads without a caption:
//   think    — the fist under the chin, the other arm across the belly holding the elbow, head cocked, looking up
//   buzz     — the hand up and SLAMMED down on the podium buzzer (the Family Feud slap), a lean into it
//   locked   — both hands flat on the podium, weight forward: "I'm in, waiting on you"
//   yes      — the fist pump: up, yanked down to the hip, twice ("YES!")
//   facepalm — the palm to the forehead, head dropped into it
//   shrug    — the clock ran out: both palms up and out, head tilted
//   win      — both fists thrown up in a V, bouncing (win_in raises them UP THE FRONT into it)
//   lose     — hands on the podium, head hung, a slow shake
// Authored like the rest of the library: hands as wrist targets in body metres from the root (+x right, +y up, +z
// forward), fitted by the two-bone solver; torso and legs in degrees about the parent's bind axes. Heights are the forge
// hero's (hips 0.96, shoulders 1.40, the head's base 1.51): the chin is ~1.53 and ~0.10 forward, the brow ~1.66.
// The podium top the mode builds is at PODIUM_TOP_M, ~0.40 in front of the body.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

export const PARTY_THINK_SEC = 3.0, PARTY_BUZZ_SEC = 0.6, PARTY_LOCKED_SEC = 2.4, PARTY_YES_SEC = 0.95, PARTY_FACEPALM_SEC = 1.4,
  PARTY_SHRUG_SEC = 1.1, PARTY_WIN_SEC = 1.2, PARTY_WIN_IN_SEC = 0.4, PARTY_LOSE_SEC = 2.8;
/** The podium's top (metres) and how far in front of the body it stands — BrainBrawlMode builds it to these. */
export const PODIUM_TOP_M = 1.0, PODIUM_AHEAD_M = 0.42;

const STAND: Record<string, Deg3> = { LeftUpLeg: [-8, 0, 4], LeftLeg: [14, 0, 0], RightUpLeg: [-8, 0, -4], RightLeg: [14, 0, 0] };
/** Weight on the left leg, the right knee soft — a person settled in to wait, not a soldier. */
const HIPSHOT: Record<string, Deg3> = { LeftUpLeg: [-6, 0, 6], LeftLeg: [8, 0, 0], RightUpLeg: [-14, 0, -2], RightLeg: [26, 0, 0] };
const SIDES: { Right: V3; Left: V3 } = { Right: [0.24, 0.93, 0.07], Left: [-0.24, 0.93, 0.07] };
const OUT = { Right: [0.8, -0.3, -0.4] as V3, Left: [-0.8, -0.3, -0.4] as V3 };
const DOWN = { Right: [0.5, -0.8, -0.2] as V3, Left: [-0.5, -0.8, -0.2] as V3 };
/** Both hands flat on the podium top. */
const ON_PODIUM: { Right: V3; Left: V3 } = { Right: [0.22, PODIUM_TOP_M + 0.04, PODIUM_AHEAD_M - 0.04], Left: [-0.22, PODIUM_TOP_M + 0.04, PODIUM_AHEAD_M - 0.04] };

/** THINK: the fist under the chin, the other forearm across the belly under that elbow, head cocked and up. Loops. */
export function buildPartyThink(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const chin = (dy: number): V3 => [0.05, 1.43 + dy, 0.17];
  const hold: V3 = [0.10, 1.13, 0.17];
  const poles = { Right: [0.3, -0.9, 0.3] as V3, Left: [-0.6, -0.6, -0.4] as V3 };
  const k = (t: number, dy: number, neck: Deg3, roll: number) => ({ t, bones: { Hips: [0, 0, roll] as Deg3, Spine: [5, 0, -roll * 0.5] as Deg3, Neck: neck, ...HIPSHOT }, hands: { Right: chin(dy), Left: hold }, poles, hipsY: -0.01 });
  return buildPoseClip(scene, sk, 'party_think', PARTY_THINK_SEC, [
    k(0, 0, [-6, 8, 7], 3), k(0.75, 0.015, [-8, 10, 8], 3.5), k(1.5, 0, [-5, 4, 6], 3), k(2.25, 0.015, [-8, 11, 8], 3.5), k(PARTY_THINK_SEC, 0, [-6, 8, 7], 3),
  ]);
}

/** BUZZ: the hand thrown up, then SLAMMED down on the podium buzzer, leaning into it. A one-shot. */
export function buildPartyBuzz(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const slap: V3 = [0.12, PODIUM_TOP_M + 0.03, PODIUM_AHEAD_M];
  return buildPoseClip(scene, sk, 'party_buzz', PARTY_BUZZ_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
    { t: 0.13, bones: { Hips: [0, 0, 0], Spine: [2, -8, 0], Neck: [-4, 0, 0], ...STAND }, hands: { Right: [0.30, 1.56, 0.22], Left: ON_PODIUM.Left }, poles: { Right: [0.8, 0.1, -0.3], Left: OUT.Left }, hipsY: 0.01 },   // the hand up
    { t: 0.24, bones: { Hips: [0, 0, 0], Spine: [16, 6, 0], Neck: [6, 0, 0], ...STAND }, hands: { Right: slap, Left: ON_PODIUM.Left }, poles: { Right: [0.7, 0.2, -0.5], Left: OUT.Left }, hipsY: -0.04, hold: true },   // SLAM
    { t: 0.42, bones: { Hips: [0, 0, 0], Spine: [14, 4, 0], Neck: [4, 0, 0], ...STAND }, hands: { Right: slap, Left: ON_PODIUM.Left }, poles: { Right: [0.7, 0.2, -0.5], Left: OUT.Left }, hipsY: -0.03 },
    { t: PARTY_BUZZ_SEC, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], ...STAND }, hands: ON_PODIUM, poles: OUT, hipsY: -0.02 },
  ]);
}

/** LOCKED: both hands flat on the podium, weight forward, a small rock — the answer is in. Loops. */
export function buildPartyLocked(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const k = (t: number, lean: number, look: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [lean, 0, 0] as Deg3, Neck: [-4, look, 0] as Deg3, ...STAND }, hands: ON_PODIUM, poles: OUT, hipsY: -0.02 });
  return buildPoseClip(scene, sk, 'party_locked', PARTY_LOCKED_SEC, [k(0, 10, 0), k(0.8, 12, 12), k(1.6, 11, -8), k(PARTY_LOCKED_SEC, 10, 0)]);
}

/** YES: the fist pump — up by the ear, yanked down to the hip, twice, the body crunching into it. A one-shot. */
export function buildPartyYes(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up: V3 = [0.28, 1.58, 0.16], down: V3 = [0.22, 1.13, 0.20], guard: V3 = [-0.26, 1.10, 0.16];
  const pole = { Right: [0.8, -0.2, -0.4] as V3, Left: [-0.7, -0.5, -0.4] as V3 };
  const bent = { LeftUpLeg: [-16, 0, 6] as Deg3, LeftLeg: [26, 0, 0] as Deg3, RightUpLeg: [-16, 0, -6] as Deg3, RightLeg: [26, 0, 0] as Deg3 };
  return buildPoseClip(scene, sk, 'party_yes', PARTY_YES_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-10, 0, 0], ...STAND }, hands: { Right: up, Left: guard }, poles: pole, hipsY: 0.01 },
    { t: 0.34, bones: { Hips: [0, 0, 0], Spine: [16, 0, 0], Neck: [4, 0, 0], ...bent }, hands: { Right: down, Left: guard }, poles: pole, hipsY: -0.06 },   // YES
    { t: 0.52, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [-8, 0, 0], ...STAND }, hands: { Right: [0.28, 1.48, 0.16], Left: guard }, poles: pole, hipsY: 0 },
    { t: 0.7, bones: { Hips: [0, 0, 0], Spine: [14, 0, 0], Neck: [2, 0, 0], ...bent }, hands: { Right: down, Left: guard }, poles: pole, hipsY: -0.05, hold: true },   // YES
    { t: PARTY_YES_SEC, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0], Neck: [-6, 0, 0], ...STAND }, hands: { Right: [0.24, 1.05, 0.14], Left: SIDES.Left }, poles: DOWN, hipsY: 0 },
  ]);
}

/** FACEPALM: the palm to the forehead and the head dropped into it — the wrong answer. A one-shot. */
export function buildPartyFacepalm(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const brow: V3 = [0.06, 1.57, 0.21];
  const pole = { Right: [0.7, -0.5, 0.2] as V3, Left: DOWN.Left };
  const bones = (neck: number, spine: number): Record<string, Deg3> => ({ Hips: [0, 0, 0], Spine: [spine, 0, 0], Neck: [neck, -6, 0], ...HIPSHOT });
  return buildPoseClip(scene, sk, 'party_facepalm', PARTY_FACEPALM_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
    { t: 0.22, bones: bones(10, 8), hands: { Right: brow, Left: [-0.24, 0.98, 0.10] }, poles: pole, hipsY: -0.02 },
    { t: 0.45, bones: bones(20, 14), hands: { Right: [0.06, 1.53, 0.20], Left: [-0.24, 0.98, 0.10] }, poles: pole, hipsY: -0.04, hold: true },   // the head drops into the hand
    { t: 1.0, bones: bones(22, 15), hands: { Right: [0.06, 1.52, 0.20], Left: [-0.24, 0.98, 0.10] }, poles: pole, hipsY: -0.04 },
    { t: PARTY_FACEPALM_SEC, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0], Neck: [8, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
  ]);
}

/** SHRUG: the clock ran out — palms up and out at the waist, head tilted, shoulders up. A one-shot. */
export function buildPartyShrug(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const out: { Right: V3; Left: V3 } = { Right: [0.44, 1.12, 0.22], Left: [-0.44, 1.12, 0.22] };
  const tucked = { Right: [0.3, -0.9, -0.3] as V3, Left: [-0.3, -0.9, -0.3] as V3 };   // elbows at the ribs: palms out, not arms out
  return buildPoseClip(scene, sk, 'party_shrug', PARTY_SHRUG_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-2, 0, 12], ...STAND }, hands: out, poles: tucked, hipsY: 0.02 },
    { t: 0.75, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-2, 0, 14], ...STAND }, hands: { Right: [0.46, 1.14, 0.22], Left: [-0.46, 1.14, 0.22] }, poles: tucked, hipsY: 0.02, hold: true },
    { t: PARTY_SHRUG_SEC, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], Neck: [0, 0, 4], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
  ]);
}

/** WIN: both fists thrown up in a V, bouncing, chin up. Loops (the mode holds it through the final board). */
export function buildPartyWin(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hi: { Right: V3; Left: V3 } = { Right: [0.44, 1.96, 0.10], Left: [-0.44, 1.96, 0.10] };
  const lo: { Right: V3; Left: V3 } = { Right: [0.42, 1.86, 0.12], Left: [-0.42, 1.86, 0.12] };
  const up = { Right: [0.9, 0.1, -0.3] as V3, Left: [-0.9, 0.1, -0.3] as V3 };
  const bounce = { LeftUpLeg: [-18, 0, 6] as Deg3, LeftLeg: [30, 0, 0] as Deg3, RightUpLeg: [-18, 0, -6] as Deg3, RightLeg: [30, 0, 0] as Deg3 };
  const k = (t: number, h: typeof hi, legs: Record<string, Deg3>, y: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [-6, 0, 0] as Deg3, Neck: [-14, 0, 0] as Deg3, ...legs }, hands: h, poles: up, hipsY: y });
  return buildPoseClip(scene, sk, 'party_win', PARTY_WIN_SEC, [k(0, hi, STAND, 0), k(0.3, lo, bounce, -0.07), k(0.6, hi, STAND, 0), k(0.9, lo, bounce, -0.07), k(PARTY_WIN_SEC, hi, STAND, 0)]);
}

/**
 * WIN IN: the fists come up the FRONT of the body into the V — the way into `party_win`.
 *
 * Measured on the live finish (BRAINBRAWL-MAJOR probe): a cross-fade straight from the hanging idle into the V is a blend
 * in JOINT space, and the arm's shortest path from hanging to raised-out-to-the-side is through the side — 4 frames of both
 * hands out at shoulder height, the T, every time. Keyed through the front (elbows bent, fists past the chin) the arm
 * never goes out sideways; the V loop starts where this ends.
 */
export function buildPartyWinIn(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const front = { Right: [0.3, -0.8, -0.5] as V3, Left: [-0.3, -0.8, -0.5] as V3 };
  const up = { Right: [0.9, 0.1, -0.3] as V3, Left: [-0.9, 0.1, -0.3] as V3 };
  return buildPoseClip(scene, sk, 'party_win_in', PARTY_WIN_IN_SEC, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...STAND }, hands: SIDES, poles: DOWN, hipsY: 0 },
    { t: 0.13, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], Neck: [-4, 0, 0], ...STAND }, hands: { Right: [0.16, 1.28, 0.30], Left: [-0.16, 1.28, 0.30] }, poles: front, hipsY: -0.02 },   // fists up the front, elbows down
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], Neck: [-10, 0, 0], ...STAND }, hands: { Right: [0.22, 1.72, 0.22], Left: [-0.22, 1.72, 0.22] }, poles: front, hipsY: 0 },                    // past the chin, still in front
    { t: PARTY_WIN_IN_SEC, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-14, 0, 0], ...STAND }, hands: { Right: [0.44, 1.96, 0.10], Left: [-0.44, 1.96, 0.10] }, poles: up, hipsY: 0 },   // = party_win at t 0
  ]);
}

/** LOSE: hands on the podium, head hung, a slow shake. Loops. */
export function buildPartyLose(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const k = (t: number, shake: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [20, 0, 0] as Deg3, Neck: [26, shake, 0] as Deg3, ...HIPSHOT }, hands: ON_PODIUM, poles: OUT, hipsY: -0.04 });
  return buildPoseClip(scene, sk, 'party_lose', PARTY_LOSE_SEC, [k(0, 0), k(0.7, 10), k(1.4, 0), k(2.1, -10), k(PARTY_LOSE_SEC, 0)]);
}
