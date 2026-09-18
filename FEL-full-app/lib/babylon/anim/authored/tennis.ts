// Tennis (Phase 3 clips, 2026-09-03) — RE-AUTHORED as pose targets (ship pass 3,
// rung 1): torso keys in degrees, hands as world-axis metres from the root,
// fitted at build time by the two-bone solver so one authoring plays on any
// body that passes Gate 0. The targets are the positions the previous
// offset-authored form was solved to, so the shapes are unchanged.
//
//   tennis_ready — split-step bounce, racket hand front-right (loop)
//   tennis_swing — forehand: take-back, contact out front, wrap over the left shoulder
//   tennis_serve — trophy, contact overhead, follow through low left
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD (+z).
// A right-hander's backswing/take-back therefore keys NEGATIVE yaw so the racket
// shoulder goes back and the target stays inside the arm's reach.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
import { strafeBones, STRAFE_PHASES } from './locomotion';

export const TENNIS_CLIPS = ['tennis_ready', 'tennis_swing', 'tennis_serve', 'tennis_shuffle_left', 'tennis_shuffle_right'] as const;
type V3 = [number, number, number];

const RACKET_READY: V3 = [0.32, 1.03, 0.27];
const FREE_READY: V3 = [0.06, 1.09, 0.29];

export function buildTennisReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 0.8;
  const legs = (knee: number): Record<string, Deg3> => ({ LeftUpLeg: [-22 - (knee - 34) * 0.6, 0, 14], RightUpLeg: [-22 - (knee - 34) * 0.6, 0, -14], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
  const key = (t: number, spine: number, knee: number, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...legs(knee) }, hands: { Right: RACKET_READY, Left: FREE_READY }, hipsY });
  return buildPoseClip(scene, sk, 'tennis_ready', D, [key(0, 14, 34, -0.06), key(D / 2, 16, 40, -0.09), key(D, 14, 34, -0.06)]);
}

/** Forehand. RECOGNISABLE (2026-09-15): the stills showed a hand that hardly left the hip — the take-back sat at the
 *  hip line and the finish at the chin. A forehand reads by the UNIT TURN (shoulders sideways, racket back past the
 *  body, free arm across pointing at the ball), contact out in front at the waist, and a finish WRAPPED high over the
 *  opposite shoulder with the chest facing the net and the back heel up. */
export function buildTennisSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'tennis_swing', 0.6, [
    // unit turn: racket back past the right hip and up, free arm across the body pointing at the ball
    { t: 0,    bones: { Hips: [0, -45, 0], Spine: [10, -35, 0], Neck: [0, 30, 0], LeftUpLeg: [-18, 0, 12], RightUpLeg: [-26, 0, -12], LeftLeg: [18, 0, 0], RightLeg: [30, 0, 0] }, hands: { Right: [0.46, 1.22, -0.46], Left: [0.26, 1.24, 0.46] }, poles: { Right: [0.8, -0.4, -0.4] }, hipsY: -0.08 },
    // drop: the racket dips below the ball as the hips start round
    { t: 0.18, bones: { Hips: [0, -20, 0], Spine: [14, -18, 0], Neck: [0, 16, 0], LeftUpLeg: [-18, 0, 12], RightUpLeg: [-24, 0, -10], LeftLeg: [20, 0, 0], RightLeg: [28, 0, 0] }, hands: { Right: [0.50, 0.90, -0.20], Left: [0.10, 1.14, 0.40] }, poles: { Right: [0.8, -0.5, -0.2] }, hipsY: -0.09 },
    // contact out front at the waist
    { t: 0.3,  bones: { Hips: [0, 14, 0], Spine: [14, 14, 0], Neck: [0, -8, 0], LeftUpLeg: [-15, 0, 10], RightUpLeg: [-18, 0, -9], LeftLeg: [16, 0, 0], RightLeg: [24, 0, 0] },  hands: { Right: [0.36, 1.06, 0.50], Left: [-0.06, 1.04, 0.30] }, poles: { Right: [0.8, -0.5, 0.2] }, hipsY: -0.07 },
    // the wrap: racket high over the left shoulder, chest square to the net, back heel up
    { t: 0.6,  bones: { Hips: [0, 50, 0], Spine: [8, 40, 0], Neck: [0, -20, 0], LeftUpLeg: [-12, 0, 8], RightUpLeg: [-8, 0, -6], LeftLeg: [10, 0, 0], RightLeg: [36, 0, 0], RightFoot: [-30, 0, 0] }, hands: { Right: [-0.34, 1.66, 0.04], Left: [-0.10, 1.10, 0.18] }, poles: { Right: [-0.5, -0.6, -0.6] }, hipsY: -0.03 },
  ]);
}

