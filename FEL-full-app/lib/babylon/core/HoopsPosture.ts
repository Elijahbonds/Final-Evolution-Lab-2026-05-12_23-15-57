// HoopsPosture — the Posture Poses windows for the hoops family (BIOMECH-HOOPS-WAVE1, 2026-09-08): 1v1, 3v3, 3PT and the
// dunk duel's runway bodies. The dunk contest's finding applies to every basketball clip: the base loops key the hips and
// ONE spine bone (the run keys Spine2 + Head, the pose clips key Spine + the legs + the hands), so the thoracic chain, the
// clavicles and the head sit at whatever the LAST clip that keyed them left — a defender sliding with a run's mid-stride
// twist held in his chest, a shooter whose head never looked at the iron, a dribbler whose shoulders faced wherever the
// previous crossover put them. This is the pure half: a STANCE TABLE per hoops window (the flight windows are the dunk's
// own — imported, not copied), the feet per window, and the window resolver from the game state a mode already has.
// The writer is the shared anim/PostureLayer (lifted from DunkMode.applyPostureLayer).
//
// Sport flavour (SPEC-BIOMECH-HOOPS-WAVE1): offense faces the RIM (the chest aim squares to it on the load / release /
// follow-through, glances at it on the dribble), defense faces the BALL HANDLER (the chest on him through the slide, the
// eyes on the ball), the 3PT shooter holds the follow-through with the eyes on the iron.
import { POSTURE, clamp, type PosturePose } from './DunkPosture';
import { LEGS, type LegPose } from './DunkLegs';
import type { FlightWindow } from './Biomech';

export type HoopsWindow =
  | 'idle' | 'run' | 'dribble' | 'drive' | 'protect'
  | 'gather' | 'load' | 'release' | 'follow'
  | 'defend' | 'slide' | 'reach'
  | FlightWindow | 'land' | 'celebrate'
  | 'stagger' | 'floor';

