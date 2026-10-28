// handsUp — "No pain? Put both hands up." The after-test pain check answered from across the room (SCREEN-EASY,
// 2026-10-28).
//
// SCREEN A made the pain check after each test a real answer: asked by voice, never skipped, never auto-answered "no".
// It was a TAP, and the athlete stands 2–3 m from the phone: four times a screen they walked to it, tapped, and walked
// back into the shot (docs/SCREEN-EASY-AUDIT.md §2, ~7 s each). Both hands up over the head is an answer given on
// purpose, from where they stand, like the dunk session's "hands up = make" (lib/session-setup/gesture.ts). It is still
// an answer, never a timeout: nothing moves on until the hands go up or a button is tapped, and "yes" stays a tap (pain
// stops the screen; "Something hurts: stop" is on screen the whole time).
//
// ARMED FIRST: hands already up when the question shows (the last overhead squat) do not count; they have to come down
// and go up again. HELD: both hands up for HANDS_UP_HOLD_MS, so a hand passing the face is not a "no".
//
// Pure.
import { LEFT_SHOULDER, LEFT_WRIST, NOSE, RIGHT_SHOULDER, RIGHT_WRIST, type PoseFrame } from '@/lib/pose/landmarks';

/** (new, TUNED) How long both hands stay up to count as "no pain". */
export const HANDS_UP_HOLD_MS = 800;
/** A wrist read below this visibility is not read at all (neither up nor down). */
const SEEN = 0.5;

/** Up: every wrist the camera sees well is above the nose, and it sees at least one (a side-on body hides the far one). */
export function handsAreUp(f: PoseFrame): boolean {
  if (!f.present || f.image.length < 33) return false;
  const nose = f.image[NOSE];
  if ((nose.v ?? 0) < SEEN) return false;
  const seen = [f.image[LEFT_WRIST], f.image[RIGHT_WRIST]].filter((w) => (w.v ?? 0) >= SEEN);
  return seen.length > 0 && seen.every((w) => w.y < nose.y);
}

/** Down: a body in the shot whose seen wrists are below the shoulder line (the arming position). */
export function handsAreDown(f: PoseFrame): boolean {
  if (!f.present || f.image.length < 33) return false;
  const sh = (f.image[LEFT_SHOULDER].y + f.image[RIGHT_SHOULDER].y) / 2;
  const seen = [f.image[LEFT_WRIST], f.image[RIGHT_WRIST]].filter((w) => (w.v ?? 0) >= SEEN);
  return seen.length > 0 && seen.every((w) => w.y > sh);
}

/** One prompt's hands-up answer: reset() when it shows, feed() each frame; true once, on the frame the hold completes. */
export class HandsUpAnswer {
  private armed = false;
  private since: number | null = null;
  private fired = false;
  reset(): void { this.armed = false; this.since = null; this.fired = false; }
  /** 0..1 through the hold (for the screen's ring); 0 until armed and up. */
  progress(t: number): number { return this.since === null || !this.armed ? 0 : Math.min(1, (t - this.since) / HANDS_UP_HOLD_MS); }
  feed(f: PoseFrame): boolean {
    if (this.fired) return false;
    // a frame the pose model missed says nothing either way: it neither arms, nor breaks the hold (VERTICAL-EASY's rule)
    if (!f.present || f.image.length < 33) return false;
    if (!this.armed) { if (handsAreDown(f)) this.armed = true; return false; }
    if (!handsAreUp(f)) { this.since = null; return false; }
    this.since ??= f.t;
    if (f.t - this.since >= HANDS_UP_HOLD_MS) { this.fired = true; return true; }
    return false;
  }
}
