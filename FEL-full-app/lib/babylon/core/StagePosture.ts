// StagePosture — the Posture Poses windows for the stage family (BIOMECH-WAVE2, 2026-09-09): DanceMode and the Court
// Carnival hub's bodies. SPEC-FEL-BIOMECH-GAMEWIDE asks these two for "G2 + G5 minimum; facing where loco exists", so
// this table is deliberately the smallest of the four: what a dancer's chest and head do on the beat, and what a
// carnival body's do while it waits its turn and when it wins or loses.
//
// What was wrong (measured on 2942860): the dance clips (danceClips.ts, procedural) key the hips, the arms and ONE
// spine bone; the head is never keyed at all, so a dancer performed a whole routine looking straight down his own root
// yaw at the back wall — no lift on a PERFECT, no drop on a MISS. The carnival hub's host and guest stand in
// `SPORT_CLIP.idle` at fixed yaws and never look at the player, the game or each other, and both the winner's
// celebrate and the loser's `karateHitReact` play on a body whose chest is still in the idle's shape.
import { POSTURE, type PosturePose } from './DunkPosture';
import type { LegPose } from './DunkLegs';

export type StageWindow =
  | 'idle' | 'watch' | 'groove' | 'step' | 'hit' | 'stumble'
  | 'charge' | 'swing' | 'celebrate' | 'dejected';

const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });

export const STAGE_POSTURE: Record<StageWindow, PosturePose> = {
  idle:      P({ lean: 2,  spine1: [2, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.5, chestAim: 0.2, weight: 0.5 }),
  // waiting your turn: turned to the thing that is happening, chin up
  watch:     P({ lean: 0,  spine1: [0, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 2,  forward: -2, eyes: 1,   chestAim: 0.8, weight: 0.7 }),
  // between steps: loose, chest slightly open, eyes UP and out (a dancer performs at someone)
  groove:    P({ lean: 3,  spine1: [2, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 4,  forward: -2, eyes: 0.9, chestAim: 0.5, weight: 0.6 }),
  // ON the step: the clip owns the hips and the arms; the layer keeps the chest tall and the head up over it. Low
  // weight on purpose — a routine's shape IS the clip, and the layer's job is only to stop the head pointing at the
  // floor for the length of a song.
  step:      P({ lean: 4,  spine1: [3, 0, 0],   spine2: [-8, 0, 0],  neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 5,  forward: -2, eyes: 0.85, chestAim: 0.3, hipYawKeep: 1, weight: 0.5 }),
  // a clean hit LIFTS: chest open, chin up. This is the whole G5 read on the beat.
  hit:       P({ lean: -4, spine1: [-6, 0, 0],  spine2: [-12, 0, 0], neck: [-6, 0, 0], head: [-8, 0, 0],  shrug: 10, forward: -6, eyes: 1,   chestAim: 0.5, weight: 0.8 }),
  // a MISS breaks the shape: chest closes, chin drops, and the next beat picks it back up
  stumble:   P({ lean: 6,  spine1: [8, 0, 0],   spine2: [6, 0, 0],   neck: [8, 0, 0],  head: [10, 0, 0],  shrug: 2,  forward: 10, eyes: 0.1, chestAim: 0,   weight: 0.6 }),
  // carnival: winding up a slam / a swing
  charge:    P({ lean: 16, spine1: [13, 0, 0],  spine2: [-2, 0, 0],  neck: [-6, 0, 0], head: [-12, 0, 0], shrug: 4,  forward: 6,  eyes: 1,   chestAim: 0.8, weight: 0.9 }),
  swing:     P({ lean: 6,  spine1: [5, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 10, forward: 0,  eyes: 1,   chestAim: 0.4, weight: 0.8 }),
  celebrate: POSTURE.celebrate,
  dejected:  P({ lean: 8,  spine1: [10, 0, 0],  spine2: [8, 0, 0],   neck: [10, 0, 0], head: [12, 0, 0],  shrug: -2, forward: 12, eyes: 0,   chestAim: 0,   weight: 0.8 }),
};

const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });
// A dance clip keys its own feet; the standing windows only flatten a sole a previous pose left pointed.
export const STAGE_LEGS: Record<StageWindow, LegPose> = {
  idle: L(0, 0.5), watch: L(0, 0.6), groove: L(0, 0.4), step: L(0, 0), hit: L(0, 0.3), stumble: L(0, 0.4),
  charge: L(0, 0.6), swing: L(0, 0.2), celebrate: L(0, 0.6), dejected: L(0, 0.7),
};

export interface StagePostureInput {
  /** A routine step is playing right now. */
  stepping: boolean;
  /** The last judgement's beat is still owning the body. */
  beat: 'hit' | 'stumble' | null;
  /** A carnival body winding up / swinging. */
  charging: boolean;
  swinging: boolean;
  celebrating: boolean;
  dejected: boolean;
  /** Something to look at (the game, the other body, the camera). */
  watching: boolean;
}
export const STAGE_INPUT_IDLE: StagePostureInput = { stepping: false, beat: null, charging: false, swinging: false, celebrating: false, dejected: false, watching: false };

export function stageWindow(i: StagePostureInput): StageWindow {
  if (i.celebrating) return 'celebrate';
  if (i.dejected) return 'dejected';
  if (i.beat) return i.beat;
  if (i.swinging) return 'swing';
  if (i.charging) return 'charge';
  if (i.stepping) return 'step';
  if (i.watching) return 'watch';
  return 'idle';
}
export function stagePose(i: StagePostureInput): { window: StageWindow; pose: PosturePose; legs: LegPose } {
  const window = stageWindow(i);
  return { window, pose: STAGE_POSTURE[window], legs: STAGE_LEGS[window] };
}

/** Seconds a judgement beat owns the dancer's body (short: the next step must be able to take it back). */
export const STAGE_BEAT_SEC = 0.28;