// Degrees in the clip convention (X = pitch, + bends forward / − opens), `shrug` lifts the clavicles, `forward` rounds
// them (− opens the chest). `eyes` = the head's own turn toward the eyes target, `chestAim` = the thoracic yaw that squares
// the chest to the aim point (capped at a hip–shoulder separation), `weight` = how far the bones go toward the stance.
const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });
export const HOOPS_POSTURE: Record<HoopsWindow, PosturePose> = {
  // standing / moving without the ball: the loops keep most of their life; the chest opens a little to the play
  idle:      P({ lean: 2,  spine1: [2, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.6, chestAim: 0.3,  weight: 0.6 }),
  run:       P({ lean: 6,  spine1: [4, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-8, 0, 0],  shrug: 0,  forward: 2,  eyes: 0.5, chestAim: 0.2,  weight: 0.5 }),
  // the ball: a handler sits low, chest tall, eyes up (film: the run loop rounds the chest and drops the eyes)
  dribble:   P({ lean: 5,  spine1: [3, 0, 0],   spine2: [-5, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 0,  forward: 2,  eyes: 0.6, chestAim: 0.3,  weight: 0.75 }),
  drive:     P({ lean: 12, spine1: [8, 0, 0],   spine2: [-4, 0, 0],  neck: [-4, 0, 0], head: [-12, 0, 0], shrug: 3,  forward: 4,  eyes: 0.8, chestAim: 0.4,  weight: 0.85 }),
  protect:   P({ lean: 9,  spine1: [10, 0, 0],  spine2: [-2, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 4,  forward: 6,  eyes: 0.6, chestAim: 0,    weight: 0.85 }),   // the shield: the back to the defender, the chest stays where the hips are
  // the shot: square to the rim, eyes on the iron; tall through the release; the follow-through held
  // HOOPS-MOVE-KIT-A (M1/M3): the GATHER — the plant before the rise (the pull-up, the step-back, the layup's stride): low,
  // the chest forward over the loaded knees, the eyes already on the iron
  gather:    P({ lean: 10, spine1: [6, 0, 0],   spine2: [-4, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 4,  forward: 4,  eyes: 1,   chestAim: 0.8,  weight: 0.9 }),
  load:      P({ lean: 3,  spine1: [-2, 0, 0],  spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 6,  forward: -2, eyes: 1,   chestAim: 0.9,  weight: 1 }),
  release:   P({ lean: -2, spine1: [-6, 0, 0],  spine2: [-12, 0, 0], neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 12, forward: -4, eyes: 1,   chestAim: 1,    weight: 1 }),
  follow:    P({ lean: 0,  spine1: [-4, 0, 0],  spine2: [-8, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: -2, eyes: 1,   chestAim: 0.9,  weight: 1 }),
  // defense: low, chest ON the handler through the slide, eyes on the ball
  defend:    P({ lean: 10, spine1: [8, 0, 0],   spine2: [-6, 0, 0],  neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 4,  eyes: 1,   chestAim: 0.8,  weight: 0.9 }),
  slide:     P({ lean: 8,  spine1: [8, 0, 0],   spine2: [-6, 0, 0],  neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 4,  eyes: 1,   chestAim: 0.9,  weight: 1 }),
  reach:     P({ lean: 6,  spine1: [4, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 10, forward: -2, eyes: 1,   chestAim: 0.9,  weight: 0.8 }),
  // the drive dunk's flight: the contest's own stances (DunkPosture) — one table for every dunker
  rise: POSTURE.rise, hang: POSTURE.hang, extend: POSTURE.extend, jam: POSTURE.jam, brace: POSTURE.brace,
  land: POSTURE.land, celebrate: POSTURE.celebrate,
  // a hit react / a knockdown owns the body
  stagger:   P({ lean: 0,  spine1: [4, 0, 0],   spine2: [4, 0, 0],   neck: [4, 0, 0],  head: [6, 0, 0],   shrug: 2,  forward: 4,  eyes: 0,   chestAim: 0,    weight: 0.3 }),
  floor:     P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,    weight: 0 }),
};

// The feet. The base loops (run / idle_stand / jumpshot) key their own feet; the pose clips (dribble idle, the slides,
// the reaches) never do, so a stance held after a jumpshot stood on the crouch's toes. Standing windows flatten the sole
// gently (0.5: the loops keep their heel-strike), the release points the toes off the floor, the flight is the dunk's.
const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });
export const HOOPS_LEGS: Record<HoopsWindow, LegPose> = {
  idle: L(0, 0.5), run: L(0, 0), dribble: L(0, 0.5), drive: L(0, 0), protect: L(0, 0.5),
  gather: L(0, 0.5), load: L(0, 0.6), release: L(-30, 0.7), follow: L(0, 0.8),
  defend: L(0, 0.6), slide: L(0, 0.6), reach: L(0, 0.5),
  rise: LEGS.rise, hang: LEGS.hang, extend: LEGS.extend, jam: LEGS.jam, brace: LEGS.brace, land: LEGS.land, celebrate: LEGS.celebrate,
  stagger: L(0, 0), floor: L(0, 0),
};

// ── The window resolver ────────────────────────────────────────────────────
export type ShotWindow = 'none' | 'gather' | 'load' | 'release' | 'follow';
export interface HoopsPostureInput {
  role: 'offense' | 'defense' | 'idle';
  hasBall: boolean;
  speed01: number;
  /** Metres to the nearest defender (Infinity when none / stunned). */
  nearestDefender: number;
  shot: ShotWindow;
  /** The drive dunk in flight: its clock 0..1 and the slam's verdict once resolved. */
  flight: { k: number; made: boolean | null } | null;
  /** Feet-down after a flight: the land crouch (or the celebrate) owns the body. */
  landed: boolean;
  celebrate: boolean;
  /** A mode-owned reach beat (steal / block) is in flight. */
  reaching: boolean;
  staggered: boolean;
  floored: boolean;
}
export const HOOPS_INPUT_IDLE: HoopsPostureInput = { role: 'idle', hasBall: false, speed01: 0, nearestDefender: Infinity, shot: 'none', flight: null, landed: false, celebrate: false, reaching: false, staggered: false, floored: false };

/** Seconds the release stance holds after the ball leaves the hand (then the follow-through until the arc resolves). */
export const RELEASE_SEC = 0.25;
/** Seconds the land crouch owns the body after feet-down. */
export const LAND_SEC = 0.45;
/** Seconds a celebrate beat owns the stance. */
export const CELEBRATE_SEC = 0.8;
/** Speed (0..1 of top) past which a defender is sliding, not set. */
export const SLIDE_SPEED01 = 0.2;
/** Speed past which a handler is driving (the tree's own line is 0.6 + rim-ward). */
export const DRIVE_SPEED01 = 0.6;
/** A defender inside this is a protect read (the tree's line). */
export const PROTECT_RANGE = 1.4;

export function hoopsWindow(i: HoopsPostureInput): HoopsWindow {
  if (i.floored) return 'floor';
  if (i.staggered) return 'stagger';
  if (i.flight) {
    const k = clamp(i.flight.k, 0, 1);
    if (k < 0.18) return 'rise';
    if (k < 0.42) return 'hang';
    if (k < 0.55 || i.flight.made === null) return 'extend';
    return i.flight.made ? 'jam' : 'brace';
  }
  if (i.landed) return i.celebrate ? 'celebrate' : 'land';
  if (i.celebrate) return 'celebrate';
  if (i.shot !== 'none') return i.shot;
  if (i.reaching) return 'reach';
  if (i.role === 'defense') return i.speed01 > SLIDE_SPEED01 ? 'slide' : 'defend';
  if (i.hasBall) {
    if (i.speed01 > DRIVE_SPEED01) return 'drive';
    if (i.nearestDefender < PROTECT_RANGE && i.speed01 < 0.15) return 'protect';
    return 'dribble';
  }
  return i.speed01 > 0.15 ? 'run' : 'idle';
}
export function hoopsPose(i: HoopsPostureInput): { window: HoopsWindow; pose: PosturePose; legs: LegPose } {
  const window = hoopsWindow(i);
  return { window, pose: HOOPS_POSTURE[window], legs: HOOPS_LEGS[window] };
}
