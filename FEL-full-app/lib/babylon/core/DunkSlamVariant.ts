// DunkSlamVariant — the finish you call WITH the slam (dunk flagship Phase 7, 2026-11-03).
//
// The plan's Phase 7 asks for the finishes the bodies already carry and the contest never used: the REVERSE (the flush
// behind the head, the back to the iron) and the TWO-HAND POWER. All sixteen direction + button slots in the air are
// taken by the named tricks, and A inside the slam window is the slam itself, so there is no button left for them.
//
// THE INPUT: the left STICK held at the A press, read only inside the slam window and only on that press —
//   stick BACK (down, away from the rim) + A  → REVERSE
//   stick UP   (toward the rim)            + A → TWO-HAND POWER
// The named tricks are d-pad + button (the recognizer never sees the stick; InputBus emits d-pad events only from a
// d-pad, the arrows or the touch pad), and they are read only while the window is SHUT (DunkMode's airButton), so no
// trick input can become a variant and no variant input can become a trick. A press the buffer was holding (pressed
// before the window opened) is not read: the direction counts only on a live press inside the window.
//
// OFF BY DEFAULT: `dunk.slamVariants` (lib/feel-panel/knobs.ts). Like every knob it never applies in ranked, staked or
// paid play (lib/feel-panel's session gate).

import { isStakedRun } from './DunkField';

/** The finishes a slam can be called as. */
export type SlamVariant = 'reverse' | 'power';

/** The knob's default: ON (1) since the owner's call of 2026-11-10 ("turn all 4 on"); 0 = a slam is the flush the flight carries,
 *  exactly as before. A staked, ranked or challenge run reads 0 whatever the default (DunkMode: the card there is the integrity cap's). */
export const SLAM_VARIANTS_ON = 1;
/** DUNK SWITCH-ON (owner 2026-11-10): the switches that change PLAY (the slam variants, the over-the-ring finish) are off in a
 *  staked, ranked or challenge run whatever their default: an Arena duel, an async or link challenge, the Signature ladder
 *  (DunkField.isStakedRun) and a `ranked` session (reserved: playFrame's felRanked). Pure. */
export function playSwitchBlocked(search: string): boolean {
  if (isStakedRun(search)) return true;
  try { return new URLSearchParams(search).has('ranked'); } catch { return true; }
}
/** DUNK SWITCH-ON: the TWO-HAND POWER's own sub-switch (1 on, 0 = the stick up calls nothing, the REVERSE unchanged). */
export const SLAM_POWER_ON = 1;

/** How far the stick must be held (0..1) for the direction to count — a resting thumb does not call a reverse. */
export const SLAM_VARIANT_STICK_MIN = 0.5;

export interface SlamVariantSpec {
  /** The finish's name: the banner, the card's AIR line, the judges' read. */
  label: string;
  /** The finish clip (both already registered: anim/authored/dunkFinishes.ts). */
  clip: string;
  /** Added to the trick difficulty on the card. NEW numbers (no tuned value changed): the reverse is the harder of the two
   *  (a turn away from the iron before the flush), the power a two-hand hammer; both below the cheapest named air trick (2.0). */
  difficulty: number;
}

export const SLAM_VARIANTS: Record<SlamVariant, SlamVariantSpec> = {
  reverse: { label: 'REVERSE', clip: 'dunk_finish_reverse', difficulty: 0.6 },
  power: { label: 'TWO-HAND POWER', clip: 'dunk_finish_two_hand', difficulty: 0.3 },
};

/** The rate (rad/s) the reverse turns the body away from the iron after the press: half a turn in ~0.2 s, about the 360's own
 *  peak step (17°/frame at 60 fps). NEW. */
export const REVERSE_TURN_RATE = 15.7;
/** PHASE 7b (coordinator's decision): a reverse is turned ON THE WAY UP — at the iron it was 2 of 3 (the turned arm reached the
 *  ring from too low). From this clip second (the hang beat, CUE_BEAT_T.hang) until the slam window opens, the stick held back
 *  for REVERSE_COMMIT_SEC with nothing called starts the turn; the press still decides the finish. NEW numbers. */
export const REVERSE_TURN_FROM = 0.7;
export const REVERSE_COMMIT_SEC = 0.1;
/** The REVERSE's jam rides this much higher (m) than a flush (JAM_Y 1.15): with the back to the iron the ball arm reaches up and
 *  BACK over the head, and it topped out 0.10–0.25 m under the ring (measured: 2 of 3 reverses short of the iron, the ball at
 *  2.80–2.95 m against a 3.05 m ring; the one that met it started the jam with the ball already over the ring). NEW. */
export const REVERSE_JAM_LIFT = 0.2;
/** The reverse's flush meets the iron only once the back is to it: the contact waits until the body is this far round (rad). */
export const REVERSE_CONTACT_FROM = Math.PI * 0.8;

/**
 * Which finish the stick calls. `on` is the knob; `x`, `y` the left stick (up is −y on every source). The direction must be
 * held past SLAM_VARIANT_STICK_MIN and be more vertical than sideways — a diagonal is not a call. Pure.
 */
export function slamVariantOf(on: boolean, x: number, y: number, powerOn = true): SlamVariant | null {
  if (!on) return null;
  if (!(Math.abs(y) >= SLAM_VARIANT_STICK_MIN) || Math.abs(y) <= Math.abs(x)) return null;
  return y > 0 ? 'reverse' : powerOn ? 'power' : null;
}
