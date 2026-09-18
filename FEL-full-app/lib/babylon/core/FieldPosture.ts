// FieldPosture — the Posture Poses windows for the BALL SPORTS (2026-09-13).
//
// Owner: "Let's do an upgrade pass for the soccer, baseball, football and tennis modes."
//
// The audit that started this: of the four, only football had a posture layer. Derby, penalty and both net
// sports mount none at all — which is exactly the state the snowboard was in before the board pass, and it
// produces exactly the same defect. These modes' clips key the hips, the legs and the arms and leave the
// thoracic chain, the neck and the head where the last clip put them, so:
//
//   · a BATTER waits on a 14 m/s pitch with his chest wherever the idle left it and his eyes not on the ball;
//   · a KEEPER sets for a penalty standing straight up, and after the dive-hold runs out he is square again
//     while the ball is still travelling;
//   · a TENNIS player between shots has no ready position at all — no split step, no weight, no eyes.
//
// Every one of those is a body that is not WATCHING the thing the whole sport is about. That is what this
// table fixes, and it is why it is one module: the four sports share a single biomechanical idea.
//
// THE IDEA. Every ball sport is a STRIKE at a moving object, and a strike has the same four beats whatever
// is in your hands: you WATCH it, you LOAD against it, you FIRE through it, and you FOLLOW THROUGH past it.
// The stances differ; the chain does not. So the windows below are that chain, four times over, with the
// sport-specific reads (the keeper's dive, the batter's check swing, the split step) hung off it.
//
// Sport flavour (SPEC-FEL-BIOMECH-GAMEWIDE): G1 = the object you are tracking (the chest and the eyes go to
// the BALL, not to a fixed objective — a pitch moves); G2 = the load is against the ground, so the weight
// stays back until the fire; G3 = the follow-through belongs to the clip (weight drops) because a struck
// ball's finish is the most heavily keyed thing these clips do and the layer must not fight it.
//
// Pure: no Babylon. Every number here is provable without a scene.

import { clamp, type PosturePose } from './DunkPosture';
import type { LegPose } from './DunkLegs';

/**
 * The windows, grouped by sport but sharing the four-beat chain.
 *
 * Deliberately NOT one window per clip: a window is a body STATE, and several clips can play inside one
 * (the batter's idle and his timing step are both `wait`). That is the same rule the board and hoops tables
 * follow, and it is what keeps the table readable at a glance.
 */
export type FieldWindow =
  // ── shared ───────────────────────────────────────────────────────────────
  /** Nothing is coming. The only window where the body is allowed to be casual. */
  | 'idle'
  // ── batting (derby) ──────────────────────────────────────────────────────
  /** In the box, tracking the pitcher's hand. Hands back, chin on the shoulder. */
  | 'bat_wait'
  /** The load: weight to the back leg, hands deeper, front shoulder CLOSED. */
  | 'bat_load'
  /** Contact. The chest fires through the zone and the head stays DOWN on the ball. */
  | 'bat_fire'
  /** The check: the swing stopped. Everything decelerates and the eyes stay on the ball. */
  | 'bat_check'
  // ── pitching (derby) ─────────────────────────────────────────────────────
  /** The set, then the drive down the mound: tall, then out over the front side. */
  | 'pitch_set' | 'pitch_throw'
  // ── keeping (penalty) ────────────────────────────────────────────────────
  /** The keeper's set: low, wide, weight on the balls of the feet, eyes on the ball. */
  | 'keep_set'
  /** Airborne, stretched toward the ball. The clip owns almost all of this. */
  | 'keep_dive'
  /** Up off the floor and re-setting. */
  | 'keep_rise'
  // ── striking (penalty) ───────────────────────────────────────────────────
  /** The run-up: leaning in, eyes on the ball, NOT on the keeper — the tell a good striker hides. */
  | 'kick_runup'
  /** The plant foot goes down beside the ball and the whole body braces over it. */
  | 'kick_plant'
  /** Through the ball. */
  | 'kick_strike'
  // ── net sports (tennis / volleyball) ─────────────────────────────────────
  /** The ready position between shots — the one thing the net modes never had. */
  | 'net_ready'
  /** The split step: the hop that lands as the opponent strikes, so you can go either way. */
  | 'net_split'
  /** Moving to the ball. Chest across the court, eyes on the ball. */
  | 'net_move'
  /** The unit turn and load. */
  | 'net_load'
  /** Contact. */
  | 'net_strike'
  /** Stretched: the ball is barely reachable and the body is fully extended at it. */
  | 'net_reach'
  /** Serving: the toss and the arch. */
  | 'net_serve';

