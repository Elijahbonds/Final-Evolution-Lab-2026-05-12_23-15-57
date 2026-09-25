// slamPress — the dunk's SLAM press: which A is the player's slam, and which one decides (HOTFIX 2026-09-24).
//
// Two pure pieces, shared by DunkMode and DunkDuelMode and by the movement-play baseline (lib/pose/baseline.ts):
//
//   TakeoffEcho — the take-off's own A is not the slam.
//     · On the KEYBOARD the take-off is letting go of Space, and InputBus turns that keyup into `trigger R 0` and then,
//       straight after it, `button A pressed`. The R 0 launches the flight, so the A lands in the air as the attempt's FIRST
//       press. Both modes judge the first press ("the first press decides"), so every keyboard dunk was blown before the
//       player had pressed anything. A Space still held when the flight starts (the run reached the line, or the player
//       jumped with J) comes up in the air later, and its A is the run key coming up.
//     · On the PAD (and touch, and Controller Link) A on the run is the take-off, and the same event then went on down into
//       the flight; an A pressed as RUN is let go is the same jump.
//     · When the LINE launches the run on its own, the player's own "tap jump" is still on its way: it lands a human
//       reaction time after the take-off, in the air, as the first press.
//     So:
//       'space'   — the A InputBus sends for a Space release. It is TAGGED where it is made (`src: 'space'`, InputBus.onKey):
//                   no guess from the R stream, which an idle pad, the touch RUN hold and Controller Link's CHARGE all write
//                   to as well. Once a slam would count (the mode says so: the SLAM read is up / inside the grace), letting
//                   go of Space IS a slam press, as it was before this hotfix; before that it is dropped.
//       'takeoff' — an A that took off (the same input that launched), or one inside TAKEOFF_ECHO_MS of the launch.
//       'late'    — after an AUTOMATIC launch (the line, the watchdog, a runway beat), the first A inside LATE_JUMP_MS.
//     No real slam is anywhere near these: the window opens at flight clock ~1.1 s.
//
//   SlamLatch — DunkMode's slam rule (HOOPS-DEPTH phase 10, DUNK-BODY-MID), lifted out of the mode unchanged so it can be
//     driven without Babylon: the FIRST A of the flight is the slam. One inside the window slams on the spot; one
//     before it is held and fires when the window opens if it is still inside the buffer's reach, and is refused TOO
//     EARLY if not; every A after the first is ignored. (The duel's rule is FirstPress in core/timingPress.)
//
// No clock of its own: the caller passes the times it already keeps (performance.now() ms; the flight clock in s).
import type { FelInput } from './InputBus';
import { WAKE_ECHO_MS } from './StartWake';

/** An A this soon after the launch (ms) is the take-off's own press: StartWake's WAKE_ECHO_MS, one physical input. */
export const TAKEOFF_ECHO_MS = WAKE_ECHO_MS;
/** HOTFIX (2026-09-24): after the line launched the run by itself, the first A this soon (ms) is the player's jump press
 *  arriving late — a visual reaction to the take-off is ~200–250 ms — not the slam. The slam window opens ~1.1 s in. */
export const LATE_JUMP_MS = 250;

/** Why an A is not a slam: the press that took off, the jump pressed late after the line took off, or the Space coming up. */
export type TakeoffEchoKind = 'takeoff' | 'late' | 'space';
/** What launched the flight: the player's own press (RUN let go, A on the run) or the mode (the line, the watchdog, a beat). */
export type LaunchCause = 'press' | 'auto';

export class TakeoffEcho {
  private launchedAt = -Infinity;
  /** The input being read launched the flight (a pad's A on the run is ONE event: the take-off, then the flight's first A).
   *  A flag, not a time: a first launch that hitches (clips loading) must not turn its own A into the slam. */
  private byThisInput = false;
  /** An automatic launch still owes the player the jump press he was about to make. */
  private lateOwed = false;

  /** A new input is being read. Call first in onInput, before anything can launch. */
  see(): void { this.byThisInput = false; }

  /** The flight started (launchDunk, whichever path launched it). Stamp it when the launch's own work is DONE, so a slow
   *  launch does not age the echo of an A that arrived in the same frame. */
  launched(now: number, cause: LaunchCause): void {
    this.launchedAt = now;
    this.byThisInput = true;
    this.lateOwed = cause === 'auto';
  }

  /**
   * For an A press, read once, after see() and after any launch it caused: why it is not a slam, or null when it is one.
   * `slamLive`: a slam press would count right now (DunkMode: the SLAM read is up — the buffer's reach through the window's
   * close; the duel: from the grace before the window). Only the Space's A reads it.
   */
  of(e: FelInput, now: number, slamLive = false): TakeoffEchoKind | null {
    if (e.t !== 'button' || e.btn !== 'A' || !e.pressed) return null;
    if (e.src === 'space') return slamLive ? null : 'space';
    const since = now - this.launchedAt;
    if (this.byThisInput || since < TAKEOFF_ECHO_MS) { this.lateOwed = false; return 'takeoff'; }
    if (this.lateOwed && since < LATE_JUMP_MS) { this.lateOwed = false; return 'late'; }
    return null;
  }
}

/** What a slam press does: slams now (inside the window), waits for the window, or is not the attempt's press. */
export type SlamPressResult = 'slam' | 'held' | 'spent';

export class SlamLatch {
  private at: number | null = null;     // the attempt's press, on the flight clock
  private held: number | null = null;   // …still waiting for the window

  /** An A in the flight at flight-clock `at`, with the window open or not. Only the first press of the attempt is taken. */
  press(at: number, windowOpen: boolean): SlamPressResult {
    if (this.at !== null) return 'spent';
    this.at = at;
    if (windowOpen) return 'slam';
    this.held = at;
    return 'held';
  }

  /** The window opened at `openAt`, and holds a press up to `holdSec` before it. The held press slams from WHEN IT WAS
   *  PRESSED, or is too early by `tooEarlySec` and let go; null when nothing waits. The hold is measured from the
   *  window's edge, not from the frame that crossed it. */
  open(openAt: number, holdSec: number): { slamAt: number } | { tooEarlySec: number } | null {
    const h = this.held;
    this.held = null;
    if (h === null) return null;
    return openAt - h <= holdSec + 1e-6 ? { slamAt: h } : { tooEarlySec: openAt - h };
  }

  /** The attempt's press has been made (early or not). */
  get committed(): boolean { return this.at !== null; }
  /** The flight-clock second of a press waiting for the window (null when none). */
  get waiting(): number | null { return this.held; }
  /** A new attempt. */
  clear(): void { this.at = null; this.held = null; }
}
