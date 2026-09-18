// TRIPLE THREAT — the stance the half-court game starts from (2026-09-12).
//
// Owner's ask: "off the backboard dunks, step throughs, triple threat". Checked against the tree: the
// off-glass throw exists (DunkLob.glassLobVelocity, dunk contest only), the step-through exists
// (HoopsMoves footwork legs), the spin and the pivot exist — and TRIPLE THREAT did not exist at all. No
// stance, no jab, no pivot-from-standstill. It is the one genuinely missing piece of the hoops vocabulary,
// and it is the position every possession in 2K actually begins from.
//
// What it is, mechanically: standing still with the ball you are not idle, you are THREATENING. Three
// things are live at once — shoot, drive, and the footwork that sells either one — and a defender has to
// respect all three. The JAB STEP is the lie you tell to find out which one he is guessing.
//
// Why it is a layer rather than new moves: the shot, the drive, the pivot and the step-through already
// exist and are already good. What was missing was the STATE that makes them a read instead of three
// unrelated buttons, plus the jab that probes it. So this module is the state machine and the bite
// maths; the modes keep their own clips and footwork.
//
// Pure: no Babylon. The read is testable without a game running.

/** Above this speed you are driving, not threatening — the stance needs your feet still. */
export const THREAT_SPEED_MAX = 0.22;
/** A jab is a TAP. Held longer than this and it is a drive, which is the whole ambiguity. */
export const JAB_MAX_HOLD_SEC = 0.2;
/** How long a jab keeps the defender honest afterwards. */
export const JAB_WINDOW_SEC = 0.55;
/** A jab cannot re-fire inside this — a jab you can spam is not a lie, it is a twitch. */
export const JAB_COOLDOWN_SEC = 0.4;

export interface ThreatRead {
  /** Am I holding the ball? */
  carrying: boolean;
  /** 0..1 of top speed. */
  speed01: number;
  /** Mid-shot, mid-dunk, mid-finish — the stance does not apply. */
  busy: boolean;
  /** Sealing with my back to him is the POST, a different stance with its own reads. */
  posting: boolean;
}

/** Am I in triple threat right now? */
export function inTripleThreat(read: ThreatRead): boolean {
  return read.carrying && !read.busy && !read.posting && read.speed01 <= THREAT_SPEED_MAX;
}

/** What is live from the stance. All three at once is the entire point of the name. */
export type ThreatExit = 'shoot' | 'drive' | 'jab' | 'pivot' | 'step_through';

export const THREAT_EXITS: readonly ThreatExit[] = ['shoot', 'drive', 'jab', 'pivot', 'step_through'];

export interface JabRead {
  /** How far the defender is, on the floor. */
  defenderDist: number;
  /** He is CLOSING on me — a body already moving at me is the one a lie moves further. */
  defenderClosing: boolean;
  /** He is SET and low. He respects nothing. */
  defenderSet: boolean;
  /** My handle: selling a lie is a skill. */
  handle: number;
  /** How many jabs I have already shown him this possession — he stops buying it. */
  shownThisPossession: number;
}

/** Beyond this a jab is theatre: he is not close enough to be moved by it. */
export const JAB_RANGE = 2.8;

/**
 * Does the defender BITE the jab?
 *
 * A set defender barely bites, a closing one bites hard, and every jab you have already shown him this
 * possession is worth less than the last — which is what stops the jab being a free button and makes it
 * a thing you spend. That decay is the difference between a read and a tic.
 */
export function jabBiteOdds(read: JabRead): number {
  if (read.defenderDist > JAB_RANGE) return 0;
  if (read.defenderSet) return 0.06;
  const skill = Math.max(0, Math.min(1, read.handle / 100)) * 0.3;
  const closing = read.defenderClosing ? 0.34 : 0.14;
  const fatigue = Math.pow(0.55, Math.max(0, read.shownThisPossession));   // he learns
  return Math.max(0, Math.min(0.9, (closing + skill) * fatigue));
}

export interface ThreatState {
  /** Seconds left of the advantage a bitten jab bought me. */
  advantage: number;
  /** Seconds until I can jab again. */
  cooldown: number;
  /** Jabs shown this possession. */
  shown: number;
}

export const THREAT_IDLE: ThreatState = { advantage: 0, cooldown: 0, shown: 0 };

/** Tick both clocks. */
export function tickThreat(state: ThreatState, dt: number): ThreatState {
  return {
    advantage: Math.max(0, state.advantage - dt),
    cooldown: Math.max(0, state.cooldown - dt),
    shown: state.shown,
  };
}

/** May I jab? */
export function canJab(state: ThreatState): boolean {
  return state.cooldown <= 0;
}

/** A jab was thrown. Whether it was bought decides if it bought me anything. */
export function throwJab(state: ThreatState, bought: boolean): ThreatState {
  return {
    advantage: bought ? JAB_WINDOW_SEC : 0,
    cooldown: JAB_COOLDOWN_SEC,
    shown: state.shown + 1,
  };
}

/**
 * Is the stick input a JAB or a DRIVE?
 *
 * The ambiguity IS the mechanic: the same direction, and how long you hold it decides which lie you told.
 * A tap is a jab; leaning on it is a drive. That is why a jab cannot have its own button without losing
 * the thing that makes it work.
 */
export function isJabInput(heldSec: number, magnitude: number): boolean {
  return magnitude > 0.45 && heldSec > 0 && heldSec <= JAB_MAX_HOLD_SEC;
}

/**
 * The drive out of a bitten jab is faster, because he is leaning the wrong way.
 *
 * Returned as a multiplier on the handler's first step, so the advantage is something you FEEL in the
 * body rather than a number in a HUD.
 */
export function jabBurst(state: ThreatState): number {
  return state.advantage > 0 ? 1.35 : 1;
}