const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });

/**
 * THE STANCE TABLE.
 *
 * `eyes` is doing the most work in this file. In hoops it aims at the rim, which does not move; here it aims
 * at the BALL, which is the entire skill of all four sports. A batter who is not looking at the pitch and a
 * keeper who is not looking at the striker's foot are not athletes, they are mannequins holding a prop, and
 * that is what these modes rendered before this table existed.
 */
export const FIELD_POSTURE: Record<FieldWindow, PosturePose> = {
  idle:        P({ lean: 3,  spine1: [3, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0],  head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.4, chestAim: 0.2, weight: 0.5 }),

  // BATTING. The front shoulder stays CLOSED through the load and only opens on the fire — a chest that
  // opens early is the single most recognisable flaw in a swing, and it is what a layer with no table does
  // by default (the clip's own hips drag the chest round). hipYawKeep holds the coil in.
  bat_wait:    P({ lean: 12, spine1: [8, 0, 0],   spine2: [-6, 0, 0],  neck: [-6, 0, 0],  head: [-8, 0, 0],  shrug: 3,  forward: -2, eyes: 1,   chestAim: 0.15, hipYawKeep: 0.8,  weight: 0.85 }),
  bat_load:    P({ lean: 15, spine1: [10, 0, 0],  spine2: [-9, 0, 0],  neck: [-8, 0, 0],  head: [-10, 0, 0], shrug: 5,  forward: -5, eyes: 1,   chestAim: 0,    hipYawKeep: 0.55, weight: 0.95 }),
  // the fire: the head stays DOWN and STILL (see the head pitch) while everything under it rotates. The
  // swing clip owns the rotation; the layer owns the head, which is the part the clip never keys.
  bat_fire:    P({ lean: 10, spine1: [6, 0, 0],   spine2: [-2, 0, 0],  neck: [-10, 0, 0], head: [-16, 0, 0], shrug: 2,  forward: 2,  eyes: 1,   chestAim: 0.6,  hipYawKeep: 1,    weight: 0.7 }),
  // a checked swing is DECELERATION: the hands stop, the chest re-closes, the eyes never leave the ball
  bat_check:   P({ lean: 13, spine1: [9, 0, 0],   spine2: [-8, 0, 0],  neck: [-8, 0, 0],  head: [-12, 0, 0], shrug: 4,  forward: -3, eyes: 1,   chestAim: 0.1,  hipYawKeep: 0.6,  weight: 0.9 }),

  pitch_set:   P({ lean: 4,  spine1: [4, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0],  head: [-8, 0, 0],  shrug: 2,  forward: -3, eyes: 1,   chestAim: 0.4,  weight: 0.8 }),
  // out over the front side: the chest drives at the plate and the head goes with it
  pitch_throw: P({ lean: 20, spine1: [15, 0, 0],  spine2: [-2, 0, 0],  neck: [-6, 0, 0],  head: [-12, 0, 0], shrug: 6,  forward: 6,  eyes: 1,   chestAim: 0.85, hipYawKeep: 1,    weight: 0.75 }),

  // KEEPING. A set keeper is LOW and WIDE with the chest open and the hands up — the opposite of the
  // standing-tall default. The dive is almost entirely the clip's (weight 0.25); what the layer keeps is
  // the head, because a keeper who dives with his head turned away is watching nothing.
  keep_set:    P({ lean: 22, spine1: [16, 0, 0],  spine2: [-10, 0, 0], neck: [-8, 0, 0],  head: [-14, 0, 0], shrug: 8,  forward: -8, eyes: 1,   chestAim: 0.7,  weight: 0.95 }),
  keep_dive:   P({ lean: 6,  spine1: [4, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0],  head: [-8, 0, 0],  shrug: 6,  forward: -6, eyes: 1,   chestAim: 0.3,  hipYawKeep: 0.7,  weight: 0.25 }),
  keep_rise:   P({ lean: 14, spine1: [11, 0, 0],  spine2: [-6, 0, 0],  neck: [-5, 0, 0],  head: [-10, 0, 0], shrug: 4,  forward: -4, eyes: 0.9, chestAim: 0.5,  weight: 0.6 }),

  // STRIKING. The eyes are on the BALL through the run-up and the strike. A striker whose head comes up to
  // find the keeper is telling the keeper where the ball is going, which is a real tell and the reason this
  // window's eyes are pinned rather than aimed at the goal.
  kick_runup:  P({ lean: 14, spine1: [11, 0, 0],  spine2: [-5, 0, 0],  neck: [-6, 0, 0],  head: [-12, 0, 0], shrug: 2,  forward: 0,  eyes: 1,   chestAim: 0.45, weight: 0.8 }),
  kick_plant:  P({ lean: 8,  spine1: [6, 0, 0],   spine2: [-9, 0, 0],  neck: [-6, 0, 0],  head: [-14, 0, 0], shrug: 6,  forward: -6, eyes: 1,   chestAim: 0.2,  hipYawKeep: 0.6,  weight: 1 }),
  kick_strike: P({ lean: 4,  spine1: [2, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0],  head: [-12, 0, 0], shrug: 4,  forward: -4, eyes: 1,   chestAim: 0.35, hipYawKeep: 1,    weight: 0.55 }),

  // NET SPORTS. `net_ready` is the window these modes were missing entirely: knees soft, chest up, weight
  // FORWARD on the toes (see FIELD_LEGS), eyes on the ball. Everything else hangs off it.
  net_ready:   P({ lean: 14, spine1: [11, 0, 0],  spine2: [-7, 0, 0],  neck: [-5, 0, 0],  head: [-10, 0, 0], shrug: 4,  forward: -4, eyes: 1,   chestAim: 0.5,  weight: 0.9 }),
  // the split step is a landing: the body absorbs and the chest stays square so either direction is open
  net_split:   P({ lean: 18, spine1: [14, 0, 0],  spine2: [-6, 0, 0],  neck: [-6, 0, 0],  head: [-12, 0, 0], shrug: 2,  forward: -2, eyes: 1,   chestAim: 0.5,  hipYawKeep: 0.8,  weight: 0.95 }),
  net_move:    P({ lean: 16, spine1: [13, 0, 0],  spine2: [-5, 0, 0],  neck: [-4, 0, 0],  head: [-10, 0, 0], shrug: 3,  forward: 0,  eyes: 1,   chestAim: 0.85, hipYawKeep: 0.7,  weight: 0.85 }),
  // the unit turn: shoulders round, hips under, chest CLOSED to the ball's line
  net_load:    P({ lean: 13, spine1: [10, 0, 0],  spine2: [-10, 0, 0], neck: [-6, 0, 0],  head: [-10, 0, 0], shrug: 5,  forward: -6, eyes: 1,   chestAim: 0.1,  hipYawKeep: 0.5,  weight: 0.95 }),
  net_strike:  P({ lean: 9,  spine1: [6, 0, 0],   spine2: [-4, 0, 0],  neck: [-8, 0, 0],  head: [-14, 0, 0], shrug: 3,  forward: 0,  eyes: 1,   chestAim: 0.55, hipYawKeep: 1,    weight: 0.6 }),
  // fully stretched at a ball that is nearly past you: the spine EXTENDS (negative lean) and the chest opens
  net_reach:   P({ lean: -6, spine1: [-5, 0, 0],  spine2: [-12, 0, 0], neck: [-2, 0, 0],  head: [-6, 0, 0],  shrug: 10, forward: -8, eyes: 1,   chestAim: 0.9,  hipYawKeep: 0.5,  weight: 0.8 }),
  // the serve arch: the spine goes BACKWARD under the toss and the eyes go up to it
  net_serve:   P({ lean: -14, spine1: [-11, 0, 0], spine2: [-14, 0, 0], neck: [6, 0, 0],  head: [14, 0, 0],  shrug: 12, forward: -10, eyes: 1,  chestAim: 0.2,  hipYawKeep: 0.7,  weight: 0.85 }),
};

