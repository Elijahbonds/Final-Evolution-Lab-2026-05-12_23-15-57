// StartWake — the READY gate's one rule: the first press, push or pull puts you in the game (SHARED-START-UNSTICK,
// 2026-09-14).
//
// Before this, ModeHarness's READY gate woke on a BUTTON only — a stick push, a d-pad press or a trigger pull did
// nothing — and then ran a 3-2-1 on an 800 ms interval, so the fastest possible start was 2.4 s after the press with
// the hero held still the whole time (update() is not called outside 'playing'). The owner's bar is Wii Sports /
// Live 08: tap once and you are playing, ≤ 0.5 s, on every enabled mode.
//
// Two things this owns, both pure so they are tested without a browser:
//   isWakeInput  — what counts as "the player did something": any button or d-pad PRESS, a stick past WAKE_STICK, a
//                  trigger past WAKE_TRIGGER. Resting noise (a drifting stick, a trigger's 0.02) does not start a game.
//   WakeLatch    — the press that woke the game is not a gameplay press. Its RELEASE lands in 'playing' now (there
//                  is no 2.4 s countdown to swallow it), and an unpaired release is a real action in several modes
//                  (a hold-to-shoot fires on release). So the latch swallows the waking press's release, plus the
//                  twins one physical input emits in the same instant (an arrow key is a stick AND a d-pad event).
//                  Sticks and triggers are STATE, not actions: the waking push is forwarded, so a player who starts
//                  by pushing the stick is already moving on the first playing frame.

import type { FelInput } from './InputBus';

export const WAKE_STICK = 0.5;
export const WAKE_TRIGGER = 0.5;
/** The value InputBus emits on the R trigger the instant keyboard SPACE goes down (Space is an analog charge whose
 *  depth then climbs over 1.1 s). A pad trigger's resting noise never lands on it, and without it a HELD space only
 *  crossed WAKE_TRIGGER 550 ms in — measured, one probe row over the bar. */
export const KEY_SPACE_DOWN = 0.01;
/** A space that wakes the game and comes back up inside this window was a TAP: InputBus turns its keyup into an A press,
 *  and that A is the wake, not a shot. A longer hold is a charge the player meant, and its release is the mode's. */
export const SPACE_TAP_MS = 250;
/** Presses that arrive this soon after the wake are the same physical input (keyboard dual-emit, a pad's
 *  A + its synthetic key) — swallowed with their releases. Far shorter than any deliberate second press. */
export const WAKE_ECHO_MS = 80;

export function isWakeInput(e: FelInput): boolean {
  switch (e.t) {
    case 'button': return e.pressed;
    case 'dpad': return e.pressed;
    case 'stick': return Math.hypot(e.x, e.y) >= WAKE_STICK;
    case 'trigger': return e.value >= WAKE_TRIGGER || (e.side === 'R' && e.value === KEY_SPACE_DOWN);
  }
}

const keyOf = (e: FelInput): string | null =>
  e.t === 'button' ? `b:${e.btn}` : e.t === 'dpad' ? `d:${e.dir}` : null;

export class WakeLatch {
  private at = -Infinity;
  private held = new Set<string>();
  private spaceTapUntil = -Infinity;

  /** Call on the waking input. Returns true when the mode should ALSO receive it (sticks, triggers). */
  wake(e: FelInput, now: number): boolean {
    this.at = now;
    this.held.clear();
    this.spaceTapUntil = e.t === 'trigger' && e.value === KEY_SPACE_DOWN ? now + SPACE_TAP_MS : -Infinity;
    const k = keyOf(e);
    if (k) { this.held.add(k); return false; }
    return true;
  }

  /** Call on every input while playing. Returns false for an input that belongs to the wake and must be dropped. */
  pass(e: FelInput, now: number): boolean {
    const k = keyOf(e);
    if (!k) return true;
    const pressed = (e as { pressed: boolean }).pressed;
    if (k === 'b:A' && pressed && now <= this.spaceTapUntil) { this.spaceTapUntil = -Infinity; return false; }
    if (pressed) {
      if (now - this.at < WAKE_ECHO_MS) { this.held.add(k); return false; }
      this.held.delete(k);   // a fresh deliberate press: its release is the mode's again
      return true;
    }
    if (this.held.has(k)) { this.held.delete(k); return false; }
    return true;
  }
}
