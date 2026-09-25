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

/**
 * One attempt, one press: the FIRST press decides (HOTFIX 2026-09-24, BASELINE.md:244 — DunkMode's SlamLatch in core/slamPress, for a
 * mode that judges with judgePress).
 *
 * EarlyPress keeps a masher out of the early BUFFER, but a mode that also judges each press as it lands still gave the next
 * press a fresh verdict: a too-early press missed, and a later one thrown at the window hit. The owner's two-foot duel dunk
 * "hit" on its third A. Now the first press is the verdict (clean, early but counted, or a miss) and every press after it is
 * spent. A press before the window and outside the grace is still held, and judged from when it was pressed once the window
 * opens: that is when the mode can say TOO EARLY.
 */
export class FirstPress {
  private readonly early = new EarlyPress();
  private at: number | null = null;
  /** The attempt's press: its verdict when it can be judged now, 'held' for one before the window, 'spent' for any press after the first. */
  press(at: number, w: TimingWindow, grace = PRESS_GRACE): PressVerdict | 'held' | 'spent' {
    if (this.at !== null) return 'spent';
    this.at = at;
    const v = judgePress(at, w, grace);
    if (v.hit || at > w.centre) return v;   // inside the window, in the grace, or after it
    this.early.press(at);
    return 'held';
  }
  /** The window has opened: the held press, judged from when it was pressed (null when none is waiting). */
  open(w: TimingWindow, grace = PRESS_GRACE): PressVerdict | null {
    const at = this.early.take();
    return at === null ? null : judgePress(at, w, grace);
  }
  /** When the attempt's press was made (null before it). */
  get pressedAt(): number | null { return this.at; }
  get spent(): boolean { return this.at !== null; }
  /** A new attempt. */
  clear(): void { this.at = null; this.early.clear(); }
}
