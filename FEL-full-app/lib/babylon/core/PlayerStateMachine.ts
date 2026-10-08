// PlayerStateMachine — HOOPS-10PHASE-2 phase 4.
//
// Phase 4 asks for "an explicit player state machine (idle, dribble, gather, shoot, pass, dunk, land) with
// animation blending and clean transitions. No double-fires or pops." Most of the locomotion WORK this phase
// also asks for (real accel/decel, plant steps, facing, start/stop/turn transitions) already shipped in an
// earlier pass — CourtMovement.ts's gears (GEARS_HOOPS: jog/sprint lag, loaded first step, speed-scaled stop)
// and plant-and-cut (plantDot/plantBleedSec) are exactly that, already tuned and already under test
// (CourtMovement.test.ts). Likewise "fixed gather and release windows" already exists: ShotMeter.start() carries
// a `gatherSec` the clip is paced to and a `riseSec` whose 0.62 is the green. What's never existed is the state
// ITSELF, named — 1v1 and 3v3 track `shooting` / `dunking` / `gather` / `carrying` / `landSec` as separate
// booleans scattered through two 3000-line closures, with no single place that says "the player IS in state X
// right now" or guards which state can follow which.
//
// This module is that place: pure, headless-testable, and additive — a mode FEEDS it a snapshot of the booleans
// it already tracks every frame and gets back the canonical state plus whether this is the frame it was ENTERED
// (edge-triggered: `entered` is true for exactly one frame per transition, which is what "no double-fires or
// pops" means for a state machine — a mode playing an enter-animation off `entered` can never play it twice for
// the same shot). A transition the graph does not allow (e.g. claiming `landing` with no prior shoot/dunk) is
// REJECTED: the machine holds its current state rather than popping to a state nothing led to.
import { Vector3 } from '@babylonjs/core';

export type PlayerState = 'idle' | 'dribble' | 'gather' | 'shoot' | 'pass' | 'dunk' | 'land';

/** What a mode already knows about its own player, read fresh every frame. Several may be true at once (e.g. a
 *  shooter is also `moving`); `resolve()` below picks ONE state by priority, and the graph then decides whether
 *  getting there from the current state is legal. */
export interface PlayerStateInputs {
  /** The body is carrying the ball right now. */
  hasBall: boolean;
  /** The body is translating meaningfully (CourtMovement's speed01 > ~0, or an explicit `driving`/moving flag). */
  moving: boolean;
  /** Loading a shot or a dunk — the gather plan/window is active (ShotMeter.start() through its gatherSec, or a
   *  dunk's approach). */
  gathering: boolean;
  /** The shot meter is armed and the release has not yet resolved. */
  shooting: boolean;
  /** Mid-dunk — airborne, from takeoff to the rim resolving. */
  dunking: boolean;
  /** A pass is in flight FROM this body (3v3 only; 1v1 has no pass — always false there). */
  passing: boolean;
  /** Recovering on the floor after a shot/dunk/pass release (a land timer > 0). */
  landing: boolean;
}

/** One frame's answer: the state THIS frame reads as, and whether this is the first frame of it. */
export interface PlayerStateResult {
  state: PlayerState;
  /** True for exactly one frame per transition — the edge a mode hangs an enter-animation off so it can never
   *  double-fire (playing the same enter clip twice for one shot/dunk/pass is exactly the "pop" this guards). */
  entered: boolean;
  /** The resolved target this frame asked for was not reachable from the current state, so the machine held —
   *  surfaced for a dev probe / test, never acted on by the mode (the mode's OWN booleans are still the truth;
   *  this only flags that the explicit graph and the mode's booleans briefly disagreed). */
  rejected: PlayerState | null;
}

/** The legal transition graph. Every state can reach `idle` (always a safe fallback — a possession can always
 *  end) and itself (held, not a transition at all — see `resolve`/`update`). */