const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });

/**
 * The feet.
 *
 * Two rules, both learned the expensive way on the dunk and board passes:
 *   · a body that is WAITING must have its heels down — a held crouch on the toes is the single most common
 *     artefact of a posture layer with no leg table (the dunk pass found it on every landing);
 *   · a body that is about to MOVE is on the balls of its feet, and that is a small negative pitch, not a
 *     large one. The keeper's set, the net ready and the split step are the three that get it.
 * Anything the clip keys hard (the swing's back foot pivot, the dive, the kick's plant) hands the feet back
 * with weight 0 rather than fighting it.
 */
export const FIELD_LEGS: Record<FieldWindow, LegPose> = {
  idle:        L(0, 0.4),
  bat_wait:    L(0, 0.7),  bat_load: L(0, 0.85), bat_fire: L(0, 0),  bat_check: L(0, 0.6),
  pitch_set:   L(0, 0.6),  pitch_throw: L(0, 0),
  keep_set:    L(-6, 0.9), keep_dive: L(0, 0),   keep_rise: L(0, 0.4),
  kick_runup:  L(0, 0),    kick_plant: L(0, 0.8), kick_strike: L(0, 0),
  net_ready:   L(-7, 0.9), net_split: L(-4, 0.85), net_move: L(0, 0.3),
  net_load:    L(0, 0.6),  net_strike: L(0, 0),  net_reach: L(-10, 0.5), net_serve: L(-8, 0.5),
};

