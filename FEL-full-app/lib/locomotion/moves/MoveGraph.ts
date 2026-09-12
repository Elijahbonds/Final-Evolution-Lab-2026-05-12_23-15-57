// LOCOMOTION Phase 2 — the right-stick move graph (2026-09-12).
//
// The right stick is MOVE INPUT, not a camera. A gesture resolves to a move id; a move may
// only fire from its declared entry states; chains are AUTHORED, never emergent.
//
// Phase 0 context: the live hoops kit (HoopsMoves.ts) already implements crossover, spin,
// hesitation and the rest as individual reads scattered through the mode. This graph is the
// data layer those reads should eventually consume — one record per move, with its entry
// states, cancel window and legal chains stated rather than implied by if-order.

import type { LocoState } from '../types';

export type MoveId =
  | 'crossover' | 'hesitation' | 'between_the_legs' | 'behind_the_back'
  | 'size_up' | 'attack_step';

export interface MoveRecord {
  readonly id: MoveId;
  /** A move may ONLY fire from these states. No move interrupts a plant. */
  readonly entryStates: ReadonlyArray<LocoState>;
  readonly clipId: string;
  /** Metres the clip's root travels, local space [x, z]. */
  readonly rootMotionDelta: readonly [number, number];
  /** Fraction of current speed the move costs. Chaining must visibly cost speed. */
  readonly momentumCost: number;
  /** Window, ms from move start, in which another input chains instead of being dropped. */
  readonly cancelWindow: readonly [number, number];
  readonly chainableInto: ReadonlyArray<MoveId>;
  readonly handSwitch: boolean;
}

/** Gesture vocabulary. Angles are relative to FACING, not to the world. */
export type Gesture =
  | 'flick_left' | 'flick_right' | 'flick_back'
  | 'half_circle_back' | 'quarter_circle_away' | 'hold_no_move' | 'flick_forward_sprint';

export const MOVES: Readonly<Record<MoveId, MoveRecord>> = {
  crossover: {
    id: 'crossover', entryStates: ['idle', 'shuffle', 'jog'], clipId: 'bball_crossover',
    rootMotionDelta: [0.35, 0.1], momentumCost: 0.18, cancelWindow: [120, 320],
    chainableInto: ['between_the_legs', 'behind_the_back', 'hesitation'], handSwitch: true,
  },
  hesitation: {
    id: 'hesitation', entryStates: ['jog', 'sprint'], clipId: 'bball_hesitation',
    rootMotionDelta: [0, -0.2], momentumCost: 0.42, cancelWindow: [100, 300],
    chainableInto: ['crossover', 'attack_step'], handSwitch: false,
  },
  between_the_legs: {
    id: 'between_the_legs', entryStates: ['idle', 'shuffle', 'jog'], clipId: 'bball_between_legs',
    rootMotionDelta: [0.2, 0.15], momentumCost: 0.22, cancelWindow: [140, 340],
    chainableInto: ['crossover', 'behind_the_back'], handSwitch: true,
  },
  behind_the_back: {
    id: 'behind_the_back', entryStates: ['shuffle', 'jog'], clipId: 'bball_behind_back',
    rootMotionDelta: [0.3, 0.2], momentumCost: 0.26, cancelWindow: [150, 360],
    chainableInto: ['crossover', 'attack_step'], handSwitch: true,
  },
  size_up: {
    id: 'size_up', entryStates: ['idle'], clipId: 'bball_size_up',
    rootMotionDelta: [0, 0], momentumCost: 0, cancelWindow: [0, 600],
    chainableInto: ['crossover', 'between_the_legs', 'behind_the_back', 'attack_step'], handSwitch: false,
  },
  attack_step: {
    id: 'attack_step', entryStates: ['idle', 'shuffle', 'jog'], clipId: 'bball_attack_step',
    rootMotionDelta: [0.1, 0.9], momentumCost: 0.1, cancelWindow: [90, 260],
    chainableInto: [], handSwitch: false,
  },
};

const GESTURE_TO_MOVE: Readonly<Record<Gesture, MoveId>> = {
  flick_left: 'crossover',
  flick_right: 'crossover',
  flick_back: 'hesitation',
  half_circle_back: 'between_the_legs',
  quarter_circle_away: 'behind_the_back',
  hold_no_move: 'size_up',
  flick_forward_sprint: 'attack_step',
};

/** Buffer window: input inside a cancel window chains; outside it, it is DROPPED, not queued. */
export const BUFFER_MS = 150;

export interface MoveMachine {
  readonly active: MoveId | null;
  /** ms since the active move started. */
  readonly elapsedMs: number;
  /** A buffered request and when it arrived, or null. */
  readonly buffered: { move: MoveId; atMs: number } | null;
}

export const IDLE_MACHINE: MoveMachine = { active: null, elapsedMs: 0, buffered: null };

export function moveForGesture(g: Gesture): MoveId { return GESTURE_TO_MOVE[g]; }

export interface MoveRequest { gesture: Gesture | null; state: LocoState; dtMs: number }
export interface MoveResult {
  machine: MoveMachine;
  /** Fired this tick, or null. */
  started: MoveId | null;
  /** Fraction of speed to remove this tick because a move fired. */
  momentumCost: number;
  /** Why a request was refused, for probes and tests. */
  refused: 'wrong_state' | 'not_chainable' | 'outside_cancel_window' | null;
}

/**
 * One tick of the move graph.
 *
 * Rules, all of them from the brief: a move fires only from its entryStates; while a move is
 * active another only chains if it is in chainableInto AND the input lands inside the cancel
 * window; anything else is refused and dropped rather than queued forever.
 */
export function stepMove(m: MoveMachine, req: MoveRequest): MoveResult {
  const elapsedMs = m.active ? m.elapsedMs + req.dtMs : 0;
  const active = m.active;

  // an active move whose window has fully elapsed releases the machine
  const rec = active ? MOVES[active] : null;
  const finished = rec ? elapsedMs > rec.cancelWindow[1] : true;

  if (!req.gesture) {
    return {
      machine: finished ? IDLE_MACHINE : { active, elapsedMs, buffered: m.buffered },
      started: null, momentumCost: 0, refused: null,
    };
  }

  const want = moveForGesture(req.gesture);
  const wantRec = MOVES[want];

  if (active && rec && !finished) {
    if (!rec.chainableInto.includes(want)) {
      return { machine: { active, elapsedMs, buffered: null }, started: null, momentumCost: 0, refused: 'not_chainable' };
    }
    const [lo, hi] = rec.cancelWindow;
    if (elapsedMs < lo || elapsedMs > hi) {
      return { machine: { active, elapsedMs, buffered: null }, started: null, momentumCost: 0, refused: 'outside_cancel_window' };
    }
    return { machine: { active: want, elapsedMs: 0, buffered: null }, started: want, momentumCost: wantRec.momentumCost, refused: null };
  }

  if (!wantRec.entryStates.includes(req.state)) {
    return { machine: finished ? IDLE_MACHINE : { active, elapsedMs, buffered: null }, started: null, momentumCost: 0, refused: 'wrong_state' };
  }
  return { machine: { active: want, elapsedMs: 0, buffered: null }, started: want, momentumCost: wantRec.momentumCost, refused: null };
}
