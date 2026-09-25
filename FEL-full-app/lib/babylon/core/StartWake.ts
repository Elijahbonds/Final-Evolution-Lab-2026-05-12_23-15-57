// StartWake — the READY gate's one rule: the first press, push or pull puts you in the game (SHARED-START-UNSTICK,
// 2026-09-14).
//
// Before this, ModeHarness's READY gate woke on a BUTTON only — a stick push, a d-pad press or a trigger pull did
// nothing — and then ran a 3-2-1 on an 800 ms interval, so the fastest possible start was 2.4 s after the press with
// the hero held still the whole time (update() is not called outside 'playing'). The owner's bar is Wii Sports /
// Live 08: tap once and you are playing, ≤ 0.5 s, on every enabled mode.
//
// What this owns, all pure so it is tested without a browser:
//   isWakeInput  — what counts as "the player did something": any button or d-pad PRESS, a stick past WAKE_STICK, a
//                  trigger past WAKE_TRIGGER. Resting noise (a drifting stick, a trigger's 0.02) does not start a game.
//   WakeLatch    — the press that woke the game is not a gameplay press. Its RELEASE lands in 'playing' now (there
//                  is no 2.4 s countdown to swallow it), and an unpaired release is a real action in several modes
//                  (a hold-to-shoot fires on release). So the latch swallows the waking press's release, plus the
//                  twins one physical input emits in the same instant (an arrow key is a stick AND a d-pad event).
//                  Sticks and triggers are STATE, not actions: the waking push is forwarded, so a player who starts
//                  by pushing the stick is already moving on the first playing frame.
//   PauseLedger  — MOVEMENT PLAY P3 step 4b (2026-09-24): the same hygiene for PAUSED → 'playing'. The resuming press
//                  is latched like a waking one (WakeLatch.wake, keeping what the latch already held), and the releases
//                  the pause ate are handed to the mode on the resume (below). The review added the rest of the mode's
//                  view: where its sticks and triggers sit (only a value the pause changed is re-sent), and the keys
//                  that went down during the pause (WakeLatch.hold: their releases are the latch's, like the resume's).

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
  // MOVEMENT PLAY P3 (2026-09-24): the body starts a game only through its own START (both hands held up, an intent the
  // harness reads off the body channel) — never through a FelInput the floor made. A lean or a crouch someone does
  // while the READY card is up is a person getting ready, not a press (P3 Z4).
  if (e.src === 'body') return false;
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

  /** Call on the waking input. Returns true when the mode should ALSO receive it (sticks, triggers).
   *  `resume` (MOVEMENT PLAY P3 step 4b, 2026-09-24): the press that resumes a pause, in the middle of a run — what the
   *  latch already holds stays held. A press it swallowed (the READY wake's A, still down through the pause) came up
   *  unpaired on the other side of the resume when the resume started the latch over. */
  wake(e: FelInput, now: number, resume = false): boolean {
    this.at = now;
    if (!resume) this.held.clear();
    this.spaceTapUntil = e.t === 'trigger' && e.value === KEY_SPACE_DOWN ? now + SPACE_TAP_MS : -Infinity;
    const k = keyOf(e);
    if (k) { this.held.add(k); return false; }
    return true;
  }

  /** MOVEMENT PLAY P3 step 4b (the review, 2026-09-24): keys already down that the mode never saw go down — a d-pad
   *  pressed during the pause (it does not resume) and still held at the resume (PauseLedger.heldUnseen). Their releases
   *  are swallowed like the resuming press's; the echo window and the Space tap are left as they are. */
  hold(keys: Iterable<string>): void {
    for (const k of keys) this.held.add(k);
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

/**
 * MOVEMENT PLAY P3 step 4b (2026-09-24): the releases a pause ate (map:session §1). The harness hands the mode nothing
 * while PAUSED, so a key the mode saw go down and that came up during the pause stayed down for the mode for good — a
 * held gas, a hold-to-shoot that never fires, a d-pad step that never ends — until the same key was pressed and let go
 * again. The ledger keeps the mode's view of what is down (saw: every input the mode was handed), writes down a release
 * dropped while paused for a key in that view, and hands those releases to the mode on the resume, in the order they
 * came up. A key pressed again during the pause is down again, as the mode last saw it: its entry goes. A release the
 * mode never saw pressed (the START that paused, a press the wake latch ate) is not the mode's, and is not kept.
 *
 * The review (2026-09-24) gave it the rest of the mode's view:
 *   • where the mode's sticks and triggers sit (the last value it was handed on each, neutral before any). The resume
 *     re-sends only a value the pause changed (`changed`). Re-sending all four unasked handed a KEYBOARD player — who
 *     has no trigger at all — an R and an L trigger 0 on every resume: the hoops slot takes any R trigger for "this
 *     player has triggers" (turboSeen, which ends the stick-magnitude sprint for the run) and either 0 for "let go"
 *     (turbo and intense D off with Shift and F still held). Measured: true/true/true before the resume, false after.
 *   • the keys that went down DURING the pause for a mode that saw them up (a d-pad press does not resume; it is
 *     dropped), still down at the resume (`heldUnseen`): the harness hands them to the wake latch, so their releases
 *     are swallowed like the resuming press's instead of reaching the mode with no press before them.
 */
type Side = 'L' | 'R';
export class PauseLedger {
  /** The keys the mode was last handed a press for: its view of what is held. */
  private down = new Set<string>();
  /** The releases dropped while paused, by key, in the order they came up. */
  private dropped = new Map<string, FelInput>();
  /** Keys pressed while paused that the mode saw up, and not let go of since: presses the mode never saw. */
  private unseen = new Set<string>();
  /** The last stick and trigger values the mode was handed (the review): neutral until it is handed one. */
  private sticks: Record<Side, { x: number; y: number }> = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
  private triggers: Record<Side, number> = { L: 0, R: 0 };

  /** Call on every input the mode is handed (after the wake latch, right before onInput). */
  saw(e: FelInput): void {
    if (e.t === 'stick') { this.sticks[e.side] = { x: e.x, y: e.y }; return; }
    if (e.t === 'trigger') { this.triggers[e.side] = e.value; return; }
    const k = keyOf(e);
    if (!k) return;
    this.dropped.delete(k);   // the mode has this key's news first-hand now: nothing from before is owed on it
    if (e.pressed) this.down.add(k);
    else this.down.delete(k);
  }

  /** Call on every input that arrives while paused and does not resume. */
  drop(e: FelInput): void {
    const k = keyOf(e);
    if (!k) return;
    this.dropped.delete(k);   // a press clears the entry; a release after it is filed again, at the end
    if ((e as { pressed: boolean }).pressed) {
      if (!this.down.has(k)) this.unseen.add(k);   // down now, and the mode saw it up: a press it never saw
      return;
    }
    this.unseen.delete(k);
    if (this.down.has(k)) this.dropped.set(k, e);
  }

  /** The resume: is this re-sent stick or trigger value news to the mode (not what it was last handed on that
   *  channel)? A button or a d-pad always is (the resume re-sends none: those go through `replay`). */
  changed(e: FelInput): boolean {
    if (e.t === 'stick') { const s = this.sticks[e.side]; return s.x !== e.x || s.y !== e.y; }
    if (e.t === 'trigger') return this.triggers[e.side] !== e.value;
    return true;
  }

  /** The resume: the keys pressed during the pause and still down (for WakeLatch.hold). Empty after. */
  heldUnseen(): string[] {
    const out = [...this.unseen];
    this.unseen.clear();
    return out;
  }

  /** The resume: every release written down, in order, to `deliver` (the mode's onInput). The ledger is empty after.
   *  Each entry leaves the ledger just before it is delivered (the review): a deliver that throws costs that release
   *  alone — the ones behind it are still owed, and the one that threw is never handed over twice. */
  replay(deliver: (e: FelInput) => void): void {
    for (const [k, e] of [...this.dropped.entries()]) {
      this.dropped.delete(k);
      this.down.delete(k);
      deliver(e);
    }
  }

  /** A new run: nothing is down, nothing is owed, the sticks and triggers are at rest. */
  reset(): void {
    this.down.clear();
    this.dropped.clear();
    this.unseen.clear();
    this.sticks = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
    this.triggers = { L: 0, R: 0 };
  }
}