// ── The window resolvers ───────────────────────────────────────────────────
// One per sport rather than one giant resolver, because the four read completely different state and a
// single `FieldPostureInput` with twenty optional fields would be a union pretending to be a struct.

export interface BatInput {
  /** A pitch is on its way. */
  incoming: boolean;
  /** The swing is committed. */
  swinging: boolean;
  /** The swing was started and stopped. */
  checked: boolean;
  /** 0..1 through the load — the timing step before the hands go. */
  load01: number;
}

export function batWindow(i: BatInput): FieldWindow {
  if (i.checked) return 'bat_check';
  if (i.swinging) return 'bat_fire';
  if (!i.incoming) return 'idle';
  return i.load01 > 0.35 ? 'bat_load' : 'bat_wait';
}

export interface KeeperInput {
  /** Mid-dive. */
  diving: boolean;
  /** Getting back up. */
  rising: boolean;
  /** The striker is on his run-up — the keeper is set and reading. */
  reading: boolean;
}

export function keeperWindow(i: KeeperInput): FieldWindow {
  if (i.diving) return 'keep_dive';
  if (i.rising) return 'keep_rise';
  return i.reading ? 'keep_set' : 'idle';
}

export interface StrikerInput {
  /** 0..1 through the run-up. */
  runup01: number;
  /** The plant foot is down. */
  planted: boolean;
  /** The ball has been struck. */
  struck: boolean;
}

export function strikerWindow(i: StrikerInput): FieldWindow {
  if (i.struck) return 'kick_strike';
  if (i.planted) return 'kick_plant';
  return i.runup01 > 0 ? 'kick_runup' : 'idle';
}

export interface NetInput {
  /** A ball is on its way to me. */
  incoming: boolean;
  /** Mid-serve. */
  serving: boolean;
  /** The swing is committed. */
  swinging: boolean;
  /** Distance from my body to where the ball will arrive, metres. */
  reachM: number;
  /** How fast I am moving across the court, m/s. */
  speed: number;
  /** The opponent just struck — the split step's cue. */
  splitting: boolean;
}

/** Past this far from the body, a shot is a STRETCH rather than a swing. */
export const NET_REACH_M = 1.25;
/** Moving faster than this is a RUN to the ball rather than an adjustment. */
export const NET_MOVE_SPEED = 1.1;

export function netWindow(i: NetInput): FieldWindow {
  if (i.serving) return 'net_serve';
  if (i.swinging) return i.reachM > NET_REACH_M ? 'net_reach' : 'net_strike';
  if (i.splitting) return 'net_split';
  if (!i.incoming) return 'idle';
  if (i.speed > NET_MOVE_SPEED) return 'net_move';
  // close enough to set my feet: load. Still travelling: ready.
  return i.reachM < NET_REACH_M * 0.8 ? 'net_load' : 'net_ready';
}

/** Look up a window's pose and legs together, the way every mode's feed wants them. */
export function fieldPose(w: FieldWindow): { window: FieldWindow; pose: PosturePose; legs: LegPose } {
  return { window: w, pose: FIELD_POSTURE[w], legs: FIELD_LEGS[w] };
}

// ── The lean into a moving object ──────────────────────────────────────────
/**
 * How far the body angles toward a ball it is tracking, radians of ROOT roll.
 *
 * Same shape as the board's `boardBank` and for the same reason: a body that changes direction without
 * banking reads as a body on rails. A keeper pushing off to his right and a tennis player running wide are
 * both leaning INTO the move, and neither clip keys it.
 *
 * Capped tighter than a board's (12° vs 22°): a snowboard is genuinely on edge, a person running is not.
 */
export const FIELD_BANK_MAX = 12 * Math.PI / 180;
export function fieldBank(lateral: number, speed01: number): number {
  return clamp(lateral, -1, 1) * clamp(speed01, 0, 1) * FIELD_BANK_MAX;
}
