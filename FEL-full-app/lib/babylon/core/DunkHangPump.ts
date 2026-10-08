// DunkHangPump — THE HANG PUMP (dunk-next phase 8, 2026-10-06).
//
// Owner, 2026-10-06: "a hang pump in the air (a timed press that extends hang a little and adds style, with a clear cue; tuned so it
// can't break the slam window)".
//
// The pump is the dunker bringing the ball down and back up at the top of the jump — the double-pump of every contest reel. It is
// RUN pressed again in the air (the pad's RT, the keyboard's Space, the phone's RUN): the button that took him up keeps him up.
//
//   THE CUE    — as the flight reaches the hang the HUD says PUMP; the HANG beat's own tick (DunkBeats) is the beat to hit.
//   THE PRESS  — inside PUMP_REACH of the HANG beat, once a flight. ON the beat (the beat bar's tolerance) it is a CLEAN pump; inside
//                the reach but off the beat it still pumps, LOOSE. Outside the reach it is refused and says when.
//   WHAT IT DOES — the flight clock slows (the same gameplay slow-mo the hang already uses at the rise: JuiceKit.slowMo with
//                `gameplay`, which reduced motion keeps whole), so the hang is longer in real time; and the judges see it: a little
//                style, more for a clean one.
//
// WHY IT CANNOT BREAK THE SLAM WINDOW. Everything in the flight — the arc, the carry, the beats, the slam window, the air budget —
// is on the flight clock (clip seconds), and a slow-mo moves no clip second: the window opens and closes on the same clip seconds
// with or without a pump. What a slow-mo DOES change is how long a stretch lasts in real time, so a pump that overlapped the SLAM
// read would make the slam easier. So the pump's slow is CUT to end PUMP_CLEAR_SEC before the flight's own slam read opens (the
// mode passes that clip second: the window's edge less the buffer's reach, TV and first-jump widening included), and a pump with no
// room left before it is refused. The window itself is never touched; nor is any trick's window tax.
//
// Pure: no Babylon, no clock — the mode passes clip seconds and reads grades.

import { CUE_BEAT_T } from './DunkSystem';
import { BEAT_TOL_SEC } from './DunkBeats';

/** The beat a pump is timed to: the bar's HANG (DunkBeats / DunkSystem.CUE_BEAT_T). */
export const PUMP_BEAT_T = CUE_BEAT_T.hang;
/** TUNED (dunk-next phase 8): how far either side of the HANG beat (clip s) a press still pumps. */
export const PUMP_REACH_SEC = 0.12;
/** TUNED: the pump's slow — the flight clock at PUMP_SLOW for PUMP_MS of real time: 0.1 clip s stretched to 0.25 s, i.e. the hang
 *  is 150 ms longer. The rise's own hang slow-mo is 0.4 for 400 ms; this is a smaller one on the same clock. */
export const PUMP_SLOW = 0.4, PUMP_MS = 250;
/** TUNED: a pump shorter than this is not worth the frames — no room left before the slam read: refused instead. */
export const PUMP_MIN_MS = 80;
/** TUNED: how far before the slam read opens (clip s) the pump's slow has to be over. */
export const PUMP_CLEAR_SEC = 0.03;
/** TUNED: the style a pump pays (0–10 scale, DunkCard.flowStyle): ON the HANG beat, and inside the reach but off it. */
export const PUMP_STYLE_CLEAN = 0.5, PUMP_STYLE_LOOSE = 0.2;

/** How much longer the hang is in real time for a full pump (ms). */
export const PUMP_EXTRA_MS = Math.round(PUMP_MS * (1 - PUMP_SLOW));

export type PumpGrade = 'clean' | 'loose';
export type PumpRefusal = 'tooEarly' | 'tooLate' | 'noRoom' | 'spent';
export type PumpVerdict =
  | { ok: true; grade: PumpGrade; offsetSec: number; slow: number; ms: number; style: number }
  | { ok: false; why: PumpRefusal };

/** Is clip second `t` inside the pump's reach (the cue is up)? */
export function pumpOpen(t: number): boolean {
  return Number.isFinite(t) && Math.abs(t - PUMP_BEAT_T) <= PUMP_REACH_SEC + 1e-9;
}

/** The longest slow (ms of real time) a pump pressed at clip `t` may run so the flight clock is past it PUMP_CLEAR_SEC before the
 *  slam read opens at clip `slamReadAt`. 0 when there is no room. */
export function pumpMsAt(t: number, slamReadAt: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(slamReadAt)) return 0;
  const room = slamReadAt - PUMP_CLEAR_SEC - t;   // clip seconds the slow may consume
  if (room <= 0) return 0;
  return Math.min(PUMP_MS, Math.floor((room / PUMP_SLOW) * 1000));
}

/**
 * A RUN press in the air at clip second `t`. `tol` is the beat bar's tolerance (BEAT_TOL_SEC × the TV factor, as the mode passes it
 * to the tricks); `used` is a pump already thrown this flight; `slamReadAt` is the clip second the slam read opens this flight.
 */
export function gradePump(t: number, o: { tol?: number; used: boolean; slamReadAt: number }): PumpVerdict {
  if (o.used) return { ok: false, why: 'spent' };
  if (!Number.isFinite(t) || t < PUMP_BEAT_T - PUMP_REACH_SEC) return { ok: false, why: 'tooEarly' };
  if (t > PUMP_BEAT_T + PUMP_REACH_SEC) return { ok: false, why: 'tooLate' };
  const ms = pumpMsAt(t, o.slamReadAt);
  if (ms < PUMP_MIN_MS) return { ok: false, why: 'noRoom' };
  const tol = Number.isFinite(o.tol) && (o.tol as number) > 0 ? (o.tol as number) : BEAT_TOL_SEC;
  const offsetSec = t - PUMP_BEAT_T;
  const grade: PumpGrade = Math.abs(offsetSec) <= tol + 1e-9 ? 'clean' : 'loose';
  return { ok: true, grade, offsetSec, slow: PUMP_SLOW, ms, style: grade === 'clean' ? PUMP_STYLE_CLEAN : PUMP_STYLE_LOOSE };
}

/** The clip second the flight clock is at when a pump of `ms` pressed at `t` is over. */
export function pumpEndsAt(t: number, ms: number): number {
  return t + (Math.max(0, ms) / 1000) * PUMP_SLOW;
}

/** What the HUD says for a refused pump. */
export function pumpRefusalLine(why: PumpRefusal): string {
  switch (why) {
    case 'tooEarly': return 'PUMP ON THE HANG — WAIT FOR THE TOP';
    case 'tooLate': return 'TOO LATE TO PUMP — SLAM IT';
    case 'noRoom': return 'NO ROOM TO PUMP — THE SLAM IS UP';
    case 'spent': return 'ONE PUMP A FLIGHT';
  }
}