/** Serve. */
export function buildTennisServe(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'tennis_serve', 0.9, [
    // set: both hands low in front
    { t: 0,   bones: { Hips: [0, -20, 0],  Spine: [0, -10, 0],    LeftUpLeg: [-8, 0, 8],   RightUpLeg: [-8, 0, -8],   LeftLeg: [10, 0, 0], RightLeg: [10, 0, 0] }, hands: { Right: [0.25, 1.05, 0.25], Left: [0.05, 1.05, 0.30] }, hipsY: -0.02 },
    // trophy: toss arm straight up, racket cocked behind the head
    { t: 0.4, bones: { Hips: [0, -30, 0],  Spine: [-12, -20, 0],  LeftUpLeg: [-20, 0, 8],  RightUpLeg: [-20, 0, -8],  LeftLeg: [34, 0, 0], RightLeg: [34, 0, 0] }, hands: { Left: [0.08, 1.72, 0.26], Right: [0.30, 1.72, -0.22] }, poles: { Left: [-0.6, 0.2, -0.6], Right: [0.9, 0.0, -0.4] }, hipsY: -0.08 },
    // contact overhead
    { t: 0.6, bones: { Hips: [0, 10, 0], Spine: [12, 10, 0],  LeftUpLeg: [-14, 0, 8],  RightUpLeg: [-24, 0, -7],  LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Right: [0.15, 1.92, 0.10], Left: [0.02, 1.25, 0.32] }, poles: { Right: [0.9, 0.1, -0.3] }, hipsY: 0.02 },
    // follow through low left
    { t: 0.9, bones: { Hips: [0, 25, 0], Spine: [26, 20, 0],  LeftUpLeg: [-10, 0, 8],  RightUpLeg: [-30, 0, -6],  LeftLeg: [10, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [-0.25, 1.00, 0.30], Left: [-0.12, 1.00, 0.10] }, poles: { Right: [-0.3, -0.7, 0.4] }, hipsY: -0.04 },
  ]);
}

/** The baseline SHUFFLE (ANIM-READABILITY net / precision, 2026-09-07): the side-step's legs under the READY arms — racket
 *  hand front-right, free hand up. The generic strafe hung both arms (a player sliding along the baseline with a racket
 *  at the knee); the split-step bounce on its own read as a slide. Loop, same 0.6 s cadence as the strafe. */
export function buildTennisShuffle(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const key = (t: number, roll: number, lead: number, trail: number) => ({
    // the LEADING leg (the one on the side you move to) lifts; the generic strafe lifts the left thigh both ways
    t, bones: { ...strafeBones(dir, roll, lead, trail), Spine: [14 + roll * 0.4, 0, -roll * 0.7 * s] as Deg3, LeftUpLeg: [-16 - (s > 0 ? lead : -trail), 0, 8 * s] as Deg3, RightUpLeg: [-16 - (s > 0 ? -trail : lead), 0, 8 * s] as Deg3, LeftLeg: [30, 0, 0] as Deg3, RightLeg: [30, 0, 0] as Deg3 },
    hands: { Right: [RACKET_READY[0], RACKET_READY[1] + roll * 0.004, RACKET_READY[2]] as V3, Left: [FREE_READY[0], FREE_READY[1] + roll * 0.004, FREE_READY[2]] as V3 }, hipsY: -0.06 - (lead ? 0.02 : 0),
  });
  return buildPoseClip(scene, sk, `tennis_shuffle_${dir}`, 0.6, STRAFE_PHASES.map(([t, r, l, tr]) => key(t, r, l, tr)));
}
