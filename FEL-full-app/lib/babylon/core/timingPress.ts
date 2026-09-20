// timingPress — a press that arrives before its window, honoured without being flattered.
//
// THE PATTERN THIS CLOSES, found across the modes in one sweep: a timing input gated on `if (pressed && windowOpen)`
// throws away every press made before the window. The dunk duel's slam, the dunk mode's trick cue and the combat
// strike queue were all shapes of the same thing — a press with nowhere to wait — and in every case the player's
// read was RIGHT and slightly early, which is the most frustrating possible input to eat.
//
// The fix is not simply to buffer it. Buffering a timing press naively hands the player a perfect hit for a press
// they made 200 ms early, which turns an anticipation into a strategy and makes the window meaningless. So:
//
//   · a press inside GRACE before the window is REMEMBERED, and
//   · it is scored from WHEN IT WAS PRESSED, not when it was consumed.
//
// An early press lands, and it lands badly — which is exactly what happens to a player who jumps a beat in real
// life. Late presses are not buffered at all: after the window the moment is gone, and pretending otherwise would
// let someone slam the rim after the ball had already dropped.
//
// Pure: no Babylon, no clock of its own — the caller passes the clip time it already tracks.

export interface TimingWindow {
  /** The perfect moment, on the caller's own clock. */
  centre: number;
  /** Full width; the window is centre ± half of this. */
  width: number;
}

/** How far before the window a press is still honoured. A beat, not a strategy. */
export const PRESS_GRACE = 0.14;

export interface PressVerdict {
  hit: boolean;
  /** 1 at the centre, 0 at the edge — and 0 for anything honoured from the grace. */
  accuracy: number;
  /** Why, for the banner: on the beat, early but counted, or nothing at all. */
  kind: 'clean' | 'early' | 'miss';
}

/** Score a press made at `pressedAt` against a window. `grace` lets a caller tighten it per mode. */
export function judgePress(pressedAt: number, w: TimingWindow, grace = PRESS_GRACE): PressVerdict {
  const half = w.width / 2;
  const from = w.centre - half, to = w.centre + half;
  if (pressedAt > to) return { hit: false, accuracy: 0, kind: 'miss' };          // after the moment there is no moment
  if (pressedAt >= from) {
    const accuracy = Math.max(0, 1 - Math.abs(pressedAt - w.centre) / half);
    return { hit: true, accuracy, kind: 'clean' };
  }
  if (pressedAt >= from - grace) return { hit: true, accuracy: 0, kind: 'early' };
  return { hit: false, accuracy: 0, kind: 'miss' };                              // too early to be a read
}

/**
 * Holds one early press until its window opens.
 *
 * Deliberately single-slot: mashing does not improve your odds, because the FIRST press is the one that counts and
 * later ones do not replace it. A player who taps three times gets the verdict their first tap earned.
 */
export class EarlyPress {
  private at: number | null = null;
  /** Remember a press made before the window. Ignored if one is already waiting. */
  press(at: number): void { if (this.at === null) this.at = at; }
  /** The waiting press, if any, consumed. */
  take(): number | null { const a = this.at; this.at = null; return a; }
  get waiting(): boolean { return this.at !== null; }
  clear(): void { this.at = null; }
}
