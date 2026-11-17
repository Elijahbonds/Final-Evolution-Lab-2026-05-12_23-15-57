// ANY PRESS SKIPS A REPLAY (lane/hoops-flow, owner 2026-11-12: "any press skips a replay").
//
// The harness already skipped a replay on a BUTTON or a D-PAD press (A9.12, w3-present). What it did not hear: a right-stick flick
// (the hoops dribble moves, and the keyboard's dribble keys, are stick events), a trigger pulled, a stick pushed, and a tap on the
// bare stage. Those reached the mode while its update() was held, and the possession reset after the replay threw them away — the
// play audit's "a press during the dead-ball replay is swallowed" (HOOPS-AAA-GAP-PLAY §3.1, sinker 9).
//
// This is the read that turns those into skips, for a mode that asks (`ModeDefinition.replaySkipAny`, the hoops modes, behind the feel
// knob `hoops.replaySkipOn`; 0 puts back the button / d-pad skip alone). It never feeds the skipping input to the game as a shot or a
// move:
//   · a STICK pushed out from rest (past STICK_PUSH from under STICK_REST) skips. The right stick is then the replay's until it comes
//     back to rest (a flick is not also a crossover on the fresh possession). The left stick — the one that walks — is passed on, so a
//     stick still held when the ball comes back moves the body (state, not a move; dropping it would leave a held key dead);
//   · a TRIGGER pulled past TRIGGER_PULL skips, and is the replay's until it is let go (its release is not a launch);
//   · a BUTTON or D-PAD press skips (the harness's own latch keeps its release from the mode, as before);
//   · a seated pad re-sends its sticks and triggers every frame (InputBus.pollPads), so only the CROSSING counts: a stick or trigger
//     already held when the replay began never skips it on its own.
// A body event (the camera floor) never skips here. Pure: no scene, no clock.

import type { FelInput } from './InputBus';
import { feel } from '../../feel-panel/feel';   // feel-panel knob hoops.replaySkipOn

/** (new, owner 2026-11-12) 1 = any press skips a hoops replay; 0 = a button or d-pad press only (before). Knob `hoops.replaySkipOn`. */
export const REPLAY_SKIP_ON = 1;
/** Is the any-press skip on for this run (the shipped value unless the owner's feel panel is open on a playtest run)? */
export function replaySkipOn(): boolean {
  return feel('hoops.replaySkipOn', REPLAY_SKIP_ON) >= 0.5;
}

/** A stick is OUT past this (a push), and back at rest under STICK_REST (the hysteresis keeps a pad's noise from double-counting). */
export const STICK_PUSH = 0.5, STICK_REST = 0.3;
/** A trigger is PULLED past this, and let go under TRIGGER_LET_GO. */
export const TRIGGER_PULL = 0.5, TRIGGER_LET_GO = 0.3;

/** 'pass': the mode's, as before. 'skip': skip the replay, the input is the replay's. 'skipPass': skip it AND pass the input on (the
 *  walking stick). 'drop': the replay's (a skipping stick or trigger still held) — the mode never sees it. */
export type SkipVerdict = 'pass' | 'skip' | 'skipPass' | 'drop';
type Side = 'L' | 'R';

export class ReplaySkipGate {
  private stickOut: Record<Side, boolean> = { L: false, R: false };
  private trigOut: Record<Side, boolean> = { L: false, R: false };
  private stickHeld: Record<Side, boolean> = { L: false, R: false };
  private trigHeld: Record<Side, boolean> = { L: false, R: false };
  /** Skips this gate called (probes read it). */
  skips = 0;

  /** `passStick`: the stick whose push skips and is still passed on (the walking stick); null = every stick's push is the replay's. */
  constructor(private readonly passStick: Side | null = 'L') {}

  /**
   * Every input while the game is playing (in a replay or not: a stick or trigger that skipped stays the replay's until it is let go,
   * after the replay too). `live`: a replay is on screen AND the any-press skip is on for this mode.
   */
  see(e: FelInput, live: boolean): SkipVerdict {
    if (e.src === 'body') return 'pass';
    if (e.t === 'stick') {
      const s = e.side, m = Math.hypot(e.x, e.y), was = this.stickOut[s];
      this.stickOut[s] = was ? m >= STICK_REST : m >= STICK_PUSH;
      if (this.stickHeld[s]) { if (!this.stickOut[s]) this.stickHeld[s] = false; return 'drop'; }   // (its return to rest too: the mode saw it at rest)
      if (live && !was && this.stickOut[s]) {
        this.skips++;
        if (s === this.passStick) return 'skipPass';
        this.stickHeld[s] = true; return 'skip';
      }
      return 'pass';
    }
    if (e.t === 'trigger') {
      const s = e.side, was = this.trigOut[s];
      this.trigOut[s] = was ? e.value >= TRIGGER_LET_GO : e.value >= TRIGGER_PULL;
      if (this.trigHeld[s]) { if (!this.trigOut[s]) this.trigHeld[s] = false; return 'drop'; }   // (its release too: never a launch)
      if (live && !was && this.trigOut[s]) { this.skips++; this.trigHeld[s] = true; return 'skip'; }
      return 'pass';
    }
    if (live && e.pressed) { this.skips++; return 'skip'; }   // a button or d-pad press
    return 'pass';
  }

  /** A new run: nothing is held. */
  reset(): void {
    this.stickOut = { L: false, R: false }; this.trigOut = { L: false, R: false };
    this.stickHeld = { L: false, R: false }; this.trigHeld = { L: false, R: false };
    this.skips = 0;
  }
}