const GRAPH: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  idle: ['dribble', 'gather', 'shoot', 'pass', 'dunk'],
  // a catch-and-shoot or a quick pass off a catch needs no dribble first, hence idle → shoot/pass/dunk directly
  dribble: ['idle', 'gather', 'shoot', 'pass', 'dunk'],
  gather: ['shoot', 'dunk', 'idle', 'dribble'],   // a pump-fake cancels the gather back to dribble/idle, never straight to land
  shoot: ['land', 'idle'],
  dunk: ['land', 'idle'],
  pass: ['dribble', 'idle', 'gather'],
  land: ['idle', 'dribble'],
};
/** Every state the graph can actually reach from `idle` — used by the reachability test so a state added to the
 *  union type above cannot silently go un-wired into the graph. */
export const ALL_STATES: readonly PlayerState[] = ['idle', 'dribble', 'gather', 'shoot', 'pass', 'dunk', 'land'];

/** Priority order `resolve()` reads the inputs in: a commitment (dunk/shoot/pass) outranks merely carrying the
 *  ball, landing outranks dribbling it out of a fresh release, and idle is the default when nothing else fires. */
function resolve(i: PlayerStateInputs): PlayerState {
  if (i.dunking) return 'dunk';
  if (i.shooting) return 'shoot';
  if (i.passing) return 'pass';
  if (i.gathering) return 'gather';
  if (i.landing) return 'land';
  if (i.hasBall && i.moving) return 'dribble';
  return 'idle';
}

export class PlayerStateMachine {
  private _state: PlayerState = 'idle';
  get state(): PlayerState { return this._state; }

  /** Feed one frame's snapshot; returns the resolved state, whether it was just entered, and whether the
   *  snapshot asked for a transition the graph rejected (held at the current state instead). */
  update(inputs: PlayerStateInputs): PlayerStateResult {
    const target = resolve(inputs);
    if (target === this._state) return { state: this._state, entered: false, rejected: null };
    const legal = GRAPH[this._state].includes(target);
    if (!legal) return { state: this._state, entered: false, rejected: target };
    this._state = target;
    return { state: this._state, entered: true, rejected: null };
  }

  /** Force the state with no graph check — a possession reset / respawn, where "how we got here" is moot. */
  reset(state: PlayerState = 'idle'): void { this._state = state; }
}

/** HOOPS-10PHASE-2 phase 4: animation blending picks the next clip FROM the state and the body's velocity — the
 *  "motion-matching-style selection" the brief asks for, kept intentionally small: a lookup, not a full matching
 *  search, because the per-state clip set here is tiny and already named throughout the mode files (bball_idle,
 *  bball_dribble_loop, bball_pullup_gather, jumpshot, bball_follow_through*, etc.). `speed01` blends idle↔dribble
 *  so a slow dribble does not snap straight to the sprint loop. */
export function blendClip(state: PlayerState, speed01: number): { clip: string; weight: number } {
  const s = Math.max(0, Math.min(1, speed01));
  switch (state) {
    case 'idle': return { clip: 'bball_idle', weight: 1 };
    case 'dribble': return { clip: s > 0.55 ? 'bball_dribble_run' : 'bball_dribble_loop', weight: Math.max(0.2, s) };
    case 'gather': return { clip: 'bball_pullup_gather', weight: 1 };
    case 'shoot': return { clip: 'jumpshot', weight: 1 };
    case 'dunk': return { clip: 'dunk_flight', weight: 1 };
    case 'pass': return { clip: 'bball_pass', weight: 1 };
    case 'land': return { clip: 'bball_land', weight: 1 };
  }
}

/** A plant foot's facing cue for the entry into `state`, reusing CourtMovement's own facing/velocity rather than
 *  inventing a second source of truth — this machine never owns position or velocity, only names the state. */
export function facingFor(vel: Vector3, fallbackRad: number): number {
  return vel.lengthSquared() > 1e-4 ? Math.atan2(vel.x, vel.z) : fallbackRad;
}
